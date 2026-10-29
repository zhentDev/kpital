import { useState } from "react";
import { InfoTooltip } from "./Common";

export default function MonteCarloCard({ monteCarlo, activeInvested }) {
  if (!monteCarlo) return null;

  const [selectedScenario, setSelectedScenario] = useState("ai_rally");
  const scenarios = monteCarlo.scenarios || {};
  const currentScenario = scenarios[selectedScenario];

  const days = monteCarlo.days || [0, 15, 30, 45, 60, 90];
  const median = monteCarlo.median || [];
  const bull = monteCarlo.bull_95 || [];
  const bear = monteCarlo.bear_5 || [];

  const baseVal = median[0] || activeInvested || 666.67;
  const targetMedian = median[median.length - 1] || baseVal;
  const targetBull = bull[bull.length - 1] || baseVal * 1.15;
  const targetBear = bear[bear.length - 1] || baseVal * 0.9;

  return (
    <div className="card fade-up" style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: "1rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🎲 Simulación Monte Carlo & Stress Testing</span>
            <span
              style={{
                fontSize: "0.68rem",
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(0,229,255,0.1)",
                color: "var(--accent-primary)",
              }}
            >
              90 Días
            </span>
            <InfoTooltip conceptKey="monte_carlo" />
          </h3>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            Cono de probabilidad estadística al 95% de confianza sobre capital activo
          </span>
        </div>

        {/* Scenario preset buttons */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className={`btn-chip ${selectedScenario === "ai_rally" ? "active" : ""}`}
            onClick={() => setSelectedScenario("ai_rally")}
            style={{ fontSize: "0.72rem" }}
          >
            🚀 Rally IA
          </button>
          <button
            className={`btn-chip ${selectedScenario === "sideways" ? "active" : ""}`}
            onClick={() => setSelectedScenario("sideways")}
            style={{ fontSize: "0.72rem" }}
          >
            🛡️ Lateral
          </button>
          <button
            className={`btn-chip ${selectedScenario === "rate_shock" ? "active" : ""}`}
            onClick={() => setSelectedScenario("rate_shock")}
            style={{ fontSize: "0.72rem" }}
          >
            📉 Shock
          </button>
        </div>
      </div>

      {/* Probability Cone Visualizer */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        {/* Bull Scenario (95th percentile) */}
        <div
          style={{
            background: "rgba(16, 185, 129, 0.05)",
            padding: "12px",
            borderRadius: "var(--radius)",
            border: "1px solid rgba(16, 185, 129, 0.2)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--gain)",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Escenario Alcista (95%)
          </div>
          <div
            className="mono"
            style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--gain)", marginTop: 2 }}
          >
            ${targetBull.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            +{(((targetBull - baseVal) / baseVal) * 100).toFixed(1)}% en 90 días
          </div>
        </div>

        {/* Median Expected Path */}
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--accent-primary)",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Mediana Estadística (50%)
          </div>
          <div
            className="mono"
            style={{
              fontSize: "1.25rem",
              fontWeight: 800,
              color: "var(--accent-primary)",
              marginTop: 2,
            }}
          >
            ${targetMedian.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            Trayectoria central esperada
          </div>
        </div>

        {/* Bear Scenario (5th percentile) */}
        <div
          style={{
            background: "rgba(239, 68, 68, 0.05)",
            padding: "12px",
            borderRadius: "var(--radius)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--loss)",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Escenario Bajista (5%)
          </div>
          <div
            className="mono"
            style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--loss)", marginTop: 2 }}
          >
            ${targetBear.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            {(((targetBear - baseVal) / baseVal) * 100).toFixed(1)}% con soporte en cash
          </div>
        </div>
      </div>

      {/* Active Stress Test Scenario Detail Card */}
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
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
              Valor Proyectado
            </span>
            <div
              className="mono"
              style={{ fontSize: "1.1rem", fontWeight: 800, color: currentScenario.color }}
            >
              ${currentScenario.projected_value.toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
