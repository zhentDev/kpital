import { useEffect, useMemo, useState } from "react";
import { fetchColInflationHistory } from "../api/client";
import { useTheme } from "../context/ThemeContext";

export default function InflationExplorerModal({ isOpen, onClose, inflationData, startDate }) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  // Por defecto, mostrar únicamente desde que comenzó a invertir/ahorrar (aprox. 2024 o fecha recibida)
  const defaultCutoff = startDate ? startDate.slice(0, 7) : "2024-01";
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [filterYear, setFilterYear] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [internalData, setInternalData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      isOpen &&
      (!inflationData || !inflationData.monthly_rates || inflationData.monthly_rates.length === 0)
    ) {
      if (!internalData) {
        setLoading(true);
        fetchColInflationHistory()
          .then((res) => setInternalData(res))
          .catch(console.error)
          .finally(() => setLoading(false));
      }
    }
  }, [isOpen, inflationData, internalData]);

  const activeData = (inflationData?.monthly_rates?.length ? inflationData : internalData) || {};
  const monthlyRates = activeData?.monthly_rates || [];
  const latest = activeData?.latest || {};

  const visibleBaseRates = useMemo(() => {
    if (showFullHistory) return monthlyRates;
    return monthlyRates.filter((r) => !r.date || r.date.slice(0, 7) >= defaultCutoff);
  }, [monthlyRates, showFullHistory, defaultCutoff]);

  const years = useMemo(() => {
    const ySet = new Set();
    visibleBaseRates.forEach((r) => {
      if (r.date) ySet.add(r.date.slice(0, 4));
    });
    return ["ALL", ...Array.from(ySet).sort().reverse()];
  }, [visibleBaseRates]);

  const filteredRates = useMemo(() => {
    return visibleBaseRates.filter((r) => {
      const matchYear = filterYear === "ALL" || r.date.startsWith(filterYear);
      const matchSearch = !searchTerm || r.date.includes(searchTerm);
      return matchYear && matchSearch;
    });
  }, [visibleBaseRates, filterYear, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay-responsive"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: isLight ? "rgba(15, 23, 42, 0.45)" : "rgba(0,0,0,0.85)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card fade-up modal-sheet-responsive"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: isLight ? "#ffffff" : "#131b2e",
          border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 16,
          padding: 0,
          overflow: "hidden",
          boxShadow: isLight
            ? "0 20px 45px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)"
            : "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        <div className="modal-drag-handle" />
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255,255,255,0.08)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: isLight ? "#f8fafc" : "transparent",
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                color: isLight ? "#0f172a" : "#f1f5f9",
                fontSize: "1.2rem",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              🇨🇴 Historial de Inflación e IPC de Colombia
            </h3>
            <span style={{ fontSize: "0.78rem", color: isLight ? "#64748b" : "var(--text-muted)" }}>
              Fuente oficial: DANE / Reserva Federal (FRED Series: COLCPALTT01IXOBM)
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255,255,255,0.06)",
              border: "none",
              color: isLight ? "#475569" : "#94a3b8",
              borderRadius: "50%",
              width: 32,
              height: 32,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.95rem",
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Latest KPI Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            padding: "16px 24px",
            background: isLight ? "#f1f5f9" : "rgba(0,0,0,0.25)",
            borderBottom: `1px solid ${isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255,255,255,0.06)"}`,
          }}
        >
          {/* Card 1: Inflación Interanual */}
          <div
            style={{
              padding: "12px 16px",
              background: isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255,255,255,0.05)"}`,
              boxShadow: isLight ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                color: isLight ? "#64748b" : "var(--text-muted)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Inflación Interanual (12M)
            </div>
            <div
              className="mono"
              style={{
                fontSize: "1.35rem",
                fontWeight: 800,
                color: isLight ? "#d97706" : "#f59e0b",
                marginTop: 4,
              }}
            >
              {latest.yoy != null ? `${latest.yoy}%` : "N/A"}
            </div>
            <div style={{ fontSize: "0.7rem", color: isLight ? "#64748b" : "var(--text-muted)", marginTop: 2 }}>
              Tasa Anualizada Último Mes
            </div>
          </div>

          {/* Card 2: Variación Mensual */}
          <div
            style={{
              padding: "12px 16px",
              background: isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255,255,255,0.05)"}`,
              boxShadow: isLight ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                color: isLight ? "#64748b" : "var(--text-muted)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Variación Mensual (MoM)
            </div>
            <div
              className="mono"
              style={{
                fontSize: "1.35rem",
                fontWeight: 800,
                color: (latest.mom ?? 0) >= 0 ? (isLight ? "#0284c7" : "#38bdf8") : (isLight ? "#059669" : "#4ade80"),
                marginTop: 4,
              }}
            >
              {latest.mom != null ? `${latest.mom > 0 ? "+" : ""}${latest.mom}%` : "N/A"}
            </div>
            <div style={{ fontSize: "0.7rem", color: isLight ? "#64748b" : "var(--text-muted)", marginTop: 2 }}>
              Mes contra mes anterior
            </div>
          </div>

          {/* Card 3: Último Índice IPC */}
          <div
            style={{
              padding: "12px 16px",
              background: isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
              borderRadius: 10,
              border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255,255,255,0.05)"}`,
              boxShadow: isLight ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                color: isLight ? "#64748b" : "var(--text-muted)",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Último Índice IPC
            </div>
            <div
              className="mono"
              style={{
                fontSize: "1.35rem",
                fontWeight: 800,
                color: isLight ? "#0f172a" : "#f1f5f9",
                marginTop: 4,
              }}
            >
              {latest.cpi != null ? Number(latest.cpi).toFixed(2) : "N/A"}
            </div>
            <div style={{ fontSize: "0.7rem", color: isLight ? "#64748b" : "var(--text-muted)", marginTop: 2 }}>
              Período: {latest.date || "Reciente"}
            </div>
          </div>
        </div>

        {/* Filters and Navigation */}
        <div
          style={{
            padding: "12px 24px",
            display: "flex",
            gap: 12,
            alignItems: "center",
            borderBottom: `1px solid ${isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255,255,255,0.06)"}`,
            background: isLight ? "#fafbfc" : "transparent",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.8rem", color: isLight ? "#334155" : "var(--text-secondary)", fontWeight: 600 }}>
              Filtrar Año:
            </span>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="input"
              style={{
                padding: "4px 10px",
                fontSize: "0.82rem",
                height: 32,
                background: isLight ? "#ffffff" : "var(--bg-surface)",
                color: isLight ? "#0f172a" : "var(--text-primary)",
                border: `1px solid ${isLight ? "rgba(0,0,0,0.15)" : "var(--border)"}`,
                borderRadius: 6,
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y === "ALL" ? "Todos los Años" : y}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            placeholder="Buscar fecha (ej. 2024-05)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            style={{
              flex: 1,
              padding: "4px 12px",
              fontSize: "0.82rem",
              height: 32,
              background: isLight ? "#ffffff" : "var(--bg-surface)",
              color: isLight ? "#0f172a" : "var(--text-primary)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.15)" : "var(--border)"}`,
              borderRadius: 6,
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => setShowFullHistory(!showFullHistory)}
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 6,
                border: isLight ? "1px solid rgba(0,0,0,0.15)" : "1px solid rgba(255,255,255,0.15)",
                background: showFullHistory
                  ? (isLight ? "#e0e7ff" : "rgba(99, 102, 241, 0.25)")
                  : (isLight ? "#f1f5f9" : "rgba(255,255,255,0.06)"),
                color: showFullHistory
                  ? (isLight ? "#4338ca" : "#818cf8")
                  : (isLight ? "#475569" : "#94a3b8"),
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
              title={showFullHistory ? "Hacer clic para ver solo desde que comenzaste a invertir" : "Hacer clic para ver todas las décadas"}
            >
              {showFullHistory ? "📜 Histórico Completo" : `🌱 Desde tu inicio (${defaultCutoff})`}
            </button>
            <span style={{ fontSize: "0.75rem", color: isLight ? "#64748b" : "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
              ({filteredRates.length} meses)
            </span>
          </div>
        </div>

        {/* Explanation & Formula Banner */}
        <div
          style={{
            padding: "10px 24px",
            background: isLight ? "rgba(245, 158, 11, 0.10)" : "rgba(245, 158, 11, 0.05)",
            borderBottom: `1px solid ${isLight ? "rgba(245, 158, 11, 0.25)" : "rgba(245, 158, 11, 0.15)"}`,
            fontSize: "0.78rem",
            color: isLight ? "#92400e" : "#fde68a",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>📐</span>
          <div>
            <strong>Fórmula de Descuento:</strong>{" "}
            <code
              style={{
                color: isLight ? "#0f172a" : "#fff",
                background: isLight ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${isLight ? "rgba(0,0,0,0.1)" : "transparent"}`,
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              Factor = IPC_Actual ÷ IPC_Compra
            </code>{" "}
            ➔{" "}
            <code
              style={{
                color: isLight ? "#0f172a" : "#fff",
                background: isLight ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${isLight ? "rgba(0,0,0,0.1)" : "transparent"}`,
                padding: "2px 6px",
                borderRadius: 4,
                fontWeight: 600,
              }}
            >
              Ganancia Real = (Valor COP ÷ Factor) - Inversión COP
            </code>
            .
          </div>
        </div>

        {/* Scrollable Table */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 24px 16px 24px",
            minHeight: 260,
            background: isLight ? "#ffffff" : "transparent",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: 260,
                gap: 12,
                color: isLight ? "#64748b" : "var(--text-muted)",
              }}
            >
              <div className="spinner" />
              <span>Cargando serie histórica de inflación (FRED/DANE)...</span>
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.82rem",
                textAlign: "left",
                marginTop: 12,
              }}
            >
              <thead>
                <tr
                  style={{
                    color: isLight ? "#64748b" : "var(--text-muted)",
                    borderBottom: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255,255,255,0.08)"}`,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                  }}
                >
                  <th style={{ padding: "8px 12px" }}>Período (Mes)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Índice IPC</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Var. Mensual (MoM)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Var. Anual (YoY)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRates.map((r, idx) => (
                  <tr
                    key={r.date}
                    style={{
                      borderBottom: `1px solid ${isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255,255,255,0.03)"}`,
                      background:
                        idx % 2 === 0
                          ? "transparent"
                          : isLight
                            ? "rgba(0, 0, 0, 0.015)"
                            : "rgba(255,255,255,0.01)",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 12px",
                        fontWeight: 600,
                        color: isLight ? "#0f172a" : "#f1f5f9",
                      }}
                    >
                      📅 {r.date}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        color: isLight ? "#475569" : "#94a3b8",
                        fontWeight: 600,
                      }}
                    >
                      {r.cpi.toFixed(2)}
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontWeight: 600,
                        color:
                          r.mom >= 0
                            ? isLight
                              ? "#0284c7"
                              : "#38bdf8"
                            : isLight
                              ? "#059669"
                              : "#4ade80",
                      }}
                    >
                      {r.mom > 0 ? "+" : ""}
                      {r.mom}%
                    </td>
                    <td
                      className="mono"
                      style={{
                        padding: "8px 12px",
                        textAlign: "right",
                        fontWeight: 700,
                        color:
                          r.yoy > 0
                            ? isLight
                              ? "#d97706"
                              : "#f59e0b"
                            : isLight
                              ? "#475569"
                              : "#94a3b8",
                      }}
                    >
                      {r.yoy > 0 ? "+" : ""}
                      {r.yoy}%
                    </td>
                  </tr>
                ))}
                {filteredRates.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: 24,
                        textAlign: "center",
                        color: isLight ? "#64748b" : "var(--text-muted)",
                      }}
                    >
                      No se encontraron registros para el filtro seleccionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255,255,255,0.08)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: isLight ? "#f8fafc" : "rgba(0,0,0,0.2)",
          }}
        >
          <span style={{ fontSize: "0.74rem", color: isLight ? "#64748b" : "var(--text-muted)" }}>
            💡 Este índice se cruza automáticamente con la fecha de tus lotes para descontar la
            pérdida de poder adquisitivo.
          </span>
          <button
            onClick={onClose}
            className="btn btn-primary"
            style={{ padding: "6px 18px", fontSize: "0.82rem", fontWeight: 700 }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
