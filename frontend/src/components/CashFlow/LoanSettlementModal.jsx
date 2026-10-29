import React, { useState, useEffect, useMemo } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import DynamicDatePicker from "../Common/DynamicDatePicker";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import { useTheme } from "../../context/ThemeContext";
import { toast } from "react-hot-toast";
import { toastConfirm } from "../../utils/toastAlerts";
import { useCashFlowStore } from "../../store/cashFlowStore";
import "./CashFlow.css";

export default function LoanSettlementModal({
  isOpen,
  onClose,
  transaction,
  currency = "COP",
  fxRate = 4150,
  payrollAccount = { name: "Nu Colombia (Cuenta Nu)", icon: "💜" },
  creditCards = [],
  fixedIncomeAccounts = [],
  onConfirmSettlement,
  onUpdateSplit,
  onRevertParticipant,
}) {
  if (!transaction) return null;

  const { theme } = useTheme();
  const isLight = theme === "light";
  const formatMoney = (val) => formatCashFlowMoney(val, currency, fxRate);

  // Original transaction base amounts
  const originalTxAmount = Number(transaction.amount) || 0;
  const baseLoanAmount = Number(transaction.loanAmount) > 0 ? Number(transaction.loanAmount) : originalTxAmount;

  // Settlements history
  const previousSettlements = Array.isArray(transaction.settlements) ? transaction.settlements : [];
  const alreadySettledTotal = previousSettlements.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  const currentPendingBalance = Math.max(0, baseLoanAmount - alreadySettledTotal);

  const handleDeleteSettlement = (settlement) => {
    const formattedAmt = formatMoney(settlement.amount);
    const msg = `¿Deseas eliminar este cobro/abono de ${formattedAmt} (${settlement.note || "Registro"})?\n\nEl saldo pendiente por cobrar se restaurará automáticamente.`;
    if (window.confirm(msg)) {
      useCashFlowStore.getState().deleteDebtPayment(transaction.id, settlement.id);
      onClose();
    }
  };

  // Determine initial mode: split vs direct
  const isInitiallySplit = Boolean(
    transaction.isSplit ||
    (Array.isArray(transaction.participants) && transaction.participants.length > 0) ||
    /invitad|vaca|amigos|grupo|compartid/i.test(transaction.loanRecipient || "")
  );

  const [activeTab, setActiveTab] = useState(isInitiallySplit ? "split" : "direct"); // 'split' | 'direct'

  // --- SPLIT MODE STATE ---
  const [userIncluded, setUserIncluded] = useState(
    transaction.userIncluded !== undefined ? Boolean(transaction.userIncluded) : true
  );
  const [participants, setParticipants] = useState(() => {
    if (Array.isArray(transaction.participants) && transaction.participants.length > 0) {
      return transaction.participants;
    }
    // Default initial participants if none saved yet
    const rawRecipient = (transaction.loanRecipient || "").trim();
    if (rawRecipient && !/amigo/i.test(rawRecipient) && !/invitados/i.test(rawRecipient)) {
      const splitNames = rawRecipient.split(/[,y/&]+/).map(n => n.trim()).filter(Boolean);
      if (splitNames.length > 0) {
        return splitNames.map((name, idx) => ({
          id: `part_${Date.now()}_${idx}`,
          name,
          share: 0,
          paid: false,
        }));
      }
    }
    return [
      { id: `part_${Date.now()}_1`, name: "Participante 1", share: 0, paid: false },
      { id: `part_${Date.now()}_2`, name: "Participante 2", share: 0, paid: false },
    ];
  });
  const [newParticipantName, setNewParticipantName] = useState("");
  const [settlingParticipant, setSettlingParticipant] = useState(null); // participant being checked off
  const [participantSettlementStep, setParticipantSettlementStep] = useState("ask_amount"); // 'ask_amount' | 'ask_registered' | 'choose_account'
  const [editingParticipantId, setEditingParticipantId] = useState(null);
  const [customShareInput, setCustomShareInput] = useState(0);
  const [settlingAmount, setSettlingAmount] = useState(0);
  const [registerAsBudgetInflow, setRegisterAsBudgetInflow] = useState(false);

  // --- DIRECT SETTLEMENT STATE ---
  const [settlementAmount, setSettlementAmount] = useState(currentPendingBalance);
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split("T")[0]);

  // Destination account for the returned money
  const defaultDestination = transaction.paymentSource?.type === "credit_card" ? "credit_card" : "payroll";
  const [targetType, setTargetType] = useState(defaultDestination);
  const [selectedCardId, setSelectedCardId] = useState(
    transaction.paymentSource?.type === "credit_card" && transaction.paymentSource?.targetId
      ? transaction.paymentSource.targetId
      : creditCards[0]?.id || ""
  );
  const [selectedPocketId, setSelectedPocketId] = useState(fixedIncomeAccounts[0]?.id || "");
  const [note, setNote] = useState("");

  // Target account helpers from fixedIncomeAccounts
  const nequiAccount = useMemo(() => {
    return (fixedIncomeAccounts || []).find((a) => (a.name || "").toLowerCase().includes("nequi"));
  }, [fixedIncomeAccounts]);

  const otherWallets = useMemo(() => {
    return (fixedIncomeAccounts || []).filter(
      (a) =>
        (a.accountCategory === "digital_wallet" || a.type === "wallet") &&
        !(a.name || "").toLowerCase().includes("nequi")
    );
  }, [fixedIncomeAccounts]);

  const savingsPockets = useMemo(() => {
    return (fixedIncomeAccounts || []).filter(
      (a) =>
        a.accountCategory !== "payroll" &&
        a.accountCategory !== "digital_wallet" &&
        a.type !== "wallet" &&
        !(a.name || "").toLowerCase().includes("nomina") &&
        !(a.name || "").toLowerCase().includes("nómina") &&
        !(a.name || "").toLowerCase().includes("nequi") &&
        !(a.name || "").toLowerCase().includes("daviplata")
    );
  }, [fixedIncomeAccounts]);

  const [selectedWalletId, setSelectedWalletId] = useState("");
  useEffect(() => {
    if (otherWallets.length > 0 && !selectedWalletId) {
      setSelectedWalletId(otherWallets[0].id);
    }
  }, [otherWallets, selectedWalletId]);

  useEffect(() => {
    if (savingsPockets.length > 0 && !selectedPocketId) {
      setSelectedPocketId(savingsPockets[0].id);
    }
  }, [savingsPockets, selectedPocketId]);

  // Sync state if transaction changes
  useEffect(() => {
    if (transaction) {
      const base = Number(transaction.loanAmount) > 0 ? Number(transaction.loanAmount) : Number(transaction.amount) || 0;
      const prev = Array.isArray(transaction.settlements) ? transaction.settlements : [];
      const settled = prev.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
      setSettlementAmount(Math.max(0, base - settled));

      if (Array.isArray(transaction.participants) && transaction.participants.length > 0) {
        setParticipants(transaction.participants);
      }
      if (transaction.userIncluded !== undefined) {
        setUserIncluded(Boolean(transaction.userIncluded));
      }
    }
  }, [transaction]);

  // --- SPLIT CALCULATIONS WITH PARTIAL / CUSTOM BONIFICACIÓN SUPPORT ---
  const externalParticipants = useMemo(() => participants.filter((p) => !p.isUser), [participants]);
  const externalCount = externalParticipants.length;
  const totalSharesCount = externalCount + (userIncluded ? 1 : 0);
  const totalAmountToSplit = originalTxAmount > 0 ? originalTxAmount : baseLoanAmount;

  // Count participants with custom assigned share vs automatic
  const customAssignedTotal = externalParticipants
    .filter((p) => p.customShare !== undefined && p.customShare !== null && p.customShare !== "")
    .reduce((sum, p) => sum + (Number(p.customShare) || 0), 0);
  const nonCustomCount = externalParticipants.filter(
    (p) => p.customShare === undefined || p.customShare === null || p.customShare === ""
  ).length + (userIncluded ? 1 : 0);

  const remainingToDistribute = Math.max(0, totalAmountToSplit - customAssignedTotal);
  const sharePerPerson = nonCustomCount > 0 ? Math.round(remainingToDistribute / nonCustomCount) : 0;

  // Helper getters for any participant
  const getParticipantShare = (p) => {
    if (p.customShare !== undefined && p.customShare !== null && p.customShare !== "") {
      return Number(p.customShare) || 0;
    }
    return Number(p.share) > 0 ? Number(p.share) : sharePerPerson;
  };

  const getParticipantPaid = (p) => {
    const s = getParticipantShare(p);
    return Number(p.paidAmount) || (p.paid ? s : 0);
  };

  const getParticipantPending = (p) => {
    return Math.max(0, getParticipantShare(p) - getParticipantPaid(p));
  };

  // User's personal share and receivable totals
  const totalReceivableFromOthers = externalParticipants.reduce((sum, p) => sum + getParticipantShare(p), 0);
  const userShare = userIncluded ? Math.max(0, totalAmountToSplit - totalReceivableFromOthers) : 0;

  const totalPaidByOthers = useMemo(() => {
    return externalParticipants.reduce((acc, p) => acc + getParticipantPaid(p), 0);
  }, [externalParticipants, sharePerPerson, participants]);

  const pendingReceivableFromOthers = Math.max(0, totalReceivableFromOthers - totalPaidByOthers);
  const isAllExternalPaid = externalCount > 0 && externalParticipants.every((p) => getParticipantPending(p) === 0);
  const paidParticipants = useMemo(() => externalParticipants.filter((p) => getParticipantPending(p) === 0), [externalParticipants, participants]);

  // Direct settlement helpers
  const remainingAfterThisDirect = Math.max(0, currentPendingBalance - (Number(settlementAmount) || 0));
  const isFullSettlementDirect = Number(settlementAmount) >= currentPendingBalance;

  // Add a participant
  const handleAddParticipant = () => {
    const trimmed = newParticipantName.trim();
    if (!trimmed) return;
    const newPart = {
      id: `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: trimmed,
      share: sharePerPerson,
      paid: false,
    };
    const updated = [...participants, newPart];
    setParticipants(updated);
    setNewParticipantName("");
  };

  // Remove a participant
  const handleRemoveParticipant = (id) => {
    if (participants.length <= 1) {
      toast.error("Debe haber al menos un participante.");
      return;
    }
    const updated = participants.filter((p) => p.id !== id);
    setParticipants(updated);
  };

  // Quick split generator helper (e.g. split into 3, 4, 5 people)
  const handleQuickPreset = (count) => {
    const list = [];
    for (let i = 1; i <= count; i++) {
      list.push({
        id: `part_${Date.now()}_${i}`,
        name: `Participante ${i}`,
        share: 0,
        paid: false,
      });
    }
    setParticipants(list);
    toast.success(`Dividido en ${count} participantes`, { icon: "👥" });
  };

  // Save Split Configuration to Store & Backend
  const handleSaveSplitConfig = () => {
    const updatedParticipants = participants.map((p) => {
      const effShare = getParticipantShare(p);
      return {
        ...p,
        share: effShare,
        customShare: p.customShare !== undefined && p.customShare !== null && p.customShare !== "" ? Number(p.customShare) : null,
      };
    });

    if (onUpdateSplit) {
      onUpdateSplit(transaction.id, {
        isSplit: true,
        userIncluded,
        userShare,
        loanRecipient: updatedParticipants.map((p) => p.name).join(", "),
        loanAmount: totalReceivableFromOthers,
        remainingLoan: pendingReceivableFromOthers,
        loanStatus: isAllExternalPaid ? "settled" : totalPaidByOthers > 0 ? "partially_settled" : "pending",
        participants: updatedParticipants,
      });
    }
    onClose();
  };

  // Custom share handlers
  const handleStartEditCustomShare = (p) => {
    setEditingParticipantId(p.id);
    setCustomShareInput(getParticipantShare(p));
  };

  const handleSaveCustomShare = (pId) => {
    const val = Number(customShareInput);
    setParticipants((prev) =>
      prev.map((p) => (p.id === pId ? { ...p, customShare: val > 0 ? val : null } : p))
    );
    setEditingParticipantId(null);
    toast.success("Cuota personalizada actualizada", { icon: "✏️" });
  };

  const handleResetCustomShare = (pId) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === pId ? { ...p, customShare: null } : p))
    );
    setEditingParticipantId(null);
    toast.success("Restablecido a reparto equitativo", { icon: "🔄" });
  };

  // Check off or partially settle a participant
  const handleOpenParticipantCheck = async (participant) => {
    const effShare = getParticipantShare(participant);
    const paidSoFar = getParticipantPaid(participant);
    const pendingToPay = Math.max(0, effShare - paidSoFar);

    if (participant.paid || (pendingToPay === 0 && effShare > 0)) {
      // Already fully paid -> offer to revert
      const ok = await toastConfirm(`¿Deseas desmarcar el pago de ${participant.name}?`);
      if (ok) {
        if (onRevertParticipant) {
          onRevertParticipant(transaction.id, participant.id);
        }
        setParticipants((prev) =>
          prev.map((p) => (p.id === participant.id ? { ...p, paid: false, paidAmount: 0, paidAt: null, targetName: null, alreadyRegistered: null } : p))
        );
      }
      return;
    }

    setSettlingParticipant({
      ...participant,
      effectiveShare: effShare,
      pendingToPay,
      paidSoFar,
    });
    setSettlingAmount(pendingToPay);
    setParticipantSettlementStep("ask_amount");
  };

  // Confirm Participant Payment (Full or Partial / Bonificación)
  const handleConfirmParticipantPayment = (alreadyRegisteredParam) => {
    if (!settlingParticipant) return;

    const isNoIncome = Boolean(
      alreadyRegisteredParam ||
      targetType === "already_registered" ||
      targetType === "split_offset"
    );

    let targetId = null;
    let targetName = targetType === "split_offset"
      ? "Gasto dividido (Cruce sin ingreso)"
      : "Registrado previamente";

    if (!isNoIncome) {
      if (targetType === "nequi") {
        targetId = nequiAccount?.id || "acc_nequi_disp";
        targetName = nequiAccount?.name || "Disponible Nequi";
      } else if (targetType === "digital_wallet") {
        const wallet = (fixedIncomeAccounts || []).find((a) => a.id === selectedWalletId) || otherWallets[0];
        targetId = wallet?.id || "acc_daviplata_disp";
        targetName = wallet ? wallet.name : "Billetera Digital";
      } else if (targetType === "credit_card") {
        const card = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
        targetId = card?.id;
        targetName = card ? card.name : "Tarjeta de Crédito";
      } else if (targetType === "payroll") {
        targetName = payrollAccount.name || "Cuenta Nu (Nómina)";
        targetId = "acc_nu_debito";
      } else if (targetType === "fixed_pocket") {
        const pocket = (fixedIncomeAccounts || []).find((p) => p.id === selectedPocketId) || savingsPockets[0];
        targetId = pocket?.id;
        targetName = pocket ? pocket.name : "Cuenta de Ahorro / Cajita";
      } else if (targetType === "cash") {
        targetName = "Efectivo Físico / Billetera";
        targetId = "cash_wallet";
      }
    }

    const effShare = settlingParticipant.effectiveShare || getParticipantShare(settlingParticipant);
    const prevPaid = settlingParticipant.paidSoFar || getParticipantPaid(settlingParticipant);
    const amountToPay = Number(settlingAmount) > 0 ? Number(settlingAmount) : Math.max(0, effShare - prevPaid);
    const newTotalPaid = prevPaid + amountToPay;
    const isNowFullyPaid = newTotalPaid >= effShare;

    if (onConfirmSettlement) {
      onConfirmSettlement(transaction.id, {
        participantId: settlingParticipant.id,
        participantName: settlingParticipant.name,
        amount: amountToPay,
        date: settlementDate,
        targetType: isNoIncome ? (targetType === "split_offset" ? "split_offset" : "already_registered") : targetType,
        targetId,
        targetName,
        recipient: settlingParticipant.name,
        alreadyRegistered: isNoIncome,
        registerAsBudgetInflow: !isNoIncome && registerAsBudgetInflow,
        isPartial: !isNowFullyPaid,
        note: targetType === "split_offset"
          ? `Cruce de cuentas / gasto dividido con ${settlingParticipant.name} (Sin ingreso)`
          : !isNowFullyPaid
          ? `Abono parcial / bonificación de ${settlingParticipant.name} ($${Math.round(amountToPay).toLocaleString("es-CO")}) por ${transaction.description || "Gasto compartido"}`
          : `Pago cuota de ${settlingParticipant.name} (Gasto compartido: ${transaction.description || "Préstamo"})`,
        currency,
      });
    }

    // Update local state immediately
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === settlingParticipant.id
          ? {
              ...p,
              paid: isNowFullyPaid,
              paidAmount: newTotalPaid,
              paidAt: settlementDate,
              targetName,
              alreadyRegistered: isNoIncome,
            }
          : p
      )
    );

    setSettlingParticipant(null);
    toast.success(
      targetType === "split_offset"
        ? `Cuota de ${settlingParticipant.name} saldada por gasto dividido (sin registrar ingreso) 🤝`
        : isNoIncome
        ? `Cuota de ${settlingParticipant.name} marcada como pagada (sin duplicar) ✓`
        : `Abono de ${settlingParticipant.name} registrado en ${targetName} 💵`
    );
  };

  // Quick 1-click settlement for roommate/friend shared expense without creating income
  const handleQuickOffsetParticipant = async (participant) => {
    const effShare = getParticipantShare(participant);
    const paidSoFar = getParticipantPaid(participant);
    const pendingToPay = Math.max(0, effShare - paidSoFar);
    if (pendingToPay <= 0) return;

    const ok = await toastConfirm(
      `¿Marcar la cuota de ${participant.name} (${formatMoney(pendingToPay)}) como saldada por gasto dividido / cruce con roomie (sin registrar entrada de dinero)?`
    );
    if (!ok) return;

    const targetName = "Gasto dividido (Cruce sin ingreso)";

    if (onConfirmSettlement) {
      onConfirmSettlement(transaction.id, {
        participantId: participant.id,
        participantName: participant.name,
        amount: pendingToPay,
        date: settlementDate || new Date().toISOString().slice(0, 10),
        targetType: "split_offset",
        targetId: null,
        targetName,
        recipient: participant.name,
        alreadyRegistered: true,
        isPartial: false,
        note: `Cruce de cuentas / gasto dividido con ${participant.name} (Sin ingreso)`,
        currency,
      });
    }

    setParticipants((prev) =>
      prev.map((p) =>
        p.id === participant.id
          ? {
              ...p,
              paid: true,
              paidAmount: effShare,
              paidAt: settlementDate || new Date().toISOString().slice(0, 10),
              targetName,
              alreadyRegistered: true,
            }
          : p
      )
    );
    toast.success(`Cuota de ${participant.name} saldada por gasto dividido con roomie 🤝`);
  };

  // Handle Direct Lump-Sum Settlement Submit
  const handleDirectSubmit = (e) => {
    e.preventDefault();
    if (Number(settlementAmount) <= 0) return;

    const isNoIncome = targetType === "already_registered" || targetType === "split_offset";
    let targetId = null;
    let targetName = targetType === "split_offset"
      ? "Gasto dividido (Cruce sin ingreso)"
      : targetType === "already_registered"
      ? "Registrado previamente"
      : (payrollAccount.name || "Cuenta de Nómina");

    if (!isNoIncome) {
      if (targetType === "nequi") {
        targetId = nequiAccount?.id || "acc_nequi_disp";
        targetName = nequiAccount?.name || "Disponible Nequi";
      } else if (targetType === "digital_wallet") {
        const wallet = (fixedIncomeAccounts || []).find((a) => a.id === selectedWalletId) || otherWallets[0];
        targetId = wallet?.id;
        targetName = wallet ? wallet.name : "Billetera Digital";
      } else if (targetType === "credit_card") {
        const card = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
        targetId = card?.id;
        targetName = card ? card.name : "Tarjeta de Crédito";
      } else if (targetType === "fixed_pocket") {
        const pocket = (fixedIncomeAccounts || []).find((p) => p.id === selectedPocketId) || savingsPockets[0];
        targetId = pocket?.id;
        targetName = pocket ? pocket.name : "Cuenta de Ahorro";
      } else if (targetType === "investment_cash") {
        targetName = "Portafolio de Inversión / Broker";
      } else if (targetType === "cash") {
        targetName = "Efectivo / Billetera (Cash físico)";
        targetId = "cash_wallet";
      }
    }

    onConfirmSettlement(transaction.id, {
      amount: Number(settlementAmount),
      date: settlementDate,
      targetType: isNoIncome ? (targetType === "split_offset" ? "split_offset" : "already_registered") : targetType,
      targetId,
      targetName,
      recipient: transaction.loanRecipient || "Amigo/Familiar",
      description: transaction.description || "Préstamo",
      note: note.trim(),
      alreadyRegistered: isNoIncome,
      registerAsBudgetInflow: !isNoIncome && registerAsBudgetInflow,
      currency,
    });

    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={720}>
      <div className="expense-modal-content-container">
        {/* Modal Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 12 }}>
          <div>
            <h3 className="cashflow-modal-title" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <span>🤝</span> {activeTab === "split" ? "Gasto Compartido & Cobros" : "Registrar Cobro de Préstamo"}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
              {transaction.description || "Movimiento"} • Total original: <strong style={{ color: "var(--text-primary)" }}>{formatMoney(originalTxAmount || baseLoanAmount)}</strong>
            </p>
          </div>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tab Selector: Gasto Compartido (Vaca) vs Cobro Directo */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
            padding: 4,
            borderRadius: 10,
            marginTop: 10,
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("split")}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "none",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: activeTab === "split" ? (isLight ? "#ffffff" : "rgba(59, 130, 246, 0.25)") : "transparent",
              color: activeTab === "split" ? (isLight ? "#1d4ed8" : "#93c5fd") : "var(--text-muted)",
              boxShadow: activeTab === "split" && isLight ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span>👥</span> Dividir en Partes Iguales (Vaca)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("direct")}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "none",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: activeTab === "direct" ? (isLight ? "#ffffff" : "rgba(16, 185, 129, 0.25)") : "transparent",
              color: activeTab === "direct" ? (isLight ? "#047857" : "#6ee7b7") : "var(--text-muted)",
              boxShadow: activeTab === "direct" && isLight ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span>💳</span> Cobro Directo / Único
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 1: SPLIT EXPENSE (DIVIDIR EN PARTES IGUALES)               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "split" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Action 1: "Yo participé en este gasto" Switch */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: 10,
                background: userIncluded
                  ? (isLight ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.15)")
                  : (isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.03)"),
                border: userIncluded
                  ? `1.5px solid ${isLight ? "#3b82f6" : "#60a5fa"}`
                  : `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)"}`,
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ flex: 1, paddingRight: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.84rem", color: userIncluded ? (isLight ? "#1d4ed8" : "#93c5fd") : "var(--text-primary)" }}>
                  <span>🙋‍♂️</span> Yo participé en este gasto
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                  {userIncluded
                    ? "Tu parte se deduce de la deuda por cobrar y queda como tu gasto personal (no te la pagas a ti mismo)."
                    : "No participaste (pagaste el 100% en nombre de los demás; todos deben reintegrarte el total)."}
                </div>
              </div>

              <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, flexShrink: 0, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={userIncluded}
                  onChange={(e) => setUserIncluded(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: "absolute",
                    cursor: "pointer",
                    inset: 0,
                    background: userIncluded ? "#3b82f6" : (isLight ? "#cbd5e1" : "#475569"),
                    borderRadius: 24,
                    transition: "0.2s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      content: '""',
                      height: 18,
                      width: 18,
                      left: userIncluded ? 22 : 3,
                      bottom: 3,
                      background: "#ffffff",
                      borderRadius: "50%",
                      transition: "0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </span>
              </label>
            </div>

            {/* Live Breakdown Summary Card */}
            <div
              style={{
                background: isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.12)",
                border: `1px solid ${isLight ? "rgba(245, 158, 11, 0.3)" : "rgba(245, 158, 11, 0.25)"}`,
                borderRadius: 12,
                padding: "12px 16px",
              }}
            >
              <div className="loan-split-metrics-grid" style={{ display: "grid", gridTemplateColumns: userIncluded ? "repeat(auto-fit, minmax(130px, 1fr))" : "1fr 1fr", gap: 10, textAlign: "center" }}>
                <div>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>
                    Total Gasto
                  </span>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
                    {formatMoney(totalAmountToSplit)}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    {totalSharesCount} personas ({formatMoney(sharePerPerson)} c/u)
                  </div>
                </div>

                {userIncluded && (
                  <div style={{ borderLeft: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, borderRight: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}` }}>
                    <span style={{ fontSize: "0.68rem", color: isLight ? "#1d4ed8" : "#93c5fd", fontWeight: 700, textTransform: "uppercase" }}>
                      👤 Tu Gasto Propio
                    </span>
                    <div style={{ fontSize: "1rem", fontWeight: 800, color: isLight ? "#1d4ed8" : "#93c5fd", marginTop: 2 }}>
                      {formatMoney(userShare)}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: isLight ? "#1e40af" : "#bfdbfe" }}>
                      (Deducido de la deuda)
                    </div>
                  </div>
                )}

                <div>
                  <span style={{ fontSize: "0.68rem", color: isLight ? "#b45309" : "#fcd34d", fontWeight: 700, textTransform: "uppercase" }}>
                    ⏳ Saldo Por Cobrar
                  </span>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: pendingReceivableFromOthers > 0 ? (isLight ? "#b45309" : "#fcd34d") : "#10b981", marginTop: 2 }}>
                    {formatMoney(pendingReceivableFromOthers)}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: isAllExternalPaid ? "#10b981" : "var(--text-muted)" }}>
                    {isAllExternalPaid ? "✓ 100% Liquidado" : `${paidParticipants.length} de ${externalCount} cobrados`}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{ marginTop: 10, background: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)", height: 6, borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${externalCount > 0 ? (paidParticipants.length / externalCount) * 100 : 0}%`,
                    background: isAllExternalPaid ? "#10b981" : "#f59e0b",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>

            {/* Participant Management Controls */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Participantes que deben pagar ({externalCount}):
                </label>
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", alignSelf: "center", marginRight: 2 }}>Rápido:</span>
                  {[2, 3, 4, 5].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => handleQuickPreset(cnt)}
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

              {/* Add Participant Input */}
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  type="text"
                  value={newParticipantName}
                  onChange={(e) => setNewParticipantName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddParticipant();
                    }
                  }}
                  placeholder="Escribe el nombre de un participante..."
                  style={{
                    flex: 1,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "7px 10px",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddParticipant}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: isLight ? "#3b82f6" : "#2563eb",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.78rem",
                    cursor: "pointer",
                  }}
                >
                  + Agregar
                </button>
              </div>

              {/* Participants Interactive List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "320px", overflowY: "auto", paddingRight: 2 }}>
                {participants.map((p, index) => {
                  if (p.isUser) return null;
                  const effShare = getParticipantShare(p);
                  const paidSoFar = getParticipantPaid(p);
                  const pendingToPay = getParticipantPending(p);
                  const isPaid = pendingToPay === 0 && effShare > 0;
                  const isPartial = paidSoFar > 0 && pendingToPay > 0;
                  const hasCustomShare = p.customShare !== undefined && p.customShare !== null && p.customShare !== "";
                  const isCurrentlySettling = settlingParticipant?.id === p.id;
                  const isEditingCustomShare = editingParticipantId === p.id;

                  return (
                    <div
                      key={p.id || index}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: isPaid
                          ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.15)")
                          : isPartial
                          ? (isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.15)")
                          : (isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.03)"),
                        border: isPaid
                          ? `1px solid ${isLight ? "rgba(16, 185, 129, 0.3)" : "rgba(16, 185, 129, 0.35)"}`
                          : isPartial
                          ? `1px solid ${isLight ? "rgba(245, 158, 11, 0.35)" : "rgba(245, 158, 11, 0.4)"}`
                          : `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)"}`,
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        {/* Checkbox & Participant Name */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 160 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenParticipantCheck(p)}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 7,
                              border: isPaid
                                ? "none"
                                : isPartial
                                ? `2px solid ${isLight ? "#d97706" : "#fbbf24"}`
                                : `2px solid ${isLight ? "#94a3b8" : "#64748b"}`,
                              background: isPaid ? "#10b981" : isPartial ? (isLight ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.25)") : "transparent",
                              color: isPaid ? "#ffffff" : (isLight ? "#d97706" : "#fbbf24"),
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.85rem",
                              fontWeight: 800,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              flexShrink: 0,
                            }}
                            title={isPaid ? "Clic para desmarcar pago" : isPartial ? "Abono parcial registrado - Clic para abonar restante o desmarcar" : "Marcar como pagado o abonar"}
                          >
                            {isPaid ? "✓" : isPartial ? "½" : ""}
                          </button>

                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.84rem", color: isPaid ? (isLight ? "#047857" : "#34d399") : isPartial ? (isLight ? "#b45309" : "#fbbf24") : "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                              <span>{p.name}</span>
                              {hasCustomShare && (
                                <span style={{ fontSize: "0.62rem", padding: "1px 5px", borderRadius: 4, background: isLight ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.2)", color: isLight ? "#1d4ed8" : "#93c5fd", fontWeight: 700 }}>
                                  Cuota Personalizada
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              {isPaid
                                ? `✓ Cobrado 100% • ${p.targetName || "Cuenta"} ${p.paidAt ? `(${p.paidAt.slice(0, 10)})` : ""}`
                                : isPartial
                                ? `Abonado: ${formatMoney(paidSoFar)} • Pendiente: ${formatMoney(pendingToPay)}`
                                : `Pendiente de cobro`}
                            </div>
                          </div>
                        </div>

                        {/* Amount & Actions */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: "0.92rem",
                              fontWeight: 800,
                              color: isPaid ? "#10b981" : isPartial ? (isLight ? "#b45309" : "#fbbf24") : (isLight ? "#1e293b" : "#f1f5f9"),
                            }}
                          >
                            {isPartial ? `${formatMoney(paidSoFar)} / ` : ""}{formatMoney(effShare)}
                          </span>

                          {!isPaid ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenParticipantCheck(p)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  border: `1px solid ${isPartial ? (isLight ? "#d97706" : "#f59e0b") : (isLight ? "#059669" : "#10b981")}`,
                                  background: isPartial
                                    ? (isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)")
                                    : (isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.18)"),
                                  color: isPartial ? (isLight ? "#b45309" : "#fbbf24") : (isLight ? "#047857" : "#6ee7b7"),
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {isPartial ? "Abonar restante" : "Cobrar"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleQuickOffsetParticipant(p)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 6,
                                  border: isLight ? "1px solid rgba(6, 182, 212, 0.45)" : "1px solid rgba(6, 182, 212, 0.5)",
                                  background: isLight ? "rgba(6, 182, 212, 0.1)" : "rgba(6, 182, 212, 0.18)",
                                  color: isLight ? "#0891b2" : "#22d3ee",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                }}
                                title="Marcar como pagado por cruce de cuentas o gasto dividido con roomie (sin registrar entrada de dinero en tus cuentas)"
                              >
                                🤝 Sin ingreso
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenParticipantCheck(p)}
                              style={{
                                padding: "3px 6px",
                                borderRadius: 4,
                                border: "none",
                                background: "transparent",
                                color: "var(--text-muted)",
                                fontSize: "0.68rem",
                                cursor: "pointer",
                                textDecoration: "underline",
                              }}
                              title="Desmarcar pago si fue un error"
                            >
                              ↩ Desmarcar
                            </button>
                          )}

                          {!isPaid && !isEditingCustomShare && (
                            <button
                              type="button"
                              onClick={() => handleStartEditCustomShare(p)}
                              style={{
                                padding: "3px 6px",
                                borderRadius: 6,
                                border: `1px solid var(--border)`,
                                background: "var(--bg-surface)",
                                color: "var(--text-secondary)",
                                fontSize: "0.68rem",
                                cursor: "pointer",
                              }}
                              title="Asignar cuota fija o bonificación a este participante"
                            >
                              ✏️ Cuota
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(p.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                              padding: "2px 4px",
                            }}
                            title="Eliminar participante"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* ── Sub-panel: Inline Custom Share / Bonificación Editor ── */}
                      {isEditingCustomShare && (
                        <div
                          style={{
                            marginTop: 4,
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: isLight ? "#ffffff" : "rgba(30, 41, 59, 0.8)",
                            border: `1.5px solid ${isLight ? "#3b82f6" : "#60a5fa"}`,
                            boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.05)" : "0 4px 12px rgba(0,0,0,0.3)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-primary)" }}>
                              Personalizar Cuota o Bonificación para <strong>{p.name}</strong>:
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingParticipantId(null)}
                              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.72rem" }}
                            >
                              ✕
                            </button>
                          </div>

                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <div style={{ flex: 1 }}>
                              <CurrencyInput
                                value={customShareInput}
                                onChange={setCustomShareInput}
                                currency={currency}
                                style={{
                                  width: "100%",
                                  background: "var(--bg-surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 6,
                                  padding: "6px 8px",
                                  fontSize: "0.8rem",
                                  color: "var(--text-primary)",
                                  fontWeight: 700,
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSaveCustomShare(p.id)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: 6,
                                border: "none",
                                background: isLight ? "#3b82f6" : "#2563eb",
                                color: "#ffffff",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Guardar
                            </button>
                            {hasCustomShare && (
                              <button
                                type="button"
                                onClick={() => handleResetCustomShare(p.id)}
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: 6,
                                  border: `1px solid var(--border)`,
                                  background: "var(--bg-surface)",
                                  color: "var(--text-secondary)",
                                  fontSize: "0.7rem",
                                  cursor: "pointer",
                                }}
                                title="Volver a división en partes iguales"
                              >
                                Restablecer
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 4 }}>
                            Define cuánto debe pagar esta persona. Si tiene una bonificación o descuento, puedes ingresar el valor reducido.
                          </div>
                        </div>
                      )}

                      {/* ── Sub-panel: Inline verification for checking off participant (Cash, Bank, Card, Savings) ── */}
                      {isCurrentlySettling && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: "14px 16px",
                            borderRadius: 12,
                            background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.95)",
                            border: `1.5px solid ${isLight ? "#3b82f6" : "#60a5fa"}`,
                            boxShadow: isLight ? "0 6px 20px rgba(0,0,0,0.08)" : "0 8px 24px rgba(0,0,0,0.6)",
                          }}
                        >
                          {/* Header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: "1.1rem" }}>🤝</span>
                              <div>
                                <span style={{ fontSize: "0.86rem", fontWeight: 800, color: "var(--text-primary)" }}>
                                  Registrar Cobro / Abono: <strong>{p.name}</strong>
                                </span>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                                  Cuota total: <strong>{formatMoney(effShare)}</strong>
                                  {paidSoFar > 0 && <> • Ya abonado: <strong style={{ color: "#10b981" }}>{formatMoney(paidSoFar)}</strong></>}
                                  {" "}• Pendiente: <strong style={{ color: isLight ? "#b45309" : "#fbbf24" }}>{formatMoney(pendingToPay)}</strong>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSettlingParticipant(null)}
                              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.85rem", padding: "4px 8px" }}
                              title="Cancelar cobro"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Section 1: Monto a abonar */}
                          <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: "0.74rem", color: "var(--text-secondary)", fontWeight: 700, display: "block", marginBottom: 4 }}>
                              Monto a abonar en este movimiento (permite pago parcial o bonificación):
                            </label>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <CurrencyInput
                                value={settlingAmount}
                                onChange={setSettlingAmount}
                                currency={currency}
                                style={{
                                  width: "100%",
                                  background: "var(--bg-surface)",
                                  border: `1.5px solid ${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)"}`,
                                  borderRadius: 8,
                                  padding: "8px 12px",
                                  fontSize: "0.95rem",
                                  color: "var(--text-primary)",
                                  fontWeight: 800,
                                }}
                              />
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                <button
                                  type="button"
                                  onClick={() => setSettlingAmount(pendingToPay)}
                                  style={{
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    border: `1px solid var(--border)`,
                                    background: "var(--bg-surface)",
                                    color: "var(--text-secondary)",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  Total pendiente ({formatMoney(pendingToPay)})
                                </button>
                                {pendingToPay > 1000 && (
                                  <button
                                    type="button"
                                    onClick={() => setSettlingAmount(Math.round(pendingToPay / 2))}
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: 6,
                                      border: `1px solid var(--border)`,
                                      background: "var(--bg-surface)",
                                      color: "var(--text-secondary)",
                                      fontSize: "0.72rem",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    50% ({formatMoney(Math.round(pendingToPay / 2))})
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Partial indicator */}
                            <div style={{ marginTop: 6, fontSize: "0.72rem", fontWeight: 600 }}>
                              {Number(settlingAmount) < pendingToPay ? (
                                <span style={{ color: isLight ? "#b45309" : "#fbbf24" }}>
                                  ⚠️ Abono parcial: Quedarán pendientes {formatMoney(Math.max(0, pendingToPay - Number(settlingAmount)))} por cobrar más adelante.
                                </span>
                              ) : (
                                <span style={{ color: "#10b981" }}>
                                  ✓ Liquidación completa: La cuota de {p.name} quedará 100% saldada.
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Section 2: ¿Dónde recibiste el dinero? */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <label style={{ fontSize: "0.74rem", color: "var(--text-secondary)", fontWeight: 700 }}>
                                ¿Dónde o cómo recibiste este pago?
                              </label>
                              <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
                                Selecciona el destino real del dinero
                              </span>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6 }}>
                              {/* Option 1: Nequi */}
                              <button
                                type="button"
                                onClick={() => setTargetType("nequi")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: targetType === "nequi" ? "2px solid #ff007a" : "1px solid var(--border)",
                                  background: targetType === "nequi" ? (isLight ? "rgba(255, 0, 122, 0.12)" : "rgba(255, 0, 122, 0.22)") : "var(--bg-surface)",
                                  color: targetType === "nequi" ? (isLight ? "#b80058" : "#ff4d9e") : "var(--text-secondary)",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ fontSize: "0.82rem" }}>🟣 Nequi</span>
                                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>
                                  {nequiAccount ? `Saldo: ${formatMoney(nequiAccount.balance || 0)}` : "Disponible Nequi"}
                                </span>
                              </button>

                              {/* Option 2: Cash / Efectivo */}
                              <button
                                type="button"
                                onClick={() => setTargetType("cash")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: targetType === "cash" ? "2px solid #f59e0b" : "1px solid var(--border)",
                                  background: targetType === "cash" ? (isLight ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.25)") : "var(--bg-surface)",
                                  color: targetType === "cash" ? (isLight ? "#b45309" : "#fcd34d") : "var(--text-secondary)",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ fontSize: "0.82rem" }}>💵 Efectivo Físico</span>
                                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Billetera / En mano</span>
                              </button>

                              {/* Option 3: Payroll / Cuenta Nu */}
                              <button
                                type="button"
                                onClick={() => setTargetType("payroll")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: targetType === "payroll" ? "2px solid #a855f7" : "1px solid var(--border)",
                                  background: targetType === "payroll" ? (isLight ? "rgba(168, 85, 247, 0.15)" : "rgba(168, 85, 247, 0.25)") : "var(--bg-surface)",
                                  color: targetType === "payroll" ? (isLight ? "#7e22ce" : "#d8b4fe") : "var(--text-secondary)",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ fontSize: "0.82rem" }}>💼 Cuenta Nu (Nómina)</span>
                                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Transferencia bancaria</span>
                              </button>

                              {/* Option 4: Otras Billeteras Digitales */}
                              <button
                                type="button"
                                onClick={() => setTargetType("digital_wallet")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: targetType === "digital_wallet" ? "2px solid #3b82f6" : "1px solid var(--border)",
                                  background: targetType === "digital_wallet" ? (isLight ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.25)") : "var(--bg-surface)",
                                  color: targetType === "digital_wallet" ? (isLight ? "#1d4ed8" : "#93c5fd") : "var(--text-secondary)",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ fontSize: "0.82rem" }}>📱 Otras Billeteras</span>
                                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Daviplata, Rappi, etc.</span>
                              </button>

                              {/* Option 5: Cajitas / Ahorro */}
                              <button
                                type="button"
                                onClick={() => setTargetType("fixed_pocket")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: targetType === "fixed_pocket" ? "2px solid #00e5ff" : "1px solid var(--border)",
                                  background: targetType === "fixed_pocket" ? (isLight ? "rgba(0, 229, 255, 0.15)" : "rgba(0, 229, 255, 0.25)") : "var(--bg-surface)",
                                  color: targetType === "fixed_pocket" ? (isLight ? "#0284c7" : "#00e5ff") : "var(--text-secondary)",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ fontSize: "0.82rem" }}>🏦 Cajitas / Ahorro</span>
                                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Rendimiento Nu / CDTs</span>
                              </button>

                              {/* Option 6: Credit Card */}
                              <button
                                type="button"
                                onClick={() => setTargetType("credit_card")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: targetType === "credit_card" ? "2px solid #10b981" : "1px solid var(--border)",
                                  background: targetType === "credit_card" ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.25)") : "var(--bg-surface)",
                                  color: targetType === "credit_card" ? (isLight ? "#047857" : "#6ee7b7") : "var(--text-secondary)",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ fontSize: "0.82rem" }}>💳 Tarjeta de Crédito</span>
                                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Restaura cupo</span>
                              </button>

                              {/* Option 7: Gasto Dividido / Cruce Roomies (Sin Ingreso) */}
                              <button
                                type="button"
                                onClick={() => setTargetType("split_offset")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: targetType === "split_offset" ? "2px solid #06b6d4" : "1px solid var(--border)",
                                  background: targetType === "split_offset" ? (isLight ? "rgba(6, 182, 212, 0.15)" : "rgba(6, 182, 212, 0.25)") : "var(--bg-surface)",
                                  color: targetType === "split_offset" ? (isLight ? "#0891b2" : "#22d3ee") : "var(--text-secondary)",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ fontSize: "0.82rem" }}>🤝 Cruce Roomies</span>
                                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Gasto dividido (sin ingreso)</span>
                              </button>

                              {/* Option 8: Already Registered */}
                              <button
                                type="button"
                                onClick={() => setTargetType("already_registered")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: targetType === "already_registered" ? "2px solid #64748b" : "1px solid var(--border)",
                                  background: targetType === "already_registered" ? (isLight ? "rgba(100, 116, 139, 0.15)" : "rgba(100, 116, 139, 0.25)") : "var(--bg-surface)",
                                  color: targetType === "already_registered" ? (isLight ? "#334155" : "#cbd5e1") : "var(--text-secondary)",
                                  fontSize: "0.74rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <span style={{ fontSize: "0.82rem" }}>✓ Ya en Extracto</span>
                                <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Sin duplicar movimiento</span>
                              </button>
                            </div>

                            {/* Dynamic Sub-selectors for wallets, cajitas, and cards */}
                            {targetType === "digital_wallet" && otherWallets.length > 0 && (
                              <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: isLight ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.25)", display: "flex", alignItems: "center", gap: 8 }}>
                                <label style={{ fontSize: "0.72rem", color: isLight ? "#1d4ed8" : "#93c5fd", fontWeight: 700, whiteSpace: "nowrap" }}>
                                  Billetera destino:
                                </label>
                                <select
                                  value={selectedWalletId}
                                  onChange={(e) => setSelectedWalletId(e.target.value)}
                                  style={{
                                    flex: 1,
                                    background: "var(--bg-surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontSize: "0.76rem",
                                    color: "var(--text-primary)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {otherWallets.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name} ({formatMoney(w.balance || 0)})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {targetType === "fixed_pocket" && savingsPockets.length > 0 && (
                              <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: isLight ? "rgba(0, 229, 255, 0.08)" : "rgba(0, 229, 255, 0.15)", border: "1px solid rgba(0, 229, 255, 0.25)", display: "flex", alignItems: "center", gap: 8 }}>
                                <label style={{ fontSize: "0.72rem", color: isLight ? "#0284c7" : "#00e5ff", fontWeight: 700, whiteSpace: "nowrap" }}>
                                  Cajita / Cuenta destino:
                                </label>
                                <select
                                  value={selectedPocketId}
                                  onChange={(e) => setSelectedPocketId(e.target.value)}
                                  style={{
                                    flex: 1,
                                    background: "var(--bg-surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontSize: "0.76rem",
                                    color: "var(--text-primary)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {savingsPockets.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} ({formatMoney(p.balance || 0)})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {targetType === "credit_card" && creditCards.length > 1 && (
                              <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.25)", display: "flex", alignItems: "center", gap: 8 }}>
                                <label style={{ fontSize: "0.72rem", color: isLight ? "#047857" : "#6ee7b7", fontWeight: 700, whiteSpace: "nowrap" }}>
                                  Tarjeta de crédito:
                                </label>
                                <select
                                  value={selectedCardId}
                                  onChange={(e) => setSelectedCardId(e.target.value)}
                                  style={{
                                    flex: 1,
                                    background: "var(--bg-surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontSize: "0.76rem",
                                    color: "var(--text-primary)",
                                    fontWeight: 600,
                                  }}
                                >
                                  {creditCards.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} (Cupo libre: {formatMoney((c.totalLimit || 0) - (c.usedLimit || 0))})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Option: Clasificar como Nuevo Ingreso Presupuestado (Desmarcado por defecto) */}
                            {targetType !== "already_registered" && targetType !== "split_offset" && (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: "7px 10px",
                                  borderRadius: 8,
                                  background: isLight ? "rgba(2, 132, 199, 0.05)" : "rgba(2, 132, 199, 0.12)",
                                  border: isLight ? "1px solid rgba(2, 132, 199, 0.2)" : "1px solid rgba(2, 132, 199, 0.3)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <div>
                                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: isLight ? "#0369a1" : "#38bdf8" }}>
                                    Registrar como Ingreso Extra en Flujo de Caja
                                  </div>
                                  <div style={{ fontSize: "0.64rem", color: "var(--text-muted)" }}>
                                    Desmarcado por defecto para no saturar los 3 ingresos habituales en Sankey.
                                  </div>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={registerAsBudgetInflow}
                                  onChange={(e) => setRegisterAsBudgetInflow(e.target.checked)}
                                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0284c7" }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Section 3: Fecha & Botón de Confirmación */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                            <div style={{ width: 135 }}>
                              <input
                                type="date"
                                value={settlementDate}
                                onChange={(e) => setSettlementDate(e.target.value)}
                                style={{
                                  width: "100%",
                                  background: "var(--bg-surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  padding: "8px 10px",
                                  fontSize: "0.78rem",
                                  color: "var(--text-primary)",
                                }}
                              />
                            </div>

                            <button
                              type="button"
                              disabled={Number(settlingAmount) <= 0}
                              onClick={() => handleConfirmParticipantPayment(targetType === "already_registered" || targetType === "split_offset")}
                              style={{
                                flex: 1,
                                minWidth: 200,
                                padding: "10px 16px",
                                borderRadius: 8,
                                border: "none",
                                background: targetType === "split_offset"
                                  ? (isLight ? "#0891b2" : "#06b6d4")
                                  : targetType === "already_registered"
                                  ? (isLight ? "#475569" : "#64748b")
                                  : targetType === "nequi"
                                  ? "linear-gradient(135deg, #7000ff 0%, #ff007a 100%)"
                                  : (isLight ? "#059669" : "#10b981"),
                                color: "#ffffff",
                                fontSize: "0.82rem",
                                fontWeight: 800,
                                cursor: Number(settlingAmount) > 0 ? "pointer" : "not-allowed",
                                opacity: Number(settlingAmount) > 0 ? 1 : 0.6,
                                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                              }}
                            >
                              <span>✓</span> Confirmar Abono de {formatMoney(settlingAmount)} {
                                targetType === "split_offset"
                                  ? "(Cruce Roomies - Sin Ingreso) 🤝"
                                  : targetType === "already_registered"
                                  ? "(Ya Registrado en Extracto) ✓"
                                  : targetType === "nequi"
                                  ? "a Nequi 🟣"
                                  : targetType === "cash"
                                  ? "en Efectivo Físico 💵"
                                  : targetType === "payroll"
                                  ? "a Cuenta Nu Débito 💼"
                                  : targetType === "digital_wallet"
                                  ? `a ${(otherWallets.find((w) => w.id === selectedWalletId)?.name || "Billetera Digital")} 📱`
                                  : targetType === "credit_card"
                                  ? `a ${(creditCards.find((c) => c.id === selectedCardId)?.name || "Tarjeta")} 💳`
                                  : targetType === "fixed_pocket"
                                  ? `a ${(savingsPockets.find((p) => p.id === selectedPocketId)?.name || "Cajita / Ahorro")} 🏦`
                                  : "✓"
                              }
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total Liquidation Card if all paid */}
            {isAllExternalPaid && (
              <div
                style={{
                  background: isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)",
                  border: "1px solid #10b981",
                  borderRadius: 10,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: isLight ? "#047857" : "#6ee7b7",
                }}
              >
                <span style={{ fontSize: "1.4rem" }}>🎉</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem" }}>
                    ¡Deuda Totalmente Liquidada!
                  </div>
                  <div style={{ fontSize: "0.72rem" }}>
                    Todos los participantes han pagado su cuota correspondiente.
                  </div>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="cashflow-modal-actions" style={{ marginTop: 8 }}>
              <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleSaveSplitConfig}
                className="cashflow-action-btn primary"
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                  border: "none",
                  fontWeight: 700,
                  color: "#ffffff",
                  boxShadow: "0 4px 16px rgba(37, 99, 235, 0.35)",
                }}
              >
                <span>💾</span> Guardar Configuración de División
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB 2: DIRECT / LUMP-SUM SETTLEMENT                           */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "direct" && (
          <form onSubmit={handleDirectSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Loan summary card */}
            <div
              style={{
                background: isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.12)",
                border: `1px solid ${isLight ? "rgba(245, 158, 11, 0.3)" : "rgba(245, 158, 11, 0.25)"}`,
                borderRadius: "12px",
                padding: "12px 16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: isLight ? "#92400e" : "#fcd34d" }}>
                  🤝 Deudor: {transaction.loanRecipient || "Persona / Amigo"}
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    background: isFullSettlementDirect ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                    color: isFullSettlementDirect ? "#10b981" : (isLight ? "#92400e" : "#fcd34d"),
                    padding: "2px 8px",
                    borderRadius: "6px",
                    fontWeight: 700,
                  }}
                >
                  {isFullSettlementDirect ? "Liquidación Total" : "Abono / Liquidación Parcial"}
                </span>
              </div>

              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                Concepto: <strong>{transaction.description}</strong>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`, fontSize: "0.76rem" }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Total prestado original: </span>
                  <strong style={{ color: "var(--text-primary)" }}>{formatMoney(baseLoanAmount)}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Saldo pendiente actual: </span>
                  <strong style={{ color: isLight ? "#b45309" : "#fcd34d" }}>{formatMoney(currentPendingBalance)}</strong>
                </div>
              </div>

              {previousSettlements.length > 0 && (
                <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: "8px", background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.4)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 6, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
                    <span>Historial de Cobros Recibidos ({previousSettlements.length}):</span>
                    <strong style={{ color: "#10b981" }}>Total: +{formatMoney(alreadySettledTotal)}</strong>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 120, overflowY: "auto" }}>
                    {previousSettlements.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: "var(--bg-surface)",
                          fontSize: "0.72rem",
                          border: "1px solid var(--border)",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                          <strong style={{ color: "#10b981" }}>+{formatMoney(s.amount)}</strong>
                          <span style={{ color: "var(--text-muted)" }}>• {s.date}</span>
                          <span style={{ color: "var(--text-secondary)" }}>({s.targetName || s.paymentMethod || "Cobro"})</span>
                          {s.note && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>"{s.note}"</span>}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSettlement(s);
                          }}
                          title="Eliminar este abono para corregir saldo o duplicados"
                          style={{
                            background: isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.16)",
                            border: isLight ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(239, 68, 68, 0.35)",
                            color: isLight ? "#dc2626" : "#f87171",
                            cursor: "pointer",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "0.68rem",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            flexShrink: 0,
                          }}
                        >
                          <span>🗑️</span>
                          <span>Eliminar</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Amount and Date */}
            <div className="cashflow-form-row">
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>
                  Monto Recibido en este Abono ({currency})
                </label>
                <CurrencyInput
                  value={settlementAmount}
                  onChange={(val) => setSettlementAmount(val)}
                  currency={currency}
                  placeholder="Monto a cobrar"
                  autoFocus
                />
                {!isFullSettlementDirect && Number(settlementAmount) > 0 && (
                  <span style={{ display: "block", fontSize: "0.7rem", color: isLight ? "#b45309" : "#fcd34d", marginTop: 4 }}>
                    ⏳ Quedará un saldo restante por cobrar de: <strong>{formatMoney(remainingAfterThisDirect)}</strong>
                  </span>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>
                  Fecha en que te pagaron
                </label>
                <DynamicDatePicker
                  value={settlementDate}
                  onChange={(d) => setSettlementDate(d)}
                  placeholder="Fecha de recepción..."
                />
              </div>
            </div>

            {/* Destination Selector: Where did the money return to? */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: "0.78rem", color: "var(--text-primary)", fontWeight: 700 }}>
                  ¿A qué cuenta retornó este dinero?
                </label>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                  Selecciona el destino real del pago
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6 }}>
                {/* Option 1: Nequi */}
                <button
                  type="button"
                  onClick={() => setTargetType("nequi")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: targetType === "nequi" ? "2px solid #ff007a" : "1px solid var(--border)",
                    background: targetType === "nequi" ? (isLight ? "rgba(255, 0, 122, 0.12)" : "rgba(255, 0, 122, 0.22)") : "var(--bg-surface)",
                    color: targetType === "nequi" ? (isLight ? "#b80058" : "#ff4d9e") : "var(--text-secondary)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>🟣 Nequi</span>
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    {nequiAccount ? `Saldo: ${formatMoney(nequiAccount.balance || 0)}` : "Disponible Nequi"}
                  </span>
                </button>

                {/* Option 2: Efectivo Físico */}
                <button
                  type="button"
                  onClick={() => setTargetType("cash")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: targetType === "cash" ? "2px solid #f59e0b" : "1px solid var(--border)",
                    background: targetType === "cash" ? (isLight ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.25)") : "var(--bg-surface)",
                    color: targetType === "cash" ? (isLight ? "#b45309" : "#fcd34d") : "var(--text-secondary)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>💵 Efectivo Físico</span>
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Billetera / En mano</span>
                </button>

                {/* Option 3: Nómina Nu */}
                <button
                  type="button"
                  onClick={() => setTargetType("payroll")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: targetType === "payroll" ? "2px solid #a855f7" : "1px solid var(--border)",
                    background: targetType === "payroll" ? (isLight ? "rgba(168, 85, 247, 0.15)" : "rgba(168, 85, 247, 0.25)") : "var(--bg-surface)",
                    color: targetType === "payroll" ? (isLight ? "#7e22ce" : "#d8b4fe") : "var(--text-secondary)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>💼 Cuenta Nu (Nómina)</span>
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Vuelve a liquidez libre</span>
                </button>

                {/* Option 4: Otras Billeteras */}
                <button
                  type="button"
                  onClick={() => setTargetType("digital_wallet")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: targetType === "digital_wallet" ? "2px solid #3b82f6" : "1px solid var(--border)",
                    background: targetType === "digital_wallet" ? (isLight ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.25)") : "var(--bg-surface)",
                    color: targetType === "digital_wallet" ? (isLight ? "#1d4ed8" : "#93c5fd") : "var(--text-secondary)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>📱 Otras Billeteras</span>
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Daviplata, Rappi, etc.</span>
                </button>

                {/* Option 5: Cajitas / Ahorro */}
                <button
                  type="button"
                  onClick={() => setTargetType("fixed_pocket")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: targetType === "fixed_pocket" ? "2px solid #00e5ff" : "1px solid var(--border)",
                    background: targetType === "fixed_pocket" ? (isLight ? "rgba(0, 229, 255, 0.15)" : "rgba(0, 229, 255, 0.25)") : "var(--bg-surface)",
                    color: targetType === "fixed_pocket" ? (isLight ? "#0284c7" : "#00e5ff") : "var(--text-secondary)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>🏦 Cajitas / Ahorro</span>
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Fondo de ahorro Nu / CDTs</span>
                </button>

                {/* Option 6: Tarjeta de Crédito */}
                <button
                  type="button"
                  onClick={() => setTargetType("credit_card")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: targetType === "credit_card" ? "2px solid #10b981" : "1px solid var(--border)",
                    background: targetType === "credit_card" ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.25)") : "var(--bg-surface)",
                    color: targetType === "credit_card" ? (isLight ? "#047857" : "#6ee7b7") : "var(--text-secondary)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>💳 Tarjeta de Crédito</span>
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Paga deuda y libera cupo</span>
                </button>

                {/* Option 7: Gasto Dividido / Cruce (Sin Ingreso) */}
                <button
                  type="button"
                  onClick={() => setTargetType("split_offset")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: targetType === "split_offset" ? "2px solid #06b6d4" : "1px solid var(--border)",
                    background: targetType === "split_offset" ? (isLight ? "rgba(6, 182, 212, 0.15)" : "rgba(6, 182, 212, 0.25)") : "var(--bg-surface)",
                    color: targetType === "split_offset" ? (isLight ? "#0891b2" : "#22d3ee") : "var(--text-secondary)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>🤝 Cruce Roomies</span>
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Gasto dividido (sin ingreso)</span>
                </button>

                {/* Option 8: Ya Registrado */}
                <button
                  type="button"
                  onClick={() => setTargetType("already_registered")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: targetType === "already_registered" ? "2px solid #64748b" : "1px solid var(--border)",
                    background: targetType === "already_registered" ? (isLight ? "rgba(100, 116, 139, 0.15)" : "rgba(100, 116, 139, 0.25)") : "var(--bg-surface)",
                    color: targetType === "already_registered" ? (isLight ? "#334155" : "#cbd5e1") : "var(--text-secondary)",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "0.82rem" }}>✓ Ya en Extracto</span>
                  <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", fontWeight: 500 }}>Sin duplicar movimiento</span>
                </button>
              </div>
            </div>

            {/* Sub-select for Digital Wallets */}
            {targetType === "digital_wallet" && otherWallets.length > 0 && (
              <div style={{ background: isLight ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "8px", padding: "10px 12px" }}>
                <label style={{ display: "block", fontSize: "0.74rem", color: isLight ? "#1d4ed8" : "#93c5fd", marginBottom: 5, fontWeight: 700 }}>
                  Selecciona la Billetera Digital destino:
                </label>
                <select
                  value={selectedWalletId}
                  onChange={(e) => setSelectedWalletId(e.target.value)}
                  style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "6px", padding: "8px 12px", color: "var(--text-primary)", fontSize: "0.82rem" }}
                >
                  {otherWallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatMoney(w.balance || 0)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sub-select for Credit Card */}
            {targetType === "credit_card" && (
              <div style={{ background: isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", padding: "10px 12px" }}>
                <label style={{ display: "block", fontSize: "0.74rem", color: isLight ? "#047857" : "#6ee7b7", marginBottom: 5, fontWeight: 700 }}>
                  Selecciona la Tarjeta a la que entra el abono:
                </label>
                <select
                  value={selectedCardId}
                  onChange={(e) => setSelectedCardId(e.target.value)}
                  style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "6px", padding: "8px 12px", color: "var(--text-primary)", fontSize: "0.82rem" }}
                >
                  {creditCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Cupo Usado: {formatMoney(c.usedLimit || 0)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sub-select for Fixed Pocket */}
            {targetType === "fixed_pocket" && savingsPockets.length > 0 && (
              <div style={{ background: isLight ? "rgba(0, 229, 255, 0.08)" : "rgba(0, 229, 255, 0.12)", border: "1px solid rgba(0, 229, 255, 0.3)", borderRadius: "8px", padding: "10px 12px" }}>
                <label style={{ display: "block", fontSize: "0.74rem", color: isLight ? "#0284c7" : "#00e5ff", marginBottom: 5, fontWeight: 700 }}>
                  Selecciona la Cajita / Cuenta de Ahorro destino:
                </label>
                <select
                  value={selectedPocketId}
                  onChange={(e) => setSelectedPocketId(e.target.value)}
                  style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "6px", padding: "8px 12px", color: "var(--text-primary)", fontSize: "0.82rem" }}
                >
                  {savingsPockets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatMoney(a.balance || 0)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Option: Clasificar como Nuevo Ingreso Presupuestado (Desmarcado por defecto) */}
            {targetType !== "already_registered" && targetType !== "split_offset" && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: isLight ? "rgba(2, 132, 199, 0.05)" : "rgba(2, 132, 199, 0.12)",
                  border: isLight ? "1px solid rgba(2, 132, 199, 0.2)" : "1px solid rgba(2, 132, 199, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: isLight ? "#0369a1" : "#38bdf8" }}>
                    Registrar como Ingreso Extra en Flujo de Caja
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
                    Desmarcado por defecto para mantener limpios los 3 ingresos habituales (Salario, Renta Fija y Renta Variable).
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={registerAsBudgetInflow}
                  onChange={(e) => setRegisterAsBudgetInflow(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#0284c7" }}
                />
              </div>
            )}

            {/* Optional Note */}
            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)", marginBottom: 4, fontWeight: 600 }}>
                Nota / Detalle adicional (Opcional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ej. Abono recibido por Nequi / Transferencia..."
                style={{ width: "100%", boxSizing: "border-box", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontSize: "0.82rem" }}
              />
            </div>

            {/* Modal Actions */}
            <div className="cashflow-modal-actions" style={{ marginTop: 6 }}>
              <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="submit"
                className="cashflow-action-btn primary"
                style={{
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  border: "none",
                  fontWeight: 700,
                  color: "#ffffff",
                  boxShadow: "0 4px 16px rgba(16, 185, 129, 0.35)",
                }}
              >
                <span>✅</span> Confirmar Retorno ({formatMoney(settlementAmount)})
              </button>
            </div>
          </form>
        )}
      </div>
    </GlassModalWrapper>
  );
}
