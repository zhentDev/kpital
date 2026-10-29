/**
 * PortfolioManager — add/remove tickers, adjust investment amount.
 */
import { useRef, useState } from "react";
import { searchTicker } from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";

export default function PortfolioManager({ onRefresh }) {
  const { settingsByMode, mode, addTicker, removeTicker, setInvestment } = usePortfolioStore();
  const currentSettings = settingsByMode?.[mode] || settingsByMode?.historical || {
    tickers: [],
    investment: 2000,
    period: "1Y",
    numSlots: 15,
  };
  const { tickers = [], investment = 2000, numSlots = 15 } = currentSettings;
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");
  const inputRef = useRef(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setSearchError("");
    try {
      const result = await searchTicker(query.trim());
      if (result.valid) {
        setSearchResult(result);
      } else {
        setSearchError(`"${query.toUpperCase()}" no encontrado en Yahoo Finance`);
      }
    } catch {
      setSearchError("Error de conexión con el backend");
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = () => {
    if (!searchResult) return;
    addTicker(searchResult.ticker);
    setQuery("");
    setSearchResult(null);
    onRefresh?.();
  };

  const handleRemove = (ticker) => {
    removeTicker(ticker);
    onRefresh?.();
  };

  const slotPct = ((1 / numSlots) * 100).toFixed(2);
  const slotValue = (investment / numSlots).toFixed(2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Investment amount */}
      <div>
        <h3 style={{ marginBottom: "10px" }}>Capital invertido</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>$</span>
          <input
            type="number"
            value={investment}
            min={1}
            step="any"
            onChange={(e) => {
              setInvestment(e.target.value);
              onRefresh?.();
            }}
            style={{ maxWidth: "140px", textAlign: "right" }}
          />
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            = ${slotValue} / posición ({slotPct}%)
          </span>
        </div>
      </div>

      {/* Add ticker */}
      <div>
        <h3 style={{ marginBottom: "10px" }}>Agregar empresa</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Ticker (ej: MSFT)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value.toUpperCase());
              setSearchResult(null);
              setSearchError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{ maxWidth: "160px", textTransform: "uppercase" }}
          />
          <button className="btn btn-ghost" onClick={handleSearch} disabled={searching || !query}>
            {searching ? (
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
            ) : (
              "🔍 Buscar"
            )}
          </button>
        </div>

        {searchError && (
          <div style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--loss)" }}>
            {searchError}
          </div>
        )}

        {searchResult && (
          <div
            style={{
              marginTop: 8,
              padding: "10px 14px",
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <span style={{ fontWeight: 700, color: "var(--accent-primary)", marginRight: 8 }}>
                {searchResult.ticker}
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                {searchResult.name}
              </span>
              <span
                className="mono"
                style={{ marginLeft: 12, color: "var(--text-muted)", fontSize: "0.75rem" }}
              >
                ${searchResult.price?.toFixed(2)}
              </span>
            </div>
            <button
              className="btn btn-primary"
              style={{ padding: "5px 12px", fontSize: "0.75rem" }}
              onClick={handleAdd}
              disabled={tickers.includes(searchResult.ticker)}
            >
              {tickers.includes(searchResult.ticker) ? "✓ Ya está" : "+ Agregar"}
            </button>
          </div>
        )}
      </div>

      {/* Current holdings list */}
      <div>
        <h3 style={{ marginBottom: "10px" }}>
          Posiciones activas · {tickers.length}/{numSlots} slots
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {tickers.map((ticker) => (
            <div
              key={ticker}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "5px 10px",
                fontSize: "0.8125rem",
                fontWeight: 600,
                transition: "border-color var(--duration) var(--ease)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(0,229,255,0.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <span style={{ color: "var(--accent-primary)" }}>{ticker}</span>
              <button
                className="btn btn-danger"
                style={{ padding: "1px 5px", border: "none", borderRadius: 3 }}
                onClick={() => handleRemove(ticker)}
                title={`Quitar ${ticker}`}
              >
                ✕
              </button>
            </div>
          ))}
          {/* Empty slots */}
          {Array.from({ length: numSlots - tickers.length }).map((_, i) => (
            <div
              key={`empty-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "var(--bg-surface)",
                border: "1px dashed var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "5px 10px",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                opacity: 0.4,
              }}
            >
              {i === 0 ? "Q (pendiente)" : `Slot libre`}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
