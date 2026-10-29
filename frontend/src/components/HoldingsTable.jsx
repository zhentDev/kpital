import { useState, useEffect } from "react";
import { InfoTooltip, MarketScheduleBadge } from "./Common";
import StockAlertModal from "./StockAlertModal";
import { fetchStockAlerts, saveStockAlert, deleteStockAlert } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";

export default function HoldingsTable({
  holdings = [],
  closedHoldings = [],
  summary = {},
  investment,
  numSlots,
  onToggleTicker,
  unit = "pct",
  onToggleUnit,
  isRealMoney = false,
  closedOnly = false,
  onOpenWasmLab,
  onOpenWarren,
  onExportExcel,
  onExportPyScript,
  strategyId = "historical",
  onRemoveTicker,
}) {
  const [activeTab, setActiveTab] = useState(closedOnly ? "closed" : "active"); // 'active' | 'closed'
  const [mobileViewMode, setMobileViewMode] = useState("auto"); // 'auto' | 'card' | 'table'
  const { user } = useAuthStore();
  const { theme } = useTheme();
  const isLight = theme === "light";

  // Alerts State
  const [alerts, setAlerts] = useState([]);
  const [selectedAlertHolding, setSelectedAlertHolding] = useState(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadAlerts = () => {
      fetchStockAlerts("strategy", strategyId)
        .then((data) => {
          if (isMounted && Array.isArray(data)) {
            setAlerts(data);
          }
        })
        .catch(() => {});
    };

    loadAlerts();

    const handleUpdate = () => {
      if (isMounted) loadAlerts();
    };
    window.addEventListener("stockAlertsUpdated", handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener("stockAlertsUpdated", handleUpdate);
    };
  }, [strategyId]);

  const handleOpenAlertModal = (holding, e) => {
    if (e) e.stopPropagation();
    setSelectedAlertHolding(holding);
    setIsAlertModalOpen(true);
  };

  const handleSaveAlert = async (alertPayload) => {
    try {
      const saved = await saveStockAlert(alertPayload);
      setAlerts((prev) => {
        const filtered = prev.filter((a) => a.id !== saved.id && a.ticker !== saved.ticker);
        return [...filtered, saved];
      });
      toast.success(
        `Alerta ${saved.alert_type === "STOP_LOSS" ? "Stop Loss" : "Take Profit"} guardada para ${saved.ticker}`,
        { icon: "🔔" }
      );
    } catch {
      toast.error("Error al guardar la alerta");
    }
  };

  const handleDeleteAlert = async (alertId) => {
    try {
      await deleteStockAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      toast.success("Alerta eliminada correctamente", { icon: "🗑️" });
    } catch {
      toast.error("Error al eliminar la alerta");
    }
  };

  if (closedOnly && !closedHoldings?.length) return null;
  if (!holdings?.length && !closedHoldings?.length) return null;

  const currentTab = closedOnly ? "closed" : activeTab;

  const slotValue = investment / numSlots;

  const totalRealized = Number(
    summary.total_realized_pnl ??
      closedHoldings.reduce((sum, c) => sum + Number(c.realized_pnl || 0), 0)
  );
  const winRateClosed = Number(
    summary.win_rate_closed_pct ??
      (closedHoldings.length > 0
        ? (
            (closedHoldings.filter((c) => Number(c.realized_pnl || 0) >= 0).length /
              closedHoldings.length) *
            100
          ).toFixed(1)
        : 0)
  );
  const activeReturn = Number(summary.active_return ?? 0);
  const totalStratPnl = Number(summary.total_strategy_pnl ?? activeReturn + totalRealized);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Tab Switcher: Activas vs Cerradas */}
          {closedOnly ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "10px",
                padding: "4px 10px",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#34d399",
              }}
            >
              <span>💼 Ganancias / Pérdidas en Ventas Realizadas</span>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: "rgba(16, 185, 129, 0.25)",
                  color: "#10b981",
                  fontWeight: 800,
                }}
              >
                {closedHoldings.length}
              </span>
            </div>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(0, 0, 0, 0.25)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "3px",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: currentTab === "active" ? "var(--accent-primary)" : "transparent",
                  color: currentTab === "active" ? "#000" : "var(--text-muted)",
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span>🟢 Activas</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 5px",
                    borderRadius: 10,
                    background: currentTab === "active" ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.08)",
                  }}
                >
                  {holdings.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("closed")}
                style={{
                  padding: "4px 10px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: currentTab === "closed" ? "#10b981" : "transparent",
                  color:
                    currentTab === "closed"
                      ? "#000"
                      : closedHoldings.length > 0
                      ? "#34d399"
                      : "var(--text-muted)",
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="Ver el historial y rentabilidad acumulada de las acciones que has vendido o cerrado"
              >
                <span>💼 Cerradas</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 5px",
                    borderRadius: 10,
                    background: currentTab === "closed" ? "rgba(0,0,0,0.2)" : "rgba(16,185,129,0.15)",
                    color: currentTab === "closed" ? "#000" : "#10b981",
                  }}
                >
                  {closedHoldings.length}
                </span>
              </button>
            </div>
          )}

          <InfoTooltip conceptKey="active_invested" />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Herramientas de Laboratorio / IA integradas en la tabla */}
          {onOpenWasmLab && (
            <button
              type="button"
              onClick={onOpenWasmLab}
              title="Abrir simulador WASM / Web Worker de portafolio"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: "12px",
                border: "1px solid rgba(0, 229, 255, 0.3)",
                background: "rgba(0, 229, 255, 0.08)",
                color: "#00e5ff",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span>⚡</span>
              <span>WASM Lab</span>
            </button>
          )}

          {onOpenWarren &&
            typeof window !== "undefined" &&
            (window.location.hostname === "localhost" ||
              window.location.hostname === "127.0.0.1") && (
              <button
                type="button"
                onClick={onOpenWarren}
                title="Generar análisis de cartera con WarrenAI (Solo disponible en Local)"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  borderRadius: "12px",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  background: "rgba(16, 185, 129, 0.08)",
                  color: "#34d399",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span>🤖</span>
                <span>WarrenAI</span>
              </button>
            )}

          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Unidad:</span>
          <div
            className="unit-toggle"
            onClick={onToggleUnit}
            title="Alternar entre Porcentaje y Dólares"
          >
            <button className={`unit-btn ${unit === "pct" ? "active" : ""}`}>%</button>
            <button className={`unit-btn ${unit === "usd" ? "active" : ""}`}>$</button>
          </div>

          {/* Exportadores integrados en la tabla */}
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              title="Descargar informe completo del portafolio en Excel (.xlsx) con timeline diario de todas las acciones"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: "12px",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                background: "rgba(16, 185, 129, 0.08)",
                color: "#10b981",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span>📊</span>
              <span>Excel</span>
            </button>
          )}

          {onExportPyScript && (
            <button
              type="button"
              onClick={onExportPyScript}
              title="Exportar con PyScript 2.0+ (MicroPython WASM / Polyscript en el navegador)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: "12px",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                background: "rgba(245, 158, 11, 0.08)",
                color: "#f59e0b",
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span>🐍</span>
              <span>PyScript</span>
            </button>
          )}

          {/* Selector de modo vista Móvil (Tarjetas vs Tabla) */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              background: "rgba(0, 0, 0, 0.2)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "2px",
            }}
          >
            <button
              type="button"
              onClick={() => setMobileViewMode(mobileViewMode === "card" ? "table" : "card")}
              style={{
                padding: "3px 8px",
                borderRadius: "12px",
                border: "none",
                fontSize: "0.72rem",
                fontWeight: 600,
                cursor: "pointer",
                background: mobileViewMode === "card" ? "var(--accent-primary)" : "transparent",
                color: mobileViewMode === "card" ? "#000" : "var(--text-muted)",
                transition: "all 0.15s ease",
              }}
              title="Cambiar vista entre Tabla y Tarjetas táctiles"
            >
              {mobileViewMode === "card" ? "📱 Tarjetas" : "📊 Tabla"}
            </button>
          </div>
        </div>
      </div>

      {/* ── CONDITIONAL RENDER: POSICIONES ACTIVAS VS CERRADAS ── */}
      {currentTab === "active" ? (
        mobileViewMode === "card" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          {holdings.map((h) => {
            const isSelected = h.selected !== false;
            const returnPct = h.return_pct ?? 0;
            const returnUsd = h.return_usd ?? (h.current_price - h.start_price) * (h.shares || 0);
            const isGain = (unit === "pct" ? returnPct : returnUsd) >= 0;

            return (
              <div
                key={h.ticker}
                onClick={() => onToggleTicker && onToggleTicker(h.ticker)}
                style={{
                  padding: "12px 14px",
                  background: isSelected ? "var(--bg-surface)" : "rgba(255, 255, 255, 0.02)",
                  border: `1px solid ${isSelected ? "var(--border)" : "rgba(255, 255, 255, 0.05)"}`,
                  borderLeft: `4px solid ${isSelected ? (isGain ? "var(--gain)" : "var(--loss)") : "var(--neutral)"}`,
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  cursor: "pointer",
                  opacity: isSelected ? 1 : 0.5,
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "1rem", color: isSelected ? "var(--accent-primary)" : "var(--text-muted)" }}>
                        {h.ticker}
                      </strong>
                      {h.exchange && (
                        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: 4 }}>
                          {h.exchange}
                        </span>
                      )}
                      <MarketScheduleBadge ticker={h.ticker} exchange={h.exchange} size="xs" />
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                      {h.name || h.ticker} · <span style={{ color: "var(--accent-primary)" }}>{h.sector || "Tecnología"}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => handleOpenAlertModal(h, e)}
                        title={
                          alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)
                            ? `Alerta activa: ${
                                alerts.find((a) => a.ticker === h.ticker)?.alert_type === "STOP_LOSS" ? "Stop Loss" : "Take Profit"
                              } (${alerts.find((a) => a.ticker === h.ticker)?.target_value >= 0 ? "+" : ""}${alerts.find((a) => a.ticker === h.ticker)?.target_value}%)`
                            : "Configurar alerta de venta o stop loss"
                        }
                        style={{
                          background: alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)
                            ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.2)")
                            : (isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)"),
                          border: alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)
                            ? "1px solid rgba(16, 185, 129, 0.4)"
                            : `1px solid ${isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                          borderRadius: "8px",
                          padding: "3px 7px",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          color: alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)
                            ? "#10b981"
                            : "var(--text-muted)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>🔔</span>
                        {alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at) && (
                          <span style={{ fontSize: "0.68rem", fontWeight: 700 }}>
                            {alerts.find((a) => a.ticker === h.ticker)?.target_value >= 0 ? "+" : ""}
                            {alerts.find((a) => a.ticker === h.ticker)?.target_value}%
                          </span>
                        )}
                      </button>
                    )}
                    {isSelected && onRemoveTicker && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveTicker(h.ticker);
                        }}
                        title={`Quitar ${h.ticker} de la estrategia (libera slot a Cash)`}
                        aria-label={`Quitar ${h.ticker}`}
                        style={{
                          background: isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.14)",
                          border: `1px solid ${isLight ? "rgba(239, 68, 68, 0.28)" : "rgba(239, 68, 68, 0.38)"}`,
                          borderRadius: "6px",
                          width: "26px",
                          height: "26px",
                          padding: 0,
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          color: "#ef4444",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isLight ? "rgba(239, 68, 68, 0.18)" : "rgba(239, 68, 68, 0.28)";
                          e.currentTarget.style.borderColor = "#ef4444";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.14)";
                          e.currentTarget.style.borderColor = isLight ? "rgba(239, 68, 68, 0.28)" : "rgba(239, 68, 68, 0.38)";
                        }}
                      >
                        ✕
                      </button>
                    )}
                    <span
                      className={`badge ${isGain ? "gain" : "loss"}`}
                      style={{ fontSize: "0.85rem", padding: "4px 8px" }}
                    >
                      {isGain ? "▲" : "▼"} {unit === "pct" ? `${Math.abs(returnPct).toFixed(2)}%` : `$${Math.abs(returnUsd).toFixed(2)}`}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Precio Actual</div>
                    <div className="mono" style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      ${h.current_price?.toFixed(2)}
                    </div>
                    {isSelected && (
                      <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                        <span
                          className="mono"
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            color: (h.change_pct_1d ?? 0) >= 0 ? "#10b981" : "#f43f5e",
                          }}
                        >
                          {(h.change_pct_1d ?? 0) >= 0 ? "+" : ""}{(h.change_pct_1d ?? 0).toFixed(1)}%
                        </span>
                        {Math.abs(h.change_pct_1d ?? 0) >= 3.0 && (
                          <span
                            style={{
                              fontSize: "0.58rem",
                              padding: "0 3px",
                              borderRadius: 3,
                              background: (h.change_pct_1d ?? 0) >= 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)",
                              color: (h.change_pct_1d ?? 0) >= 0 ? "#34d399" : "#fb7185",
                              fontWeight: 800,
                            }}
                          >
                            {Math.abs(h.change_pct_1d ?? 0) >= 6.0 ? "⚡" : "🔥"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Valor ({h.shares?.toFixed(2)} uds)</div>
                    <div className="mono" style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      ${h.current_value?.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                      {isRealMoney ? "Estado Real" : "Simulación"}
                    </div>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: isSelected ? "var(--gain)" : "var(--text-muted)" }}>
                      {isSelected ? (isRealMoney ? "Comprada ✓" : "Activa ✓") : "Excluida ✗"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div 
          className="holdings-table-scroll-wrapper"
          style={{ 
            overflowX: "auto", 
            minWidth: 0, 
            width: "100%", 
            WebkitOverflowScrolling: "touch",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <table 
            style={{ 
              width: "100%", 
              minWidth: "780px", 
              borderCollapse: "collapse", 
              fontSize: "0.8125rem",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[
                isRealMoney ? "Posición Real" : "Simulación",
                "Empresa / Ticker",
                "Sector",
                "Peso",
                "Acciones",
                "Precio inicio",
                "Precio actual",
                "Movimiento Hoy (24h)",
                "Valor actual",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 12px",
                    textAlign:
                      h === "Simulación" || h.startsWith("Empresa") || h === "Sector"
                        ? "left"
                        : "right",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                    ...(h.startsWith("Empresa") ? { width: "230px", minWidth: "210px", maxWidth: "250px" } : {}),
                  }}
                >
                  {h}
                </th>
              ))}
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontWeight: 500,
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  width: onRemoveTicker ? "120px" : "90px",
                  minWidth: onRemoveTicker ? "110px" : "85px",
                }}
                title={
                  onRemoveTicker
                    ? "Configura alertas de precio o retira la acción de la estrategia"
                    : "Configura alertas de Profit Target o Stop Loss con aviso por correo"
                }
              >
                {onRemoveTicker ? "🔔 Alerta / Quitar" : "🔔 Alerta"}
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  color: "var(--accent-primary)",
                  fontWeight: 600,
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
                onClick={onToggleUnit}
                title="Haz clic para alternar entre % y $"
              >
                Retorno Total ({unit === "pct" ? "%" : "$"}) ⇄
              </th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => {
              const isSelected = h.selected !== false;
              const returnPct = h.return_pct ?? 0;
              const returnUsd = h.return_usd ?? (h.current_price - h.start_price) * (h.shares || 0);
              const isGain = (unit === "pct" ? returnPct : returnUsd) >= 0;
              return (
                <tr
                  key={h.ticker}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    transition: "all var(--duration) var(--ease)",
                    animation: `fadeUp 0.3s ${i * 25}ms both`,
                    cursor: "pointer",
                    opacity: isSelected ? 1 : 0.45,
                    background: isSelected ? "transparent" : "rgba(255,255,255,0.01)",
                  }}
                  onClick={() => onToggleTicker && onToggleTicker(h.ticker)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = isSelected
                      ? "transparent"
                      : "rgba(255,255,255,0.01)")
                  }
                >
                  {/* Simulation Checkbox Toggle */}
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{
                          cursor: "pointer",
                          accentColor: "var(--accent-primary)",
                          width: 15,
                          height: 15,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.68rem",
                          color: isSelected ? "var(--gain)" : "var(--text-muted)",
                          fontWeight: 600,
                        }}
                      >
                        {isSelected ? (isRealMoney ? "Comprada" : "Activa") : "Excluida"}
                      </span>
                    </div>
                  </td>

                  {/* Ticker + Company Name */}
                  <td style={{ padding: "10px 12px", width: "230px", minWidth: "210px", maxWidth: "250px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", width: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flexShrink: 0 }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: isSelected ? "var(--accent-primary)" : "var(--text-muted)",
                              fontSize: "0.875rem",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h.ticker}
                          </span>
                          {h.exchange && (
                            <span
                              style={{
                                fontSize: "0.65rem",
                                color: "var(--text-muted)",
                                background: "rgba(255,255,255,0.05)",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h.exchange}
                            </span>
                          )}
                        </div>
                        <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center" }}>
                          <MarketScheduleBadge ticker={h.ticker} exchange={h.exchange} size="xs" />
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "200px",
                        }}
                      >
                        {h.name || h.ticker}
                      </span>
                    </div>
                  </td>

                  {/* Sector */}
                  <td style={{ padding: "10px 12px", color: "#94a3b8", fontSize: "0.75rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 7px",
                        borderRadius: "12px",
                        background: "rgba(0, 229, 255, 0.05)",
                        border: "1px solid rgba(0, 229, 255, 0.12)",
                        color: "var(--accent-primary)",
                        fontSize: "0.7rem",
                      }}
                    >
                      {h.sector || "Tecnología"}
                    </span>
                  </td>

                  {/* Weight */}
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span className="mono">
                      {isSelected
                        ? h.weight
                          ? h.weight.toFixed(2)
                          : ((1 / numSlots) * 100).toFixed(2)
                        : "0.00"}
                      %
                    </span>
                  </td>

                  {/* Shares */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <span className="mono" style={{ color: "var(--text-secondary)" }}>
                      {isSelected ? h.shares?.toFixed(4) : "—"}
                    </span>
                  </td>

                  {/* Start Price */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <span className="mono" style={{ color: "var(--text-muted)" }}>
                      {h.start_price !== undefined ? `$${h.start_price.toFixed(2)}` : "N/A"}
                    </span>
                  </td>

                  {/* Current Price */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <span
                      className="mono"
                      style={{ color: "var(--text-primary)", fontWeight: 600 }}
                    >
                      ${h.current_price?.toFixed(2)}
                    </span>
                  </td>

                  {/* Movimiento Hoy (24h) / Movimiento Brusco */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {isSelected ? (() => {
                      const chg1d = h.change_pct_1d ?? 0;
                      const chgUsd1dPerShare = h.change_usd_1d ?? 0;
                      const shares = h.shares || 0;
                      const chgUsd1dHolding = shares > 0 ? shares * chgUsd1dPerShare : chgUsd1dPerShare;
                      const isUp1d = chg1d >= 0;
                      const isAbrupt = Math.abs(chg1d) >= 3.0;
                      const isExtreme = Math.abs(chg1d) >= 6.0;

                      return (
                        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: "0.8rem",
                              fontWeight: 700,
                              color: isUp1d ? "#10b981" : "#f43f5e",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span>{isUp1d ? "+" : ""}{chg1d.toFixed(2)}%</span>
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span
                              style={{ fontSize: "0.68rem", color: "var(--text-muted)", cursor: "help" }}
                              className="mono"
                              title={`Impacto hoy en tu posición: ${chgUsd1dHolding >= 0 ? "+" : ""}$${chgUsd1dHolding.toFixed(2)} USD (${shares > 0 ? `${shares.toFixed(4)} acc × ${chgUsd1dPerShare >= 0 ? "+" : ""}$${chgUsd1dPerShare.toFixed(2)}/acc` : "1 acc"})`}
                            >
                              {chgUsd1dHolding >= 0 ? "+" : ""}${chgUsd1dHolding.toFixed(2)}
                            </span>
                            {isExtreme ? (
                              <span
                                title="Movimiento brusco extraordinario (±6%)"
                                style={{
                                  fontSize: "0.6rem",
                                  padding: "1px 4px",
                                  borderRadius: 4,
                                  background: isUp1d ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)",
                                  color: isUp1d ? "#34d399" : "#fb7185",
                                  fontWeight: 800,
                                  border: `1px solid ${isUp1d ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)"}`,
                                }}
                              >
                                ⚡ BRUSCO
                              </span>
                            ) : isAbrupt ? (
                              <span
                                title="Movimiento relevante en la sesión (±3%)"
                                style={{
                                  fontSize: "0.6rem",
                                  padding: "1px 4px",
                                  borderRadius: 4,
                                  background: isUp1d ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                                  color: isUp1d ? "#10b981" : "#f43f5e",
                                  fontWeight: 700,
                                }}
                              >
                                {isUp1d ? "🚀 SALTO" : "🔻 CAÍDA"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })() : (
                      <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>—</span>
                    )}
                  </td>

                  {/* Current Value */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <span
                      className="mono"
                      style={{
                        fontWeight: 700,
                        color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      ${isSelected ? h.current_value?.toFixed(2) : "0.00"}
                    </span>
                  </td>

                  {/* Stock Alert Bell & Remove Action */}
                  <td style={{ padding: "8px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isSelected ? (
                        <button
                          type="button"
                          onClick={(e) => handleOpenAlertModal(h, e)}
                          title={
                            alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)
                              ? `Alerta activa: ${
                                  alerts.find((a) => a.ticker === h.ticker)?.alert_type === "STOP_LOSS" ? "Stop Loss" : "Take Profit"
                                } (${alerts.find((a) => a.ticker === h.ticker)?.target_value >= 0 ? "+" : ""}${alerts.find((a) => a.ticker === h.ticker)?.target_value}%)`
                              : "Configurar alerta de venta o stop loss"
                          }
                          style={{
                            background: alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)
                              ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.2)")
                              : (isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)"),
                            border: alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)
                              ? "1px solid rgba(16, 185, 129, 0.4)"
                              : `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                            borderRadius: "6px",
                            padding: "3px 8px",
                            height: "26px",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            color: alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)
                              ? "#10b981"
                              : "var(--text-muted)",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            if (!alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)) {
                              e.currentTarget.style.borderColor = isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)";
                              e.currentTarget.style.background = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)) {
                              e.currentTarget.style.borderColor = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)";
                              e.currentTarget.style.background = isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)";
                            }
                          }}
                        >
                          <span style={{ fontSize: "0.85rem" }}>🔔</span>
                          {alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at) && (
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                              {alerts.find((a) => a.ticker === h.ticker)?.target_value >= 0 ? "+" : ""}
                              {alerts.find((a) => a.ticker === h.ticker)?.target_value}%
                            </span>
                          )}
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>—</span>
                      )}
                      {isSelected && onRemoveTicker && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveTicker(h.ticker);
                          }}
                          title={`Quitar ${h.ticker} de la estrategia (libera el slot a Cash Q)`}
                          aria-label={`Quitar ${h.ticker} de la estrategia`}
                          style={{
                            background: isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.14)",
                            border: `1px solid ${isLight ? "rgba(239, 68, 68, 0.28)" : "rgba(239, 68, 68, 0.38)"}`,
                            borderRadius: "6px",
                            width: "26px",
                            height: "26px",
                            padding: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            color: "#ef4444",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isLight ? "rgba(239, 68, 68, 0.18)" : "rgba(239, 68, 68, 0.28)";
                            e.currentTarget.style.borderColor = "#ef4444";
                            e.currentTarget.style.transform = "scale(1.06)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.14)";
                            e.currentTarget.style.borderColor = isLight ? "rgba(239, 68, 68, 0.28)" : "rgba(239, 68, 68, 0.38)";
                            e.currentTarget.style.transform = "scale(1)";
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Return % or $ */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {isSelected ? (
                      <span
                        className={`badge ${isGain ? "gain" : "loss"}`}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleUnit && onToggleUnit();
                        }}
                      >
                        {isGain ? "▲" : "▼"}{" "}
                        {unit === "pct"
                          ? `${Math.abs(returnPct).toFixed(2)}%`
                          : `$${Math.abs(returnUsd).toFixed(2)}`}
                      </span>
                    ) : (
                      <span
                        className="badge"
                        style={{ background: "rgba(107,114,128,0.15)", color: "var(--neutral)" }}
                      >
                        Excluida
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Cash row for unallocated slots */}
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                background: "rgba(255,255,255,0.015)",
              }}
            >
              <td style={{ padding: "10px 12px" }}>
                <span
                  className="badge"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8" }}
                >
                  Liquidez
                </span>
              </td>
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>
                    Q (Cash Reservado)
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                    Slots vacíos pendientes de asignar
                  </span>
                </div>
              </td>
              <td style={{ padding: "10px 12px" }}>
                <span style={{ fontSize: "0.7rem", color: "#64748b" }}>Flat Cash</span>
              </td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                <span className="mono" style={{ color: "var(--text-muted)" }}>
                  {(((numSlots - holdings.length) / numSlots) * 100).toFixed(2)}%
                </span>
              </td>
              <td
                colSpan={5}
                style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)" }}
              >
                <span className="mono" style={{ fontWeight: 600 }}>
                  ${(slotValue * (numSlots - holdings.length)).toFixed(2)}
                </span>
              </td>
              <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.7rem" }}>
                —
              </td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                <span
                  className="badge"
                  style={{ background: "rgba(107,114,128,0.15)", color: "var(--neutral)" }}
                >
                  {unit === "pct" ? "0.00%" : "$0.00"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  ) : (
    /* ── SECCIÓN DE POSICIONES CERRADAS / REALIZADAS ── */
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          {/* Banner de Ganancia Realizada Acumulada */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "center",
              justifyContent: "space-between",
              background: totalRealized >= 0 ? "rgba(16, 185, 129, 0.08)" : "rgba(244, 63, 94, 0.08)",
              border: `1px solid ${totalRealized >= 0 ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)"}`,
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>
                  💰 Beneficio Realizado Acumulado (Ventas)
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 800,
                    color: totalRealized >= 0 ? "#10b981" : "#f43f5e",
                  }}
                >
                  {totalRealized >= 0 ? "+" : ""}${totalRealized.toFixed(2)} USD
                </span>
              </div>
              <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 14 }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>
                  🎯 Tasa de Acierto en Ventas
                </span>
                <span className="mono" style={{ fontSize: "1.05rem", fontWeight: 700, color: "#38bdf8" }}>
                  {winRateClosed}%
                </span>
              </div>
              <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 14 }}>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>
                  📦 Posiciones Liquidadas
                </span>
                <span className="mono" style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {closedHoldings.length}
                </span>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>
                Total Estrategia (Activo + Realizado)
              </span>
              <span
                className="mono"
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 800,
                  color: totalStratPnl >= 0 ? "#10b981" : "#f43f5e",
                }}
              >
                {totalStratPnl >= 0 ? "+" : ""}${totalStratPnl.toFixed(2)} USD
              </span>
            </div>
          </div>

          {closedHoldings.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "36px 16px",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                background: "rgba(255, 255, 255, 0.02)",
                borderRadius: "8px",
                border: "1px dashed var(--border)",
              }}
            >
              No has cerrado ni vendido posiciones en los rebalanceos registrados de esta estrategia.
              <br />
              <span style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: 4, display: "inline-block" }}>
                Cuando rebalanceas y sustituyes una acción, su rentabilidad de venta queda aquí registrada acumulativamente.
              </span>
            </div>
          ) : mobileViewMode === "card" ? (
            /* Vista de Tarjetas Táctiles para Cerradas */
            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
              {closedHoldings.map((c, idx) => {
                const pnl = Number(c.realized_pnl || 0);
                const retPct = Number(c.realized_return_pct || 0);
                const isGain = pnl >= 0;

                return (
                  <div
                    key={`closed_card_${c.ticker}_${idx}`}
                    style={{
                      padding: "12px 14px",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderLeft: `4px solid ${isGain ? "var(--gain)" : "var(--loss)"}`,
                      borderRadius: "var(--radius-md)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>
                            {c.ticker}
                          </strong>
                          {c.exchange && (
                            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "1px 5px", borderRadius: 4 }}>
                              {c.exchange}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              color: "#10b981",
                              background: "rgba(16, 185, 129, 0.12)",
                              padding: "1px 6px",
                              borderRadius: 4,
                            }}
                          >
                            Vendida ✓
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
                          {c.name || c.ticker} · <span style={{ color: "var(--accent-primary)" }}>{c.sector || "Tecnología"}</span>
                        </div>
                      </div>

                      <span
                        className={`badge ${isGain ? "gain" : "loss"}`}
                        style={{ fontSize: "0.85rem", padding: "4px 8px" }}
                      >
                        {isGain ? "▲" : "▼"}{" "}
                        {unit === "pct"
                          ? `${Math.abs(retPct).toFixed(2)}%`
                          : `$${Math.abs(pnl).toFixed(2)}`}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Compra ({c.entry_date})</div>
                        <div className="mono" style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                          ${Number(c.entry_price || 0).toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Venta ({c.exit_date})</div>
                        <div className="mono" style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          ${Number(c.exit_price || 0).toFixed(2)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Días en Cartera</div>
                        <span className="mono" style={{ fontSize: "0.8rem", fontWeight: 600, color: "#38bdf8" }}>
                          {c.holding_days}d
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      <span>Invertido: <strong className="mono" style={{ color: "var(--text-secondary)" }}>${Number(c.cost_basis || 0).toFixed(2)}</strong></span>
                      <span>Cobrado: <strong className="mono" style={{ color: isGain ? "#10b981" : "#f43f5e" }}>${Number(c.exit_value || 0).toFixed(2)}</strong></span>
                      <span style={{ fontWeight: 700, color: isGain ? "#10b981" : "#f43f5e" }}>
                        {isGain ? "+" : ""}${pnl.toFixed(2)} ({isGain ? "+" : ""}{retPct.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Vista de Tabla para Cerradas */
            <div 
              className="holdings-table-scroll-wrapper"
              style={{ 
                overflowX: "auto", 
                minWidth: 0, 
                width: "100%", 
                WebkitOverflowScrolling: "touch",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              <table 
                style={{ 
                  width: "100%", 
                  minWidth: "820px", 
                  borderCollapse: "collapse", 
                  fontSize: "0.8125rem",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {[
                      "Empresa / Ticker",
                      "Sector",
                      "Fecha Compra",
                      "Precio Compra",
                      "Fecha Venta",
                      "Precio Venta",
                      "Tiempo",
                      "Capital Invertido",
                      "Monto Liquidado",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 12px",
                          textAlign: h.startsWith("Empresa") || h === "Sector" ? "left" : "right",
                          color: "var(--text-muted)",
                          fontWeight: 500,
                          fontSize: "0.72rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                          ...(h.startsWith("Empresa") ? { width: "230px", minWidth: "210px", maxWidth: "250px" } : {}),
                        }}
                      >
                        {h}
                      </th>
                    ))}
                    <th
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: "var(--accent-primary)",
                        fontWeight: 600,
                        fontSize: "0.72rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                      onClick={onToggleUnit}
                      title="Haz clic para alternar entre % y $"
                    >
                      PnL Realizado ({unit === "pct" ? "%" : "$"}) ⇄
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {closedHoldings.map((c, i) => {
                    const pnl = Number(c.realized_pnl || 0);
                    const retPct = Number(c.realized_return_pct || 0);
                    const isGain = pnl >= 0;

                    return (
                      <tr
                        key={`closed_row_${c.ticker}_${i}`}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          transition: "all var(--duration) var(--ease)",
                          animation: `fadeUp 0.3s ${i * 25}ms both`,
                          background: "rgba(255,255,255,0.01)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-card-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.01)")}
                      >
                        {/* Ticker & Name */}
                        <td style={{ padding: "10px 12px", width: "230px", minWidth: "210px", maxWidth: "250px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", width: "100%" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flexShrink: 1 }}>
                                <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                                  {c.ticker}
                                </span>
                                {c.exchange && (
                                  <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                                    {c.exchange}
                                  </span>
                                )}
                              </div>
                              <div style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center" }}>
                                <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#10b981", background: "rgba(16, 185, 129, 0.12)", padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
                                  Vendida
                                </span>
                              </div>
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>
                              {c.name || c.ticker}
                            </span>
                          </div>
                        </td>

                        {/* Sector */}
                        <td style={{ padding: "10px 12px", color: "#94a3b8", fontSize: "0.75rem" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 7px",
                              borderRadius: "12px",
                              background: "rgba(0, 229, 255, 0.05)",
                              border: "1px solid rgba(0, 229, 255, 0.12)",
                              color: "var(--accent-primary)",
                              fontWeight: 500,
                              fontSize: "0.7rem",
                            }}
                          >
                            {c.sector || "Tecnología"}
                          </span>
                        </td>

                        {/* Entry Date */}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                            {c.entry_date}
                          </span>
                        </td>

                        {/* Entry Price */}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span className="mono" style={{ color: "var(--text-secondary)" }}>
                            ${Number(c.entry_price || 0).toFixed(2)}
                          </span>
                        </td>

                        {/* Exit Date */}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span className="mono" style={{ color: "#38bdf8", fontSize: "0.78rem", fontWeight: 600 }}>
                            {c.exit_date}
                          </span>
                        </td>

                        {/* Exit Price */}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span className="mono" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                            ${Number(c.exit_price || 0).toFixed(2)}
                          </span>
                        </td>

                        {/* Holding Days */}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span className="mono" style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            {c.holding_days}d
                          </span>
                        </td>

                        {/* Cost Basis */}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span className="mono" style={{ color: "var(--text-secondary)" }}>
                            ${Number(c.cost_basis || 0).toFixed(2)}
                          </span>
                        </td>

                        {/* Exit Value */}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span className="mono" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                            ${Number(c.exit_value || 0).toFixed(2)}
                          </span>
                        </td>

                        {/* Realized Return Badge */}
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>
                          <span className={`badge ${isGain ? "gain" : "loss"}`} style={{ fontSize: "0.78rem" }}>
                            {isGain ? "▲" : "▼"}{" "}
                            {unit === "pct"
                              ? `${Math.abs(retPct).toFixed(2)}%`
                              : `$${Math.abs(pnl).toFixed(2)}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Stock Alert Modal ── */}
      <StockAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => {
          setIsAlertModalOpen(false);
          setSelectedAlertHolding(null);
        }}
        initialAlert={
          selectedAlertHolding
            ? alerts.find((a) => a.ticker === selectedAlertHolding.ticker)
            : null
        }
        ticker={selectedAlertHolding?.ticker || ""}
        companyName={selectedAlertHolding?.name || selectedAlertHolding?.ticker || ""}
        currentPrice={selectedAlertHolding?.current_price || 0}
        entryPrice={selectedAlertHolding?.start_price || 0}
        currentReturnPct={selectedAlertHolding?.return_pct || 0}
        scope="strategy"
        targetId={strategyId}
        userEmail={user?.email || ""}
        onSave={handleSaveAlert}
        onDelete={handleDeleteAlert}
      />
    </div>
  );
}
