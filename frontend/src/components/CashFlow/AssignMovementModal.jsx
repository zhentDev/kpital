import React, { useState, useMemo } from "react";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import InfoTooltip from "../Common/InfoTooltip";
import { useTheme } from "../../context/ThemeContext";
import { parseLocalNumber, formatCashFlowMoney, calculateEffectiveExpense } from "../../utils/cashFlowFormatters";
import { useCashFlowStore } from "../../store/cashFlowStore";

export default function AssignMovementModal({
  isOpen,
  onClose,
  movement,
  currency = "COP",
  formatMoney = (val, cur = "COP") => formatCashFlowMoney(val, cur),
  creditCards = [],
  debts = [],
  budgetItems = [],
  fixedIncomeAccounts = [],
  expensesLog = [],
  activePeriod,
  onSaveTransaction,
  onDeleteTransaction,
  onReclassify,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const isCardMovementInitial = Boolean(
    movement?.isPayment ||
    movement?.cardId ||
    movement?.itemType === "card_payment" ||
    movement?.description?.toLowerCase().includes("rappi") ||
    movement?.description?.toLowerCase().includes("tarjeta") ||
    movement?.description?.toLowerCase().includes("credito") ||
    movement?.budgetItemType === "split_distribution"
  );

  const [activeTab, setActiveTab] = useState(isCardMovementInitial ? "multi_envelope" : "budget_envelope"); // "budget_envelope" | "multi_envelope" | "debt" | "credit_card"
  const [selectedPillarFilter, setSelectedPillarFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState(movement?.budgetItemId || "");
  const [selectedSubItem, setSelectedSubItem] = useState(() => {
    if (!movement?.budgetItemId) return null;
    const env = (budgetItems || []).find((b) => b.id === movement.budgetItemId);
    if (!env || !Array.isArray(env.subItems)) return null;
    const found = env.subItems.find(
      (s, i) =>
        (s.id && movement.subItemId === s.id) ||
        movement.subItemId === (s.id || `${env.id}_sub_${i}`) ||
        (s.name && movement.subItemName?.toLowerCase() === s.name.toLowerCase()) ||
        (s.name && movement.description?.toLowerCase().includes(s.name.toLowerCase()))
    );
    return found || null;
  });
  const [selectedDebtId, setSelectedDebtId] = useState(debts[0]?.id || "");
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const isIncoming = movement?.type === "credit" || movement?.budgetItemType === "income";
  const [debtMode, setDebtMode] = useState(debts.length === 0 ? "new" : "existing"); // "existing" | "new"
  const [debtTypeFilter, setDebtTypeFilter] = useState("all"); // "all" | "receivable" | "payable"
  const [newDebtData, setNewDebtData] = useState(() => ({
    concept: `Préstamo a ${movement?.description || "Particular"}`,
    debtor: movement?.description || "",
    totalAmount: String(Number(movement?.amount) || ""),
    debtType: isIncoming ? "receivable" : "payable",
  }));
  const [alreadyRegisteredInDebt, setAlreadyRegisteredInDebt] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || "");
  const [selectedDestAccountId, setSelectedDestAccountId] = useState(movement?.destinationAccountId || "");
  const [cardActionMode, setCardActionMode] = useState("purchase"); // "purchase" | "payoff"
  const [selectedSourceAccountKey, setSelectedSourceAccountKey] = useState(() => {
    if (movement?.paymentSource?.type === "credit_card") {
      return `card_${movement?.paymentSource?.targetId || ""}`;
    }
    if (movement?.paymentSource?.targetId) {
      return `acc_${movement.paymentSource.targetId}`;
    }
    return "acc_nu_debito";
  });

  // Auto-match participant from movement description if assigning to a shared debt (vaca)
  const selectedDebtObj = useMemo(() => {
    return (debts || []).find((d) => d.id === selectedDebtId) || null;
  }, [debts, selectedDebtId]);

  React.useEffect(() => {
    if (selectedDebtObj && Array.isArray(selectedDebtObj.participants) && selectedDebtObj.participants.length > 0) {
      const desc = (movement?.description || "").toLowerCase();
      const matched = selectedDebtObj.participants.find((p) => p.name && desc.includes(p.name.toLowerCase()));
      if (matched && !selectedParticipantId) {
        setSelectedParticipantId(matched.id);
      }
    }
  }, [selectedDebtObj, movement?.description]);

  const allPaymentSources = useMemo(() => {
    const list = [
      { key: "acc_nu_debito", id: "acc_nu_debito", name: "Cuenta Nu Débito (Nómina)", type: "payroll", icon: "🏦" },
    ];
    (fixedIncomeAccounts || []).forEach((acc) => {
      if (acc.id === "acc_nu_debito") return;
      const isCash = acc.accountCategory === "cash" || (acc.name || "").toLowerCase().includes("efectivo");
      list.push({
        key: `acc_${acc.id}`,
        id: acc.id,
        name: acc.name,
        type: isCash ? "cash" : "fixed_pocket",
        icon: isCash ? "💵" : "📦",
        balance: acc.balance,
      });
    });
    (creditCards || []).forEach((card) => {
      const avail = Math.max(0, (Number(card.totalLimit) || 0) - (Number(card.usedLimit) || 0));
      list.push({
        key: `card_${card.id}`,
        id: card.id,
        name: card.name,
        type: "credit_card",
        icon: "💳",
        availableLimit: avail,
      });
    });
    return list;
  }, [fixedIncomeAccounts, creditCards]);

  // Accordion state for collapsible sub-items per envelope
  const [expandedEnvelopes, setExpandedEnvelopes] = useState(() => {
    const initial = {};
    if (movement?.budgetItemId) {
      initial[movement.budgetItemId] = true;
    }
    return initial;
  });

  const toggleExpandEnvelope = (envId, e) => {
    if (e) e.stopPropagation();
    setExpandedEnvelopes((prev) => ({
      ...prev,
      [envId]: !prev[envId],
    }));
  };

  const movementAmount = Number(movement?.amount) || 0;

  // ── Multi-envelope distribution state ──
  const [splitAmounts, setSplitAmounts] = useState(() => {
    if (Array.isArray(movement?.budgetDeductions) && movement.budgetDeductions.length > 0) {
      const map = {};
      movement.budgetDeductions.forEach((d) => {
        if (d.budgetItemId) {
          map[d.budgetItemId] = Number(d.amount) || 0;
        }
      });
      return map;
    }
    return {};
  });
  const [splitSubItems, setSplitSubItems] = useState({}); // { [subKey]: { envId, sub, amount } }
  const [splitInputValues, setSplitInputValues] = useState({}); // For controlled typing with commas
  const [isCardPaymentInSplit, setIsCardPaymentInSplit] = useState(isCardMovementInitial);
  const [splitCardId, setSplitCardId] = useState(() => {
    const desc = (movement?.description || "").toLowerCase();
    const found = (creditCards || []).find((c) => desc.includes(c.name.toLowerCase()));
    return found ? found.id : (creditCards[0]?.id || "");
  });

  const allTransferAccounts = useMemo(() => {
    const list = [...(fixedIncomeAccounts || [])];
    if (!list.some((a) => a.id === "acc_cash_wallet" || (a.name || "").toLowerCase().includes("efectivo"))) {
      list.unshift({
        id: "acc_cash_wallet",
        name: "Efectivo (Billetera)",
        accountCategory: "cash",
        balance: 26000,
        currency: "COP",
      });
    }
    return list;
  }, [fixedIncomeAccounts]);

  const [selectedTransferAccId, setSelectedTransferAccId] = useState(() => {
    const cashAcc = (fixedIncomeAccounts || []).find((a) => a.accountCategory === "cash" || (a.name || "").toLowerCase().includes("efectivo"));
    return cashAcc ? cashAcc.id : "acc_cash_wallet";
  });

  const totalSplitAssigned = useMemo(() => {
    return Object.values(splitAmounts).reduce((acc, val) => acc + (Number(val) || 0), 0);
  }, [splitAmounts]);

  const splitRemaining = movementAmount - totalSplitAssigned;

  const storeCustomRatios = useCashFlowStore((state) => state.customRatios);
  const storePeriodsData = useCashFlowStore((state) => state.periodsData);
  const defaultFundingAccountId = useCashFlowStore((state) => state.defaultFundingAccountId) || "acc_plenti_principal";
  const setDefaultFundingAccount = useCashFlowStore((state) => state.setDefaultFundingAccount);

  const currentPeriodRatios = useMemo(() => {
    const periodSnap = activePeriod && storePeriodsData?.[activePeriod];
    const snapRatios = periodSnap?.customRatios;
    return {
      needs: Number(snapRatios?.needs ?? storeCustomRatios?.needs ?? 40),
      wants: Number(snapRatios?.wants ?? storeCustomRatios?.wants ?? 20),
      wealth: Number(snapRatios?.savings ?? snapRatios?.wealth ?? storeCustomRatios?.savings ?? storeCustomRatios?.wealth ?? 40),
    };
  }, [activePeriod, storePeriodsData, storeCustomRatios]);

  const strategyPillars = useMemo(
    () => [
      {
        id: "needs",
        name: "Gastos Fijos",
        ratio: `${currentPeriodRatios.needs}%`,
        icon: "🏠",
        color: "#38bdf8",
        bgColor: isLight ? "rgba(2, 132, 199, 0.05)" : "rgba(56, 189, 248, 0.08)",
        borderColor: isLight ? "rgba(2, 132, 199, 0.2)" : "rgba(56, 189, 248, 0.25)",
        description: "Compromisos fijos y supervivencia (arriendo, servicios, alimentación, salud)",
      },
      {
        id: "wants",
        name: "Estilo de Vida",
        ratio: `${currentPeriodRatios.wants}%`,
        icon: "🍿",
        color: "#c084fc",
        bgColor: isLight ? "rgba(192, 132, 252, 0.06)" : "rgba(192, 132, 252, 0.1)",
        borderColor: isLight ? "rgba(192, 132, 252, 0.2)" : "rgba(192, 132, 252, 0.25)",
        description: "Ocio, suscripciones, salidas, hobbies y compras personales",
      },
      {
        id: "wealth",
        name: "Ahorro & Inversión",
        ratio: `${currentPeriodRatios.wealth}%`,
        icon: "💎",
        color: "#10b981",
        bgColor: isLight ? "rgba(16, 185, 129, 0.05)" : "rgba(16, 185, 129, 0.08)",
        borderColor: isLight ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.25)",
        description: "Fondo de emergencia, portafolio e inversión para la libertad financiera",
      },
    ],
    [currentPeriodRatios, isLight]
  );

  const [collapsedPillars, setCollapsedPillars] = useState({
    needs: true,
    wants: true,
    wealth: true,
  });
  const toggleCollapsePillar = (pillarId, e) => {
    if (e) e.stopPropagation();
    setCollapsedPillars((prev) => ({
      ...prev,
      [pillarId]: !prev[pillarId],
    }));
  };

  const calculateEnvelopeMetrics = (env) => {
    const budgetedAmt = Number(env.amount || env.monthlyContribution) || 0;
    const currentVal = Number(splitAmounts[env.id]) || 0;

    // Prior cycle expenses in this envelope
    const envExpenses = (expensesLog || []).filter((tx) => {
      if (tx.type === "credit" || tx.budgetItemType === "income") return false;
      if (tx.budgetItemId && tx.budgetItemId === env.id) return true;
      const bName = (tx.budgetItemName || "").toLowerCase();
      return bName && bName === env.name.toLowerCase();
    });
    const alreadySpent = envExpenses.reduce((sum, tx) => sum + calculateEffectiveExpense(tx, debts).effectiveSpent, 0);
    const subItemsList = Array.isArray(env.subItems) ? env.subItems : [];

    // Identify pending concepts that have NOT been paid and are NOT selected in this card split:
    const pendingReservedConcepts = subItemsList.filter((sub, idx) => {
      const subKey = sub.id || `${env.id}_sub_${idx}`;
      const isAlreadyPaid = Boolean(
        envExpenses.find(
          (tx) =>
            (sub.id && tx.subItemId === sub.id) ||
            tx.subItemId === subKey ||
            (sub.name && tx.subItemName?.toLowerCase() === sub.name.toLowerCase()) ||
            (sub.name && tx.description?.toLowerCase().includes(sub.name.toLowerCase()))
        )
      );
      const isIncludedInSplit = Boolean(splitSubItems[subKey]);
      return !isAlreadyPaid && !isIncludedInSplit;
    });

    const pendingReservedAmt = pendingReservedConcepts.reduce(
      (sum, sub) => sum + (Number(sub.amount) || 0),
      0
    );

    // Reserved concepts reduce the available discretionary budget!
    // e.g. Suscripciones $150.000 with $31.000 Gemini pending -> discretionary is $119.000
    const discretionaryBudget = Math.max(0, budgetedAmt - pendingReservedAmt);
    const availableCupo = Math.max(0, discretionaryBudget - alreadySpent);

    const newTotal = alreadySpent + currentVal;
    const isExhausted = currentVal > 0 && newTotal >= budgetedAmt && budgetedAmt > 0;
    const remainingCupo = Math.max(0, budgetedAmt - newTotal);

    // Can we fill remaining discretionary cupo?
    const canFillCupo = availableCupo > 0 && splitRemaining > 0 && currentVal < availableCupo;
    const toFill = canFillCupo ? Math.min(availableCupo - currentVal, splitRemaining) : 0;

    return {
      budgetedAmt,
      alreadySpent,
      subItemsList,
      pendingReservedConcepts,
      pendingReservedAmt,
      discretionaryBudget,
      availableCupo,
      currentVal,
      newTotal,
      isExhausted,
      remainingCupo,
      canFillCupo,
      toFill,
    };
  };

  const handleAutoDistribute = () => {
    let remaining = movementAmount;
    const nextMap = {};
    const priorityItems = (budgetItems || []).filter(
      (b) => b.pillarType === "wealth" || b.pillarType === "wants"
    );

    // 1. Meta Viaje / Estudio
    const travelStudy = priorityItems.find((b) => b.name?.toLowerCase().includes("viaje") || b.name?.toLowerCase().includes("estudio"));
    if (travelStudy) {
      const take = Math.min(remaining, Math.round(movementAmount * 0.45));
      if (take > 0) {
        nextMap[travelStudy.id] = take;
        remaining -= take;
      }
    }

    // 2. Ocio / Hobbies
    const leisure = priorityItems.find((b) => b.name?.toLowerCase().includes("ocio") || b.name?.toLowerCase().includes("hobbies"));
    if (leisure && remaining > 0) {
      const take = Math.min(remaining, Math.round(movementAmount * 0.35));
      if (take > 0) {
        nextMap[leisure.id] = take;
        remaining -= take;
      }
    }

    // 3. Salidas / Restaurantes
    const dining = priorityItems.find((b) => b.name?.toLowerCase().includes("restaurante") || b.name?.toLowerCase().includes("salidas"));
    if (dining && remaining > 0) {
      nextMap[dining.id] = remaining;
      remaining = 0;
    } else if (remaining > 0 && priorityItems.length > 0) {
      const first = priorityItems[0];
      nextMap[first.id] = (nextMap[first.id] || 0) + remaining;
      remaining = 0;
    }

    setSplitAmounts(nextMap);
  };

  // ── Cuentas principales destino (para rubros de Ahorro / Fondo de Emergencia) ──
  // Por cada bolsillo de ahorro que coincide con el rubro, se ofrece la cuenta
  // PRINCIPAL de su entidad: el dinero entra primero allí y luego, desde Renta Fija,
  // se pasa al bolsillo como movimiento interno.
  const getDestinationOptions = (envelope) => {
    if (!envelope || envelope.pillarType !== "wealth") return [];
    const accs = fixedIncomeAccounts || [];
    const envName = (envelope.name || "").toLowerCase();
    const isEmergency = envelope.category === "emergency_fund" || envName.includes("emergencia");
    const isEquity = envelope.category === "equity_investment" || envName.includes("renta variable") || envName.includes("portafolio");
    const isTravelStudy = envelope.category === "medium_term_goal" || envName.includes("viaje") || envName.includes("estudio");

    if (isEquity) {
      // Generalizado: Todas las cuentas en USD, USDC o marcadas/nombradas para fondeo de broker
      const dollarAccs = accs.filter(
        (a) =>
          a.currency === "USD" ||
          a.currency === "USDC" ||
          a.isFundingAccount ||
          a.isBrokerFunding ||
          (a.name || "").toLowerCase().includes("plenti") ||
          (a.name || "").toLowerCase().includes("broker") ||
          (a.name || "").toLowerCase().includes("dolar") ||
          (a.name || "").toLowerCase().includes("interactive") ||
          (a.name || "").toLowerCase().includes("schwab") ||
          (a.name || "").toLowerCase().includes("hapi") ||
          (a.name || "").toLowerCase().includes("trii")
      );

      const seen = new Set();
      const equityOptions = [];

      dollarAccs.forEach((acc) => {
        const principal =
          acc.fallbackAccountId
            ? accs.find((a) => a.id === acc.fallbackAccountId) || acc
            : acc;
        const pocket = acc.type === "pocket" ? acc : null;
        if (seen.has(principal.id)) return;
        seen.add(principal.id);
        equityOptions.push({
          principal,
          pocket: pocket || principal,
          isDollar: true,
          currency: principal.currency || "USD",
        });
      });

      // Ordenar: primero la cuenta marcada como predeterminada de fondeo
      equityOptions.sort((a, b) => {
        const aIsDef = a.principal.id === defaultFundingAccountId;
        const bIsDef = b.principal.id === defaultFundingAccountId;
        if (aIsDef && !bIsDef) return -1;
        if (!aIsDef && bIsDef) return 1;
        return (a.principal.name || "").localeCompare(b.principal.name || "");
      });

      return equityOptions;
    }

    const pockets = accs.filter((a) => {
      const n = (a.name || "").toLowerCase();
      if (isEmergency) return n.includes("emergencia") || n.includes("emergency");
      if (isTravelStudy) return n.includes("viaje") || n.includes("estudio");
      return Number(a.interestRateEA || 0) > 0 && a.accountCategory !== "payroll";
    });
    const seen = new Set();
    const options = [];
    pockets.forEach((pocket) => {
      const principal =
        accs.find((a) => a.id === pocket.fallbackAccountId) ||
        accs.find(
          (a) =>
            a.entityId === pocket.entityId &&
            a.id !== pocket.id &&
            (a.accountCategory === "digital_wallet" || Number(a.interestRateEA || 0) === 0)
        ) || pocket;
      if (!principal || seen.has(principal.id)) return;
      seen.add(principal.id);
      options.push({ principal, pocket });
    });
    return options;
  };

  const handleToggleSubItemCheck = (e, item, sub, subKey, matchedTx) => {
    e.stopPropagation();
    if (matchedTx && onDeleteTransaction) {
      onDeleteTransaction(matchedTx.id);
    } else if (onSaveTransaction) {
      onSaveTransaction({
        id: `tx_sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        period: activePeriod || movement?.period,
        budgetItemId: item.id,
        budgetItemName: item.name,
        budgetItemType: item.pillarType || "needs",
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

  // Filtered budget items
  const filteredBudgetItems = useMemo(() => {
    return (budgetItems || []).filter((item) => {
      const matchesPillar =
        selectedPillarFilter === "all" ||
        item.pillarType === selectedPillarFilter;
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.typeLabel?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesPillar && matchesSearch;
    });
  }, [budgetItems, selectedPillarFilter, searchQuery]);

  // Active debts only
  const activeDebts = useMemo(() => {
    return (debts || []).filter(
      (d) => d.status !== "paid" || Number(d.remainingAmount) > 0
    );
  }, [debts]);

  if (!movement) return null;

  const handleConfirm = () => {
    if (!onReclassify) return;

    if (activeTab === "multi_envelope") {
      const distributions = Object.entries(splitAmounts)
        .filter(([_, amt]) => Number(amt) > 0)
        .map(([envId, amt]) => {
          const env = (budgetItems || []).find((b) => b.id === envId);
          const subMatches = Object.values(splitSubItems).filter((s) => s.envId === envId);
          const subItemName = subMatches.length > 0 ? subMatches.map((s) => s.sub.name).join(", ") : null;
          const subItemId = subMatches.length === 1 ? (subMatches[0].sub.id || subMatches[0].sub.subKey) : null;
          return {
            budgetItemId: envId,
            budgetItemName: env?.name || "Rubro",
            budgetItemType: env?.pillarType || "wants",
            amount: Number(amt),
            subItemId,
            subItemName,
          };
        });

      if (distributions.length === 0 || splitRemaining !== 0) return;

      onReclassify({
        movementId: movement.id,
        destinationType: "split_distribution",
        cardId: isCardPaymentInSplit ? splitCardId : null,
        distributions,
      });
      onClose();
      return;
    } else if (activeTab === "budget_envelope") {
      const envelope = budgetItems.find((b) => b.id === selectedEnvelopeId);
      if (!envelope) return;
      const destOptions = getDestinationOptions(envelope);
      const destOpt =
        destOptions.find((o) => o.principal.id === selectedDestAccountId) ||
        (destOptions.length === 1 ? destOptions[0] : null);
      const chosenSource = allPaymentSources.find((s) => s.key === selectedSourceAccountKey) || allPaymentSources[0];
      onReclassify({
        movementId: movement.id,
        destinationType: "budget_envelope",
        targetId: envelope.id,
        targetItem: envelope,
        subItem: selectedSubItem,
        destinationAccount: destOpt ? destOpt.principal : null,
        paymentSource: {
          type: chosenSource.type,
          targetId: chosenSource.id,
          targetName: chosenSource.name,
        },
      });
    } else if (activeTab === "internal_transfer") {
      const destAcc = allTransferAccounts.find((a) => a.id === selectedTransferAccId) || allTransferAccounts[0];
      onReclassify({
        movementId: movement.id,
        destinationType: "internal_transfer",
        targetId: destAcc?.id,
        targetItem: destAcc,
        destinationAccount: destAcc,
        paymentSource: movement.paymentSource,
      });
    } else if (activeTab === "debt") {
      const chosenSource = allPaymentSources.find((s) => s.key === selectedSourceAccountKey) || allPaymentSources[0];
      if (debtMode === "new") {
        onReclassify({
          movementId: movement.id,
          destinationType: "debt",
          targetId: null,
          newDebtData: {
            concept: newDebtData.concept?.trim() || `Préstamo a ${newDebtData.debtor?.trim() || movement.description}`,
            debtor: newDebtData.debtor?.trim() || movement.description,
            creditor: newDebtData.debtor?.trim() || movement.description,
            totalAmount: Number(newDebtData.totalAmount) || movementAmount,
            debtType: newDebtData.debtType || (isIncoming ? "receivable" : "payable"),
          },
          paymentSource: {
            type: chosenSource.type,
            targetId: chosenSource.id,
            targetName: chosenSource.name,
          },
        });
      } else {
        const debt = debts.find((d) => d.id === selectedDebtId);
        if (!debt) return;
        const selectedPartObj = (debt.participants || []).find((p) => p.id === selectedParticipantId);
        onReclassify({
          movementId: movement.id,
          destinationType: "debt",
          targetId: debt.id,
          targetItem: debt,
          alreadyRegisteredInDebt,
          selectedParticipantId: selectedParticipantId || null,
          participantName: selectedPartObj?.name || null,
          paymentSource: {
            type: chosenSource.type,
            targetId: chosenSource.id,
            targetName: chosenSource.name,
          },
        });
      }
    } else if (activeTab === "credit_card") {
      const card = creditCards.find((c) => c.id === selectedCardId);
      if (!card) return;
      if (cardActionMode === "purchase") {
        onReclassify({
          movementId: movement.id,
          destinationType: "credit_card_purchase",
          cardId: card.id,
          cardItem: card,
          paymentSource: {
            type: "credit_card",
            targetId: card.id,
            targetName: card.name,
          },
        });
      } else {
        const chosenSource = allPaymentSources.find((s) => s.key === selectedSourceAccountKey) || allPaymentSources[0];
        onReclassify({
          movementId: movement.id,
          destinationType: "credit_card",
          targetId: card.id,
          targetItem: card,
          paymentSource: {
            type: chosenSource.type,
            targetId: chosenSource.id,
            targetName: chosenSource.name,
          },
        });
      }
    }
    onClose();
  };

  const selectedEnvelopeObj = (budgetItems || []).find((b) => b.id === selectedEnvelopeId);
  const destinationOptions = getDestinationOptions(selectedEnvelopeObj);

  const isConfirmDisabled =
    (activeTab === "budget_envelope" && !selectedEnvelopeId) ||
    (activeTab === "internal_transfer" && !selectedTransferAccId) ||
    (activeTab === "debt" && (
      debtMode === "existing"
        ? !selectedDebtId
        : (!newDebtData.concept?.trim() || !newDebtData.debtor?.trim() || !newDebtData.totalAmount || Number(newDebtData.totalAmount) <= 0)
    )) ||
    (activeTab === "credit_card" && !selectedCardId) ||
    (activeTab === "multi_envelope" && (splitRemaining !== 0 || totalSplitAssigned <= 0));

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={640}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          maxHeight: "88vh",
          width: "100%",
        }}
      >
        {/* Modal Header - Fixed at Top */}
        <div
          className="cashflow-modal-header"
          style={{
            padding: "18px 24px 14px",
            flexShrink: 0,
            borderBottom: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)",
          }}
        >
          <h3 className="cashflow-modal-title">
            <span>🏷️</span> Asignar o Imputar Movimiento
          </h3>
          <button
            type="button"
            className="cashflow-modal-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "18px 24px",
            minHeight: 0,
          }}
        >
          {/* Movement Summary Card */}
          <div
            style={{
              background: isLight ? "#f8fafc" : "var(--bg-surface)",
              border: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)",
              borderRadius: "14px",
              padding: "14px 18px",
              marginBottom: 18,
              boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.03)" : "none",
            }}
          >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {movement.description || movement.budgetItemName || "Movimiento sin concepto"}
            </span>
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "#10b981",
              }}
            >
              {formatMoney(movementAmount, currency)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: "0.76rem", color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span>📅 Fecha: {movement.date}</span>
            <span>•</span>
            <span>🏦 Origen actual: <strong>{movement.paymentSource?.targetName || movement.sourceAccount || "Nómina"}</strong></span>
            {movement.budgetItemName && (
              <>
                <span>•</span>
                <span>Rubro actual: <strong>{movement.budgetItemName}</strong></span>
              </>
            )}
          </div>

          {/* Selector de Medio / Cuenta de Origen */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)" }}>
            <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
              💳 Cambiar Cuenta / Medio de Pago Origen (¿De dónde salió realmente el dinero?):
            </label>
            <select
              value={selectedSourceAccountKey}
              onChange={(e) => setSelectedSourceAccountKey(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                background: isLight ? "#ffffff" : "var(--bg-primary)",
                color: "var(--text-primary)",
                border: isLight ? "1px solid rgba(0,0,0,0.15)" : "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              {allPaymentSources.map((src) => (
                <option key={src.key} value={src.key}>
                  {src.icon} {src.name} {src.availableLimit !== undefined ? `(Cupo libre: $${Number(src.availableLimit).toLocaleString("es-CO")})` : src.balance !== undefined ? `(Saldo: $${Number(src.balance).toLocaleString("es-CO")})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Navigation Segmented Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 4,
            background: isLight ? "#f1f5f9" : "rgba(15, 23, 42, 0.6)",
            padding: "4px",
            borderRadius: "12px",
            marginBottom: 18,
            border: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("budget_envelope")}
            style={{
              padding: "8px 6px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "budget_envelope" ? (isLight ? "#ffffff" : "rgba(30, 41, 59, 0.95)") : "transparent",
              color: activeTab === "budget_envelope" ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: activeTab === "budget_envelope" ? 700 : 500,
              fontSize: "0.76rem",
              cursor: "pointer",
              boxShadow: activeTab === "budget_envelope" ? (isLight ? "0 2px 6px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.3)") : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
          >
            <span>📁</span> Un Rubro
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("multi_envelope")}
            style={{
              padding: "8px 6px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "multi_envelope" ? (isLight ? "#ffffff" : "rgba(30, 41, 59, 0.95)") : "transparent",
              color: activeTab === "multi_envelope" ? "#0284c7" : "var(--text-muted)",
              fontWeight: activeTab === "multi_envelope" ? 700 : 500,
              fontSize: "0.76rem",
              cursor: "pointer",
              boxShadow: activeTab === "multi_envelope" ? (isLight ? "0 2px 6px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.3)") : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
          >
            <span>📊</span> Distribuir
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("credit_card")}
            style={{
              padding: "8px 6px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "credit_card" ? (isLight ? "#ffffff" : "rgba(30, 41, 59, 0.95)") : "transparent",
              color: activeTab === "credit_card" ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: activeTab === "credit_card" ? 700 : 500,
              fontSize: "0.76rem",
              cursor: "pointer",
              boxShadow: activeTab === "credit_card" ? (isLight ? "0 2px 6px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.3)") : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
          >
            <span>💳</span> Tarjeta
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("internal_transfer")}
            style={{
              padding: "8px 6px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "internal_transfer" ? (isLight ? "#ffffff" : "rgba(30, 41, 59, 0.95)") : "transparent",
              color: activeTab === "internal_transfer" ? "#10b981" : "var(--text-muted)",
              fontWeight: activeTab === "internal_transfer" ? 700 : 500,
              fontSize: "0.76rem",
              cursor: "pointer",
              boxShadow: activeTab === "internal_transfer" ? (isLight ? "0 2px 6px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.3)") : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
          >
            <span>🔄</span> Transferir
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("debt")}
            style={{
              padding: "8px 6px",
              borderRadius: "9px",
              border: "none",
              background: activeTab === "debt" ? (isLight ? "#ffffff" : "rgba(30, 41, 59, 0.95)") : "transparent",
              color: activeTab === "debt" ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: activeTab === "debt" ? 700 : 500,
              fontSize: "0.76rem",
              cursor: "pointer",
              boxShadow: activeTab === "debt" ? (isLight ? "0 2px 6px rgba(0,0,0,0.08)" : "0 2px 8px rgba(0,0,0,0.3)") : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
          >
            <span>🤝</span> Deuda
          </button>
        </div>

        {/* Tab 0: Multi-Envelope Distribution */}
        {activeTab === "multi_envelope" && (
          <div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
              Distribuye los <strong>{formatMoney(movementAmount, currency)}</strong> entre varios rubros del presupuesto (ahorros, ocio, compras, salidas, etc.). Puedes seleccionar conceptos específicos o llenar el cupo disponible de cada rubro hasta completar el pago.
            </p>

            {/* Credit Card Link Option */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                background: isLight ? "rgba(2, 132, 199, 0.06)" : "rgba(56, 189, 248, 0.08)",
                borderRadius: 10,
                border: "1px solid rgba(56, 189, 248, 0.25)",
                marginBottom: 14,
                flexWrap: "wrap",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isCardPaymentInSplit}
                  onChange={(e) => setIsCardPaymentInSplit(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <span>💳 Vincular como abono a Tarjeta de Crédito (libera cupo)</span>
              </label>

              {isCardPaymentInSplit && (
                <select
                  value={splitCardId}
                  onChange={(e) => setSplitCardId(e.target.value)}
                  style={{
                    marginLeft: "auto",
                    padding: "5px 10px",
                    borderRadius: 8,
                    fontSize: "0.78rem",
                    background: isLight ? "#ffffff" : "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {creditCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Smart Auto-Distribute & Status Pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 10,
                background: splitRemaining === 0
                  ? "rgba(16, 185, 129, 0.12)"
                  : splitRemaining > 0
                  ? "rgba(245, 158, 11, 0.12)"
                  : "rgba(239, 68, 68, 0.12)",
                border: splitRemaining === 0
                  ? "1px solid rgba(16, 185, 129, 0.3)"
                  : splitRemaining > 0
                  ? "1px solid rgba(245, 158, 11, 0.3)"
                  : "1px solid rgba(239, 68, 68, 0.3)",
                marginBottom: 14,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>
                  Distribuido: <strong>{formatMoney(totalSplitAssigned, currency)}</strong> de {formatMoney(movementAmount, currency)}
                </span>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: splitRemaining === 0 ? "#10b981" : splitRemaining > 0 ? "#f59e0b" : "#ef4444",
                  }}
                >
                  {splitRemaining === 0
                    ? "✓ Monto 100% distribuido"
                    : splitRemaining > 0
                    ? `Falta asignar: ${formatMoney(splitRemaining, currency)}`
                    : `Excedido por: ${formatMoney(Math.abs(splitRemaining), currency)}`}
                </span>
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {totalSplitAssigned > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSplitAmounts({});
                      setSplitSubItems({});
                      setSplitInputValues({});
                    }}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--text-muted)",
                      padding: "5px 9px",
                      fontSize: "0.74rem",
                      cursor: "pointer",
                    }}
                  >
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAutoDistribute}
                  style={{
                    background: "rgba(14, 165, 233, 0.15)",
                    border: "1px solid #0ea5e9",
                    borderRadius: 8,
                    color: "#0ea5e9",
                    padding: "5px 10px",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  🪄 Sugerir Distribución
                </button>
              </div>
            </div>

            {/* Quick Collapse/Expand All & Strategy Title */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, marginTop: 4 }}>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.03em" }}>
                🏛️ PILARES DE LA ESTRATEGIA ({currentPeriodRatios.needs} / {currentPeriodRatios.wants} / {currentPeriodRatios.wealth})
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setCollapsedPillars({})}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: isLight ? "#0284c7" : "#38bdf8",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Desplegar todos
                </button>
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>•</span>
                <button
                  type="button"
                  onClick={() => setCollapsedPillars({ needs: true, wants: true, wealth: true })}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Ocultar todos
                </button>
              </div>
            </div>

            {/* Envelopes list for multi-allocation grouped by Strategy Pillars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {strategyPillars.map((pillar) => {
                const pillarEnvelopes = (filteredBudgetItems || []).filter((item) => item.pillarType === pillar.id);
                if (selectedPillarFilter !== "all" && selectedPillarFilter !== pillar.id) return null;
                if (pillarEnvelopes.length === 0) return null;

                const isPillarCollapsed = Boolean(collapsedPillars[pillar.id]);
                const pillarBudgetTotal = pillarEnvelopes.reduce((acc, e) => acc + (Number(e.amount || e.monthlyContribution) || 0), 0);
                const pillarAssignedTotal = pillarEnvelopes.reduce((acc, e) => acc + (Number(splitAmounts[e.id]) || 0), 0);

                return (
                  <div
                    key={pillar.id}
                    style={{
                      borderRadius: "14px",
                      background: isLight
                        ? isPillarCollapsed ? "#f8fafc" : "#ffffff"
                        : isPillarCollapsed ? "rgba(15, 23, 42, 0.45)" : "rgba(15, 23, 42, 0.75)",
                      border: `1.5px solid ${isPillarCollapsed ? (isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)") : pillar.borderColor}`,
                      boxShadow: isPillarCollapsed ? "none" : (isLight ? "0 4px 14px rgba(0,0,0,0.04)" : "0 4px 18px rgba(0,0,0,0.25)"),
                      transition: "all 0.2s ease",
                      overflow: "hidden",
                    }}
                  >
                    {/* Pillar Section Header */}
                    <div
                      onClick={(e) => toggleCollapsePillar(pillar.id, e)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: isPillarCollapsed
                          ? (isLight ? "#f1f5f9" : "rgba(30, 41, 59, 0.35)")
                          : pillar.bgColor,
                        cursor: "pointer",
                        borderBottom: isPillarCollapsed ? "none" : `1px solid ${pillar.borderColor}40`,
                        userSelect: "none",
                        transition: "background 0.2s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: "1.2rem" }}>{pillar.icon}</span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>{pillar.name}</strong>
                            <span
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: 800,
                                color: pillar.color,
                                background: `${pillar.color}20`,
                                padding: "2px 7px",
                                borderRadius: "5px",
                                letterSpacing: "0.02em",
                              }}
                            >
                              {pillar.ratio}
                            </span>
                          </div>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                            {pillarEnvelopes.length} rubro(s) • Presupuesto: <strong>{formatMoney(pillarBudgetTotal, currency)}</strong>
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {pillarAssignedTotal > 0 && (
                          <span
                            style={{
                              fontSize: "0.76rem",
                              fontWeight: 800,
                              color: "#10b981",
                              background: "rgba(16, 185, 129, 0.12)",
                              border: "1px solid rgba(16, 185, 129, 0.3)",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontFamily: "JetBrains Mono, monospace",
                            }}
                          >
                            +{formatMoney(pillarAssignedTotal, currency)}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: "0.72rem",
                            color: isPillarCollapsed ? "var(--text-muted)" : pillar.color,
                            fontWeight: 700,
                            background: isPillarCollapsed ? (isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)") : `${pillar.color}20`,
                            border: `1px solid ${isPillarCollapsed ? "transparent" : `${pillar.color}35`}`,
                            padding: "3px 9px",
                            borderRadius: "6px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {isPillarCollapsed ? `▼ Ver rubros (${pillarEnvelopes.length})` : "▲ Ocultar"}
                        </span>
                      </div>
                    </div>

                    {/* Pillar Envelopes List */}
                    {!isPillarCollapsed && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          padding: "12px",
                          background: isLight ? "rgba(248, 250, 252, 0.5)" : "rgba(10, 16, 30, 0.25)",
                        }}
                      >
                        {pillarEnvelopes.map((env) => {
                          const metrics = calculateEnvelopeMetrics(env);
                          const {
                            budgetedAmt,
                            alreadySpent,
                            subItemsList,
                            pendingReservedConcepts,
                            pendingReservedAmt,
                            availableCupo,
                            currentVal,
                            newTotal,
                            isExhausted,
                            remainingCupo,
                            canFillCupo,
                            toFill,
                          } = metrics;
                          const isExpanded = Boolean(expandedEnvelopes[env.id]);

                          return (
                            <div
                              key={env.id}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                padding: "10px 12px",
                                borderRadius: 10,
                                background: currentVal > 0
                                  ? (isLight ? "rgba(2, 132, 199, 0.05)" : "rgba(2, 132, 199, 0.12)")
                                  : (isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)"),
                                border: currentVal > 0 ? "1.5px solid #0ea5e9" : (isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid var(--border)"),
                                gap: 8,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: "1rem" }}>{env.icon || "📦"}</span>
                                    <strong style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{env.name}</strong>
                                  </div>

                                  <div style={{ display: "flex", gap: 6, fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2, flexWrap: "wrap" }}>
                                    <span>Presupuesto: <strong>{formatMoney(budgetedAmt, currency)}</strong></span>
                                    <span>•</span>
                                    <span>Gastado: {formatMoney(alreadySpent, currency)}</span>
                                    <span>•</span>
                                    <span style={{ color: availableCupo > 0 ? "#10b981" : "var(--text-muted)", fontWeight: 700 }}>
                                      Cupo libre para tarjeta: {formatMoney(availableCupo, currency)}
                                    </span>
                                  </div>

                                  {/* Pending concept reservation notice */}
                                  {pendingReservedAmt > 0 && (
                                    <div
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                        fontSize: "0.68rem",
                                        color: "#f59e0b",
                                        background: isLight ? "rgba(245, 158, 11, 0.1)" : "rgba(245, 158, 11, 0.18)",
                                        padding: "2px 7px",
                                        borderRadius: 5,
                                        marginTop: 4,
                                        fontWeight: 600,
                                      }}
                                    >
                                      <span>🔒</span>
                                      <span>
                                        <strong>{formatMoney(pendingReservedAmt, currency)}</strong> reservado para {pendingReservedConcepts.map((c) => c.name).join(", ")} (se mantiene intacto)
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                  {canFillCupo && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSplitAmounts((prev) => ({
                                          ...prev,
                                          [env.id]: currentVal + toFill,
                                        }));
                                      }}
                                      style={{
                                        background: "rgba(16, 185, 129, 0.15)",
                                        border: "1px solid #10b981",
                                        borderRadius: 6,
                                        padding: "4px 8px",
                                        fontSize: "0.72rem",
                                        color: "#10b981",
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                      title={`Llenar cupo libre restante respetando los conceptos reservados (+${formatMoney(toFill)})`}
                                    >
                                      ⚡ Llenar cupo (+{formatMoney(toFill)})
                                    </button>
                                  )}

                                  {splitRemaining > 0 && !canFillCupo && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSplitAmounts((prev) => ({
                                          ...prev,
                                          [env.id]: currentVal + splitRemaining,
                                        }));
                                      }}
                                      style={{
                                        background: "transparent",
                                        border: "1px dashed var(--border)",
                                        borderRadius: 6,
                                        padding: "4px 7px",
                                        fontSize: "0.7rem",
                                        color: "var(--text-muted)",
                                        cursor: "pointer",
                                      }}
                                      title="Asignar el saldo restante del movimiento a este rubro"
                                    >
                                      + Faltante
                                    </button>
                                  )}

                                  <div style={{ position: "relative", width: "120px" }}>
                                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                      $
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0"
                                      value={
                                        splitInputValues[env.id] !== undefined
                                          ? splitInputValues[env.id]
                                          : currentVal > 0
                                          ? formatMoney(currentVal, currency).replace("$", "").trim()
                                          : ""
                                      }
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setSplitInputValues((prev) => ({ ...prev, [env.id]: raw }));
                                        const parsed = parseLocalNumber(raw);
                                        setSplitAmounts((prev) => ({
                                          ...prev,
                                          [env.id]: parsed,
                                        }));
                                      }}
                                      onBlur={() => {
                                        setSplitInputValues((prev) => {
                                          const copy = { ...prev };
                                          delete copy[env.id];
                                          return copy;
                                        });
                                      }}
                                      style={{
                                        width: "100%",
                                        padding: "5px 8px 5px 20px",
                                        borderRadius: 8,
                                        border: "1px solid var(--border)",
                                        background: isLight ? "#ffffff" : "rgba(0,0,0,0.3)",
                                        color: "var(--text-primary)",
                                        fontSize: "0.82rem",
                                        fontFamily: "JetBrains Mono, monospace",
                                        fontWeight: 700,
                                        textAlign: "right",
                                      }}
                                    />
                                  </div>

                                  {currentVal > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSplitAmounts((prev) => {
                                          const copy = { ...prev };
                                          delete copy[env.id];
                                          return copy;
                                        });
                                        setSplitInputValues((prev) => {
                                          const copy = { ...prev };
                                          delete copy[env.id];
                                          return copy;
                                        });
                                        setSplitSubItems((prev) => {
                                          const copy = { ...prev };
                                          Object.keys(copy).forEach((k) => {
                                            if (copy[k].envId === env.id) delete copy[k];
                                          });
                                          return copy;
                                        });
                                      }}
                                      title="Quitar asignación de este rubro"
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--text-muted)",
                                        cursor: "pointer",
                                        padding: "2px 4px",
                                        fontSize: "0.75rem",
                                      }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Status Limit Pill */}
                              {currentVal > 0 && (
                                <div
                                  style={{
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    background: isExhausted
                                      ? (isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)")
                                      : (isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.16)"),
                                    color: isExhausted ? "#f59e0b" : "#10b981",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    alignSelf: "flex-start",
                                  }}
                                >
                                  <span>{isExhausted ? "🔒 Cupo 100% agotado este mes" : "🟢 Cupo disponible restante"}</span>
                                  <span>•</span>
                                  <span>
                                    {isExhausted
                                      ? `Límite alcanzado (${formatMoney(newTotal, currency)} / ${formatMoney(budgetedAmt, currency)})`
                                      : `Te queda un cupo de ${formatMoney(remainingCupo, currency)} para otros gastos`}
                                  </span>
                                </div>
                              )}

                              {/* Collapsible Sub-Items Accordion */}
                              {subItemsList.length > 0 && (
                                <div style={{ marginTop: 2 }}>
                                  <button
                                    type="button"
                                    onClick={(e) => toggleExpandEnvelope(env.id, e)}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: isLight ? "#0284c7" : "#38bdf8",
                                      fontSize: "0.72rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      padding: "2px 0",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                    }}
                                  >
                                    <span>{isExpanded ? "▲ Ocultar conceptos" : `▼ Ver conceptos (${subItemsList.length})`}</span>
                                  </button>

                                  {isExpanded && (
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 5,
                                        paddingTop: 6,
                                        marginTop: 4,
                                        borderTop: isLight ? "1px dashed rgba(0,0,0,0.08)" : "1px dashed rgba(255,255,255,0.08)",
                                      }}
                                    >
                                      <div style={{ fontSize: "0.66rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                                        📌 Conceptos del rubro (haz clic para incluir o excluir de la tarjeta):
                                      </div>
                                      {subItemsList.map((sub, idx) => {
                                        const subKey = sub.id || `${env.id}_sub_${idx}`;
                                        const isSubIncluded = Boolean(splitSubItems[subKey]);
                                        const subAmt = Number(sub.amount) || 0;

                                        return (
                                          <div
                                            key={subKey}
                                            onClick={() => {
                                              if (isSubIncluded) {
                                                setSplitSubItems((prev) => {
                                                  const copy = { ...prev };
                                                  delete copy[subKey];
                                                  return copy;
                                                });
                                                setSplitAmounts((prev) => ({
                                                  ...prev,
                                                  [env.id]: Math.max(0, currentVal - subAmt),
                                                }));
                                              } else {
                                                setSplitSubItems((prev) => ({
                                                  ...prev,
                                                  [subKey]: { envId: env.id, sub, amount: subAmt },
                                                }));
                                                setSplitAmounts((prev) => ({
                                                  ...prev,
                                                  [env.id]: currentVal + subAmt,
                                                }));
                                              }
                                            }}
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "space-between",
                                              padding: "5px 10px",
                                              borderRadius: 7,
                                              background: isSubIncluded
                                                ? (isLight ? "rgba(16, 185, 129, 0.14)" : "rgba(16, 185, 129, 0.2)")
                                                : (isLight ? "#ffffff" : "rgba(15, 23, 42, 0.45)"),
                                              border: isSubIncluded ? "1px solid #10b981" : "1px solid var(--border)",
                                              cursor: "pointer",
                                              fontSize: "0.75rem",
                                            }}
                                          >
                                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                              <span style={{ color: isSubIncluded ? "#10b981" : "var(--text-muted)", fontWeight: 800 }}>
                                                {isSubIncluded ? "✓" : "+"}
                                              </span>
                                              <span style={{ fontWeight: 600, color: isSubIncluded ? "#10b981" : "var(--text-primary)" }}>
                                                {sub.name}
                                              </span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                              <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
                                                {formatMoney(subAmt, currency)}
                                              </span>
                                              <span
                                                style={{
                                                  fontSize: "0.65rem",
                                                  fontWeight: 700,
                                                  padding: "1px 5px",
                                                  borderRadius: 4,
                                                  background: isSubIncluded ? "#10b981" : (isLight ? "#e2e8f0" : "rgba(255,255,255,0.08)"),
                                                  color: isSubIncluded ? "#04101e" : "var(--text-muted)",
                                                }}
                                              >
                                                {isSubIncluded ? "✓ Incluido en tarjeta" : "Sumar a tarjeta"}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 1: Budget Envelope Selection */}
        {activeTab === "budget_envelope" && (
          <div>
            {isCardMovementInitial && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(56, 189, 248, 0.12)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  marginBottom: 12,
                  fontSize: "0.76rem",
                  color: "var(--text-primary)",
                }}
              >
                <span>💡 ¿Este pago de tarjeta cubrió varios gastos (ej. Gemini + Ocio + Viajes)?</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("multi_envelope")}
                  style={{
                    background: "#0ea5e9",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: "0.72rem",
                  }}
                >
                  📊 Distribuir Varios
                </button>
              </div>
            )}

            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
              Asigna este movimiento a un rubro del presupuesto. El valor consumirá el cupo disponible del rubro correspondiente en este mes.
            </p>

            {/* Filter pills & search */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="🔍 Buscar rubro (ej. Salidas, Arriendo)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: "7px 12px",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  border: isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--border)",
                  background: isLight ? "#ffffff" : "var(--bg-surface)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { id: "all", label: "Todos" },
                  { id: "needs", label: `Fijos (${currentPeriodRatios.needs}%)` },
                  { id: "wants", label: `Estilo (${currentPeriodRatios.wants}%)` },
                  { id: "wealth", label: `Ahorro (${currentPeriodRatios.wealth}%)` },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setSelectedPillarFilter(pill.id)}
                    style={{
                      padding: "5px 9px",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      fontWeight: selectedPillarFilter === pill.id ? 700 : 500,
                      border: "none",
                      background: selectedPillarFilter === pill.id ? "#38bdf8" : (isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)"),
                      color: selectedPillarFilter === pill.id ? "#0f172a" : "var(--text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Collapse/Expand All & Strategy Title */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, marginTop: 4 }}>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.03em" }}>
                🏛️ PILARES DE LA ESTRATEGIA ({currentPeriodRatios.needs} / {currentPeriodRatios.wants} / {currentPeriodRatios.wealth})
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setCollapsedPillars({})}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: isLight ? "#0284c7" : "#38bdf8",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Desplegar todos
                </button>
                <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>•</span>
                <button
                  type="button"
                  onClick={() => setCollapsedPillars({ needs: true, wants: true, wealth: true })}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  Ocultar todos
                </button>
              </div>
            </div>

            {/* List of Envelopes grouped by Strategy Pillars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {filteredBudgetItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                  No se encontraron rubros con ese filtro.
                </div>
              ) : (
                strategyPillars.map((pillar) => {
                  const pillarItems = filteredBudgetItems.filter((item) => item.pillarType === pillar.id);
                  if (selectedPillarFilter !== "all" && selectedPillarFilter !== pillar.id) return null;
                  if (pillarItems.length === 0) return null;

                  const isPillarCollapsed = Boolean(collapsedPillars[pillar.id]);
                  const pillarBudgetTotal = pillarItems.reduce((acc, e) => acc + (Number(e.amount || e.monthlyContribution) || 0), 0);

                  return (
                    <div
                      key={pillar.id}
                      style={{
                        borderRadius: "14px",
                        background: isLight
                          ? isPillarCollapsed ? "#f8fafc" : "#ffffff"
                          : isPillarCollapsed ? "rgba(15, 23, 42, 0.45)" : "rgba(15, 23, 42, 0.75)",
                        border: `1.5px solid ${isPillarCollapsed ? (isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)") : pillar.borderColor}`,
                        boxShadow: isPillarCollapsed ? "none" : (isLight ? "0 4px 14px rgba(0,0,0,0.04)" : "0 4px 18px rgba(0,0,0,0.25)"),
                        transition: "all 0.2s ease",
                        overflow: "hidden",
                      }}
                    >
                      {/* Pillar Section Header */}
                      <div
                        onClick={(e) => toggleCollapsePillar(pillar.id, e)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: isPillarCollapsed
                            ? (isLight ? "#f1f5f9" : "rgba(30, 41, 59, 0.35)")
                            : pillar.bgColor,
                          cursor: "pointer",
                          borderBottom: isPillarCollapsed ? "none" : `1px solid ${pillar.borderColor}40`,
                          userSelect: "none",
                          transition: "background 0.2s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: "1.2rem" }}>{pillar.icon}</span>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>{pillar.name}</strong>
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 800,
                                  color: pillar.color,
                                  background: `${pillar.color}20`,
                                  padding: "2px 7px",
                                  borderRadius: "5px",
                                  letterSpacing: "0.02em",
                                }}
                              >
                                {pillar.ratio}
                              </span>
                            </div>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              {pillarItems.length} rubro(s) • Total: <strong>{formatMoney(pillarBudgetTotal, currency)}</strong>
                            </span>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: "0.72rem",
                            color: isPillarCollapsed ? "var(--text-muted)" : pillar.color,
                            fontWeight: 700,
                            background: isPillarCollapsed ? (isLight ? "#e2e8f0" : "rgba(255,255,255,0.06)") : `${pillar.color}20`,
                            border: `1px solid ${isPillarCollapsed ? "transparent" : `${pillar.color}35`}`,
                            padding: "3px 9px",
                            borderRadius: "6px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {isPillarCollapsed ? `▼ Ver rubros (${pillarItems.length})` : "▲ Ocultar"}
                        </span>
                      </div>

                      {/* Envelopes of Pillar */}
                      {!isPillarCollapsed && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                            padding: "12px",
                            background: isLight ? "rgba(248, 250, 252, 0.5)" : "rgba(10, 16, 30, 0.25)",
                          }}
                        >
                          {pillarItems.map((item) => {
                            const isSelected = selectedEnvelopeId === item.id;
                            const pillarColor = pillar.color;
                            const budgetedAmt = Number(item.amount || item.monthlyContribution) || 0;

                            const itemExpenses = (expensesLog || []).filter((tx) => {
                              if (tx.type === "credit" || tx.budgetItemType === "income") return false;
                              if (tx.budgetItemId && tx.budgetItemId === item.id) return true;
                              const bName = (tx.budgetItemName || "").toLowerCase();
                              return bName && bName === item.name.toLowerCase();
                            });

                            const spentAmt = itemExpenses.reduce((acc, tx) => acc + calculateEffectiveExpense(tx, debts).effectiveSpent, 0);
                            const subItemsList = Array.isArray(item.subItems) ? item.subItems : [];
                            const isExpanded = Boolean(expandedEnvelopes[item.id]);

                            // Pending reserved concepts check
                            const pendingReservedConcepts = subItemsList.filter((sub, idx) => {
                              const subKey = sub.id || `${item.id}_sub_${idx}`;
                              const isAlreadyPaid = Boolean(
                                itemExpenses.find(
                                  (tx) =>
                                    (sub.id && tx.subItemId === sub.id) ||
                                    tx.subItemId === subKey ||
                                    (sub.name && tx.subItemName?.toLowerCase() === sub.name.toLowerCase()) ||
                                    (sub.name && tx.description?.toLowerCase().includes(sub.name.toLowerCase()))
                                )
                              );
                              return !isAlreadyPaid;
                            });
                            const pendingReservedAmt = pendingReservedConcepts.reduce(
                              (sum, sub) => sum + (Number(sub.amount) || 0),
                              0
                            );
                            const freeCupo = Math.max(0, budgetedAmt - spentAmt - pendingReservedAmt);

                            return (
                              <div
                                key={item.id}
                                onClick={() => {
                                  setSelectedEnvelopeId(item.id);
                                  const opts = getDestinationOptions(item);
                                  if (opts.length > 0 && (!selectedDestAccountId || !opts.some((o) => o.principal.id === selectedDestAccountId))) {
                                    setSelectedDestAccountId(opts[0].principal.id);
                                  }
                                  if (selectedEnvelopeId !== item.id) {
                                    const matchingSub = subItemsList.find((s) => Number(s.amount) === movementAmount);
                                    setSelectedSubItem(matchingSub || null);
                                  }
                                }}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                  padding: "10px 12px",
                                  borderRadius: "10px",
                                  border: isSelected ? `2px solid ${pillarColor}` : (isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid var(--border)"),
                                  background: isSelected
                                    ? (isLight ? "rgba(56, 189, 248, 0.08)" : "rgba(56, 189, 248, 0.12)")
                                    : (isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)"),
                                  cursor: "pointer",
                                  transition: "all 0.12s ease",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: "1.1rem" }}>{item.icon || "📁"}</span>
                                    <div>
                                      <strong style={{ fontSize: "0.85rem", color: "var(--text-primary)", display: "block" }}>
                                        {item.name}
                                      </strong>
                                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                                        {item.typeLabel || item.pillarType}
                                      </span>
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem", fontWeight: 700, color: spentAmt >= budgetedAmt && budgetedAmt > 0 ? "#10b981" : "var(--text-primary)" }}>
                                      {formatMoney(spentAmt, currency)} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>/ {formatMoney(budgetedAmt, currency)}</span>
                                    </div>
                                    <span style={{ fontSize: "0.66rem", color: freeCupo > 0 ? "#10b981" : "var(--text-muted)", fontWeight: 600 }}>
                                      Cupo libre: {formatMoney(freeCupo, currency)}
                                    </span>
                                  </div>
                                </div>

                                {/* Pending concept reservation warning */}
                                {pendingReservedAmt > 0 && (
                                  <div
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      fontSize: "0.68rem",
                                      color: "#f59e0b",
                                      background: isLight ? "rgba(245, 158, 11, 0.1)" : "rgba(245, 158, 11, 0.18)",
                                      padding: "2px 7px",
                                      borderRadius: 5,
                                      fontWeight: 600,
                                      alignSelf: "flex-start",
                                    }}
                                  >
                                    <span>🔒</span>
                                    <span>
                                      <strong>{formatMoney(pendingReservedAmt, currency)}</strong> reservado para {pendingReservedConcepts.map((c) => c.name).join(", ")} (intacto)
                                    </span>
                                  </div>
                                )}

                                {/* Collapsible Sub-Items Accordion */}
                                {subItemsList.length > 0 && (
                                  <div style={{ marginTop: 2 }}>
                                    <button
                                      type="button"
                                      onClick={(e) => toggleExpandEnvelope(item.id, e)}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: isLight ? "#0284c7" : "#38bdf8",
                                        fontSize: "0.72rem",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        padding: "2px 0",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                    >
                                      <span>{isExpanded ? "▲ Ocultar conceptos" : `▼ Ver conceptos (${subItemsList.length})`}</span>
                                    </button>

                                    {isExpanded && (
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 5,
                                          paddingTop: 6,
                                          marginTop: 4,
                                          borderTop: isLight ? "1px dashed rgba(0,0,0,0.08)" : "1px dashed rgba(255,255,255,0.08)",
                                        }}
                                      >
                                        <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                          📌 Conceptos del rubro (Tachar o imputar movimiento aquí):
                                        </div>
                                        {subItemsList.map((sub, idx) => {
                                          const subKey = sub.id || `${item.id}_sub_${idx}`;
                                          const matchedSubTx = itemExpenses.find(
                                            (tx) =>
                                              (sub.id && tx.subItemId === sub.id) ||
                                              tx.subItemId === subKey ||
                                              (sub.name && tx.subItemName?.toLowerCase() === sub.name.toLowerCase()) ||
                                              (sub.name && tx.description?.toLowerCase().includes(sub.name.toLowerCase()))
                                          );
                                          const isSubChecked = Boolean(matchedSubTx);
                                          const isSubSelectedForAssign =
                                            isSelected &&
                                            selectedSubItem &&
                                            ((selectedSubItem.id && selectedSubItem.id === sub.id) ||
                                              selectedSubItem.name === sub.name);
                                          const matchesAmount = Number(sub.amount) === movementAmount;

                                          return (
                                            <div
                                              key={subKey}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedEnvelopeId(item.id);
                                                setSelectedSubItem(isSubSelectedForAssign ? null : { ...sub, subKey });
                                              }}
                                              style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 8,
                                                padding: "6px 10px",
                                                borderRadius: "8px",
                                                background: isSubSelectedForAssign
                                                  ? (isLight ? "rgba(16, 185, 129, 0.14)" : "rgba(16, 185, 129, 0.2)")
                                                  : isSubChecked
                                                  ? (isLight ? "rgba(16, 185, 129, 0.06)" : "rgba(16, 185, 129, 0.08)")
                                                  : (isLight ? "#ffffff" : "rgba(15, 23, 42, 0.45)"),
                                                border: isSubSelectedForAssign
                                                  ? "1.5px solid #10b981"
                                                  : matchesAmount
                                                  ? "1px dashed #38bdf8"
                                                  : (isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)"),
                                              }}
                                            >
                                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <button
                                                  type="button"
                                                  onClick={(e) => handleToggleSubItemCheck(e, item, sub, subKey, matchedSubTx)}
                                                  title={isSubChecked ? "Desmarcar este concepto" : "Tachar / Marcar como pagado manualmente"}
                                                  style={{
                                                    width: 20,
                                                    height: 20,
                                                    borderRadius: 5,
                                                    border: isSubChecked ? "1.5px solid #10b981" : "1.5px solid #64748b",
                                                    background: isSubChecked ? "#10b981" : "transparent",
                                                    color: isSubChecked ? "#04101e" : "transparent",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: "0.72rem",
                                                    fontWeight: 900,
                                                    cursor: "pointer",
                                                    padding: 0,
                                                    flexShrink: 0,
                                                  }}
                                                >
                                                  ✓
                                                </button>
                                                <div>
                                                  <span
                                                    style={{
                                                      fontSize: "0.78rem",
                                                      fontWeight: 600,
                                                      color: isSubChecked ? "#10b981" : "var(--text-primary)",
                                                      textDecoration: isSubChecked ? "line-through" : "none",
                                                    }}
                                                  >
                                                    {sub.name}
                                                  </span>
                                                  {matchesAmount && (
                                                    <span
                                                      style={{
                                                        marginLeft: 6,
                                                        fontSize: "0.64rem",
                                                        padding: "1px 5px",
                                                        borderRadius: 4,
                                                        background: "rgba(56, 189, 248, 0.16)",
                                                        color: "#38bdf8",
                                                        fontWeight: 700,
                                                      }}
                                                    >
                                                      🎯 Mismo valor
                                                    </span>
                                                  )}
                                                </div>
                                              </div>

                                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.76rem", fontWeight: 700, color: "var(--text-primary)" }}>
                                                  {formatMoney(sub.amount, currency)}
                                                </span>
                                                <span
                                                  style={{
                                                    fontSize: "0.66rem",
                                                    fontWeight: 700,
                                                    padding: "2px 6px",
                                                    borderRadius: 5,
                                                    background: isSubSelectedForAssign
                                                      ? "#10b981"
                                                      : (isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"),
                                                    color: isSubSelectedForAssign ? "#04101e" : "var(--text-muted)",
                                                  }}
                                                >
                                                  {isSubSelectedForAssign ? "✓ Imputar aquí" : "Elegir"}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Registered Expenses in this Envelope */}
                                {isSelected && itemExpenses.length > 0 && (
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 4,
                                      paddingTop: 6,
                                      borderTop: isLight ? "1px dashed rgba(0,0,0,0.08)" : "1px dashed rgba(255,255,255,0.08)",
                                    }}
                                  >
                                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)" }}>
                                      🧾 Movimientos ya imputados en {item.name}:
                                    </div>
                                    {itemExpenses.map((tx) => (
                                      <div
                                        key={tx.id}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          fontSize: "0.73rem",
                                          padding: "4px 8px",
                                          borderRadius: 6,
                                          background: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)",
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <span style={{ color: "#10b981" }}>✓</span>
                                          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                                            {tx.description || tx.subItemName || item.name}
                                          </span>
                                          {tx.isAutoSubItemCheck && (
                                            <span style={{ fontSize: "0.62rem", color: "#f59e0b", background: "rgba(245, 158, 11, 0.14)", padding: "1px 5px", borderRadius: 4 }}>
                                              Check manual
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "var(--text-primary)" }}>
                                            {formatMoney(tx.amount, currency)}
                                          </span>
                                          {onDeleteTransaction && tx.id !== movement.id && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteTransaction(tx.id);
                                              }}
                                              title="Quitar / destachar este gasto"
                                              style={{
                                                background: "transparent",
                                                border: "none",
                                                color: "#f43f5e",
                                                cursor: "pointer",
                                                fontSize: "0.75rem",
                                                padding: "0 2px",
                                              }}
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Selector de Cuenta Destino (Ahorro / Fondo de Emergencia) */}
            {destinationOptions.length > 0 && (
              <div
                style={{
                  marginTop: -8,
                  marginBottom: 18,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: isLight ? "rgba(16, 185, 129, 0.06)" : "rgba(16, 185, 129, 0.08)",
                  border: isLight ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(16, 185, 129, 0.35)",
                }}
              >
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: isLight ? "#047857" : "#34d399", marginBottom: 4 }}>
                  {selectedEnvelopeObj?.category === "equity_investment" || (selectedEnvelopeObj?.name || "").toLowerCase().includes("renta variable") || (selectedEnvelopeObj?.name || "").toLowerCase().includes("portafolio")
                    ? "💵 ¿A qué cuenta en dólares / fondeo llegó este dinero?"
                    : "🏦 ¿A qué cuenta llegó este dinero?"}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.4 }}>
                  {selectedEnvelopeObj?.category === "equity_investment" || (selectedEnvelopeObj?.name || "").toLowerCase().includes("renta variable") || (selectedEnvelopeObj?.name || "").toLowerCase().includes("portafolio")
                    ? "Selecciona la cuenta en dólares para fondear tu broker. Puedes marcar tu favorita con la estrella ⭐ para que se elija por defecto."
                    : "Se abonará en la cuenta principal de la entidad. Luego, desde Renta Fija, podrás moverlo al bolsillo con un movimiento interno."}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {destinationOptions.map(({ principal, pocket, isDollar }) => {
                    const isChosen =
                      selectedDestAccountId === principal.id ||
                      (destinationOptions.length === 1 && !selectedDestAccountId);
                    const isDefaultFunding = principal.id === defaultFundingAccountId;
                    const isEquityItem = selectedEnvelopeObj?.category === "equity_investment" || (selectedEnvelopeObj?.name || "").toLowerCase().includes("renta variable") || (selectedEnvelopeObj?.name || "").toLowerCase().includes("portafolio");

                    return (
                      <div
                        key={principal.id}
                        onClick={() => setSelectedDestAccountId(principal.id)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          textAlign: "left",
                          padding: "9px 12px",
                          borderRadius: 10,
                          cursor: "pointer",
                          border: isChosen
                            ? "2px solid #10b981"
                            : isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid var(--border)",
                          background: isChosen
                            ? (isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.18)")
                            : (isLight ? "#ffffff" : "var(--bg-surface)"),
                          color: "var(--text-primary)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 700 }}>
                              {isChosen ? "✅ " : "○ "}{principal.name}
                            </span>
                            {isDefaultFunding && isEquityItem && (
                              <span style={{ fontSize: "0.64rem", padding: "1px 6px", borderRadius: 4, background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b", fontWeight: 700 }}>
                                ⭐ Predeterminada Fondeo
                              </span>
                            )}
                            {isDollar && !isDefaultFunding && (
                              <span style={{ fontSize: "0.64rem", padding: "1px 6px", borderRadius: 4, background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontWeight: 600 }}>
                                💵 USD
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
                            {pocket && pocket.id !== principal.id
                              ? `➔ luego a: ${pocket.name} (${Number(pocket.interestRateEA || 0)}% E.A.)`
                              : isEquityItem ? "Fondeo directo a broker o cuenta en dólares" : "Cuenta de custodia"}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.76rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {principal.currency === "USD" || isDollar
                              ? `$${Number(principal.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                              : formatMoney(principal.balance, principal.currency || currency)}
                          </span>

                          {isEquityItem && !isDefaultFunding && setDefaultFundingAccount && (
                            <button
                              type="button"
                              title="Marcar como cuenta de fondeo predeterminada"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDefaultFundingAccount(principal.id);
                                setSelectedDestAccountId(principal.id);
                              }}
                              style={{
                                background: "rgba(245, 158, 11, 0.12)",
                                border: "1px solid rgba(245, 158, 11, 0.35)",
                                color: "#f59e0b",
                                borderRadius: 6,
                                padding: "3px 7px",
                                fontSize: "0.64rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              ⭐ Default
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Personal Debt Payment / Debt Collection */}
        {activeTab === "debt" && (
          <div>
            <div
              style={{
                background: isLight ? "#f0fdf4" : "rgba(16, 185, 129, 0.08)",
                border: isLight ? "1px solid #bbf7d0" : "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "12px",
                padding: "12px 16px",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: "1.1rem" }}>{isIncoming ? "📥" : "🤝"}</span>
                <strong style={{ fontSize: "0.86rem", color: isLight ? "#166534" : "#4ade80" }}>
                  {isIncoming ? "Cobro de Préstamo / Recuperación de Cartera" : "Abono a Deuda Personal"}
                </strong>
              </div>
              <p style={{ fontSize: "0.78rem", color: isLight ? "#1e3a2b" : "#cbd5e1", margin: 0, lineHeight: 1.4 }}>
                {isIncoming ? (
                  <>Este dinero entró a tu cuenta como <strong>pago de una deuda o préstamo</strong> que te debían. El saldo de la deuda se reducirá automáticamente y no consumirá tus rubros de gastos mensuales.</>
                ) : (
                  <>Asigna este movimiento como un <strong>abono a una deuda personal</strong> (ej. préstamo con un familiar o tercero). El saldo restante se reducirá automáticamente y si llega a $0 quedará saldada.</>
                )}
              </p>
            </div>

            {/* Mode Switcher: Deuda Existente vs Crear Nueva Deuda */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setDebtMode("existing")}
                style={{
                  padding: "9px 12px",
                  borderRadius: "10px",
                  border: debtMode === "existing" ? "2px solid #2563eb" : (isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--border)"),
                  background: debtMode === "existing"
                    ? (isLight ? "rgba(37, 99, 235, 0.1)" : "rgba(37, 99, 235, 0.25)")
                    : (isLight ? "#ffffff" : "var(--bg-surface)"),
                  color: debtMode === "existing" ? (isLight ? "#1d4ed8" : "#60a5fa") : "var(--text-muted)",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>📋</span> Deuda Existente ({activeDebts.length})
              </button>
              <button
                type="button"
                onClick={() => setDebtMode("new")}
                style={{
                  padding: "9px 12px",
                  borderRadius: "10px",
                  border: debtMode === "new" ? "2px solid #10b981" : (isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--border)"),
                  background: debtMode === "new"
                    ? (isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.25)")
                    : (isLight ? "#ffffff" : "var(--bg-surface)"),
                  color: debtMode === "new" ? (isLight ? "#047857" : "#34d399") : "var(--text-muted)",
                  fontWeight: 700,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>✨</span> Crear Nueva Deuda / Préstamo
              </button>
            </div>

            {/* Sub-view: Existing Debts */}
            {debtMode === "existing" && (
              <div>
                {/* Type Filter Pills */}
                {activeDebts.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                    {[
                      { id: "all", label: `Todas (${activeDebts.length})` },
                      { id: "receivable", label: `📥 Por Cobrar (${activeDebts.filter((d) => d.debtType === "receivable").length})` },
                      { id: "payable", label: `📤 Por Pagar (${activeDebts.filter((d) => d.debtType !== "receivable").length})` },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setDebtTypeFilter(f.id)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "20px",
                          fontSize: "0.72rem",
                          fontWeight: debtTypeFilter === f.id ? 700 : 500,
                          border: debtTypeFilter === f.id ? "1px solid #2563eb" : (isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid var(--border)"),
                          background: debtTypeFilter === f.id ? (isLight ? "#2563eb" : "#3b82f6") : "transparent",
                          color: debtTypeFilter === f.id ? "#ffffff" : "var(--text-muted)",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}

                {(() => {
                  const filteredDebts = activeDebts.filter((d) => {
                    if (debtTypeFilter === "receivable") return d.debtType === "receivable";
                    if (debtTypeFilter === "payable") return d.debtType !== "receivable";
                    return true;
                  });

                  if (filteredDebts.length === 0) {
                    return (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "24px 16px",
                          borderRadius: "12px",
                          background: isLight ? "#f8fafc" : "var(--bg-surface)",
                          color: "var(--text-muted)",
                          fontSize: "0.84rem",
                          marginBottom: 16,
                          border: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid var(--border)",
                        }}
                      >
                        <p style={{ margin: "0 0 10px 0" }}>
                          No hay deudas registradas en esta categoría.
                        </p>
                        <button
                          type="button"
                          onClick={() => setDebtMode("new")}
                          style={{
                            padding: "7px 14px",
                            borderRadius: "8px",
                            background: isLight ? "#10b981" : "#059669",
                            color: "#ffffff",
                            border: "none",
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            cursor: "pointer",
                          }}
                        >
                          ➕ Registrar Préstamo de {movement.description || "esta persona"}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                      {filteredDebts.map((debt) => {
                        const isSelected = selectedDebtId === debt.id;
                        const isRec = debt.debtType === "receivable";
                        const currentRemaining = Number(
                          debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0
                        );
                        const newRemaining = Math.max(0, currentRemaining - movementAmount);
                        const willSettle = newRemaining <= 0;

                        return (
                          <div
                            key={debt.id}
                            onClick={() => setSelectedDebtId(debt.id)}
                            style={{
                              padding: "12px 16px",
                              borderRadius: "12px",
                              border: isSelected ? "2px solid #2563eb" : (isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)"),
                              background: isSelected
                                ? (isLight ? "rgba(37, 99, 235, 0.07)" : "rgba(37, 99, 235, 0.16)")
                                : (isLight ? "#ffffff" : "var(--bg-surface)"),
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>
                                    {debt.concept}
                                  </strong>
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      fontWeight: 700,
                                      padding: "2px 6px",
                                      borderRadius: "6px",
                                      background: isRec ? (isLight ? "#dcfce7" : "rgba(16, 185, 129, 0.2)") : (isLight ? "#fef3c7" : "rgba(245, 158, 11, 0.2)"),
                                      color: isRec ? (isLight ? "#15803d" : "#4ade80") : (isLight ? "#b45309" : "#fbbf24"),
                                    }}
                                  >
                                    {isRec ? "📥 Te deben (Por Cobrar)" : "📤 Debes (Por Pagar)"}
                                  </span>
                                </div>
                                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                                  {isRec ? "Deudor:" : "Acreedor:"} <strong style={{ color: "var(--text-primary)" }}>{debt.debtor || debt.creditor || "Particular"}</strong>
                                </span>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>
                                  Saldo actual
                                </span>
                                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.92rem", fontWeight: 700, color: isRec ? "#10b981" : "#f43f5e" }}>
                                  {formatMoney(currentRemaining, currency)}
                                </span>
                              </div>
                            </div>

                            {/* Simulation of payment impact */}
                            <div
                              style={{
                                marginTop: 8,
                                paddingTop: 8,
                                borderTop: isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "0.76rem",
                              }}
                            >
                              <span style={{ color: "#10b981", fontWeight: 600 }}>
                                {isRec ? "Cobro a aplicar:" : "Abono a aplicar:"} {formatMoney(movementAmount, currency)}
                              </span>
                              <span style={{ color: willSettle && !alreadyRegisteredInDebt ? "#10b981" : "var(--text-primary)", fontWeight: 700 }}>
                                {alreadyRegisteredInDebt
                                  ? `Nuevo saldo: ${formatMoney(currentRemaining, currency)} (Sin doble descuento ✓)`
                                  : willSettle
                                  ? "¡Quedará 100% saldada! 🎊"
                                  : `Nuevo saldo: ${formatMoney(newRemaining, currency)}`}
                              </span>
                            </div>

                            {/* Participant Selector for Shared Expenses (Vaca) */}
                            {isSelected && Array.isArray(debt.participants) && debt.participants.length > 0 && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  marginTop: 10,
                                  padding: "10px 12px",
                                  borderRadius: "10px",
                                  background: isLight ? "#f8fafc" : "rgba(30, 41, 59, 0.6)",
                                  border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid var(--border)",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                  <label style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                                    <span>👥</span> ¿Quién te transfirió este dinero? (Participante)
                                  </label>
                                  {selectedParticipantId && (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedParticipantId("")}
                                      style={{ background: "transparent", border: "none", color: "#38bdf8", fontSize: "0.7rem", cursor: "pointer", textDecoration: "underline" }}
                                    >
                                      Limpiar selección
                                    </button>
                                  )}
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
                                  {debt.participants.map((p) => {
                                    const isPartSelected = selectedParticipantId === p.id;
                                    const partQuota = Number(p.customShare || p.share || 0);
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setSelectedParticipantId(isPartSelected ? "" : p.id)}
                                        style={{
                                          padding: "6px 8px",
                                          borderRadius: "8px",
                                          textAlign: "left",
                                          border: isPartSelected
                                            ? "2px solid #10b981"
                                            : p.paid
                                            ? (isLight ? "1px solid #bbf7d0" : "1px solid rgba(16, 185, 129, 0.25)")
                                            : (isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid var(--border)"),
                                          background: isPartSelected
                                            ? (isLight ? "#ecfdf5" : "rgba(16, 185, 129, 0.2)")
                                            : p.paid
                                            ? (isLight ? "rgba(16, 185, 129, 0.06)" : "rgba(16, 185, 129, 0.08)")
                                            : (isLight ? "#ffffff" : "var(--bg-surface)"),
                                          color: isPartSelected
                                            ? (isLight ? "#047857" : "#34d399")
                                            : "var(--text-primary)",
                                          cursor: "pointer",
                                          transition: "all 0.15s ease",
                                        }}
                                      >
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                          <strong style={{ fontSize: "0.76rem" }}>{p.name}</strong>
                                          <span style={{ fontSize: "0.68rem" }}>{p.paid ? "✅" : "⏳"}</span>
                                        </div>
                                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>
                                          {formatMoney(partQuota, currency)}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>

                                {selectedParticipantId && (() => {
                                  const pObj = debt.participants.find((p) => p.id === selectedParticipantId);
                                  return (
                                    <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: "6px", background: isLight ? "#f0fdf4" : "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", fontSize: "0.73rem", color: isLight ? "#166534" : "#4ade80", display: "flex", alignItems: "center", gap: 6 }}>
                                      <span>✓</span>
                                      <span>Este abono de <strong>{formatMoney(movementAmount, currency)}</strong> marcará la cuota de <strong>{pObj?.name}</strong> como pagada en la vaca.</span>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Checkbox para cobro ya registrado manualmente */}
                            {isSelected && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  marginTop: 10,
                                  padding: "9px 12px",
                                  borderRadius: "8px",
                                  background: alreadyRegisteredInDebt
                                    ? (isLight ? "#ecfdf5" : "rgba(16, 185, 129, 0.15)")
                                    : (isLight ? "#f1f5f9" : "rgba(15, 23, 42, 0.6)"),
                                  border: alreadyRegisteredInDebt
                                    ? (isLight ? "1px solid #a7f3d0" : "1px solid rgba(16, 185, 129, 0.3)")
                                    : (isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.08)"),
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <label
                                  style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 8,
                                    cursor: "pointer",
                                    fontSize: "0.76rem",
                                    userSelect: "none",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={alreadyRegisteredInDebt}
                                    onChange={(e) => setAlreadyRegisteredInDebt(e.target.checked)}
                                    style={{ marginTop: 2, cursor: "pointer", accentColor: "#10b981" }}
                                  />
                                  <div>
                                    <strong style={{ display: "block", color: alreadyRegisteredInDebt ? (isLight ? "#047857" : "#34d399") : "var(--text-primary)" }}>
                                      📌 Ya registré este cobro manualmente en la deuda
                                    </strong>
                                    <span style={{ fontSize: "0.71rem", color: "var(--text-muted)", display: "block", marginTop: 2 }}>
                                      {alreadyRegisteredInDebt
                                        ? `✓ Conciliar movimiento sin volver a restar del saldo ($${Math.round(currentRemaining).toLocaleString("es-CO")}) ni duplicar ingresos.`
                                        : "Marca esto si ya habías ingresado este abono manualmente y solo quieres vincular la transacción del banco sin descontar dos veces."}
                                    </span>
                                  </div>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Sub-view: Create New Debt / Loan */}
            {debtMode === "new" && (
              <div
                style={{
                  background: isLight ? "#f8fafc" : "var(--bg-surface)",
                  border: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)",
                  borderRadius: "14px",
                  padding: "16px 18px",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: "1.1rem" }}>✨</span>
                  <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>
                    Registrar Préstamo o Deuda para este Movimiento
                  </strong>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Tipo de Deuda: Por Cobrar vs Por Pagar */}
                  <div>
                    <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                      Tipo de Compromiso:
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setNewDebtData((prev) => ({ ...prev, debtType: "receivable" }))}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: newDebtData.debtType === "receivable" ? "2px solid #10b981" : (isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--border)"),
                          background: newDebtData.debtType === "receivable" ? (isLight ? "#ecfdf5" : "rgba(16, 185, 129, 0.2)") : "transparent",
                          color: newDebtData.debtType === "receivable" ? (isLight ? "#047857" : "#34d399") : "var(--text-muted)",
                          fontWeight: 700,
                          fontSize: "0.76rem",
                          cursor: "pointer",
                        }}
                      >
                        📥 Por Cobrar (Te debían)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewDebtData((prev) => ({ ...prev, debtType: "payable" }))}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: newDebtData.debtType === "payable" ? "2px solid #f43f5e" : (isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid var(--border)"),
                          background: newDebtData.debtType === "payable" ? (isLight ? "#fff1f2" : "rgba(244, 63, 94, 0.2)") : "transparent",
                          color: newDebtData.debtType === "payable" ? (isLight ? "#be123c" : "#fb7185") : "var(--text-muted)",
                          fontWeight: 700,
                          fontSize: "0.76rem",
                          cursor: "pointer",
                        }}
                      >
                        📤 Por Pagar (Tú debías)
                      </button>
                    </div>
                  </div>

                  {/* Persona Deudora / Acreedora */}
                  <div>
                    <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                      {newDebtData.debtType === "receivable" ? "Nombre de la Persona que te pagó (Deudor):" : "Nombre del Acreedor:"}
                    </label>
                    <input
                      type="text"
                      value={newDebtData.debtor}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewDebtData((prev) => ({
                          ...prev,
                          debtor: val,
                          concept: prev.concept.includes("Préstamo") || !prev.concept ? `Préstamo a ${val}` : prev.concept,
                        }));
                      }}
                      placeholder="Ej. Sindy Johanys Rojas"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontSize: "0.82rem",
                        background: isLight ? "#ffffff" : "var(--bg-primary)",
                        color: "var(--text-primary)",
                        border: isLight ? "1px solid rgba(0,0,0,0.15)" : "1px solid var(--border)",
                        outline: "none",
                      }}
                    />
                  </div>

                  {/* Concepto de la Deuda */}
                  <div>
                    <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                      Concepto o Motivo del Préstamo:
                    </label>
                    <input
                      type="text"
                      value={newDebtData.concept}
                      onChange={(e) => setNewDebtData((prev) => ({ ...prev, concept: e.target.value }))}
                      placeholder="Ej. Préstamo personal o cuota compartida"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontSize: "0.82rem",
                        background: isLight ? "#ffffff" : "var(--bg-primary)",
                        color: "var(--text-primary)",
                        border: isLight ? "1px solid rgba(0,0,0,0.15)" : "1px solid var(--border)",
                        outline: "none",
                      }}
                    />
                  </div>

                  {/* Monto Total Original del Préstamo */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                        Monto Total Original que se prestó:
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewDebtData((prev) => ({ ...prev, totalAmount: String(movementAmount) }))}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#2563eb",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        ⚡ Igual al movimiento ({formatMoney(movementAmount, currency)})
                      </button>
                    </div>
                    <input
                      type="number"
                      value={newDebtData.totalAmount}
                      onChange={(e) => setNewDebtData((prev) => ({ ...prev, totalAmount: e.target.value }))}
                      placeholder="Monto total prestado"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontSize: "0.82rem",
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 700,
                        background: isLight ? "#ffffff" : "var(--bg-primary)",
                        color: "var(--text-primary)",
                        border: isLight ? "1px solid rgba(0,0,0,0.15)" : "1px solid var(--border)",
                        outline: "none",
                      }}
                    />

                    {/* Impact preview */}
                    {Number(newDebtData.totalAmount) > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 12px",
                          borderRadius: "8px",
                          fontSize: "0.76rem",
                          background: Number(newDebtData.totalAmount) <= movementAmount
                            ? (isLight ? "#ecfdf5" : "rgba(16, 185, 129, 0.15)")
                            : (isLight ? "#eff6ff" : "rgba(37, 99, 235, 0.15)"),
                          color: Number(newDebtData.totalAmount) <= movementAmount
                            ? (isLight ? "#047857" : "#34d399")
                            : (isLight ? "#1d4ed8" : "#60a5fa"),
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span>{Number(newDebtData.totalAmount) <= movementAmount ? "🎊" : "ℹ️"}</span>
                        <span>
                          {Number(newDebtData.totalAmount) <= movementAmount
                            ? "¡Con este pago de " + formatMoney(movementAmount, currency) + " el préstamo quedará 100% SALDADO!"
                            : "Abono aplicado: " + formatMoney(movementAmount, currency) + " • Saldo que te seguirá debiendo: " + formatMoney(Math.max(0, Number(newDebtData.totalAmount) - movementAmount), currency)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Internal Transfer / Cash Withdrawal */}
        {activeTab === "internal_transfer" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 700 }}>
                🔄 Transferencia entre Cuentas Propias / Retiro a Efectivo
              </h4>
              <InfoTooltip
                customContent={{
                  title: "Transferencias Propias y Retiros a Efectivo",
                  tag: "Sin Consumo de Presupuesto",
                  tagColor: "#10b981",
                  explanation: "Cuando transfieres plata a tu Nequi, Daviplata o retiras efectivo de un cajero para tu bolsillo, el dinero no es un gasto; sigue siendo tuyo. Al marcarlo aquí, el valor se traslada a la cuenta o billetera destino sin descontar tus sobres mensuales de gastos.",
                  rule: "Luego, cuando compres algo en la calle, registra ese gasto específico seleccionando '💵 Efectivo (Billetera)' como cuenta de origen."
                }}
              />
            </div>
            <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: 0 }}>
              Selecciona la cuenta propia o billetera donde ingresó o tienes disponible este dinero:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 4 }}>
              {allTransferAccounts.map((acc) => {
                const isSelected = selectedTransferAccId === acc.id;
                const isCash = acc.accountCategory === "cash" || (acc.name || "").toLowerCase().includes("efectivo");
                return (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedTransferAccId(acc.id)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: isSelected
                        ? `2px solid ${isCash ? "#10b981" : "#0284c7"}`
                        : (isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)"),
                      background: isSelected
                        ? isCash
                          ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.15)")
                          : (isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(2, 132, 199, 0.15)")
                        : (isLight ? "#ffffff" : "var(--bg-surface)"),
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "1.4rem" }}>{isCash ? "💵" : acc.accountCategory === "digital_wallet" ? "📱" : "🏦"}</span>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "block" }}>
                          {acc.name}
                        </strong>
                        <span style={{ fontSize: "0.72rem", color: isCash ? "#10b981" : "var(--text-muted)" }}>
                          {isCash ? "Billetera Física (Efectivo disponible)" : `Saldo: ${formatMoney(acc.balance || 0, currency)}`}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <span style={{ color: isCash ? "#10b981" : "#0284c7", fontWeight: 800, fontSize: "1.1rem" }}>✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Credit Card Selection */}
        {activeTab === "credit_card" && (
          <div>
            {/* Mode Switcher: Compra vs Abono */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setCardActionMode("purchase")}
                style={{
                  padding: "9px 12px",
                  borderRadius: "10px",
                  border: cardActionMode === "purchase" ? "2px solid #0284c7" : (isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid var(--border)"),
                  background: cardActionMode === "purchase" ? (isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(2, 132, 199, 0.2)") : "transparent",
                  color: cardActionMode === "purchase" ? (isLight ? "#0284c7" : "#38bdf8") : "var(--text-muted)",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>🛍️</span> Compra con Tarjeta
              </button>
              <button
                type="button"
                onClick={() => setCardActionMode("payoff")}
                style={{
                  padding: "9px 12px",
                  borderRadius: "10px",
                  border: cardActionMode === "payoff" ? "2px solid #10b981" : (isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid var(--border)"),
                  background: cardActionMode === "payoff" ? (isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.2)") : "transparent",
                  color: cardActionMode === "payoff" ? "#10b981" : "var(--text-muted)",
                  fontWeight: 700,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>💵</span> Abono / Pago a Tarjeta
              </button>
            </div>

            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.4 }}>
              {cardActionMode === "purchase"
                ? "Este movimiento fue pagado con tu tarjeta de crédito. Sumará al cupo utilizado de la tarjeta y NO se descontará de tu nómina o cuentas bancarias."
                : "Convierte este movimiento en un Abono a Tarjeta de Crédito desde tu cuenta. Se restará de la deuda actual liberando cupo inmediatamente."}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {creditCards.map((card) => {
                const isSelected = selectedCardId === card.id;
                const currentUsed = Number(card.usedLimit) || 0;
                const newUsed = Math.max(0, currentUsed - movementAmount);
                const totalLimit = Number(card.totalLimit) || 0;

                return (
                  <div
                    key={card.id}
                    onClick={() => setSelectedCardId(card.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      border: isSelected ? "2px solid #10b981" : (isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)"),
                      background: isSelected
                        ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)")
                        : (isLight ? "#ffffff" : "var(--bg-surface)"),
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: "1.3rem" }}>{card.icon || "💳"}</span>
                      <div>
                        <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "block" }}>
                          {card.name}
                        </strong>
                        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                          Deuda actual: <span style={{ color: "#f43f5e", fontWeight: 600 }}>{formatMoney(currentUsed, currency)}</span> / {formatMoney(totalLimit, currency)}
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "0.7rem", color: "#10b981", display: "block", fontWeight: 600 }}>
                        Liberará cupo (+{formatMoney(Math.min(currentUsed, movementAmount), currency)})
                      </span>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-primary)", fontWeight: 700 }}>
                        Nueva deuda: {formatMoney(newUsed, currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>

        {/* Modal Actions - Fixed at Bottom */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            padding: "14px 24px",
            flexShrink: 0,
            borderTop: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)",
            background: isLight ? "rgba(248, 250, 252, 0.95)" : "rgba(15, 23, 42, 0.95)",
          }}
        >
          <button
            type="button"
            className="cashflow-btn secondary"
            onClick={onClose}
            style={{ padding: "9px 18px", fontSize: "0.84rem" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="cashflow-btn primary"
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
            style={{
              padding: "10px 22px",
              fontSize: "0.86rem",
              background: isConfirmDisabled
                ? (isLight ? "#e2e8f0" : "#1e293b")
                : (isLight ? "#2563eb" : "#3b82f6"),
              color: isConfirmDisabled
                ? (isLight ? "#94a3b8" : "#64748b")
                : "#ffffff",
              border: isConfirmDisabled
                ? (isLight ? "1px solid #cbd5e1" : "1px solid #334155")
                : (isLight ? "1px solid #1d4ed8" : "1px solid #2563eb"),
              boxShadow: isConfirmDisabled
                ? "none"
                : (isLight ? "0 4px 14px rgba(37, 99, 235, 0.3)" : "0 4px 14px rgba(59, 130, 246, 0.35)"),
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: 1,
              cursor: isConfirmDisabled ? "not-allowed" : "pointer",
              borderRadius: "10px",
              transition: "all 0.15s ease",
            }}
          >
            <span>⚡</span> Confirmar Asignación
          </button>
        </div>
      </div>
    </GlassModalWrapper>
  );
}
