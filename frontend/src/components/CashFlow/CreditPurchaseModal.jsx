import React, { useState, useMemo } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import CustomSelectDropdown from "../Common/CustomSelectDropdown";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import { generateRollingMonthOptions, getCurrentPeriod } from "../../utils/periodUtils";
import "./CashFlow.css";

function formatMoney(val, currency = "COP") {
  const num = Number(val) || 0;
  if (currency === "USD") {
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `$${Math.round(num).toLocaleString("es-CO")}`;
}

export default function CreditPurchaseModal({
  isOpen,
  onClose,
  creditCards = [],
  activePeriod,
  currency = "COP",
  onSaveCreditPurchase,
}) {
  const currentPeriod = activePeriod || getCurrentPeriod();
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || "");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [installmentsCount, setInstallmentsCount] = useState(3);
  const [startPeriod, setStartPeriod] = useState(currentPeriod);
  const [interestType, setInterestType] = useState("zero_interest"); // 'zero_interest' (MSI / 1 Cuota) | 'standard_interest'
  const [customRateEA, setCustomRateEA] = useState(24.5);

  const selectedCard = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
  const rateEA = interestType === "zero_interest" ? 0 : Number(customRateEA || selectedCard?.rateEA || 24.5);

  // Financial SFC Amortization Calculation
  const loanCalculations = useMemo(() => {
    const principal = Number(totalAmount) || 0;
    const n = Math.max(1, Number(installmentsCount) || 1);

    if (principal <= 0) {
      return { monthlyInstallment: 0, totalInterest: 0, totalPayment: 0 };
    }

    if (n === 1 || interestType === "zero_interest") {
      const pmt = Math.round(principal / n);
      return {
        monthlyInstallment: pmt,
        totalInterest: 0,
        totalPayment: principal,
      };
    }

    // Standard French Amortization with Monthly Effective Rate
    const monthlyRate = Math.pow(1 + rateEA / 100, 1 / 12) - 1;
    const pmt = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
    const totalPayment = pmt * n;
    const totalInterest = Math.max(0, totalPayment - principal);

    return {
      monthlyInstallment: Math.round(pmt),
      totalInterest: Math.round(totalInterest),
      totalPayment: Math.round(totalPayment),
    };
  }, [totalAmount, installmentsCount, interestType, rateEA]);

  const monthOptions = useMemo(() => {
    return generateRollingMonthOptions(currentPeriod, 0, 36);
  }, [currentPeriod]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim() || Number(totalAmount) <= 0) return;

    const newPurchase = {
      id: `cp_${Date.now()}`,
      cardId: selectedCard?.id,
      cardName: selectedCard?.name || "Tarjeta de Crédito",
      description: description.trim(),
      totalAmount: Number(totalAmount),
      installmentsCount: Number(installmentsCount),
      startPeriod,
      interestType,
      rateEA,
      monthlyInstallment: loanCalculations.monthlyInstallment,
      totalInterest: loanCalculations.totalInterest,
      createdAt: new Date().toISOString(),
    };

    onSaveCreditPurchase(newPurchase);
    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={640}>
      <div style={{ padding: "20px 24px" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 12 }}>
          <h3 className="cashflow-modal-title">
            <span>💳</span> Registrar Compra a Cuotas / Diferido
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 10 }}>
          {/* Card Selection */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
              Tarjeta de Crédito
            </label>
            <CustomSelectDropdown
              options={creditCards.map((c) => ({
                value: c.id,
                label: `${c.icon || "💳"} ${c.name} (Cupo: ${formatMoney(c.totalLimit, currency)})`,
              }))}
              value={selectedCardId}
              onChange={(val) => setSelectedCardId(val)}
              placeholder="Seleccionar tarjeta..."
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
              Concepto / Comercio de la Compra
            </label>
            <input
              type="text"
              className="currency-native-input"
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "8px 12px", color: "#f8fafc", fontSize: "0.85rem" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ej. Mercado Libre (MSI), Tiquetes Avianca, Celular..."
              required
              autoFocus
            />
          </div>

          {/* Amount & Installments */}
          <div className="cashflow-form-row">
            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Valor Total de la Compra ({currency})
              </label>
              <CurrencyInput
                value={totalAmount}
                onChange={(val) => setTotalAmount(val)}
                currency={currency}
                placeholder="0"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Número de Cuotas
              </label>
              <select
                value={installmentsCount}
                onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(13, 18, 38, 0.7)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "#f8fafc",
                  fontSize: "0.85rem",
                  cursor: "pointer",
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

          {/* Interest Type: 0% MSI vs Interés Corriente */}
          <div style={{ background: "rgba(13, 18, 38, 0.6)", padding: "10px 14px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 8, fontWeight: 700 }}>
              Modalidad de Interés
            </label>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.8rem", color: interestType === "zero_interest" ? "#00e5ff" : "#94a3b8" }}>
                <input
                  type="radio"
                  name="interestType"
                  value="zero_interest"
                  checked={interestType === "zero_interest"}
                  onChange={() => setInterestType("zero_interest")}
                  style={{ accentColor: "#00e5ff" }}
                />
                <span>⚡ 0% Interés / MSI (RappiCard Mercado Libre / 1 Cuota)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.8rem", color: interestType === "standard_interest" ? "#f43f5e" : "#94a3b8" }}>
                <input
                  type="radio"
                  name="interestType"
                  value="standard_interest"
                  checked={interestType === "standard_interest"}
                  onChange={() => setInterestType("standard_interest")}
                  style={{ accentColor: "#f43f5e" }}
                />
                <span>📈 Interés Corriente ({customRateEA}% E.A.)</span>
              </label>
            </div>

            {interestType === "standard_interest" && installmentsCount > 1 && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Tasa E.A. Aplicable (%):</label>
                <input
                  type="number"
                  step="0.1"
                  value={customRateEA}
                  onChange={(e) => setCustomRateEA(Number(e.target.value))}
                  style={{ width: "90px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", padding: "4px 8px", color: "#fff", fontSize: "0.8rem" }}
                />
              </div>
            )}
          </div>

          {/* Start Month */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
              Mes de Inicio del Cobro (Primera Cuota)
            </label>
            <CustomSelectDropdown
              options={monthOptions}
              value={startPeriod}
              onChange={(val) => setStartPeriod(val)}
              searchPlaceholder="Buscar mes..."
            />
          </div>

          {/* Live Amortization Summary Strip */}
          <div
            style={{
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: "12px",
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.82rem",
            }}
          >
            <div>
              <span style={{ color: "#94a3b8", display: "block", fontSize: "0.72rem" }}>Cuota Mensual a Pagar:</span>
              <strong style={{ color: "#10b981", fontSize: "1.1rem", fontFamily: "JetBrains Mono, monospace" }}>
                {formatMoney(loanCalculations.monthlyInstallment, currency)}
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}> / mes ({installmentsCount} cuotas)</span>
              </strong>
            </div>

            <div style={{ textAlign: "right" }}>
              <span style={{ color: "#94a3b8", display: "block", fontSize: "0.72rem" }}>
                {interestType === "zero_interest" ? "Interés Total: $0 (0% MSI)" : "Total Intereses:"}
              </span>
              <strong style={{ color: interestType === "zero_interest" ? "#00e5ff" : "#f43f5e", fontFamily: "JetBrains Mono, monospace" }}>
                {formatMoney(loanCalculations.totalInterest, currency)}
              </strong>
            </div>
          </div>

          {/* Actions */}
          <div className="cashflow-modal-footer" style={{ marginTop: 8 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="cashflow-action-btn primary"
              disabled={!description.trim() || Number(totalAmount) <= 0}
            >
              ✓ Registrar Compra Diferida
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
