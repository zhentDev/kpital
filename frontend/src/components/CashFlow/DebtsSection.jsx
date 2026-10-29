import React, { useState, useMemo } from "react";
import { useTheme } from "../../context/ThemeContext";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import { notifyDebtTelegramApi, checkDebtRemindersApi } from "../../api/client";
import { toast } from "react-hot-toast";
import { toastConfirm } from "../../utils/toastAlerts";
import { useCashFlowStore } from "../../store/cashFlowStore";
import "./CashFlow.css";

export default function DebtsSection({
  debts = [],
  onOpenDebtModal,
  onOpenPaymentModal,
  onDeleteDebt,
  onDeletePayment,
  fixedIncomeAccounts = [],
  currency = "COP",
  fxRate = 4150,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [sectionTab, setSectionTab] = useState("payable"); // 'payable' | 'receivable'
  const [expandedDebtIds, setExpandedDebtIds] = useState(new Set());
  const [filterStatus, setFilterStatus] = useState("active"); // 'active' | 'all' | 'paid'

  const toggleExpand = (id) => {
    setExpandedDebtIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isReceivableTab = sectionTab === "receivable";

  const handleDeletePayment = (debt, payment) => {
    const formattedAmt = formatCashFlowMoney(payment.amount, currency, fxRate);
    const isRec = debt.debtType === "receivable";
    const confirmMsg = `¿Deseas eliminar este ${isRec ? "cobro recibido" : "abono realizado"} de ${formattedAmt} (${payment.note || payment.paymentMethod || "Registro"})?\n\nEl saldo de la deuda se corregirá automáticamente sin duplicidades.`;
    if (window.confirm(confirmMsg)) {
      if (onDeletePayment) {
        onDeletePayment(debt.id, payment.id);
      } else {
        useCashFlowStore.getState().deleteDebtPayment(debt.id, payment.id);
      }
    }
  };

  // Split into Pasivos (yo debo) and Cuentas por cobrar (me deben)
  const payableDebts = useMemo(() => debts.filter((d) => d.debtType !== "receivable"), [debts]);
  const receivableDebts = useMemo(() => debts.filter((d) => d.debtType === "receivable"), [debts]);

  const activeDebtsList = isReceivableTab ? receivableDebts : payableDebts;

  const filteredDebts = activeDebtsList.filter((d) => {
    const rem = Number(d.remainingAmount !== undefined ? d.remainingAmount : d.totalAmount || 0);
    if (filterStatus === "active") return d.status !== "paid" && rem > 0;
    if (filterStatus === "paid") return d.status === "paid" || rem <= 0;
    return true;
  });

  const totalInitial = activeDebtsList.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);
  const totalRemaining = activeDebtsList.reduce(
    (sum, d) => sum + (Number(d.remainingAmount !== undefined ? d.remainingAmount : d.totalAmount) || 0),
    0
  );
  const totalPaid = Math.max(0, totalInitial - totalRemaining);
  const overallProgress = totalInitial > 0 ? ((totalPaid / totalInitial) * 100).toFixed(0) : 0;

  const [sendingAlertId, setSendingAlertId] = useState(null);
  const [checkingAll, setCheckingAll] = useState(false);

  const handleSendTelegramAlert = async (debt) => {
    try {
      setSendingAlertId(debt.id);
      await notifyDebtTelegramApi(debt.id);
      toast.success(
        debt.debtType === "receivable"
          ? `¡Recordatorio de cobro enviado a Telegram! 📲`
          : `¡Alarma de pago de deuda enviada a Telegram! 📲`,
        { icon: "✈️" }
      );
    } catch (err) {
      toast.error("Error al enviar alarma a Telegram");
    } finally {
      setSendingAlertId(null);
    }
  };

  const handleCheckAllReminders = async () => {
    try {
      setCheckingAll(true);
      const res = await checkDebtRemindersApi();
      if (res.notifiedCount > 0) {
        toast.success(`¡Se enviaron ${res.notifiedCount} recordatorios a Telegram! 📲`, { icon: "🔔" });
      } else {
        toast("No hay deudas con vencimiento en los próximos 3 días.", { icon: "✅" });
      }
    } catch (err) {
      toast.error("Error al verificar alarmas");
    } finally {
      setCheckingAll(false);
    }
  };

  const getDueDateInfo = (dueDate) => {
    if (!dueDate) return null;
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(dueDate).toISOString().slice(0, 10);
    if (due === today) {
      return { text: `⏰ Vence hoy (${dueDate})`, color: "#f59e0b", bg: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)", isOverdue: false };
    }
    if (due < today) {
      const diffDays = Math.round((new Date(today) - new Date(due)) / (1000 * 60 * 60 * 24));
      return { text: `⚠️ Vencido hace ${diffDays} día(s) (Quedó: ${dueDate})`, color: "#f43f5e", bg: isLight ? "rgba(244, 63, 94, 0.1)" : "rgba(244, 63, 94, 0.18)", isOverdue: true };
    }
    const diffDays = Math.round((new Date(due) - new Date(today)) / (1000 * 60 * 60 * 24));
    return { text: `🗓️ Quedó de pagar el ${dueDate} (en ${diffDays} días)`, color: "#10b981", bg: isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.18)", isOverdue: false };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Switcher de Pestañas: Pasivos (Yo debo) vs Préstamos a Mi Favor (Por Cobrar) ── */}
      <div
        style={{
          display: "flex",
          gap: 10,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setSectionTab("payable");
            setFilterStatus("active");
          }}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            border: !isReceivableTab ? "1.5px solid #f43f5e" : "1px solid var(--border)",
            background: !isReceivableTab
              ? isLight ? "rgba(244, 63, 94, 0.12)" : "rgba(244, 63, 94, 0.2)"
              : "var(--bg-surface)",
            color: !isReceivableTab ? (isLight ? "#be123c" : "#fb7185") : "var(--text-muted)",
            fontWeight: !isReceivableTab ? 800 : 600,
            fontSize: "0.82rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.15s ease",
          }}
        >
          <span>🔴</span>
          <span>Mis Deudas por Pagar (Pasivos)</span>
          <span
            style={{
              fontSize: "0.7rem",
              background: isLight ? "rgba(244, 63, 94, 0.15)" : "rgba(244, 63, 94, 0.3)",
              padding: "1px 7px",
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            {payableDebts.filter((d) => (d.remainingAmount || 0) > 0).length} activa(s)
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSectionTab("receivable");
            setFilterStatus("active");
          }}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            border: isReceivableTab ? "1.5px solid #10b981" : "1px solid var(--border)",
            background: isReceivableTab
              ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)"
              : "var(--bg-surface)",
            color: isReceivableTab ? (isLight ? "#047857" : "#34d399") : "var(--text-muted)",
            fontWeight: isReceivableTab ? 800 : 600,
            fontSize: "0.82rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all 0.15s ease",
          }}
        >
          <span>🟢</span>
          <span>Deudas a Mi Favor (Por Cobrar)</span>
          <span
            style={{
              fontSize: "0.7rem",
              background: isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.3)",
              padding: "1px 7px",
              borderRadius: 10,
              fontWeight: 700,
            }}
          >
            {receivableDebts.filter((d) => (d.remainingAmount || 0) > 0).length} pendiente(s)
          </span>
        </button>
      </div>

      {/* KPI Summary Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 16px",
            borderRadius: 12,
            border: isReceivableTab
              ? (isLight ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(16, 185, 129, 0.35)")
              : (isLight ? "1px solid rgba(244, 63, 94, 0.25)" : "1px solid rgba(244, 63, 94, 0.3)"),
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", fontWeight: 700, textTransform: "uppercase" }}>
            {isReceivableTab ? "Saldo Pendiente por Cobrar" : "Saldo Pendiente por Pagar"}
          </span>
          <span
            className="mono"
            style={{
              fontSize: "1.25rem",
              fontWeight: 800,
              color: isReceivableTab ? "#10b981" : (totalRemaining > 0 ? "#f43f5e" : "#10b981"),
            }}
          >
            ${totalRemaining.toLocaleString("en-US", { maximumFractionDigits: 0 })} {currency}
          </span>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
            {activeDebtsList.filter((d) => (d.remainingAmount || 0) > 0).length} {isReceivableTab ? "préstamo(s) por cobrar" : "deuda(s) activa(s)"}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 16px",
            borderRadius: 12,
            border: isLight ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(16, 185, 129, 0.3)",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", fontWeight: 700, textTransform: "uppercase" }}>
            {isReceivableTab ? "Total Cobrado / Recuperado" : "Total Pagado / Amortizado"}
          </span>
          <span className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: "#10b981" }}>
            +${totalPaid.toLocaleString("en-US", { maximumFractionDigits: 0 })} {currency}
          </span>
          <div style={{ fontSize: "0.68rem", color: "#10b981", marginTop: 2, fontWeight: 600 }}>
            {overallProgress}% {isReceivableTab ? "del capital prestado recuperado" : "del capital amortizado"}
          </div>
        </div>

        <div
          style={{
            background: "var(--bg-surface)",
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", fontWeight: 700, textTransform: "uppercase" }}>
            {isReceivableTab ? "Monto Total Prestado" : "Monto Total Inicial de Deudas"}
          </span>
          <span className="mono" style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)" }}>
            ${totalInitial.toLocaleString("en-US", { maximumFractionDigits: 0 })} {currency}
          </span>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
            {isReceivableTab ? "Total histórico prestado" : "Total histórico registrado"}
          </div>
        </div>
      </div>

      {/* Filter and Action Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setFilterStatus("active")}
            style={{
              background: filterStatus === "active"
                ? (isReceivableTab
                    ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.25)")
                    : (isLight ? "rgba(244, 63, 94, 0.15)" : "rgba(244, 63, 94, 0.25)"))
                : "var(--bg-surface)",
              border: filterStatus === "active"
                ? (isReceivableTab ? "1.5px solid #10b981" : "1.5px solid #f43f5e")
                : "1px solid var(--border)",
              color: filterStatus === "active"
                ? (isReceivableTab
                    ? (isLight ? "#047857" : "#34d399")
                    : (isLight ? "#be123c" : "#fb7185"))
                : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {isReceivableTab ? "🟢 Pendientes" : "🔴 Activas"} ({activeDebtsList.filter((d) => (d.remainingAmount || 0) > 0).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            style={{
              background: filterStatus === "all" ? (isLight ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.25)") : "var(--bg-surface)",
              border: filterStatus === "all" ? "1.5px solid #3b82f6" : "1px solid var(--border)",
              color: filterStatus === "all" ? (isLight ? "#1d4ed8" : "#93c5fd") : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Todas ({activeDebtsList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("paid")}
            style={{
              background: filterStatus === "paid" ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.25)") : "var(--bg-surface)",
              border: filterStatus === "paid" ? "1.5px solid #10b981" : "1px solid var(--border)",
              color: filterStatus === "paid" ? (isLight ? "#047857" : "#34d399") : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: 8,
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {isReceivableTab ? "🏁 Cobradas" : "🟢 Liquidadas"} ({activeDebtsList.filter((d) => (d.remainingAmount || 0) <= 0).length})
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCheckAllReminders}
            disabled={checkingAll}
            style={{
              background: isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(56, 189, 248, 0.14)",
              border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.3)" : "rgba(56, 189, 248, 0.35)"}`,
              color: isLight ? "#0284c7" : "#38bdf8",
              padding: "7px 12px",
              borderRadius: 8,
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            title="Verificar y enviar alarmas de deudas y cobros a Telegram"
          >
            <span>{checkingAll ? "⏳" : "📲"}</span>
            <span>{checkingAll ? "Verificando..." : "Alarma Telegram"}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenDebtModal(null, isReceivableTab ? "receivable" : "payable")}
            style={{
              background: isReceivableTab
                ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                : "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: "0.8rem",
              fontWeight: 800,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: isReceivableTab
                ? "0 4px 12px rgba(16, 185, 129, 0.25)"
                : "0 4px 12px rgba(244, 63, 94, 0.25)",
            }}
          >
            <span>+</span>
            <span>{isReceivableTab ? "Nuevo Préstamo por Cobrar" : "Nueva Deuda / Compromiso"}</span>
          </button>
        </div>
      </div>

      {/* Debts List */}
      {filteredDebts.length === 0 ? (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            padding: "36px 20px",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "2rem", display: "block", marginBottom: 8 }}>
            {isReceivableTab ? "🤝" : "🎉"}
          </span>
          <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "1rem" }}>
            {isReceivableTab
              ? filterStatus === "active"
                ? "¡No tienes deudas a tu favor pendientes por cobrar!"
                : "No hay préstamos registrados en esta vista"
              : filterStatus === "active"
              ? "¡No tienes deudas activas pendientes!"
              : "No hay deudas en esta vista"}
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", maxWidth: 460, margin: "6px auto 14px" }}>
            {isReceivableTab
              ? "Lleva el control exacto de dinero prestado a amigos o familiares, con la fecha prometida de pago y sin que cuente como movimiento hasta que efectivamente ingrese el dinero."
              : "Registra préstamos personales (ej. con mamá o familiares), créditos o compromisos especificando obligatoriamente su concepto y cómo los pagas."}
          </p>
          <button
            type="button"
            onClick={() => onOpenDebtModal(null, isReceivableTab ? "receivable" : "payable")}
            style={{
              background: isReceivableTab ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
              border: isReceivableTab ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(244, 63, 94, 0.4)",
              color: isReceivableTab
                ? (isLight ? "#047857" : "#34d399")
                : (isLight ? "#be123c" : "#fb7185"),
              borderRadius: 8,
              padding: "7px 16px",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {isReceivableTab ? "+ Registrar préstamo por cobrar" : "+ Registrar mi primera deuda"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredDebts.map((debt) => {
            const isExpanded = expandedDebtIds.has(debt.id);
            const initialAmt = Number(debt.totalAmount || 0);
            const remainingAmt = Number(debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0);
            const paidAmt = Math.max(0, initialAmt - remainingAmt);
            const progress = initialAmt > 0 ? Math.min(100, Math.round((paidAmt / initialAmt) * 100)) : 100;
            const isPaid = remainingAmt <= 0;
            const isReceivable = debt.debtType === "receivable";

            const matchedSource = fixedIncomeAccounts.find((a) => a.id === debt.paymentSourceId);
            const dueDateInfo = getDueDateInfo(debt.dueDate || debt.nextPaymentDate);

            return (
              <div
                key={debt.id}
                style={{
                  background: "var(--bg-surface)",
                  borderRadius: 12,
                  border: isPaid
                    ? (isLight ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(16, 185, 129, 0.25)")
                    : isReceivable
                    ? (isLight ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(16, 185, 129, 0.4)")
                    : (isLight ? "1px solid rgba(244, 63, 94, 0.25)" : "1px solid rgba(244, 63, 94, 0.3)"),
                  overflow: "hidden",
                  transition: "all 0.18s ease",
                }}
              >
                {/* Main Card Row */}
                <div
                  style={{
                    padding: "14px 18px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 14,
                  }}
                >
                  {/* Left: Concept + Creditor/Debtor + Payment Method */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240, flex: "1 1 280px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-primary)" }}>
                        {debt.concept}
                      </span>
                      {isPaid ? (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#10b981",
                            padding: "2px 7px",
                            borderRadius: 6,
                            border: "1px solid rgba(16, 185, 129, 0.35)",
                          }}
                        >
                          {isReceivable ? "🏁 COBRADO" : "🟢 PAGADA"}
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            background: isReceivable ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)",
                            color: isReceivable
                              ? (isLight ? "#047857" : "#34d399")
                              : (isLight ? "#be123c" : "#fb7185"),
                            padding: "2px 7px",
                            borderRadius: 6,
                            border: isReceivable
                              ? "1px solid rgba(16, 185, 129, 0.35)"
                              : "1px solid rgba(244, 63, 94, 0.35)",
                          }}
                        >
                          {isReceivable ? "🟢 PENDIENTE DE COBRO" : "🔴 ACTIVA"}
                        </span>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                      <span>
                        👤 {isReceivable ? "Deudor:" : "Acreedor:"}{" "}
                        <strong>{debt.debtor || debt.creditor}</strong>
                      </span>
                      {debt.isGroupSplit && (
                        <span
                          style={{
                            background: isLight ? "rgba(59, 130, 246, 0.12)" : "rgba(59, 130, 246, 0.2)",
                            color: isLight ? "#1d4ed8" : "#93c5fd",
                            padding: "2px 7px",
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: "0.7rem",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                          }}
                        >
                          👥 Gasto Compartido ({(debt.participants || []).filter(p => p.paid).length}/{(debt.participants || []).length} cobrados)
                        </span>
                      )}
                      {debt.isGroupSplit && debt.userIncluded && (
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          • Tu parte: {formatCashFlowMoney(debt.userShare || 0, currency, fxRate)}
                        </span>
                      )}
                      <span>•</span>
                      <span
                        style={{
                          background: isReceivable
                            ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.15)")
                            : (isLight ? "rgba(244, 63, 94, 0.08)" : "rgba(244, 63, 94, 0.15)"),
                          color: isReceivable
                            ? (isLight ? "#047857" : "#34d399")
                            : (isLight ? "#be123c" : "#fb7185"),
                          padding: "2px 6px",
                          borderRadius: 5,
                          fontWeight: 700,
                          fontSize: "0.7rem",
                          border: `1px solid ${
                            isReceivable
                              ? (isLight ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.3)")
                              : (isLight ? "rgba(244, 63, 94, 0.2)" : "rgba(244, 63, 94, 0.3)")
                          }`,
                        }}
                        title={isReceivable ? "Dónde se espera recibir el dinero" : "Cómo se paga esta deuda"}
                      >
                        {isReceivable ? "📥" : "🔄"} {debt.paymentMethod} {matchedSource ? `(${matchedSource.name})` : ""}
                      </span>

                      {debt.installmentAmount > 0 && (
                        <>
                          <span>•</span>
                          <span>
                            Cuota: <strong>${Number(debt.installmentAmount).toLocaleString()} {currency}</strong> (
                            {debt.paymentFrequency === "monthly" ? "Mensual" : debt.paymentFrequency}
                            )
                          </span>
                        </>
                      )}

                      {/* Fecha de pago / vencimiento */}
                      {dueDateInfo && !isPaid && (
                        <>
                          <span>•</span>
                          <span
                            style={{
                              color: dueDateInfo.color,
                              fontWeight: 700,
                              background: dueDateInfo.bg,
                              padding: "1px 6px",
                              borderRadius: 4,
                            }}
                          >
                            {dueDateInfo.text}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginTop: 4, maxWidth: 380 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 2 }}>
                        <span>{isReceivable ? "Cobrado:" : "Amortizado:"} ${paidAmt.toLocaleString()} ({progress}%)</span>
                        <span>Total: ${initialAmt.toLocaleString()}</span>
                      </div>
                      <div style={{ width: "100%", height: 6, background: "var(--bg-card)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <div
                          style={{
                            width: `${progress}%`,
                            height: "100%",
                            background: isPaid
                              ? "#10b981"
                              : isReceivable
                              ? "linear-gradient(90deg, #10b981, #34d399)"
                              : "linear-gradient(90deg, #f43f5e, #fb7185)",
                            borderRadius: 3,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right: Balances & Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", textTransform: "uppercase", fontWeight: 700 }}>
                        {isReceivable ? "Saldo por Cobrar" : "Saldo Pendiente"}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: "1.15rem",
                          fontWeight: 800,
                          color: isPaid ? "#10b981" : isReceivable ? "#10b981" : "#f43f5e",
                        }}
                      >
                        ${remainingAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{currency}</span>
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {!isPaid && (
                        <button
                          type="button"
                          onClick={() => onOpenPaymentModal(debt)}
                          style={{
                            background: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid rgba(16, 185, 129, 0.45)",
                            color: "#10b981",
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontSize: "0.76rem",
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                          title={isReceivable ? "Registrar cobro o pago recibido de este préstamo" : "Registrar un abono o pago total a esta deuda"}
                        >
                          <span>{isReceivable ? "📥" : "💰"}</span>
                          <span>{isReceivable ? "Registrar Cobro" : "Abonar"}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleExpand(debt.id)}
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--text-secondary)",
                          padding: "6px 9px",
                          borderRadius: 8,
                          fontSize: "0.74rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        title="Ver historial de abonos y notas"
                      >
                        {isExpanded ? "▲" : "▼"} {debt.paymentsLog?.length > 0 ? `(${debt.paymentsLog.length})` : ""}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSendTelegramAlert(debt)}
                        disabled={sendingAlertId === debt.id}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: isLight ? "#0284c7" : "#38bdf8",
                          cursor: "pointer",
                          fontSize: "0.95rem",
                          padding: "4px",
                          opacity: sendingAlertId === debt.id ? 0.5 : 1,
                        }}
                        title={isReceivable ? "Enviar alarma de cobro a tu Telegram" : "Enviar alarma de pago a tu Telegram"}
                      >
                        {sendingAlertId === debt.id ? "⏳" : "📲"}
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenDebtModal(debt, isReceivable ? "receivable" : "payable")}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "0.88rem",
                          padding: "4px",
                        }}
                        title={isReceivable ? "Editar Préstamo por Cobrar" : "Editar Deuda"}
                      >
                        ✏️
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          const actionText = isReceivable ? "el préstamo por cobrar" : "la deuda";
                          const ok = await toastConfirm(`¿Seguro que deseas eliminar ${actionText} "${debt.concept || debt.debtorName || debt.creditorName || ''}"?`);
                          if (ok) {
                            onDeleteDebt(debt.id);
                          }
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "0.88rem",
                          padding: "4px",
                        }}
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Section: Payments Log & Notes */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border)",
                      padding: "12px 18px",
                      background: isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.015)",
                    }}
                  >
                    {debt.notes && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 10, fontStyle: "italic" }}>
                        💬 Notas / Acuerdos: {debt.notes}
                      </div>
                    )}

                    {debt.isGroupSplit && Array.isArray(debt.participants) && debt.participants.length > 0 && (
                      <div style={{ marginBottom: 12, background: "var(--bg-surface)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                          👥 Participantes y Estado de Cuotas:
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
                          {debt.participants.map((p, idx) => (
                            <div
                              key={p.id || idx}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "6px 10px",
                                borderRadius: 6,
                                background: p.paid
                                  ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.15)")
                                  : p.paidAmount > 0
                                  ? (isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.15)")
                                  : "var(--bg-card)",
                                border: `1px solid ${p.paid ? "#10b981" : p.paidAmount > 0 ? (isLight ? "#d97706" : "#fbbf24") : "var(--border)"}`,
                                fontSize: "0.72rem",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span>{p.paid ? "✅" : p.paidAmount > 0 ? "🌗" : "⏳"}</span>
                                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</span>
                              </div>
                              <span style={{ fontWeight: 700, color: p.paid ? "#10b981" : p.paidAmount > 0 ? (isLight ? "#b45309" : "#fbbf24") : (isLight ? "#b45309" : "#fcd34d") }}>
                                {p.paidAmount > 0 && !p.paid ? `${formatCashFlowMoney(p.paidAmount, currency, fxRate)} / ` : ""}
                                {formatCashFlowMoney(p.customShare || p.share || 0, currency, fxRate)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                      {isReceivable ? "Historial de Cobros Recibidos:" : "Historial de Abonos Realizados:"}
                    </div>

                    {!debt.paymentsLog || debt.paymentsLog.length === 0 ? (
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {isReceivable
                          ? "No se han registrado cobros todavía para este préstamo."
                          : "No se han registrado abonos todavía para esta deuda."}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {debt.paymentsLog.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              background: "var(--bg-surface)",
                              padding: "6px 12px",
                              borderRadius: 6,
                              fontSize: "0.74rem",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                              <span style={{ color: "#10b981", fontWeight: 700 }}>
                                +{formatCashFlowMoney(p.amount, currency, fxRate)}
                              </span>
                              <span style={{ color: "var(--text-muted)" }}>• {p.date}</span>
                              <span style={{ color: "var(--text-secondary)" }}>
                                ({p.paymentMethod || (isReceivable ? "Cobro recibido" : "Abono")})
                              </span>
                              {p.note && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>"{p.note}"</span>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                              <span style={{ color: "#10b981", fontSize: "0.68rem", fontWeight: 700 }}>
                                ✓ {isReceivable ? "Ingresado" : "Aplicado"}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePayment(debt, p);
                                }}
                                title="Eliminar este cobro / abono para corregir saldo o duplicados"
                                style={{
                                  background: isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.16)",
                                  border: isLight ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(239, 68, 68, 0.35)",
                                  color: isLight ? "#dc2626" : "#f87171",
                                  cursor: "pointer",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "0.72rem",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = isLight ? "rgba(239, 68, 68, 0.18)" : "rgba(239, 68, 68, 0.28)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = isLight ? "rgba(239, 68, 68, 0.08)" : "rgba(239, 68, 68, 0.16)";
                                }}
                              >
                                <span>🗑️</span>
                                <span>Eliminar</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
