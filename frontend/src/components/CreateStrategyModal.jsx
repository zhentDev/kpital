import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const ICON_PRESETS = [
  "🚀", "💎", "⚡", "🧠", "🔥", "👑", "📈", "🛡️", "💰", "🤖", "🏆", "🎯",
  "🇺🇸", "🇪🇺", "🇨🇳", "🇯🇵", "🇬🇧", "🇲🇽", "🌎"
];

const COUNTRIES = [
  { code: "🇺🇸", name: "USA" },
  { code: "🇪🇺", name: "Europa" },
  { code: "🇨🇳", name: "China" },
  { code: "🇯🇵", name: "Japón" },
  { code: "🇬🇧", name: "UK" },
  { code: "🇲🇽", name: "LatAm" },
  { code: "🌎", name: "Global" },
];

const BENCHMARKS = [
  "S&P 500 (^GSPC)",
  "NASDAQ 100 (^IXIC)",
  "S&P MidCap 400 (IJH)",
  "Russell 2000 (IWM)",
  "EuroStoxx 50 (FEZ)",
  "MSCI World (URTH)",
];

export default function CreateStrategyModal({
  isOpen,
  onClose,
  onCreate,
  editStrategy = null,
  onUpdate = null,
}) {
  if (!isOpen) return null;

  const isEdit = Boolean(editStrategy);

  const [name, setName] = useState(editStrategy?.name || "");
  const [country, setCountry] = useState(editStrategy?.country || "🇺🇸");
  const [numSlots, setNumSlots] = useState(editStrategy?.numSlots || 20);
  const [capital, setCapital] = useState(editStrategy?.capital || 1000);
  const [benchmark, setBenchmark] = useState(editStrategy?.benchmark || "S&P 500 (^GSPC)");
  const [color, setColor] = useState(editStrategy?.color || "#a855f7");
  const [isRealMoney, setIsRealMoney] = useState(editStrategy?.isRealMoney || false);

  useEffect(() => {
    if (editStrategy) {
      setName(editStrategy.name || "");
      setCountry(editStrategy.country || "🇺🇸");
      setNumSlots(editStrategy.numSlots || 20);
      setCapital(editStrategy.capital || 1000);
      setBenchmark(editStrategy.benchmark || "S&P 500 (^GSPC)");
      setColor(editStrategy.color || "#a855f7");
      setIsRealMoney(Boolean(editStrategy.isRealMoney));
    } else {
      setName("");
      setCountry("🇺🇸");
      setNumSlots(20);
      setCapital(1000);
      setBenchmark("S&P 500 (^GSPC)");
      setColor("#a855f7");
      setIsRealMoney(false);
    }
  }, [editStrategy, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Por favor ingresa un nombre para la estrategia");
      return;
    }

    const payload = {
      name: name.trim(),
      country,
      numSlots: Number(numSlots) || 20,
      capital: Number(capital) || 1000,
      benchmark,
      color: isRealMoney ? (color === "#a855f7" ? "#10b981" : color) : color,
      isRealMoney: Boolean(isRealMoney),
    };

    if (isEdit && onUpdate) {
      onUpdate(editStrategy.id, payload);
      toast.success("Estrategia actualizada correctamente");
    } else if (onCreate) {
      onCreate(payload);
      toast.success("Estrategia creada correctamente");
    }

    onClose();
  };

  return (
    <div
      className="modal-overlay-responsive"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        className="card fade-up modal-sheet-responsive"
        style={{
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          background: "var(--bg-card)",
          border: isRealMoney ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: isRealMoney
            ? "0 20px 40px rgba(16, 185, 129, 0.15)"
            : "0 20px 40px rgba(0, 0, 0, 0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-drag-handle" />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.4rem" }}>{isEdit ? "✏️" : isRealMoney ? "💵" : "✨"}</span>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#f1f5f9" }}>
              {isEdit ? `Modificar: ${editStrategy.name}` : "Crear Nueva Estrategia"}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "1.2rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          {/* Tipo de Portafolio: Dinero Real vs Simulación */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Tipo de Portafolio:
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() => setIsRealMoney(false)}
                style={{
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: !isRealMoney
                    ? "2px solid #a855f7"
                    : "1px solid var(--border)",
                  background: !isRealMoney ? "rgba(168, 85, 247, 0.15)" : "var(--bg-surface)",
                  color: !isRealMoney ? "#c084fc" : "var(--text-muted)",
                  fontWeight: !isRealMoney ? 700 : 500,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>🧪</span>
                <span>Simulación / ProPicks</span>
                <span style={{ fontSize: "0.68rem", opacity: 0.8 }}>Modelo teórico / Backtest</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRealMoney(true)}
                style={{
                  padding: "10px",
                  borderRadius: "var(--radius-sm)",
                  border: isRealMoney
                    ? "2px solid #10b981"
                    : "1px solid var(--border)",
                  background: isRealMoney ? "rgba(16, 185, 129, 0.15)" : "var(--bg-surface)",
                  color: isRealMoney ? "#34d399" : "var(--text-muted)",
                  fontWeight: isRealMoney ? 700 : 500,
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: "1.2rem" }}>💵</span>
                <span>Dinero Real Activo</span>
                <span style={{ fontSize: "0.68rem", opacity: 0.8 }}>Inversión real en vivo</span>
              </button>
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Nombre de la Estrategia:
            </label>
            <input
              type="text"
              placeholder="Ej. Mejores acciones - sept 2026, Top Dividendos..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "#fff",
                fontSize: "0.85rem",
              }}
            />
          </div>

          {/* Icono / Emoji de la Estrategia */}
          <div>
            <label
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              <span>Ícono / Emoji:</span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                Selecciona uno o escribe tu propio emoji
              </span>
            </label>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              {ICON_PRESETS.map((ic) => (
                <button
                  type="button"
                  key={ic}
                  onClick={() => setCountry(ic)}
                  style={{
                    fontSize: "1.05rem",
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: country === ic ? "2px solid var(--accent-primary)" : "1px solid var(--border)",
                    background: country === ic ? "rgba(0, 229, 255, 0.15)" : "var(--bg-surface)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title={ic}
                >
                  {ic}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Personalizado:</span>
              <input
                type="text"
                maxLength={4}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Ej. 🚀, ⚡, 🇺🇸"
                style={{
                  width: 80,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "#fff",
                  fontSize: "0.9rem",
                  textAlign: "center",
                }}
              />
            </div>
          </div>

          {/* Cantidad de Posiciones (Slots) & Capital Base */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                }}
              >
                Cantidad de Slots:
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={numSlots}
                  onChange={(e) => setNumSlots(Number(e.target.value) || 20)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--accent-primary)",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                  }}
                />
                <span
                  style={{ fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}
                >
                  ({(100 / numSlots).toFixed(1)}% c/u)
                </span>
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: 6,
                }}
              >
                Capital Base ($):
              </label>
              <input
                type="number"
                min={1}
                step="any"
                value={capital}
                onChange={(e) => setCapital(e.target.value === "" ? "" : Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--accent-primary)",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                }}
              />
            </div>
          </div>

          {/* Benchmark de Referencia */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Índice Benchmark de Referencia:
            </label>
            <select
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                color: "#fff",
                fontSize: "0.85rem",
              }}
            >
              {BENCHMARKS.map((b) => (
                <option key={b} value={b} style={{ background: "#0b1120", color: "#fff" }}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Botones de acción */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ padding: "8px 16px", fontSize: "0.8rem" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: "8px 20px", fontSize: "0.85rem", fontWeight: 700 }}
            >
              {isEdit ? "💾 Guardar Cambios" : "🚀 Crear Estrategia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
