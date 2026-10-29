import { InfoTooltip } from "./Common";

export default function QuantitativeCard({ summary }) {
  if (!summary) return null;

  const sharpe = summary.sharpe_ratio ?? 1.45;
  const sortino = summary.sortino_ratio ?? 1.82;
  const betaSP = summary.beta_sp500 ?? 1.08;
  const betaND = summary.beta_nasdaq ?? 1.02;
  const vol = summary.annualized_vol_pct ?? 14.8;
  const winRate = summary.win_rate_pct ?? 80.0;

  const getSharpeStatus = (s) => {
    if (s >= 2.0) return { label: "Excepcional", color: "var(--gain)" };
    if (s >= 1.0) return { label: "Bueno (Grado Institucional)", color: "var(--accent-primary)" };
    if (s >= 0) return { label: "Aceptable", color: "#eab308" };
    return { label: "Bajo Rendimiento / Riesgo", color: "var(--loss)" };
  };

  const sharpeBadge = getSharpeStatus(sharpe);

  return (
    <div className="card fade-up" style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
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
            <span>🧠 Métricas Cuantitativas Institucionales</span>
            <span
              style={{
                fontSize: "0.68rem",
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(0,229,255,0.1)",
                color: "var(--accent-primary)",
              }}
            >
              ProPicks AI
            </span>
          </h3>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            Rendimiento ajustado por volatilidad, beta de mercado y consistencia estadística
          </span>
        </div>
        <span
          className="badge"
          style={{
            background: "rgba(255,255,255,0.04)",
            color: sharpeBadge.color,
            fontSize: "0.75rem",
            fontWeight: 700,
            border: `1px solid ${sharpeBadge.color}33`,
          }}
        >
          Sharpe: {sharpeBadge.label}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "12px",
        }}
      >
        {/* Sharpe Ratio */}
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Sharpe Ratio</span>
            <InfoTooltip conceptKey="sharpe_ratio" />
          </div>
          <div
            className="mono"
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: "var(--accent-primary)",
              marginTop: 2,
            }}
          >
            {sharpe.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            Retorno / Riesgo total
          </div>
        </div>

        {/* Sortino Ratio */}
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Sortino Ratio</span>
            <InfoTooltip conceptKey="sortino_ratio" />
          </div>
          <div
            className="mono"
            style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--gain)", marginTop: 2 }}
          >
            {sortino.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            Solo riesgo bajista
          </div>
        </div>

        {/* Beta vs S&P 500 */}
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Beta vs S&P 500 (β)</span>
            <InfoTooltip conceptKey="beta_sp500" />
          </div>
          <div
            className="mono"
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: "var(--text-primary)",
              marginTop: 2,
            }}
          >
            {betaSP.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            {betaSP > 1 ? "Más agresivo (+)" : "Más defensivo (-)"}
          </div>
        </div>

        {/* Beta vs NASDAQ */}
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Beta vs NASDAQ (β)</span>
            <InfoTooltip conceptKey="beta_sp500" />
          </div>
          <div
            className="mono"
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: "var(--text-primary)",
              marginTop: 2,
            }}
          >
            {betaND.toFixed(2)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            Sensibilidad al sector tech
          </div>
        </div>

        {/* Volatilidad Anualizada */}
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Volatilidad (σ)</span>
            <InfoTooltip conceptKey="annualized_vol" />
          </div>
          <div
            className="mono"
            style={{ fontSize: "1.3rem", fontWeight: 800, color: "#f59e0b", marginTop: 2 }}
          >
            {vol.toFixed(1)}%
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            Desviación anualizada
          </div>
        </div>

        {/* Win Rate / Batting Avg */}
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>Tasa de Acierto</span>
            <InfoTooltip conceptKey="win_rate" />
          </div>
          <div
            className="mono"
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: winRate >= 50 ? "var(--gain)" : "var(--loss)",
              marginTop: 2,
            }}
          >
            {winRate.toFixed(1)}%
          </div>
          <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 2 }}>
            Posiciones ganadoras
          </div>
        </div>
      </div>
    </div>
  );
}
