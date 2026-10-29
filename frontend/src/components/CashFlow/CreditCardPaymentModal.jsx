import React, { useEffect, useMemo, useState } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import DynamicDatePicker from "../Common/DynamicDatePicker";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { useTheme } from "../../context/ThemeContext";
import { getCurrentPeriod } from "../../utils/periodUtils";
import { calculateEffectiveExpense } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

function formatMoney(val, currency = "COP") {
  const num = Number(val) || 0;
  if (currency === "USD") {
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `$${Math.round(num).toLocaleString("es-CO")}`;
}

export default function CreditCardPaymentModal({
  isOpen,
  onClose,
  activePeriod,
  currency = "COP",
  creditCards = [],
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", icon: "💜" },
  fixedIncomeAccounts = [],
  budgetItems = [],
  expensesLog = [],
  debts = [],
  initialCardId = null,
  initialAmount = null,
  onSavePayment,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const currentPeriod = activePeriod || getCurrentPeriod();

  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || "");
  const [amount, setAmount] = useState(0);
  const [sourceType, setSourceType] = useState("payroll");
  const [selectedPocketId, setSelectedPocketId] = useState(fixedIncomeAccounts[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("Pago total tarjeta para quedar en $0");
  const [deductFromBudget, setDeductFromBudget] = useState(true);
  const [showNeedsItems, setShowNeedsItems] = useState(false);
  const [deductionsMap, setDeductionsMap] = useState({});

  const totalAllCardsDebt = useMemo(() => {
    return creditCards.reduce((acc, c) => acc + (Number(c.usedLimit) || 0), 0);
  }, [creditCards]);

  // Compute available balance for each budget envelope in the active period
  const enrichedBudgetItems = useMemo(() => {
    return (budgetItems || []).map((item) => {
      const itemTransactions = (expensesLog || []).filter(
        (tx) => tx.budgetItemId === item.id || tx.budgetItemName === item.name
      );
      const totalGross = itemTransactions.reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
      const spent = itemTransactions.reduce((acc, tx) => acc + calculateEffectiveExpense(tx, debts).effectiveSpent, 0);
      const totalRepaid = itemTransactions.reduce((acc, tx) => acc + calculateEffectiveExpense(tx, debts).repaidAmount, 0);
      const baseBudget = Number(item.amount) || 0;
      const available = Math.max(0, baseBudget - spent);

      return {
        ...item,
        baseBudget,
        spent,
        totalGross,
        totalRepaid,
        available,
      };
    });
  }, [budgetItems, expensesLog, debts]);

  // Visible budget items for discounting (Wants & Wealth by default, Needs optional)
  const visibleBudgetItems = useMemo(() => {
    return enrichedBudgetItems.filter((item) => {
      if (item.baseBudget <= 0) return false;
      if (showNeedsItems) return true;
      return item.pillarType === "wants" || item.pillarType === "wealth";
    });
  }, [enrichedBudgetItems, showNeedsItems]);

  // Smart Auto-Distribution Algorithm (Prioritizes Secondary Savings + Discretionary Wants/Outings)
  const computeSmartDistribution = (targetAmt, itemsList) => {
    let remainingToAssign = Math.max(0, Number(targetAmt) || 0);
    const nextMap = {};
    if (remainingToAssign <= 0 || !itemsList?.length) return nextMap;

    const wantsAndWealth = itemsList.filter(
      (i) => (i.pillarType === "wants" || i.pillarType === "wealth") && i.available > 0
    );

    // Tier 1: Secondary savings (High yield savings, travel/study goals — excludes Emergency Fund & Stock Portfolio)
    const tier1 = wantsAndWealth.filter(
      (i) =>
        i.pillarType === "wealth" &&
        i.category !== "emergency_fund" &&
        i.category !== "equity_investment" &&
        !i.name?.toLowerCase().includes("emergencia") &&
        !i.name?.toLowerCase().includes("renta variable")
    );

    // Tier 2: Flexible Leisure & Outings (Ocio, Restaurantes, Salidas — excludes fixed subscriptions/gym)
    const tier2Ocio = wantsAndWealth.filter(
      (i) =>
        i.pillarType === "wants" &&
        (i.name?.toLowerCase().includes("ocio") ||
          i.name?.toLowerCase().includes("hobbies") ||
          i.name?.toLowerCase().includes("compras"))
    );
    const tier2Salidas = wantsAndWealth.filter(
      (i) =>
        i.pillarType === "wants" &&
        !tier2Ocio.some((o) => o.id === i.id) &&
        !i.name?.toLowerCase().includes("suscripc") &&
        i.category !== "subscriptions"
    );

    // Tier 3: Any other Wants or Wealth if still needed
    const usedIds = new Set([
      ...tier1.map((i) => i.id),
      ...tier2Ocio.map((i) => i.id),
      ...tier2Salidas.map((i) => i.id),
    ]);
    const tier3 = wantsAndWealth.filter((i) => !usedIds.has(i.id));

    // Step 1: Take from Tier 1 (Secondary Savings)
    tier1.forEach((item) => {
      if (remainingToAssign <= 0) return;
      const take = Math.min(remainingToAssign, item.available);
      if (take > 0) {
        nextMap[item.id] = Math.round(take);
        remainingToAssign -= take;
      }
    });

    // Step 2: Take up to 75% of Ocio first so user keeps a small buffer
    tier2Ocio.forEach((item) => {
      if (remainingToAssign <= 0) return;
      const maxComfortable = Math.round(item.available * 0.75);
      const take = Math.min(remainingToAssign, maxComfortable);
      if (take > 0) {
        nextMap[item.id] = Math.round(take);
        remainingToAssign -= take;
      }
    });

    // Step 3: Take from Salidas / Restaurantes
    tier2Salidas.forEach((item) => {
      if (remainingToAssign <= 0) return;
      const take = Math.min(remainingToAssign, item.available);
      if (take > 0) {
        nextMap[item.id] = Math.round(take);
        remainingToAssign -= take;
      }
    });

    // Step 4: If still remaining, take remaining 25% of Ocio or Tier 3
    [...tier2Ocio, ...tier3].forEach((item) => {
      if (remainingToAssign <= 0) return;
      const alreadyTaken = nextMap[item.id] || 0;
      const leftInItem = Math.max(0, item.available - alreadyTaken);
      const take = Math.min(remainingToAssign, leftInItem);
      if (take > 0) {
        nextMap[item.id] = Math.round(alreadyTaken + take);
        remainingToAssign -= take;
      }
    });

    return nextMap;
  };

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      const cardWithDebt = creditCards.find((c) => Number(c.usedLimit) > 0);
      const targetId = initialCardId || cardWithDebt?.id || creditCards[0]?.id || "";
      setSelectedCardId(targetId);

      let targetAmt = 0;
      if (initialAmount != null && Number(initialAmount) > 0) {
        targetAmt = Number(initialAmount);
      } else if (targetId === "ALL") {
        targetAmt = totalAllCardsDebt;
      } else {
        const found = creditCards.find((c) => c.id === targetId);
        targetAmt = Number(found?.usedLimit) || 0;
      }

      setAmount(targetAmt);
      setDeductFromBudget(true);
      setDeductionsMap(computeSmartDistribution(targetAmt, enrichedBudgetItems));
    }
  }, [isOpen, initialCardId, initialAmount, creditCards, totalAllCardsDebt]);

  const isPayingAll = selectedCardId === "ALL";
  const selectedCard = isPayingAll
    ? null
    : creditCards.find((c) => c.id === selectedCardId) || creditCards[0];

  const usedLimit = isPayingAll ? totalAllCardsDebt : Number(selectedCard?.usedLimit) || 0;
  const totalLimit = isPayingAll
    ? creditCards.reduce((acc, c) => acc + (Number(c.totalLimit) || 0), 0)
    : Number(selectedCard?.totalLimit) || 0;

  const newUsedLimit = Math.max(0, usedLimit - Number(amount));
  const newAvailable = Math.max(0, totalLimit - newUsedLimit);

  const handleSelectCardChange = (newId) => {
    setSelectedCardId(newId);
    let nextAmt = 0;
    if (newId === "ALL") {
      nextAmt = totalAllCardsDebt;
    } else {
      const found = creditCards.find((c) => c.id === newId);
      nextAmt = Number(found?.usedLimit) || 0;
    }
    setAmount(nextAmt);
    setDeductionsMap(computeSmartDistribution(nextAmt, enrichedBudgetItems));
  };

  const handleAmountChange = (val) => {
    setAmount(val);
  };

  const handleApplySmartSuggestion = () => {
    setDeductionsMap(computeSmartDistribution(amount, enrichedBudgetItems));
  };

  const handleUpdateDeduction = (itemId, val, maxAvailable) => {
    const cleanVal = Math.max(0, Math.min(Number(val) || 0, maxAvailable));
    setDeductionsMap((prev) => ({
      ...prev,
      [itemId]: cleanVal,
    }));
  };

  const handleTakeRemainingForItem = (item) => {
    const currentAssignedOther = Object.entries(deductionsMap).reduce(
      (acc, [id, val]) => (id === item.id ? acc : acc + (Number(val) || 0)),
      0
    );
    const needed = Math.max(0, Number(amount) - currentAssignedOther);
    const take = Math.min(needed, item.available);
    setDeductionsMap((prev) => ({
      ...prev,
      [item.id]: Math.round(take),
    }));
  };

  const totalAssignedDeductions = useMemo(() => {
    return Object.values(deductionsMap).reduce((acc, v) => acc + (Number(v) || 0), 0);
  }, [deductionsMap]);

  const unassignedDiff = Math.round((Number(amount) || 0) - totalAssignedDeductions);

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((!selectedCard && !isPayingAll) || Number(amount) <= 0) return;

    let sourceName = payrollAccount.name || "Cuenta Nu Débito";
    let sourceAccountId = null;
    if (sourceType === "fixed_pocket") {
      const pocket = fixedIncomeAccounts.find((a) => a.id === selectedPocketId);
      sourceName = pocket ? pocket.name : "Cuenta de Ahorro";
      sourceAccountId = pocket ? pocket.id : null;
    }

    const budgetDeductions =
      deductFromBudget && sourceType === "payroll"
        ? enrichedBudgetItems
            .filter((item) => Number(deductionsMap[item.id]) > 0)
            .map((item) => ({
              budgetItemId: item.id,
              budgetItemName: item.name,
              budgetItemType: item.pillarType,
              amount: Number(deductionsMap[item.id]),
            }))
        : [];

    const cardsBreakdown = isPayingAll
      ? creditCards
          .filter((c) => Number(c.usedLimit) > 0)
          .map((c) => ({
            cardId: c.id,
            cardName: c.name,
            amount: Number(c.usedLimit) || 0,
          }))
      : null;

    const paymentData = {
      id: `pay_${Date.now()}`,
      cardId: isPayingAll ? "ALL" : selectedCard.id,
      cardName: isPayingAll
        ? `Todas las Tarjetas (${creditCards.filter((c) => Number(c.usedLimit) > 0).map((c) => c.name).join(" + ")})`
        : selectedCard.name,
      cardsBreakdown,
      amount: Number(amount),
      currency,
      date,
      period: currentPeriod,
      sourceType,
      sourceAccountId,
      sourceAccount: sourceName,
      budgetDeductions,
      description: description.trim() || "Pago tarjeta de crédito",
      createdAt: new Date().toISOString(),
    };

    onSavePayment(paymentData);
    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={620}>
      <div style={{ padding: "22px 26px", maxHeight: "88vh", overflowY: "auto" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 12 }}>
          <h3 className="cashflow-modal-title">
            <span>💵</span> Pagar / Abonar a Tarjeta de Crédito
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 4, marginBottom: 14 }}>
          Libera el cupo de tus tarjetas dejándolas en <strong>$0</strong> y elige de qué rubros de <strong>Ahorro o Salidas</strong> del mes descontar este pago para que tu presupuesto cuadre automáticamente.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          {/* Select Target Credit Card + Quick Pay All Toggle */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
              <label style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                💳 Tarjeta de Crédito a Pagar
              </label>
              {totalAllCardsDebt > 0 && creditCards.filter((c) => Number(c.usedLimit) > 0).length > 1 && (
                <button
                  type="button"
                  onClick={() => handleSelectCardChange("ALL")}
                  style={{
                    background: isPayingAll ? "rgba(56, 189, 248, 0.2)" : "rgba(56, 189, 248, 0.1)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: isLight ? "#0284c7" : "#38bdf8",
                    borderRadius: "6px",
                    padding: "3px 9px",
                    fontSize: "0.73rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ⚡ Pagar TODAS a $0 ({formatMoney(totalAllCardsDebt, currency)})
                </button>
              )}
            </div>

            <select
              value={selectedCardId}
              onChange={(e) => handleSelectCardChange(e.target.value)}
              style={{
                width: "100%",
                background: isLight ? "#f8fafc" : "rgba(13, 18, 38, 0.7)",
                border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "10px",
                padding: "10px 14px",
                color: isLight ? "#0f172a" : "#f8fafc",
                fontSize: "0.9rem",
                fontWeight: 600,
              }}
            >
              {totalAllCardsDebt > 0 && creditCards.filter((c) => Number(c.usedLimit) > 0).length > 1 && (
                <option value="ALL">
                  ⚡ TODAS LAS TARJETAS — Deuda Total: {formatMoney(totalAllCardsDebt, currency)}
                </option>
              )}
              {creditCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} (Saldo por Pagar: {formatMoney(card.usedLimit || 0, currency)})
                </option>
              ))}
            </select>
          </div>

          {/* Amount & Date */}
          <div className="cashflow-form-row">
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                  Monto a Pagar ({currency})
                </label>
                {usedLimit > 0 && Number(amount) !== usedLimit && (
                  <button
                    type="button"
                    onClick={() => {
                      setAmount(usedLimit);
                      setDeductionsMap(computeSmartDistribution(usedLimit, enrichedBudgetItems));
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#10b981",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ⚡ Usar total ({formatMoney(usedLimit, currency)})
                  </button>
                )}
              </div>
              <CurrencyInput
                value={amount}
                onChange={handleAmountChange}
                currency={currency}
                placeholder="0"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 5, fontWeight: 700 }}>
                Fecha del Pago
              </label>
              <DynamicDatePicker
                value={date}
                onChange={(d) => setDate(d)}
                placeholder="Seleccionar fecha..."
              />
            </div>
          </div>

          {/* Funding Source */}
          <div
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(13, 18, 38, 0.65)",
              padding: "12px 16px",
              borderRadius: "14px",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 8, fontWeight: 700 }}>
              🏦 Cuenta de Origen del Dinero
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setSourceType("payroll")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "10px",
                  background: sourceType === "payroll" ? "rgba(130, 10, 209, 0.2)" : "transparent",
                  border: sourceType === "payroll" ? "1px solid #820ad1" : "1px solid var(--border)",
                  color: sourceType === "payroll" ? (isLight ? "#6b21a8" : "#c084fc") : "var(--text-secondary)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🏦 {payrollAccount.name || "Nómina Nu"} (Flujo del Mes)
              </button>

              {fixedIncomeAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSourceType("fixed_pocket")}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "10px",
                    background: sourceType === "fixed_pocket" ? "rgba(56, 189, 248, 0.18)" : "transparent",
                    border: sourceType === "fixed_pocket" ? "1px solid #38bdf8" : "1px solid var(--border)",
                    color: sourceType === "fixed_pocket" ? (isLight ? "#0284c7" : "#38bdf8") : "var(--text-secondary)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  📦 Cuenta de Ahorro / Renta Fija
                </button>
              )}
            </div>

            {sourceType === "fixed_pocket" && fixedIncomeAccounts.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <select
                  value={selectedPocketId}
                  onChange={(e) => setSelectedPocketId(e.target.value)}
                  style={{
                    width: "100%",
                    background: isLight ? "#ffffff" : "rgba(0,0,0,0.5)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    color: "var(--text-primary)",
                    fontSize: "0.82rem",
                  }}
                >
                  {fixedIncomeAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (${Math.round(acc.balance || 0).toLocaleString("es-CO")} COP)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ── Smart Budget Envelope Deduction Selector (Ahorro & Salidas) ── */}
          {sourceType === "payroll" && enrichedBudgetItems.length > 0 && (
            <div
              style={{
                background: isLight ? "rgba(56, 189, 248, 0.05)" : "rgba(15, 23, 42, 0.75)",
                border: isLight ? "1px solid rgba(56, 189, 248, 0.25)" : "1px solid rgba(56, 189, 248, 0.25)",
                borderRadius: "14px",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  <input
                    type="checkbox"
                    checked={deductFromBudget}
                    onChange={(e) => setDeductFromBudget(e.target.checked)}
                    style={{ accentColor: "#38bdf8", width: 16, height: 16 }}
                  />
                  <span>🎯 Descontar automáticamente de mis rubros del mes (Ahorro y Salidas)</span>
                </label>

                {deductFromBudget && (
                  <button
                    type="button"
                    onClick={handleApplySmartSuggestion}
                    style={{
                      background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(56, 189, 248, 0.2))",
                      border: "1px solid rgba(16, 185, 129, 0.45)",
                      color: isLight ? "#047857" : "#34d399",
                      borderRadius: "8px",
                      padding: "4px 10px",
                      fontSize: "0.73rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    title="Reparte el pago tomando primero de Ahorro Secundario (Alto Rendimiento / Viaje) y de Ocio/Salidas, sin tocar Gastos Fijos ni tu Inversión Principal"
                  >
                    ✨ Reparto Inteligente Sugerido
                  </button>
                )}
              </div>

              {deductFromBudget && (
                <>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                    💡 <strong>Consejo financiero:</strong> Pagar tarjetas al ~24.5% E.A. te ahorra más intereses de lo que rinde una cuenta al 9.35% E.A. Lo ideal es cubrirlo combinando tu <strong>Ahorro secundario</strong> y parte de <strong>Salidas / Ocio</strong> sin tocar tus gastos fijos ni tu inversión bursátil.
                  </div>

                  {/* List of Wants & Wealth Envelopes */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                    {visibleBudgetItems.map((item) => {
                      const assignedVal = Number(deductionsMap[item.id]) || 0;
                      const remainingAfter = Math.max(0, item.available - assignedVal);
                      const isWants = item.pillarType === "wants";
                      const isWealth = item.pillarType === "wealth";
                      const badgeColor = isWants ? "#a855f7" : isWealth ? "#38bdf8" : "#f43f5e";

                      return (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 12px",
                            borderRadius: "10px",
                            background:
                              assignedVal > 0
                                ? isLight
                                  ? "rgba(16, 185, 129, 0.08)"
                                  : "rgba(16, 185, 129, 0.1)"
                                : isLight
                                ? "#ffffff"
                                : "rgba(255, 255, 255, 0.03)",
                            border:
                              assignedVal > 0
                                ? "1px solid rgba(16, 185, 129, 0.35)"
                                : "1px solid var(--border)",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span>{item.icon || (isWants ? "🍷" : "💎")}</span>
                              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>
                                {item.name}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.66rem",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: `${badgeColor}22`,
                                  color: badgeColor,
                                  fontWeight: 700,
                                }}
                              >
                                {isWants ? "Salidas / Deseos" : isWealth ? "Ahorro" : "Fijo"}
                              </span>
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                              Disponible hoy: <strong>{formatMoney(item.available, currency)}</strong>
                              {assignedVal > 0 && (
                                <span style={{ color: "#10b981", marginLeft: 8, fontWeight: 700 }}>
                                  ➔ Quedará libre: {formatMoney(remainingAfter, currency)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 135 }}>
                              <CurrencyInput
                                value={assignedVal}
                                onChange={(val) => handleUpdateDeduction(item.id, val, item.available)}
                                currency={currency}
                                placeholder="0"
                              />
                            </div>
                            {unassignedDiff > 0 && item.available > assignedVal && (
                              <button
                                type="button"
                                onClick={() => handleTakeRemainingForItem(item)}
                                title="Cubrir el saldo faltante con este rubro"
                                style={{
                                  background: "rgba(56, 189, 248, 0.15)",
                                  border: "1px solid rgba(56, 189, 248, 0.3)",
                                  color: "#38bdf8",
                                  borderRadius: "6px",
                                  padding: "5px 7px",
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                +Faltante
                              </button>
                            )}
                            {assignedVal > 0 && (
                              <button
                                type="button"
                                onClick={() => handleUpdateDeduction(item.id, 0, item.available)}
                                title="Quitar descuento de este rubro"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--text-muted)",
                                  cursor: "pointer",
                                  fontSize: "0.8rem",
                                  padding: "2px 4px",
                                }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary Bar of Budget Deductions */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 8,
                      borderTop: "1px solid var(--border)",
                      fontSize: "0.78rem",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowNeedsItems(!showNeedsItems)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      {showNeedsItems ? "Ocultar Gastos Fijos" : "Mostrar también Gastos Fijos"}
                    </button>

                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>Total descontado de rubros: </span>
                      <strong
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          color:
                            unassignedDiff === 0
                              ? "#10b981"
                              : unassignedDiff > 0
                              ? "#fbbf24"
                              : "#f43f5e",
                        }}
                      >
                        {formatMoney(totalAssignedDeductions, currency)} / {formatMoney(amount, currency)}
                      </strong>
                      {unassignedDiff === 0 && Number(amount) > 0 && (
                        <span style={{ color: "#10b981", marginLeft: 6, fontWeight: 700 }}>✅ Exacto</span>
                      )}
                      {unassignedDiff > 0 && (
                        <span style={{ color: "#fbbf24", marginLeft: 6 }}>
                          (Faltan {formatMoney(unassignedDiff, currency)} por asignar)
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 5, fontWeight: 700 }}>
              Nota / Concepto
            </label>
            <input
              type="text"
              className="currency-native-input"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: isLight ? "#f8fafc" : "rgba(13, 18, 38, 0.7)",
                border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "10px",
                padding: "8px 12px",
                color: "var(--text-primary)",
                fontSize: "0.85rem",
              }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ej. Pago total del mes para quedar en $0..."
            />
          </div>

          {/* Live Preview of Quota Liberation */}
          {Number(amount) > 0 && (selectedCard || isPayingAll) && (
            <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "12px", padding: "12px 16px" }}>
              <div style={{ fontSize: "0.76rem", color: "#10b981", fontWeight: 700, marginBottom: 4 }}>
                ✨ Impacto del Pago en tu Cupo:
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--text-primary)", flexWrap: "wrap", gap: 8 }}>
                <span>
                  Deuda Usada: <strong style={{ color: "#f43f5e" }}>{formatMoney(usedLimit, currency)}</strong> ➔{" "}
                  <strong style={{ color: "#10b981" }}>{formatMoney(newUsedLimit, currency)}</strong>
                </span>
                <span>
                  Cupo Libre: <strong style={{ color: "#10b981" }}>{formatMoney(newAvailable, currency)}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="cashflow-modal-footer" style={{ marginTop: 4 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="cashflow-action-btn primary"
              disabled={Number(amount) <= 0}
            >
              ✓ Registrar Pago & Descontar de Rubros
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
