import React, { useState, useMemo } from "react";
import { InfoTooltip } from "./Common";
import { useTheme } from "../context/ThemeContext";

export default function MonteCarloCard({
  monteCarlo,
  activeInvested = 2000,
  currentValueUSD,
  beta = 1.15,
  fxRate = 4150,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [activeTab, setActiveTab] = useState("stress_testing"); // 'stress_testing' | 'cone'
  const [selectedScenario, setSelectedScenario] = useState("ai_rally");

  // Parámetros interactivos de Stress Testing
  const [marketShockPct, setMarketShockPct] = useState(-10); // ej: -10% en el mercado
  const [simulatedFxRate, setSimulatedFxRate] = useState(fxRate); // ej: 4400 COP

  const baseCapitalUSD = Number(currentValueUSD || activeInvested || 2000);
  const effectiveBeta = Number(beta) > 0 ? Number(beta) : 1.15;

  // ── 1. Cálculos de Stress Testing Dinámico ──────────────────────────
  const stressResults = useMemo(() => {
    // Rendimiento proyectado del portafolio según la Beta
    const portfolioShockPct = marketShockPct * effectiveBeta;
    const projectedValUSD = baseCapitalUSD * (1 + portfolioShockPct / 100);
    const deltaUSD = projectedValUSD - baseCapitalUSD;

    // Valores en COP
    const currentValCOP = baseCapitalUSD * fxRate;
    const projectedValCOP = projectedValUSD * simulatedFxRate;
    const deltaCOP = projectedValCOP - currentValCOP;
    const netReturnPctCOP = currentValCOP > 0 ? (deltaCOP / currentValCOP) * 100 : 0;

    // Nivel de resiliencia
    const isResilient = Math.abs(deltaUSD) < baseCapitalUSD * 0.15;

    return {
      portfolioShockPct,
      projectedValUSD,
      deltaUSD,
      currentValCOP,
      projectedValCOP,
      deltaCOP,
      netReturnPctCOP,
      isResilient,
    };
  }, [marketShockPct, simulatedFxRate, baseCapitalUSD, effectiveBeta, fxRate]);

  // Presets de escenarios macroeconómicos
  const applyMacroPreset = (mkt, fx) => {
    setMarketShockPct(mkt);
    setSimulatedFxRate(fx);
  };

  if (!monteCarlo && !currentValueUSD && !activeInvested) return null;

  const scenarios = monteCarlo?.scenarios || {};
  const currentScenario = scenarios[selectedScenario];
  const median = monteCarlo?.median || [];
  const bull = monteCarlo?.bull_95 || [];
  const bear = monteCarlo?.bear_5 || [];

  const baseVal = median[0] || activeInvested || 666.67;
  const targetMedian = median[median.length - 1] || baseVal;
  const targetBull = bull[bull.length - 1] || baseVal * 1.15;
  const targetBear = bear[bear.length - 1] || baseVal * 0.9;

  return (
    <div
      className="card fade-up"
      style={{
        padding: "18px 20px",
        background: isLight ? "#ffffff" : "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* ── Header con Pestañas ────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
          flexWrap: "wrap",
          gap: 10,
          paddingBottom: "12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: "0.98rem",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: isLight ? "#0f172a" : "#f8fafc",
            }}
          >
            <span>⚡ Simulación de Escenarios & Stress Testing</span>
            <InfoTooltip conceptKey="monte_carlo" />
          </h3>
          <span style={{ fontSize: "0.73rem", color: isLight ? "#64748b" : "#94a3b8" }}>
            Modelado predictivo: evalúa la resistencia de tu portafolio ante caídas de Wall Street o saltos del dólar.
          </span>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: "inline-flex",
            background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.05)",
            padding: "3px",
            borderRadius: "8px",
            border: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("stress_testing")}
            style={{
              border: "none",
              background: activeTab === "stress_testing" ? (isLight ? "#0284c7" : "var(--accent-primary)") : "transparent",
              color: activeTab === "stress_testing" ? (isLight ? "#ffffff" : "#0d1117") : "var(--text-secondary)",
              fontWeight: activeTab === "stress_testing" ? 700 : 500,
              fontSize: "0.72rem",
              padding: "4px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            ⚡ Shocks Macro
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cone")}
            style={{
              border: "none",
              background: activeTab === "cone" ? (isLight ? "#0284c7" : "var(--accent-primary)") : "transparent",
              color: activeTab === "cone" ? (isLight ? "#ffffff" : "#0d1117") : "var(--text-secondary)",
              fontWeight: activeTab === "cone" ? 700 : 500,
              fontSize: "0.72rem",
              padding: "4px 10px",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            🎲 Cono Monte Carlo (90D)
          </button>
        </div>
      </div>

      {/* ── VISTA 1: STRESS TESTING MACRO INTERACTIVO ───────────────── */}
      {activeTab === "stress_testing" && (
        <div>
          {/* Quick Preset Buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "14px" }}>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", alignSelf: "center", marginRight: 4 }}>
              Escenarios rápidos:
            </span>
            <button
              type="button"
              onClick={() => applyMacroPreset(-15, Math.round(fxRate * 1.08))}
              style={{
                fontSize: "0.7rem",
                padding: "3px 8px",
                borderRadius: "6px",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                background: "rgba(239, 68, 68, 0.08)",
                color: isLight ? "#dc2626" : "#f87171",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              💥 Crash Wall Street (-15%)
            </button>
            <button
              type="button"
              onClick={() => applyMacroPreset(15, Math.round(fxRate * 0.98))}
              style={{
                fontSize: "0.7rem",
                padding: "3px 8px",
                borderRadius: "6px",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                background: "rgba(16, 185, 129, 0.08)",
                color: isLight ? "#16a34a" : "#4ade80",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              🚀 Super Rally (+15%)
            </button>
            <button
              type="button"
              onClick={() => applyMacroPreset(-5, 4500)}
              style={{
                fontSize: "0.7rem",
                padding: "3px 8px",
                borderRadius: "6px",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                background: "rgba(245, 158, 11, 0.08)",
                color: isLight ? "#d97706" : "#fbbf24",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              💵 Salto Dólar ($4.500)
            </button>
            <button
              type="button"
              onClick={() => applyMacroPreset(0, 3800)}
              style={{
                fontSize: "0.7rem",
                padding: "3px 8px",
                borderRadius: "6px",
                border: "1px solid rgba(2, 132, 199, 0.3)",
                background: "rgba(2, 132, 199, 0.08)",
                color: isLight ? "#0284c7" : "#38bdf8",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              🛡️ Peso Fuerte ($3.800)
            </button>
          </div>

          {/* Interactive Sliders Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              padding: "12px 14px",
              borderRadius: "12px",
              background: isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.02)",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.06)" : "1px solid rgba(255, 255, 255, 0.06)",
              marginBottom: "14px",
            }}
          >
            {/* Slider 1: Shock del Mercado */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>📉 Variación del S&P 500 / NASDAQ:</span>
                <strong
                  className="mono"
                  style={{
                    color: marketShockPct >= 0 ? (isLight ? "#16a34a" : "#4ade80") : (isLight ? "#dc2626" : "#f87171"),
                  }}
                >
                  {marketShockPct >= 0 ? "+" : ""}
                  {marketShockPct}%
                </strong>
              </div>
              <input
                type="range"
                min="-30"
                max="30"
                step="1"
                value={marketShockPct}
                onChange={(e) => setMarketShockPct(Number(e.target.value))}
                style={{ width: "100%", cursor: "pointer", accentColor: marketShockPct >= 0 ? "#10b981" : "#ef4444" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.66rem", color: "var(--text-muted)" }}>
                <span>-30% (Crash)</span>
                <span>0% (Neutral)</span>
                <span>+30% (Boom)</span>
              </div>
            </div>

            {/* Slider 2: Tipo de Cambio TRM */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>💱 TRM Proyectada (USD / COP):</span>
                <strong className="mono" style={{ color: isLight ? "#0284c7" : "#00e5ff" }}>
                  ${simulatedFxRate.toLocaleString("es-CO")} COP
                </strong>
              </div>
              <input
                type="range"
                min="3500"
                max="5000"
                step="25"
                value={simulatedFxRate}
                onChange={(e) => setSimulatedFxRate(Number(e.target.value))}
                style={{ width: "100%", cursor: "pointer", accentColor: "#00e5ff" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.66rem", color: "var(--text-muted)" }}>
                <span>$3.500</span>
                <span>Actual: ${Math.round(fxRate).toLocaleString("es-CO")}</span>
                <span>$5.000</span>
              </div>
            </div>
          </div>

          {/* Results Impact Dashboard */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {/* Impact in USD */}
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: stressResults.deltaUSD >= 0 ? "rgba(16, 185, 129, 0.05)" : "rgba(239, 68, 68, 0.05)",
                border: `1px solid ${stressResults.deltaUSD >= 0 ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
              }}
            >
              <div style={{ fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)" }}>
                Impacto en Dólares (USD)
              </div>
              <div
                className="mono"
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: stressResults.deltaUSD >= 0 ? (isLight ? "#16a34a" : "#4ade80") : (isLight ? "#dc2626" : "#f87171"),
                  margin: "4px 0 2px 0",
                }}
              >
                ${stressResults.projectedValUSD.toFixed(2)} USD
              </div>
              <div style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                Variación:{" "}
                <strong style={{ color: stressResults.deltaUSD >= 0 ? "#16a34a" : "#dc2626" }}>
                  {stressResults.deltaUSD >= 0 ? "+" : ""}${stressResults.deltaUSD.toFixed(2)} USD (
                  {stressResults.portfolioShockPct >= 0 ? "+" : ""}{stressResults.portfolioShockPct.toFixed(1)}%)
                </strong>
              </div>
            </div>

            {/* Impact in COP (incorporates FX movement) */}
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: stressResults.deltaCOP >= 0 ? "rgba(2, 132, 199, 0.05)" : "rgba(225, 29, 72, 0.05)",
                border: `1px solid ${stressResults.deltaCOP >= 0 ? "rgba(2, 132, 199, 0.25)" : "rgba(225, 29, 72, 0.25)"}`,
              }}
            >
              <div style={{ fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)" }}>
                Valor al Cambio (COP)
              </div>
              <div
                className="mono"
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: stressResults.deltaCOP >= 0 ? (isLight ? "#0284c7" : "#38bdf8") : (isLight ? "#be123c" : "#fb7185"),
                  margin: "4px 0 2px 0",
                }}
              >
                ${Math.round(stressResults.projectedValCOP).toLocaleString("es-CO")} COP
              </div>
              <div style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                Efecto Neto COP:{" "}
                <strong style={{ color: stressResults.deltaCOP >= 0 ? (isLight ? "#0284c7" : "#38bdf8") : "#dc2626" }}>
                  {stressResults.deltaCOP >= 0 ? "+" : ""}${Math.round(stressResults.deltaCOP).toLocaleString("es-CO")} (
                  {stressResults.netReturnPctCOP >= 0 ? "+" : ""}{stressResults.netReturnPctCOP.toFixed(1)}%)
                </strong>
              </div>
            </div>

            {/* Beta Exposure & Defense */}
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.04)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.68rem", textTransform: "uppercase", fontWeight: 700, color: "var(--text-muted)" }}>
                Beta del Portafolio & Cobertura
              </div>
              <div className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", margin: "4px 0 2px 0" }}>
                {effectiveBeta.toFixed(2)}x vs S&P
              </div>
              <div style={{ fontSize: "0.72rem", color: isLight ? "#475569" : "#94a3b8" }}>
                {effectiveBeta > 1.2
                  ? "Alta volatilidad tecnológica (amplifica movimientos)"
                  : effectiveBeta >= 0.8
                  ? "Comportamiento muy alineado al mercado general"
                  : "Perfil defensivo (baja sensibilidad a caídas)"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── VISTA 2: CONO MONTE CARLO ESTADÍSTICO TRADICIONAL ───────── */}
      {activeTab === "cone" && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "10px",
              marginBottom: "14px",
            }}
          >
            {/* Bull Scenario */}
            <div
              style={{
                background: "rgba(16, 185, 129, 0.05)",
                padding: "12px",
                borderRadius: "var(--radius)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              <div style={{ fontSize: "0.68rem", color: "var(--gain)", textTransform: "uppercase", fontWeight: 700 }}>
                Escenario Alcista (95%)
              </div>
              <div className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--gain)", marginTop: 2 }}>
                ${targetBull.toFixed(2)}
              </div>
              <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
                +{(((targetBull - baseVal) / baseVal) * 100).toFixed(1)}% en 90 días
              </div>
            </div>

            {/* Median */}
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.68rem", color: "var(--accent-primary)", textTransform: "uppercase", fontWeight: 700 }}>
                Mediana Estadística (50%)
              </div>
              <div className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--accent-primary)", marginTop: 2 }}>
                ${targetMedian.toFixed(2)}
              </div>
              <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
                Trayectoria central esperada
              </div>
            </div>

            {/* Bear */}
            <div
              style={{
                background: "rgba(239, 68, 68, 0.05)",
                padding: "12px",
                borderRadius: "var(--radius)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              <div style={{ fontSize: "0.68rem", color: "var(--loss)", textTransform: "uppercase", fontWeight: 700 }}>
                Escenario Bajista (5%)
              </div>
              <div className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--loss)", marginTop: 2 }}>
                ${targetBear.toFixed(2)}
              </div>
              <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
                {(((targetBear - baseVal) / baseVal) * 100).toFixed(1)}% con soporte en cash
              </div>
            </div>
          </div>

          {currentScenario && (
            <div
              style={{
                background: "var(--bg-surface)",
                padding: "12px 16px",
                borderRadius: "var(--radius)",
                border: `1px solid ${currentScenario.color}44`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.78rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)" }}>Prueba de Estrés Activa:</span>
                <strong style={{ color: currentScenario.color, marginLeft: 6 }}>
                  {currentScenario.name} ({currentScenario.impact_pct > 0 ? "+" : ""}
                  {currentScenario.impact_pct}%)
                </strong>
                <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: 2 }}>
                  Probabilidad: {currentScenario.prob}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Valor Proyectado</span>
                <div className="mono" style={{ fontSize: "1.1rem", fontWeight: 800, color: currentScenario.color }}>
                  ${currentScenario.projected_value.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
