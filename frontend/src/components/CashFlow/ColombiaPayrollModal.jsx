import React, { useState, useMemo } from "react";
import CurrencyInput from "../Common/CurrencyInput";
import CustomSelectDropdown from "../Common/CustomSelectDropdown";
import GlassModalWrapper from "../Common/GlassModalWrapper";
import {
  COLOMBIA_CONSTANTS,
  calculateNetSalaryDependent,
  calculateNetIncomeIndependent,
} from "../../utils/colombiaPayroll";
import "./CashFlow.css";

function formatMoney(val) {
  return `$${Math.round(Number(val) || 0).toLocaleString("es-CO")} COP`;
}

export default function ColombiaPayrollModal({
  isOpen,
  onClose,
  onApplySalary,
  activePeriod = "2026-08",
  salaryHistory = [],
}) {
  const [activeTab, setActiveTab] = useState("dependent"); // 'dependent' | 'independent' | 'history'
  const [baseSalary, setBaseSalary] = useState(3800000);
  const [extraOvertime, setExtraOvertime] = useState(181364); // Horas extras / recargos / ajustes
  const [grossFees, setGrossFees] = useState(2500000);
  const [arlRisk, setArlRisk] = useState(1);
  const [withholdingTax, setWithholdingTax] = useState(0);
  const [otherDeductions, setOtherDeductions] = useState(0);
  const [note, setNote] = useState("");

  const totalGrossSalary = Number(baseSalary) + Number(extraOvertime);

  // Live calculation for Dependent (Empleado con contrato laboral)
  const dependentResult = useMemo(() => {
    return calculateNetSalaryDependent({
      grossSalary: totalGrossSalary,
      withholdingTax,
      otherDeductions,
    });
  }, [totalGrossSalary, withholdingTax, otherDeductions]);

  // Live calculation for Independent (Contratista por prestación de servicios)
  const independentResult = useMemo(() => {
    return calculateNetIncomeIndependent({
      grossFees,
      arlRiskLevel: arlRisk,
      withholdingTax,
    });
  }, [grossFees, arlRisk, withholdingTax]);

  const currentResult = activeTab === "dependent" ? dependentResult : independentResult;
  const currentNet = activeTab === "dependent" ? dependentResult.netSalary : independentResult.netIncome;
  const currentGross = activeTab === "dependent" ? totalGrossSalary : grossFees;

  const handleApply = () => {
    onApplySalary({
      contractType: activeTab,
      grossSalary: currentGross,
      payrollBreakdown: currentResult,
      note: note.trim() || (activeTab === "dependent" ? "Nómina Principal" : "Honorarios Freelance"),
      period: activePeriod,
    });
    onClose();
  };

  const ARL_OPTIONS = [
    { value: 1, label: "Riesgo I (0.522%) — Administrativo / Oficina", badge: "Oficina" },
    { value: 2, label: "Riesgo II (1.044%) — Comercial / Retail", badge: "Comercio" },
    { value: 3, label: "Riesgo III (2.436%) — Manufactura / Almacén", badge: "Operativo" },
    { value: 4, label: "Riesgo IV (4.350%) — Construcción / Transporte", badge: "Riesgo Alto" },
    { value: 5, label: "Riesgo V (6.960%) — Minería / Eléctrico", badge: "Máximo" },
  ];

  return (
    <GlassModalWrapper isOpen={isOpen} onClose={onClose} maxWidth={640}>
      <div style={{ padding: "20px 24px" }}>
        {/* Header */}
        <div className="cashflow-modal-header" style={{ paddingBottom: 12 }}>
          <h3 className="cashflow-modal-title">
            <span>🇨🇴</span> Liquidación Legal de Nómina Colombia
          </h3>
          <button type="button" className="cashflow-modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, background: "rgba(13, 18, 38, 0.7)", padding: 4, borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <button
            type="button"
            className={`cashflow-rule-tab-btn ${activeTab === "dependent" ? "active" : ""}`}
            style={{ flex: 1, justifyContent: "center", fontSize: "0.8rem" }}
            onClick={() => setActiveTab("dependent")}
          >
            🏢 Contrato Laboral (Empleado)
          </button>
          <button
            type="button"
            className={`cashflow-rule-tab-btn ${activeTab === "independent" ? "active" : ""}`}
            style={{ flex: 1, justifyContent: "center", fontSize: "0.8rem" }}
            onClick={() => setActiveTab("independent")}
          >
            💻 Prestación de Servicios (Freelance)
          </button>
          <button
            type="button"
            className={`cashflow-rule-tab-btn ${activeTab === "history" ? "active" : ""}`}
            style={{ flex: 0.8, justifyContent: "center", fontSize: "0.8rem" }}
            onClick={() => setActiveTab("history")}
          >
            📜 Historial ({salaryHistory.length})
          </button>
        </div>

        {/* ── View: History ──────────────────────────────── */}
        {activeTab === "history" ? (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: 380, overflowY: "auto" }}>
            {salaryHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "#94a3b8", fontSize: "0.85rem" }}>
                Aún no has registrado variaciones salariales históricas.
              </div>
            ) : (
              salaryHistory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: "rgba(13, 18, 38, 0.7)",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: 12,
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.9rem" }}>
                      {item.note || "Ajuste Salarial"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                      Período: <strong style={{ color: "#38bdf8" }}>{item.period}</strong> • {item.contractType === "dependent" ? "Nómina" : "Freelance"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, color: "#10b981", fontSize: "1rem" }}>
                      {formatMoney(item.netSalary)}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                      Devengado: {formatMoney(item.grossSalary)} (-{item.payrollBreakdown?.effectiveDeductionPct || 0}%)
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* ── View: Calculator ───────────────────────────── */
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            {/* Input Base Salary & Overtimes */}
            {activeTab === "dependent" ? (
              <div className="cashflow-form-row">
                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                    Sueldo Básico Mensual (M010)
                  </label>
                  <CurrencyInput
                    value={baseSalary}
                    onChange={(val) => setBaseSalary(val)}
                    currency="COP"
                    placeholder="3800000"
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                    Horas Extras / Recargos / Ajustes
                  </label>
                  <CurrencyInput
                    value={extraOvertime}
                    onChange={(val) => setExtraOvertime(val)}
                    currency="COP"
                    placeholder="0"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 5, fontWeight: 700 }}>
                  Honorarios Mensuales Brutos (Antes de PILA)
                </label>
                <CurrencyInput
                  value={grossFees}
                  onChange={(val) => setGrossFees(val)}
                  currency="COP"
                  placeholder="0"
                />
              </div>
            )}

            {/* Contract Specific Configs */}
            {activeTab === "dependent" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>
                    Retención en la Fuente (Opcional)
                  </label>
                  <CurrencyInput
                    value={withholdingTax}
                    onChange={(val) => setWithholdingTax(val)}
                    currency="COP"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>
                    Otras Deducciones (Libranza / Préstamos)
                  </label>
                  <CurrencyInput
                    value={otherDeductions}
                    onChange={(val) => setOtherDeductions(val)}
                    currency="COP"
                    placeholder="0"
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>
                    Nivel de Riesgo ARL
                  </label>
                  <CustomSelectDropdown
                    options={ARL_OPTIONS}
                    value={arlRisk}
                    onChange={(val) => setArlRisk(Number(val))}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>
                    ReteFuente / ReteICA
                  </label>
                  <CurrencyInput
                    value={withholdingTax}
                    onChange={(val) => setWithholdingTax(val)}
                    currency="COP"
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* Note / Tag */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>
                Etiqueta / Descripción del Salario (Opcional)
              </label>
              <input
                type="text"
                className="currency-native-input"
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  color: "#f8fafc",
                  width: "100%",
                  boxSizing: "border-box",
                  fontSize: "0.85rem",
                }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ej. Salario con Horas Extras, Aumento Salarial, etc."
              />
            </div>

            {/* ── Breakdown & Net Summary Card ─────────────── */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(13, 18, 38, 0.9) 0%, rgba(17, 24, 41, 0.8) 100%)",
                border: "1px solid rgba(0, 229, 255, 0.25)",
                borderRadius: 14,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.84rem" }}>
                <span style={{ color: "#94a3b8", fontWeight: 600 }}>Total Devengos (IBC Nómina):</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#f8fafc", fontWeight: 800 }}>
                  {formatMoney(currentGross)}
                </span>
              </div>

              {activeTab === "dependent" ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                    <span style={{ color: "#f43f5e" }}>🩺 Descuento Salud Empleado (T000 • 4.0%):</span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#f43f5e", fontWeight: 700 }}>
                      -{formatMoney(dependentResult.healthDeduction)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                    <span style={{ color: "#f43f5e" }}>🛡️ Descuento Pensión Empleado (T010 • 4.0%):</span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#f43f5e", fontWeight: 700 }}>
                      -{formatMoney(dependentResult.pensionDeduction)}
                    </span>
                  </div>
                  {dependentResult.fspDeduction > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                      <span style={{ color: "#f43f5e" }}>- Fondo Solidaridad Pensional ({dependentResult.fspPct}%):</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#f43f5e" }}>
                        -{formatMoney(dependentResult.fspDeduction)}
                      </span>
                    </div>
                  )}
                  {dependentResult.auxTransporteAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                      <span style={{ color: "#10b981" }}>+ Auxilio de Transporte Legal:</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#10b981" }}>
                        +{formatMoney(dependentResult.auxTransporteAmount)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                    <span style={{ color: "#38bdf8" }}>Ingreso Base Cotización (IBC 40%):</span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#38bdf8" }}>
                      {formatMoney(independentResult.ibc)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                    <span style={{ color: "#f43f5e" }}>- Planilla PILA (Salud 12.5% + Pensión 16% + ARL):</span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", color: "#f43f5e" }}>
                      -{formatMoney(independentResult.totalPila)}
                    </span>
                  </div>
                </>
              )}

              {/* Legal Explanation Pill */}
              <div
                style={{
                  background: "rgba(56, 189, 248, 0.08)",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  fontSize: "0.72rem",
                  color: "#94a3b8",
                  lineHeight: "1.35",
                }}
              >
                💡 <strong style={{ color: "#38bdf8" }}>¿Por qué solo Salud y Pensión?</strong> Por ley colombiana (Art. 204 Ley 100), las únicas 2 deducciones que se restan al empleado en su desprendible son <strong>Salud (4%) y Pensión (4%)</strong>. Los <strong>Parafiscales</strong> (Caja de Compensación 4%, SENA 2%, ICBF 3%) y la ARL son asumidos <strong>100% por tu empresa</strong> por fuera de tu salario.
              </div>

              {/* Net Result Bar */}
              <div
                style={{
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                  paddingTop: 10,
                  marginTop: 2,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                    Neto a Pagar en Cuenta
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Total deducciones de ley (8.0%): -{formatMoney(currentResult.totalLegalDeductions)}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "1.45rem",
                    fontWeight: 800,
                    color: "#10b981",
                  }}
                >
                  {formatMoney(currentNet)}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="cashflow-modal-footer">
              <button type="button" className="cashflow-action-btn secondary" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="cashflow-action-btn primary"
                onClick={handleApply}
                disabled={currentGross <= 0}
              >
                ✓ Aplicar Salario Neto ({formatMoney(currentNet)})
              </button>
            </div>
          </div>
        )}
      </div>
    </GlassModalWrapper>
  );
}
