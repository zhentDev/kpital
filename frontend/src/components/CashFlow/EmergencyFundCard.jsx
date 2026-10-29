import React from "react";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function EmergencyFundCard({
  emergencyItem,
  totalNeeds = 0,
  targetMonths = 6,
  onSelectTargetMonths,
  currency = "COP",
  fxRate = 4150,
  onEditEmergency,
}) {
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const currentBalance = Number(emergencyItem?.currentBalance) || 0;
  const monthlyContribution = Number(emergencyItem?.monthlyContribution) || 0;

  // Calculate monthly fixed burn rate
  const monthlyBurn = Math.max(1, totalNeeds);
  const targetRequired = monthlyBurn * targetMonths;

  // Runway in months
  const monthsCovered = totalNeeds > 0 ? (currentBalance / totalNeeds).toFixed(1) : "0.0";
  const progressPct = targetRequired > 0 ? Math.min(100, Math.round((currentBalance / targetRequired) * 100)) : 0;
  const remainingGap = Math.max(0, targetRequired - currentBalance);
  const monthsToGoal = monthlyContribution > 0 ? Math.ceil(remainingGap / monthlyContribution) : null;

  const getStatus = (months) => {
    const m = Number(months);
    if (m >= 6) return { label: "🛡️ Blindaje Óptimo", color: "#10b981", badge: "success" };
    if (m >= 3) return { label: "⚡ Cobertura Aceptable", color: "#38bdf8", badge: "info" };
    return { label: "⚠️ Pista de Aterrizaje Vulnerable", color: "#f59e0b", badge: "warning" };
  };

  const status = getStatus(monthsCovered);

  return (
    <div className="cashflow-emergency-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🛡️</span> Radar de Pista de Emergencia (Runway & Liquidez)
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Protege tu patrimonio de contingencias sin tocar tus inversiones en Renta Variable.
          </p>
        </div>

        {/* Target Months Selector Chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-surface)", padding: 4, borderRadius: 12, border: "1px solid var(--border)" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", paddingLeft: 6 }}>Meta:</span>
          {[3, 6, 9, 12].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onSelectTargetMonths(m)}
              style={{
                padding: "4px 10px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.75rem",
                fontWeight: targetMonths === m ? 700 : 500,
                background: targetMonths === m ? "rgba(2, 132, 199, 0.15)" : "transparent",
                color: targetMonths === m ? "var(--text-accent)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {m} Meses
            </button>
          ))}
        </div>
      </div>

      <div className="cashflow-emergency-gauge">
        {/* Runway Gauge Circle */}
        <div className="cashflow-runway-badge-circle">
          <span className="cashflow-runway-number">{monthsCovered}</span>
          <span className="cashflow-runway-unit">Meses Cubiertos</span>
        </div>

        {/* Breakdown Details & Progress */}
        <div className="cashflow-emergency-details">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
              Progreso hacia el Blindaje ({targetMonths} Meses de Gastos Fijos)
            </span>
            <span className={`cashflow-kpi-badge ${status.badge}`}>
              {status.label}
            </span>
          </div>

          {/* Progress Bar */}
          <div style={{ width: "100%", height: 10, background: "var(--border)", borderRadius: 8, overflow: "hidden", position: "relative" }}>
            <div
              style={{
                width: `${progressPct}%`,
                height: "100%",
                background: "linear-gradient(90deg, #38bdf8 0%, #00e5ff 100%)",
                borderRadius: 8,
                transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: "0 0 10px rgba(56, 189, 248, 0.5)",
              }}
            />
          </div>

          {/* Key Metrics Strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 6 }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Saldo Actual Reservado</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem", fontWeight: 700, color: "#0284c7" }}>
                {formatMoney(currentBalance, currency)}
              </div>
              {emergencyItem?.sourceAccountsBreakdown?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                  {emergencyItem.sourceAccountsBreakdown.map((acc) => (
                    <div
                      key={acc.id}
                      style={{
                        fontSize: "0.66rem",
                        color: "#10b981",
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        padding: "3px 6px",
                        borderRadius: 6,
                        background: "rgba(16, 185, 129, 0.08)",
                        border: "1px solid rgba(16, 185, 129, 0.2)",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        📍 {acc.name} {acc.rateEA > 0 ? `(${acc.rateEA}% E.A.)` : ""}
                      </span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, flexShrink: 0 }}>
                        {formatMoney(acc.balance, acc.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                emergencyItem?.sourceAccountName && (
                  <div style={{ fontSize: "0.65rem", color: "#10b981", fontWeight: 600, marginTop: 2 }} title="Cuenta específica de donde se toma el fondo de emergencia">
                    📍 {emergencyItem.sourceAccountName}
                  </div>
                )
              )}
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Meta ({targetMonths} Meses Fijos)</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {formatMoney(targetRequired, currency)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Brecha Faltante</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem", fontWeight: 700, color: remainingGap > 0 ? "#f59e0b" : "#10b981" }}>
                {remainingGap > 0 ? formatMoney(remainingGap, currency) : "✅ Completado"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Tiempo Estimado</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                {remainingGap === 0
                  ? "Meta Alcanzada 🎉"
                  : monthsToGoal
                  ? `~${monthsToGoal} meses (${formatMoney(monthlyContribution, currency)}/m)`
                  : "Sin aporte mensual"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
