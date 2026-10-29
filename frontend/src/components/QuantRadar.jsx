import { InfoTooltip } from "./Common";

export default function QuantRadar({ radar }) {
  if (!radar || !radar.length) return null;

  const width = 300;
  const height = 260;
  const cx = width / 2;
  const cy = height / 2 + 5;
  const radius = 90;
  const numAxes = radar.length;

  // Compute polygon points for portfolio and benchmark
  const getCoordinates = (val, i) => {
    const angle = ((Math.PI * 2) / numAxes) * i - Math.PI / 2;
    const r = (val / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const polyPoints = radar
    .map((item, i) => {
      const coord = getCoordinates(item.score, i);
      return `${coord.x},${coord.y}`;
    })
    .join(" ");

  const benchPoints = radar
    .map((item, i) => {
      const coord = getCoordinates(item.benchmark, i);
      return `${coord.x},${coord.y}`;
    })
    .join(" ");

  return (
    <div className="card fade-up" style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
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
            <span>🕸️ Radar Cuantitativo 360°</span>
            <InfoTooltip conceptKey="quant_radar" />
          </h3>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            Evaluación multidimensional de factores cuantitativos
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: "0.72rem" }}>
          <span style={{ color: "var(--accent-primary)", fontWeight: 700 }}>● Kpital</span>
          <span style={{ color: "#94a3b8", fontWeight: 600 }}>┄ Benchmark</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Background web rings */}
          {[0.25, 0.5, 0.75, 1.0].map((ring) => (
            <circle
              key={ring}
              cx={cx}
              cy={cy}
              r={radius * ring}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray={ring === 1.0 ? "none" : "2 3"}
            />
          ))}

          {/* Axes lines and labels */}
          {radar.map((item, i) => {
            const edge = getCoordinates(100, i);
            const labelCoord = getCoordinates(118, i);
            return (
              <g key={item.factor}>
                <line x1={cx} y1={cy} x2={edge.x} y2={edge.y} stroke="rgba(255,255,255,0.08)" />
                <text
                  x={labelCoord.x}
                  y={labelCoord.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#94a3b8"
                  fontSize="9.5"
                  fontFamily="'JetBrains Mono', monospace"
                  fontWeight="600"
                >
                  {item.factor}
                </text>
              </g>
            );
          })}

          {/* Benchmark polygon */}
          <polygon
            points={benchPoints}
            fill="none"
            stroke="#64748b"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />

          {/* Portfolio polygon */}
          <polygon
            points={polyPoints}
            fill="rgba(0, 229, 255, 0.25)"
            stroke="var(--accent-primary)"
            strokeWidth="2.5"
          />

          {/* Value nodes */}
          {radar.map((item, i) => {
            const coord = getCoordinates(item.score, i);
            return (
              <circle
                key={item.factor}
                cx={coord.x}
                cy={coord.y}
                r="4.5"
                fill="var(--accent-primary)"
                stroke="#000"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
      </div>

      {/* Factor pills */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "6px",
          marginTop: "10px",
        }}
      >
        {radar.map((item) => (
          <div
            key={item.factor}
            style={{
              background: "var(--bg-surface)",
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.72rem",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>{item.factor.slice(0, 14)}:</span>
            <strong className="mono" style={{ color: "var(--accent-primary)" }}>
              {item.score}/100
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
