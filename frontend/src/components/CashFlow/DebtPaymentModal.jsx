import React, { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function DebtPaymentModal({
  isOpen,
  onClose,
  debt,
  onRecordPayment,
  fixedIncomeAccounts = [],
  currency = "COP",
  fxRate = 4150,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const isReceivable = debt?.debtType === "receivable";
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState(() => debt?.paymentMethod || (isReceivable ? "Transferencia a Cajita / Cuenta" : "Nómina / Débito directa"));
  const [paymentSourceId, setPaymentSourceId] = useState(() => debt?.paymentSourceId || "");
  const [createIncomeMovement, setCreateIncomeMovement] = useState(true);
  const [createExpenseMovement, setCreateExpenseMovement] = useState(true);
  const [note, setNote] = useState("");

  if (!isOpen || !debt) return null;

  const remaining = Number(debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const pAmt = Number(amount) || 0;
    if (pAmt <= 0) {
      alert(`Ingresa un monto válido para el ${isReceivable ? "cobro" : "abono"}.`);
      return;
    }

    onRecordPayment(debt.id, {
      amount: pAmt,
      date,
      paymentMethod,
      paymentSourceId: paymentSourceId || null,
      createIncomeMovement: isReceivable ? createIncomeMovement : false,
      createExpenseMovement: !isReceivable ? createExpenseMovement : false,
      deductFromPayroll: true,
      note: note.trim(),
    });

    onClose();
  };

  const handlePayFull = () => {
    setAmount(String(remaining));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "460px",
          border: isReceivable
            ? (isLight ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(16, 185, 129, 0.5)")
            : (isLight ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(16, 185, 129, 0.4)"),
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          padding: "24px",
          color: "var(--text-primary)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "1.4rem" }}>{isReceivable ? "📥" : "💰"}</span>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>
                {isReceivable ? "Registrar Cobro / Abono Recibido" : "Abonar a Deuda"}
              </h2>
              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
                {debt.concept} ({isReceivable ? `Deudor: ${debt.debtor || debt.creditor}` : debt.creditor})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: "1.2rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Info Box */}
        <div
          style={{
            background: isReceivable
              ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)")
              : (isLight ? "rgba(244, 63, 94, 0.08)" : "rgba(244, 63, 94, 0.12)"),
            border: isReceivable
              ? "1px solid rgba(16, 185, 129, 0.3)"
              : "1px solid rgba(244, 63, 94, 0.25)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>
              {isReceivable ? "Saldo Pendiente por Cobrar" : "Saldo Pendiente"}
            </span>
            <span
              className="mono"
              style={{
                fontSize: "1.15rem",
                fontWeight: 800,
                color: isReceivable ? "#10b981" : "#f43f5e",
              }}
            >
              ${remaining.toLocaleString("en-US", { maximumFractionDigits: 2 })} {currency}
            </span>
          </div>
          <button
            type="button"
            onClick={handlePayFull}
            style={{
              background: "rgba(16, 185, 129, 0.18)",
              border: "1px solid rgba(16, 185, 129, 0.45)",
              color: "#10b981",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: "0.74rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {isReceivable ? "Cobrar Total" : "Pagar Total"}
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: "0.76rem", fontWeight: 700, display: "block", marginBottom: 4 }}>
              {isReceivable ? "Monto Cobrado / Recibido" : "Monto del Abono"} ({currency}) *
            </label>
            <input
              type="number"
              step="any"
              required
              placeholder="ej. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-surface)",
                border: "1.5px solid var(--border)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#10b981",
                fontSize: "1.05rem",
                fontWeight: 800,
                fontFamily: "JetBrains Mono, monospace",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, display: "block", marginBottom: 4 }}>
                {isReceivable ? "Fecha del Cobro" : "Fecha del Pago"}
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  color: "var(--text-primary)",
                  fontSize: "0.8rem",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 700, display: "block", marginBottom: 4 }}>
                {isReceivable ? "Medio de Recepción" : "Medio de Pago"}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "7px 10px",
                  color: "var(--text-primary)",
                  fontSize: "0.8rem",
                }}
              >
                {isReceivable ? (
                  <>
                    <option value="Transferencia a Cajita / Cuenta">Transferencia a Cajita</option>
                    <option value="Nómina / Débito directa">Transferencia a Nómina</option>
                    <option value="Transferencia Bancaria">Transferencia a otra cuenta</option>
                    <option value="Efectivo">En Efectivo</option>
                  </>
                ) : (
                  <>
                    <option value="Transferencia desde Cajita / Cuenta">Cajita específica</option>
                    <option value="Nómina / Débito directa">Nómina / Débito</option>
                    <option value="Transferencia Bancaria">Transferencia</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 700, display: "block", marginBottom: 4 }}>
              {isReceivable ? "Cuenta / Cajita Destino (Opcional)" : "Cuenta / Cajita Origen (Opcional)"}
            </label>
            <select
              value={paymentSourceId}
              onChange={(e) => setPaymentSourceId(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px",
                color: "var(--text-primary)",
                fontSize: "0.8rem",
              }}
            >
              <option value="">-- Seleccionar Cuenta / Cajita (Opcional) --</option>
              {fixedIncomeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} (${Number(acc.balance || 0).toLocaleString()} {acc.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Checkbox para registrar ingreso en Cash Flow cuando es cobro */}
          {isReceivable && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(16, 185, 129, 0.3)",
                fontSize: "0.75rem",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={createIncomeMovement}
                onChange={(e) => setCreateIncomeMovement(e.target.checked)}
                style={{ accentColor: "#10b981", width: 16, height: 16 }}
              />
              <span>
                <strong>Registrar como Ingreso real</strong> en el Flujo de Caja (Nómina/Cajita)
              </span>
            </label>
          )}

          {/* Checkbox para registrar salida en Cash Flow cuando es abono/pago de deuda */}
          {!isReceivable && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: isLight ? "rgba(244, 63, 94, 0.06)" : "rgba(244, 63, 94, 0.12)",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(244, 63, 94, 0.25)",
                fontSize: "0.75rem",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={createExpenseMovement}
                onChange={(e) => setCreateExpenseMovement(e.target.checked)}
                style={{ accentColor: "#f43f5e", width: 16, height: 16 }}
              />
              <span>
                <strong>Registrar salida en Flujo de Caja</strong> (descuenta de Saldo en Nómina)
              </span>
            </label>
          )}

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, display: "block", marginBottom: 4, color: "var(--text-muted)" }}>
              Nota / Comprobante (Opcional)
            </label>
            <input
              type="text"
              placeholder="ej. Transferencia #12345, comprobante Nequi..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{
                width: "100%",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "7px 10px",
                color: "var(--text-primary)",
                fontSize: "0.8rem",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 16px",
                color: "var(--text-secondary)",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                color: "#ffffff",
                fontSize: "0.82rem",
                cursor: "pointer",
                fontWeight: 700,
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
              }}
            >
              {isReceivable ? "Confirmar Cobro" : "Confirmar Abono"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
