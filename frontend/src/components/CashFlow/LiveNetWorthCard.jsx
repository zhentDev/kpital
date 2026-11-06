import React, { useState, useMemo } from "react";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import { useTheme } from "../../context/ThemeContext";
import "./CashFlow.css";

export default function LiveNetWorthCard({
  realInvestmentMetrics,
  fixedAccounts = [],
  fixedCdts = [],
  payrollAccount,
  creditCards = [],
  creditPurchases = [],
  debts = [],
  expensesLog = [],
  activePeriod,
  currency = "COP",
  fxRate = 4150,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(currency);

  const formatMoney = (val, cur = selectedCurrency) => formatCashFlowMoney(val, cur, fxRate);

  // ── 1. CÁLCULO DE ACTIVOS (ASSETS) ──────────────────────────────────
  const assetsBreakdown = useMemo(() => {
    // 1.1 Inversiones en Renta Variable / Acciones / ETFs (Valor de Mercado)
    const equitiesMarketValCOP = Number(realInvestmentMetrics?.totalMarketValueCOP || 0);
    const equitiesInvestedCOP = Number(realInvestmentMetrics?.totalInvestedCOP || 0);
    const equitiesPnlCOP = Number(realInvestmentMetrics?.totalUnrealizedPnlCOP || 0);
    const equitiesPnlPct = Number(realInvestmentMetrics?.totalUnrealizedPnlPct || 0);

    // 1.2 Cuentas Bancarias & Liquidez (Ahorros, Nómina, Cajitas)
    let bankAccountsCOP = 0;
    const accountDetails = [];

    (fixedAccounts || []).forEach((acc) => {
      const bal = Number(acc.balance || 0);
      const mult = acc.currency === "USD" ? fxRate : 1;
      const balCOP = bal * mult;
      bankAccountsCOP += balCOP;
      accountDetails.push({
        id: acc.id,
        name: acc.name,
        balanceCOP: balCOP,
        rawBalance: bal,
        currency: acc.currency || "COP",
        category: acc.category || "Cuenta de Ahorro",
      });
    });

    // Si la cuenta nómina tiene saldo registrado y no está ya en fixedAccounts, agregarla
    if (payrollAccount && !fixedAccounts.some((a) => a.id === payrollAccount.id || a.name === payrollAccount.name)) {
      const payBal = Number(payrollAccount.balance || 0);
      if (payBal > 0) {
        bankAccountsCOP += payBal;
        accountDetails.push({
          id: payrollAccount.id || "payroll_account",
          name: payrollAccount.name || "Cuenta Nómina Principal",
          balanceCOP: payBal,
          rawBalance: payBal,
          currency: "COP",
          category: "Nómina",
        });
      }
    }

    // 1.3 Renta Fija / CDTs
    let cdtsCOP = 0;
    (fixedCdts || []).forEach((cdt) => {
      const amt = Number(cdt.amount || cdt.principal || 0);
      const mult = cdt.currency === "USD" ? fxRate : 1;
      cdtsCOP += amt * mult;
    });

    // 1.4 Préstamos por Cobrar (Dinero a favor)
    let receivablesCOP = 0;
    const receivableDetails = [];

    // De la lista de deudas tipo 'receivable'
    (debts || [])
      .filter((d) => d.debtType === "receivable" && d.status !== "paid")
      .forEach((d) => {
        const rem = Number(d.remainingAmount !== undefined ? d.remainingAmount : d.totalAmount || 0);
        if (rem > 0) {
          receivablesCOP += rem;
          receivableDetails.push({
            id: d.id,
            name: d.debtorName || d.title || "Préstamo por cobrar",
            amountCOP: rem,
          });
        }
      });

    // De los préstamos registrados en el log de gastos
    (expensesLog || [])
      .filter((tx) => tx.isLoan && tx.loanDetails?.status !== "settled")
      .forEach((tx) => {
        const total = Number(tx.loanDetails?.totalAmount ?? Math.abs(tx.amount) ?? 0);
        const settled = Number(tx.loanDetails?.settledAmount ?? 0);
        const remaining = Math.max(0, total - settled);
        // Evitar duplicar si ya fue sincronizado como deuda
        if (remaining > 0 && !receivableDetails.some((r) => r.id === tx.id)) {
          receivablesCOP += remaining;
          receivableDetails.push({
            id: tx.id,
            name: `Préstamo a: ${tx.loanDetails?.borrowerName || tx.concept || "Tercero"}`,
            amountCOP: remaining,
          });
        }
      });

    const totalAssetsCOP = equitiesMarketValCOP + bankAccountsCOP + cdtsCOP + receivablesCOP;
    const totalAssetsUSD = fxRate > 0 ? totalAssetsCOP / fxRate : 0;

    return {
      equitiesMarketValCOP,
      equitiesInvestedCOP,
      equitiesPnlCOP,
      equitiesPnlPct,
      bankAccountsCOP,
      accountDetails,
      cdtsCOP,
      receivablesCOP,
      receivableDetails,
      totalAssetsCOP,
      totalAssetsUSD,
    };
  }, [realInvestmentMetrics, fixedAccounts, fixedCdts, payrollAccount, debts, expensesLog, fxRate]);

  // ── 2. CÁLCULO DE PASIVOS (LIABILITIES) ──────────────────────────────
  const liabilitiesBreakdown = useMemo(() => {
    // 2.1 Tarjetas de Crédito (Cupo Utilizado Consolidado)
    let creditCardsDebtCOP = 0;
    const cardDetails = [];

    (creditCards || []).forEach((card) => {
      const cardPurchases = (creditPurchases || []).filter((p) => p.cardId === card.id);
      let purchasesUsedLimit = 0;

      cardPurchases.forEach((p) => {
        const tot = Number(p.totalAmount) || Number(p.amount) || Number(p.monthlyInstallment) || 0;
        purchasesUsedLimit += tot;
      });

      const usedLimit = purchasesUsedLimit > 0 ? purchasesUsedLimit : Number(card.usedLimit || 0);
      if (usedLimit > 0) {
        creditCardsDebtCOP += usedLimit;
        cardDetails.push({
          id: card.id,
          name: card.name,
          usedLimitCOP: usedLimit,
          totalLimitCOP: Number(card.totalLimit || 0),
          color: card.color || "#e11d48",
        });
      }
    });

    // 2.2 Deudas / Pasivos Personales (Préstamos tomados donde yo debo)
    let payableDebtsCOP = 0;
    const debtDetails = [];

    (debts || [])
      .filter((d) => d.debtType !== "receivable" && d.status !== "paid")
      .forEach((d) => {
        const rem = Number(d.remainingAmount !== undefined ? d.remainingAmount : d.totalAmount || 0);
        if (rem > 0) {
          payableDebtsCOP += rem;
          debtDetails.push({
            id: d.id,
            name: d.creditorName || d.title || "Obligación financiera",
            amountCOP: rem,
          });
        }
      });

    const totalLiabilitiesCOP = creditCardsDebtCOP + payableDebtsCOP;
    const totalLiabilitiesUSD = fxRate > 0 ? totalLiabilitiesCOP / fxRate : 0;

    return {
      creditCardsDebtCOP,
      cardDetails,
      payableDebtsCOP,
      debtDetails,
      totalLiabilitiesCOP,
      totalLiabilitiesUSD,
    };
  }, [creditCards, creditPurchases, debts, fxRate]);

  // ── 3. PATRIMONIO NETO & RATIOS CUANTITATIVOS ─────────────────────────
  const netWorthCOP = assetsBreakdown.totalAssetsCOP - liabilitiesBreakdown.totalLiabilitiesCOP;
  const netWorthUSD = assetsBreakdown.totalAssetsUSD - liabilitiesBreakdown.totalLiabilitiesUSD;

  // Ratio Deuda / Activos (Debt-to-Assets)
  const debtToAssetsRatio =
    assetsBreakdown.totalAssetsCOP > 0
      ? (liabilitiesBreakdown.totalLiabilitiesCOP / assetsBreakdown.totalAssetsCOP) * 100
      : 0;

  // Liquidez Neta Inmediata: (Cuentas bancarias + Nómina) - Deuda de Tarjetas
  const quickNetLiquidityCOP = assetsBreakdown.bankAccountsCOP - liabilitiesBreakdown.creditCardsDebtCOP;

  // Asset Allocation Porcentual
  const totalAssets = assetsBreakdown.totalAssetsCOP;
  const allocation = {
    equities: totalAssets > 0 ? (assetsBreakdown.equitiesMarketValCOP / totalAssets) * 100 : 0,
    liquidity: totalAssets > 0 ? (assetsBreakdown.bankAccountsCOP / totalAssets) * 100 : 0,
    cdts: totalAssets > 0 ? (assetsBreakdown.cdtsCOP / totalAssets) * 100 : 0,
    receivables: totalAssets > 0 ? (assetsBreakdown.receivablesCOP / totalAssets) * 100 : 0,
  };

  // Badge de Solvencia Financiera
  const getSolvencyBadge = () => {
    if (debtToAssetsRatio <= 10) {
      return { label: "🛡️ Solvencia Impecable (<10%)", color: "#10b981", bg: "rgba(16, 185, 129, 0.12)" };
    }
    if (debtToAssetsRatio <= 25) {
      return { label: "⚡ Apalancamiento Saludable", color: "#00e5ff", bg: "rgba(0, 229, 255, 0.12)" };
    }
    if (debtToAssetsRatio <= 40) {
      return { label: "⚠️ Apalancamiento Moderado", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)" };
    }
    return { label: "🚨 Alta Exposición a Deuda (>40%)", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)" };
  };

  const solvency = getSolvencyBadge();

  return (
    <div
      className="card fade-up"
      style={{
        background: isLight ? "#ffffff" : "linear-gradient(135deg, rgba(13, 18, 38, 0.85) 0%, rgba(10, 25, 47, 0.8) 100%)",
        border: isLight ? "1px solid rgba(2, 132, 199, 0.28)" : "1px solid rgba(0, 229, 255, 0.28)",
        borderRadius: "18px",
        padding: "20px 22px",
        marginBottom: "18px",
        boxShadow: isLight ? "0 6px 20px rgba(0, 0, 0, 0.05)" : "0 10px 30px rgba(0, 0, 0, 0.35)",
        backdropFilter: "blur(14px)",
      }}
    >
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          paddingBottom: "14px",
          borderBottom: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "10px",
              background: isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(0, 229, 255, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.25rem",
            }}
          >
            🏛️
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: isLight ? "#0f172a" : "#f8fafc",
                  letterSpacing: "-0.3px",
                }}
              >
                Balance Patrimonial Integral
              </h3>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: solvency.bg,
                  color: solvency.color,
                  border: `1px solid ${solvency.color}40`,
                }}
              >
                {solvency.label}
              </span>
            </div>
            <p
              style={{
                margin: "2px 0 0 0",
                fontSize: "0.76rem",
                color: isLight ? "#64748b" : "#94a3b8",
              }}
            >
              Consolidación viva de Activos (Acciones, Liquidez y Préstamos) frente a Pasivos (Tarjetas y Deudas).
            </p>
          </div>
        </div>

        {/* Currency Switcher & Expand Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "inline-flex",
              background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.05)",
              borderRadius: "8px",
              padding: "2px",
              border: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedCurrency("COP")}
              style={{
                border: "none",
                background: selectedCurrency === "COP" ? (isLight ? "#0284c7" : "var(--accent-primary)") : "transparent",
                color: selectedCurrency === "COP" ? (isLight ? "#ffffff" : "#0d1117") : "var(--text-secondary)",
                fontWeight: selectedCurrency === "COP" ? 700 : 500,
                fontSize: "0.72rem",
                padding: "3px 8px",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              🇨🇴 COP
            </button>
            <button
              type="button"
              onClick={() => setSelectedCurrency("USD")}
              style={{
                border: "none",
                background: selectedCurrency === "USD" ? (isLight ? "#0284c7" : "var(--accent-primary)") : "transparent",
                color: selectedCurrency === "USD" ? (isLight ? "#ffffff" : "#0d1117") : "var(--text-secondary)",
                fontWeight: selectedCurrency === "USD" ? 700 : 500,
                fontSize: "0.72rem",
                padding: "3px 8px",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              🇺🇸 USD
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "0.74rem",
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: "8px",
              border: isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.12)",
              background: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.05)",
              color: isLight ? "#0f172a" : "#f8fafc",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span>{isExpanded ? "Contraer" : "Ver Desglose"}</span>
            <span style={{ fontSize: "0.8rem", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              ▼
            </span>
          </button>
        </div>
      </div>

      {/* ── Net Worth Main Hero Metric ──────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          margin: "18px 0 14px 0",
        }}
      >
        {/* Card 1: Patrimonio Neto (Net Worth) */}
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: isLight ? "rgba(16, 185, 129, 0.05)" : "rgba(16, 185, 129, 0.06)",
            border: isLight ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(16, 185, 129, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "0.74rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: isLight ? "#059669" : "#34d399",
              }}
            >
              💰 Patrimonio Neto (Net Worth)
            </span>
            <span
              style={{
                fontSize: "0.68rem",
                color: "var(--text-muted)",
                fontWeight: 600,
              }}
            >
              Activos − Pasivos
            </span>
          </div>

          <div
            className="mono"
            style={{
              fontSize: "clamp(1.5rem, 2.3vw, 2rem)",
              fontWeight: 800,
              color: netWorthCOP >= 0 ? (isLight ? "#059669" : "#34d399") : "#ef4444",
              margin: "6px 0 2px 0",
            }}
          >
            {formatMoney(netWorthCOP, selectedCurrency)}
          </div>

          <div style={{ fontSize: "0.73rem", color: isLight ? "#475569" : "#94a3b8" }}>
            Equivalente:{" "}
            <strong>
              {selectedCurrency === "COP"
                ? `$${netWorthUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                : `$${Math.round(netWorthCOP).toLocaleString("es-CO")} COP`}
            </strong>
          </div>
        </div>

        {/* Card 2: Activos Totales (Total Assets) */}
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: isLight ? "rgba(2, 132, 199, 0.05)" : "rgba(0, 229, 255, 0.05)",
            border: isLight ? "1px solid rgba(2, 132, 199, 0.25)" : "1px solid rgba(0, 229, 255, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "0.74rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: isLight ? "#0284c7" : "var(--accent-primary)",
              }}
            >
              📈 Activos Totales
            </span>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#10b981" }}>100% Cobertura</span>
          </div>

          <div
            className="mono"
            style={{
              fontSize: "clamp(1.4rem, 2vw, 1.75rem)",
              fontWeight: 800,
              color: isLight ? "#0f172a" : "#f8fafc",
              margin: "6px 0 2px 0",
            }}
          >
            {formatMoney(assetsBreakdown.totalAssetsCOP, selectedCurrency)}
          </div>

          <div style={{ fontSize: "0.73rem", color: isLight ? "#475569" : "#94a3b8" }}>
            Bolsa ({allocation.equities.toFixed(0)}%) · Liquidez ({allocation.liquidity.toFixed(0)}%)
            {allocation.receivables > 0 && ` · Cobros (${allocation.receivables.toFixed(0)}%)`}
          </div>
        </div>

        {/* Card 3: Pasivos Totales & Endeudamiento */}
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "14px",
            background: isLight ? "rgba(225, 29, 72, 0.04)" : "rgba(251, 113, 133, 0.05)",
            border: isLight ? "1px solid rgba(225, 29, 72, 0.25)" : "1px solid rgba(251, 113, 133, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "0.74rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: isLight ? "#e11d48" : "#fb7185",
              }}
            >
              💳 Pasivos Totales (Deuda)
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                color: debtToAssetsRatio > 30 ? "#ef4444" : isLight ? "#d97706" : "#fbbf24",
              }}
            >
              {debtToAssetsRatio.toFixed(1)}% de tus activos
            </span>
          </div>

          <div
            className="mono"
            style={{
              fontSize: "clamp(1.4rem, 2vw, 1.75rem)",
              fontWeight: 800,
              color: liabilitiesBreakdown.totalLiabilitiesCOP > 0 ? (isLight ? "#be123c" : "#fb7185") : "#10b981",
              margin: "6px 0 2px 0",
            }}
          >
            {liabilitiesBreakdown.totalLiabilitiesCOP > 0 ? "-" : ""}
            {formatMoney(liabilitiesBreakdown.totalLiabilitiesCOP, selectedCurrency)}
          </div>

          <div style={{ fontSize: "0.73rem", color: isLight ? "#475569" : "#94a3b8" }}>
            Tarjetas de Crédito: {formatMoney(liabilitiesBreakdown.creditCardsDebtCOP, selectedCurrency)}
            {liabilitiesBreakdown.payableDebtsCOP > 0 &&
              ` · Préstamos: ${formatMoney(liabilitiesBreakdown.payableDebtsCOP, selectedCurrency)}`}
          </div>
        </div>
      </div>

      {/* ── Asset Allocation Bar ────────────────────────────────────── */}
      <div style={{ margin: "14px 0 10px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
            Distribución de Activos (Asset Allocation)
          </span>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            Apalancamiento: <strong>{debtToAssetsRatio.toFixed(1)}%</strong>
          </span>
        </div>

        {/* Multi-segment Progress Bar */}
        <div
          style={{
            height: 9,
            borderRadius: 6,
            background: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)",
            overflow: "hidden",
            display: "flex",
          }}
        >
          {allocation.equities > 0 && (
            <div
              style={{
                width: `${allocation.equities}%`,
                background: "linear-gradient(90deg, #0284c7 0%, #00e5ff 100%)",
                transition: "width 0.3s ease",
              }}
              title={`Inversiones en Bolsa: ${allocation.equities.toFixed(1)}%`}
            />
          )}
          {allocation.liquidity > 0 && (
            <div
              style={{
                width: `${allocation.liquidity}%`,
                background: "linear-gradient(90deg, #10b981 0%, #34d399 100%)",
                transition: "width 0.3s ease",
              }}
              title={`Liquidez Bancaria & Cajitas: ${allocation.liquidity.toFixed(1)}%`}
            />
          )}
          {allocation.cdts > 0 && (
            <div
              style={{
                width: `${allocation.cdts}%`,
                background: "#f59e0b",
                transition: "width 0.3s ease",
              }}
              title={`CDTs: ${allocation.cdts.toFixed(1)}%`}
            />
          )}
          {allocation.receivables > 0 && (
            <div
              style={{
                width: `${allocation.receivables}%`,
                background: "#a855f7",
                transition: "width 0.3s ease",
              }}
              title={`Préstamos por cobrar: ${allocation.receivables.toFixed(1)}%`}
            />
          )}
        </div>

        {/* Legend */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            fontSize: "0.72rem",
            marginTop: 6,
            color: isLight ? "#475569" : "#94a3b8",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e5ff" }} />
            Inversiones ({allocation.equities.toFixed(1)}%)
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
            Cuentas & Nómina ({allocation.liquidity.toFixed(1)}%)
          </span>
          {allocation.cdts > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
              CDTs ({allocation.cdts.toFixed(1)}%)
            </span>
          )}
          {allocation.receivables > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7" }} />
              Préstamos por cobrar ({allocation.receivables.toFixed(1)}%)
            </span>
          )}
          <span style={{ marginLeft: "auto", fontWeight: 600, color: quickNetLiquidityCOP >= 0 ? "#10b981" : "#ef4444" }}>
            Liquidez Neta Libre: {formatMoney(quickNetLiquidityCOP, selectedCurrency)}
          </span>
        </div>
      </div>

      {/* ── Collapsible Detailed Breakdown ──────────────────────────── */}
      {isExpanded && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: isLight ? "1px dashed rgba(0, 0, 0, 0.12)" : "1px dashed rgba(255, 255, 255, 0.12)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {/* Detailed Assets Column */}
          <div
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.02)",
              borderRadius: "12px",
              padding: "14px",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.06)" : "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px 0",
                fontSize: "0.82rem",
                fontWeight: 800,
                color: isLight ? "#0284c7" : "var(--accent-primary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>🟢 Detalle de Activos</span>
              <span>{formatMoney(assetsBreakdown.totalAssetsCOP, selectedCurrency)}</span>
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Equities item */}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                <span>
                  📈 <strong>Portafolio Acciones & ETFs:</strong>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginLeft: 4 }}>
                    ({assetsBreakdown.equitiesPnlPct >= 0 ? "+" : ""}{assetsBreakdown.equitiesPnlPct.toFixed(1)}% P&L)
                  </span>
                </span>
                <span className="mono" style={{ fontWeight: 700 }}>
                  {formatMoney(assetsBreakdown.equitiesMarketValCOP, selectedCurrency)}
                </span>
              </div>

              {/* Bank accounts */}
              {assetsBreakdown.accountDetails.map((acc) => (
                <div key={acc.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>
                    🏦 {acc.name}:
                  </span>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {formatMoney(acc.balanceCOP, selectedCurrency)}
                  </span>
                </div>
              ))}

              {/* CDTs */}
              {assetsBreakdown.cdtsCOP > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>📜 CDTs & Renta Fija:</span>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {formatMoney(assetsBreakdown.cdtsCOP, selectedCurrency)}
                  </span>
                </div>
              )}

              {/* Receivables */}
              {assetsBreakdown.receivableDetails.map((rec) => (
                <div key={rec.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>🤝 {rec.name}:</span>
                  <span className="mono" style={{ fontWeight: 600, color: "#a855f7" }}>
                    {formatMoney(rec.amountCOP, selectedCurrency)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Liabilities Column */}
          <div
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.02)",
              borderRadius: "12px",
              padding: "14px",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.06)" : "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px 0",
                fontSize: "0.82rem",
                fontWeight: 800,
                color: isLight ? "#e11d48" : "#fb7185",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>🔴 Detalle de Pasivos</span>
              <span>{formatMoney(liabilitiesBreakdown.totalLiabilitiesCOP, selectedCurrency)}</span>
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Credit card items */}
              {liabilitiesBreakdown.cardDetails.length > 0 ? (
                liabilitiesBreakdown.cardDetails.map((card) => (
                  <div key={card.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                    <span>
                      💳 <strong>{card.name}:</strong>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginLeft: 4 }}>
                        (de {formatMoney(card.totalLimitCOP, selectedCurrency)})
                      </span>
                    </span>
                    <span className="mono" style={{ fontWeight: 700, color: "#e11d48" }}>
                      -{formatMoney(card.usedLimitCOP, selectedCurrency)}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: "0.75rem", color: "#10b981" }}>
                  ✅ No tienes deudas registradas en tarjetas de crédito.
                </div>
              )}

              {/* Personal debts */}
              {liabilitiesBreakdown.debtDetails.map((debt) => (
                <div key={debt.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
                  <span style={{ color: "var(--text-secondary)" }}>⚠️ {debt.name}:</span>
                  <span className="mono" style={{ fontWeight: 600, color: "#e11d48" }}>
                    -{formatMoney(debt.amountCOP, selectedCurrency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
