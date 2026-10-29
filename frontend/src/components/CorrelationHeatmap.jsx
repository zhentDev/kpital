export default function CorrelationHeatmap({ correlations }) {
  if (!correlations || !correlations.tickers?.length) return null;

  const tickers = correlations.tickers;
  const matrix = correlations.matrix;
  const score = correlations.diversification_score ?? 8.5;

  const getCellColor = (val) => {
    if (val >= 0.85) return "rgba(239, 68, 68, 0.45)"; // High correlation / red
    if (val >= 0.6) return "rgba(245, 158, 11, 0.35)"; // Moderate / amber
    if (val >= 0.3) return "rgba(0, 229, 255, 0.25)"; // Low-moderate / cyan
    return "rgba(16, 185, 129, 0.35)"; // Low / emerald
  };

  return (
    <div className="card fade-up" style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
            🧩 Matriz de Correlación de Activos
          </h3>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            Grado de independencia estadística entre las posiciones del portafolio
          </span>
        </div>
        <span
          className="badge"
          style={{
            background: "rgba(16, 185, 129, 0.1)",
            color: "var(--gain)",
            fontSize: "0.75rem",
            fontWeight: 700,
            border: "1px solid rgba(16, 185, 129, 0.3)",
          }}
        >
          Diversificación: {score} / 10
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
          <thead>
            <tr>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--text-muted)" }}>
                —
              </th>
              {tickers.map((t) => (
                <th
                  key={t}
                  style={{
                    padding: "8px 10px",
                    textAlign: "center",
                    color: "var(--accent-primary)",
                    fontWeight: 700,
                  }}
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={tickers[i]} style={{ borderTop: "1px solid var(--border)" }}>
                <td
                  style={{ padding: "8px 10px", fontWeight: 700, color: "var(--accent-primary)" }}
                >
                  {tickers[i]}
                </td>
                {row.map((val, j) => {
                  const isDiag = i === j;
                  const bg = isDiag ? "var(--border)" : getCellColor(val);
                  return (
                    <td
                      key={tickers[j]}
                      style={{
                        padding: "8px 10px",
                        textAlign: "center",
                        background: bg,
                        color: isDiag ? "var(--text-muted)" : "var(--text-primary)",
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono', monospace",
                        borderRadius: "4px",
                        transition: "transform 0.15s ease",
                      }}
                      title={`Correlación ${tickers[i]} vs ${tickers[j]}: ${val.toFixed(2)}`}
                    >
                      {val.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
          fontSize: "0.68rem",
          color: "var(--text-muted)",
        }}
      >
        <span>🟢 0.0 - 0.3 (Independiente)</span>
        <span>🔵 0.3 - 0.6 (Moderado)</span>
        <span>🟡 0.6 - 0.8 (Correlacionado)</span>
        <span>🔴 0.8 - 1.0 (Muy alto)</span>
      </div>
    </div>
  );
}
