import React from "react";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import { useTheme } from "../../context/ThemeContext";
import { toastConfirm } from "../../utils/toastAlerts";
import "./CashFlow.css";

// Calculate active installment index for a given period
function getInstallmentInfo(purchase, activePeriod) {
  if (!purchase.startPeriod || !purchase.installmentsCount) return null;
  const [startYear, startMonth] = purchase.startPeriod.split("-").map(Number);
  const [activeYear, activeMonth] = activePeriod.split("-").map(Number);

  const monthDiff = (activeYear - startYear) * 12 + (activeMonth - startMonth);
  if (monthDiff < 0) {
    return { isActive: false, status: "future", installmentNumber: 0 };
  }
  if (monthDiff >= purchase.installmentsCount) {
    return { isActive: false, status: "completed", installmentNumber: purchase.installmentsCount };
  }

  return {
    isActive: true,
    status: "active",
    installmentNumber: monthDiff + 1,
    remainingInstallments: purchase.installmentsCount - (monthDiff + 1),
    remainingBalance: Math.max(0, purchase.totalAmount - (monthDiff + 1) * (purchase.totalAmount / purchase.installmentsCount)),
  };
}

export default function CreditCardsSection({
  creditCards = [],
  creditPurchases = [],
  creditCardPayments = [],
  netSalary = 0,
  activePeriod,
  currency = "COP",
  fxRate = 4150,
  onOpenCreditPurchaseModal,
  onOpenNewCardModal,
  onOpenEditCardModal,
  onOpenPaymentModal,
  onDeletePurchase,
  onDeleteCard,
  onDeletePayment,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);

  // Aggregate card usage and monthly bill for activePeriod
  const cardMetrics = creditCards.map((card) => {
    const cardPurchases = creditPurchases.filter((p) => p.cardId === card.id);
    let purchasesUsedLimit = 0;
    let monthlyBill = 0;

    cardPurchases.forEach((p) => {
      const tot = Number(p.totalAmount) || Number(p.amount) || Number(p.monthlyInstallment) || 0;
      const normalizedP = {
        ...p,
        totalAmount: tot,
        amount: tot,
        monthlyInstallment: Number(p.monthlyInstallment) || tot,
      };
      const info = getInstallmentInfo(normalizedP, activePeriod);
      if (info && info.status !== "completed") {
        purchasesUsedLimit += tot;
      }
      if (info && info.isActive) {
        monthlyBill += Number(p.monthlyInstallment) || tot;
      }
    });

    // Dynamic usedLimit: prioritize active purchases sum if purchases exist, or fallback to card.usedLimit
    const usedLimit = purchasesUsedLimit > 0 ? purchasesUsedLimit : (card.usedLimit !== undefined ? Number(card.usedLimit) : 0);
    const availableLimit = Math.max(0, (Number(card.totalLimit) || 0) - usedLimit);
    const usagePct = card.totalLimit > 0 ? ((usedLimit / card.totalLimit) * 100).toFixed(0) : 0;

    return {
      ...card,
      usedLimit,
      availableLimit,
      monthlyBill,
      usagePct,
      purchasesCount: cardPurchases.length,
    };
  });

  const totalMonthlyCreditBill = cardMetrics.reduce((acc, c) => acc + c.monthlyBill, 0);

  // ── Financial Health Rule: Max Credit Quota <= 50% of Net Salary ──
  const totalCreditLimit = creditCards.reduce((acc, c) => acc + (Number(c.totalLimit) || 0), 0);
  const totalCreditUsed = cardMetrics.reduce((acc, c) => acc + (Number(c.usedLimit) || 0), 0);
  const baseSalaryNet = Number(netSalary) > 0 ? Number(netSalary) : 3662854;
  const maxSafeCreditLimit = baseSalaryNet * 0.5;
  const exposurePct = baseSalaryNet > 0 ? ((totalCreditLimit / baseSalaryNet) * 100).toFixed(1) : "0.0";
  const isOverSafeLimit = totalCreditLimit > maxSafeCreditLimit;
  const excessAmount = Math.max(0, totalCreditLimit - maxSafeCreditLimit);
  const remainingSafeRoom = Math.max(0, maxSafeCreditLimit - totalCreditLimit);

  const handleDeletePurchase = async (purchase) => {
    const title = purchase.description || "esta compra a cuotas";
    const formattedAmt = formatMoney(purchase.monthlyInstallment || purchase.totalAmount, currency);
    const ok = await toastConfirm(
      `¿Estás seguro de que deseas eliminar la compra diferida "${title}" (${formattedAmt})?\n\nEl cupo utilizado de la tarjeta se liberará automáticamente.`
    );
    if (ok && onDeletePurchase) {
      onDeletePurchase(purchase.id);
    }
  };

  const handleDeletePayment = async (payment) => {
    const cardTitle = payment.cardName || "tarjeta";
    const formattedAmt = formatMoney(payment.amount, currency);
    const ok = await toastConfirm(
      `¿Estás seguro de que deseas eliminar el abono a "${cardTitle}" por ${formattedAmt}?`
    );
    if (ok && onDeletePayment) {
      onDeletePayment(payment.id);
    }
  };

  return (
    <div className="cashflow-credit-section" style={{ marginTop: 8 }}>
      {/* Section Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 10 }}>
            <span>💳</span> Tarjetas de Crédito & Financiación Inteligente
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Control de cupos reales, compras a 0% cuotas (MSI / RappiCard) y pagos de deuda / abonos a capital.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {totalCreditUsed > 0 && onOpenPaymentModal && (
            <button
              type="button"
              className="cashflow-action-btn secondary"
              onClick={() => onOpenPaymentModal("ALL", totalCreditUsed)}
              style={{
                fontSize: "0.84rem",
                padding: "9px 16px",
                borderColor: "rgba(56, 189, 248, 0.4)",
                color: "#38bdf8",
                background: "rgba(56, 189, 248, 0.12)",
                fontWeight: 700,
              }}
              title="Pagar la deuda total de todas tus tarjetas y descontarla de tus rubros de Ahorro y Salidas del mes"
            >
              <span>⚡</span> Dejar Todas en $0 ({formatMoney(totalCreditUsed, currency)})
            </button>
          )}

          {onOpenPaymentModal && (
            <button
              type="button"
              className="cashflow-action-btn secondary"
              onClick={() => onOpenPaymentModal()}
              style={{
                fontSize: "0.84rem",
                padding: "9px 16px",
                borderColor: "rgba(16, 185, 129, 0.4)",
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.12)",
              }}
            >
              <span>💵</span> Pagar / Abonar Tarjeta
            </button>
          )}

          {onOpenNewCardModal && (
            <button
              type="button"
              className="cashflow-action-btn secondary"
              onClick={onOpenNewCardModal}
              style={{ fontSize: "0.84rem", padding: "9px 16px", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <span>+</span> Nueva Tarjeta
            </button>
          )}

          <button
            type="button"
            className="cashflow-action-btn primary"
            onClick={onOpenCreditPurchaseModal}
            style={{ fontSize: "0.84rem", padding: "9px 16px" }}
          >
            <span>+</span> Registrar Compra / Diferido
          </button>
        </div>
      </div>

      {/* ── 50% Net Salary Debt Capacity & Credit Exposure Indicator ── */}
      <div
        style={{
          background: isOverSafeLimit
            ? (isLight ? "linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, #ffffff 100%)" : "linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, var(--bg-surface) 100%)")
            : (isLight ? "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, #ffffff 100%)" : "linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, var(--bg-surface) 100%)"),
          border: isOverSafeLimit
            ? (isLight ? "1px solid rgba(244, 63, 94, 0.3)" : "1px solid rgba(244, 63, 94, 0.35)")
            : (isLight ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(16, 185, 129, 0.3)"),
          borderRadius: "18px",
          padding: "16px 18px",
          marginBottom: 20,
          backdropFilter: "blur(14px)",
          boxShadow: isLight
            ? "0 4px 16px rgba(0, 0, 0, 0.04)"
            : (isOverSafeLimit ? "0 8px 24px rgba(244, 63, 94, 0.15)" : "0 8px 24px rgba(16, 185, 129, 0.1)"),
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 240px" }}>
            <span style={{ fontSize: "1.4rem" }}>{isOverSafeLimit ? "⚠️" : "🛡️"}</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                  Regla de Seguridad Crediticia: Máximo 50% del Salario Neto
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "8px",
                    background: isOverSafeLimit
                      ? (isLight ? "rgba(244, 63, 94, 0.14)" : "rgba(244, 63, 94, 0.2)")
                      : (isLight ? "rgba(16, 185, 129, 0.14)" : "rgba(16, 185, 129, 0.2)"),
                    color: isOverSafeLimit ? (isLight ? "#e11d48" : "#f43f5e") : (isLight ? "#047857" : "#10b981"),
                  }}
                >
                  {isOverSafeLimit ? `Exposición Alta: ${exposurePct}%` : `Exposición Segura: ${exposurePct}%`}
                </span>
              </div>
              <p style={{ margin: "3px 0 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Salario Neto Base: <strong style={{ color: "var(--text-primary)" }}>{formatMoney(baseSalaryNet)}</strong> • Cupo Máximo Prudente (50%): <strong style={{ color: isLight ? "#0284c7" : "#38bdf8" }}>{formatMoney(maxSafeCreditLimit)}</strong>
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "center", marginLeft: "auto" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Cupo Total en Tarjetas</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: "1.15rem", color: isOverSafeLimit ? "#f43f5e" : (isLight ? "#047857" : "#10b981") }}>
                {formatMoney(totalCreditLimit)}
              </div>
            </div>
          </div>
        </div>

        {/* Visual Range Thermometer Bar */}
        <div style={{ position: "relative", width: "100%", height: "10px", background: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)", borderRadius: "6px", overflow: "hidden", marginBottom: 10 }}>
          <div
            style={{
              width: `${Math.min(100, (totalCreditLimit / (maxSafeCreditLimit * 1.5 || 1)) * 100)}%`,
              height: "100%",
              background: isOverSafeLimit
                ? "linear-gradient(90deg, #10b981 0%, #fbbf24 60%, #f43f5e 100%)"
                : "linear-gradient(90deg, #10b981 0%, #34d399 100%)",
              borderRadius: "6px",
              transition: "width 0.4s ease",
            }}
          />
        </div>

        {/* Guidance and Action Recommendation */}
        <div style={{ fontSize: "0.78rem", color: isLight ? (isOverSafeLimit ? "#991b1b" : "#065f46") : (isOverSafeLimit ? "#fca5a5" : "#a7f3d0"), display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: "1 1 260px" }}>
            {isOverSafeLimit ? (
              <span>
                🚨 <strong>Sobrepasas el límite prudente por {formatMoney(excessAmount)}</strong>. Para tener control total y evitar compras impulsivas, edita tus tarjetas o pide a tus bancos bajar los cupos hasta sumar máximo <strong>{formatMoney(maxSafeCreditLimit)}</strong>.
              </span>
            ) : (
              <span>
                ✅ <strong>¡Excelente control!</strong> Tu cupo total está dentro del rango seguro del 50% de tu sueldo neto. Tienes <strong>{formatMoney(remainingSafeRoom)}</strong> de margen de seguridad antes de alcanzar el tope prudente.
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
            Deuda Actual Usada: <strong style={{ color: totalCreditUsed > 0 ? "#f43f5e" : (isLight ? "#047857" : "#10b981") }}>{formatMoney(totalCreditUsed)}</strong> ({totalCreditLimit > 0 ? ((totalCreditUsed / totalCreditLimit) * 100).toFixed(0) : 0}% del cupo)
          </div>
        </div>
      </div>

      {/* Credit Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16 }}>
        {cardMetrics.map((card) => {
          const isHighUsage = Number(card.usagePct) > 70;
          return (
            <div
              key={card.id}
              style={{
                background: "var(--bg-surface)",
                border: `1px solid var(--border)`,
                borderTop: `4px solid ${card.color || "#820ad1"}`,
                borderRadius: "18px",
                padding: "18px 18px",
                backdropFilter: "blur(16px)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
                boxShadow: "var(--shadow-card)",
              }}
            >
              {/* Card Title & Icon */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
                  <span style={{ fontSize: "1.6rem" }}>{card.icon || "💳"}</span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {card.name}
                      </h4>
                      {onOpenEditCardModal && (
                        <button
                          type="button"
                          onClick={() => onOpenEditCardModal(card)}
                          title="Editar cupo total, cupo usado, fechas o tasa de esta tarjeta"
                          style={{
                            background: "rgba(56, 189, 248, 0.12)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            borderRadius: "6px",
                            color: "#38bdf8",
                            cursor: "pointer",
                            padding: "3px 6px",
                            fontSize: "0.8rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          ✏️ <span style={{ fontSize: "0.72rem", fontWeight: 600 }}>Editar</span>
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: 2 }}>
                      Corte: Día {card.closingDay || 15} • Pago: Día {card.paymentDay || 2}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: "120px" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>
                    {card.monthlyBill > 0 ? "Factura / Cuota Mes" : "Saldo por Pagar"}
                  </span>
                  <strong style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.15rem", color: (card.monthlyBill > 0 || card.usedLimit > 0) ? "#f43f5e" : "#10b981" }}>
                    {formatMoney(card.monthlyBill > 0 ? card.monthlyBill : card.usedLimit, currency)}
                  </strong>
                </div>
              </div>

              {/* Limit Progress Track */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: 6 }}>
                  <span
                    style={{ color: "var(--text-muted)", cursor: onOpenEditCardModal ? "pointer" : "default" }}
                    onClick={() => onOpenEditCardModal && onOpenEditCardModal(card)}
                    title="Clic para editar el cupo usado manualmente"
                  >
                    Cupo Usado: <strong style={{ color: isHighUsage ? "#f43f5e" : "var(--text-primary)", textDecoration: "underline", textDecorationColor: "var(--border)" }}>{formatMoney(card.usedLimit, currency)}</strong> ✏️
                  </span>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>
                    Libre: {formatMoney(card.availableLimit, currency)} ({100 - card.usagePct}%)
                  </span>
                </div>
                <div className="cashflow-pillar-progress-track">
                  <div
                    className="cashflow-pillar-progress-fill"
                    style={{
                      width: `${Math.min(100, card.usagePct)}%`,
                      background: isHighUsage ? "#f43f5e" : card.color || "#00e5ff",
                      boxShadow: `0 0 10px ${card.color || "#00e5ff"}88`,
                    }}
                  />
                </div>
              </div>

              {/* Details Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: 10, flexWrap: "wrap", gap: 8 }}>
                <span>Cupo Total: <strong>{formatMoney(card.totalLimit, currency)}</strong></span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {card.usedLimit > 0 && onOpenPaymentModal && (
                    <button
                      type="button"
                      onClick={() => onOpenPaymentModal(card.id, card.usedLimit)}
                      style={{
                        background: "rgba(16, 185, 129, 0.14)",
                        border: "1px solid rgba(16, 185, 129, 0.4)",
                        color: "#10b981",
                        borderRadius: "6px",
                        padding: "3px 8px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Pagar el saldo total de esta tarjeta y descontarlo de tus rubros de ahorro o salidas del mes"
                    >
                      💵 Pagar a $0 ({formatMoney(card.usedLimit, currency)})
                    </button>
                  )}
                  <span style={{ color: isLight ? "#0284c7" : "#38bdf8", fontWeight: 700 }}>Tasa: {card.rateEA || 24.5}% E.A. (SFC)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Installment Purchases in this Month */}
      <div style={{ marginTop: 20, background: "var(--bg-surface)", borderRadius: "18px", border: "1px solid var(--border)", padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
            🛍️ Compras a Cuotas Activas en este Período ({activePeriod})
          </h4>
          <span style={{ fontSize: "0.82rem", color: isLight ? "#0284c7" : "#38bdf8", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
            Total Cuotas del Mes: {formatMoney(totalMonthlyCreditBill, currency)}
          </span>
        </div>

        {creditPurchases.length === 0 ? (
          <div style={{ textAlign: "center", padding: "18px 0", color: "var(--text-muted)", fontSize: "0.84rem" }}>
            No tienes compras a cuotas o diferidos registrados en este período.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {creditPurchases.map((purchase) => {
              const info = getInstallmentInfo(purchase, activePeriod);
              const card = creditCards.find((c) => c.id === purchase.cardId);

              return (
                <div
                  key={purchase.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: "1.3rem" }}>{card?.icon || "💳"}</span>
                    <div>
                      <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        {purchase.description}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                        <span style={{ color: card?.color || (isLight ? "#0284c7" : "#38bdf8"), fontWeight: 700 }}>{card?.name}</span>
                        <span>•</span>
                        {purchase.interestType === "zero_interest" ? (
                          <span style={{ color: isLight ? "#0284c7" : "#38bdf8", fontWeight: 700 }}>⚡ 0% Interés (MSI)</span>
                        ) : (
                          <span style={{ color: "#f43f5e" }}>📈 Interés Corriente</span>
                        )}
                        <span>•</span>
                        {info && info.isActive ? (
                          <span style={{ color: "#10b981", fontWeight: 700 }}>
                            Cuota {info.installmentNumber} de {purchase.installmentsCount}
                          </span>
                        ) : info?.status === "completed" ? (
                          <span style={{ color: "var(--text-muted)" }}>✅ Totalmente Pagada</span>
                        ) : (
                          <span style={{ color: "#fbbf24" }}>⏳ Inicia en {purchase.startPeriod}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem", fontWeight: 700, color: info?.isActive ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {formatMoney(purchase.monthlyInstallment || purchase.totalAmount || purchase.amount, currency)} / mes
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        Total: {formatMoney(purchase.totalAmount || purchase.amount || purchase.monthlyInstallment, currency)}
                      </div>
                    </div>

                    {onDeletePurchase && (
                      <button
                        type="button"
                        onClick={() => handleDeletePurchase(purchase)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "6px",
                          fontSize: "0.9rem",
                          borderRadius: "6px",
                          transition: "all 0.15s ease",
                        }}
                        title="Eliminar compra diferida"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Credit Card Payments Log in Active Period */}
      {creditCardPayments.length > 0 && (
        <div style={{ marginTop: 18, background: "var(--bg-surface)", borderRadius: "18px", border: "1px solid var(--border)", padding: "18px 22px", boxShadow: "var(--shadow-card)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: 8 }}>
              <span>💵</span> Pagos y Abonos a Tarjetas ({activePeriod})
            </h4>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {creditCardPayments
              .filter((p) => !p.period || p.period === activePeriod)
              .map((payment) => (
                <div
                  key={payment.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {payment.cardName} • {payment.description || "Abono a tarjeta"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                      {payment.date || "Fecha"} • Pagado con {payment.sourceAccount || "Nómina"}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.95rem", fontWeight: 700, color: "#10b981" }}>
                      -{formatMoney(payment.amount, currency)}
                    </span>
                    {onDeletePayment && (
                      <button
                        type="button"
                        onClick={() => handleDeletePayment(payment)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          padding: "4px",
                          fontSize: "0.85rem",
                        }}
                        title="Revertir este pago"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
