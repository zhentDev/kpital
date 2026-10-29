import { useTheme } from "../../context/ThemeContext";
import React, { useState, useEffect, useMemo } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import CustomSelectDropdown from "../Common/CustomSelectDropdown";
import DynamicDatePicker from "../Common/DynamicDatePicker";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { generateRollingMonthOptions, getCurrentPeriod } from "../../utils/periodUtils";
import { useCashFlowStore } from "../../store/cashFlowStore";
import "./CashFlow.css";

const CATEGORY_OPTIONS = {
  inflow: [
    { value: "salary", label: "💼 Salario Principal / Nómina", badge: "Activo" },
    { value: "freelance", label: "💻 Freelance / Consultoría Tech", badge: "Variable" },
    { value: "overtime", label: "⏰ Horas Extras / Recargos", badge: "Extra" },
    { value: "business", label: "🏢 Negocio Propio / Ventas", badge: "Variable" },
    { value: "passive_fixed", label: "⚡ Rendimientos Renta Fija (Cuentas/CDT)", badge: "Pasivo" },
    { value: "passive_equity", label: "📈 Dividendos Acciones / ETFs", badge: "Pasivo" },
    { value: "bonus", label: "🎁 Bonificaciones / Prima", badge: "Extra" },
    { value: "other", label: "💵 Otros Ingresos", badge: "General" },
  ],
  needs: [
    { value: "housing", label: "🏠 Arriendo / Vivienda & Admin", badge: "Fijo" },
    { value: "utilities", label: "💡 Servicios Públicos, Luz, Agua & Gas", badge: "Fijo" },
    { value: "internet", label: "🌐 Fibra Óptica & Telefonía", badge: "Fijo" },
    { value: "groceries", label: "🛒 Alimentación & Supermercado", badge: "Esencial" },
    { value: "health", label: "🏥 Salud, EPS & Póliza de Salud", badge: "Esencial" },
    { value: "transport", label: "🚗 Transporte, Gasolina & Pasajes", badge: "Esencial" },
    { value: "debt", label: "💳 Servicio de Deuda / Tarjeta de Crédito", badge: "Deuda" },
    { value: "education", label: "📚 Educación & Colegiatura", badge: "Fijo" },
    { value: "other", label: "🔴 Otros Gastos Esenciales", badge: "General" },
  ],
  wants: [
    { value: "dining", label: "🍷 Restaurantes, Bares & Cafés", badge: "Salidas" },
    { value: "subscriptions", label: "🍿 Suscripciones (Netflix, Spotify, Gym)", badge: "Digital" },
    { value: "leisure", label: "🎮 Hobbies, Ocio & Videojuegos", badge: "Ocio" },
    { value: "shopping", label: "🛍️ Ropa, Tecnología & Compras", badge: "Deseos" },
    { value: "travel", label: "🏖️ Escapadas de Fin de Semana", badge: "Viajes" },
    { value: "other", label: "🟣 Otros Gastos Variables", badge: "General" },
  ],
  wealth: [
    { value: "emergency_fund", label: "🛡️ Fondo de Emergencia (3-6 Meses)", badge: "Seguridad" },
    { value: "equity_investment", label: "🚀 Kpital Tech ETF / Acciones", badge: "Crecimiento" },
    { value: "fixed_savings", label: "🏦 Cuentas Alto Rendimiento / CDTs", badge: "Rendimiento" },
    { value: "crypto_gold", label: "🪙 Oro Tokenizado / Cripto Staking", badge: "Reserva" },
    { value: "medium_term_goal", label: "✈️ Meta Viaje / Vehículo / Estudio", badge: "Metas" },
    { value: "other", label: "🔵 Otra Asignación Patrimonial", badge: "General" },
  ],
};

const ICONS_BY_CATEGORY = {
  salary: "💼",
  freelance: "💻",
  overtime: "⏰",
  business: "🏢",
  passive_fixed: "⚡",
  passive_equity: "📈",
  bonus: "🎁",
  housing: "🏠",
  utilities: "💡",
  internet: "🌐",
  groceries: "🛒",
  health: "🏥",
  transport: "🚗",
  debt: "💳",
  education: "📚",
  dining: "🍷",
  subscriptions: "🍿",
  leisure: "🎮",
  shopping: "🛍️",
  travel: "🏖️",
  emergency_fund: "🛡️",
  equity_investment: "🚀",
  fixed_savings: "🏦",
  crypto_gold: "🪙",
  medium_term_goal: "✈️",
  other: "🎯",
};

export default function CashFlowAllocationModal({
  isOpen,
  onClose,
  initialType = "inflow",
  editItem = null,
  activePeriod,
  currency = "COP",
  payrollAccount = { name: "Nu Colombia (Cuenta Nu Débito)", icon: "💜" },
  creditCards = [],
  fixedIncomeAccounts = [],
  onOpenPayrollModal,
  onSaveInflow,
  onUpdateInflow,
  onSaveNeed,
  onUpdateNeed,
  onSaveWant,
  onUpdateWant,
  onSaveWealth,
  onUpdateWealth,
  totalInflowCurrent = 0,
  totalNeedsCurrent = 0,
  totalWantsCurrent = 0,
  totalWealthCurrent = 0,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const currentPeriod = activePeriod || getCurrentPeriod();
  const [activeTab, setActiveTab] = useState(initialType);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("salary");
  const [amount, setAmount] = useState(0);
  const [targetAmount, setTargetAmount] = useState(0);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [targetPeriod, setTargetPeriod] = useState(currentPeriod);
  const [paymentStatus, setPaymentStatus] = useState("received"); // 'received' | 'pending'
  const [isPassive, setIsPassive] = useState(false);
  const [subItems, setSubItems] = useState([]);

  const handleAddSubItem = () => {
    setSubItems((prev) => [
      ...prev,
      { id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, name: "", amount: 0 },
    ]);
  };

  const handleUpdateSubItem = (index, field, value) => {
    setSubItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleDeleteSubItem = (index) => {
    setSubItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const { needs, wants, wealth, moveSubItemBetweenEnvelopes } = useCashFlowStore();
  const [movingSubIndex, setMovingSubIndex] = useState(null);
  const [targetMoveEnvelopeId, setTargetMoveEnvelopeId] = useState("");

  const allAvailableEnvelopes = useMemo(() => {
    return [
      ...(needs || []).map((e) => ({ ...e, pillarLabel: "Necesidades" })),
      ...(wants || []).map((e) => ({ ...e, pillarLabel: "Deseos/Gustos" })),
      ...(wealth || []).map((e) => ({ ...e, pillarLabel: "Ahorro/Patrimonio" })),
    ].filter((e) => e.id !== editItem?.id);
  }, [needs, wants, wealth, editItem]);

  const handleExecuteMoveSubItem = (sub, idx) => {
    if (!targetMoveEnvelopeId || !editItem?.id) return;
    if (typeof moveSubItemBetweenEnvelopes === "function") {
      moveSubItemBetweenEnvelopes({
        fromEnvelopeId: editItem.id,
        toEnvelopeId: targetMoveEnvelopeId,
        subItemId: sub.id,
      });
      setSubItems((prev) => prev.filter((_, i) => i !== idx));
      setMovingSubIndex(null);
      setTargetMoveEnvelopeId("");
    }
  };

  const handleAutoParseNameConcepts = () => {
    const match = name.match(/\((.*?)\)/);
    if (!match || !match[1]) return;
    const parts = match[1].split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const approx = parts.length > 0 && Number(amount) > 0 ? Math.round(Number(amount) / parts.length) : 0;
    setSubItems(
      parts.map((p) => ({
        id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: p,
        amount: approx,
      }))
    );
  };

  const subItemsTotal = useMemo(() => {
    return subItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [subItems]);

  // Payment Source State
  const [sourceType, setSourceType] = useState("payroll"); // 'payroll' | 'credit_card' | 'fixed_pocket' | 'investment_cash' | 'cash'
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || "");
  const [cardInstallments, setCardInstallments] = useState(1);
  const [selectedPocketId, setSelectedPocketId] = useState(fixedIncomeAccounts[0]?.id || "");

  const isEditing = Boolean(editItem && editItem.id);
  const isAutoSynced = Boolean(
    editItem &&
    (editItem.isAutoSynced ||
      editItem.category === "passive_fixed" ||
      editItem.category === "passive_equity" ||
      editItem.id === "in_fixed_yield" ||
      editItem.id === "in_stock_div")
  );

  // Dynamic Rolling Month Options
  const monthPeriodOptions = useMemo(() => {
    return generateRollingMonthOptions(currentPeriod, 0, 36);
  }, [currentPeriod]);

  // Sync state when modal opens or editItem changes
  useEffect(() => {
    if (isOpen) {
      if (editItem) {
        setActiveTab(editItem.pillarType || initialType);
        setName(editItem.name || "");
        setCategory(editItem.category || "salary");
        setAmount(Number(editItem.monthlyContribution || editItem.amount) || 0);
        setTargetAmount(Number(editItem.targetAmount) || 0);
        setCurrentBalance(Number(editItem.currentBalance) || 0);
        setDueDate(editItem.dueDate || "");
        setFrequency(editItem.frequency || (editItem.isOneTime ? "one_time" : "monthly"));
        setTargetPeriod(editItem.targetPeriod || currentPeriod);
        setPaymentStatus(editItem.paymentStatus || "received");
        setIsPassive(Boolean(editItem.isPassive));

        // Payment Source sync
        const src = editItem.paymentSource || {};
        setSourceType(src.type || "payroll");
        setSelectedCardId(src.targetId || creditCards[0]?.id || "");
        setCardInstallments(src.installments || 1);
        setSelectedPocketId(src.targetId || fixedIncomeAccounts[0]?.id || "");
        setSubItems(Array.isArray(editItem.subItems) ? editItem.subItems.map((s) => ({ ...s })) : []);
      } else {
        setActiveTab(initialType);
        setName("");
        setAmount(0);
        setTargetAmount(0);
        setCurrentBalance(0);
        setDueDate("");
        setFrequency("monthly");
        setTargetPeriod(currentPeriod);
        setPaymentStatus("received");
        setSubItems([]);
        const defaultCat = CATEGORY_OPTIONS[initialType]?.[0]?.value || "other";
        setCategory(defaultCat);
        setIsPassive(defaultCat.startsWith("passive_"));
        setSourceType(initialType === "inflow" ? "payroll" : "payroll");
        setSelectedCardId(creditCards[0]?.id || "");
        setCardInstallments(1);
        setSelectedPocketId(fixedIncomeAccounts[0]?.id || "");
      }
    }
  }, [isOpen, initialType, editItem, currentPeriod, creditCards, fixedIncomeAccounts]);

  const handleTabChange = (tab) => {
    if (isEditing) return;
    setActiveTab(tab);
    setName("");
    setAmount(0);
    const defaultCat = CATEGORY_OPTIONS[tab]?.[0]?.value || "other";
    setCategory(defaultCat);
    setIsPassive(defaultCat.startsWith("passive_"));
  };

  const handleCategoryChange = (val) => {
    if (isAutoSynced) return;
    setCategory(val);
    setIsPassive(String(val).startsWith("passive_"));
  };

  // Instant Live Calculations
  const liveMetrics = useMemo(() => {
    const numAmt = Number(amount) || 0;
    const oldAmt = isEditing ? Number(editItem.monthlyContribution || editItem.amount) || 0 : 0;
    const diff = numAmt - oldAmt;

    let nextInflow = totalInflowCurrent;
    let nextNeeds = totalNeedsCurrent;
    let nextWants = totalWantsCurrent;
    let nextWealth = totalWealthCurrent;

    if (activeTab === "inflow") nextInflow += diff;
    if (activeTab === "needs") nextNeeds += diff;
    if (activeTab === "wants") nextWants += diff;
    if (activeTab === "wealth") nextWealth += diff;

    const effectiveSavingsRate = nextInflow > 0 ? ((nextWealth / nextInflow) * 100).toFixed(1) : 0;
    const freeCashFlow = Math.max(0, nextInflow - (nextNeeds + nextWants + nextWealth));
    const dailyExpenses = (nextNeeds + nextWants) / 30;
    const daysOfFreedom = dailyExpenses > 0 ? (nextWealth / dailyExpenses).toFixed(1) : "0.0";

    return {
      savingsRate: effectiveSavingsRate,
      freeCashFlow,
      daysOfFreedom,
    };
  }, [activeTab, amount, editItem, isEditing, totalInflowCurrent, totalNeedsCurrent, totalWantsCurrent, totalWealthCurrent]);

  const isOneTime = frequency === "one_time";

  // Build resolved paymentSource payload
  const buildPaymentSource = () => {
    if (sourceType === "credit_card") {
      const card = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
      return {
        type: "credit_card",
        targetId: card?.id,
        targetName: card ? `${card.name} (${cardInstallments} ${cardInstallments === 1 ? "cuota 0%" : "cuotas"})` : "Tarjeta de Crédito",
        installments: cardInstallments,
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || Number(amount) < 0) return;

    const icon = ICONS_BY_CATEGORY[category] || "🎯";
    const paymentSource = buildPaymentSource();
    const cleanSubItems = subItems
      .filter((s) => s.name?.trim() || Number(s.amount) > 0)
      .map((s) => ({
        id: s.id || `sub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: s.name.trim(),
        amount: Number(s.amount) || 0,
      }));

    if (activeTab === "inflow") {
      const payload = {
        name: name.trim(),
        category,
        amount: Number(amount),
        currency,
        isPassive,
        isAutoSynced,
        isOneTime: isAutoSynced ? false : isOneTime,
        targetPeriod: isOneTime ? targetPeriod : null,
        paymentStatus,
        frequency: isAutoSynced ? "monthly" : frequency,
        paymentSource,
        icon,
        subItems: cleanSubItems,
      };
      if (isEditing && onUpdateInflow) {
        onUpdateInflow(editItem.id, payload);
      } else {
        onSaveInflow(payload);
      }
    } else if (activeTab === "needs") {
      const payload = {
        name: name.trim(),
        category,
        amount: Number(amount),
        currency,
        dueDate: dueDate || null,
        isOneTime,
        targetPeriod: isOneTime ? targetPeriod : null,
        paymentSource,
        icon,
        subItems: cleanSubItems,
      };
      if (isEditing && onUpdateNeed) {
        onUpdateNeed(editItem.id, payload);
      } else {
        onSaveNeed(payload);
      }
    } else if (activeTab === "wants") {
      const payload = {
        name: name.trim(),
        category,
        amount: Number(amount),
        currency,
        isOneTime,
        targetPeriod: isOneTime ? targetPeriod : null,
        paymentSource,
        icon,
        subItems: cleanSubItems,
      };
      if (isEditing && onUpdateWant) {
        onUpdateWant(editItem.id, payload);
      } else {
        onSaveWant(payload);
      }
    } else if (activeTab === "wealth") {
      const payload = {
        name: name.trim(),
        category,
        monthlyContribution: Number(amount),
        targetAmount: Number(targetAmount),
        currentBalance: Number(currentBalance),
        currency,
        linkedModule: category === "equity_investment" ? "variable_income" : category === "fixed_savings" ? "fixed_income" : "custom",
        paymentSource,
        icon,
        subItems: cleanSubItems,
      };
      if (isEditing && onUpdateWealth) {
        onUpdateWealth(editItem.id, payload);
      } else {
        onSaveWealth(payload);
      }
    }

    onClose();
  };

  const getPillarColor = () => {
    switch (activeTab) {
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

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={640}>
      <div
        style={{
          minHeight: "530px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "20px 24px",
          boxSizing: "border-box",
        }}
      >
        <div>
          {/* Modal Header */}
          <div className="cashflow-modal-header" style={{ paddingBottom: 12 }}>
            <h3 className="cashflow-modal-title">
              <span>{isEditing ? "✏️" : "✨"}</span>{" "}
              {isEditing ? "Editar Asignación Financiera" : "Registrar Asignación Financiera"}
            </h3>
            <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>

          {/* Auto-Sync Alert Information Banner */}
          {isAutoSynced && (
            <div
              style={{
                marginTop: 8,
                background: "rgba(56, 189, 248, 0.1)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                borderRadius: "12px",
                padding: "10px 14px",
                fontSize: "0.8rem",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: "1.2rem" }}>🔗</span>
              <div>
                <div style={{ fontWeight: 700, color: "#f1f5f9" }}>Rendimiento Pasivo Auto-Calculado</div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 2 }}>
                  Este monto se calcula automáticamente a partir de tus saldos y tasas activas en{" "}
                  <strong style={{ color: "#38bdf8" }}>
                    {category === "passive_fixed" ? "Renta Fija (Cuentas de Ahorro & CDTs)" : "Portafolio Kpital Tech ETF"}
                  </strong>
                  .
                </div>
              </div>
            </div>
          )}

          {/* Pillar Selector Tabs */}
          {!isEditing && (
            <div style={{ display: "flex", gap: 6, marginTop: 12, background: isLight ? "#f1f5f9" : "rgba(13, 18, 38, 0.7)", padding: 4, borderRadius: 12, border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)" }}>
              <button
                type="button"
                className={`cashflow-rule-tab-btn ${activeTab === "inflow" ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", fontSize: "0.78rem" }}
                onClick={() => handleTabChange("inflow")}
              >
                🟢 Ingreso
              </button>
              <button
                type="button"
                className={`cashflow-rule-tab-btn ${activeTab === "needs" ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", fontSize: "0.78rem" }}
                onClick={() => handleTabChange("needs")}
              >
                🔴 Fijo (Need)
              </button>
              <button
                type="button"
                className={`cashflow-rule-tab-btn ${activeTab === "wants" ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", fontSize: "0.78rem" }}
                onClick={() => handleTabChange("wants")}
              >
                🟣 Deseo (Want)
              </button>
              <button
                type="button"
                className={`cashflow-rule-tab-btn ${activeTab === "wealth" ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", fontSize: "0.78rem" }}
                onClick={() => handleTabChange("wealth")}
              >
                🔵 Ahorro / Inv.
              </button>
            </div>
          )}

          {/* Live Calculation Strip */}
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 12,
              background: isLight ? "rgba(240, 249, 255, 0.85)" : "rgba(15, 23, 42, 0.8)",
              border: isLight ? "1px solid rgba(2, 132, 199, 0.2)" : `1px solid ${getPillarColor()}44`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.78rem",
            }}
          >
            <div>
              <span style={{ color: isLight ? "#475569" : "#94a3b8" }}>% Ahorro Efectivo: </span>
              <strong style={{ color: isLight ? "#0284c7" : "#38bdf8", fontFamily: "JetBrains Mono, monospace" }}>
                {liveMetrics.savingsRate}%
              </strong>
            </div>
            <div>
              <span style={{ color: isLight ? "#475569" : "#94a3b8" }}>Libertad Financiada: </span>
              <strong style={{ color: isLight ? "#059669" : "#10b981", fontFamily: "JetBrains Mono, monospace" }}>
                +{liveMetrics.daysOfFreedom} días/mes
              </strong>
            </div>
          </div>
        </div>

        {/* Form Fields Container */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between", marginTop: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Row 1: Name + Quick Chips */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <label style={{ fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", fontWeight: 700 }}>
                  Concepto / Nombre del Ítem
                </label>
                {activeTab === "inflow" && !isAutoSynced && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setName("Horas Extras");
                        setCategory("overtime");
                        setFrequency("one_time");
                      }}
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        color: "#38bdf8",
                        fontSize: "0.68rem",
                        padding: "1px 6px",
                        cursor: "pointer",
                      }}
                    >
                      + Horas Extras
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setName("Consultoría Tech");
                        setCategory("freelance");
                        setFrequency("one_time");
                      }}
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        color: "#38bdf8",
                        fontSize: "0.68rem",
                        padding: "1px 6px",
                        cursor: "pointer",
                      }}
                    >
                      + Consultoría Única
                    </button>
                  </div>
                )}
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Meta Impresora 3D, Salario Empresa, Arriendo Apto..."
                required
                autoFocus
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "9px 12px",
                  borderRadius: "10px",
                  background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.85)",
                  border: isLight ? "1px solid rgba(0, 0, 0, 0.16)" : "1px solid rgba(255, 255, 255, 0.1)",
                  color: isLight ? "#0f172a" : "#f8fafc",
                  fontSize: "0.92rem",
                  fontWeight: 600,
                  outline: "none",
                  boxShadow: isLight ? "inset 0 1px 2px rgba(0,0,0,0.03)" : "inset 0 2px 4px rgba(0,0,0,0.3)",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                }}
              />
            </div>

            {/* Row 2: Category + Amount */}
            <div className="cashflow-form-row" style={{ position: "relative", zIndex: 30 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                  Categoría {isAutoSynced && "(Bloqueada)"}
                </label>
                <CustomSelectDropdown
                  options={CATEGORY_OPTIONS[activeTab] || []}
                  value={category}
                  onChange={(val) => handleCategoryChange(val)}
                  disabled={isAutoSynced}
                  placeholder="Seleccionar categoría..."
                  searchPlaceholder="Buscar categoría..."
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <label style={{ fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", fontWeight: 600 }}>
                    {activeTab === "wealth" ? "Aporte Mensual" : "Monto"} ({currency})
                  </label>
                  {activeTab === "inflow" && (category === "salary" || category === "freelance") && currency === "COP" && onOpenPayrollModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenPayrollModal();
                      }}
                      style={{
                        background: "rgba(0, 229, 255, 0.12)",
                        border: "1px solid rgba(0, 229, 255, 0.3)",
                        borderRadius: "6px",
                        color: "#00e5ff",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                        padding: "2px 8px",
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span role="img" aria-label="Colombia">🇨🇴</span>
                      <span>Liquidar Neto</span>
                    </button>
                  )}
                </div>
                <CurrencyInput
                  value={amount}
                  onChange={(val) => !isAutoSynced && setAmount(val)}
                  currency={currency}
                  disabled={isAutoSynced}
                  placeholder="0"
                />
                {isAutoSynced && (
                  <span style={{ fontSize: "0.7rem", color: "#38bdf8", marginTop: 3, display: "block" }}>
                    🔒 Monto bloqueado (Calculado automáticamente)
                  </span>
                )}
              </div>
            </div>

            {/* Row 3: Payment Source / Origen de Fondos (Where does the money come from / go to) */}
            <div style={{ background: isLight ? "rgba(241, 245, 249, 0.75)" : "rgba(13, 18, 38, 0.6)", padding: "12px 14px", borderRadius: "12px", border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.06)", boxShadow: isLight ? "0 1px 3px rgba(0,0,0,0.03)" : "none" }}>
              <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
                🏦 Fuente de Fondos / Método de Pago
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 6, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setSourceType("payroll")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background: sourceType === "payroll"
                      ? (isLight ? "rgba(130, 10, 209, 0.12)" : "rgba(130, 10, 209, 0.2)")
                      : (isLight ? "#ffffff" : "rgba(255,255,255,0.04)"),
                    border: sourceType === "payroll"
                      ? "1.5px solid #820ad1"
                      : (isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.06)"),
                    color: sourceType === "payroll" ? (isLight ? "#7007b3" : "#c084fc") : (isLight ? "#475569" : "#94a3b8"),
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
                    background: sourceType === "credit_card"
                      ? (isLight ? "rgba(244, 63, 94, 0.12)" : "rgba(244, 63, 94, 0.2)")
                      : (isLight ? "#ffffff" : "rgba(255,255,255,0.04)"),
                    border: sourceType === "credit_card"
                      ? "1.5px solid #f43f5e"
                      : (isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.06)"),
                    color: sourceType === "credit_card" ? (isLight ? "#e11d48" : "#f43f5e") : (isLight ? "#475569" : "#94a3b8"),
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
                    background: sourceType === "fixed_pocket"
                      ? (isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(56, 189, 248, 0.2)")
                      : (isLight ? "#ffffff" : "rgba(255,255,255,0.04)"),
                    border: sourceType === "fixed_pocket"
                      ? (isLight ? "1.5px solid #0284c7" : "1.5px solid #38bdf8")
                      : (isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.06)"),
                    color: sourceType === "fixed_pocket" ? (isLight ? "#0284c7" : "#38bdf8") : (isLight ? "#475569" : "#94a3b8"),
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
                    background: sourceType === "investment_cash"
                      ? (isLight ? "rgba(168, 85, 247, 0.12)" : "rgba(168, 85, 247, 0.2)")
                      : (isLight ? "#ffffff" : "rgba(255,255,255,0.04)"),
                    border: sourceType === "investment_cash"
                      ? "1.5px solid #a855f7"
                      : (isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.06)"),
                    color: sourceType === "investment_cash" ? (isLight ? "#9333ea" : "#a855f7") : (isLight ? "#475569" : "#94a3b8"),
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  🚀 Inversión / Broker
                </button>
              </div>

              {/* Sub-selector for Credit Card */}
              {sourceType === "credit_card" && (
                <div className="cashflow-form-row" style={{ marginTop: 8 }}>
                  <div>
                    <label style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Seleccionar Tarjeta:</label>
                    <select
                      value={selectedCardId}
                      onChange={(e) => setSelectedCardId(e.target.value)}
                      style={{ width: "100%", background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.9)", border: isLight ? "1px solid rgba(0,0,0,0.16)" : "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "7px 10px", color: isLight ? "#0f172a" : "#f8fafc", fontSize: "0.82rem", fontWeight: 600, outline: "none" }}
                    >
                      {creditCards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Día {c.paymentDay})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Cuotas (Sin Interés / MSI):</label>
                    <select
                      value={cardInstallments}
                      onChange={(e) => setCardInstallments(Number(e.target.value))}
                      style={{ width: "100%", background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.9)", border: isLight ? "1px solid rgba(0,0,0,0.16)" : "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "7px 10px", color: isLight ? "#0f172a" : "#f8fafc", fontSize: "0.82rem", fontWeight: 600, outline: "none" }}
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

              {sourceType === "credit_card" && cardInstallments > 1 && Number(amount) > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    background: "rgba(0, 229, 255, 0.08)",
                    border: "1px solid rgba(0, 229, 255, 0.25)",
                    borderRadius: "8px",
                    padding: "6px 10px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 6,
                    fontSize: "0.74rem",
                  }}
                >
                  <span style={{ color: "#cbd5e1" }}>
                    ⚡ <strong>{cardInstallments} cuotas sin interés (0% MSI)</strong> • Valor por cuota:{" "}
                    <strong style={{ color: "#00e5ff", fontFamily: "JetBrains Mono, monospace" }}>
                      {formatMoney(Math.round(Number(amount) / cardInstallments), currency)}/mes
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAmount(Math.round(Number(amount) / cardInstallments))}
                    style={{
                      background: "rgba(0, 229, 255, 0.16)",
                      border: "1px solid rgba(0, 229, 255, 0.4)",
                      color: "#00e5ff",
                      borderRadius: "5px",
                      padding: "2px 7px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    title="Si ingresaste el valor total de la compra, haz clic para dejar como tope mensual únicamente el valor de 1 cuota"
                  >
                    Usar valor de 1 cuota
                  </button>
                </div>
              )}

              {/* Sub-selector for Pockets */}
              {sourceType === "fixed_pocket" && fixedIncomeAccounts.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Cuenta de Ahorro / Bolsillo:</label>
                  <select
                    value={selectedPocketId}
                    onChange={(e) => setSelectedPocketId(e.target.value)}
                    style={{ width: "100%", background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.9)", border: isLight ? "1px solid rgba(0,0,0,0.16)" : "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "7px 10px", color: isLight ? "#0f172a" : "#f8fafc", fontSize: "0.82rem", fontWeight: 600, outline: "none" }}
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

            {/* Row 4: Frequency / One-Time Controls (for Inflows) */}
            {activeTab === "inflow" && (
              <div className="cashflow-form-row" style={{ position: "relative", zIndex: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                    Tipo de Frecuencia
                  </label>
                  <CustomSelectDropdown
                    options={[
                      { value: "monthly", label: "🔁 Mensual Recurrente" },
                      { value: "one_time", label: "⚡ Pago Único (Solo 1 mes / Extra)" },
                      { value: "biweekly", label: "🗓️ Quincenal (2 pagos)" },
                    ]}
                    value={frequency}
                    onChange={(val) => !isAutoSynced && setFrequency(val)}
                    disabled={isAutoSynced}
                    searchPlaceholder="Buscar frecuencia..."
                  />
                </div>

                {isOneTime && !isAutoSynced ? (
                  <div>
                    <label style={{ display: "block", fontSize: "0.76rem", color: "#00e5ff", marginBottom: 5, fontWeight: 700 }}>
                      Mes de Abono / Pago
                    </label>
                    <CustomSelectDropdown
                      options={monthPeriodOptions}
                      value={targetPeriod}
                      onChange={(val) => setTargetPeriod(val)}
                      searchPlaceholder="Buscar mes o año..."
                    />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: isAutoSynced ? "not-allowed" : "pointer", fontSize: "0.78rem", color: "#cbd5e1", padding: "10px 0" }}>
                      <input
                        type="checkbox"
                        checked={isPassive}
                        disabled={isAutoSynced}
                        onChange={(e) => setIsPassive(e.target.checked)}
                        style={{ accentColor: "#00e5ff", width: 16, height: 16 }}
                      />
                      <span>⚡ Es Rendimiento Pasivo</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* One-Time Payment Status (When frequency === 'one_time') */}
            {activeTab === "inflow" && isOneTime && !isAutoSynced && (
              <div style={{ position: "relative", zIndex: 10, display: "flex", gap: 12, alignItems: "center", background: "rgba(0, 229, 255, 0.06)", border: "1px solid rgba(0, 229, 255, 0.2)", borderRadius: "10px", padding: "8px 12px" }}>
                <span style={{ fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", fontWeight: 600 }}>
                  Estado del Pago:
                </span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.78rem", color: paymentStatus === "pending" ? "#fbbf24" : "#94a3b8" }}>
                  <input
                    type="radio"
                    name="paymentStatus"
                    value="pending"
                    checked={paymentStatus === "pending"}
                    onChange={() => setPaymentStatus("pending")}
                    style={{ accentColor: "#fbbf24" }}
                  />
                  <span>⏳ Pendiente por Cobrar</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.78rem", color: paymentStatus === "received" ? "#10b981" : "#94a3b8" }}>
                  <input
                    type="radio"
                    name="paymentStatus"
                    value="received"
                    checked={paymentStatus === "received"}
                    onChange={() => setPaymentStatus("received")}
                    style={{ accentColor: "#10b981" }}
                  />
                  <span>✅ Ya Cobrado / Recibido</span>
                </label>
              </div>
            )}

            {/* Conditional Fields for Needs */}
            {activeTab === "needs" && (
              <div style={{ position: "relative", zIndex: 20 }}>
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                  Día de Vencimiento en el Mes (Opcional)
                </label>
                <DynamicDatePicker
                  value={dueDate}
                  onChange={(d) => setDueDate(d)}
                  placeholder="Seleccionar fecha de corte o pago..."
                />
              </div>
            )}

            {/* Conditional Fields for Wealth */}
            {activeTab === "wealth" && (
              <div className="cashflow-form-row" style={{ position: "relative", zIndex: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                    Saldo Actual Acumulado ({currency})
                  </label>
                  <CurrencyInput
                    value={currentBalance}
                    onChange={(val) => setCurrentBalance(val)}
                    currency={currency}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                    Meta Total Objetivo ({currency})
                  </label>
                  <CurrencyInput
                    value={targetAmount}
                    onChange={(val) => setTargetAmount(val)}
                    currency={currency}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* Conditional Fields for Wants */}
            {activeTab === "wants" && (
              <div style={{ position: "relative", zIndex: 20 }}>
                <label style={{ display: "block", fontSize: "0.76rem", color: isLight ? "#334155" : "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                  Prioridad de Presupuesto
                </label>
                <CustomSelectDropdown
                  options={[
                    { value: "flexible", label: "✨ Flexible (Reducible si el mes es ajustado)" },
                    { value: "fixed_lifestyle", label: "🔒 Estilo de Vida Fijo (Prioritario)" },
                    { value: "occasional", label: "🎉 Ocasional / Gusto Único" },
                  ]}
                  value="flexible"
                  onChange={() => {}}
                  searchPlaceholder="Buscar prioridad..."
                />
              </div>
            )}
            {/* Desglose Detallado de Conceptos / Sub-ítems */}
            <div
              style={{
                background: isLight ? "rgba(248, 250, 252, 0.9)" : "rgba(255, 255, 255, 0.03)",
                border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid var(--border)",
                borderRadius: "12px",
                padding: "14px 16px",
                marginTop: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>📋</span>
                    <span>Desglose Específico de Conceptos ({subItems.length})</span>
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginTop: 2 }}>
                    Especifica qué incluye este ítem y cuánto vale cada uno (ej. Netflix, Spotify, Gym o CDT Nu, Plenti).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddSubItem}
                  style={{
                    background: "rgba(56, 189, 248, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.35)",
                    color: "#38bdf8",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.74rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  + Agregar concepto
                </button>
              </div>

              {/* Botón inteligente para autocompletar si el nombre tiene paréntesis con conceptos */}
              {subItems.length === 0 && name.includes("(") && name.includes(")") && (
                <button
                  type="button"
                  onClick={handleAutoParseNameConcepts}
                  style={{
                    background: "rgba(168, 85, 247, 0.12)",
                    border: "1px solid rgba(168, 85, 247, 0.3)",
                    color: "#c084fc",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    marginBottom: 10,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>✨</span>
                  <span>Autocompletar conceptos desde el nombre "{name.match(/\((.*?)\)/)?.[1]}"</span>
                </button>
              )}

              {subItems.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  {subItems.map((sub, idx) => (
                    <div key={sub.id || idx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          background: "var(--bg-surface)",
                          padding: "6px 10px",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Nombre (ej. Netflix, SmartFit, Luz)"
                          value={sub.name}
                          onChange={(e) => handleUpdateSubItem(idx, "name", e.target.value)}
                          style={{
                            flex: 2,
                            padding: "6px 8px",
                            borderRadius: "6px",
                            border: "1px solid var(--border)",
                            background: "var(--bg-card)",
                            color: "var(--text-primary)",
                            fontSize: "0.82rem",
                          }}
                        />
                        <div style={{ flex: 1.5 }}>
                          <CurrencyInput
                            value={sub.amount}
                            onChange={(val) => handleUpdateSubItem(idx, "amount", val)}
                            currency={currency}
                            placeholder="0"
                          />
                        </div>

                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => setMovingSubIndex(movingSubIndex === idx ? null : idx)}
                            style={{
                              background: "rgba(14, 165, 233, 0.12)",
                              border: "1px solid rgba(14, 165, 233, 0.3)",
                              color: "#0ea5e9",
                              borderRadius: "6px",
                              padding: "4px 8px",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                            title="Mover este concepto a otro rubro (ej. Salud, EPS)"
                          >
                            ⇄ Mover
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteSubItem(idx)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#f43f5e",
                            cursor: "pointer",
                            padding: "4px 6px",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                          }}
                          title="Eliminar este concepto"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Inline Envelope Mover Dropdown */}
                      {movingSubIndex === idx && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            background: "rgba(14, 165, 233, 0.08)",
                            borderRadius: 8,
                            border: "1px dashed #0ea5e9",
                            width: "100%",
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 600 }}>
                            Reasignar "{sub.name || "Concepto"}" hacia:
                          </span>
                          <select
                            value={targetMoveEnvelopeId}
                            onChange={(e) => setTargetMoveEnvelopeId(e.target.value)}
                            style={{
                              flex: 1,
                              minWidth: "170px",
                              padding: "5px 8px",
                              borderRadius: 6,
                              fontSize: "0.78rem",
                              background: "var(--bg-surface)",
                              color: "var(--text-primary)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <option value="">-- Seleccionar rubro destino --</option>
                            {allAvailableEnvelopes.map((env) => (
                              <option key={env.id} value={env.id}>
                                [{env.pillarLabel}] {env.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!targetMoveEnvelopeId}
                            onClick={() => handleExecuteMoveSubItem(sub, idx)}
                            style={{
                              background: targetMoveEnvelopeId ? "#0ea5e9" : "var(--border)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "5px 10px",
                              fontSize: "0.74rem",
                              fontWeight: 700,
                              cursor: targetMoveEnvelopeId ? "pointer" : "not-allowed",
                            }}
                          >
                            Confirmar Traslado
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMovingSubIndex(null);
                              setTargetMoveEnvelopeId("");
                            }}
                            style={{
                              background: "transparent",
                              border: "1px solid var(--border)",
                              color: "var(--text-muted)",
                              borderRadius: 6,
                              padding: "4px 8px",
                              fontSize: "0.74rem",
                              cursor: "pointer",
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 4,
                      paddingTop: 8,
                      borderTop: "1px dashed var(--border)",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Suma del desglose:{" "}
                      <strong style={{ color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>
                        ${subItemsTotal.toLocaleString("es-CO")} {currency}
                      </strong>
                    </span>
                    {subItemsTotal > 0 && subItemsTotal !== Number(amount) && (
                      <button
                        type="button"
                        onClick={() => setAmount(subItemsTotal)}
                        style={{
                          background: "rgba(16, 185, 129, 0.15)",
                          border: "1px solid rgba(16, 185, 129, 0.35)",
                          color: "#10b981",
                          borderRadius: "6px",
                          padding: "3px 10px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        ⚡ Usar suma como monto total
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions Footer */}
          <div className="cashflow-modal-footer" style={{ marginTop: 24, paddingTop: 14 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="cashflow-action-btn primary"
              disabled={!name.trim() || Number(amount) < 0}
            >
              {isEditing ? "✓ Guardar Cambios" : "✓ Guardar Asignación"}
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
