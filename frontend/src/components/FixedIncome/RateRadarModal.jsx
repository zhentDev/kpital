import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../context/ThemeContext";

export default function RateRadarModal({
  isOpen,
  onClose,
  alerts = [],
  allMarketRates = [],
  liveScrapedInfo = null,
  isCheckingRates = false,
  onRecheckRates,
  onFlashTest,
  onApplyRate,
  applyingRateAccountId = null,
  onDismissAlert,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [filterTab, setFilterTab] = useState("all"); // 'all' | 'cop' | 'usd'
  const [showScrapedDetails, setShowScrapedDetails] = useState(false);

  if (!isOpen) return null;

  const filteredRates = (allMarketRates || []).filter((item) => {
    if (filterTab === "cop") return item.currency === "COP";
    if (filterTab === "usd") return item.currency === "USD";
    return true;
  });

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        background: isLight ? "rgba(15, 23, 42, 0.6)" : "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 999999,
        padding: "60px 16px 24px 16px",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card fade-up"
        style={{
          width: "100%",
          maxWidth: 820,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: isLight ? "#ffffff" : "var(--bg-surface, #0f172a)",
          border: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          boxShadow: isLight
            ? "0 20px 45px rgba(0, 0, 0, 0.15)"
            : "0 25px 60px rgba(0, 0, 0, 0.85)",
          overflow: "hidden",
        }}
      >
        {/* ── HEADER ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 22px",
            borderBottom: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.08)",
            background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>📡</span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.12rem",
                  fontWeight: 800,
                  color: isLight ? "#0f172a" : "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Radar de Tasas Bancarias en Vivo
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    background: "rgba(16, 185, 129, 0.15)",
                    border: "1px solid #10b981",
                    color: "#10b981",
                    padding: "2px 8px",
                    borderRadius: 12,
                  }}
                >
                  ● Rastreo Web Activo
                </span>
              </h3>
              <p
                style={{
                  margin: "2px 0 0 0",
                  fontSize: "0.78rem",
                  color: isLight ? "#64748b" : "#94a3b8",
                }}
              >
                Monitoreo automático de portales web oficiales (Nu, Pibank, RappiPay, Finandina)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: isLight ? "#64748b" : "#94a3b8",
              fontSize: "1.25rem",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 6,
              lineHeight: 1,
            }}
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── BODY (Scrollable) ── */}
        <div
          style={{
            padding: "20px 22px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {/* ── ACTIONS & STATUS BAR ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 12,
              background: isLight ? "#f1f5f9" : "rgba(30, 41, 59, 0.4)",
              border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1.1rem" }}>🌐</span>
              <span style={{ fontSize: "0.8rem", color: isLight ? "#334155" : "#cbd5e1" }}>
                Fuentes: <strong>nu.com.co</strong>, <strong>pibank.co</strong>, <strong>rappipay.co</strong>, <strong>bancofinandina.com</strong>
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onFlashTest}
                disabled={isCheckingRates}
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid #10b981",
                  color: "#10b981",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: isCheckingRates ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
                title="Genera una alerta de prueba simulada para ensayar el botón de actualizar"
              >
                <span>⚡</span> Probar Alerta Flash
              </button>

              <button
                type="button"
                onClick={onRecheckRates}
                disabled={isCheckingRates}
                style={{
                  background: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)",
                  border: "none",
                  color: "#ffffff",
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: isCheckingRates ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 2px 8px rgba(14, 165, 233, 0.35)",
                }}
              >
                {isCheckingRates ? (
                  <>
                    <span
                      className="kpital-spin"
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: "50%",
                        border: "2px solid rgba(255, 255, 255, 0.4)",
                        borderTopColor: "#ffffff",
                        display: "inline-block",
                      }}
                    />
                    <span>Rastreando en Vivo...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span> Re-verificar Ahora
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── ALERTS SECTION (OR ALL IN SYNC CARD) ── */}
          {alerts.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: "0.88rem", color: "#f59e0b" }}>
                  ⚠️ {alerts.length} Actualización{alerts.length > 1 ? "es" : ""} de Tasa Recomendada{alerts.length > 1 ? "s" : ""}:
                </strong>
                <span style={{ fontSize: "0.74rem", color: isLight ? "#64748b" : "#94a3b8" }}>
                  Solo afecta cálculos a futuro sin alterar tus rendimientos pasados
                </span>
              </div>

              {alerts.map((alert) => (
                <div
                  key={alert.accountId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.8)",
                    border: isLight ? "1px solid #f59e0b" : "1px solid rgba(245, 158, 11, 0.4)",
                    borderRadius: 12,
                    padding: "12px 16px",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220, flex: "1 1 auto" }}>
                    <span style={{ fontSize: "1.3rem" }}>{alert.direction === "up" ? "📈" : "📉"}</span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: "0.88rem", color: isLight ? "#0f172a" : "#f8fafc" }}>
                          {alert.entityName} • {alert.accountName}
                        </strong>
                        {alert.isSimulated && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              color: "#f59e0b",
                              background: "rgba(245, 158, 11, 0.15)",
                              border: "1px solid rgba(245, 158, 11, 0.4)",
                              borderRadius: "4px",
                              padding: "1px 6px",
                            }}
                          >
                            🧪 Prueba Flash Simulada
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.76rem", color: isLight ? "#64748b" : "#94a3b8" }}>
                        Tasa actual: <strong style={{ color: "#f43f5e" }}>{alert.currentRateEA.toFixed(2)}% E.A.</strong> ➔ Mercado: <strong style={{ color: "#10b981" }}>{alert.marketRateEA.toFixed(2)}% E.A.</strong> ({alert.diff > 0 ? `+${alert.diff.toFixed(2)}%` : `${alert.diff.toFixed(2)}%`})
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => onApplyRate && onApplyRate(alert)}
                      disabled={applyingRateAccountId === alert.accountId}
                      style={{
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        border: "none",
                        color: "#ffffff",
                        borderRadius: "8px",
                        padding: "7px 14px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: applyingRateAccountId === alert.accountId ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)",
                      }}
                    >
                      {applyingRateAccountId === alert.accountId ? (
                        <>
                          <span
                            className="kpital-spin"
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              border: "2px solid rgba(255, 255, 255, 0.4)",
                              borderTopColor: "#ffffff",
                              display: "inline-block",
                            }}
                          />
                          <span>Actualizando...</span>
                        </>
                      ) : (
                        `⚡ Actualizar a ${alert.marketRateEA.toFixed(2)}% E.A.`
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismissAlert && onDismissAlert(alert.accountId)}
                      disabled={applyingRateAccountId === alert.accountId}
                      style={{
                        background: "transparent",
                        border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.15)",
                        color: isLight ? "#64748b" : "#94a3b8",
                        borderRadius: "8px",
                        padding: "7px 10px",
                        fontSize: "0.76rem",
                        cursor: "pointer",
                      }}
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderRadius: 12,
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
              }}
            >
              <span style={{ fontSize: "1.5rem" }}>✅</span>
              <div>
                <strong style={{ fontSize: "0.88rem", color: "#10b981", display: "block" }}>
                  ¡Todas tus cuentas están 100% al día con el mercado!
                </strong>
                <span style={{ fontSize: "0.76rem", color: isLight ? "#334155" : "#cbd5e1" }}>
                  Tus bolsillos y cajitas activas (Nu Colombia al 9.35%, RappiPay al 9.00%, Finandina al 10.50%, Plenti al 4.00%) coinciden con las mejores tasas oficiales disponibles.
                </span>
              </div>
            </div>
          )}

          {/* ── LIVE SCRAPED SNIPPETS (Collapsible) ── */}
          {liveScrapedInfo && Object.keys(liveScrapedInfo).length > 0 && (
            <div
              style={{
                borderRadius: 10,
                border: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.08)",
                background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.4)",
                padding: "10px 14px",
              }}
            >
              <button
                type="button"
                onClick={() => setShowScrapedDetails((prev) => !prev)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  color: isLight ? "#0f172a" : "#f8fafc",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                }}
              >
                <span>🔍 Ver fragmentos HTML extraídos en vivo ({Object.keys(liveScrapedInfo).length} bancos)</span>
                <span>{showScrapedDetails ? "▲ Ocultar" : "▼ Desplegar"}</span>
              </button>

              {showScrapedDetails && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {Object.entries(liveScrapedInfo).map(([bankKey, info]) => (
                    <div
                      key={bankKey}
                      style={{
                        fontSize: "0.75rem",
                        padding: "6px 10px",
                        background: isLight ? "#ffffff" : "rgba(0, 0, 0, 0.3)",
                        borderRadius: 6,
                        border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.05)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      <div>
                        <strong style={{ color: "#0ea5e9", textTransform: "capitalize" }}>{bankKey}:</strong>{" "}
                        <code style={{ color: isLight ? "#0f172a" : "#e2e8f0", background: "transparent" }}>
                          "{info.headline}"
                        </code>
                        <span style={{ color: isLight ? "#64748b" : "#94a3b8", marginLeft: 6 }}>
                          ➔ <strong>{info.rateEA}% E.A.</strong> ({info.product})
                        </span>
                      </div>
                      <a
                        href={info.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#38bdf8", textDecoration: "none", fontSize: "0.72rem" }}
                      >
                        Portal oficial ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ALL MARKET RATES COMPARATOR TABLE ── */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 700, color: isLight ? "#0f172a" : "#f8fafc" }}>
                📊 Catálogo de Tasas de Ahorro y Rendimiento Vigentes
              </h4>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setFilterTab("all")}
                  style={{
                    background: filterTab === "all" ? (isLight ? "#0ea5e9" : "#0284c7") : "transparent",
                    color: filterTab === "all" ? "#ffffff" : isLight ? "#64748b" : "#94a3b8",
                    border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab("cop")}
                  style={{
                    background: filterTab === "cop" ? (isLight ? "#0ea5e9" : "#0284c7") : "transparent",
                    color: filterTab === "cop" ? "#ffffff" : isLight ? "#64748b" : "#94a3b8",
                    border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  🇨🇴 COP
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab("usd")}
                  style={{
                    background: filterTab === "usd" ? (isLight ? "#0ea5e9" : "#0284c7") : "transparent",
                    color: filterTab === "usd" ? "#ffffff" : isLight ? "#64748b" : "#94a3b8",
                    border: isLight ? "1px solid #cbd5e1" : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  🇺🇸 USD
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 10,
              }}
            >
              {filteredRates.map((ent) => {
                const isLiveScraped = liveScrapedInfo && liveScrapedInfo[ent.id];
                return (
                  <div
                    key={ent.id}
                    style={{
                      background: isLight ? "#f8fafc" : "rgba(30, 41, 59, 0.5)",
                      border: isLiveScraped
                        ? "1px solid rgba(16, 185, 129, 0.4)"
                        : isLight
                        ? "1px solid #e2e8f0"
                        : "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 8,
                      position: "relative",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: isLight ? "#0f172a" : "#f8fafc" }}>
                          {ent.country} {ent.name}
                        </span>
                        {isLiveScraped && (
                          <span
                            style={{
                              fontSize: "0.62rem",
                              fontWeight: 800,
                              color: "#10b981",
                              background: "rgba(16, 185, 129, 0.15)",
                              borderRadius: 4,
                              padding: "1px 5px",
                            }}
                          >
                            🌐 EN VIVO
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: isLight ? "#64748b" : "#94a3b8",
                          display: "block",
                          marginTop: 2,
                        }}
                      >
                        {ent.productName}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
                      <div>
                        <strong
                          style={{
                            fontSize: "1.2rem",
                            fontWeight: 800,
                            color: ent.currentMarketRateEA >= 10 ? "#10b981" : "#0ea5e9",
                          }}
                        >
                          {ent.currentMarketRateEA.toFixed(2)}%
                        </strong>
                        <span style={{ fontSize: "0.72rem", color: isLight ? "#64748b" : "#94a3b8", marginLeft: 3 }}>
                          E.A.
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            color: isLight ? "#64748b" : "#94a3b8",
                            background: isLight ? "#e2e8f0" : "rgba(255, 255, 255, 0.08)",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {ent.payoutFrequency === "daily" ? "Diario" : "Mensual"}
                        </span>
                        {ent.sourceUrl && (
                          <a
                            href={ent.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: "0.7rem",
                              color: "#38bdf8",
                              textDecoration: "none",
                              fontWeight: 700,
                            }}
                            title="Abrir portal oficial"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div
          style={{
            padding: "12px 22px",
            borderTop: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.08)",
            background: isLight ? "#f8fafc" : "rgba(15, 23, 42, 0.6)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: isLight ? "#e2e8f0" : "rgba(255, 255, 255, 0.1)",
              border: "none",
              color: isLight ? "#0f172a" : "#f8fafc",
              borderRadius: 8,
              padding: "7px 18px",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Entendido / Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
