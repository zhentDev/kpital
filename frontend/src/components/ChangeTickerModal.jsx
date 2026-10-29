import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { searchTickersMultiple } from "../api/client";
import {
  MARKET_REGIONS,
  detectExchangeKey,
  getBrokerEquivalenceInfo,
  translateBrokerTicker,
} from "../utils/marketHours";
import { MarketScheduleBadge } from "./Common";

export default function ChangeTickerModal({
  isOpen,
  onClose,
  group,
  liveQuote,
  portfolioCurrency = "USD",
  onConfirmChange,
}) {
  const [query, setQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("ALL");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Broker translation suggestions (e.g. XTB .DE -> Yahoo .F, XTB .UK -> Yahoo .L)
  const translationInfo = useMemo(() => {
    return translateBrokerTicker(query);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedRegion("ALL");
      setSearchResults([]);
      setSelectedAsset(null);
      setIsSubmitting(false);
    }
  }, [isOpen, group]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await searchTickersMultiple(query.trim());
        const list = Array.isArray(data) ? data : data.results || [];
        setSearchResults(list);
      } catch (err) {
        console.error("Error searching tickers:", err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen || !group) return null;

  const handleSelect = (asset) => {
    setSelectedAsset(asset);
  };

  const handleManualUseQuery = () => {
    const clean = query.trim().toUpperCase();
    if (!clean) return;
    setSelectedAsset({
      ticker: clean,
      name: clean,
      exchange: "Desconocido",
      currency: portfolioCurrency,
      quoteType: "EQUITY",
      price: 0,
    });
  };

  const handleSave = async () => {
    if (!selectedAsset || !selectedAsset.ticker) {
      toast.error("Selecciona un nuevo activo o escribe un ticker.");
      return;
    }

    if (selectedAsset.ticker.toUpperCase() === group.ticker.toUpperCase()) {
      toast.error("El nuevo ticker es idéntico al actual.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirmChange(selectedAsset);
      toast.success(
        `Se cambiaron ${group.lots.length} lote(s) de ${group.ticker} a ${selectedAsset.ticker}.`
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar los lotes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentAssetName = liveQuote?.name || group.name || group.ticker;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 12px",
        overflow: "hidden",
      }}
      onClick={onClose}
    >
      <div
        className="card fade-up"
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "calc(100vh - 40px)",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#0f172a",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 14,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header - Fixed at top */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px 12px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(15, 23, 42, 0.95)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.2rem" }}>🔄</span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                Cambiar Acción o ETF
              </h3>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Reemplazar ticker conservando fechas, montos y compras
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "1.2rem",
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >

        {/* Comparison Box */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 12,
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 18,
          }}
        >
          {/* Current Asset */}
          <div>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 }}>
              Activo Actual ({group.lots.length} lotes)
            </div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "#e2e8f0" }}>
              {group.ticker}
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 190,
              }}
              title={currentAssetName}
            >
              {currentAssetName}
            </div>
            {liveQuote && (
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                {liveQuote.exchange && (
                  <span style={{ fontSize: "0.65rem", color: "#38bdf8" }}>
                    🏛️ {liveQuote.exchange}
                  </span>
                )}
                {liveQuote.currency && (
                  <span style={{ fontSize: "0.65rem", color: "#a7f3d0" }}>
                    💵 {liveQuote.currency}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ fontSize: "1.2rem", color: "#00e5ff", fontWeight: "bold" }}>➔</div>

          {/* Replacement Asset */}
          <div>
            <div style={{ fontSize: "0.7rem", color: "#38bdf8", textTransform: "uppercase", marginBottom: 2 }}>
              Nuevo Activo
            </div>
            {selectedAsset ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "#00e5ff" }}>
                  {selectedAsset.ticker}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 190,
                  }}
                  title={selectedAsset.name}
                >
                  {selectedAsset.name}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {selectedAsset.exchange && (
                    <span style={{ fontSize: "0.65rem", color: "#38bdf8" }}>
                      🏛️ {selectedAsset.exchange}
                    </span>
                  )}
                  {selectedAsset.currency && (
                    <span style={{ fontSize: "0.65rem", color: "#a7f3d0" }}>
                      💵 {selectedAsset.currency}
                    </span>
                  )}
                  {selectedAsset.price > 0 && (
                    <span style={{ fontSize: "0.65rem", color: "#facc15" }}>
                      ${selectedAsset.price.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                Sin seleccionar (busca abajo)
              </div>
            )}
          </div>
        </div>

        {/* Search Input */}
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              display: "block",
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              marginBottom: 6,
              fontWeight: 500,
            }}
          >
            Buscar nuevo Ticker, Empresa o ETF (ej: NNND.F, CSPX, AAPL):
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              className="input"
              style={{ flex: 1 }}
              placeholder="Escribe el símbolo o nombre..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query.trim() && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleManualUseQuery}
                title="Usar este texto exacto directamente"
              >
                Usar "{query.trim().toUpperCase()}"
              </button>
            )}
          </div>
        </div>

        {/* Market / Region Filters & Broker Quick Guide */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Filtrar por Mercado / Ubicación:
            </span>
            <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
              💡 XTB: .DE / .UK ➔ Yahoo: .F / .L
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MARKET_REGIONS.map((reg) => {
              const isActive = selectedRegion === reg.id;
              return (
                <button
                  key={reg.id}
                  type="button"
                  onClick={() => setSelectedRegion(reg.id)}
                  title={reg.hint}
                  style={{
                    background: isActive ? "rgba(0, 229, 255, 0.2)" : "rgba(255, 255, 255, 0.04)",
                    border: isActive ? "1px solid #00e5ff" : "1px solid rgba(255, 255, 255, 0.08)",
                    color: isActive ? "#00e5ff" : "var(--text-secondary)",
                    padding: "3px 8px",
                    borderRadius: "14px",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontWeight: isActive ? 600 : 400,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{reg.icon}</span> {reg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Broker Suffix Auto-translation Suggestion */}
        {translationInfo.suggestions.length > 0 && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 10px",
              background: "rgba(56, 189, 248, 0.08)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              borderRadius: 6,
              fontSize: "0.75rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <div style={{ color: "#38bdf8" }}>
              🔍 <strong>Detectado sufijo de broker:</strong> En Yahoo Finance se busca como:
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {translationInfo.suggestions.map((sug) => (
                <button
                  key={sug.ticker}
                  type="button"
                  onClick={() => {
                    setQuery(sug.ticker);
                  }}
                  style={{
                    background: "rgba(56, 189, 248, 0.2)",
                    border: "1px solid #38bdf8",
                    color: "#f0f9ff",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                  title={sug.note}
                >
                  {sug.ticker} ({sug.badge})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Results / Status */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 180,
            maxHeight: 260,
            background: "rgba(0, 0, 0, 0.25)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            borderRadius: 8,
            padding: 8,
            marginBottom: 16,
          }}
        >
          {isSearching && (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Buscando cotizaciones y bolsas en tiempo real...
            </div>
          )}

          {!isSearching && searchResults.length === 0 && query.trim().length > 0 && (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No se encontraron resultados automáticos para "{query}".
              <br />
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ marginTop: 10 }}
                onClick={handleManualUseQuery}
              >
                Forzar Ticker manual "{query.trim().toUpperCase()}"
              </button>
            </div>
          )}

          {!isSearching && !query.trim() && (
            <div style={{ textAlign: "center", padding: 24, color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Escribe el ticker o nombre de la acción/ETF.
              <div style={{ marginTop: 8, fontSize: "0.75rem", color: "#94a3b8" }}>
                Ejemplo: para Tencent en XTB es <strong>NNND.DE</strong> y en Yahoo es <strong>NNND.F</strong> (Bolsa de Fráncfort en EUR).
                <br />
                Para ETFs británicos en XTB suelen terminar en <strong>.UK</strong> y en Yahoo son <strong>.L</strong> (ej. <strong>CSPX.L</strong>).
              </div>
            </div>
          )}

          {(() => {
            const filteredResults = searchResults.filter((item) => {
              if (selectedRegion === "ALL") return true;
              const eq = getBrokerEquivalenceInfo(item.ticker, item.exchange);
              return eq.region === selectedRegion;
            });

            if (!isSearching && searchResults.length > 0 && filteredResults.length === 0) {
              return (
                <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: "0.8rem" }}>
                  No hay resultados bajo el filtro seleccionado.
                  <br />
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    style={{ marginTop: 6, color: "#00e5ff" }}
                    onClick={() => setSelectedRegion("ALL")}
                  >
                    Ver todos los mercados ({searchResults.length})
                  </button>
                </div>
              );
            }

            return filteredResults.map((item) => {
              const isSelected = selectedAsset?.ticker === item.ticker;
              const eqInfo = getBrokerEquivalenceInfo(item.ticker, item.exchange);

              return (
                <div
                  key={item.ticker}
                  onClick={() => handleSelect(item)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "8px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    marginBottom: 6,
                    background: isSelected ? "rgba(0, 229, 255, 0.15)" : "rgba(255, 255, 255, 0.02)",
                    border: isSelected
                      ? "1px solid #00e5ff"
                      : "1px solid rgba(255, 255, 255, 0.04)",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ color: "#f8fafc", fontSize: "0.95rem" }}>
                          {item.ticker}
                        </strong>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            background: "rgba(255, 255, 255, 0.07)",
                            padding: "1px 6px",
                            borderRadius: 4,
                            color: "#38bdf8",
                            fontWeight: 500,
                          }}
                          title="Bolsa de cotización"
                        >
                          {eqInfo.flag} {eqInfo.marketLabel}
                        </span>
                        {item.quoteType && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              background: "rgba(255,255,255,0.06)",
                              padding: "1px 5px",
                              borderRadius: 4,
                              color: "var(--text-secondary)",
                            }}
                          >
                            {item.quoteType}
                          </span>
                        )}
                        <MarketScheduleBadge ticker={item.ticker} exchange={item.exchange} size="xs" />
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginTop: 2,
                        }}
                      >
                        {item.name}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      {item.price > 0 && (
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f8fafc" }}>
                          ${item.price.toFixed(2)}
                        </div>
                      )}
                      <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <span>🏛️ {item.exchange}</span>
                        <span>💵 {item.currency}</span>
                      </div>
                    </div>
                  </div>

                  {/* Broker equivalence hint */}
                  {eqInfo.brokerTip && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: "0.68rem",
                        color: "#94a3b8",
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        borderLeft: "2px solid #00e5ff",
                      }}
                    >
                      💡 {eqInfo.brokerTip}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        {/* Warning / Details Notice */}
        <div
          style={{
            fontSize: "0.74rem",
            color: "#94a3b8",
            background: "rgba(234, 179, 8, 0.08)",
            border: "1px solid rgba(234, 179, 8, 0.2)",
            borderRadius: 6,
            padding: "8px 12px",
          }}
        >
          💡 <strong>Nota:</strong> Al confirmar, todos los <strong>{group.lots.length} lotes</strong> de compra mantendrán sus fechas, montos invertidos y número de acciones. El sistema consultará automáticamente el nuevo precio y horarios de mercado para {selectedAsset ? selectedAsset.ticker : "el nuevo activo"}.
        </div>
      </div>

      {/* Modal Actions - Always visible sticky footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          padding: "12px 20px",
          background: "rgba(15, 23, 42, 0.98)",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!selectedAsset || isSubmitting}
          style={{
            background: selectedAsset ? "#00e5ff" : undefined,
            color: selectedAsset ? "#0f172a" : undefined,
            fontWeight: 700,
          }}
        >
          {isSubmitting
            ? "Actualizando..."
            : `Confirmar cambio a ${selectedAsset ? selectedAsset.ticker : "..."}`}
        </button>
      </div>
    </div>
  </div>
  );
}
