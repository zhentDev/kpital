import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function PlanConfigModal({ isOpen, onClose, onSave, initialConfig }) {
  const [frequencyDays, setFrequencyDays] = useState(15);
  const [avgAmount, setAvgAmount] = useState(100);
  const [distribution, setDistribution] = useState([{ ticker: "CSPX", pct: 100 }]);

  useEffect(() => {
    if (initialConfig) {
      setFrequencyDays(initialConfig.frequencyDays || 15);
      setAvgAmount(initialConfig.avgAmount || 100);

      if (initialConfig.distribution && Object.keys(initialConfig.distribution).length > 0) {
        setDistribution(
          Object.entries(initialConfig.distribution).map(([ticker, pct]) => ({ ticker, pct })),
        );
      } else {
        setDistribution([{ ticker: "CSPX", pct: 100 }]);
      }
    }
  }, [initialConfig, isOpen]);

  if (!isOpen) return null;

  const handleAddTicker = () => {
    setDistribution([...distribution, { ticker: "", pct: 0 }]);
  };

  const handleUpdateTicker = (index, field, value) => {
    const newDist = [...distribution];
    newDist[index][field] = field === "pct" ? Number(value) : value.toUpperCase();
    setDistribution(newDist);
  };

  const handleRemoveTicker = (index) => {
    const newDist = distribution.filter((_, i) => i !== index);
    setDistribution(newDist);
  };

  const handleSave = () => {
    // Validate total percentage
    const totalPct = distribution.reduce((sum, d) => sum + d.pct, 0);
    if (Math.abs(totalPct - 100) > 0.1) {
      toast.error("La suma de los porcentajes debe ser exactamente 100%");
      return;
    }

    // Validate tickers
    if (distribution.some((d) => !d.ticker.trim())) {
      toast.error("Todos los activos deben tener un ticker válido");
      return;
    }

    // Build config object
    const distObj = {};
    distribution.forEach((d) => {
      distObj[d.ticker] = d.pct;
    });

    onSave({
      frequencyDays: Number(frequencyDays),
      avgAmount: Number(avgAmount),
      distribution: distObj,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.7)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div className="card fade-up" style={{ width: "90%", maxWidth: 500, padding: 24 }}>
        <h3 style={{ margin: "0 0 20px 0", fontSize: "1.2rem", fontWeight: 700, color: "#f1f5f9" }}>
          Configuración Manual del Plan
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Frecuencia de Inversión
          </label>

          {/* Presets rápidos: Día, Semana, 2 semanas, Mes, 3 meses, 6 meses */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {[
              { label: "Día", days: 1 },
              { label: "Semana", days: 7 },
              { label: "2 semanas", days: 14 },
              { label: "Mes", days: 30 },
              { label: "3 meses", days: 90 },
              { label: "6 meses", days: 180 },
            ].map((preset) => {
              const isSelected = Number(frequencyDays) === preset.days;
              return (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => setFrequencyDays(preset.days)}
                  style={{
                    padding: "5px 11px",
                    borderRadius: "8px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: isSelected ? "1px solid var(--accent-primary, #00e5ff)" : "1px solid rgba(255, 255, 255, 0.1)",
                    background: isSelected ? "rgba(0, 229, 255, 0.15)" : "rgba(255, 255, 255, 0.04)",
                    color: isSelected ? "var(--accent-primary, #00e5ff)" : "var(--text-secondary, #94a3b8)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              className="input"
              value={frequencyDays}
              onChange={(e) => setFrequencyDays(e.target.value)}
              min="1"
              placeholder="Días personalizados"
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              días ({Number(frequencyDays) === 1 ? "Diario" : Number(frequencyDays) === 7 ? "Semanal" : Number(frequencyDays) === 14 ? "Cada 2 semanas" : Number(frequencyDays) === 30 ? "Mensual" : Number(frequencyDays) === 90 ? "Trimestral" : Number(frequencyDays) === 180 ? "Semestral" : `Cada ${frequencyDays} días`})
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Monto Promedio por Periodo (USD)
          </label>
          <input
            type="number"
            className="input"
            value={avgAmount}
            onChange={(e) => setAvgAmount(e.target.value)}
            min="1"
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Distribución de Activos (%)
            <button
              onClick={handleAddTicker}
              className="btn btn-sm"
              style={{ padding: "2px 8px", fontSize: "0.75rem" }}
            >
              + Añadir
            </button>
          </label>

          {distribution.map((d, idx) => (
            <div key={idx} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input
                type="text"
                className="input"
                placeholder="Ticker (ej. CSPX)"
                value={d.ticker}
                onChange={(e) => handleUpdateTicker(idx, "ticker", e.target.value)}
                style={{ flex: 1 }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6, width: 120 }}>
                <input
                  type="number"
                  className="input"
                  value={d.pct}
                  onChange={(e) => handleUpdateTicker(idx, "pct", e.target.value)}
                  min="0"
                  max="100"
                  style={{ width: "100%" }}
                />
                <span style={{ color: "var(--text-muted)" }}>%</span>
              </div>
              <button
                onClick={() => handleRemoveTicker(idx)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                  padding: "0 8px",
                }}
                title="Eliminar"
              >
                ✕
              </button>
            </div>
          ))}
          <div
            style={{
              textAlign: "right",
              fontSize: "0.8rem",
              color:
                distribution.reduce((sum, d) => sum + d.pct, 0) === 100 ? "#4ade80" : "#ef4444",
            }}
          >
            Total: {distribution.reduce((sum, d) => sum + d.pct, 0)}%
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            onClick={onClose}
            className="btn"
            style={{ background: "transparent", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button onClick={handleSave} className="btn btn-primary">
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
}
