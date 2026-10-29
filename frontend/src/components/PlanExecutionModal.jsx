import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DynamicDatePicker } from "./Common";

export default function PlanExecutionModal({
  isOpen,
  onClose,
  planAnalysis,
  liveQuotes,
  currentPurchases = [],
  onSave,
}) {
  const [executionDate, setExecutionDate] = useState("");
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (isOpen && planAnalysis) {
      // Usamos siempre la fecha de hoy como sugerencia para la ejecución real
      const today = new Date().toISOString().split("T")[0];
      setExecutionDate(today);

      const initialItems = Object.entries(planAnalysis.distribution).map(([ticker, pct]) => {
        const targetAmount = (pct / 100) * planAnalysis.avgAmount;

        let detectedPrice = "";
        let isEstimated = false;

        // 1. Intentar precio en vivo
        if (liveQuotes && liveQuotes[ticker] && liveQuotes[ticker].price) {
          detectedPrice = Number(liveQuotes[ticker].price);
        } else {
          // 2. Fallback: buscar el último precio de compra registrado para este activo
          const matchingPurchases = currentPurchases
            .filter((p) => p.ticker === ticker && Number(p.purchasePrice) > 0)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          if (matchingPurchases.length > 0) {
            detectedPrice = Number(matchingPurchases[0].purchasePrice);
            isEstimated = true;
          }
        }

        let initialShares = "";
        if (detectedPrice > 0) {
          initialShares = (targetAmount / detectedPrice).toFixed(4);
        }

        return {
          ticker,
          targetAmount,
          purchasePrice: detectedPrice ? detectedPrice.toString() : "",
          shares: initialShares,
          isEstimated,
        };
      });
      setItems(initialItems);
    }
  }, [isOpen, planAnalysis, liveQuotes, currentPurchases]);

  if (!isOpen || !planAnalysis) return null;

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;

    // Si el usuario cambia el precio, auto-recalcular el volumen para cumplir el monto objetivo
    if (field === "purchasePrice") {
      const numPrice = Number(value);
      if (numPrice > 0 && newItems[index].targetAmount > 0) {
        newItems[index].shares = (newItems[index].targetAmount / numPrice).toFixed(4);
      }
    }
    setItems(newItems);
  };

  const handleSave = () => {
    if (!executionDate) {
      toast.error("Debes seleccionar una fecha de ejecución.");
      return;
    }

    const validItems = items.filter((item) => item.purchasePrice > 0 && item.shares > 0);

    if (validItems.length === 0) {
      toast.error("Debes completar al menos un activo (Precio y Volumen).");
      return;
    }

    const purchases = validItems.map((item) => ({
      ticker: item.ticker,
      date: executionDate,
      purchasePrice: Number(item.purchasePrice),
      shares: Number(item.shares),
    }));

    onSave(purchases);
  };

  const totalTarget = planAnalysis.avgAmount;
  const totalInvested = items.reduce(
    (sum, item) => sum + (Number(item.purchasePrice) || 0) * (Number(item.shares) || 0),
    0,
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="card fade-up"
        style={{ width: "90%", maxWidth: 650, padding: 24, maxHeight: "90vh", overflowY: "auto" }}
      >
        <h3
          style={{
            margin: "0 0 8px 0",
            fontSize: "1.2rem",
            fontWeight: 700,
            color: "#00e5ff",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          🚀 Asistente de Ejecución de Plan
        </h3>
        <p style={{ margin: "0 0 20px 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Monto total del plan:{" "}
          <strong style={{ color: "#f1f5f9" }}>${totalTarget.toFixed(2)} USD</strong>
        </p>

        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              marginBottom: 6,
            }}
          >
            Fecha de Ejecución (Suele ser hoy o la fecha sugerida)
          </label>
          <DynamicDatePicker
            value={executionDate}
            onChange={(val) => setExecutionDate(val)}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              marginBottom: 12,
            }}
          >
            Activos a comprar según distribución
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {items.map((item, idx) => {
              const currentInvested =
                (Number(item.purchasePrice) || 0) * (Number(item.shares) || 0);
              const diff = currentInvested - item.targetAmount;
              const isClose = Math.abs(diff) < item.targetAmount * 0.1; // 10% tolerance

              return (
                <div
                  key={idx}
                  style={{
                    padding: 16,
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}
                  >
                    <strong style={{ fontSize: "1.05rem", color: "#f1f5f9" }}>{item.ticker}</strong>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      Objetivo:{" "}
                      <span style={{ color: "#00e5ff", fontWeight: 600 }}>
                        ${item.targetAmount.toFixed(2)}
                      </span>
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginBottom: 4,
                        }}
                      >
                        Precio de Apertura/Compra
                      </label>
                      <input
                        type="number"
                        className="input"
                        placeholder="Ej. 801.86"
                        value={item.purchasePrice}
                        onChange={(e) => handleUpdateItem(idx, "purchasePrice", e.target.value)}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginBottom: 4,
                        }}
                      >
                        Volumen / Acciones
                      </label>
                      <input
                        type="number"
                        className="input"
                        placeholder="Ej. 0.0073"
                        value={item.shares}
                        onChange={(e) => handleUpdateItem(idx, "shares", e.target.value)}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      fontSize: "0.8rem",
                      textAlign: "right",
                      display: "flex",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    Invertido:{" "}
                    <strong
                      style={{
                        color:
                          currentInvested > 0
                            ? isClose
                              ? "#4ade80"
                              : "#f59e0b"
                            : "var(--text-muted)",
                      }}
                    >
                      ${currentInvested.toFixed(2)}
                    </strong>
                    {currentInvested > 0 && (
                      <span style={{ color: diff > 0 ? "#ef4444" : "#4ade80", fontSize: "0.7rem" }}>
                        ({diff > 0 ? "+" : ""}
                        {diff.toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            padding: 16,
            background: "rgba(0,0,0,0.3)",
            borderRadius: 12,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Resumen de Ejecución:
          </span>
          <strong
            style={{
              fontSize: "1.2rem",
              color:
                Math.abs(totalInvested - totalTarget) < totalTarget * 0.1 ? "#4ade80" : "#f1f5f9",
            }}
          >
            ${totalInvested.toFixed(2)} / ${totalTarget.toFixed(2)}
          </strong>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            onClick={onClose}
            className="btn"
            style={{ background: "transparent", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            ✓ Confirmar y Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
