import React, { useState } from "react";
import toast from "react-hot-toast";
import { useTheme } from "../../context/ThemeContext";
import { formatCashFlowMoney, calculateEffectiveExpense, sortMovementsByDateTimeDesc } from "../../utils/cashFlowFormatters";
import { toastConfirm } from "../../utils/toastAlerts";
import "./CashFlow.css";

export default function PillarBreakdownCard({
  type = "inflow", // 'inflow' | 'needs' | 'wants' | 'wealth'
  title,
  icon = "💼",
  items = [],
  expensesLog = [], // Array of real transactions for active period
  debts = [],
  activePeriod,
  totalInflow = 0,
  targetRatio = 0,
  currency = "COP",
  fxRate = 4150,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onSaveTransaction,
  onDeleteTransaction,
  onEditTransaction,
  onSettleTransaction,
  onOpenAddExpenseModal,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [isCardOpen, setIsCardOpen] = useState(true);
  const [expandedSubItems, setExpandedSubItems] = useState({});

  const toggleSubItems = (itemId) => {
    setExpandedSubItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const handleDeleteItemClick = async (item) => {
    const title = item.name || "este rubro";
    const ok = await toastConfirm(
      `¿Estás seguro de que deseas eliminar el rubro "${title}"?\nSe desvinculará de las asignaciones de gastos.`
    );
    if (ok && onDeleteItem) {
      onDeleteItem(item.id);
    }
  };

  const handleDeleteTransactionClick = async (tx) => {
    const title = tx.description || "este gasto";
    const formattedAmt = formatMoney(tx.amount, currency);
    const ok = await toastConfirm(
      `¿Estás seguro de que deseas eliminar "${title}" (${formattedAmt})?`
    );
    if (ok && onDeleteTransaction) {
      onDeleteTransaction(tx.id);
    }
  };

  const totalAmount = items.reduce((acc, curr) => {
    const val = type === "wealth" ? curr.monthlyContribution : curr.amount;
    return acc + (Number(val) || 0);
  }, 0);

  const actualPctOfIncome = totalInflow > 0 ? ((totalAmount / totalInflow) * 100).toFixed(1) : "0.0";
  const targetStrategyAmt = (totalInflow * (targetRatio || 0)) / 100;
  const strategyQuotaDiff = targetStrategyAmt - totalAmount;

  const getPillarColor = () => {
    switch (type) {
      case "inflow":
        return "#10b981";
      case "needs":
        return "#f43f5e";
      case "wants":
        return "#a855f7";
      case "wealth":
        return "#38bdf8";
      default:
        return "#00e5ff";
    }
  };

  const color = getPillarColor();

  const handleAutoSyncedClick = (item) => {
    const moduleName =
      item.linkedModule === "fixed_income" || item.category === "passive_fixed"
        ? "Renta Fija (Cuentas de Ahorro & CDTs)"
        : "Renta Variable / Portafolio ETF";

    toast(
      `💡 Este rendimiento pasivo se calcula automáticamente a partir de tus saldos y tasas en la pestaña de ${moduleName}. Para modificarlo, actualiza tus cuentas allí.`,
      {
        icon: "🔗",
        duration: 4000,
        style: {
          background: "#0f172a",
          color: "#f8fafc",
          border: "1px solid rgba(0, 229, 255, 0.3)",
          fontSize: "0.85rem",
        },
      }
    );
  };

  const toggleExpand = (itemId) => {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  };

  const handleToggleSubItemEffective = (item, sub, subKey, matchedTx) => {
    if (matchedTx && onDeleteTransaction) {
      onDeleteTransaction(matchedTx.id);
    } else if (onSaveTransaction) {
      onSaveTransaction({
        id: `tx_sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        period: activePeriod,
        budgetItemId: item.id,
        budgetItemName: item.name,
        budgetItemType: type,
        subItemId: subKey,
        subItemName: sub.name,
        isAutoSubItemCheck: true,
        description: `${item.name}: ${sub.name}`,
        amount: Number(sub.amount) || 0,
        currency,
        date: new Date().toISOString().split("T")[0],
        paymentSource: item.paymentSource || {
          type: "payroll",
          targetName: "Cuenta Nu Débito",
        },
        createdAt: new Date().toISOString(),
      });
    }
  };

  const handleToggleFullItemEffective = (item, itemAmt, matchedFullTx) => {
    if (matchedFullTx && onDeleteTransaction) {
      onDeleteTransaction(matchedFullTx.id);
    } else if (onSaveTransaction) {
      onSaveTransaction({
        id: `tx_full_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        period: activePeriod,
        budgetItemId: item.id,
        budgetItemName: item.name,
        budgetItemType: type,
        isAutoFullItemCheck: true,
        description: `${item.name} (Efectivo del mes)`,
        amount: Number(itemAmt) || 0,
        currency,
        date: new Date().toISOString().split("T")[0],
        paymentSource: item.paymentSource || {
          type: "payroll",
          targetName: "Cuenta Nu Débito",
        },
        createdAt: new Date().toISOString(),
      });
    }
  };

  return (
    <div className={`cashflow-pillar-card ${type}`}>
      {/* Pillar Header with Collapse/Expand */}
      <div
        className="cashflow-pillar-header"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => setIsCardOpen(!isCardOpen)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h4 className="cashflow-pillar-title" style={{ margin: 0 }}>
            <span>{icon}</span> {title}
          </h4>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCardOpen(!isCardOpen);
            }}
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.12)",
              color: isLight ? "#475569" : "#94a3b8",
              borderRadius: "6px",
              padding: "2px 8px",
              fontSize: "0.72rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            title={isCardOpen ? "Ocultar contenido de este pilar" : "Desplegar contenido de este pilar"}
          >
            <span>{isCardOpen ? "▲ Ocultar" : "▼ Desplegar"}</span>
          </button>
        </div>
        <span className="cashflow-pillar-total" style={{ color }}>
          {formatMoney(totalAmount, currency)}
        </span>
      </div>

      {/* Progress Track vs Income & Strategy Quota */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: 6 }}>
          <span style={{ color: isLight ? "#64748b" : "#94a3b8" }}>
            {type === "inflow" ? "Ingresos Esperados (Base Presupuestal)" : `Asignado del Ingreso`}
          </span>
          <span style={{ fontWeight: 700, color: type === "inflow" ? "#10b981" : color }}>
            {actualPctOfIncome}% {targetRatio > 0 && `(Meta: ${targetRatio}%)`}
          </span>
        </div>
        <div className="cashflow-pillar-progress-track">
          <div
            className="cashflow-pillar-progress-fill"
            style={{
              width: `${Math.min(100, Number(actualPctOfIncome))}%`,
              background: color,
              boxShadow: `0 0 10px ${color}88`,
            }}
          />
        </div>

        {/* Strategy Quota Helper Pill */}
        {targetRatio > 0 && type !== "inflow" && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.74rem",
              marginTop: 6,
              background: "var(--bg-surface)",
              padding: "4px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Tope Estrategia: <strong>{formatMoney(targetStrategyAmt, currency)}</strong></span>
            {type === "wealth" ? (
              <span style={{ color: strategyQuotaDiff <= 0 ? "#10b981" : "#fbbf24", fontWeight: 700 }}>
                {strategyQuotaDiff <= 0 ? `🔥 Superávit: +${formatMoney(Math.abs(strategyQuotaDiff), currency)}` : `Faltan: ${formatMoney(strategyQuotaDiff, currency)}`}
              </span>
            ) : (
              <span style={{ color: strategyQuotaDiff >= 0 ? "#10b981" : "#f43f5e", fontWeight: 700 }}>
                {strategyQuotaDiff >= 0 ? `🟢 Cupo Libre: ${formatMoney(strategyQuotaDiff, currency)}` : `⚠️ Excedido por: ${formatMoney(Math.abs(strategyQuotaDiff), currency)}`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Items List & Actions (Collapsible) */}
      {isCardOpen && (
        <>
          <div className="cashflow-items-list">
        {items.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
            No hay ítems registrados en este pilar para este mes.
          </div>
        ) : (
          items.map((item) => {
            const itemAmt = type === "wealth" ? item.monthlyContribution : item.amount;
            const itemPctOfPillar = totalAmount > 0 ? ((itemAmt / totalAmount) * 100).toFixed(0) : 0;
            const isZero = Number(itemAmt) === 0;
            const isOneTime = item.isOneTime || item.frequency === "one_time";
            const isAutoSynced = Boolean(
              type === "inflow" &&
              (item.isAutoSynced ||
                item.linkedModule === "fixed_income" ||
                item.linkedModule === "variable_income" ||
                item.category === "passive_fixed" ||
                item.category === "passive_equity")
            );

            // Filter real transactions belonging to this budget envelope, sorted by date & time descending
            const itemTransactions = sortMovementsByDateTimeDesc(
              (expensesLog || []).filter((tx) => {
                if (tx.budgetItemId && tx.budgetItemId === item.id) return true;
                if (tx.budgetItemName && tx.budgetItemName.toLowerCase() === (item.name || "").toLowerCase()) return true;
                if (type === "inflow") {
                  const isCredit = tx.type === "credit" || tx.budgetItemType === "income";
                  if (!isCredit) return false;
                  const isSalaryItem = item.category === "salary" || (item.name || "").toLowerCase().includes("salario") || (item.name || "").toLowerCase().includes("nómina");
                  if (isSalaryItem) {
                    const isPayrollTx = tx.paymentSource?.type === "payroll" || (tx.description || "").toLowerCase().includes("nomina") || (tx.description || "").toLowerCase().includes("salario");
                    return isPayrollTx;
                  }
                }
                return false;
              })
            );
            let totalGrossAmount = 0;
            let spentAmount = 0;
            let totalRepaidAmount = 0;
            let totalPendingLoanAmount = 0;
            let purePersonalSpent = 0;

            for (const tx of itemTransactions) {
              const eff = calculateEffectiveExpense(tx, debts);
              totalGrossAmount += eff.grossAmount;
              spentAmount += eff.effectiveSpent;
              totalRepaidAmount += eff.repaidAmount;
              totalPendingLoanAmount += eff.pendingLoan;
              purePersonalSpent += eff.purePersonalSpent;
            }
            const isOverBudget = type !== "inflow" && spentAmount > Number(itemAmt) && Number(itemAmt) > 0;
            const overspendDelta = spentAmount - Number(itemAmt);
            const remainingBudget = Math.max(0, Number(itemAmt) - spentAmount);
            const budgetUsedPct = Number(itemAmt) > 0 ? ((spentAmount / Number(itemAmt)) * 100).toFixed(0) : 0;

            const isExpanded = expandedItemId === item.id;

            const source = item.paymentSource || {};
            const sourceIcon =
              source.type === "credit_card"
                ? "💳"
                : source.type === "fixed_pocket"
                ? "📦"
                : source.type === "investment_cash"
                ? "🚀"
                : "🏦";

            return (
              <div
                key={item.id}
                style={{
                  background: isOverBudget ? "rgba(244, 63, 94, 0.1)" : "var(--bg-card)",
                  border: isOverBudget ? "1px solid rgba(244, 63, 94, 0.4)" : "1px solid var(--border)",
                  borderRadius: "14px",
                  padding: "14px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  transition: "all 0.2s ease",
                }}
              >
                {/* Main Item Row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
                  <div className="cashflow-item-left">
                    <span className="cashflow-item-icon">{item.icon || icon}</span>
                    <div className="cashflow-item-name-box">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="cashflow-item-name">
                          {item.name}
                        </span>
                        {type === "inflow" && (item.category === "salary" || item.name?.toLowerCase().includes("salario") || item.name?.toLowerCase().includes("nómina")) && (
                          <span
                            style={{
                              background: itemTransactions.length > 0 ? "rgba(16, 185, 129, 0.15)" : (isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)"),
                              border: itemTransactions.length > 0 ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(245, 158, 11, 0.35)",
                              color: itemTransactions.length > 0 ? "#10b981" : (isLight ? "#d97706" : "#fbbf24"),
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "8px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {itemTransactions.length > 0 ? "✅ Consignado" : "⏳ Esperando Consignación"}
                          </span>
                        )}
                        {isOverBudget && (
                          <span
                            style={{
                              background: "rgba(244, 63, 94, 0.25)",
                              border: "1px solid #f43f5e",
                              color: "#ff6b81",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              padding: "2px 8px",
                              borderRadius: "8px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            ⚠️ Te pasaste por {formatMoney(overspendDelta, currency)}
                          </span>
                        )}
                      </div>

                      <span className="cashflow-item-sub">
                        {isOneTime ? (
                          <span style={{ color: "#00e5ff", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <span>⚡ Único ({item.targetPeriod || "Mes"})</span>
                            {item.paymentStatus === "pending" ? (
                              <span style={{ color: "#fbbf24" }}>• ⏳ Pendiente</span>
                            ) : (
                              <span style={{ color: "#10b981" }}>• ✅ Cobrado</span>
                            )}
                          </span>
                        ) : isAutoSynced ? (
                          <span
                            style={{
                              color: "#38bdf8",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              cursor: "pointer",
                            }}
                            onClick={() => handleAutoSyncedClick(item)}
                            title="Clic para más información sobre este cálculo automático"
                          >
                            <span>🔗</span>
                            <span>
                              {item.category === "passive_fixed" || item.linkedModule === "fixed_income"
                                ? "⚡ Renta Fija (Cuentas de Ahorro & CDTs)"
                                : "⚡ Dividendos Kpital Tech ETF"}
                            </span>
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {source.targetName && (
                              <span style={{ color: source.type === "credit_card" ? "#f43f5e" : source.type === "fixed_pocket" ? "#38bdf8" : "#94a3b8", fontWeight: 600 }}>
                                {sourceIcon} {source.targetName}
                                {source.type === "credit_card" && Number(source.installments) > 1 && !source.targetName.includes("cuota") && (
                                  <span style={{ color: "#00e5ff", marginLeft: 4 }}>
                                    • {source.installments} cuotas (0% MSI)
                                  </span>
                                )}
                              </span>
                            )}
                            {item.dueDate ? ` • Vence: ${item.dueDate}` : ""}
                            {item.targetAmount ? ` • Meta: ${formatMoney(item.targetAmount, currency)}` : ""}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="cashflow-item-right">
                    <div style={{ textAlign: "right" }}>
                      <div className="cashflow-item-amount" style={{ color: isZero ? "var(--text-muted)" : "var(--text-primary)" }}>
                        {formatMoney(itemAmt, currency)}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {type === "inflow" && (item.category === "salary" || item.name?.toLowerCase().includes("salario") || item.name?.toLowerCase().includes("nómina"))
                          ? itemTransactions.length > 0
                            ? `Real: ${formatMoney(totalGrossAmount, currency)}`
                            : "Esperado hoy"
                          : isZero
                          ? "($0 / Inactivo)"
                          : `${itemPctOfPillar}% del pilar`}
                      </div>
                    </div>

                    {/* If Auto-Synced: Show Protected Link Pill */}
                    {isAutoSynced ? (
                      <button
                        type="button"
                        onClick={() => handleAutoSyncedClick(item)}
                        title="Calculado automáticamente desde tus cuentas en Renta Fija / Portafolio"
                        style={{
                          background: "rgba(56, 189, 248, 0.12)",
                          border: "1px solid rgba(56, 189, 248, 0.3)",
                          borderRadius: "8px",
                          color: "#38bdf8",
                          cursor: "pointer",
                          padding: "4px 8px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span>🔗</span>
                        <span>Auto</span>
                      </button>
                    ) : (
                      <>
                        {/* Edit Button */}
                        {onEditItem && (
                          <button
                            type="button"
                            className="cashflow-item-action-btn edit"
                            onClick={() => onEditItem(item, type)}
                            title="Editar tope presupuestado o concepto"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#38bdf8",
                              cursor: "pointer",
                              padding: "5px",
                              fontSize: "0.9rem",
                              borderRadius: "6px",
                            }}
                          >
                            ✏️
                          </button>
                        )}

                        {/* Delete Button */}
                        <button
                          type="button"
                          className="cashflow-item-delete-btn"
                          onClick={() => handleDeleteItemClick(item)}
                          title="Eliminar este ítem"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Specific Concepts Sub-items Breakdown */}
                {Array.isArray(item.subItems) && item.subItems.length > 0 ? (
                  <div style={{ marginTop: 2 }}>
                    <button
                      type="button"
                      onClick={() => toggleSubItems(item.id)}
                      style={{
                        background: isLight ? "rgba(56, 189, 248, 0.08)" : "rgba(56, 189, 248, 0.12)",
                        border: "1px solid rgba(56, 189, 248, 0.28)",
                        color: isLight ? "#0284c7" : "#38bdf8",
                        fontSize: "0.74rem",
                        cursor: "pointer",
                        padding: "3px 9px",
                        borderRadius: "6px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontWeight: 600,
                      }}
                      title={expandedSubItems[item.id] ? "Ocultar desglose detallado" : "Ver desglose detallado de conceptos"}
                    >
                      <span>{expandedSubItems[item.id] ? "▲ Ocultar desglose" : `▼ Ver desglose (${item.subItems.length} conceptos)`}</span>
                    </button>

                    {expandedSubItems[item.id] && (
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          background: isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(0, 0, 0, 0.3)",
                          padding: "10px 12px",
                          borderRadius: "10px",
                          border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            📋 Conceptos especificados {type !== "inflow" && "(Marca ✓ al hacerlo efectivo)"}
                          </span>
                          {onEditItem && !isAutoSynced && (
                            <button
                              type="button"
                              onClick={() => onEditItem(item, type)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#38bdf8",
                                fontSize: "0.72rem",
                                cursor: "pointer",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              ✏️ Editar conceptos
                            </button>
                          )}
                        </div>

                        {item.subItems.map((sub, sIdx) => {
                          const subAmt = Number(sub.amount) || 0;
                          const subPct = Number(itemAmt) > 0 ? ((subAmt / Number(itemAmt)) * 100).toFixed(0) : 0;
                          const subKey = sub.id || `sub_${sIdx}_${sub.name}`;
                          const matchedSubTx = itemTransactions.find(
                            (tx) =>
                              (sub.id && tx.subItemId === sub.id) ||
                              tx.subItemId === subKey ||
                              (sub.name && tx.subItemName?.toLowerCase() === sub.name.toLowerCase()) ||
                              (sub.name && tx.description?.toLowerCase() === `${item.name}: ${sub.name}`.toLowerCase())
                          );
                          const isSubEffective = Boolean(matchedSubTx);

                          return (
                            <div
                              key={subKey}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "0.78rem",
                                padding: "5px 6px",
                                borderRadius: "6px",
                                background: isSubEffective
                                  ? isLight
                                    ? "rgba(16, 185, 129, 0.08)"
                                    : "rgba(16, 185, 129, 0.1)"
                                  : "transparent",
                                borderBottom: sIdx < item.subItems.length - 1 ? (isLight ? "1px solid rgba(0,0,0,0.05)" : "1px solid rgba(255,255,255,0.05)") : "none",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <label
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  cursor: type !== "inflow" && onSaveTransaction ? "pointer" : "default",
                                  color: isSubEffective ? "#10b981" : "var(--text-primary)",
                                  fontWeight: isSubEffective ? 600 : 500,
                                }}
                                title={
                                  isSubEffective
                                    ? "Desmarcar para revertir el descuento automático"
                                    : "Marcar como efectivo para descontarlo automáticamente del disponible"
                                }
                              >
                                {type !== "inflow" && onSaveTransaction && (
                                  <input
                                    type="checkbox"
                                    checked={isSubEffective}
                                    onChange={() => handleToggleSubItemEffective(item, sub, subKey, matchedSubTx)}
                                    style={{
                                      width: 15,
                                      height: 15,
                                      cursor: "pointer",
                                      accentColor: "#10b981",
                                    }}
                                  />
                                )}
                                <span style={{ textDecoration: isSubEffective ? "line-through" : "none", opacity: isSubEffective ? 0.9 : 1 }}>
                                  {sub.name}
                                </span>
                                {isSubEffective && (
                                  <span
                                    style={{
                                      fontSize: "0.66rem",
                                      background: "rgba(16, 185, 129, 0.2)",
                                      color: "#10b981",
                                      padding: "1px 6px",
                                      borderRadius: "4px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    ✓ Efectivo
                                  </span>
                                )}
                              </label>

                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                  ({subPct}%)
                                </span>
                                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: isSubEffective ? "#10b981" : isLight ? "#0f172a" : "#f8fafc" }}>
                                  {formatMoney(subAmt, currency)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  !isAutoSynced && onEditItem && (
                    <div style={{ marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => onEditItem(item, type)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          padding: "2px 0",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          opacity: 0.8,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
                        title="Dividir este gasto/ahorro en conceptos individuales con sus propios valores"
                      >
                        <span>➕ Dividir en conceptos específicos</span>
                      </button>

                      {type !== "inflow" && onSaveTransaction && Number(itemAmt) > 0 && (() => {
                        const matchedFullTx = itemTransactions.find(
                          (tx) => tx.isAutoFullItemCheck || Number(tx.amount) === Number(itemAmt)
                        );
                        const isFullEffective = Boolean(matchedFullTx);
                        return (
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              cursor: "pointer",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: isFullEffective ? "#10b981" : "var(--text-secondary)",
                              background: isFullEffective ? "rgba(16, 185, 129, 0.12)" : "transparent",
                              border: isFullEffective ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid var(--border)",
                              padding: "2px 8px",
                              borderRadius: "6px",
                            }}
                            title="Marcar o desmarcar como efectivo para descontarlo automáticamente del disponible del mes"
                          >
                            <input
                              type="checkbox"
                              checked={isFullEffective}
                              onChange={() => handleToggleFullItemEffective(item, itemAmt, matchedFullTx)}
                              style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#10b981" }}
                            />
                            <span>{isFullEffective ? "✓ Efectivo descontado" : "Hacer efectivo"}</span>
                          </label>
                        );
                      })()}
                    </div>
                  )
                )}

                {/* Real Spending vs. Budget Envelope Track (For Needs, Wants & Wealth) */}
                {type !== "inflow" && (
                  <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "#94a3b8", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
                      <span>
                        {type === "wealth" ? "Aportado / Invertido Real: " : "Gastado Personal: "}
                        <strong style={{ color: isOverBudget ? "#f43f5e" : type === "wealth" && spentAmount > 0 ? "#38bdf8" : "#f1f5f9" }}>
                          {formatMoney(spentAmount, currency)}
                        </strong>
                      </span>
                      <span>
                        {type === "wealth" ? (
                          spentAmount >= Number(itemAmt) && Number(itemAmt) > 0 ? (
                            <span style={{ color: "#10b981", fontWeight: 700 }}>✅ Meta Cumplida 100%</span>
                          ) : (
                            <span style={{ color: "#38bdf8" }}>
                              Pendiente por Transferir: <strong>{formatMoney(remainingBudget, currency)}</strong>
                            </span>
                          )
                        ) : isOverBudget ? (
                          <strong style={{ color: "#f43f5e" }}>Tope excedido ({budgetUsedPct}%)</strong>
                        ) : (
                          <span style={{ color: "#10b981" }}>
                            Disponible: <strong>{formatMoney(remainingBudget, currency)}</strong> ({100 - budgetUsedPct}%)
                          </span>
                        )}
                      </span>
                    </div>

                    {type === "wealth" && spentAmount === 0 && (
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
                        <span>💡 Aún en tu cuenta de nómina (no ha salido hasta que hagas la transferencia).</span>
                        {onOpenAddExpenseModal && (
                          <button
                            type="button"
                            onClick={() => onOpenAddExpenseModal(item)}
                            style={{
                              background: "rgba(56, 189, 248, 0.15)",
                              border: "1px solid rgba(56, 189, 248, 0.35)",
                              color: "#38bdf8",
                              borderRadius: "6px",
                              padding: "2px 8px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            ⚡ Transferir / Registrar Aporte
                          </button>
                        )}
                      </div>
                    )}

                    {totalRepaidAmount > 0 && (
                      <div style={{ fontSize: "0.7rem", color: "#10b981", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <span>🌱</span>
                        <span>
                          <strong>+{formatMoney(totalRepaidAmount, currency)}</strong> liberados de este rubro por cobros de deuda recibidos
                        </span>
                      </div>
                    )}
                    {totalPendingLoanAmount > 0 && (
                      <div style={{ fontSize: "0.7rem", color: "#f59e0b", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                        <span>⏳</span>
                        <span>
                          <strong>{formatMoney(totalPendingLoanAmount, currency)}</strong> pendiente por cobrar (al recibirlo, tu gasto neto será {formatMoney(purePersonalSpent, currency)})
                        </span>
                      </div>
                    )}

                    {/* Progress Bar of Budget Used / Wealth Contributed */}
                    <div className="cashflow-pillar-progress-track" style={{ height: "5px" }}>
                      <div
                        className="cashflow-pillar-progress-fill"
                        style={{
                          width: `${Math.min(100, Number(budgetUsedPct))}%`,
                          background: isOverBudget ? "#f43f5e" : type === "wealth" ? "#38bdf8" : Number(budgetUsedPct) > 80 ? "#fbbf24" : color,
                          boxShadow: isOverBudget ? "0 0 8px rgba(244, 63, 94, 0.8)" : `0 0 6px ${color}66`,
                        }}
                      />
                    </div>

                    {/* Expand/Collapse Transactions Toggle */}
                    {itemTransactions.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#38bdf8",
                            fontSize: "0.74rem",
                            cursor: "pointer",
                            padding: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <span>{isExpanded ? "▲ Ocultar transacciones" : `▼ Ver ${itemTransactions.length} gasto(s) registrado(s)`}</span>
                        </button>

                        {/* List of Transactions */}
                        {isExpanded && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, background: "rgba(0,0,0,0.35)", padding: "8px 10px", borderRadius: "10px" }}>
                            {itemTransactions.map((tx) => {
                              const isLoan = Boolean(tx.isLoan);
                              const loanAmt = isLoan ? (Number(tx.loanAmount) > 0 ? Number(tx.loanAmount) : Number(tx.amount)) : 0;
                              const personalCost = Math.max(0, (Number(tx.amount) || 0) - loanAmt);
                              const isSettled = tx.loanStatus === "settled";

                              return (
                                <div
                                  key={tx.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: "0.75rem",
                                    color: "var(--text-primary)",
                                    background: isLoan
                                      ? isSettled
                                        ? "rgba(16, 185, 129, 0.08)"
                                        : "rgba(245, 158, 11, 0.08)"
                                      : "transparent",
                                    padding: isLoan ? "6px 8px" : "3px 0",
                                    borderRadius: isLoan ? "6px" : "0",
                                    border: isLoan
                                      ? isSettled
                                        ? "1px solid rgba(16, 185, 129, 0.25)"
                                        : "1px solid rgba(245, 158, 11, 0.3)"
                                      : "none",
                                  }}
                                >
                                  <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <span style={{ fontWeight: 600 }}>{tx.description}</span>
                                      {isLoan && (
                                        <span
                                          style={{
                                            fontSize: "0.68rem",
                                            background: isSettled ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
                                            color: isSettled ? "#6ee7b7" : "#fcd34d",
                                            padding: "1px 6px",
                                            borderRadius: "4px",
                                            fontWeight: 700,
                                          }}
                                        >
                                          {isSettled
                                            ? "✔️ Cobrado"
                                            : `🤝 Préstamo: ${formatMoney(loanAmt, currency)} (${tx.loanRecipient || "Amigo"})`}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: 2 }}>
                                      {tx.date || "Fecha"} • {tx.paymentSource?.targetName || "Nómina"}
                                      {isLoan && personalCost > 0 && (
                                        <span style={{ color: "#38bdf8", marginLeft: 6 }}>
                                          • Tu consumo real: <strong>{formatMoney(personalCost, currency)}</strong>
                                        </span>
                                      )}
                                      {isLoan && personalCost === 0 && (
                                        <span style={{ color: "#10b981", marginLeft: 6 }}>
                                          • 100% Préstamo (no afecta tu tope)
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <strong style={{ fontFamily: "JetBrains Mono, monospace", color: isLoan && !isSettled ? "#f59e0b" : "var(--text-primary)" }}>
                                      {formatMoney(tx.amount, currency)}
                                    </strong>

                                    {isLoan && !isSettled && onSettleTransaction && (
                                      <button
                                        type="button"
                                        onClick={() => onSettleTransaction(tx)}
                                        style={{
                                          background: "rgba(16,185,129,0.15)",
                                          border: "1px solid #10b981",
                                          color: "#10b981",
                                          cursor: "pointer",
                                          fontSize: "0.7rem",
                                          padding: "2px 6px",
                                          borderRadius: "4px",
                                          fontWeight: 700,
                                        }}
                                        title="Registrar cobro / abono de este préstamo"
                                      >
                                        ✅ Cobrar
                                      </button>
                                    )}

                                    {onEditTransaction && (
                                      <button
                                        type="button"
                                        onClick={() => onEditTransaction(tx)}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#38bdf8",
                                          cursor: "pointer",
                                          fontSize: "0.75rem",
                                          padding: "2px",
                                        }}
                                        title="Editar este gasto o préstamo"
                                      >
                                        ✏️
                                      </button>
                                    )}

                                    {onDeleteTransaction && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteTransactionClick(tx)}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#64748b",
                                          cursor: "pointer",
                                          fontSize: "0.75rem",
                                          padding: "2px",
                                        }}
                                        title="Eliminar este gasto"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

          {/* Add New Item Button */}
          <button
            type="button"
            className="cashflow-add-btn"
            onClick={() => onAddItem(type)}
          >
            <span>+</span> Agregar a {title}
          </button>
        </>
      )}
    </div>
  );
}
