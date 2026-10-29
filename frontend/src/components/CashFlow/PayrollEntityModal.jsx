import React, { useState } from "react";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import DynamicDatePicker from "../Common/DynamicDatePicker";
import { BANK_PRESETS } from "../../utils/bankPresets";
import "./CashFlow.css";

export default function PayrollEntityModal({
  isOpen,
  onClose,
  currentAccount = {
    entityId: "nu",
    name: "Nu Colombia (Cuenta Nu Débito)",
    color: "#820ad1",
    icon: "💜",
    payDay: 25,
    targetCycle: "next_month",
    paymentFrequency: "monthly",
  },
  onSavePayrollAccount,
}) {
  const [selectedBankId, setSelectedBankId] = useState(currentAccount.entityId || "nu");
  const [customName, setCustomName] = useState(currentAccount.name || "Nu Colombia (Cuenta Nu Débito)");
  const [accountType, setAccountType] = useState(currentAccount.accountType || "Ahorros / Débito");
  const [accountNumber, setAccountNumber] = useState(currentAccount.accountNumber || "");
  const [payDay, setPayDay] = useState(currentAccount.payDay !== undefined ? currentAccount.payDay : 25);
  const [customPayDate, setCustomPayDate] = useState(currentAccount.customPayDate || "");
  const [targetCycle, setTargetCycle] = useState(currentAccount.targetCycle || "next_month");
  const [paymentFrequency, setPaymentFrequency] = useState(currentAccount.paymentFrequency || "monthly");

  const handleSelectPreset = (bank) => {
    setSelectedBankId(bank.id);
    setCustomName(`${bank.name} (${accountType})`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const preset = BANK_PRESETS.find((b) => b.id === selectedBankId);
    const updatedAccount = {
      entityId: selectedBankId,
      name: customName.trim() || preset?.name || "Cuenta Principal",
      accountType,
      accountNumber: accountNumber.trim(),
      color: preset?.color || "#820ad1",
      icon: preset?.icon || "🏦",
      payDay: Number(payDay) || 25,
      customPayDate: customPayDate || null,
      targetCycle,
      paymentFrequency,
    };
    onSavePayrollAccount(updatedAccount);
    onClose();
  };

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={640}>
      <div style={{ padding: "20px 26px" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 12 }}>
          <h3 className="cashflow-modal-title">
            <span>🏦</span> Configuración de Nómina & Ciclo de Pago
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: 4, marginBottom: 16 }}>
          Indica en qué banco recibes tu sueldo, qué día exacto te pagan y cómo se destina ese dinero (ej. pago del 25 para respaldar el presupuesto del mes entrante).
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Bank Presets Grid */}
          <div>
            <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 8, fontWeight: 600 }}>
              Seleccionar Entidad Bancaria (Colombia)
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))",
                gap: 8,
                maxHeight: "150px",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {BANK_PRESETS.map((bank) => {
                const isSelected = selectedBankId === bank.id;
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => handleSelectPreset(bank)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: "10px",
                      background: isSelected ? `${bank.color}22` : "rgba(13, 18, 38, 0.6)",
                      border: isSelected ? `2px solid ${bank.color}` : "1px solid rgba(255, 255, 255, 0.06)",
                      color: isSelected ? "#ffffff" : "#94a3b8",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "0.78rem",
                      fontWeight: isSelected ? 700 : 500,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: "1.1rem" }}>{bank.icon}</span>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {bank.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Account Custom Name & Type */}
          <div className="cashflow-form-row">
            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Nombre / Alias de la Cuenta
              </label>
              <input
                type="text"
                className="currency-native-input"
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "8px 12px", color: "#f8fafc", fontSize: "0.85rem" }}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="ej. Cuenta Nu Débito Nómina"
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 600 }}>
                Tipo de Cuenta
              </label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
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
                <option value="Ahorros / Débito">Ahorros / Débito</option>
                <option value="Corriente">Corriente</option>
                <option value="Billetera Digital">Billetera Digital</option>
              </select>
            </div>
          </div>

          {/* ── Payday (Día de Pago de Nómina) Configuration ── */}
          <div
            style={{
              background: "rgba(130, 10, 209, 0.08)",
              border: "1px solid rgba(130, 10, 209, 0.25)",
              borderRadius: "12px",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "0.78rem", color: "#d8b4fe", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🗓️</span> Día de Pago de Nómina (PayDay)
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                {[
                  { day: 23, label: "Día 23" },
                  { day: 25, label: "Día 25" },
                  { day: 30, label: "Día 30" },
                  { day: 15, label: "Día 15" },
                ].map((preset) => (
                  <button
                    key={preset.day}
                    type="button"
                    onClick={() => setPayDay(preset.day)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "6px",
                      border: payDay === preset.day ? "1px solid #c084fc" : "1px solid rgba(255,255,255,0.08)",
                      background: payDay === preset.day ? "rgba(192, 132, 252, 0.2)" : "transparent",
                      color: payDay === preset.day ? "#f8fafc" : "#94a3b8",
                      fontSize: "0.72rem",
                      cursor: "pointer",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cashflow-form-row">
              <div>
                <label style={{ display: "block", fontSize: "0.72rem", color: "#94a3b8", marginBottom: 4 }}>
                  Día Habitual de Nómina (1 al 31)
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className="currency-native-input"
                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(13, 18, 38, 0.7)", border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: "8px", padding: "8px 12px", color: "#f8fafc", fontSize: "0.85rem" }}
                  value={payDay}
                  onChange={(e) => setPayDay(e.target.value)}
                  placeholder="25"
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.72rem", color: "#94a3b8", marginBottom: 4 }}>
                  Frecuencia de Pago
                </label>
                <select
                  value={paymentFrequency}
                  onChange={(e) => setPaymentFrequency(e.target.value)}
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
                  <option value="monthly">Mensual (1 Pago / Mes)</option>
                  <option value="biweekly">Quincenal (2 Pagos / Mes)</option>
                </select>
              </div>
            </div>

            {/* Business Day Rule Notice */}
            <div style={{ background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: "8px", padding: "8px 12px", fontSize: "0.74rem", color: "#7dd3fc" }}>
              ⚖️ <strong>Regla de Día Hábil Bancario:</strong> Si el día {payDay} cae sábado o domingo, el sistema calcula automáticamente tu pago el <strong>viernes anterior hábil</strong> (ej. si 25 es sábado, calcula 24 viernes).
            </div>

            {/* Optional Manual Date Override */}
            <div>
              <label style={{ display: "block", fontSize: "0.72rem", color: "#94a3b8", marginBottom: 4 }}>
                ¿Te consignaron en una fecha especial este mes? (Opcional - Reemplazar fecha de pago):
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <DynamicDatePicker
                    value={customPayDate}
                    onChange={(val) => setCustomPayDate(val)}
                    placeholder="YYYY-MM-DD (ej. 2026-10-23)"
                  />
                </div>
                {customPayDate && (
                  <button
                    type="button"
                    onClick={() => setCustomPayDate("")}
                    style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#94a3b8", fontSize: "0.72rem", padding: "6px 10px", cursor: "pointer" }}
                    title="Restablecer a día automático de nómina"
                  >
                    ✕ Limpiar
                  </button>
                )}
              </div>
            </div>

            {/* Target Funding Cycle Strategy */}
            <div>
              <label style={{ display: "block", fontSize: "0.72rem", color: "#94a3b8", marginBottom: 6, fontWeight: 600 }}>
                Asignación y Propósito de los Fondos de Nómina:
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: targetCycle === "next_month" ? "rgba(0, 229, 255, 0.12)" : "rgba(255, 255, 255, 0.02)",
                    border: targetCycle === "next_month" ? "1px solid #00e5ff" : "1px solid rgba(255, 255, 255, 0.06)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    color: targetCycle === "next_month" ? "#f8fafc" : "#94a3b8",
                  }}
                >
                  <input
                    type="radio"
                    name="targetCycle"
                    value="next_month"
                    checked={targetCycle === "next_month"}
                    onChange={() => setTargetCycle("next_month")}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <strong style={{ color: "#00e5ff" }}>🚀 Fondeo para el Mes Entrante (Recomendado para pagos del día 25)</strong>
                    <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 2 }}>
                      La nómina que recibes el día {payDay} queda etiquetada como la liquidez para pagar los gastos fijos, tarjetas y aportes a CDT del mes entrante.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: "8px",
                    background: targetCycle === "current_month" ? "rgba(0, 229, 255, 0.12)" : "rgba(255, 255, 255, 0.02)",
                    border: targetCycle === "current_month" ? "1px solid #00e5ff" : "1px solid rgba(255, 255, 255, 0.06)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    color: targetCycle === "current_month" ? "#f8fafc" : "#94a3b8",
                  }}
                >
                  <input
                    type="radio"
                    name="targetCycle"
                    value="current_month"
                    checked={targetCycle === "current_month"}
                    onChange={() => setTargetCycle("current_month")}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <strong>📅 Mes Calendario Estricto (Día 1 al 30)</strong>
                    <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 2 }}>
                      Asignar la nómina exclusivamente dentro de los días del mes calendario en curso.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="cashflow-modal-footer" style={{ marginTop: 4 }}>
            <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="cashflow-action-btn primary">
              ✓ Guardar Nómina & Ciclo Salarial
            </button>
          </div>
        </form>
      </div>
    </GlassModalWrapper>
  );
}
