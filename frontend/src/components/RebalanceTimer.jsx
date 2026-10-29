export default function RebalanceTimer({ rebalances, holdings }) {
  const lastRebalance =
    rebalances && rebalances.length > 0 ? rebalances[rebalances.length - 1] : null;
  const lastDateStr = lastRebalance?.date || "2026-08-03";

  // Calculate elapsed days
  const lastDate = new Date(lastDateStr);
  const now = new Date();
  const diffTime = Math.abs(now - lastDate);
  const daysElapsed = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const CADENCE_DAYS = 30; // ProPicks AI monthly cadence
  const daysRemaining = Math.max(0, CADENCE_DAYS - (daysElapsed % CADENCE_DAYS));
  const progressPct = Math.min(
    100,
    Math.round(((CADENCE_DAYS - daysRemaining) / CADENCE_DAYS) * 100),
  );

  const getStatus = (rem) => {
    if (rem <= 3) return { label: "Rebalanceo Sugerido", color: "#ef4444", dot: "pulse-red" };
    if (rem <= 10)
      return { label: "Próximo Rebalanceo en Breve", color: "#f59e0b", dot: "pulse-amber" };
    return { label: "En Periodo de Acumulación Activa", color: "var(--gain)", dot: "pulse-green" };
  };

  const status = getStatus(daysRemaining);

  return (
    <div className="card fade-up" style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
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
              gap: 8,
            }}
          >
            <span>⏳ Temporizador de Rebalanceo ProPicks</span>
            <span
              style={{
                fontSize: "0.68rem",
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(255,255,255,0.06)",
                color: "var(--text-secondary)",
              }}
            >
              Cadencia 30 Días
            </span>
          </h3>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            Último rebalanceo registrado:{" "}
            <strong style={{ color: "var(--text-primary)" }}>{lastDateStr}</strong> ({daysElapsed}{" "}
            días transcurridos)
          </span>
        </div>

        <span
          className="badge"
          style={{
            background: "rgba(255,255,255,0.04)",
            color: status.color,
            fontSize: "0.75rem",
            fontWeight: 700,
            border: `1px solid ${status.color}33`,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: status.color,
              display: "inline-block",
            }}
          />
          {status.label}
        </span>
      </div>

      {/* Progress to next rebalance */}
      <div style={{ marginBottom: "14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.72rem",
            color: "var(--text-muted)",
            marginBottom: 6,
          }}
        >
          <span>Progreso del ciclo mensual</span>
          <span className="mono" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {daysRemaining === 0
              ? "¡Rebalanceo hoy!"
              : `${daysRemaining} días restantes para el próximo ajuste`}
          </span>
        </div>
        <div
          style={{
            height: "8px",
            borderRadius: "6px",
            background: "rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: `linear-gradient(90deg, var(--accent-primary) 0%, ${status.color} 100%)`,
              borderRadius: "6px",
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      {/* Guidelines strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "10px",
          background: "var(--bg-surface)",
          padding: "12px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          fontSize: "0.74rem",
        }}
      >
        <div>
          <span style={{ color: "var(--text-muted)" }}>Estrategia:</span>
          <div style={{ fontWeight: 600, color: "var(--accent-primary)", marginTop: 2 }}>
            Kpital Tecnológicos
          </div>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Regla de Ponderación:</span>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
            Equiponderado (1/15 por slot)
          </div>
        </div>
        <div>
          <span style={{ color: "var(--text-muted)" }}>Acción sugerida:</span>
          <div style={{ fontWeight: 600, color: status.color, marginTop: 2 }}>
            {daysRemaining > 5 ? "Mantener posiciones abiertas" : "Revisar rankings ProPicks AI"}
          </div>
        </div>
      </div>
    </div>
  );
}
