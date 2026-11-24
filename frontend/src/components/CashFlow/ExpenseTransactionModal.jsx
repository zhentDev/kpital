import React, { useState, useEffect } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import CascadingCategorySelector from "../Common/CascadingCategorySelector";
import DynamicDatePicker from "../Common/DynamicDatePicker";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import InfoTooltip from "../Common/InfoTooltip";
import { useTheme } from "../../context/ThemeContext";
import { getCurrentPeriod } from "../../utils/periodUtils";
import "./CashFlow.css";

function formatMoney(val, currency = "COP") {
  const num = Number(val) || 0;
  if (currency === "USD") {
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `$${Math.round(num).toLocaleString("es-CO")}`;
}

const INCOME_CATEGORIES = [
  { id: "salary", label: "💼 Salario / Nómina", defaultDesc: "Consignación Nómina" },
  { id: "transfer", label: "📥 Transferencia Recibida (Rappi, Nu, Nequi...)", defaultDesc: "Transferencia recibida" },
  { id: "freelance", label: "💻 Honorarios / Freelance / Servicios", defaultDesc: "Pago de servicios" },
  { id: "yield", label: "📈 Rendimientos / Intereses / Dividendos", defaultDesc: "Rendimientos financieros" },
  { id: "refund", label: "🎁 Devolución / Reembolso / Otro", defaultDesc: "Abono / Reembolso" },
];

export default function ExpenseTransactionModal({
  isOpen,
  onClose,
  activePeriod,
  currency = "COP",
  budgetItems = [], // Array of needs + wants + wealth budget envelopes
  payrollAccount = { name: "Nu Colombia (Cuenta Nu Débito)", icon: "💜" },
  creditCards = [],
  fixedIncomeAccounts = [],
  editTransaction = null,
  onSaveExpenseTransaction,
  onUpdateExpenseTransaction,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const currentPeriod = activePeriod || getCurrentPeriod();

  // Mode: "expense" (salida) vs "income" (entrada)
  const [movementNature, setMovementNature] = useState("expense");

  // Income Fields
  const [incomeCategory, setIncomeCategory] = useState("transfer");
  const [incomeTargetAccountId, setIncomeTargetAccountId] = useState(
    fixedIncomeAccounts[0]?.id || "payroll"
  );

  // Common Fields
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [time, setTime] = useState(
    new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );

  // Loan / Receivable State (Expenses only)
  const [isLoan, setIsLoan] = useState(false);
  const [loanRecipient, setLoanRecipient] = useState("");
  const [loanAmount, setLoanAmount] = useState(0);
  const [loanDueDate, setLoanDueDate] = useState("");
  const [isSplit, setIsSplit] = useState(false);
  const [splitMode, setSplitMode] = useState("equal"); // "equal" | "exact" | "percentage" | "shares" | "itemized"
  const [userIncluded, setUserIncluded] = useState(true);
  const [userUnits, setUserUnits] = useState(1);
  const [userBaseAmount, setUserBaseAmount] = useState(0);
  const [participants, setParticipants] = useState([]);
  const [newParticipantInput, setNewParticipantInput] = useState("");

  // Payment Source (Expenses only)
  const [sourceType, setSourceType] = useState("payroll");
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || "");
  const [cardInstallments, setCardInstallments] = useState(1);
  const [selectedPocketId, setSelectedPocketId] = useState(fixedIncomeAccounts[0]?.id || "");

  // Auto-populate default amount and source whenever envelope changes or modal opens
  const handleSelectBudgetItem = (itemId) => {
    setSelectedBudgetItemId(itemId);
    if (itemId === "loan_receivable") {
      setIsLoan(true);
      if (!loanAmount || Number(loanAmount) <= 0) {
        setLoanAmount(Number(amount) || 0);
      }
      return;
    }
    const item = budgetItems.find((b) => b.id === itemId);
    if (item && !editTransaction) {
      // Solo auto-llenar con el presupuesto presupuestado si el usuario NO ha escrito un monto previo
      if (!amount || Number(amount) <= 0) {
        setAmount(Number(item.amount) || 0);
      }
      if (!description || description.trim() === "") {
        setDescription(item.name || "");
      }

      if (item.paymentSource) {
        setSourceType(item.paymentSource.type || "payroll");
        if (item.paymentSource.targetId) {
          if (item.paymentSource.type === "credit_card") {
            setSelectedCardId(item.paymentSource.targetId);
            if (item.paymentSource.installments) {
              setCardInstallments(item.paymentSource.installments);
            }
          } else if (item.paymentSource.type === "fixed_pocket") {
            setSelectedPocketId(item.paymentSource.targetId);
          }
        }
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (editTransaction) {
        const isTxIncome =
          editTransaction.type === "credit" ||
          editTransaction.budgetItemType === "income";

        setMovementNature(isTxIncome ? "income" : "expense");
        setSelectedBudgetItemId(editTransaction.budgetItemId || "");
        setDescription(editTransaction.description || "");
        setAmount(Number(editTransaction.amount) || 0);
        setDate(editTransaction.date || new Date().toISOString().split("T")[0]);
        setTime(
          editTransaction.time ||
          (editTransaction.createdAt ? editTransaction.createdAt.slice(11, 16) : new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }))
        );
        setIsLoan(Boolean(editTransaction.isLoan));
        setLoanRecipient(editTransaction.loanRecipient || "");
        setLoanAmount(
          editTransaction.loanAmount !== undefined && editTransaction.loanAmount !== null
            ? Number(editTransaction.loanAmount)
            : Number(editTransaction.amount) || 0
        );
        setLoanDueDate(editTransaction.loanDueDate || "");
        const hasSavedParts = Array.isArray(editTransaction.participants) && editTransaction.participants.length > 0;
        setIsSplit(Boolean(editTransaction.isSplit || hasSavedParts));
        const inferredSplitMode =
          editTransaction.splitMode ||
          (hasSavedParts && editTransaction.participants.some((p) => p.percentage !== undefined && p.percentage !== null)
            ? "percentage"
            : hasSavedParts && editTransaction.participants.some((p) => p.units !== undefined && Number(p.units) > 0 && Number(p.units) !== 1)
            ? "shares"
            : hasSavedParts && editTransaction.participants.some((p) => p.baseAmount !== undefined && Number(p.baseAmount) > 0)
            ? "itemized"
            : hasSavedParts && editTransaction.participants.some((p) => p.customShare !== undefined && p.customShare !== null && p.customShare !== "")
            ? "exact"
            : "equal");
        setSplitMode(inferredSplitMode);
        setUserIncluded(editTransaction.userIncluded !== undefined ? Boolean(editTransaction.userIncluded) : true);
        setUserUnits(Number(editTransaction.userUnits) > 0 ? Number(editTransaction.userUnits) : 1);
        setUserBaseAmount(Number(editTransaction.userBaseAmount) || 0);
        setParticipants(hasSavedParts ? editTransaction.participants : []);

        if (isTxIncome) {
          const matchedTarget =
            editTransaction.paymentSource?.targetId ||
            editTransaction.destinationAccountId ||
            "payroll";
          setIncomeTargetAccountId(matchedTarget);

          const bName = (editTransaction.budgetItemName || "").toLowerCase();
          if (bName.includes("salario") || bName.includes("nómina")) setIncomeCategory("salary");
          else if (bName.includes("freelance") || bName.includes("honorario")) setIncomeCategory("freelance");
          else if (bName.includes("rendimiento")) setIncomeCategory("yield");
          else if (bName.includes("devoluc") || bName.includes("reembols")) setIncomeCategory("refund");
          else setIncomeCategory("transfer");
        }

        // Siempre hidratar también la cuenta origen para gastos, permitiendo cambiar de Ingreso ↔ Salida limpiamente
        if (editTransaction.paymentSource) {
          const psType = editTransaction.paymentSource.type;
          if (["payroll", "credit_card", "fixed_pocket", "investment_cash", "cash"].includes(psType)) {
            setSourceType(psType);
          } else {
            setSourceType("payroll");
          }
          if (editTransaction.paymentSource.targetId) {
            if (psType === "credit_card") {
              setSelectedCardId(editTransaction.paymentSource.targetId);
              setCardInstallments(editTransaction.paymentSource.installments || 1);
            } else if (psType === "fixed_pocket") {
              setSelectedPocketId(editTransaction.paymentSource.targetId);
            }
          }
        } else {
          setSourceType("payroll");
        }
      } else {
        setMovementNature("expense");
        setIncomeCategory("transfer");
        setIncomeTargetAccountId(
          fixedIncomeAccounts.find((a) => a.id === "acc_rappi_principal")?.id ||
          fixedIncomeAccounts[0]?.id ||
          "payroll"
        );
        setIsLoan(false);
        setLoanRecipient("");
        setLoanAmount(0);
        setLoanDueDate("");
        setIsSplit(false);
        setSplitMode("equal");
        setUserIncluded(true);
        setUserUnits(1);
        setUserBaseAmount(0);
        setParticipants([]);
        setNewParticipantInput("");
        setSelectedBudgetItemId("");
        setAmount(0);
        setDescription("");
      }
    }
  }, [isOpen, editTransaction]);

  const selectedBudgetItem = selectedBudgetItemId ? budgetItems.find((b) => b.id === selectedBudgetItemId) || null : null;
  const isWealthItem = selectedBudgetItem?.pillarType === "wealth";

  // ── 5-Mode Flexible Split Calculation Engine ──
  const externalCount = participants.length;
  const totalSharesCount = externalCount + (userIncluded ? 1 : 0);
  const totalNum = Number(amount) || 0;
  const equalSharePerPerson = isSplit && totalSharesCount > 0 ? Math.round(totalNum / totalSharesCount) : totalNum;

  // 1. Units/Shares totals ("shares" mode)
  const extUnitsSum = participants.reduce((acc, p) => acc + (Number(p.units) > 0 ? Number(p.units) : 1), 0);
  const effUserUnits = userIncluded ? (Number(userUnits) > 0 ? Number(userUnits) : 1) : 0;
  const totalUnitsPool = extUnitsSum + effUserUnits;
  const valuePerUnit = totalUnitsPool > 0 ? totalNum / totalUnitsPool : 0;

  // 2. Base consumption + proportional tip/delivery ("itemized" mode)
  const extBaseSum = participants.reduce((acc, p) => acc + (Number(p.baseAmount) || 0), 0);
  const effUserBase = userIncluded ? (Number(userBaseAmount) || 0) : 0;
  const totalBaseConsumption = extBaseSum + effUserBase;
  const itemizedExtraOrTip = totalNum - totalBaseConsumption;

  // Compute any single participant's resolved $ share according to active `splitMode`
  const getParticipantComputedShare = (p) => {
    if (!isSplit) return totalNum;
    if (splitMode === "exact") {
      return p.customShare !== undefined && p.customShare !== null && p.customShare !== ""
        ? Math.max(0, Math.round(Number(p.customShare) || 0))
        : equalSharePerPerson;
    }
    if (splitMode === "percentage") {
      const defaultPct = totalSharesCount > 0 ? Number((100 / totalSharesCount).toFixed(2)) : 0;
      const pct = p.percentage !== undefined && p.percentage !== null && p.percentage !== ""
        ? Math.max(0, Number(p.percentage) || 0)
        : defaultPct;
      return Math.round((totalNum * pct) / 100);
    }
    if (splitMode === "shares") {
      const u = Number(p.units) > 0 ? Number(p.units) : 1;
      return totalUnitsPool > 0 ? Math.round((totalNum * u) / totalUnitsPool) : 0;
    }
    if (splitMode === "itemized") {
      const b = Math.max(0, Number(p.baseAmount) || 0);
      if (totalBaseConsumption > 0) {
        return Math.round((totalNum * b) / totalBaseConsumption);
      }
      return equalSharePerPerson;
    }
    // Default: "equal"
    return equalSharePerPerson;
  };

  const sumExternalShares = isSplit
    ? participants.reduce((acc, p) => acc + getParticipantComputedShare(p), 0)
    : 0;

  const sumExternalPercentages = isSplit
    ? participants.reduce((acc, p) => {
        const defaultPct = totalSharesCount > 0 ? Number((100 / totalSharesCount).toFixed(2)) : 0;
        const pct = p.percentage !== undefined && p.percentage !== null && p.percentage !== ""
          ? Math.max(0, Number(p.percentage) || 0)
          : defaultPct;
        return acc + pct;
      }, 0)
    : 0;
  const userPercentageRemaining = userIncluded ? Math.max(0, Number((100 - sumExternalPercentages).toFixed(2))) : 0;

  const sharePerPerson = equalSharePerPerson;
  const userShareCalculated = isSplit
    ? (userIncluded ? Math.max(0, totalNum - sumExternalShares) : 0)
    : 0;
  const finalReceivable = isSplit
    ? (userIncluded ? Math.max(0, sumExternalShares) : Math.max(0, sumExternalShares > 0 ? sumExternalShares : totalNum))
    : (Number(loanAmount) || totalNum);
  const unassignedDiff = isSplit && !userIncluded ? totalNum - sumExternalShares : 0;

  const userPersonalCost = isLoan && isSplit
    ? userShareCalculated
    : Math.max(0, (Number(amount) || 0) - (isLoan ? Number(loanAmount) || 0 : 0));

  const buildPaymentSource = () => {
    if (sourceType === "credit_card") {
      const card = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
      return {
        type: "credit_card",
        targetId: card?.id,
        targetName: card
          ? `${card.name} (${cardInstallments} ${cardInstallments === 1 ? "cuota 0%" : "cuotas 0% MSI"})`
          : "Tarjeta de Crédito",
        installments: cardInstallments,
      };
    }
    if (sourceType === "cash") {
      const cashAcc = fixedIncomeAccounts.find(
        (a) => a.accountCategory === "cash" || (a.name || "").toLowerCase().includes("efectivo") || (a.name || "").toLowerCase().includes("billetera")
      );
      return {
        type: "cash",
        targetId: cashAcc ? cashAcc.id : "acc_cash_wallet",
        targetName: cashAcc ? cashAcc.name : "Efectivo (Billetera)",
      };
    }
    if (sourceType === "fixed_pocket") {
      const pocket = fixedIncomeAccounts.find((a) => a.id === selectedPocketId) || fixedIncomeAccounts[0];
      return {
        type: "fixed_pocket",
        targetId: pocket?.id,
        targetName: pocket ? `${pocket.name}` : "Cuenta de Ahorro",
      };
    }
    if (sourceType === "investment_cash") {
      return {
        type: "investment_cash",
        targetName: "Portafolio / Broker",
      };
    }
    return {
      type: "payroll",
      targetId: payrollAccount.id || "acc_nu_debito",
      targetName: payrollAccount.name || "Cuenta Nu Débito",
    };
  };

  const handleIncomeCategoryChange = (catId) => {
    setIncomeCategory(catId);
    const catObj = INCOME_CATEGORIES.find((c) => c.id === catId);
    if (catObj && (!description || INCOME_CATEGORIES.some((c) => c.defaultDesc === description))) {
      setDescription(catObj.defaultDesc);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim() || Number(amount) <= 0) return;

    if (movementNature === "income") {
      // 📥 INCOMING MONEY (Income / Abono)
      const isTargetPayroll = incomeTargetAccountId === "payroll" || incomeTargetAccountId === "acc_nu_debito";
      const targetAcc = isTargetPayroll
        ? { id: "acc_nu_debito", name: payrollAccount.name || "Nu Colombia (Cuenta Nu Débito)" }
        : fixedIncomeAccounts.find((a) => a.id === incomeTargetAccountId) || {
            id: incomeTargetAccountId,
            name: "Cuenta de Ahorro",
          };

      const selectedCatObj = INCOME_CATEGORIES.find((c) => c.id === incomeCategory);

      const incomePayload = {
        ...(editTransaction || {}),
        id: editTransaction ? editTransaction.id : `cf_tx_in_${Date.now()}`,
        period: editTransaction?.period || currentPeriod,
        budgetItemId: null,
        budgetItemName: `Ingreso: ${selectedCatObj?.label?.split(" ")[1] || "Transferencia"}`,
        budgetItemType: "income",
        itemType: "income",
        subItemId: null,
        subItemName: null,
        description: description.trim(),
        amount: Number(amount),
        currency,
        date,
        time: time ? (time.length === 5 ? `${time}:00` : time) : null,
        type: "credit",
        isLoan: false,
        loanRecipient: null,
        loanAmount: null,
        loanDueDate: null,
        loanStatus: null,
        isSplit: false,
        participants: [],
        paymentSource: {
          type: isTargetPayroll ? "payroll" : "fixed_pocket",
          targetId: targetAcc.id,
          targetName: targetAcc.name,
        },
        destinationAccountId: targetAcc.id,
        destinationAccountName: targetAcc.name,
        createdAt: editTransaction?.createdAt || new Date().toISOString(),
      };

      if (editTransaction && onUpdateExpenseTransaction) {
        onUpdateExpenseTransaction(incomePayload);
      } else if (onSaveExpenseTransaction) {
        onSaveExpenseTransaction(incomePayload);
      }
    } else {
      // 💸 OUTGOING EXPENSE (Gasto Real o Préstamo Por Cobrar)
      const isPureLoanTx = Boolean(isLoan && (!isSplit || !userIncluded || userShareCalculated < 1));
      const isHormigaTx = selectedBudgetItemId === "want_gastos_hormiga";
      const resolvedBudgetId = isPureLoanTx
        ? "loan_receivable"
        : isHormigaTx
        ? "want_gastos_hormiga"
        : selectedBudgetItem?.id || null;
      const resolvedBudgetName = isPureLoanTx
        ? "🤝 Préstamos (Por Cobrar)"
        : isHormigaTx
        ? "🐜 Gastos Hormiga"
        : selectedBudgetItem?.name || (description.trim() || "Sin Asignar");
      const resolvedBudgetType = isPureLoanTx
        ? "receivable"
        : isHormigaTx
        ? "wants"
        : selectedBudgetItem?.pillarType || null;

      const txPayload = {
        ...(editTransaction || {}),
        id: editTransaction ? editTransaction.id : `tx_${Date.now()}`,
        period: editTransaction?.period || currentPeriod,
        budgetItemId: resolvedBudgetId,
        budgetItemName: resolvedBudgetName,
        budgetItemType: resolvedBudgetType,
        itemType: isWealthItem ? "wealth_saving" : "expense",
        isExplicitBudgetIncome: false,
        isExplicitSankeyIncome: false,
        destinationAccountId: isWealthItem ? (editTransaction?.destinationAccountId || null) : null,
        destinationAccountName: isWealthItem ? (editTransaction?.destinationAccountName || null) : null,
        description: description.trim(),
        amount: Number(amount),
        currency,
        date,
        time: time ? (time.length === 5 ? `${time}:00` : time) : null,
        type: "debit",
        paymentSource: buildPaymentSource(),
        isLoan: Boolean(isLoan),
        loanRecipient: isLoan
          ? isSplit && participants.length > 0
            ? participants.map((p) => p.name).join(", ")
            : (loanRecipient || "Amigo/Familiar").trim()
          : null,
        loanAmount: isLoan
          ? isSplit
            ? finalReceivable
            : (Number(loanAmount) > 0 ? Number(loanAmount) : Number(amount))
          : null,
        loanDueDate: isLoan && loanDueDate ? loanDueDate : null,
        loanStatus: isLoan ? editTransaction?.loanStatus || "pending" : null,
        isSplit: Boolean(isLoan && isSplit),
        splitMode: isLoan && isSplit ? splitMode : null,
        userIncluded: Boolean(isLoan && isSplit && userIncluded),
        userUnits: isLoan && isSplit ? (Number(userUnits) > 0 ? Number(userUnits) : 1) : 1,
        userBaseAmount: isLoan && isSplit ? (Number(userBaseAmount) || 0) : 0,
        userShare: isLoan && isSplit ? userShareCalculated : 0,
        participants: isLoan && isSplit
          ? participants.map((p) => {
              const pShare = getParticipantComputedShare(p);
              return {
                ...p,
                share: pShare,
                customShare: splitMode === "equal" ? null : pShare,
                paid: Boolean(p.paid),
              };
            })
          : (editTransaction?.participants || []),
        remainingLoan: isLoan && isSplit
          ? Math.max(
              0,
              finalReceivable -
                participants.reduce((acc, p) => {
                  const pShare = getParticipantComputedShare(p);
                  return acc + (Number(p.paidAmount) || (p.paid ? pShare : 0));
                }, 0)
            )
          : (editTransaction?.remainingLoan !== undefined ? editTransaction.remainingLoan : (Number(loanAmount) || Number(amount))),
        createdAt: editTransaction?.createdAt || new Date().toISOString(),
      };

      if (editTransaction && onUpdateExpenseTransaction) {
        onUpdateExpenseTransaction(txPayload);
      } else if (onSaveExpenseTransaction) {
        onSaveExpenseTransaction(txPayload);
      }
    }

    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={640}>
      <div className="expense-modal-content-container">
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 10 }}>
          <h3 className="cashflow-modal-title">
            <span>
              {movementNature === "income"
                ? "📥"
                : editTransaction
                ? "✏️"
                : isWealthItem
                ? "💎"
                : "💸"}
            </span>{" "}
            {movementNature === "income"
              ? editTransaction
                ? "Editar Ingreso / Transferencia"
                : "Registrar Ingreso / Abono de Dinero"
              : editTransaction
              ? "Editar Gasto / Préstamo"
              : isWealthItem
              ? "Registrar Aporte a Ahorro / CDT / Inversión"
              : "Registrar Gasto Real Ejecutado"}
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Dual Mode Toggle (Gasto vs Ingreso) — Disponible tanto al crear como al editar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginTop: 6,
            marginBottom: 12,
            padding: 4,
            borderRadius: "12px",
            background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)",
            border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMovementNature("expense");
              if (!editTransaction && !description.trim() && budgetItems.length > 0) {
                setDescription(budgetItems[0]?.name || "");
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: "9px",
              fontSize: "0.82rem",
              fontWeight: movementNature === "expense" ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
              background:
                movementNature === "expense"
                  ? isLight
                    ? "#ffffff"
                    : "rgba(239, 68, 68, 0.22)"
                  : "transparent",
              border:
                movementNature === "expense"
                  ? isLight
                    ? "1px solid rgba(239, 68, 68, 0.4)"
                    : "1px solid rgba(239, 68, 68, 0.5)"
                  : "none",
              color:
                movementNature === "expense"
                  ? isLight
                    ? "#dc2626"
                    : "#fca5a5"
                  : isLight
                  ? "#64748b"
                  : "#94a3b8",
              boxShadow:
                movementNature === "expense" && isLight
                  ? "0 2px 6px rgba(239, 68, 68, 0.12)"
                  : "none",
            }}
          >
            <span>💸</span> Gasto / Salida
          </button>

          <button
            type="button"
            onClick={() => {
              setMovementNature("income");
              if (!editTransaction && !description.trim()) {
                const cat = INCOME_CATEGORIES.find((c) => c.id === incomeCategory);
                setDescription(cat?.defaultDesc || "Transferencia recibida");
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: "9px",
              fontSize: "0.82rem",
              fontWeight: movementNature === "income" ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
              background:
                movementNature === "income"
                  ? isLight
                    ? "#ffffff"
                    : "rgba(16, 185, 129, 0.22)"
                  : "transparent",
              border:
                movementNature === "income"
                  ? isLight
                    ? "1px solid rgba(16, 185, 129, 0.4)"
                    : "1px solid rgba(16, 185, 129, 0.5)"
                  : "none",
              color:
                movementNature === "income"
                  ? isLight
                    ? "#059669"
                    : "#6ee7b7"
                  : isLight
                  ? "#64748b"
                  : "#94a3b8",
              boxShadow:
                movementNature === "income" && isLight
                  ? "0 2px 6px rgba(16, 185, 129, 0.12)"
                  : "none",
            }}
          >
            <span>📥</span> Ingreso / Entrada
          </button>
        </div>

        <p style={{ fontSize: "0.78rem", color: isLight ? "#475569" : "#94a3b8", marginTop: 2, marginBottom: 12 }}>
          {movementNature === "income"
            ? "Registra dinero que entró a una de tus cuentas (RappiCuenta, Nu, Nequi, etc.) y actualiza su saldo en Renta Fija en tiempo real."
            : isWealthItem
            ? "Indica de qué cuenta salió la plata para tu CDT, cuenta de ahorro o inversión (ej. Nómina Nu) para descontarla de tu saldo líquido disponible."
            : "Carga un gasto real consumido a tu sobre presupuestal y elige de qué cuenta o tarjeta salió el dinero."}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* INCOME MODE FORM FIELDS */}
          {movementNature === "income" ? (
            <>
              {/* Category Selector */}
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                  Categoría del Ingreso
                </label>
                <select
                  value={incomeCategory}
                  onChange={(e) => handleIncomeCategoryChange(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                    border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: isLight ? "#0f172a" : "#f8fafc",
                    fontSize: "0.85rem",
                  }}
                >
                  {INCOME_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Account */}
              <div
                style={{
                  background: isLight ? "rgba(16, 185, 129, 0.05)" : "rgba(16, 185, 129, 0.08)",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: isLight ? "1px solid rgba(16, 185, 129, 0.2)" : "1px solid rgba(16, 185, 129, 0.25)",
                }}
              >
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#047857" : "#6ee7b7", marginBottom: 6, fontWeight: 700 }}>
                  🏦 ¿A qué cuenta entró el dinero? (Cuenta Destino)
                </label>
                <select
                  value={incomeTargetAccountId}
                  onChange={(e) => setIncomeTargetAccountId(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    background: isLight ? "#ffffff" : "rgba(0, 0, 0, 0.5)",
                    border: isLight ? "1px solid rgba(0,0,0,0.15)" : "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: isLight ? "#0f172a" : "#f8fafc",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                  }}
                >
                  <option value="payroll">
                    ⭐ {payrollAccount.name || "Cuenta Nu Débito (Nómina)"}
                  </option>
                  {fixedIncomeAccounts
                    .filter((acc) => acc.id !== "acc_nu_debito")
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (${Math.round(acc.balance || 0).toLocaleString("es-CO")} COP)
                      </option>
                    ))}
                </select>
              </div>
            </>
          ) : (
            /* EXPENSE MODE FORM FIELDS */
            <>
              {/* Target Budget Envelope */}
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                  Destino / Sobre Presupuestal a Cargar
                </label>
                <CascadingCategorySelector
                  budgetItems={budgetItems}
                  value={selectedBudgetItemId}
                  onChange={(val) => handleSelectBudgetItem(val)}
                  currency={currency}
                />
              </div>
            </>
          )}

          {/* Description */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
              {movementNature === "income"
                ? "Detalle / Concepto del Ingreso"
                : isWealthItem
                ? "Detalle / Nombre de la Inversión o Aporte"
                : "Detalle / Comercio del Gasto Real"}
            </label>
            <input
              type="text"
              className="currency-native-input"
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "8px 12px",
                color: isLight ? "#0f172a" : "#f8fafc",
                fontSize: "0.85rem",
                boxShadow: isLight ? "inset 0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                movementNature === "income"
                  ? "ej. Transferencia recibida RappiPay, Pago cliente..."
                  : isWealthItem
                  ? "ej. CDT Bancolombia 180 días, Ahorro Vacaciones, Acciones..."
                  : "ej. Almuerzo Crepes & Waffles, Compra Éxito, Cine..."
              }
              required
              autoFocus
            />
          </div>

          {/* Amount, Date & Time */}
          <div className="expense-modal-amount-grid">
            <div className="expense-modal-amount-col">
              <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                {movementNature === "income"
                  ? `Monto (${currency})`
                  : isWealthItem
                  ? `Monto (${currency})`
                  : `Monto (${currency})`}
              </label>
              <CurrencyInput
                value={amount}
                onChange={(val) => setAmount(val)}
                currency={currency}
                placeholder="0"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Fecha
              </label>
              <DynamicDatePicker
                value={date}
                onChange={(d) => setDate(d)}
                placeholder="Seleccionar fecha..."
                direction="auto"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Hora
              </label>
              <input
                type="time"
                step="1"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                  border: isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  color: isLight ? "#0f172a" : "#f8fafc",
                  fontSize: "0.85rem",
                  height: "38px",
                }}
              />
            </div>
          </div>

          {/* Loan / Receivable Option (Only in Expense mode) */}
          {movementNature === "expense" && !isWealthItem && (
            <div
              style={{
                background: isLoan
                  ? isLight
                    ? "rgba(245, 158, 11, 0.12)"
                    : "rgba(245, 158, 11, 0.1)"
                  : isLight
                  ? "rgba(0, 0, 0, 0.02)"
                  : "rgba(255, 255, 255, 0.025)",
                border: isLoan
                  ? "1px solid rgba(245, 158, 11, 0.4)"
                  : isLight
                  ? "1px solid rgba(0, 0, 0, 0.08)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "10px 14px",
                transition: "all 0.15s ease",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: isLoan
                    ? isLight
                      ? "#d97706"
                      : "#fcd34d"
                    : isLight
                    ? "#334155"
                    : "#cbd5e1",
                }}
              >
                <input
                  type="checkbox"
                  checked={isLoan}
                  onChange={(e) => {
                    setIsLoan(e.target.checked);
                    if (e.target.checked && (!loanAmount || loanAmount === 0)) {
                      setLoanAmount(amount);
                    }
                  }}
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#f59e0b" }}
                />
                <span>🤝 ¿Es un préstamo o gasto por cobrar (amigos / familia / terceros)?</span>
              </label>

              {isLoan && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(245, 158, 11, 0.25)" }}>
                  {/* Switch: Dividir gasto compartido / Vaca (Múltiples modos) */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: isSplit
                        ? (isLight ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.2)")
                        : (isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.03)"),
                      border: isSplit
                        ? `1.5px solid ${isLight ? "#3b82f6" : "#60a5fa"}`
                        : `1px solid ${isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}`,
                      marginBottom: 10,
                      cursor: "pointer",
                    }}
                    onClick={() => setIsSplit(!isSplit)}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.82rem", color: isSplit ? (isLight ? "#1d4ed8" : "#93c5fd") : "var(--text-primary)" }}>
                        <span>👥</span> Dividir gasto compartido / Vaca (Múltiples métodos)
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Divide en partes iguales, valor fijo ($), porcentaje (%), por partes/unidades o consumo + propina
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSplit}
                      onChange={(e) => setIsSplit(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#3b82f6" }}
                    />
                  </div>

                  {isSplit ? (
                    /* ── Group split UI ── */
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* ── 5-Mode Split Method Selector ── */}
                      <div>
                        <label style={{ display: "block", fontSize: "0.71rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 5 }}>
                          Método de división:
                        </label>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
                            gap: 5,
                          }}
                        >
                          {[
                            { id: "equal", icon: "⚖️", label: "Partes Iguales", hint: "50/50 o 1/N" },
                            { id: "exact", icon: "💵", label: "Valor Fijo ($)", hint: "Monto exacto" },
                            { id: "percentage", icon: "📊", label: "Porcentaje (%)", hint: "60/40, 70/30..." },
                            { id: "shares", icon: "🍕", label: "Por Partes (1x, 2x)", hint: "Unidades / cupos" },
                            { id: "itemized", icon: "🧾", label: "Consumo + Propina", hint: "Plato + extra prop." },
                          ].map((m) => {
                            const active = splitMode === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setSplitMode(m.id);
                                  if (m.id === "exact") {
                                    setParticipants((prev) =>
                                      prev.map((p) => ({
                                        ...p,
                                        customShare:
                                          p.customShare !== undefined && p.customShare !== null && p.customShare !== ""
                                            ? p.customShare
                                            : getParticipantComputedShare(p),
                                      }))
                                    );
                                  } else if (m.id === "percentage") {
                                    const eqPct = totalSharesCount > 0 ? Number((100 / totalSharesCount).toFixed(1)) : 50;
                                    setParticipants((prev) =>
                                      prev.map((p) => ({
                                        ...p,
                                        percentage:
                                          p.percentage !== undefined && p.percentage !== null && p.percentage !== ""
                                            ? p.percentage
                                            : totalNum > 0 && p.customShare
                                            ? Number(((Number(p.customShare) / totalNum) * 100).toFixed(1))
                                            : eqPct,
                                      }))
                                    );
                                  } else if (m.id === "shares") {
                                    setParticipants((prev) =>
                                      prev.map((p) => ({
                                        ...p,
                                        units: Number(p.units) > 0 ? Number(p.units) : 1,
                                      }))
                                    );
                                  } else if (m.id === "itemized") {
                                    setParticipants((prev) =>
                                      prev.map((p) => ({
                                        ...p,
                                        baseAmount:
                                          p.baseAmount !== undefined && p.baseAmount !== null && p.baseAmount !== ""
                                            ? p.baseAmount
                                            : getParticipantComputedShare(p),
                                      }))
                                    );
                                    if (!userBaseAmount && userIncluded) {
                                      setUserBaseAmount(userShareCalculated);
                                    }
                                  }
                                }}
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: 7,
                                  border: active
                                    ? `1.5px solid ${isLight ? "#2563eb" : "#60a5fa"}`
                                    : `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                                  background: active
                                    ? (isLight ? "rgba(37, 99, 235, 0.12)" : "rgba(59, 130, 246, 0.22)")
                                    : (isLight ? "#ffffff" : "rgba(13, 18, 38, 0.55)"),
                                  color: active
                                    ? (isLight ? "#1d4ed8" : "#93c5fd")
                                    : "var(--text-primary)",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 1,
                                }}
                              >
                                <span style={{ fontSize: "0.73rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                                  <span>{m.icon}</span>
                                  <span>{m.label}</span>
                                </span>
                                <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{m.hint}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Switch: Yo participé en este gasto */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: userIncluded
                            ? (isLight ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.15)")
                            : (isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.02)"),
                          border: userIncluded
                            ? `1px solid ${isLight ? "#3b82f6" : "#60a5fa"}`
                            : `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"}`,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.78rem", color: userIncluded ? (isLight ? "#1d4ed8" : "#93c5fd") : "var(--text-primary)" }}>
                            🙋‍♂️ Yo participé en este gasto
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                            Mi cuota se deduce de la deuda por cobrar y se descuenta de mi sobre como consumo propio
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={userIncluded}
                          onChange={(e) => setUserIncluded(e.target.checked)}
                          style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#3b82f6" }}
                        />
                      </div>

                      {/* Quick percentage presets when splitMode === "percentage" */}
                      {splitMode === "percentage" && participants.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600 }}>
                            ⚡ Presets % (Ellos / Tú):
                          </span>
                          {[
                            { label: "50% / 50%", otherPct: 50 },
                            { label: "60% / 40%", otherPct: 60 },
                            { label: "70% / 30%", otherPct: 70 },
                            { label: "80% / 20%", otherPct: 80 },
                            { label: "40% / 60%", otherPct: 40 },
                            { label: "30% / 70%", otherPct: 30 },
                            { label: "Equitativo", otherPct: null },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                const count = participants.length;
                                if (count === 0) return;
                                const perPart =
                                  preset.otherPct === null
                                    ? Number((100 / (count + (userIncluded ? 1 : 0))).toFixed(2))
                                    : Number((preset.otherPct / count).toFixed(2));
                                setParticipants((prev) =>
                                  prev.map((p) => ({
                                    ...p,
                                    percentage: perPart,
                                  }))
                                );
                              }}
                              style={{
                                padding: "2px 8px",
                                fontSize: "0.67rem",
                                fontWeight: 600,
                                borderRadius: 5,
                                border: `1px solid ${isLight ? "rgba(37,99,235,0.25)" : "rgba(96,165,250,0.3)"}`,
                                background: isLight ? "rgba(37,99,235,0.06)" : "rgba(59,130,246,0.14)",
                                color: isLight ? "#1d4ed8" : "#93c5fd",
                                cursor: "pointer",
                              }}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Participant input & quick count presets */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            Participantes que deben pagar ({participants.length}):
                          </label>
                          <div style={{ display: "flex", gap: 4 }}>
                            <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", alignSelf: "center" }}>Rápido:</span>
                            {[1, 2, 3, 4, 5].map((cnt) => (
                              <button
                                key={cnt}
                                type="button"
                                onClick={() => {
                                  const nextTotalCount = cnt + (userIncluded ? 1 : 0);
                                  const eqShare = nextTotalCount > 0 ? Math.round(totalNum / nextTotalCount) : 0;
                                  const eqPct = nextTotalCount > 0 ? Number((100 / nextTotalCount).toFixed(1)) : 50;
                                  const list = [];
                                  for (let i = 1; i <= cnt; i++) {
                                    list.push({
                                      id: `part_${Date.now()}_${i}`,
                                      name: participants[i - 1]?.name || `Invitado ${i}`,
                                      paid: false,
                                      customShare: eqShare,
                                      percentage: eqPct,
                                      units: 1,
                                      baseAmount: eqShare,
                                    });
                                  }
                                  setParticipants(list);
                                }}
                                style={{
                                  padding: "1px 6px",
                                  fontSize: "0.66rem",
                                  borderRadius: 4,
                                  border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)"}`,
                                  background: "var(--bg-surface)",
                                  color: "var(--text-secondary)",
                                  cursor: "pointer",
                                }}
                              >
                                {cnt}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            type="text"
                            placeholder="Nombre del participante (ej. Nico Barrera, Andrés, Camilo...)"
                            value={newParticipantInput}
                            onChange={(e) => setNewParticipantInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (newParticipantInput.trim()) {
                                  const nextCount = participants.length + 1 + (userIncluded ? 1 : 0);
                                  const defShare = nextCount > 0 ? Math.round(totalNum / nextCount) : 0;
                                  const defPct = nextCount > 0 ? Number((100 / nextCount).toFixed(1)) : 50;
                                  setParticipants([
                                    ...participants,
                                    {
                                      id: `part_${Date.now()}`,
                                      name: newParticipantInput.trim(),
                                      paid: false,
                                      customShare: defShare,
                                      percentage: defPct,
                                      units: 1,
                                      baseAmount: defShare,
                                    },
                                  ]);
                                  setNewParticipantInput("");
                                }
                              }
                            }}
                            style={{
                              flex: 1,
                              background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.8)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: "0.8rem",
                              color: "var(--text-primary)",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (newParticipantInput.trim()) {
                                const nextCount = participants.length + 1 + (userIncluded ? 1 : 0);
                                const defShare = nextCount > 0 ? Math.round(totalNum / nextCount) : 0;
                                const defPct = nextCount > 0 ? Number((100 / nextCount).toFixed(1)) : 50;
                                setParticipants([
                                  ...participants,
                                  {
                                    id: `part_${Date.now()}`,
                                    name: newParticipantInput.trim(),
                                    paid: false,
                                    customShare: defShare,
                                    percentage: defPct,
                                    units: 1,
                                    baseAmount: defShare,
                                  },
                                ]);
                                setNewParticipantInput("");
                              }
                            }}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "#3b82f6",
                              color: "#ffffff",
                              fontWeight: 700,
                              fontSize: "0.74rem",
                              cursor: "pointer",
                            }}
                          >
                            + Agregar
                          </button>
                        </div>

                        {/* Interactive Participant Rows by Split Mode */}
                        {participants.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              marginTop: 8,
                              maxHeight: "230px",
                              overflowY: "auto",
                              padding: "2px",
                            }}
                          >
                            {participants.map((p, idx) => {
                              const resolvedShare = getParticipantComputedShare(p);
                              const resolvedPct = totalNum > 0 ? ((resolvedShare / totalNum) * 100).toFixed(1) : "0.0";

                              return (
                                <div
                                  key={p.id || idx}
                                  style={{
                                    background: isLight ? "#ffffff" : "var(--bg-surface)",
                                    border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"}`,
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    fontSize: "0.75rem",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    flexWrap: "wrap",
                                    gap: 8,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 110 }}>
                                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                                    <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
                                      ({resolvedPct}%)
                                    </span>
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    {/* Mode 1: Equal */}
                                    {splitMode === "equal" && (
                                      <span style={{ fontWeight: 700, color: isLight ? "#b45309" : "#fcd34d", fontFamily: "JetBrains Mono, monospace" }}>
                                        {formatMoney(resolvedShare, currency)}
                                      </span>
                                    )}

                                    {/* Mode 2: Exact Fixed Value ($) */}
                                    {splitMode === "exact" && (
                                      <>
                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>$</span>
                                          <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={p.customShare !== undefined && p.customShare !== null ? p.customShare : resolvedShare}
                                            onChange={(e) => {
                                              const val = e.target.value === "" ? "" : Math.max(0, Number(e.target.value));
                                              setParticipants((prev) =>
                                                prev.map((item, i) => (i === idx ? { ...item, customShare: val } : item))
                                              );
                                            }}
                                            style={{
                                              width: 96,
                                              padding: "4px 7px",
                                              borderRadius: 6,
                                              border: `1px solid ${isLight ? "#cbd5e1" : "rgba(255,255,255,0.2)"}`,
                                              background: isLight ? "#f8fafc" : "rgba(13, 18, 38, 0.9)",
                                              color: "var(--text-primary)",
                                              fontSize: "0.76rem",
                                              fontWeight: 700,
                                              fontFamily: "JetBrains Mono, monospace",
                                            }}
                                          />
                                          {participants.length > 1 && (
                                            <button
                                              type="button"
                                              title="Asignar el saldo restante a esta persona"
                                              onClick={() => {
                                                const othersSum = participants.reduce(
                                                  (s, item, i) => (i === idx ? s : s + getParticipantComputedShare(item)),
                                                  0
                                                );
                                                const rest = Math.max(0, totalNum - othersSum);
                                                setParticipants((prev) =>
                                                  prev.map((item, i) => (i === idx ? { ...item, customShare: rest } : item))
                                                );
                                              }}
                                              style={{
                                                padding: "3px 6px",
                                                fontSize: "0.64rem",
                                                borderRadius: 4,
                                                border: `1px solid ${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)"}`,
                                                background: "transparent",
                                                color: "var(--text-secondary)",
                                                cursor: "pointer",
                                              }}
                                            >
                                              Resto
                                            </button>
                                          )}
                                        </div>
                                      </>
                                    )}

                                    {/* Mode 3: Percentage (%) */}
                                    {splitMode === "percentage" && (
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.5"
                                            value={
                                              p.percentage !== undefined && p.percentage !== null
                                                ? p.percentage
                                                : totalSharesCount > 0
                                                ? Number((100 / totalSharesCount).toFixed(1))
                                                : 50
                                            }
                                            onChange={(e) => {
                                              const val = e.target.value === "" ? "" : Math.min(100, Math.max(0, Number(e.target.value)));
                                              setParticipants((prev) =>
                                                prev.map((item, i) => (i === idx ? { ...item, percentage: val } : item))
                                              );
                                            }}
                                            style={{
                                              width: 64,
                                              padding: "4px 6px",
                                              borderRadius: 6,
                                              border: `1px solid ${isLight ? "#cbd5e1" : "rgba(255,255,255,0.2)"}`,
                                              background: isLight ? "#f8fafc" : "rgba(13, 18, 38, 0.9)",
                                              color: "var(--text-primary)",
                                              fontSize: "0.76rem",
                                              fontWeight: 700,
                                              textAlign: "right",
                                              fontFamily: "JetBrains Mono, monospace",
                                            }}
                                          />
                                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)" }}>%</span>
                                        </div>
                                        <span style={{ fontWeight: 700, color: isLight ? "#b45309" : "#fcd34d", fontFamily: "JetBrains Mono, monospace" }}>
                                          = {formatMoney(resolvedShare, currency)}
                                        </span>
                                      </div>
                                    )}

                                    {/* Mode 4: Shares / Units (1x, 2x, 3x...) */}
                                    {splitMode === "shares" && (
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 6, border: `1px solid ${isLight ? "#cbd5e1" : "rgba(255,255,255,0.18)"}`, overflow: "hidden" }}>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const cur = Number(p.units) > 0 ? Number(p.units) : 1;
                                              const next = Math.max(0.5, Number((cur - (cur <= 1 ? 0.5 : 1)).toFixed(1)));
                                              setParticipants((prev) =>
                                                prev.map((item, i) => (i === idx ? { ...item, units: next } : item))
                                              );
                                            }}
                                            style={{ padding: "2px 7px", border: "none", background: isLight ? "#f1f5f9" : "rgba(255,255,255,0.08)", color: "var(--text-primary)", cursor: "pointer", fontWeight: 700 }}
                                          >
                                            −
                                          </button>
                                          <input
                                            type="number"
                                            min="0.5"
                                            step="0.5"
                                            value={Number(p.units) > 0 ? p.units : 1}
                                            onChange={(e) => {
                                              const val = Math.max(0.1, Number(e.target.value) || 1);
                                              setParticipants((prev) =>
                                                prev.map((item, i) => (i === idx ? { ...item, units: val } : item))
                                              );
                                            }}
                                            style={{
                                              width: 44,
                                              border: "none",
                                              textAlign: "center",
                                              background: "transparent",
                                              color: "var(--text-primary)",
                                              fontSize: "0.74rem",
                                              fontWeight: 700,
                                            }}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const cur = Number(p.units) > 0 ? Number(p.units) : 1;
                                              setParticipants((prev) =>
                                                prev.map((item, i) => (i === idx ? { ...item, units: Number((cur + 1).toFixed(1)) } : item))
                                              );
                                            }}
                                            style={{ padding: "2px 7px", border: "none", background: isLight ? "#f1f5f9" : "rgba(255,255,255,0.08)", color: "var(--text-primary)", cursor: "pointer", fontWeight: 700 }}
                                          >
                                            +
                                          </button>
                                        </div>
                                        <span style={{ fontSize: "0.67rem", color: "var(--text-muted)" }}>partes</span>
                                        <span style={{ fontWeight: 700, color: isLight ? "#b45309" : "#fcd34d", fontFamily: "JetBrains Mono, monospace" }}>
                                          = {formatMoney(resolvedShare, currency)}
                                        </span>
                                      </div>
                                    )}

                                    {/* Mode 5: Itemized Base Consumption + Proportional Tip/Delivery */}
                                    {splitMode === "itemized" && (
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ fontSize: "0.67rem", color: "var(--text-muted)" }}>Plato/Base $</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="100"
                                          value={p.baseAmount !== undefined && p.baseAmount !== null ? p.baseAmount : ""}
                                          placeholder="0"
                                          onChange={(e) => {
                                            const val = e.target.value === "" ? "" : Math.max(0, Number(e.target.value));
                                            setParticipants((prev) =>
                                              prev.map((item, i) => (i === idx ? { ...item, baseAmount: val } : item))
                                            );
                                          }}
                                          style={{
                                            width: 86,
                                            padding: "4px 6px",
                                            borderRadius: 6,
                                            border: `1px solid ${isLight ? "#cbd5e1" : "rgba(255,255,255,0.2)"}`,
                                            background: isLight ? "#f8fafc" : "rgba(13, 18, 38, 0.9)",
                                            color: "var(--text-primary)",
                                            fontSize: "0.75rem",
                                            fontWeight: 700,
                                            fontFamily: "JetBrains Mono, monospace",
                                          }}
                                        />
                                        <span style={{ fontWeight: 700, color: isLight ? "#b45309" : "#fcd34d", fontFamily: "JetBrains Mono, monospace", fontSize: "0.73rem" }}>
                                          ➔ {formatMoney(resolvedShare, currency)}
                                        </span>
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => setParticipants(participants.filter((x, i) => i !== idx))}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--text-muted)",
                                        cursor: "pointer",
                                        fontSize: "0.75rem",
                                        padding: "0 3px",
                                      }}
                                      title="Quitar participante"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              );
                            })}

                            {/* User's own control row when in 'shares' or 'itemized' mode and userIncluded is true */}
                            {userIncluded && (splitMode === "shares" || splitMode === "itemized") && (
                              <div
                                style={{
                                  background: isLight ? "rgba(37, 99, 235, 0.06)" : "rgba(59, 130, 246, 0.14)",
                                  border: `1px dashed ${isLight ? "#3b82f6" : "#60a5fa"}`,
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  fontSize: "0.74rem",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <strong style={{ color: isLight ? "#1d4ed8" : "#93c5fd" }}>🙋‍♂️ Tú (Tu consumo)</strong>
                                  <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
                                    ({totalNum > 0 ? ((userShareCalculated / totalNum) * 100).toFixed(1) : "0.0"}%)
                                  </span>
                                </div>

                                {splitMode === "shares" && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ display: "inline-flex", alignItems: "center", borderRadius: 6, border: `1px solid ${isLight ? "#93c5fd" : "rgba(96,165,250,0.4)"}`, overflow: "hidden" }}>
                                      <button
                                        type="button"
                                        onClick={() => setUserUnits((u) => Math.max(0.5, Number(((Number(u) || 1) - ((Number(u) || 1) <= 1 ? 0.5 : 1)).toFixed(1))))}
                                        style={{ padding: "2px 7px", border: "none", background: isLight ? "#dbeafe" : "rgba(59,130,246,0.25)", color: "var(--text-primary)", cursor: "pointer", fontWeight: 700 }}
                                      >
                                        −
                                      </button>
                                      <input
                                        type="number"
                                        min="0.5"
                                        step="0.5"
                                        value={userUnits}
                                        onChange={(e) => setUserUnits(Math.max(0.1, Number(e.target.value) || 1))}
                                        style={{ width: 44, border: "none", textAlign: "center", background: "transparent", color: "var(--text-primary)", fontSize: "0.74rem", fontWeight: 700 }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setUserUnits((u) => Number(((Number(u) || 1) + 1).toFixed(1)))}
                                        style={{ padding: "2px 7px", border: "none", background: isLight ? "#dbeafe" : "rgba(59,130,246,0.25)", color: "var(--text-primary)", cursor: "pointer", fontWeight: 700 }}
                                      >
                                        +
                                      </button>
                                    </div>
                                    <span style={{ fontSize: "0.67rem", color: "var(--text-muted)" }}>partes</span>
                                    <strong style={{ color: isLight ? "#1d4ed8" : "#93c5fd", fontFamily: "JetBrains Mono, monospace" }}>
                                      = {formatMoney(userShareCalculated, currency)}
                                    </strong>
                                  </div>
                                )}

                                {splitMode === "itemized" && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: "0.67rem", color: "var(--text-muted)" }}>Tu Plato/Base $</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="100"
                                      value={userBaseAmount || ""}
                                      placeholder="0"
                                      onChange={(e) => setUserBaseAmount(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
                                      style={{
                                        width: 86,
                                        padding: "4px 6px",
                                        borderRadius: 6,
                                        border: `1px solid ${isLight ? "#93c5fd" : "rgba(96,165,250,0.4)"}`,
                                        background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.9)",
                                        color: "var(--text-primary)",
                                        fontSize: "0.75rem",
                                        fontWeight: 700,
                                        fontFamily: "JetBrains Mono, monospace",
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setUserBaseAmount(Math.max(0, totalNum - extBaseSum))}
                                      style={{
                                        padding: "2px 6px",
                                        fontSize: "0.63rem",
                                        borderRadius: 4,
                                        border: `1px solid ${isLight ? "#3b82f6" : "#60a5fa"}`,
                                        background: "transparent",
                                        color: isLight ? "#1d4ed8" : "#93c5fd",
                                        cursor: "pointer",
                                      }}
                                    >
                                      Resto
                                    </button>
                                    <strong style={{ color: isLight ? "#1d4ed8" : "#93c5fd", fontFamily: "JetBrains Mono, monospace", fontSize: "0.73rem" }}>
                                      ➔ {formatMoney(userShareCalculated, currency)}
                                    </strong>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Split calculations summary */}
                      <div
                        style={{
                          background: isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.12)",
                          border: `1px solid ${isLight ? "rgba(245, 158, 11, 0.25)" : "rgba(245, 158, 11, 0.2)"}`,
                          borderRadius: 8,
                          padding: "10px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.74rem",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <div>
                          {splitMode === "equal" && (
                            <>
                              <span style={{ color: "var(--text-muted)" }}>Cuota por persona: </span>
                              <strong style={{ color: "var(--text-primary)" }}>{formatMoney(sharePerPerson, currency)}</strong>
                              <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}> ({totalSharesCount} personas)</span>
                            </>
                          )}
                          {splitMode === "exact" && (
                            <>
                              <span style={{ color: "var(--text-muted)" }}>Modo: </span>
                              <strong style={{ color: "var(--text-primary)" }}>💵 Valor Fijo Exacto</strong>
                            </>
                          )}
                          {splitMode === "percentage" && (
                            <>
                              <span style={{ color: "var(--text-muted)" }}>Asignado a otros: </span>
                              <strong style={{ color: "var(--text-primary)" }}>{sumExternalPercentages.toFixed(1)}%</strong>
                              {userIncluded && (
                                <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}> (Tú: {userPercentageRemaining}%)</span>
                              )}
                            </>
                          )}
                          {splitMode === "shares" && (
                            <>
                              <span style={{ color: "var(--text-muted)" }}>Total partes: </span>
                              <strong style={{ color: "var(--text-primary)" }}>{totalUnitsPool}u</strong>
                              <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}> ({formatMoney(valuePerUnit, currency)}/parte)</span>
                            </>
                          )}
                          {splitMode === "itemized" && (
                            <>
                              <span style={{ color: "var(--text-muted)" }}>Base: </span>
                              <strong style={{ color: "var(--text-primary)" }}>{formatMoney(totalBaseConsumption, currency)}</strong>
                              <span style={{ color: itemizedExtraOrTip >= 0 ? "#10b981" : "#f59e0b", fontSize: "0.68rem", marginLeft: 4 }}>
                                ({itemizedExtraOrTip >= 0 ? `+${formatMoney(itemizedExtraOrTip, currency)} propina/extra` : `${formatMoney(itemizedExtraOrTip, currency)} desc.`})
                              </span>
                            </>
                          )}
                        </div>
                        {userIncluded && (
                          <div>
                            <span style={{ color: isLight ? "#1d4ed8" : "#93c5fd" }}>Tu parte (consumo): </span>
                            <strong style={{ color: isLight ? "#1d4ed8" : "#93c5fd" }}>{formatMoney(userShareCalculated, currency)}</strong>
                          </div>
                        )}
                        <div>
                          <span style={{ color: isLight ? "#b45309" : "#fcd34d" }}>Por cobrar: </span>
                          <strong style={{ color: isLight ? "#b45309" : "#fcd34d" }}>{formatMoney(finalReceivable, currency)}</strong>
                        </div>
                        {!userIncluded && Math.abs(unassignedDiff) >= 1 && (
                          <div style={{ width: "100%", fontSize: "0.69rem", color: "#ef4444", fontWeight: 600 }}>
                            ⚠️ Diferencia sin asignar respecto al total: {formatMoney(unassignedDiff, currency)}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Standard 1:1 Loan UI ── */
                    <div
                      className="expense-modal-loan-grid"
                    >
                      <div>
                        <label style={{ display: "block", fontSize: "0.72rem", color: isLight ? "#92400e" : "#fcd34d", marginBottom: 4, fontWeight: 600 }}>
                          ¿A quién le prestaste? (Deudor)
                        </label>
                        <input
                          type="text"
                          value={loanRecipient}
                          onChange={(e) => setLoanRecipient(e.target.value)}
                          placeholder="ej. Camilo, Mamá, Compañero..."
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.8)",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                            borderRadius: "6px",
                            padding: "6px 10px",
                            color: isLight ? "#0f172a" : "#f8fafc",
                            fontSize: "0.82rem",
                          }}
                          required={isLoan}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.72rem", color: isLight ? "#92400e" : "#fcd34d", marginBottom: 4, fontWeight: 600 }}>
                          Monto a Cobrar / Prestado ({currency})
                        </label>
                        <CurrencyInput
                          value={loanAmount}
                          onChange={(val) => setLoanAmount(val)}
                          currency={currency}
                          placeholder="Monto prestado"
                        />
                      </div>
                    </div>
                  )}

                  {/* Tu Consumo Personal Real */}
                  <div
                    style={{
                      marginTop: 10,
                      background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(0, 0, 0, 0.35)",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.76rem",
                      border: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "transparent"}`,
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>💰 Tu Consumo Personal Real:</span>
                    <strong
                      style={{
                        color: userPersonalCost > 0 ? (isLight ? "#0284c7" : "#38bdf8") : "#10b981",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {formatMoney(userPersonalCost, currency)}
                      {userPersonalCost === 0
                        ? " (100% Préstamo - No afecta tu sobre)"
                        : " (Se descuenta de tu sobre)"}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment Source (Only in Expense mode) */}
          {movementNature === "expense" && (
            <div
              style={{
                background: isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(13, 18, 38, 0.6)",
                padding: "12px 14px",
                borderRadius: "12px",
                border: isLight
                  ? "1px solid rgba(0, 0, 0, 0.08)"
                  : "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.76rem",
                    color: isLight ? "#1e293b" : "#94a3b8",
                    margin: 0,
                    fontWeight: 700,
                  }}
                >
                  🏦 ¿De dónde salió la plata? (Cuenta Origen)
                </label>
                <InfoTooltip
                  customContent={{
                    title: "Cuenta Origen del Gasto",
                    tag: "Guía de Registro",
                    tagColor: "#10b981",
                    explanation: "Indica qué cuenta pagó este gasto real. Si sacaste plata de un cajero o pasaste a Nequi y luego compraste algo en la calle, selecciona '💵 Efectivo (Billetera)' para que se descuente únicamente lo que gastaste físicamente.",
                    rule: "Los retiros de cajero o transferencias entre cuentas propias NO son gastos; el dinero sigue siendo tuyo en tu billetera."
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSourceType("payroll")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background:
                      sourceType === "payroll"
                        ? isLight
                          ? "rgba(130, 10, 209, 0.12)"
                          : "rgba(130, 10, 209, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "payroll"
                        ? "1px solid #820ad1"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "payroll"
                        ? isLight
                          ? "#7e22ce"
                          : "#c084fc"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  🏦 Nómina ({payrollAccount.name?.split(" ")[0] || "Nu"})
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("credit_card")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background:
                      sourceType === "credit_card"
                        ? isLight
                          ? "rgba(244, 63, 94, 0.12)"
                          : "rgba(244, 63, 94, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "credit_card"
                        ? "1px solid #f43f5e"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "credit_card"
                        ? isLight
                          ? "#e11d48"
                          : "#f43f5e"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  💳 Tarjeta de Crédito
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("fixed_pocket")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background:
                      sourceType === "fixed_pocket"
                        ? isLight
                          ? "rgba(14, 165, 233, 0.12)"
                          : "rgba(56, 189, 248, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "fixed_pocket"
                        ? "1px solid #0284c7"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "fixed_pocket"
                        ? isLight
                          ? "#0284c7"
                          : "#38bdf8"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  📦 Cuenta de Ahorro / Renta Fija
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("investment_cash")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background:
                      sourceType === "investment_cash"
                        ? isLight
                          ? "rgba(168, 85, 247, 0.12)"
                          : "rgba(168, 85, 247, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "investment_cash"
                        ? "1px solid #9333ea"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "investment_cash"
                        ? isLight
                          ? "#9333ea"
                          : "#a855f7"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  🚀 Inversión / Broker
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("cash")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background:
                      sourceType === "cash"
                        ? isLight
                          ? "rgba(16, 185, 129, 0.12)"
                          : "rgba(16, 185, 129, 0.2)"
                        : isLight
                        ? "#ffffff"
                        : "rgba(255,255,255,0.04)",
                    border:
                      sourceType === "cash"
                        ? "1px solid #10b981"
                        : isLight
                        ? "1px solid rgba(0,0,0,0.12)"
                        : "1px solid rgba(255,255,255,0.06)",
                    color:
                      sourceType === "cash"
                        ? isLight
                          ? "#047857"
                          : "#34d399"
                        : isLight
                        ? "#475569"
                        : "#94a3b8",
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  💵 Efectivo (Billetera)
                </button>
              </div>

              {/* Sub-selector for Credit Card */}
              {sourceType === "credit_card" && (
                <div className="cashflow-form-row" style={{ marginTop: 8 }}>
                  <div>
                    <label style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                      Seleccionar Tarjeta:
                    </label>
                    <select
                      value={selectedCardId}
                      onChange={(e) => setSelectedCardId(e.target.value)}
                      style={{
                        width: "100%",
                        background: isLight ? "#ffffff" : "rgba(0,0,0,0.5)",
                        border: isLight
                          ? "1px solid rgba(0,0,0,0.15)"
                          : "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        color: isLight ? "#0f172a" : "#fff",
                        fontSize: "0.78rem",
                      }}
                    >
                      {creditCards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Cupo: {formatMoney(c.totalLimit, currency)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                      Cuotas (Sin Interés / MSI):
                    </label>
                    <select
                      value={cardInstallments}
                      onChange={(e) => setCardInstallments(Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: isLight ? "#ffffff" : "rgba(0,0,0,0.5)",
                        border: isLight
                          ? "1px solid rgba(0,0,0,0.15)"
                          : "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "6px",
                        padding: "6px 8px",
                        color: isLight ? "#0f172a" : "#fff",
                        fontSize: "0.78rem",
                      }}
                    >
                      <option value={1}>1 Cuota (0% Sin Interés)</option>
                      <option value={2}>2 Cuotas Sin Interés (0% MSI)</option>
                      <option value={3}>3 Cuotas Sin Interés (0% MSI)</option>
                      <option value={4}>4 Cuotas Sin Interés (0% MSI)</option>
                      <option value={5}>5 Cuotas Sin Interés (0% MSI)</option>
                      <option value={6}>6 Cuotas Sin Interés (0% MSI)</option>
                      <option value={8}>8 Cuotas Sin Interés (0% MSI)</option>
                      <option value={9}>9 Cuotas Sin Interés (0% MSI)</option>
                      <option value={10}>10 Cuotas Sin Interés (0% MSI)</option>
                      <option value={12}>12 Cuotas Sin Interés (0% MSI)</option>
                      <option value={18}>18 Cuotas Sin Interés (0% MSI)</option>
                      <option value={24}>24 Cuotas Sin Interés (0% MSI)</option>
                      <option value={36}>36 Cuotas Sin Interés (0% MSI)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Sub-selector for Pockets */}
              {sourceType === "fixed_pocket" && fixedIncomeAccounts.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                    Cuenta de Ahorro / Bolsillo:
                  </label>
                  <select
                    value={selectedPocketId}
                    onChange={(e) => setSelectedPocketId(e.target.value)}
                    style={{
                      width: "100%",
                      background: isLight ? "#ffffff" : "rgba(0,0,0,0.5)",
                      border: isLight
                        ? "1px solid rgba(0,0,0,0.15)"
                        : "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px",
                      padding: "6px 8px",
                      color: isLight ? "#0f172a" : "#fff",
                      fontSize: "0.78rem",
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
          )}

          {/* Modal Actions */}
          <div className="cashflow-modal-footer" style={{ marginTop: 10 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="cashflow-action-btn primary"
              disabled={!description.trim() || Number(amount) <= 0}
              style={{
                background:
                  movementNature === "income"
                    ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                    : undefined,
                boxShadow:
                  movementNature === "income"
                    ? "0 4px 14px rgba(16, 185, 129, 0.35)"
                    : undefined,
              }}
            >
              {editTransaction
                ? movementNature === "income"
                  ? `✓ Guardar como Ingreso (+${formatMoney(amount, currency)})`
                  : `✓ Guardar como Salida (-${formatMoney(amount, currency)})`
                : movementNature === "income"
                ? `✓ Registrar Ingreso (+${formatMoney(amount, currency)})`
                : isWealthItem
                ? "✓ Registrar Aporte / Inversión"
                : "✓ Registrar Gasto Real"}
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
