import React, { useState, useMemo } from "react";
import { formatCashFlowMoney, sortMovementsByDateTimeDesc } from "../../utils/cashFlowFormatters";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import LoanSettlementModal from "./LoanSettlementModal";
import AssignMovementModal from "./AssignMovementModal";
import InfoTooltip from "../Common/InfoTooltip";
import { toastConfirm, toastPrompt } from "../../utils/toastAlerts";
import { useTheme } from "../../context/ThemeContext";
import { useCashFlowStore } from "../../store/cashFlowStore";
import "./CashFlow.css";

export default function ExpensesLogSection({
  expensesLog = [],
  creditCardPayments = [],
  activePeriod,
  currency = "COP",
  fxRate = 4150,
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", icon: "💜" },
  creditCards = [],
  debts = [],
  budgetItems = [],
  fixedIncomeAccounts = [],
  onOpenExpenseModal,
  onEditTransaction,
  onOpenPaymentModal,
  onSaveTransaction,
  onDeleteTransaction,
  onDeletePayment,
  onConfirmSettlement,
  onUpdateSplit,
  onRevertParticipant,
  onToggleExpenseLoan,
  onConvertExpenseToCardPayment,
  onReclassifyMovement,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const [filterSource, setFilterSource] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDatePreset, setFilterDatePreset] = useState("all");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [settlingTransaction, setSettlingTransaction] = useState(null);
  const [assignModalItem, setAssignModalItem] = useState(null);
  const [expandedDeductions, setExpandedDeductions] = useState({});
  const toggleDeductions = (id) => setExpandedDeductions((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleMovementAsBudgetInflow = useCashFlowStore((s) => s.toggleMovementAsBudgetInflow);

  const isAnyFilterActive = Boolean(
    filterSource !== "all" ||
    searchQuery.trim() !== "" ||
    filterCategory !== "all" ||
    filterDatePreset !== "all" ||
    filterDateStart ||
    filterDateEnd
  );

  const handleClearAllFilters = () => {
    setFilterSource("all");
    setSearchQuery("");
    setFilterCategory("all");
    setFilterDatePreset("all");
    setFilterDateStart("");
    setFilterDateEnd("");
  };

  const handleDeleteTransaction = async (item) => {
    const title = item.description || "este movimiento";
    const ok = await toastConfirm(`¿Estás seguro de que deseas eliminar "${title}" por ${formatMoney(item.amount, currency)}?`);
    if (ok && onDeleteTransaction) {
      onDeleteTransaction(item.id);
    }
  };

  const handleDeleteCardPayment = async (item) => {
    const cardTitle = item.cardName || "tarjeta";
    const ok = await toastConfirm(`¿Estás seguro de que deseas eliminar el abono a "${cardTitle}" por ${formatMoney(item.amount, currency)}?`);
    if (ok && onDeletePayment) {
      onDeletePayment(item.id);
    }
  };

  const formatMovementDateTime = (item) => {
    const d = item.date || item.createdAt?.slice(0, 10) || "";
    let timeStr = item.time || "";

    if (!timeStr && item.createdAt) {
      try {
        const dt = new Date(item.createdAt);
        if (!isNaN(dt.getTime())) {
          timeStr = dt.toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
        }
      } catch {}
    } else if (timeStr && timeStr.includes(":")) {
      const parts = timeStr.split(":");
      let h = parseInt(parts[0], 10);
      const m = parts[1]?.slice(0, 2) || "00";
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      timeStr = `${h}:${m} ${ampm}`;
    }

    return { date: d, time: timeStr };
  };

  const periodExpenses = useMemo(() => {
    return (expensesLog || [])
      .filter((tx) => !tx.period || tx.period === activePeriod)
      .map((tx) => {
        const isIncome = tx.type === "credit" || tx.budgetItemType === "income";
        const isWealth = (tx.budgetItemType === "wealth" || tx.budgetItemId?.startsWith("wealth_")) && !isIncome;
        return {
          ...tx,
          itemType: isIncome ? "income" : isWealth ? "wealth_saving" : "expense",
        };
      });
  }, [expensesLog, activePeriod]);

  // Sub-items resulting from credit card multi-rubro split distribution are deductions,
  // NOT standalone movements. The only true primary movement is the credit card payment.
  // Deductions from distributed movements (cards, debts, or multi-envelope splits) are shown nested in the parent movement
  const isSplitDeductionChild = (tx) => Boolean(
    tx.isSplitChild ||
    tx.splitParentId ||
    tx.isCreditCardPayoff ||
    tx.creditCardPaymentId ||
    (tx.cardId && tx.id && String(tx.id).includes("_split_")) ||
    (tx.description && String(tx.description).toLowerCase().includes("descontado de") && !tx.isDistributed)
  );

  const standaloneExpenses = useMemo(() => {
    return periodExpenses.filter((tx) => !isSplitDeductionChild(tx));
  }, [periodExpenses]);

  const periodPayments = useMemo(() => {
    return (creditCardPayments || [])
      .filter((p) => !p.period || p.period === activePeriod)
      .map((p) => {
        let deductions = Array.isArray(p.budgetDeductions) && p.budgetDeductions.length > 0
          ? p.budgetDeductions
          : [];

        // If not stored in p.budgetDeductions, find any split child expenses in expensesLog matching this payment
        if (deductions.length === 0 && (p.description?.includes("Distribuido en") || p.notes?.includes("Distribuido"))) {
          const matchingChildren = (expensesLog || []).filter(
            (e) =>
              (e.creditCardPaymentId === p.id ||
                (e.isCreditCardPayoff && (e.cardId === p.cardId || !e.cardId))) &&
              (!e.period || e.period === activePeriod)
          );
          if (matchingChildren.length > 0) {
            deductions = matchingChildren.map((c) => ({
              budgetItemId: c.budgetItemId,
              budgetItemName: c.budgetItemName,
              budgetItemType: c.budgetItemType,
              amount: Number(c.amount),
              isEmergencySavingsDeduction: c.budgetItemType === "wealth" || c.budgetItemId?.startsWith("wealth_"),
            }));
          }
        }

        return {
          ...p,
          itemType: "card_payment",
          budgetDeductions: deductions,
        };
      });
  }, [creditCardPayments, expensesLog, activePeriod]);

  // Combined sorted activity feed: Standalone movements + Card Payments (no duplicate split children)
  // Always strictly sorted by date & time from most recent to oldest
  const combinedActivities = useMemo(() => {
    const combined = [...standaloneExpenses, ...periodPayments];
    return sortMovementsByDateTimeDesc(combined);
  }, [standaloneExpenses, periodPayments]);

  const pendingLoans = useMemo(() => {
    return standaloneExpenses.filter((tx) => tx.isLoan && tx.loanStatus !== "settled");
  }, [standaloneExpenses]);

  const totalPendingLoansAmt = useMemo(() => {
    return pendingLoans.reduce((acc, tx) => acc + (Number(tx.loanAmount) || Number(tx.amount) || 0), 0);
  }, [pendingLoans]);

  const filteredActivities = useMemo(() => {
    return combinedActivities.filter((item) => {
      // 1. Source / Nature pill filter
      if (filterSource === "only_loans" && !item.isLoan) return false;
      if (filterSource === "only_expenses" && (item.itemType !== "expense" || item.isLoan)) return false;
      if (filterSource === "only_incomes" && item.itemType !== "income") return false;
      if (filterSource === "only_wealth") {
        const isW = item.itemType === "wealth_saving" || (item.itemType === "card_payment" && (item.budgetDeductions || []).some((d) => d.budgetItemType === "wealth" || d.budgetItemId?.startsWith("wealth_")));
        if (!isW) return false;
      }
      if (filterSource === "only_payments" && item.itemType !== "card_payment") return false;
      if (filterSource === "payroll") {
        const isPay = ((item.itemType === "expense" || item.itemType === "wealth_saving" || item.itemType === "income") && (!item.paymentSource || item.paymentSource.type === "payroll")) ||
          (item.itemType === "card_payment" && (!item.sourceType || item.sourceType === "payroll"));
        if (!isPay) return false;
      }
      if (filterSource === "credit_card") {
        const isCC = (item.itemType === "expense" && item.paymentSource?.type === "credit_card") || (item.itemType === "card_payment");
        if (!isCC) return false;
      }
      if (filterSource === "fixed_pocket") {
        const isPoc = ((item.itemType === "expense" || item.itemType === "wealth_saving") && item.paymentSource?.type === "fixed_pocket") || (item.itemType === "card_payment" && item.sourceType === "fixed_pocket");
        if (!isPoc) return false;
      }
      if (filterSource === "investment_cash") {
        const isInv = ((item.itemType === "expense" || item.itemType === "wealth_saving") && item.paymentSource?.type === "investment_cash") || (item.paymentSource?.type === "investment_cash");
        if (!isInv) return false;
      }
      if (filterSource === "cash") {
        const isCash = item.paymentSource?.type === "cash" || (item.paymentSource?.targetName || "").toLowerCase().includes("efectivo") || (item.settlements || []).some((s) => s.targetType === "cash");
        if (!isCash) return false;
      }

      // 2. Category / Envelope filter
      if (filterCategory !== "all") {
        if (filterCategory === "unassigned") {
          if (item.budgetItemId || item.isLoan || item.itemType === "card_payment") return false;
        } else if (filterCategory === "loans") {
          if (!item.isLoan && !item.isDebtPayment && !item.isDebtCollection) return false;
        } else {
          const matchesEnv = item.budgetItemId === filterCategory || (Array.isArray(item.budgetDeductions) && item.budgetDeductions.some((d) => d.budgetItemId === filterCategory));
          if (!matchesEnv) return false;
        }
      }

      // 3. Date range filter
      const itemDate = item.date || item.createdAt?.slice(0, 10) || "";
      if (filterDatePreset === "today") {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (itemDate !== todayStr) return false;
      } else if (filterDatePreset === "last7") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const limitStr = sevenDaysAgo.toISOString().slice(0, 10);
        if (itemDate < limitStr) return false;
      } else if (filterDatePreset === "this_month") {
        const monthPrefix = activePeriod || new Date().toISOString().slice(0, 7);
        if (!itemDate.startsWith(monthPrefix)) return false;
      } else if (filterDatePreset === "custom" || filterDateStart || filterDateEnd) {
        if (filterDateStart && itemDate < filterDateStart) return false;
        if (filterDateEnd && itemDate > filterDateEnd) return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = (item.description || "").toLowerCase().includes(q);
        const catMatch = (item.budgetItemName || "").toLowerCase().includes(q);
        const subMatch = (item.subItemName || "").toLowerCase().includes(q);
        const noteMatch = (item.note || item.notes || "").toLowerCase().includes(q);
        const cardMatch = (item.cardName || item.paymentSource?.targetName || "").toLowerCase().includes(q);
        const amtMatch = String(item.amount || "").includes(q) || String(Math.round(item.amount || 0)).includes(q);
        const partMatch = Array.isArray(item.participants) && item.participants.some((p) => (p.name || "").toLowerCase().includes(q));
        const dedMatch = Array.isArray(item.budgetDeductions) && item.budgetDeductions.some((d) => (d.budgetItemName || "").toLowerCase().includes(q));

        if (!descMatch && !catMatch && !subMatch && !noteMatch && !cardMatch && !amtMatch && !partMatch && !dedMatch) {
          return false;
        }
      }

      return true;
    });
  }, [combinedActivities, filterSource, filterCategory, filterDatePreset, filterDateStart, filterDateEnd, searchQuery, activePeriod]);

  // Only outflows actually executed from Payroll (Debit) account affect Saldo en Nómina.
  // Outflows from Cajitas (fixed_pocket), Credit Cards, or external savings do not touch Nómina.
  const isPayrollOutflow = (item) => {
    const ps = item.paymentSource || {};
    const srcType = ps.type || item.sourceType;
    const targetId = ps.targetId;
    if (targetId && targetId !== "acc_nu_debito" && targetId !== "nu" && targetId !== "payroll") {
      return false;
    }
    return srcType === "payroll" || (!srcType && (!targetId || targetId === "acc_nu_debito"));
  };

  const matchedPayrollAccount = useMemo(() => {
    return (fixedIncomeAccounts || []).find(
      (a) =>
        (payrollAccount?.id && a.id === payrollAccount.id) ||
        a.accountCategory === "payroll" ||
        (a.name || "").toLowerCase().includes("nomina") ||
        (a.name || "").toLowerCase().includes("nómina") ||
        (a.name || "").toLowerCase().includes("nu débito") ||
        (a.name || "").toLowerCase().includes("nu debito")
    );
  }, [fixedIncomeAccounts, payrollAccount]);

  const totalSpentInPeriod = standaloneExpenses
    .filter((tx) => tx.itemType === "expense")
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalSpentFromPayroll = standaloneExpenses
    .filter((tx) => tx.itemType === "expense" && isPayrollOutflow(tx))
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalIncomeInPeriod = standaloneExpenses
    .filter((tx) => tx.itemType === "income")
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalSavedInPeriod = standaloneExpenses
    .filter((tx) => tx.itemType === "wealth_saving")
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalSavedFromPayroll = standaloneExpenses
    .filter((tx) => tx.itemType === "wealth_saving" && isPayrollOutflow(tx))
    .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

  const totalPaidToCards = periodPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const totalPaidToCardsFromPayroll = periodPayments
    .filter((p) => isPayrollOutflow(p))
    .reduce((acc, p) => {
      // If payment had deductions covered by high-yield savings (Cajitas), don't double-charge Nómina
      const savingsDeduction = (p.budgetDeductions || [])
        .filter((d) => d.isEmergencySavingsDeduction || d.budgetItemType === "wealth" || d.budgetItemId?.startsWith("wealth_"))
        .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      return acc + Math.max(0, (Number(p.amount) || 0) - savingsDeduction);
    }, 0);

  const payrollNetBalance =
    totalIncomeInPeriod - totalSpentFromPayroll - totalSavedFromPayroll - totalPaidToCardsFromPayroll;

  const payrollAvailableBalance = matchedPayrollAccount && matchedPayrollAccount.balance !== undefined
    ? Number(matchedPayrollAccount.balance) || 0
    : payrollNetBalance;

  const payrollCount = useMemo(() => {
    return combinedActivities.filter(
      (i) =>
        ((i.itemType === "expense" || i.itemType === "wealth_saving" || i.itemType === "income") && (!i.paymentSource || i.paymentSource.type === "payroll")) ||
        (i.itemType === "card_payment" && (!i.sourceType || i.sourceType === "payroll"))
    ).length;
  }, [combinedActivities]);

  const creditCardCount = useMemo(() => {
    return combinedActivities.filter(
      (i) =>
        (i.itemType === "expense" && i.paymentSource?.type === "credit_card") ||
        (i.itemType === "card_payment")
    ).length;
  }, [combinedActivities]);

  const pocketCount = useMemo(() => {
    return combinedActivities.filter(
      (i) =>
        ((i.itemType === "expense" || i.itemType === "wealth_saving") && i.paymentSource?.type === "fixed_pocket") ||
        (i.itemType === "card_payment" && i.sourceType === "fixed_pocket")
    ).length;
  }, [combinedActivities]);

  const brokerCount = useMemo(() => {
    return combinedActivities.filter(
      (i) =>
        ((i.itemType === "expense" || i.itemType === "wealth_saving") && i.paymentSource?.type === "investment_cash") ||
        (i.paymentSource?.type === "investment_cash")
    ).length;
  }, [combinedActivities]);

  const cashWalletAccount = useMemo(() => {
    return (fixedIncomeAccounts || []).find(
      (a) => a.accountCategory === "cash" || (a.name || "").toLowerCase().includes("efectivo") || (a.name || "").toLowerCase().includes("billetera")
    );
  }, [fixedIncomeAccounts]);

  const cashWalletBalance = useMemo(() => {
    // 1. Cash Inflows:
    // a) Retiros o transferencias desde bancos/nómina hacia Efectivo (Billetera)
    const cashWithdrawals = standaloneExpenses
      .filter((tx) => {
        if (tx.itemType === "income") return false;
        return (
          tx.destinationAccountId === "acc_cash_wallet" ||
          tx.destinationAccountId === "acc_efectivo_fisico" ||
          (tx.destinationAccountName || "").toLowerCase().includes("efectivo") ||
          (tx.budgetItemName || "").toLowerCase().includes("retiro a efectivo") ||
          (tx.description || "").toLowerCase().includes("retiro a efectivo")
        );
      })
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

    // b) Ingresos y cobros directos en efectivo
    const cashIncomes = standaloneExpenses
      .filter((tx) => {
        if (tx.itemType !== "income") return false;
        const srcType = tx.paymentSource?.type;
        const targetName = (tx.paymentSource?.targetName || "").toLowerCase();
        return srcType === "cash" || targetName.includes("efectivo") || targetName.includes("billetera");
      })
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

    // c) Cobros en efectivo registrados en settlements de préstamos
    let cashSettlements = 0;
    standaloneExpenses.forEach((tx) => {
      if (Array.isArray(tx.settlements)) {
        tx.settlements.forEach((s) => {
          const isCash =
            s.targetType === "cash" ||
            s.targetId === "acc_cash_wallet" ||
            s.targetId === "acc_efectivo_fisico" ||
            (s.targetName || "").toLowerCase().includes("efectivo") ||
            (s.paymentMethod || "").toLowerCase().includes("efectivo");
          if (isCash) {
            cashSettlements += Number(s.amount) || 0;
          }
        });
      }
    });

    // 2. Cash Outflows (gastos pagados en efectivo físico)
    const cashExpenses = standaloneExpenses
      .filter((tx) => {
        if (tx.itemType === "income") return false;
        const isTransfer =
          tx.destinationAccountId === "acc_cash_wallet" ||
          tx.destinationAccountId === "acc_efectivo_fisico" ||
          (tx.destinationAccountName || "").toLowerCase().includes("efectivo");
        if (isTransfer) return false;

        const srcType = tx.paymentSource?.type;
        const targetName = (tx.paymentSource?.targetName || "").toLowerCase();
        return srcType === "cash" || targetName.includes("efectivo") || targetName.includes("billetera");
      })
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

    // Si ya existe un movimiento de ingreso en efectivo para los cobros, no duplicar con cashSettlements
    const totalCashIn = cashWithdrawals + Math.max(cashIncomes, cashSettlements);
    const dynamicNet = Math.max(0, totalCashIn - cashExpenses);

    const staticBase = Number(cashWalletAccount?.balance || 0);
    return dynamicNet > 0 ? dynamicNet : staticBase;
  }, [standaloneExpenses, cashWalletAccount]);

  const cashCount = useMemo(() => {
    return combinedActivities.filter(
      (i) =>
        i.paymentSource?.type === "cash" ||
        (i.paymentSource?.targetName || "").toLowerCase().includes("efectivo") ||
        (i.settlements || []).some((s) => s.targetType === "cash")
    ).length;
  }, [combinedActivities]);

  const filterButtons = useMemo(() => [
    { id: "all", label: `Todos los Movimientos (${combinedActivities.length})`, group: "nature" },
    { id: "only_expenses", label: `💸 Gastos Reales (${standaloneExpenses.filter(i => i.itemType === "expense" && !i.isLoan).length})`, group: "nature" },
    { id: "only_incomes", label: `📥 Ingresos (${standaloneExpenses.filter(i => i.itemType === "income").length})`, group: "nature" },
    { id: "only_payments", label: `💵 Abonos a Tarjetas (${periodPayments.length})`, group: "nature" },
    { id: "only_loans", label: `🤝 Préstamos por Cobrar ${pendingLoans.length > 0 ? `(${pendingLoans.length})` : ""}`, group: "nature" },
    { id: "only_wealth", label: `💎 Aportes CDTs/Ahorro (${combinedActivities.filter(i => i.itemType === "wealth_saving" || (i.itemType === "card_payment" && (i.budgetDeductions || []).some(d => d.budgetItemType === "wealth" || d.budgetItemId?.startsWith("wealth_")))).length})`, group: "nature" },
    { id: "payroll", label: `🏦 Nómina (${payrollCount})`, group: "source" },
    { id: "credit_card", label: `💳 Tarjeta de Crédito (${creditCardCount})`, group: "source" },
    { id: "fixed_pocket", label: `📦 Cuentas de Ahorro / Renta Fija (${pocketCount})`, group: "source" },
    { id: "investment_cash", label: `🚀 Broker (${brokerCount})`, group: "source" },
    ...(cashWalletAccount || cashCount > 0 ? [{ id: "cash", label: `💵 Efectivo (${cashCount})`, group: "source" }] : []),
  ], [combinedActivities, standaloneExpenses, periodPayments, pendingLoans, payrollCount, creditCardCount, pocketCount, brokerCount, cashWalletAccount, cashCount]);

  return (
    <div className="cashflow-expenses-section">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 10 }}>
            <span>📋</span> Historial de Gastos Reales, Ahorro & Abonos ({activePeriod})
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Transacciones de nómina: gastos de vida, transferencias a CDTs o cuentas de ahorro y abonos de deuda de tarjetas.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "space-between", width: "100%", maxWidth: "100%" }}>
          <div style={{ display: "flex", gap: "10px 18px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Saldo Actual Disponible en Nómina */}
            <div
              style={{
                minWidth: "135px",
                textAlign: "left",
                background: isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)",
                border: isLight ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(16, 185, 129, 0.4)",
                borderRadius: "10px",
                padding: "4px 10px",
              }}
            >
              <span style={{ fontSize: "0.72rem", color: "#10b981", display: "flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
                <span>🏦</span> Saldo en Nómina
                <InfoTooltip
                  text={`Saldo disponible real en cuenta Nu Débito (${formatMoney(payrollAvailableBalance, currency)}). Flujo neto de nómina registrado en el período: ${payrollNetBalance >= 0 ? '+' : ''}${formatMoney(payrollNetBalance, currency)}.`}
                />
              </span>
              <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.15rem", color: payrollAvailableBalance >= 0 ? "#10b981" : "#f43f5e" }}>
                {payrollAvailableBalance >= 0
                  ? `+${formatMoney(payrollAvailableBalance, currency)}`
                  : `-${formatMoney(Math.abs(payrollAvailableBalance), currency)}`}
              </strong>
            </div>

            {/* Saldo Actual en Efectivo Físico (Billetera) */}
            {(cashWalletAccount || cashWalletBalance > 0 || cashCount > 0) && (
              <div
                style={{
                  minWidth: "135px",
                  textAlign: "left",
                  background: isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.12)",
                  border: isLight ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(245, 158, 11, 0.4)",
                  borderRadius: "10px",
                  padding: "4px 10px",
                }}
              >
                <span style={{ fontSize: "0.72rem", color: "#f59e0b", display: "flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
                  <span>💵</span> Efectivo (Billetera)
                  <InfoTooltip
                    customContent={{
                      title: "Efectivo en Billetera Física",
                      tag: "Control de Efectivo",
                      tagColor: "#f59e0b",
                      explanation: "Representa el dinero físico en mano o en tu billetera. Incluye retiros a efectivo y cobros de préstamos recibidos en efectivo físico, descontando las compras pagadas en efectivo.",
                      rule: "Retiros y cobros de préstamos en efectivo aumentan este saldo; gastos en efectivo lo reducen."
                    }}
                  />
                </span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.15rem", color: "#f59e0b" }}>
                  +{formatMoney(cashWalletBalance, currency)}
                </strong>
              </div>
            )}

            {totalIncomeInPeriod > 0 && (
              <div style={{ minWidth: "105px", textAlign: "left" }}>
                <span style={{ fontSize: "0.72rem", color: "#10b981", display: "block" }}>📥 Total Ingresos</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#10b981" }}>
                  +{formatMoney(totalIncomeInPeriod, currency)}
                </strong>
              </div>
            )}

            <div style={{ minWidth: "105px", textAlign: "left" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Total Gastado Real</span>
              <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#f43f5e" }}>
                -{formatMoney(totalSpentInPeriod, currency)}
              </strong>
            </div>

            {totalPendingLoansAmt > 0 && (
              <div style={{ minWidth: "105px", textAlign: "left" }}>
                <span style={{ fontSize: "0.72rem", color: "#fcd34d", display: "block" }}>🤝 Préstamos por Cobrar</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#f59e0b" }}>
                  {formatMoney(totalPendingLoansAmt, currency)}
                </strong>
              </div>
            )}

            {totalSavedInPeriod > 0 && (
              <div style={{ minWidth: "105px", textAlign: "left" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Aporte a CDTs / Ahorro</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#38bdf8" }}>
                  -{formatMoney(totalSavedInPeriod, currency)}
                </strong>
              </div>
            )}

            {totalPaidToCards > 0 && (
              <div style={{ minWidth: "105px", textAlign: "left" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Abonos a Tarjetas</span>
                <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.1rem", color: "#10b981" }}>
                  -{formatMoney(totalPaidToCards, currency)}
                </strong>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onOpenPaymentModal && (
              <button
                type="button"
                className="cashflow-action-btn secondary"
                onClick={onOpenPaymentModal}
                style={{
                  fontSize: "0.8rem",
                  padding: "7px 12px",
                  borderColor: "rgba(16, 185, 129, 0.4)",
                  color: "#10b981",
                  background: "rgba(16, 185, 129, 0.12)",
                }}
              >
                <span>💵</span> Abonar Tarjeta
              </button>
            )}

            {onOpenExpenseModal && (
              <button
                type="button"
                className="cashflow-action-btn primary"
                onClick={onOpenExpenseModal}
                style={{ fontSize: "0.8rem", padding: "7px 14px" }}
              >
                <span>+</span> Registrar Movimiento
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Search & Filtering Bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
          alignItems: "center",
          background: isLight ? "#ffffff" : "var(--bg-card)",
          border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid var(--border)",
          borderRadius: "14px",
          padding: "10px 14px",
          boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.04)" : "none",
        }}
      >
        {/* Search input with 🔍 icon */}
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por concepto, comercio, amigo, monto..."
            style={{
              width: "100%",
              padding: "8px 30px 8px 32px",
              borderRadius: "8px",
              border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255,255,255,0.12)",
              background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)",
              color: "var(--text-primary)",
              fontSize: "0.8rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
              title="Borrar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category / Envelope Select */}
        <div style={{ flex: "0 1 180px", minWidth: 160 }}>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: "8px",
              border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255,255,255,0.12)",
              background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)",
              color: "var(--text-primary)",
              fontSize: "0.78rem",
              cursor: "pointer",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            <option value="all">📂 Todos los Rubros</option>
            <option value="unassigned">⚠️ Sin Asignar (Pendientes)</option>
            <option value="loans">👥 Préstamos / Vacas</option>
            {(budgetItems || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.icon || "🏷️"} {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Preset Select */}
        <div style={{ flex: "0 1 150px", minWidth: 140 }}>
          <select
            value={filterDatePreset}
            onChange={(e) => setFilterDatePreset(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: "8px",
              border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255,255,255,0.12)",
              background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)",
              color: "var(--text-primary)",
              fontSize: "0.78rem",
              cursor: "pointer",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            <option value="all">📅 Todo el Período</option>
            <option value="today">☀️ Solo Hoy</option>
            <option value="last7">⚡ Últimos 7 Días</option>
            <option value="this_month">🗓️ Este Mes ({activePeriod})</option>
            <option value="custom">🛠️ Rango Personalizado...</option>
          </select>
        </div>

        {/* Custom Date Inputs if 'custom' */}
        {filterDatePreset === "custom" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "1 1 230px" }}>
            <input
              type="date"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
              style={{
                padding: "6px 8px",
                borderRadius: "6px",
                border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255,255,255,0.12)",
                background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)",
                color: "var(--text-primary)",
                fontSize: "0.75rem",
              }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>a</span>
            <input
              type="date"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
              style={{
                padding: "6px 8px",
                borderRadius: "6px",
                border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255,255,255,0.12)",
                background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)",
                color: "var(--text-primary)",
                fontSize: "0.75rem",
              }}
            />
          </div>
        )}

        {/* Active count badge & Reset button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 600 }}>
            Mostrando <strong style={{ color: "var(--text-primary)" }}>{filteredActivities.length}</strong> de {combinedActivities.length}
          </span>
          {isAnyFilterActive && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              style={{
                padding: "5px 10px",
                borderRadius: "6px",
                background: isLight ? "#fee2e2" : "rgba(239, 68, 68, 0.15)",
                border: isLight ? "1px solid #fca5a5" : "1px solid rgba(239, 68, 68, 0.3)",
                color: isLight ? "#b91c1c" : "#f87171",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Restablecer todos los filtros"
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills with Visual Separation: Tipo vs Origen */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {filterButtons.map((f, idx) => {
          const isSourceStart = f.group === "source" && filterButtons[idx - 1]?.group === "nature";
          return (
            <React.Fragment key={f.id}>
              {isSourceStart && (
                <div
                  style={{
                    height: 20,
                    width: 1,
                    background: isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)",
                    margin: "0 4px",
                  }}
                  title="Separador: Cuenta / Origen"
                />
              )}
              <button
                type="button"
                onClick={() => setFilterSource(f.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: filterSource === f.id ? "1px solid var(--text-accent)" : "1px solid var(--border)",
                  background: filterSource === f.id ? "rgba(2, 132, 199, 0.15)" : "var(--bg-surface)",
                  color: filterSource === f.id ? "var(--text-accent)" : "var(--text-muted)",
                  fontSize: "0.78rem",
                  fontWeight: filterSource === f.id ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {f.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Transactions & Payments List */}
      {filteredActivities.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: "#64748b", fontSize: "0.85rem" }}>
          No hay movimientos registrados con este filtro en este período.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredActivities.map((item) => {
            const isDistributedExpense = Boolean(item.isDistributed) || (Array.isArray(item.budgetDeductions) && item.budgetDeductions.length > 0);
            const isPayment = item.itemType === "card_payment" || isDistributedExpense;
            const isWealth = item.itemType === "wealth_saving";

            if (isPayment) {
              const hasDeductions = Array.isArray(item.budgetDeductions) && item.budgetDeductions.length > 0;
              const hasWealthDeduction = hasDeductions && item.budgetDeductions.some(
                (d) => d.budgetItemType === "wealth" || d.budgetItemName?.toLowerCase().includes("ahorro") || d.budgetItemName?.toLowerCase().includes("renta") || d.budgetItemName?.toLowerCase().includes("invers")
              );
              const isExpanded = Boolean(expandedDeductions[item.id]);
              const isCard = item.itemType === "card_payment" || Boolean(item.cardName);
              const isDebt = Boolean(item.isDebt) || (item.description || "").toLowerCase().includes("deuda") || (item.description || "").toLowerCase().includes("mike");

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    background: isDebt
                      ? (isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.1)")
                      : (isLight ? "rgba(16, 185, 129, 0.05)" : "rgba(16, 185, 129, 0.08)"),
                    border: isDebt
                      ? "1px solid rgba(245, 158, 11, 0.4)"
                      : "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div className="expense-log-row-card" style={{ width: "100%" }}>
                    <div className="expense-log-row-left">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "1rem" }}>{isDebt ? "🤝" : isCard ? "💳" : "📋"}</span>
                        <strong className="expense-log-row-title">
                          {isCard ? `${item.cardName} • ${item.description || "Abono a tarjeta"}` : item.description}
                        </strong>
                        <span
                          style={{
                            background: isDebt ? "rgba(245, 158, 11, 0.2)" : "rgba(16, 185, 129, 0.2)",
                            border: isDebt ? "1px solid #f59e0b" : "1px solid #10b981",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            color: isDebt ? (isLight ? "#d97706" : "#fcd34d") : "#10b981",
                            fontWeight: 700,
                          }}
                        >
                          {isDebt ? "🤝 Abono a Deuda (Distribuido)" : isCard ? "✓ Abono / Libera Cupo" : "📋 Deducción Multi-Rubro"}
                        </span>
                        {isCard && (item.budgetDeductions || []).some((d) => d.budgetItemType === "wealth" || d.budgetItemId?.startsWith("wealth_")) && (
                          <span
                            style={{
                              background: "rgba(56, 189, 248, 0.15)",
                              border: "1px solid rgba(56, 189, 248, 0.4)",
                              padding: "2px 6px",
                              borderRadius: "6px",
                              fontSize: "0.68rem",
                              color: "#38bdf8",
                              fontWeight: 700,
                            }}
                            title="Este pago incluye deducción de metas de ahorro / inversión"
                          >
                            💎 Deducción Ahorro: ${(item.budgetDeductions || [])
                              .filter((d) => d.budgetItemType === "wealth" || d.budgetItemId?.startsWith("wealth_"))
                              .reduce((s, d) => s + Number(d.amount || 0), 0)
                              .toLocaleString("es-CO")} COP
                          </span>
                        )}
                        <span
                          style={{
                            background: "rgba(16, 185, 129, 0.12)",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            padding: "2px 6px",
                            borderRadius: "6px",
                            fontSize: "0.68rem",
                            color: "#10b981",
                            fontWeight: 700,
                          }}
                        >
                          📤 Salida (Abono)
                        </span>
                      </div>

                      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>📅 {formatMovementDateTime(item).date || "Fecha no especificada"}</span>
                        {formatMovementDateTime(item).time && (
                          <>
                            <span>•</span>
                            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>🕒 {formatMovementDateTime(item).time}</span>
                          </>
                        )}
                        <span>•</span>
                        <span style={{ color: "#38bdf8", fontWeight: 600 }}>
                          Pagado desde: {item.sourceAccount || item.paymentSource?.targetName || "Nómina Nu"}
                        </span>
                        {onReclassifyMovement && (
                          <>
                            <span>•</span>
                            <button
                              type="button"
                              onClick={() => setAssignModalItem(item)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#0ea5e9",
                                fontSize: "0.72rem",
                                cursor: "pointer",
                                padding: 0,
                                textDecoration: "underline",
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                              title="Distribuir este abono en varios rubros del mes o cambiar asignación"
                            >
                              <span>🏷️</span> Distribuir en Rubros / Reasignar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="expense-log-row-right">
                      <div className="expense-log-amount-actions">
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.05rem", fontWeight: 800, color: isDebt ? (isLight ? "#d97706" : "#f59e0b") : (isLight ? "#047857" : "#10b981") }}>
                          -{formatMoney(item.amount, currency)}
                        </span>
                        <div className="expense-log-action-btns">
                          {onEditTransaction && (
                            <button
                              type="button"
                              onClick={() => onEditTransaction(item)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#38bdf8",
                                cursor: "pointer",
                                padding: "4px",
                                fontSize: "0.85rem",
                              }}
                              title="Editar este pago de tarjeta"
                            >
                              ✏️
                            </button>
                          )}
                          {(isCard ? onDeletePayment : onDeleteTransaction) && (
                            <button
                              type="button"
                              onClick={() => isCard ? handleDeleteCardPayment(item) : handleDeleteTransaction(item)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--text-muted)",
                                cursor: "pointer",
                                padding: "4px",
                                fontSize: "0.85rem",
                              }}
                              title={isCard ? "Revertir este pago de tarjeta" : "Eliminar este movimiento distribuido"}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Integrated Distribution Sub-list ("parte de lista") - Collapsed by default */}
                  {hasDeductions && (
                    <div style={{ marginTop: 10, width: "100%" }}>
                      <div
                        onClick={() => toggleDeductions(item.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          color: isLight ? "#0284c7" : "#38bdf8",
                          cursor: "pointer",
                          padding: "4px 8px",
                          borderRadius: "6px",
                          background: isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(56, 189, 248, 0.12)",
                          border: isLight ? "1px solid rgba(2, 132, 199, 0.2)" : "1px solid rgba(56, 189, 248, 0.25)",
                          userSelect: "none",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>{isExpanded ? "▼" : "▶"}</span>
                        <span>
                          {isExpanded ? "Ocultar distribución" : "Ver distribución"} ({item.budgetDeductions.length} rubros)
                        </span>
                      </div>

                      {isExpanded && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            marginTop: 8,
                            padding: "8px 12px",
                            borderRadius: "10px",
                            background: isLight ? "rgba(241, 245, 249, 0.7)" : "rgba(10, 16, 30, 0.45)",
                            border: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {item.budgetDeductions.map((ded, idx) => {
                            const isWealthDeduction =
                              ded.budgetItemType === "wealth" ||
                              ded.budgetItemName?.toLowerCase().includes("ahorro") ||
                              ded.budgetItemName?.toLowerCase().includes("renta") ||
                              ded.budgetItemName?.toLowerCase().includes("invers");

                            return (
                              <div
                                key={idx}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "6px 10px",
                                  borderRadius: "7px",
                                  background: isWealthDeduction
                                    ? (isLight ? "rgba(56, 189, 248, 0.1)" : "rgba(56, 189, 248, 0.14)")
                                    : (isLight ? "#ffffff" : "rgba(15, 23, 42, 0.6)"),
                                  border: isWealthDeduction
                                    ? "1px solid rgba(56, 189, 248, 0.35)"
                                    : (isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid var(--border)"),
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: "0.95rem" }}>
                                    {isWealthDeduction ? "💎" : ded.budgetItemType === "needs" ? "🏠" : "🍿"}
                                  </span>
                                  <strong style={{ fontSize: "0.82rem", color: isWealthDeduction ? (isLight ? "#0284c7" : "#38bdf8") : "var(--text-primary)" }}>
                                    {ded.budgetItemName}
                                  </strong>
                                  {isWealthDeduction ? (
                                    <span
                                      style={{
                                        fontSize: "0.68rem",
                                        fontWeight: 800,
                                        color: isLight ? "#0284c7" : "#38bdf8",
                                        background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(56, 189, 248, 0.2)",
                                        border: "1px solid rgba(56, 189, 248, 0.4)",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      💎 Ahorro / Inversión
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: "0.68rem",
                                        color: "var(--text-muted)",
                                        background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
                                        padding: "1px 6px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      {ded.budgetItemType === "needs" ? "Gastos Fijos" : "Estilo de Vida"}
                                    </span>
                                  )}
                                </div>

                                <span
                                  style={{
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontSize: "0.85rem",
                                    fontWeight: 700,
                                    color: isWealthDeduction ? "#f59e0b" : (isLight ? "#0f172a" : "#f1f5f9"),
                                  }}
                                >
                                  -{formatMoney(ded.amount, currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            if (isWealth) {
              const isCardPayoffEmergency =
                item.isCreditCardPayoff ||
                Boolean(item.creditCardPaymentId) ||
                item.description?.toLowerCase().includes("pago") ||
                item.description?.toLowerCase().includes("descontado de");

              const cardBg = isLight ? "rgba(56, 189, 248, 0.05)" : "rgba(56, 189, 248, 0.08)";
              const cardBorder = isLight ? "1px solid rgba(56, 189, 248, 0.25)" : "1px solid rgba(56, 189, 248, 0.25)";
              const mainColor = isLight ? "#0284c7" : "#38bdf8";

              return (
                <div
                  key={item.id}
                  className="expense-log-row-card"
                  style={{
                    background: cardBg,
                    border: cardBorder,
                    borderRadius: "12px",
                    padding: "12px 16px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div className="expense-log-row-left">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1rem" }}>{isCardPayoffEmergency ? "💳" : "💎"}</span>
                      <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)", wordBreak: "break-word" }}>
                        {item.description}
                      </strong>
                      <span
                        style={{
                          background: isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(56, 189, 248, 0.15)",
                          border: `1px solid ${mainColor}`,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: mainColor,
                          fontWeight: 700,
                        }}
                      >
                        {item.budgetItemName} • Inversión / Ahorro
                      </span>
                      <span
                        style={{
                          background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(56, 189, 248, 0.15)",
                          border: `1px solid ${mainColor}`,
                          padding: "2px 6px",
                          borderRadius: "6px",
                          fontSize: "0.68rem",
                          color: mainColor,
                          fontWeight: 700,
                        }}
                      >
                        {isCardPayoffEmergency ? "💳 Salida (Imputado a Tarjeta)" : "📤 Salida (Aporte a Ahorro)"}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>📅 {formatMovementDateTime(item).date || "Fecha no especificada"}</span>
                      {formatMovementDateTime(item).time && (
                        <>
                          <span>•</span>
                          <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>🕒 {formatMovementDateTime(item).time}</span>
                        </>
                      )}
                      <span>•</span>
                      <span style={{ color: "#c084fc", fontWeight: 600 }}>
                        Descontado de: {item.paymentSource?.targetName || "Nómina Nu"}
                      </span>
                      {item.destinationAccountName && !isCardPayoffEmergency && (
                        <>
                          <span>•</span>
                          <span style={{ color: "#10b981", fontWeight: 600 }}>
                            📍 Cuenta destino: {item.destinationAccountName}
                          </span>
                        </>
                      )}
                      {onReclassifyMovement && (
                        <>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setAssignModalItem(item)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#0ea5e9",
                              fontSize: "0.72rem",
                              cursor: "pointer",
                              padding: 0,
                              textDecoration: "underline",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                            title="Cambiar rubro o reasignar cuenta de destino"
                          >
                            <span>🏷️</span> Cambiar Asignación / Cuenta
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="expense-log-row-right">
                    <div className="expense-log-amount-actions">
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.05rem", fontWeight: 800, color: mainColor }}>
                        -{formatMoney(item.amount, currency)}
                      </span>
                      <div className="expense-log-action-btns">
                        {onEditTransaction && (
                          <button
                            type="button"
                            onClick={() => onEditTransaction(item)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: mainColor,
                              cursor: "pointer",
                              padding: "4px",
                              fontSize: "0.85rem",
                            }}
                            title="Editar este aporte o movimiento"
                          >
                            ✏️
                          </button>
                        )}
                        {onDeleteTransaction && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTransaction(item)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#64748b",
                              cursor: "pointer",
                              padding: "4px",
                              fontSize: "0.85rem",
                            }}
                            title="Eliminar este movimiento"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // Normal Expense or Loan Item
            const source = item.paymentSource || {};
            const sourceColor =
              source.type === "credit_card"
                ? "#f43f5e"
                : source.type === "fixed_pocket"
                ? "#38bdf8"
                : "#c084fc";

            const isLoan = Boolean(item.isLoan);
            const isSettled = item.loanStatus === "settled";
            const isIncome = item.itemType === "income";
            const { date: itemDate, time: itemTime } = formatMovementDateTime(item);

            // Detailed loan metrics (works for both direct loans and shared expenses)
            const loanTotal = Number(item.loanAmount) > 0 ? Number(item.loanAmount) : Number(item.amount) || 0;
            const settlementsList = Array.isArray(item.settlements)
              ? item.settlements
              : item.settlementDetails
              ? [item.settlementDetails]
              : [];
            const totalSettledAmt = Number(item.totalSettled) || settlementsList.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
            const remainingLoanAmt = item.remainingLoan !== undefined
              ? Number(item.remainingLoan)
              : Math.max(0, loanTotal - totalSettledAmt);
            const settlementsCount = settlementsList.length;

            return (
              <div
                key={item.id}
                className="expense-log-row-card"
                style={{
                  background: isLoan
                    ? isSettled
                      ? "rgba(16, 185, 129, 0.06)"
                      : "rgba(245, 158, 11, 0.08)"
                    : isIncome
                    ? "rgba(16, 185, 129, 0.05)"
                    : "var(--bg-card)",
                  border: isLoan
                    ? isSettled
                      ? "1px solid rgba(16, 185, 129, 0.35)"
                      : "1px solid rgba(245, 158, 11, 0.4)"
                    : isIncome
                    ? "1px solid rgba(16, 185, 129, 0.25)"
                    : "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  transition: "all 0.15s ease",
                }}
              >
                <div className="expense-log-row-left">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong className="expense-log-row-title">
                      {item.description}
                    </strong>

                    {isIncome ? (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span
                          style={{
                            background: "rgba(16, 185, 129, 0.2)",
                            border: "1px solid #10b981",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "0.72rem",
                            color: "#10b981",
                            fontWeight: 700,
                          }}
                        >
                          📥 Entrada (Consignación)
                        </span>

                        {/* Libertad Total: Clasificar movimiento opcionalmente como nuevo ingreso presupuestado en Sankey */}
                        <button
                          type="button"
                          onClick={() => toggleMovementAsBudgetInflow && toggleMovementAsBudgetInflow(item.id)}
                          style={{
                            background: item.isExplicitBudgetIncome
                              ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.25)")
                              : (isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.06)"),
                            border: item.isExplicitBudgetIncome
                              ? "1px solid #10b981"
                              : (isLight ? "1px dashed rgba(0, 0, 0, 0.2)" : "1px dashed rgba(255, 255, 255, 0.2)"),
                            color: item.isExplicitBudgetIncome
                              ? (isLight ? "#047857" : "#34d399")
                              : (isLight ? "#64748b" : "var(--text-muted)"),
                            borderRadius: "6px",
                            padding: "2px 8px",
                            fontSize: "0.70rem",
                            fontWeight: item.isExplicitBudgetIncome ? 700 : 500,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            transition: "all 0.15s ease",
                          }}
                          title={
                            item.isExplicitBudgetIncome
                              ? "Incluido en Flujo de Caja (Sankey). Clic para quitar y mantener limpios tus 3 ingresos presupuestados principales."
                              : "Clic para clasificar este movimiento como un Nuevo Ingreso Presupuestado en el diagrama de Flujo de Caja (Sankey)."
                          }
                        >
                          {item.isExplicitBudgetIncome ? "⚡ En Sankey (Ingreso Presupuestado) ✕" : "+ Clasificar como Ingreso Sankey"}
                        </button>
                      </div>
                    ) : (
                      <>
                        {!isLoan && (
                          <span
                            style={{
                              background: item.isCreditCardPayoff || Boolean(item.creditCardPaymentId) || item.description?.toLowerCase().includes("descontado de")
                                ? "rgba(14, 165, 233, 0.12)"
                                : "rgba(239, 68, 68, 0.12)",
                              border: item.isCreditCardPayoff || Boolean(item.creditCardPaymentId) || item.description?.toLowerCase().includes("descontado de")
                                ? "1px solid rgba(14, 165, 233, 0.3)"
                                : "1px solid rgba(239, 68, 68, 0.25)",
                              padding: "2px 6px",
                              borderRadius: "6px",
                              fontSize: "0.68rem",
                              color: item.isCreditCardPayoff || Boolean(item.creditCardPaymentId) || item.description?.toLowerCase().includes("descontado de")
                                ? "#38bdf8"
                                : "#f87171",
                              fontWeight: 700,
                            }}
                          >
                            {item.isCreditCardPayoff || Boolean(item.creditCardPaymentId) || item.description?.toLowerCase().includes("descontado de")
                              ? "💳 Salida (Imputado a Tarjeta)"
                              : "📤 Salida"}
                          </span>
                        )}
                        {(item.budgetItemName || isLoan) && (
                          <span
                            style={{
                              background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(128, 128, 128, 0.1)",
                              border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.06)",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "0.72rem",
                              color: isLight ? "#475569" : "var(--text-muted)",
                              fontWeight: 600,
                            }}
                          >
                            {item.budgetItemName || (item.isSplit ? "👥 Gasto Compartido" : "🤝 Préstamo Personal")}
                          </span>
                        )}
                      </>
                    )}

                    {/* Loan Badges */}
                    {isLoan && !isSettled && (item.isSplit || (item.participants || []).length > 0) && (
                      <span
                        onClick={() => setSettlingTransaction(item)}
                        style={{
                          background: isLight ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.2)",
                          border: isLight ? "1px solid rgba(37, 99, 235, 0.4)" : "1px solid #3b82f6",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: isLight ? "#1d4ed8" : "#93c5fd",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          cursor: "pointer",
                        }}
                        title="Clic para ver o gestionar participantes y cobros"
                      >
                        <span>👥</span> Gasto Compartido ({item.participants?.filter((p) => !p.isUser && p.paid).length || 0}/{(item.participants || []).filter((p) => !p.isUser).length} cobrados)
                        {item.userIncluded && (
                          <span style={{ opacity: 0.85, fontWeight: 500 }}>
                            • Tu parte: {formatMoney(item.userShare || 0)}
                          </span>
                        )}
                        <span>
                          • Por cobrar: <strong style={{ color: isLight ? "#1e40af" : "#bfdbfe" }}>{formatMoney(remainingLoanAmt)}</strong>
                        </span>
                      </span>
                    )}

                    {isLoan && !isSettled && !item.isSplit && (!item.participants || item.participants.length === 0) && (
                      <span
                        onClick={() => setSettlingTransaction(item)}
                        style={{
                          background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)",
                          border: isLight ? "1px solid rgba(217, 119, 6, 0.4)" : "1px solid #f59e0b",
                          padding: "3px 10px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: isLight ? "#92400e" : "#fcd34d",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          cursor: "pointer",
                          flexWrap: "wrap",
                        }}
                        title="Clic para registrar abono o cobro de este préstamo"
                      >
                        <span>🤝</span> Préstamo a: <strong style={{ color: isLight ? "#78350f" : "#fef08a" }}>{item.loanRecipient || "Amigo"}</strong>
                        <span style={{ opacity: 0.85, fontWeight: 500 }}>
                          • Total: {formatMoney(loanTotal)}
                        </span>
                        {totalSettledAmt > 0 && (
                          <span style={{ color: isLight ? "#047857" : "#6ee7b7", fontWeight: 600 }}>
                            • Abonado: {formatMoney(totalSettledAmt)}{settlementsCount > 0 ? ` (${settlementsCount} ${settlementsCount === 1 ? "abono" : "abonos"})` : ""}
                          </span>
                        )}
                        <span>
                          • Por cobrar: <strong style={{ color: isLight ? "#b45309" : "#fbbf24" }}>{formatMoney(remainingLoanAmt)}</strong>
                        </span>
                      </span>
                    )}

                    {isLoan && isSettled && (
                      <span
                        onClick={() => setSettlingTransaction(item)}
                        style={{
                          background: isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)",
                          border: `1px solid ${isLight ? "#059669" : "#10b981"}`,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: isLight ? "#047857" : "#6ee7b7",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          cursor: "pointer",
                        }}
                        title="Ver detalle de liquidación"
                      >
                        ✔️ {item.isSplit ? "Gasto Compartido 100% Cobrado" : `Cobrado • Retornado a: ${item.settlementDetails?.targetName || "Cuenta"}`}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>📅 {itemDate || "Fecha no especificada"}</span>
                    {itemTime && (
                      <>
                        <span>•</span>
                        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>🕒 {itemTime}</span>
                      </>
                    )}
                    <span>•</span>
                    <span style={{ color: sourceColor, fontWeight: 600 }}>
                      {source.targetName || "Nómina"}
                    </span>
                    {isLoan && settlementsList.length > 0 && (
                      <>
                        <span>•</span>
                        <span style={{ color: isLight ? "#047857" : "#34d399", fontWeight: 600 }}>
                          ✓ Último cobro: {formatMoney(settlementsList[0].amount)} ({settlementsList[0].date || "reciente"}) ➔ {settlementsList[0].targetName || "Cuenta"}
                        </span>
                      </>
                    )}

                    {/* Option to toggle as loan if not yet marked */}
                    {!isLoan && onToggleExpenseLoan && (
                      <>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const recipient = await toastPrompt("¿A quién le prestaste este monto o parte de él?", "Amigo / Familiar");
                            if (recipient !== null && recipient.trim()) {
                              onToggleExpenseLoan(item.id, true, recipient.trim(), item.amount);
                            }
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#f59e0b",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                            fontWeight: 600,
                          }}
                        >
                          🤝 Marcar como Préstamo
                        </button>
                      </>
                    )}

                    {/* Option to reclassify / assign movement */}
                    {!isLoan && (onReclassifyMovement || onConvertExpenseToCardPayment) && (
                      <>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={() => setAssignModalItem(item)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#0ea5e9",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                          title="Asignar este movimiento a un rubro de presupuesto, deuda personal o tarjeta de crédito"
                        >
                          <span>🏷️</span> Asignar Movimiento
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="expense-log-row-right">
                  {/* Mark as Settled Button */}
                  {isLoan && !isSettled && (
                    <button
                      type="button"
                      onClick={() => setSettlingTransaction(item)}
                      style={{
                        background: isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.18)",
                        border: isLight ? "1.5px solid #059669" : "1px solid #10b981",
                        color: isLight ? "#047857" : "#10b981",
                        borderRadius: "8px",
                        padding: "5px 10px",
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.15s ease",
                        boxShadow: isLight ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                        flexShrink: 0,
                      }}
                      title="Registrar devolución o cobro de este préstamo"
                    >
                      <span>📥</span> Gestionar Cobros
                    </button>
                  )}

                  <div className="expense-log-amount-actions">
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "1.05rem",
                        fontWeight: 800,
                        color: isLoan && !isSettled
                          ? "#f59e0b"
                          : isIncome
                          ? "#10b981"
                          : "#f43f5e",
                      }}
                    >
                      {isIncome ? `+${formatMoney(item.amount, currency)}` : `-${formatMoney(item.amount, currency)}`}
                    </span>

                    <div className="expense-log-action-btns">
                      {onEditTransaction && (
                        <button
                          type="button"
                          onClick={() => onEditTransaction(item)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#38bdf8",
                            cursor: "pointer",
                            padding: "4px",
                            fontSize: "0.85rem",
                          }}
                          title="Editar este gasto o préstamo"
                        >
                          ✏️
                        </button>
                      )}

                      {(onDeleteTransaction || onDeletePayment) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (item.itemType === "card_payment" || item.isCardPayment) {
                              handleDeleteCardPayment(item);
                            } else {
                              handleDeleteTransaction(item);
                            }
                          }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#64748b",
                            cursor: "pointer",
                            padding: "4px",
                            fontSize: "0.85rem",
                          }}
                          title={item.itemType === "card_payment" || item.isCardPayment ? "Revertir este pago de tarjeta" : "Eliminar este gasto"}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Loan Settlement Modal */}
      {settlingTransaction && (
        <LoanSettlementModal
          isOpen={Boolean(settlingTransaction)}
          onClose={() => setSettlingTransaction(null)}
          transaction={settlingTransaction}
          currency={currency}
          fxRate={fxRate}
          payrollAccount={payrollAccount}
          creditCards={creditCards}
          fixedIncomeAccounts={fixedIncomeAccounts}
          onConfirmSettlement={onConfirmSettlement}
          onUpdateSplit={onUpdateSplit}
          onRevertParticipant={onRevertParticipant}
        />
      )}

      {/* Modal: Asignar o Imputar Movimiento (Rubro, Deuda o Tarjeta) */}
      {assignModalItem && (
        <AssignMovementModal
          isOpen={Boolean(assignModalItem)}
          onClose={() => setAssignModalItem(null)}
          movement={assignModalItem}
          currency={currency}
          formatMoney={formatMoney}
          creditCards={creditCards}
          debts={debts}
          budgetItems={budgetItems}
          fixedIncomeAccounts={fixedIncomeAccounts}
          expensesLog={periodExpenses}
          activePeriod={activePeriod}
          onSaveTransaction={onSaveTransaction}
          onDeleteTransaction={onDeleteTransaction}
          onReclassify={(payload) => {
            if (onReclassifyMovement) {
              onReclassifyMovement(payload);
            } else if (onConvertExpenseToCardPayment && payload.destinationType === "credit_card") {
              onConvertExpenseToCardPayment(payload.movementId, payload.targetId);
            }
          }}
        />
      )}
    </div>
  );
}
