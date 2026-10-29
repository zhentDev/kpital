import React, { useState, useEffect } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { BANK_PRESETS } from "../../utils/bankPresets";
import { getSfcRateForBank, SFC_USURY_RATE_EA } from "../../utils/sfcCreditRates";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import toast from "react-hot-toast";
import { toastConfirm } from "../../utils/toastAlerts";
import "./CashFlow.css";

export default function CreditCardConfigModal({
  isOpen,
  onClose,
  cardToEdit = null, // null for new card, or existing card object
  creditCards = [],
  netSalary = 0,
  currency = "COP",
  fxRate = 4150,
  onSaveCard,
  onDeleteCard,
}) {
  const isEditing = Boolean(cardToEdit && cardToEdit.id);

  const [bankId, setBankId] = useState("nu");
  const [name, setName] = useState("Tarjeta Nu Mastercard");
  const [totalLimit, setTotalLimit] = useState(1750000);
  const [usedLimit, setUsedLimit] = useState(0);
  const [closingDay, setClosingDay] = useState(15);
  const [paymentDay, setPaymentDay] = useState(2);
  const [rateEA, setRateEA] = useState(24.5);
  const [cardType, setCardType] = useState("Gold / Platinum");

  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);

  useEffect(() => {
    if (isOpen) {
      if (cardToEdit) {
        setBankId(cardToEdit.bankId || "nu");
        setName(cardToEdit.name || "Tarjeta de Crédito");
        setTotalLimit(Number(cardToEdit.totalLimit) || 0);
        setUsedLimit(Number(cardToEdit.usedLimit) || 0);
        setClosingDay(Number(cardToEdit.closingDay) || 15);
        setPaymentDay(Number(cardToEdit.paymentDay) || 2);
        setRateEA(Number(cardToEdit.rateEA) || 24.5);
        setCardType(cardToEdit.cardType || "Gold / Platinum");
      } else {
        setBankId("nu");
        setName("Tarjeta Nu Mastercard");
        setTotalLimit(1750000);
        setUsedLimit(0);
        setClosingDay(15);
        setPaymentDay(2);
        setRateEA(24.5);
        setCardType("Gold / Platinum");
      }
    }
  }, [isOpen, cardToEdit]);

  // Projected 50% Net Salary Exposure Calculation
  const otherCardsLimit = creditCards
    .filter((c) => !isEditing || c.id !== cardToEdit?.id)
    .reduce((acc, c) => acc + (Number(c.totalLimit) || 0), 0);
  const projectedTotalLimit = otherCardsLimit + (Number(totalLimit) || 0);
  const baseSalaryNet = Number(netSalary) > 0 ? Number(netSalary) : 3662854;
  const maxSafeCreditLimit = baseSalaryNet * 0.5;
  const projectedExposurePct = baseSalaryNet > 0 ? ((projectedTotalLimit / baseSalaryNet) * 100).toFixed(1) : "0.0";
  const isProjectedOverLimit = projectedTotalLimit > maxSafeCreditLimit;
  const projectedExcess = Math.max(0, projectedTotalLimit - maxSafeCreditLimit);

  const handleSelectBankPreset = (preset) => {
    setBankId(preset.id);
    setName(`Tarjeta ${preset.name}`);
    const sfcInfo = getSfcRateForBank(preset.id);
    setRateEA(sfcInfo.rateEA);
  };

  const handleFetchSfcRate = () => {
    const sfcInfo = getSfcRateForBank(bankId);
    setRateEA(sfcInfo.rateEA);
    toast.success(
      `Tasa SFC Oficial aplicada: ${sfcInfo.rateEA}% E.A. (Tope de Usura: ${SFC_USURY_RATE_EA}% E.A.)`,
      { icon: "📡" }
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || Number(totalLimit) <= 0) return;

    const preset = BANK_PRESETS.find((b) => b.id === bankId);
    const cardData = {
      id: isEditing ? cardToEdit.id : `cc_${Date.now()}`,
      bankId,
      name: name.trim(),
      totalLimit: Number(totalLimit),
      usedLimit: Number(usedLimit),
      closingDay: Number(closingDay),
      paymentDay: Number(paymentDay),
      rateEA: Number(rateEA),
      cardType,
      color: preset?.color || cardToEdit?.color || "#820ad1",
      icon: preset?.icon || cardToEdit?.icon || "💳",
      currency,
      createdAt: isEditing ? cardToEdit.createdAt : new Date().toISOString(),
    };

    onSaveCard(cardData);
    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={640}>
      <div style={{ padding: "22px 26px" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 14 }}>
          <h3 className="cashflow-modal-title">
            <span>{isEditing ? "✏️" : "💳"}</span>{" "}
            {isEditing ? `Editar ${cardToEdit?.name || "Tarjeta"}` : "Agregar Nueva Tarjeta de Crédito"}
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Preset Picker */}
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 6, fontWeight: 700 }}>
              Entidad Emisora (Banco / Fintech)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6, maxHeight: "130px", overflowY: "auto" }}>
              {BANK_PRESETS.map((bank) => {
                const isSelected = bankId === bank.id;
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => handleSelectBankPreset(bank)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 8px",
                      borderRadius: "8px",
                      background: isSelected ? `${bank.color}22` : "rgba(13, 18, 38, 0.6)",
                      border: isSelected ? `2px solid ${bank.color}` : "1px solid rgba(255, 255, 255, 0.06)",
                      color: isSelected ? "#ffffff" : "#94a3b8",
                      cursor: "pointer",
                      fontSize: "0.76rem",
                      fontWeight: isSelected ? 700 : 500,
                      textAlign: "left",
                    }}
                  >
                    <span>{bank.icon}</span>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {bank.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
              Nombre / Alias de la Tarjeta
            </label>
            <input
              type="text"
              className="currency-native-input"
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "10px", padding: "10px 14px", color: "#f8fafc", fontSize: "0.9rem" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Tarjeta Nu Mastercard, RappiCard..."
              required
            />
          </div>

          {/* Cupo Total & Cupo Usado (Editable!) */}
          <div className="cashflow-form-row">
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                Cupo Total Otorgado ({currency})
              </label>
              <CurrencyInput
                value={totalLimit}
                onChange={(val) => setTotalLimit(val)}
                currency={currency}
                placeholder="0"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                Cupo Usado / Deuda Actual ({currency})
              </label>
              <CurrencyInput
                value={usedLimit}
                onChange={(val) => setUsedLimit(val)}
                currency={currency}
                placeholder="0"
              />
            </div>
          </div>

          {/* ── Live 50% Net Salary Exposure Alert ── */}
          <div
            style={{
              background: isProjectedOverLimit ? "rgba(244, 63, 94, 0.1)" : "rgba(16, 185, 129, 0.1)",
              border: isProjectedOverLimit ? "1px solid rgba(244, 63, 94, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "10px",
              padding: "10px 14px",
              fontSize: "0.75rem",
              lineHeight: "1.4",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontWeight: 700, color: isProjectedOverLimit ? "#f43f5e" : "#10b981" }}>
                {isProjectedOverLimit ? "⚠️ Exposición Proyectada Alta" : "🛡️ Exposición Crediticia Segura"} ({projectedExposurePct}%)
              </span>
              <span style={{ color: "#94a3b8", fontSize: "0.7rem" }}>
                Tope 50%: {formatMoney(maxSafeCreditLimit)}
              </span>
            </div>
            <div style={{ color: isProjectedOverLimit ? "#fca5a5" : "#a7f3d0" }}>
              {isProjectedOverLimit ? (
                <span>
                  Con este cupo, la suma total de tus tarjetas será <strong>{formatMoney(projectedTotalLimit)}</strong>, superando el 50% de tu sueldo neto por <strong>{formatMoney(projectedExcess)}</strong>.
                </span>
              ) : (
                <span>
                  Con este cupo, tus tarjetas sumarán <strong>{formatMoney(projectedTotalLimit)}</strong>, manteniéndote seguro dentro del 50% de tu salario neto.
                </span>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="cashflow-form-row">
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                Día de Corte Mensual
              </label>
              <input
                type="number"
                min="1"
                max="31"
                className="currency-native-input"
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "10px", padding: "10px 14px", color: "#f8fafc", fontSize: "0.9rem" }}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
                placeholder="15"
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.78rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                Día Límite de Pago
              </label>
              <input
                type="number"
                min="1"
                max="31"
                className="currency-native-input"
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "10px", padding: "10px 14px", color: "#f8fafc", fontSize: "0.9rem" }}
                value={paymentDay}
                onChange={(e) => setPaymentDay(e.target.value)}
                placeholder="2"
                required
              />
            </div>
          </div>

          {/* Rate & SFC Official Fetch */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <label style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 700 }}>
                Tasa de Interés Nominal / E.A. (% Anual)
              </label>
              <button
                type="button"
                onClick={handleFetchSfcRate}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#00e5ff",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                📡 Cargar Tasa Oficial SFC ({getSfcRateForBank(bankId).rateEA}% E.A.)
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="currency-native-input"
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "10px", padding: "10px 14px", color: "#f8fafc", fontSize: "0.9rem" }}
              value={rateEA}
              onChange={(e) => setRateEA(e.target.value)}
              placeholder="24.5"
            />
          </div>

          {/* Modal Actions */}
          <div className="cashflow-modal-footer" style={{ marginTop: 8 }}>
            {isEditing && onDeleteCard && (
              <button
                type="button"
                className="cashflow-action-btn delete"
                style={{ marginRight: "auto" }}
                onClick={async () => {
                  const ok = await toastConfirm(`¿Estás seguro de eliminar la tarjeta ${cardToEdit.name}?`);
                  if (ok) {
                    onDeleteCard(cardToEdit.id);
                    onClose();
                  }
                }}
              >
                Eliminar Tarjeta
              </button>
            )}
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="cashflow-action-btn primary">
              {isEditing ? "Guardar Cambios" : "Crear Tarjeta"}
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
