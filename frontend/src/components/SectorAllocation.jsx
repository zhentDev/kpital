import { InfoTooltip } from "./Common";

export default function SectorAllocation({ holdings, investment, numSlots }) {
  if (!holdings || holdings.length === 0) return null;

  const activeHoldings = holdings.filter((h) => h.selected !== false);
  const totalActiveValue = activeHoldings.reduce((sum, h) => sum + (h.current_value || 0), 0);
  const slotValue = investment / numSlots;
  const cashReserved = slotValue * (numSlots - activeHoldings.length);
  const totalFundValue = totalActiveValue + cashReserved;

  // Group by sector
  const sectorMap = {};
  activeHoldings.forEach((h) => {
    const s = h.sector || "Tecnología";
    if (!sectorMap[s]) sectorMap[s] = { name: s, value: 0, tickers: [] };
    sectorMap[s].value += h.current_value || 0;
    sectorMap[s].tickers.push(h.ticker);
  });

  const sectors = Object.values(sectorMap).sort((a, b) => b.value - a.value);

  const SECTOR_COLORS = [
    "#00e5ff", // Cyan
    "#a855f7", // Purple
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#ec4899", // Pink
    "#3b82f6", // Blue
  ];

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
            <span>🍩 Exposición y Concentración Sectorial</span>
            <InfoTooltip
              customContent={{
                title: "Concentración Sectorial & Diversificación",
                tag: "Gestión de Riesgo",
                tagColor: "#a855f7",
                explanation:
                  "Muestra cómo se distribuye el capital activo entre las diferentes industrias tecnológicas (Semiconductores, Software, Nube, Ciberseguridad) y la proporción restante en liquidez de slots no asignados.",
                rule:
                  "Evita que la cartera dependa excesivamente del desempeño de un único subsector en caso de rotaciones agresivas de mercado.",
              }}
            />
          </h3>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            Distribución del capital activo entre industrias tecnológicas y liquidez
          </span>
        </div>
        <span
          className="badge"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "var(--text-secondary)",
            fontSize: "0.75rem",
          }}
        >
          {sectors.length} Sectores · {activeHoldings.length} Acciones
        </span>
      </div>

      {/* Multi-color Allocation Progress Bar */}
      <div
        style={{
          display: "flex",
          height: "14px",
          borderRadius: "8px",
          overflow: "hidden",
          background: "rgba(255,255,255,0.05)",
          marginBottom: "16px",
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
        }}
      >
        {sectors.map((sec, idx) => {
          const pct = totalFundValue > 0 ? (sec.value / totalFundValue) * 100 : 0;
          const color = SECTOR_COLORS[idx % SECTOR_COLORS.length];
          return (
            <div
              key={sec.name}
              style={{
                width: `${pct}%`,
                background: color,
                transition: "width 0.4s ease",
              }}
              title={`${sec.name}: $${sec.value.toFixed(2)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
        {cashReserved > 0 && (
          <div
            style={{
              width: `${(cashReserved / totalFundValue) * 100}%`,
              background: "rgba(255,255,255,0.15)",
              borderLeft: "1px solid rgba(0,0,0,0.3)",
            }}
            title={`Cash Reservado Q: $${cashReserved.toFixed(2)} (${((cashReserved / totalFundValue) * 100).toFixed(1)}%)`}
          />
        )}
      </div>

      {/* Sector Pills Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "10px",
        }}
      >
        {sectors.map((sec, idx) => {
          const pctOfActive = totalActiveValue > 0 ? (sec.value / totalActiveValue) * 100 : 0;
          const color = SECTOR_COLORS[idx % SECTOR_COLORS.length];
          return (
            <div
              key={sec.name}
              style={{
                background: "var(--bg-surface)",
                padding: "10px 14px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: color,
                    display: "inline-block",
                    boxShadow: `0 0 6px ${color}66`,
                  }}
                />
                <div>
                  <div
                    style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}
                  >
                    {sec.name}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    {sec.tickers.join(", ")}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  className="mono"
                  style={{ fontSize: "0.88rem", fontWeight: 700, color: color }}
                >
                  {pctOfActive.toFixed(1)}%
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                  ${sec.value.toFixed(2)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Cash Reserved block */}
        {cashReserved > 0 && (
          <div
            style={{
              background: "rgba(255,255,255,0.02)",
              padding: "10px 14px",
              borderRadius: "var(--radius)",
              border: "1px dashed var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: 0.75,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#64748b",
                  display: "inline-block",
                }}
              />
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)" }}>
                  Cash Reservado (Q)
                </div>
                <div style={{ fontSize: "0.68rem", color: "#64748b" }}>
                  {numSlots - activeHoldings.length} slots libres
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                className="mono"
                style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-muted)" }}
              >
                ${cashReserved.toFixed(2)}
              </div>
              <div style={{ fontSize: "0.68rem", color: "#64748b" }}>Liquidez</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
