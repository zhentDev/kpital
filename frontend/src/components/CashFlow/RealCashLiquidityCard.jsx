import React, { useState } from "react";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import { useTheme } from "../../context/ThemeContext";
import "./CashFlow.css";

export default function RealCashLiquidityCard({
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", color: "#820ad1", icon: "💜" },
  totalInflow = 0,
  inflows = [],
  needs = [],
  wants = [],
  wealth = [],
  creditCards = [],
  creditPurchases = [],
  creditCardPayments = [],
  expensesLog = [],
  fixedIncomeAccounts = [],
  activePeriod,
  currency = "COP",
  fxRate = 4150,
  onOpenPayrollModal,
  onOpenExpenseModal,
  onOpenPaymentModal,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const [viewMode, setViewMode] = useState("real_today"); // 'real_today' | 'projected_month'

  // 1. Total Inflow received in Payroll Account
  const payrollInflows = inflows
    .filter((i) => {
      const srcType = i.paymentSource?.type;
      return srcType === "payroll" || !srcType || i.category === "salary" || i.category === "overtime";
    })
    .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

  const salaryItem = inflows.find(
    (i) =>
      i.category === "salary" ||
      i.name?.toLowerCase().includes("salario") ||
      i.name?.toLowerCase().includes("nómina")
  );
  const netSalaryAmount =
    payrollInflows > 0 ? payrollInflows : salaryItem ? Number(salaryItem.amount) || 0 : totalInflow;

  // 2. Real Outflows executed from Payroll (Debit) Account (Dinero que YA salió de la cuenta)
  const executedExpensesFromPayroll = (expensesLog || [])
    .filter((tx) => {
      // Must be an OUTFLOW / DEBIT (never credit or income)
      if (tx.type === "credit" || tx.budgetItemType === "income") return false;

      // Ignore parent split transactions if children splits exist
      if ((expensesLog || []).some((c) => c.splitParentId === tx.id)) return false;

      // Evita doble conteo porque ya suma en executedCardPaymentsFromPayroll
      if (
        tx.isCreditCardPayoff ||
        Boolean(tx.creditCardPaymentId) ||
        (tx.cardId && tx.id && String(tx.id).includes("_split_")) ||
        (tx.description && String(tx.description).toLowerCase().includes("descontado de") && !String(tx.description).toLowerCase().includes("mike"))
      ) {
        return false;
      }

      const srcType = tx.paymentSource?.type;
      const targetId = tx.paymentSource?.targetId;
      const targetName = (tx.paymentSource?.targetName || "").toLowerCase();

      // Skip expenses explicitly belonging to other accounts (Rappi, credit cards, pockets)
      if (targetId && targetId !== "acc_nu_debito" && (targetId.startsWith("acc_rappi") || targetId.startsWith("cc_"))) {
        return false;
      }
      if (srcType === "credit_card" || targetName.includes("rappi")) return false;

      return (
        srcType === "payroll" ||
        srcType === "debit" ||
        targetId === "acc_nu_debito" ||
        (!srcType && tx.budgetItemType === "needs")
      );
    })
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const executedCardPaymentsFromPayroll = (creditCardPayments || [])
    .filter((p) => {
      const srcType = p.paymentSource?.type || p.sourceType;
      return srcType === "payroll" || !srcType;
    })
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const totalExecutedPayrollOutflow =
    executedExpensesFromPayroll + executedCardPaymentsFromPayroll;

  // Match Payroll Account in Fixed Income SSOT
  const matchedPayrollAccount = (fixedIncomeAccounts || []).find((a) => {
    if (payrollAccount?.id && a.id === payrollAccount.id) return true;
    const nameNorm = (a.name || "").toLowerCase();
    return (
      nameNorm.includes("nomina") ||
      nameNorm.includes("nómina") ||
      (nameNorm.includes("debito") && nameNorm.includes("nu")) ||
      (nameNorm.includes("cuenta nu") && !nameNorm.includes("cajita"))
    );
  });

  // Real credits/income received in Payroll Account for this cycle
  const realPayrollCredits = (expensesLog || [])
    .filter((tx) => {
      const isCredit = tx.type === "credit" || tx.budgetItemType === "income";
      const srcType = tx.paymentSource?.type;
      const targetName = (tx.paymentSource?.targetName || "").toLowerCase();
      const desc = (tx.description || tx.budgetItemName || "").toLowerCase();
      if (targetName.includes("rappi") || targetName.includes("impresora") || desc.includes("impresora")) {
        return false;
      }
      return (
        isCredit &&
        (srcType === "payroll" ||
          targetName.includes("nu") ||
          targetName.includes("nomina") ||
          targetName.includes("nómina") ||
          desc.includes("nomina") ||
          desc.includes("nómina") ||
          desc.includes("salario"))
      );
    })
    .reduce((acc, tx) => acc + Math.abs(Number(tx.amount) || 0), 0);

  // Real Cash in Payroll Account Right Now (Dinero Líquido Real en Banco Hoy):
  // If matched payroll account exists in fixed income, its actual balance is the SSOT (e.g. $0 COP before salary arrives).
  // Otherwise, fallback to realPayrollCredits - totalExecutedPayrollOutflow.
  const realCashInPayroll = matchedPayrollAccount
    ? Number(matchedPayrollAccount.balance) || 0
    : Math.max(0, realPayrollCredits - totalExecutedPayrollOutflow);

  // 3. Pending Commitments for the Rest of the Month (Gastos y Aportes planeados que aún NO han salido)
  let pendingExpensesFromPayroll = 0;
  [...needs, ...wants].forEach((item) => {
    const srcType = item.paymentSource?.type || "payroll";
    if (srcType === "payroll") {
      const itemAmt = Number(item.amount) || 0;
      const itemSpent = (expensesLog || [])
        .filter((tx) => tx.budgetItemId === item.id || tx.budgetItemName === item.name)
        .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
      const remaining = Math.max(0, itemAmt - itemSpent);
      pendingExpensesFromPayroll += remaining;
    }
  });

  let pendingSavingsFromPayroll = 0;
  wealth.forEach((w) => {
    const srcType = w.paymentSource?.type || "payroll";
    if (srcType === "payroll") {
      const targetContribution = Number(w.monthlyContribution) || 0;
      const contributed = (expensesLog || [])
        .filter((tx) => tx.budgetItemId === w.id || tx.budgetItemName === w.name)
        .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
      const remainingToSave = Math.max(0, targetContribution - contributed);
      pendingSavingsFromPayroll += remainingToSave;
    }
  });

  // Credit Card Bill for the Active Period (Installments to pay)
  let monthlyCreditBill = 0;
  creditPurchases.forEach((p) => {
    if (!p.startPeriod || !p.installmentsCount) return;
    const [startYear, startMonth] = p.startPeriod.split("-").map(Number);
    const [activeYear, activeMonth] = activePeriod.split("-").map(Number);
    const monthDiff = (activeYear - startYear) * 12 + (activeMonth - startMonth);
    if (monthDiff >= 0 && monthDiff < p.installmentsCount) {
      monthlyCreditBill += Number(p.monthlyInstallment) || 0;
    }
  });

  const totalPendingPayrollCommitments =
    pendingExpensesFromPayroll + pendingSavingsFromPayroll;

  // 4. Projected Surplus / Remaining Buffer at month end:
  // Assumes expected salary is received if not yet credited
  const effectiveInflowForProjection = realPayrollCredits > 0 ? realCashInPayroll : (netSalaryAmount - totalExecutedPayrollOutflow);
  const projectedSurplus = effectiveInflowForProjection - totalPendingPayrollCommitments;

  // 5. Total Balance in High-Yield Savings Accounts (Cajitas Nu, Plenti, etc.) and Digital Wallets in base COP
  const totalHighYieldBalance = fixedIncomeAccounts
    .filter(
      (a) =>
        a.id !== matchedPayrollAccount?.id &&
        a.accountCategory !== "payroll" &&
        a.accountCategory !== "digital_wallet" &&
        a.type !== "wallet" &&
        Number(a.interestRateEA || 0) > 0
    )
    .reduce((acc, a) => {
      const mult = a.currency === "USD" ? Number(fxRate) || 4150 : 1;
      return acc + (Number(a.balance) || 0) * mult;
    }, 0);

  const totalWalletsBalance = fixedIncomeAccounts
    .filter(
      (a) =>
        a.id !== matchedPayrollAccount?.id &&
        (a.accountCategory === "digital_wallet" || (Number(a.interestRateEA || 0) === 0 && a.accountCategory !== "payroll"))
    )
    .reduce((acc, a) => acc + (Number(a.balance) || 0), 0);

  const totalLiquidSavings = totalHighYieldBalance + totalWalletsBalance;

  // 6. Total Real Credit Limits and Debt (Cupo Usado vs Cupo Libre)
  let totalCreditLimit = 0;
  let totalCreditUsed = 0;

  creditCards.forEach((c) => {
    totalCreditLimit += Number(c.totalLimit) || 0;
    totalCreditUsed += Number(c.usedLimit) || 0;
  });

  const totalCreditAvailable = Math.max(0, totalCreditLimit - totalCreditUsed);
  const creditUsagePct =
    totalCreditLimit > 0
      ? ((totalCreditUsed / totalCreditLimit) * 100).toFixed(0)
      : 0;

  // Total loans receivable
  const totalLoansReceivable = (expensesLog || []).reduce((acc, tx) => {
    if (tx.isLoan && tx.loanStatus !== "settled") {
      const remaining =
        tx.remainingLoan !== undefined
          ? Number(tx.remainingLoan)
          : Number(tx.loanAmount) || Number(tx.amount) || 0;
      return acc + remaining;
    }
    return acc;
  }, 0);

  return (
    <div className="cashflow-liquidity-card">
      {/* Header with Payroll Entity Selector & View Mode Switcher */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 16,
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "1.6rem" }}>💰</span>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                Disponibilidad Real de Plata Líquida & Fondos
              </h4>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "8px",
                  background: "rgba(130, 10, 209, 0.15)",
                  color: "#a855f7",
                  border: "1px solid rgba(130, 10, 209, 0.3)",
                }}
              >
                🗓️ Pago Día {payrollAccount.payDay || 25} • Fondeo Mes Entrante
              </span>
            </div>
            <span
              style={{
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                display: "block",
                marginTop: 3,
              }}
            >
              Distingue entre la plata que <strong>realmente tienes en el banco hoy</strong> y lo que tienes comprometido a gastar o invertir.
            </span>
          </div>
        </div>

        {/* View Mode Switcher & Payroll Account Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "3px",
              display: "inline-flex",
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("real_today")}
              style={{
                background:
                  viewMode === "real_today"
                    ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                    : "transparent",
                color: viewMode === "real_today" ? "#ffffff" : "var(--text-muted)",
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              💵 Saldo Real en Banco Hoy
            </button>
            <button
              type="button"
              onClick={() => setViewMode("projected_month")}
              style={{
                background:
                  viewMode === "projected_month"
                    ? "linear-gradient(135deg, #820ad1 0%, #6366f1 100%)"
                    : "transparent",
                color: viewMode === "projected_month" ? "#ffffff" : "var(--text-muted)",
                border: "none",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              📅 Proyección Cierre de Mes
            </button>
          </div>

          {onOpenPayrollModal && (
            <button
              type="button"
              onClick={onOpenPayrollModal}
              style={{
                background: "rgba(130, 10, 209, 0.12)",
                border: "1px solid rgba(130, 10, 209, 0.35)",
                borderRadius: "12px",
                color: "#9333ea",
                padding: "8px 14px",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              <span>{payrollAccount.icon || "💜"}</span>
              <span>{payrollAccount.name || "Nu Colombia"}</span>
              <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>⚙️</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Multi-Account Liquid Pillars Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 18,
        }}
      >
        {/* 1. Real Available Cash in Payroll */}
        <div
          style={{
            background: "var(--bg-surface)",
            borderRadius: "16px",
            padding: "18px 20px",
            border:
              viewMode === "real_today"
                ? "1px solid rgba(16, 185, 129, 0.45)"
                : "1px solid rgba(130, 10, 209, 0.45)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: "155px",
            boxShadow:
              viewMode === "real_today"
                ? "0 4px 20px rgba(16, 185, 129, 0.08)"
                : "0 4px 20px rgba(130, 10, 209, 0.08)",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>💵</span>
                <span>
                  {viewMode === "real_today"
                    ? "Saldo Real en Cuenta Nómina"
                    : "Colchón Libre Proyectado (Fin Mes)"}
                </span>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: viewMode === "real_today" ? "#10b981" : "#c084fc",
                  fontWeight: 700,
                  background:
                    viewMode === "real_today"
                      ? "rgba(16, 185, 129, 0.15)"
                      : "rgba(130, 10, 209, 0.15)",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                {viewMode === "real_today" ? "Disponible Hoy" : "Tras Todo lo Planeado"}
              </span>
            </div>

            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.6rem",
                fontWeight: 700,
                color:
                  viewMode === "real_today"
                    ? realCashInPayroll >= 0
                      ? "#10b981"
                      : "#f43f5e"
                    : projectedSurplus >= 0
                    ? "#0284c7"
                    : "#f43f5e",
              }}
            >
              {viewMode === "real_today"
                ? formatMoney(realCashInPayroll, currency)
                : formatMoney(projectedSurplus, currency)}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-secondary)",
              marginTop: 10,
              borderTop: "1px solid var(--border)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {viewMode === "real_today" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Nómina Real Recibida:</span>
                  <strong style={{ color: realPayrollCredits > 0 ? "var(--text-primary)" : "#f59e0b" }}>
                    +{formatMoney(realPayrollCredits, currency)}
                    {realPayrollCredits === 0 && " (Esperando hoy)"}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Gastos / Pagos ya Salidos:</span>
                  <span style={{ color: "#f43f5e", fontWeight: 700 }}>
                    -{formatMoney(totalExecutedPayrollOutflow, currency)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", marginTop: 2 }}>
                  <span>Salario Esperado Presupuestado:</span>
                  <span>{formatMoney(netSalaryAmount, currency)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Base Salarial (Esperada):</span>
                  <strong style={{ color: "#10b981" }}>
                    {formatMoney(netSalaryAmount, currency)}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Gastos Débito Pendientes:</span>
                  <span style={{ color: "#f59e0b" }}>
                    -{formatMoney(pendingExpensesFromPayroll, currency)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Aportes Ahorro por Transferir:</span>
                  <span style={{ color: "#0284c7" }}>
                    -{formatMoney(pendingSavingsFromPayroll, currency)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 2. Balance in High-Yield Savings Accounts (Cajitas) */}
        <div
          style={{
            background: "var(--bg-surface)",
            borderRadius: "16px",
            padding: "18px 20px",
            border: "1px solid rgba(2, 132, 199, 0.35)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: "155px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>📦</span>
                <span>Saldo Cuentas de Ahorro / Renta Fija</span>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#0284c7",
                  fontWeight: 700,
                  background: "rgba(2, 132, 199, 0.12)",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                Rendimiento
              </span>
            </div>

            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.6rem",
                fontWeight: 700,
                color: "#0284c7",
              }}
            >
              {formatMoney(totalLiquidSavings, currency)}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-secondary)",
              marginTop: 10,
              borderTop: "1px solid var(--border)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Cuentas con Rendimiento:</span>
              <strong style={{ color: "var(--text-primary)" }}>
                {formatMoney(totalHighYieldBalance, currency)}
              </strong>
            </div>
            {totalWalletsBalance > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>👛 Billeteras (Nequi/Daviplata):</span>
                <strong style={{ color: isLight ? "#7e22ce" : "#c084fc" }}>
                  {formatMoney(totalWalletsBalance, currency)}
                </strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Rendimientos mes:</span>
              <strong style={{ color: "#10b981" }}>
                +{formatMoney(inflows.find((i) => i.category === "passive_fixed")?.amount || 16706, currency)}
              </strong>
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              Ahorros líquidos en Rendimiento & Billeteras Digitales
            </div>
          </div>
        </div>

        {/* 3. Total Credit Card Debt / Used Limit */}
        <div
          style={{
            background: "var(--bg-surface)",
            borderRadius: "16px",
            padding: "18px 20px",
            border: "1px solid rgba(244, 63, 94, 0.3)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: "155px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>💳</span>
                <span>Cupo Usado / Deuda Tarjetas</span>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#f43f5e",
                  fontWeight: 700,
                  background: "rgba(244, 63, 94, 0.12)",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                {creditUsagePct}% Usado
              </span>
            </div>

            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.6rem",
                fontWeight: 700,
                color: totalCreditUsed > 0 ? "#f43f5e" : "#10b981",
              }}
            >
              {formatMoney(totalCreditUsed, currency)}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-secondary)",
              marginTop: 10,
              borderTop: "1px solid var(--border)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {totalLoansReceivable > 0 ? (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#f59e0b" }}>
                <span>🤝 Por cobrar a terceros:</span>
                <strong>{formatMoney(totalLoansReceivable, currency)}</strong>
              </div>
            ) : (
              <div style={{ color: "var(--text-muted)" }}>
                Deuda total acumulada en todas tus tarjetas
              </div>
            )}
            {onOpenPaymentModal && (
              <button
                type="button"
                onClick={onOpenPaymentModal}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#10b981",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                  fontWeight: 700,
                  textDecoration: "underline",
                  marginTop: 2,
                }}
              >
                ⚡ Registrar Pago / Liberar Cupo
              </button>
            )}
          </div>
        </div>

        {/* 4. Total Available Free Credit Limit */}
        <div
          style={{
            background: "var(--bg-surface)",
            borderRadius: "16px",
            padding: "18px 20px",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: "155px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🟢</span>
                <span>Cupo Libre Real Disponible</span>
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "#10b981",
                  fontWeight: 700,
                  background: "rgba(16, 185, 129, 0.12)",
                  padding: "2px 8px",
                  borderRadius: "8px",
                }}
              >
                {100 - Number(creditUsagePct)}% Libre
              </span>
            </div>

            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.6rem",
                fontWeight: 700,
                color: "#10b981",
              }}
            >
              {formatMoney(totalCreditAvailable, currency)}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-secondary)",
              marginTop: 10,
              borderTop: "1px solid var(--border)",
              paddingTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Cupo total otorgado:</span>
              <strong style={{ color: "var(--text-primary)" }}>
                {formatMoney(totalCreditLimit, currency)}
              </strong>
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              Capacidad disponible de crédito no utilizado
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
