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
  const [userIncluded, setUserIncluded] = useState(true);
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
    const item = budgetItems.find((b) => b.id === itemId);
    if (item && !editTransaction) {
      setAmount(Number(item.amount) || 0);
      setDescription(item.name || "");

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
        setIsSplit(Boolean(editTransaction.isSplit || (Array.isArray(editTransaction.participants) && editTransaction.participants.length > 0)));
        setUserIncluded(editTransaction.userIncluded !== undefined ? Boolean(editTransaction.userIncluded) : true);
        setParticipants(
          Array.isArray(editTransaction.participants) && editTransaction.participants.length > 0
            ? editTransaction.participants
            : []
        );

        if (isTxIncome) {
          const matchedTarget =
            editTransaction.paymentSource?.targetId ||
            editTransaction.destinationAccountId ||
            "payroll";
          setIncomeTargetAccountId(matchedTarget);
        } else if (editTransaction.paymentSource) {
          setSourceType(editTransaction.paymentSource.type || "payroll");
          if (editTransaction.paymentSource.targetId) {
            if (editTransaction.paymentSource.type === "credit_card") {
              setSelectedCardId(editTransaction.paymentSource.targetId);
              setCardInstallments(editTransaction.paymentSource.installments || 1);
            } else if (editTransaction.paymentSource.type === "fixed_pocket") {
              setSelectedPocketId(editTransaction.paymentSource.targetId);
            }
          }
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
        setUserIncluded(true);
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

  const externalCount = participants.length;
  const totalSharesCount = externalCount + (userIncluded ? 1 : 0);
  const totalNum = Number(amount) || 0;
  const sharePerPerson = isSplit && totalSharesCount > 0 ? Math.round(totalNum / totalSharesCount) : totalNum;
  const userShareCalculated = isSplit && userIncluded ? Math.max(0, totalNum - (sharePerPerson * externalCount)) : 0;
  const finalReceivable = isSplit ? Math.max(0, totalNum - userShareCalculated) : (Number(loanAmount) || totalNum);

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
      const isTargetPayroll = incomeTargetAccountId === "payroll";
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
        description: description.trim(),
        amount: Number(amount),
        currency,
        date,
        time: time ? (time.length === 5 ? `${time}:00` : time) : null,
        type: "credit",
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
      // 💸 OUTGOING EXPENSE (Gasto Real)
      const txPayload = {
        ...(editTransaction || {}),
        id: editTransaction ? editTransaction.id : `tx_${Date.now()}`,
        period: editTransaction?.period || currentPeriod,
        budgetItemId: selectedBudgetItem?.id || null,
        budgetItemName: selectedBudgetItem?.name || (description.trim() || (isLoan ? `Préstamo (${loanRecipient || 'Deudor'})` : "Sin Asignar")),
        budgetItemType: selectedBudgetItem?.pillarType || (isLoan ? "receivable" : null),
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
        userIncluded: Boolean(isLoan && isSplit && userIncluded),
        userShare: isLoan && isSplit ? userShareCalculated : 0,
        participants: isLoan && isSplit
          ? participants.map((p) => ({
              ...p,
              share: sharePerPerson,
              paid: Boolean(p.paid),
            }))
          : (editTransaction?.participants || []),
        remainingLoan: isLoan && isSplit
          ? (editTransaction?.remainingLoan !== undefined ? editTransaction.remainingLoan : finalReceivable)
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

        {/* Dual Mode Toggle (Gasto vs Ingreso) */}
        {!editTransaction && (
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
                if (budgetItems.length > 0) {
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
                const cat = INCOME_CATEGORIES.find((c) => c.id === incomeCategory);
                setDescription(cat?.defaultDesc || "Transferencia recibida");
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
        )}

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
                  {/* Switch: Dividir en partes iguales (Gasto compartido / Vaca) */}
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
                        <span>👥</span> Dividir en partes iguales (Gasto compartido / Vaca)
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Divide el monto en cuotas iguales entre todos los participantes
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

                      {/* Participant input & quick presets */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            Participantes que deben pagar ({participants.length}):
                          </label>
                          <div style={{ display: "flex", gap: 4 }}>
                            <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", alignSelf: "center" }}>Rápido:</span>
                            {[2, 3, 4, 5].map((cnt) => (
                              <button
                                key={cnt}
                                type="button"
                                onClick={() => {
                                  const list = [];
                                  for (let i = 1; i <= cnt; i++) {
                                    list.push({ id: `part_${Date.now()}_${i}`, name: `Invitado ${i}`, paid: false });
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
                            placeholder="Nombre del participante (ej. Andrés, Camilo, Diana...)"
                            value={newParticipantInput}
                            onChange={(e) => setNewParticipantInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (newParticipantInput.trim()) {
                                  setParticipants([...participants, { id: `part_${Date.now()}`, name: newParticipantInput.trim(), paid: false }]);
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
                                setParticipants([...participants, { id: `part_${Date.now()}`, name: newParticipantInput.trim(), paid: false }]);
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

                        {/* Chips of added participants */}
                        {participants.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, maxHeight: "150px", overflowY: "auto", padding: "2px" }}>
                            {participants.map((p, idx) => (
                              <span
                                key={p.id || idx}
                                style={{
                                  background: isLight ? "#ffffff" : "var(--bg-surface)",
                                  border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"}`,
                                  borderRadius: 6,
                                  padding: "3px 8px",
                                  fontSize: "0.72rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  color: "var(--text-primary)",
                                }}
                              >
                                <strong>{p.name}</strong> ({formatMoney(sharePerPerson, currency)})
                                <button
                                  type="button"
                                  onClick={() => setParticipants(participants.filter((x, i) => i !== idx))}
                                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.7rem", padding: 0 }}
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
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
                          gap: 6,
                        }}
                      >
                        <div>
                          <span style={{ color: "var(--text-muted)" }}>Cuota por persona: </span>
                          <strong style={{ color: "var(--text-primary)" }}>{formatMoney(sharePerPerson, currency)}</strong>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}> ({totalSharesCount} personas)</span>
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
              {movementNature === "income"
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
