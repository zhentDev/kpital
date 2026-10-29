import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { createRebalance, deleteRebalance, fetchRebalances, searchTicker } from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";
import { toastConfirm } from "../utils/toastAlerts";
import { DynamicDatePicker } from "./Common";

export default function RebalanceManager({ onRefresh }) {
  const { settingsByMode, mode, setInvestment } = usePortfolioStore();
  const currentSettings = settingsByMode?.[mode] || settingsByMode?.historical || {
    tickers: [],
    investment: 2000,
    period: "1Y",
    numSlots: 15,
  };
  const { numSlots = 15, investment = 2000 } = currentSettings;
  const [rebalances, setRebalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [activeTab, setActiveTab] = useState("history"); // 'history' | 'create'
  const [localInvestment, setLocalInvestment] = useState(investment);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formTickers, setFormTickers] = useState([]);
  const [selectedForDeletion, setSelectedForDeletion] = useState([]);
  const [batchInput, setBatchInput] = useState("");

  // Search State
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState("");
  const inputRef = useRef(null);

  const loadRebalances = async () => {
    setLoading(true);
    try {
      const data = await fetchRebalances("historical", { bypassCache: true });
      setRebalances(data);
      if (data.length > 0) {
        // Pre-fill form with the last rebalance tickers
        setFormTickers([...data[data.length - 1].tickers]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRebalances();
  }, []);

  useEffect(() => {
    setLocalInvestment(investment);
  }, [investment]);

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
      setSearchError("Error de conexión");
    } finally {
      setSearching(false);
    }
  };

  const handleAddTicker = () => {
    if (!searchResult) return;
    if (formTickers.length >= numSlots) {
      setSearchError(`Máximo ${numSlots} empresas permitidas`);
      return;
    }
    if (!formTickers.includes(searchResult.ticker)) {
      setFormTickers([...formTickers, searchResult.ticker]);
    }
    setQuery("");
    setSearchResult(null);
  };

  // Batch paste group of tickers
  const handleBatchAdd = () => {
    if (!batchInput.trim()) return;
    const extracted = batchInput
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0 && /^[A-Z0-9.-]+$/.test(t));

    const uniqueNew = extracted.filter((t) => !formTickers.includes(t));
    const combined = [...formTickers, ...uniqueNew].slice(0, numSlots);
    setFormTickers(combined);
    setBatchInput("");
  };

  const handleRemoveTicker = (ticker) => {
    setFormTickers((prev) => prev.filter((t) => t !== ticker));
    setSelectedForDeletion((prev) => prev.filter((t) => t !== ticker));
  };

  const toggleForDeletion = (ticker) => {
    setSelectedForDeletion((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker],
    );
  };

  const handleDeleteSelected = () => {
    setFormTickers((prev) => prev.filter((t) => !selectedForDeletion.includes(t)));
    setSelectedForDeletion([]);
  };

  const handleClearAll = async () => {
    if (formTickers.length === 0) return;
    const isConfirmed = await toastConfirm(
      "¿Vaciar todas las posiciones seleccionadas de este borrador?",
    );
    if (isConfirmed) {
      setFormTickers([]);
      setSelectedForDeletion([]);
    }
  };

  const handleSubmit = async () => {
    if (formTickers.length === 0) {
      toast.error("Debes agregar al menos 1 posición al rebalanceo");
      return;
    }
    try {
      await createRebalance({
        rebalance_date: date,
        cash_added: 0,
        tickers: formTickers,
      });
      await loadRebalances();
      setActiveTab("history");
      onRefresh?.();
      toast.success(
        `Rebalanceo de Kpital guardado con éxito para el ${date} (${formTickers.length} posiciones)`,
      );
    } catch (e) {
      toast.error("Error guardando el rebalanceo: " + e.message);
    }
  };

  const handleDelete = async (delDate) => {
    const isConfirmed = await toastConfirm(
      `¿Estás seguro de eliminar por completo el grupo de rebalanceo del ${delDate}?`,
    );
    if (!isConfirmed) return;
    try {
      await deleteRebalance(delDate);
      await loadRebalances();
      onRefresh?.();
    } catch (e) {
      toast.error("Error eliminando: " + e.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", height: "100%" }}>
      {/* GLOBAL SETTINGS */}
      <div>
        <h3 style={{ margin: "0 0 8px 0", fontSize: "1rem", fontWeight: 700 }}>
          Capital Invertido Real (Kpital)
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>$</span>
          <input
            type="number"
            value={localInvestment}
            min={1}
            step="any"
            onChange={(e) => setLocalInvestment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setInvestment(localInvestment);
                onRefresh?.();
              }
            }}
            style={{ maxWidth: "140px", textAlign: "right", fontWeight: 700 }}
          />
          <button
            className="btn btn-primary"
            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
            onClick={() => {
              setInvestment(localInvestment);
              onRefresh?.();
            }}
            disabled={Number(localInvestment) === Number(investment)}
          >
            Aplicar
          </button>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            = ${(investment / numSlots).toFixed(2)} / slot ({numSlots} slots)
          </span>
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: 0 }} />

      {/* TABS NAVIGATION */}
      <div
        style={{
          display: "flex",
          gap: 6,
          background: "rgba(255, 255, 255, 0.03)",
          padding: 4,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: "0.78rem",
            fontWeight: 700,
            borderRadius: 4,
            border: "none",
            background: activeTab === "history" ? "var(--accent-primary)" : "transparent",
            color: activeTab === "history" ? "#000" : "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>📜 Historial</span>
          <span
            style={{
              fontSize: "0.7rem",
              padding: "1px 6px",
              borderRadius: 10,
              background: activeTab === "history" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.08)",
              color: activeTab === "history" ? "#000" : "var(--text-muted)",
            }}
          >
            {rebalances.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("create")}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: "0.78rem",
            fontWeight: 700,
            borderRadius: 4,
            border: "none",
            background: activeTab === "create" ? "var(--accent-primary)" : "transparent",
            color: activeTab === "create" ? "#000" : "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>⚡ + Rebalancear</span>
        </button>
      </div>

      {/* TAB CONTENT: HISTORY */}
      {activeTab === "history" && (
        <div className="fade-up" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
              📜 Historial de Rebalanceos Kpital ({rebalances.length})
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setActiveTab("create")}
              style={{ fontSize: "0.72rem", padding: "3px 8px" }}
            >
              + Nuevo
            </button>
          </div>

          {loading ? (
            <div className="spinner" />
          ) : error ? (
            <div style={{ color: "var(--loss)", fontSize: "0.8rem" }}>{error}</div>
          ) : rebalances.length === 0 ? (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.78rem",
                textAlign: "center",
                padding: "24px 0",
              }}
            >
              <p style={{ margin: "0 0 10px 0" }}>No hay rebalanceos registrados.</p>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setActiveTab("create")}
                style={{ fontSize: "0.75rem" }}
              >
                + Registrar Primer Rebalanceo
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                flex: 1,
                minHeight: 280,
                maxHeight: 420,
                overflowY: "auto",
              }}
            >
              {rebalances.map((r, idx) => {
                const isLatest = idx === rebalances.length - 1;
                return (
                  <div
                    key={r.date}
                    style={{
                      background: isLatest ? "rgba(0, 229, 255, 0.05)" : "var(--bg-surface)",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${isLatest ? "rgba(0, 229, 255, 0.3)" : "var(--border)"}`,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong
                          className="mono"
                          style={{
                            color: isLatest ? "var(--accent-primary)" : "var(--text-primary)",
                            fontSize: "0.85rem",
                          }}
                        >
                          {r.date}
                        </strong>
                        {isLatest && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: "rgba(0,229,255,0.15)",
                              color: "var(--accent-primary)",
                              fontWeight: 700,
                            }}
                          >
                            ACTIVO
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        {r.tickers.map((t) => (
                          <span
                            key={t}
                            className="mono"
                            style={{
                              background: "rgba(255,255,255,0.06)",
                              padding: "1px 5px",
                              borderRadius: 3,
                              fontSize: "0.7rem",
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(r.date)}
                      style={{ fontSize: "0.72rem", padding: "4px 8px", whiteSpace: "nowrap" }}
                      title="Eliminar este grupo de rebalanceo completo"
                    >
                      🗑️ Eliminar Grupo
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: NEW REBALANCE FORM */}
      {activeTab === "create" && (
        <div className="fade-up">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
              ⚡ Nuevo Rebalanceo Mensual (Kpital Tech)
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setActiveTab("history")}
              style={{ fontSize: "0.72rem", padding: "3px 8px" }}
            >
              ← Ver Historial
            </button>
          </div>

        <div style={{ marginBottom: "14px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginBottom: 4,
            }}
          >
            Fecha del Rebalanceo:
          </label>
          <DynamicDatePicker
            value={date}
            onChange={(val) => setDate(val)}
          />
        </div>

        {/* BATCH GROUP ADDER (Carga de Tickers en Bloque) */}
        <div
          style={{
            marginBottom: "14px",
            background: "rgba(255,255,255,0.02)",
            padding: "12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--accent-primary)",
              marginBottom: 6,
            }}
          >
            🚀 Cargar Grupo de Tickers en Bloque:
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              placeholder="ORCL HPQ ON NTAP AMAT..."
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBatchAdd()}
              style={{
                flex: 1,
                padding: "7px 10px",
                borderRadius: "4px",
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "#fff",
                fontSize: "0.78rem",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleBatchAdd}
              style={{ fontSize: "0.75rem", padding: "6px 12px", whiteSpace: "nowrap" }}
            >
              Cargar Grupo
            </button>
          </div>
          <span
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              marginTop: 4,
              display: "block",
            }}
          >
            Pega múltiples acciones separadas por espacio para agregarlas al instante.
          </span>
        </div>

        {/* Individual Ticker Search */}
        <div style={{ marginBottom: "14px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginBottom: 4,
            }}
          >
            O buscar y agregar ticker individual:
          </label>
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
              style={{ flex: 1, maxWidth: "160px", textTransform: "uppercase", fontSize: "0.8rem" }}
            />
            <button
              className="btn btn-ghost"
              onClick={handleSearch}
              disabled={searching || !query}
              style={{ fontSize: "0.75rem" }}
            >
              {searching ? (
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} />
              ) : (
                "🔍 Buscar"
              )}
            </button>
          </div>
          {searchError && (
            <div style={{ marginTop: 6, fontSize: "0.72rem", color: "var(--loss)" }}>
              {searchError}
            </div>
          )}

          {searchResult && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 14px",
                background: "rgba(0, 229, 255, 0.04)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(0, 229, 255, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong style={{ color: "var(--accent-primary)", fontSize: "0.9rem" }}>
                    {searchResult.ticker}
                  </strong>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.08)",
                      color: "#94a3b8",
                    }}
                  >
                    {searchResult.exchange}
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", marginTop: 2, color: "var(--text-primary)" }}>
                  {searchResult.name} ·{" "}
                  <strong style={{ color: "#fff" }}>${searchResult.price}</strong>
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                onClick={handleAddTicker}
              >
                + Agregar
              </button>
            </div>
          )}
        </div>

        {/* Selected Tickers List */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Empresas en este rebalanceo:{" "}
              <strong>
                {formTickers.length}/{numSlots} slots
              </strong>
            </span>
            {formTickers.length > 0 && (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  style={{
                    background: "#ef444422",
                    border: "1px solid #ef444455",
                    color: "#ef4444",
                    fontSize: "0.7rem",
                    cursor: "pointer",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    opacity: selectedForDeletion.length > 0 ? 1 : 0,
                    pointerEvents: selectedForDeletion.length > 0 ? "auto" : "none",
                    transition: "opacity 0.2s ease",
                  }}
                >
                  Borrar seleccionados ({Math.max(selectedForDeletion.length, 1)})
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#ef4444",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  Limpiar todo
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              minHeight: 40,
              padding: 8,
              background: "rgba(0,0,0,0.2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}
          >
            {formTickers.length === 0 ? (
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                No hay posiciones agregadas. Pega un grupo o busca un ticker.
              </span>
            ) : (
              formTickers.map((ticker) => (
                <div
                  key={ticker}
                  onClick={() => toggleForDeletion(ticker)}
                  style={{
                    background: selectedForDeletion.includes(ticker)
                      ? "#ef444426"
                      : "var(--bg-surface)",
                    border: `1px solid ${selectedForDeletion.includes(ticker) ? "#ef444459" : "var(--border)"}`,
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    display: "flex",
                    gap: "6px",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="Clic para seleccionar/deseleccionar para borrar"
                >
                  <span
                    style={{
                      color: selectedForDeletion.includes(ticker)
                        ? "#ef4444"
                        : "var(--accent-primary)",
                      fontWeight: "bold",
                    }}
                  >
                    {ticker}
                  </span>
                  <button
                    style={{
                      background: "none",
                      border: "none",
                      color: selectedForDeletion.includes(ticker) ? "#ef4444" : "var(--loss)",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      padding: 0,
                      opacity: 0.7,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTicker(ticker);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{
            marginTop: "18px",
            width: "100%",
            padding: "12px",
            fontSize: "0.85rem",
            fontWeight: 700,
          }}
          onClick={handleSubmit}
        >
          Guardar Rebalanceo ({date})
        </button>
        </div>
      )}
    </div>
  );
}
