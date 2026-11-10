import React, { useState, useMemo } from "react";
import { formatCashFlowMoney, sortMovementsByDateTimeDesc } from "../../utils/cashFlowFormatters";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import LoanSettlementModal from "./LoanSettlementModal";
import AssignMovementModal from "./AssignMovementModal";
import InfoTooltip from "../Common/InfoTooltip";
import toast from "react-hot-toast";
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

  // Memorized merchant rules from local storage
  const merchantRules = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("kpital_merchant_rules") || "[]");
    } catch {
      return [];
    }
  }, []);

  const getMatchingMerchantRule = (item) => {
    if (!item?.description || item.budgetItemId || item.isLoan || item.isDebtCollection || item.isDebtPayment || item.itemType === "card_payment") return null;
    const descLower = item.description.toLowerCase();
    const matched = merchantRules.find((r) => r.keyword && descLower.includes(r.keyword.toLowerCase()));
    if (!matched) return null;
    const env = (budgetItems || []).find((b) => b.id === matched.envelopeId);
    if (!env) return null;
    return { rule: matched, envelope: env };
  };
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
        const isWealth = (tx.budgetItemType === "wealth" || tx.budgetItemId?.startsWith("wealth_")) && !isIncome && !tx.isLoan;
        return {
          ...tx,
          itemType: isIncome ? "income" : isWealth ? "wealth_saving" : "expense",
        };
      });
  }, [expensesLog, activePeriod]);

  // All 73 real movements from periodExpenses are displayed as full transactions in the history
  const standaloneExpenses = useMemo(() => {
    return periodExpenses;
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

  // Combined sorted activity feed: preserves all 73 individual transactions from the cash flow SSOT
  const combinedActivities = useMemo(() => {
    return sortMovementsByDateTimeDesc(standaloneExpenses);
  }, [standaloneExpenses]);

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
      if (filterSource === "only_payments" && item.itemType !== "card_payment" && !item.isCreditCardPayoff && !item.creditCardPaymentId && !(item.description || "").toLowerCase().includes("descontado de") && !(item.description || "").toLowerCase().includes("pago tarjeta")) return false;
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
          // Un movimiento ya no está "sin asignar" si tiene rubro presupuestal, es préstamo, es cobro de deuda/préstamo o es pago a tarjeta
          if (item.budgetItemId || item.isLoan || item.isDebtCollection || item.isDebtPayment || item.itemType === "card_payment") return false;
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

// Multi-Selection Checkbox & Dynamic Sum State
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());

  const toggleSelection = (id) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredActivities.map((a) => a.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedItemIds.has(id));
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allFilteredIds.forEach((id) => next.delete(id));
      } else {
        allFilteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const selectedItems = useMemo(() => {
    if (selectedItemIds.size === 0) return [];
    return combinedActivities.filter((item) => selectedItemIds.has(item.id));
  }, [combinedActivities, selectedItemIds]);

  const selectedMetrics = useMemo(() => {
    let expenseSum = 0;
    let incomeSum = 0;
    selectedItems.forEach((item) => {
      const amt = Number(item.amount) || 0;
      if (item.itemType === "income") {
        incomeSum += amt;
      } else {
        expenseSum += amt;
      }
    });
    const net = incomeSum - expenseSum;
    return {
      count: selectedItems.length,
      expenseSum,
      incomeSum,
      net,
      hasIncomes: incomeSum > 0,
      hasExpenses: expenseSum > 0,
    };
  }, [selectedItems]);

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

  // Saldo en Nómina 100% dinámico y reactivo en vivo:
  // Si hay ingresos en el mes, refleja el flujo neto real del período (Ingresos - Salidas de nómina).
  // Si no hay ingresos pero hay saldo base registrado de la cuenta bancaria, descuenta en vivo las salidas de nómina.
  const staticBase = matchedPayrollAccount && matchedPayrollAccount.balance !== undefined ? Number(matchedPayrollAccount.balance) || 0 : 0;
  const payrollAvailableBalance = totalIncomeInPeriod > 0
    ? payrollNetBalance
    : staticBase > 0
    ? staticBase - totalSpentFromPayroll - totalSavedFromPayroll - totalPaidToCardsFromPayroll
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
                  text={`Saldo disponible real en cuenta Nómina (Nu Débito): ${formatMoney(payrollAvailableBalance, currency)}. Actualizado en vivo en este período: Ingresos (${formatMoney(totalIncomeInPeriod, currency)}) menos salidas de nómina (${formatMoney(totalSpentFromPayroll + totalSavedFromPayroll + totalPaidToCardsFromPayroll, currency)}).`}
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

      {/* Control Bar: Selección Múltiple y Contador */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 14px",
          borderRadius: "10px",
          background: isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.02)",
          border: isLight ? "1px solid rgba(0, 0, 0, 0.06)" : "1px solid rgba(255, 255, 255, 0.05)",
          marginBottom: 10,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleSelectAllFiltered}
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.06)",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(255, 255, 255, 0.12)",
              color: "var(--text-primary)",
              borderRadius: "8px",
              padding: "5px 12px",
              fontSize: "0.76rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
            title="Seleccionar o deseleccionar todos los movimientos mostrados con el filtro actual"
          >
            <span>
              {filteredActivities.length > 0 && filteredActivities.every((a) => selectedItemIds.has(a.id))
                ? "☑️ Deseleccionar todos"
                : "⬜ Seleccionar todos"}
            </span>
          </button>

          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Mostrando <strong>{filteredActivities.length}</strong> movimientos
          </span>
        </div>

        {selectedMetrics.count > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: isLight ? "#0284c7" : "#00e5ff",
                background: isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(0, 229, 255, 0.12)",
                border: isLight ? "1px solid rgba(2, 132, 199, 0.3)" : "1px solid rgba(0, 229, 255, 0.35)",
                padding: "3px 10px",
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              ✓ {selectedMetrics.count} seleccionados • Total:{" "}
              <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {selectedMetrics.hasExpenses && !selectedMetrics.hasIncomes
                  ? `-${formatMoney(selectedMetrics.expenseSum, currency)}`
                  : selectedMetrics.hasIncomes && !selectedMetrics.hasExpenses
                  ? `+${formatMoney(selectedMetrics.incomeSum, currency)}`
                  : `${selectedMetrics.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(selectedMetrics.net), currency)}`}
              </strong>
            </span>
            <button
              type="button"
              onClick={handleClearSelection}
              style={{
                background: "transparent",
                border: "none",
                color: isLight ? "#dc2626" : "#f87171",
                fontSize: "0.76rem",
                fontWeight: 600,
                cursor: "pointer",
                padding: "2px 6px",
                textDecoration: "underline",
              }}
            >
              Limpiar selección
            </button>
          </div>
        )}
      </div>

      {/* Transactions & Payments List */}
      {filteredActivities.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: "#64748b", fontSize: "0.85rem" }}>
          No hay movimientos registrados con este filtro en este período.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="expense-log-table-header">
            <div className="expense-th-date">Fecha &amp; Hora</div>
            <div className="expense-th-desc">Concepto y Origen</div>
            <div className="expense-th-cat">Rubro / Categoría</div>
            <div className="expense-th-actions">Asignación</div>
            <div className="expense-th-amount">Monto</div>
          </div>
          {filteredActivities.map((item) => {
            const isDistributedExpense = Boolean(item.isDistributed) || (Array.isArray(item.budgetDeductions) && item.budgetDeductions.length > 0);
            const isPayment = item.itemType === "card_payment" || isDistributedExpense;
            const isWealth = item.itemType === "wealth_saving";

            const isSelected = selectedItemIds.has(item.id);

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
                    background: isSelected
                      ? (isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)")
                      : isDebt
                      ? (isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.1)")
                      : (isLight ? "rgba(16, 185, 129, 0.05)" : "rgba(16, 185, 129, 0.08)"),
                    border: isSelected
                      ? (isLight ? "1px solid #0284c7" : "1px solid #00e5ff")
                      : isDebt
                      ? "1px solid rgba(245, 158, 11, 0.4)"
                      : "1px solid rgba(16, 185, 129, 0.25)",
                    boxShadow: isSelected
                      ? (isLight ? "0 0 12px rgba(2, 132, 199, 0.18)" : "0 0 14px rgba(0, 229, 255, 0.22)")
                      : "none",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div className="expense-log-grid-row">
                    {/* Col 1: Date & Selection */}
                    <div className="expense-col-date">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelection(item.id);
                        }}
                        className="expense-select-checkbox"
                        style={{ accentColor: isLight ? "#0284c7" : "#00e5ff" }}
                        title={isSelected ? "Deseleccionar movimiento" : "Seleccionar para sumar"}
                      />
                      <div className="expense-date-info">
                        <span className="expense-date-text">📅 {formatMovementDateTime(item).date || "Sin fecha"}</span>
                        {formatMovementDateTime(item).time && (
                          <span className="expense-time-text">🕒 {formatMovementDateTime(item).time}</span>
                        )}
                      </div>
                    </div>

                    {/* Col 2: Concept & Origin */}
                    <div className="expense-col-desc">
                      <div className="expense-desc-title">
                        <span style={{ fontSize: "1rem" }}>{isDebt ? "🤝" : isCard ? "💳" : "📋"}</span>
                        <strong>
                          {isCard ? `${item.cardName} • ${item.description || "Abono a tarjeta"}` : item.description}
                        </strong>
                      </div>
                      <div className="expense-desc-sub">
                        <span style={{ color: "#38bdf8", fontWeight: 600 }}>
                          💳 Pagado desde: {item.sourceAccount || item.paymentSource?.targetName || "Nómina Nu"}
                        </span>
                      </div>
                    </div>

                    {/* Col 3: Rubro / Category */}
                    <div className="expense-col-cat">
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

                    {/* Col 4: Quick Actions */}
                    <div className="expense-col-actions">
                      {onReclassifyMovement && (
                        <button
                          type="button"
                          onClick={() => setAssignModalItem(item)}
                          className="expense-action-pill"
                          title="Distribuir este abono en varios rubros del mes o cambiar asignación"
                        >
                          <span>🏷️</span> Distribuir / Reasignar
                        </button>
                      )}
                      {!item.isLoan && !item.isDebtCollection && onToggleExpenseLoan && (
                        <button
                          type="button"
                          onClick={async () => {
                            const recipient = await toastPrompt("¿A quién le prestaste este monto o parte de él?", "Amigo / Familiar");
                            if (recipient !== null && recipient.trim()) {
                              onToggleExpenseLoan(item.id, true, recipient.trim(), item.amount);
                            }
                          }}
                          className="expense-action-pill loan-pill"
                        >
                          <span>🤝</span> Marcar Préstamo
                        </button>
                      )}
                    </div>

                    {/* Col 5: Amount & Edit/Delete */}
                    <div className="expense-col-amount">
                      <span
                        className="expense-amount-val"
                        style={{ color: isDebt ? (isLight ? "#d97706" : "#f59e0b") : (isLight ? "#047857" : "#10b981") }}
                      >
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
                          {hasWealthDeduction ? "💎" : "📋"} Desglose en Rubros ({item.budgetDeductions.length}{" "}
                          {item.budgetDeductions.length === 1 ? "rubro" : "rubros"} • Click para{" "}
                          {isExpanded ? "ocultar" : "ver"})
                        </span>
                      </div>

                      {isExpanded && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: "8px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
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
                  className="expense-log-grid-row"
                  style={{
                    background: isSelected
                      ? (isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)")
                      : cardBg,
                    border: isSelected
                      ? (isLight ? "1px solid #0284c7" : "1px solid #00e5ff")
                      : cardBorder,
                    boxShadow: isSelected
                      ? (isLight ? "0 0 12px rgba(2, 132, 199, 0.18)" : "0 0 14px rgba(0, 229, 255, 0.22)")
                      : "none",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Col 1: Date & Selection */}
                  <div className="expense-col-date">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelection(item.id);
                      }}
                      className="expense-select-checkbox"
                      style={{ accentColor: isLight ? "#0284c7" : "#00e5ff" }}
                      title={isSelected ? "Deseleccionar movimiento" : "Seleccionar para sumar"}
                    />
                    <div className="expense-date-info">
                      <span className="expense-date-text">📅 {formatMovementDateTime(item).date || "Sin fecha"}</span>
                      {formatMovementDateTime(item).time && (
                        <span className="expense-time-text">🕒 {formatMovementDateTime(item).time}</span>
                      )}
                    </div>
                  </div>

                  {/* Col 2: Concept & Origin */}
                  <div className="expense-col-desc">
                    <div className="expense-desc-title">
                      <span style={{ fontSize: "1rem" }}>{isCardPayoffEmergency ? "💳" : "💎"}</span>
                      <strong>{item.description}</strong>
                    </div>
                    <div className="expense-desc-sub">
                      <span style={{ color: "#c084fc", fontWeight: 600 }}>
                        💳 Descontado de: {item.paymentSource?.targetName || "Nómina Nu"}
                      </span>
                      {item.destinationAccountName && !isCardPayoffEmergency && (
                        <span style={{ color: "#10b981", fontWeight: 600 }}>
                          📍 Cuenta destino: {item.destinationAccountName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Col 3: Rubro / Category */}
                  <div className="expense-col-cat">
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

                  {/* Col 4: Quick Actions */}
                  <div className="expense-col-actions">
                    {onReclassifyMovement && (
                      <button
                        type="button"
                        onClick={() => setAssignModalItem(item)}
                        className="expense-action-pill"
                        title="Cambiar rubro o reasignar cuenta de destino"
                      >
                        <span>🏷️</span> Cambiar Asignación
                      </button>
                    )}
                    {!item.isLoan && !item.isDebtCollection && onToggleExpenseLoan && (
                      <button
                        type="button"
                        onClick={async () => {
                          const recipient = await toastPrompt("¿A quién le prestaste este monto o parte de él?", "Amigo / Familiar");
                          if (recipient !== null && recipient.trim()) {
                            onToggleExpenseLoan(item.id, true, recipient.trim(), item.amount);
                          }
                        }}
                        className="expense-action-pill loan-pill"
                      >
                        <span>🤝</span> Marcar Préstamo
                      </button>
                    )}
                  </div>

                  {/* Col 5: Amount & Edit/Delete */}
                  <div className="expense-col-amount">
                    <span className="expense-amount-val" style={{ color: mainColor }}>
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
                className="expense-log-grid-row"
                style={{
                  background: isSelected
                    ? (isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)")
                    : isLoan
                    ? isSettled
                      ? "rgba(16, 185, 129, 0.06)"
                      : "rgba(245, 158, 11, 0.08)"
                    : isIncome
                    ? "rgba(16, 185, 129, 0.05)"
                    : "var(--bg-card)",
                  border: isSelected
                    ? (isLight ? "1px solid #0284c7" : "1px solid #00e5ff")
                    : isLoan
                    ? isSettled
                      ? "1px solid rgba(16, 185, 129, 0.35)"
                      : "1px solid rgba(245, 158, 11, 0.4)"
                    : isIncome
                    ? "1px solid rgba(16, 185, 129, 0.25)"
                    : "1px solid var(--border)",
                  boxShadow: isSelected
                    ? (isLight ? "0 0 12px rgba(2, 132, 199, 0.18)" : "0 0 14px rgba(0, 229, 255, 0.22)")
                    : "none",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Col 1: Date & Selection */}
                <div className="expense-col-date">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelection(item.id);
                    }}
                    className="expense-select-checkbox"
                    style={{ accentColor: isLight ? "#0284c7" : "#00e5ff" }}
                    title={isSelected ? "Deseleccionar movimiento" : "Seleccionar para sumar"}
                  />
                  <div className="expense-date-info">
                    <span className="expense-date-text">📅 {itemDate || "Sin fecha"}</span>
                    {itemTime && (
                      <span className="expense-time-text">🕒 {itemTime}</span>
                    )}
                  </div>
                </div>

                {/* Col 2: Concept & Origin */}
                <div className="expense-col-desc">
                  <div className="expense-desc-title">
                    <strong>{item.description}</strong>
                  </div>
                  <div className="expense-desc-sub">
                    <span style={{ color: sourceColor, fontWeight: 600 }}>
                      💳 {source.targetName || "Nómina"}
                    </span>
                    {isLoan && !isSettled && (item.isSplit || (item.participants || []).length > 0) && (
                      <span
                        onClick={() => setSettlingTransaction(item)}
                        style={{
                          background: isLight ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.2)",
                          border: isLight ? "1px solid rgba(37, 99, 235, 0.4)" : "1px solid #3b82f6",
                          padding: "2px 6px",
                          borderRadius: "6px",
                          fontSize: "0.70rem",
                          color: isLight ? "#1d4ed8" : "#93c5fd",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        title="Clic para ver o gestionar participantes y cobros"
                      >
                        👥 Gasto Compartido ({item.participants?.filter((p) => !p.isUser && p.paid).length || 0}/{(item.participants || []).filter((p) => !p.isUser).length} cobrados) • Por cobrar: {formatMoney(remainingLoanAmt)}
                      </span>
                    )}
                    {isLoan && !isSettled && !item.isSplit && (!item.participants || item.participants.length === 0) && (
                      <span
                        onClick={() => setSettlingTransaction(item)}
                        style={{
                          background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)",
                          border: isLight ? "1px solid rgba(217, 119, 6, 0.4)" : "1px solid #f59e0b",
                          padding: "2px 6px",
                          borderRadius: "6px",
                          fontSize: "0.70rem",
                          color: isLight ? "#92400e" : "#fcd34d",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        title="Clic para registrar abono o cobro de este préstamo"
                      >
                        🤝 Préstamo a: {item.loanRecipient || "Amigo"} • Por cobrar: {formatMoney(remainingLoanAmt)}
                      </span>
                    )}
                    {isLoan && isSettled && (
                      <span
                        onClick={() => setSettlingTransaction(item)}
                        style={{
                          background: isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)",
                          border: `1px solid ${isLight ? "#059669" : "#10b981"}`,
                          padding: "2px 6px",
                          borderRadius: "6px",
                          fontSize: "0.70rem",
                          color: isLight ? "#047857" : "#6ee7b7",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                        title="Ver detalle de liquidación"
                      >
                        ✓ {item.isSplit ? "Gasto Compartido 100% Cobrado" : `Cobrado • Retornado a: ${item.settlementDetails?.targetName || "Cuenta"}`}
                      </span>
                    )}
                    {isLoan && settlementsList.length > 0 && !isSettled && (
                      <span style={{ color: isLight ? "#047857" : "#34d399", fontWeight: 600, fontSize: "0.70rem" }}>
                        ✓ Último cobro: {formatMoney(settlementsList[0].amount)} ({settlementsList[0].date || "reciente"})
                      </span>
                    )}
                  </div>
                </div>

                {/* Col 3: Rubro / Category */}
                <div className="expense-col-cat">
                  {isIncome ? (
                    <>
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
                        {item.isDebtCollection ? "🤝 Cobro de Préstamo" : "📥 Entrada"}
                      </span>
                      {item.isDebtCollection && (
                        <span
                          style={{
                            background: isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.18)",
                            border: isLight ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(16, 185, 129, 0.4)",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "0.70rem",
                            color: isLight ? "#047857" : "#34d399",
                            fontWeight: 700,
                          }}
                        >
                          ✓ Asignado a Préstamo
                        </span>
                      )}
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                {/* Col 4: Quick Actions */}
                <div className="expense-col-actions">
                  {isIncome && toggleMovementAsBudgetInflow && (
                    <button
                      type="button"
                      onClick={() => toggleMovementAsBudgetInflow(item.id)}
                      className="expense-action-pill sankey-pill"
                      title={
                        item.isExplicitBudgetIncome
                          ? "Incluido en Flujo de Caja (Sankey). Clic para quitar y mantener limpios tus 3 ingresos presupuestados principales."
                          : "Clic para clasificar este movimiento como un Nuevo Ingreso Presupuestado en el diagrama de Flujo de Caja (Sankey)."
                      }
                    >
                      {item.isExplicitBudgetIncome ? "⚡ En Sankey ✓" : "+ En Sankey"}
                    </button>
                  )}

                  {isLoan && !isSettled && (
                    <button
                      type="button"
                      onClick={() => setSettlingTransaction(item)}
                      className="expense-action-pill settle-pill"
                      title="Registrar devolución o cobro de este préstamo"
                    >
                      <span>🤝</span> Gestionar Cobros
                    </button>
                  )}

                  {!isLoan && !item.isDebtCollection && (onReclassifyMovement || onConvertExpenseToCardPayment) && (
                    <>
                      {(() => {
                        const match = getMatchingMerchantRule(item);
                        if (!match || !onReclassifyMovement) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              onReclassifyMovement({
                                movementId: item.id,
                                destinationType: "budget_envelope",
                                targetId: match.envelope.id,
                                targetItem: match.envelope,
                                subItem: match.rule.subItemId ? { id: match.rule.subItemId, name: match.rule.subItemName } : null,
                                destinationAccount: null,
                                paymentSource: item.paymentSource,
                              });
                              toast.success(`Movimiento asignado a ${match.envelope.name} (${match.rule.keyword})`);
                            }}
                            className="expense-action-pill"
                            style={{
                              background: isLight ? "#eff6ff" : "rgba(37, 99, 235, 0.15)",
                              color: isLight ? "#1d4ed8" : "#93c5fd",
                              border: isLight ? "1px solid #bfdbfe" : "1px solid rgba(59, 130, 246, 0.3)",
                              fontWeight: 600,
                            }}
                            title={`Asignar automáticamente a "${match.envelope.name}" según regla para "${match.rule.keyword}"`}
                          >
                            <span>✨</span> Auto: {match.envelope.name}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setAssignModalItem(item)}
                        className="expense-action-pill"
                        title="Asignar este movimiento a un rubro de presupuesto, deuda personal o tarjeta de crédito"
                      >
                        <span>🏷️</span> Asignar Movimiento
                      </button>
                    </>
                  )}

                  {!isLoan && !item.isDebtCollection && onToggleExpenseLoan && (
                    <button
                      type="button"
                      onClick={async () => {
                        const recipient = await toastPrompt("¿A quién le prestaste este monto o parte de él?", "Amigo / Familiar");
                        if (recipient !== null && recipient.trim()) {
                          onToggleExpenseLoan(item.id, true, recipient.trim(), item.amount);
                        }
                      }}
                      className="expense-action-pill loan-pill"
                    >
                      <span>🤝</span> Marcar Préstamo
                    </button>
                  )}
                </div>

                {/* Col 5: Amount & Edit/Delete */}
                <div className="expense-col-amount">
                  <span
                    className="expense-amount-val"
                    style={{
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
                        title="Editar movimiento (Gasto, Salida, Ingreso o Préstamo)"
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
                          color: "var(--text-muted)",
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

      {/* Cajita Flotante de Movimientos Seleccionados y Suma Total Dinámica */}
      {selectedMetrics.count > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "10px 18px",
            borderRadius: "16px",
            background: isLight ? "rgba(255, 255, 255, 0.96)" : "rgba(10, 16, 32, 0.94)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: isLight ? "1px solid rgba(2, 132, 199, 0.4)" : "1px solid rgba(0, 229, 255, 0.5)",
            boxShadow: isLight
              ? "0 10px 30px rgba(0, 0, 0, 0.12), 0 0 16px rgba(2, 132, 199, 0.15)"
              : "0 12px 40px rgba(0, 0, 0, 0.7), 0 0 24px rgba(0, 229, 255, 0.25)",
            animation: "fadeInUp 0.25s ease-out",
            maxWidth: "92vw",
            flexWrap: "wrap",
          }}
        >
          {/* Indicador y Conteo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "10px",
                background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.15rem",
              }}
            >
              🧮
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.72rem",
                  color: isLight ? "#475569" : "#94a3b8",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {selectedMetrics.count} {selectedMetrics.count === 1 ? "movimiento seleccionado" : "movimientos seleccionados"}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 1 }}>
                <span style={{ fontSize: "0.80rem", color: "var(--text-muted)", fontWeight: 600 }}>Suma total:</span>
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    color: isLight ? "#0284c7" : "#00e5ff",
                    letterSpacing: "-0.5px",
                  }}
                >
                  {selectedMetrics.hasExpenses && !selectedMetrics.hasIncomes
                    ? `-${formatMoney(selectedMetrics.expenseSum, currency)}`
                    : selectedMetrics.hasIncomes && !selectedMetrics.hasExpenses
                    ? `+${formatMoney(selectedMetrics.incomeSum, currency)}`
                    : `${selectedMetrics.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(selectedMetrics.net), currency)}`}
                </span>
                {selectedMetrics.hasExpenses && selectedMetrics.hasIncomes && (
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: 4 }}>
                    (-{formatMoney(selectedMetrics.expenseSum, currency)} / +{formatMoney(selectedMetrics.incomeSum, currency)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Separador vertical */}
          <div
            style={{
              width: 1,
              height: 34,
              background: isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.12)",
            }}
          />

          {/* Botones de acción */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                const formattedText = selectedMetrics.hasExpenses && !selectedMetrics.hasIncomes
                  ? `-${formatMoney(selectedMetrics.expenseSum, currency)}`
                  : selectedMetrics.hasIncomes && !selectedMetrics.hasExpenses
                  ? `+${formatMoney(selectedMetrics.incomeSum, currency)}`
                  : `${selectedMetrics.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(selectedMetrics.net), currency)}`;
                navigator.clipboard.writeText(formattedText);
                toast.success(`Copiado al portapapeles: ${formattedText}`);
              }}
              style={{
                background: isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.1)",
                border: isLight ? "1px solid rgba(2, 132, 199, 0.3)" : "1px solid rgba(0, 229, 255, 0.35)",
                color: isLight ? "#0284c7" : "#00e5ff",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                transition: "all 0.15s ease",
              }}
              title="Copiar suma total al portapapeles"
            >
              <span>📋</span> Copiar
            </button>

            <button
              type="button"
              onClick={handleClearSelection}
              style={{
                background: isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.14)",
                border: isLight ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(239, 68, 68, 0.35)",
                color: isLight ? "#dc2626" : "#f87171",
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "0.76rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "all 0.15s ease",
              }}
              title="Deseleccionar todos los movimientos"
            >
              <span>✕</span> Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
