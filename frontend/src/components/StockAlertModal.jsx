import React, { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import InfoTooltip from "./Common/InfoTooltip";
import { testStockAlertEmail, testStockAlertTelegram } from "../api/client";
import { useAuthStore } from "../store/authStore";

export default function StockAlertModal({
  isOpen,
  onClose,
  initialAlert = null,
  ticker = "",
  alertKey = "", // e.g. "IPLT.L" (parent) or "IPLT.L::lot_123" (individual lot)
  lotLabel = null,
  isParentGroup = false,
  companyName = "",
  currentPrice = 0,
  entryPrice = 0,
  currentReturnPct = 0,
  scope = "strategy", // 'strategy' or 'purchase'
  targetId = "historical",
  userEmail = "",
  onSave,
  onDelete,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const curRet = Number(currentReturnPct) || 0;
  const curP = Number(currentPrice) || 0;
  const entP = Number(entryPrice) || 0;

  // Smart default values for each mode based on current return
  const defaultProfitTarget = useMemo(() => {
    if (curRet < -15) return -20.0;
    if (curRet < 0) return 5.0;
    return Math.ceil((curRet + 10) / 5) * 5;
  }, [curRet]);

  const defaultStopLoss = useMemo(() => {
    if (curRet < 0) {
      return Math.floor(curRet - 5);
    }
    return -10.0;
  }, [curRet]);

  const [alertType, setAlertType] = useState("PROFIT_TARGET");
  const [targetValue, setTargetValue] = useState(15.0);
  const [isActive, setIsActive] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyApp, setNotifyApp] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [customEmail, setCustomEmail] = useState(userEmail || "");
  const [isSaving, setIsSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState(null);

  const authUser = useAuthStore((state) => state.user);
  const effectiveEmail = (authUser?.email || userEmail || customEmail || "").toLowerCase().trim();
  const isOwner = effectiveEmail === "caballerojesus703@hotmail.com";


  useEffect(() => {
    if (!isOpen) return;
    if (initialAlert) {
      const savedType = initialAlert.alert_type || "PROFIT_TARGET";
      const savedVal = Number(
        initialAlert.target_value ?? (savedType === "STOP_LOSS" ? defaultStopLoss : defaultProfitTarget)
      );
      setAlertType(savedType);
      setTargetValue(savedVal);
      setIsActive(initialAlert.is_active !== false);
      setNotifyEmail(initialAlert.notify_email !== false);
      setNotifyApp(initialAlert.notify_app !== false);
      setNotifyTelegram(initialAlert.notify_telegram !== false);
      setCustomEmail(initialAlert.user_email || userEmail || "");
    } else {
      setAlertType("PROFIT_TARGET");
      setTargetValue(defaultProfitTarget);
      setIsActive(true);
      setNotifyEmail(true);
      setNotifyApp(true);
      setNotifyTelegram(true);
      setCustomEmail(userEmail || "");
    }
  }, [initialAlert, isOpen, userEmail, defaultProfitTarget, defaultStopLoss]);

  const numTarget = Number(targetValue) || 0;
  const calculatedTriggerPrice = entP > 0 ? entP * (1 + numTarget / 100) : 0;
  const spotDeltaPct = curP > 0 && calculatedTriggerPrice > 0 ? ((calculatedTriggerPrice - curP) / curP) * 100 : 0;
  const spotDeltaUsd = calculatedTriggerPrice - curP;

  // Dynamic presets depending on selected mode (PROFIT_TARGET vs STOP_LOSS) and currentReturnPct
  const activePresets = useMemo(() => {
    if (alertType === "PROFIT_TARGET") {
      if (curRet < -25) return [-30, -25, -20, -15, -10, 0, 10];
      if (curRet < -5) return [-10, -5, 0, 5, 10, 15, 20];
      return [5, 10, 15, 20, 25, 35, 50];
    } else {
      if (curRet < -5) {
        const base = Math.floor(curRet);
        return [base - 3, base - 5, base - 8, base - 10, base - 15, base - 20];
      }
      return [-5, -8, -10, -15, -20, -25];
    }
  }, [alertType, curRet]);

  if (!isOpen) return null;

  const handleSelectProfitTarget = () => {
    setAlertType("PROFIT_TARGET");
    if (Number(targetValue) <= curRet) {
      setTargetValue(defaultProfitTarget);
    }
  };

  const handleSelectStopLoss = () => {
    setAlertType("STOP_LOSS");
    if (Number(targetValue) >= curRet) {
      setTargetValue(defaultStopLoss);
    }
  };

  const isInvalidDirection =
    (alertType === "PROFIT_TARGET" && numTarget <= curRet) ||
    (alertType === "STOP_LOSS" && numTarget >= curRet);

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      const res = await testStockAlertEmail(customEmail.trim() || undefined);
      setEmailTestResult(res);
    } catch (err) {
      setEmailTestResult({
        success: false,
        error: err.message || "Error al conectar con el servidor",
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const res = await testStockAlertTelegram();
      setTelegramTestResult(res);
    } catch (err) {
      setTelegramTestResult({ success: false, error: err.message });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        id: initialAlert?.id || undefined,
        scope,
        target_id: targetId,
        ticker: alertKey || ticker,
        alert_type: alertType,
        target_value: Number(targetValue),
        is_active: isActive,
        notify_email: notifyEmail,
        notify_app: notifyApp,
        notify_telegram: notifyTelegram,
        user_email: customEmail.trim() || undefined,
        isParentGroup,
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      console.error("Error saving alert:", err);
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "14px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "92vh",
          overflowY: "auto",
          background: isLight ? "#ffffff" : "var(--bg-surface)",
          border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "var(--border)"}`,
          borderRadius: 16,
          boxShadow: isLight ? "0 10px 30px rgba(0,0,0,0.15)" : "0 12px 35px rgba(0,0,0,0.55)",
          padding: 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "var(--border)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: isLight ? "rgba(2, 132, 199, 0.04)" : "rgba(0, 229, 255, 0.03)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.35rem" }}>🔔</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>
                  ALERTA DE VENTA • {ticker}
                </h3>
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: isParentGroup
                      ? isLight ? "rgba(245, 158, 11, 0.14)" : "rgba(245, 158, 11, 0.2)"
                      : isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.15)",
                    color: isParentGroup
                      ? isLight ? "#b45309" : "#fbbf24"
                      : isLight ? "#0369a1" : "#00e5ff",
                    border: `1px solid ${isParentGroup ? "rgba(245, 158, 11, 0.35)" : "rgba(2, 132, 199, 0.3)"}`,
                  }}
                >
                  {isParentGroup ? "🌐 GLOBAL" : "🎯 LOTE AISLADO"}
                </span>
                <InfoTooltip
                  position="bottom"
                  customContent={{
                    title: isParentGroup ? "Alerta Maestra Global" : "Alerta de Lote Individual",
                    tag: isParentGroup ? "CASCADA MULTI-LOTE" : "EJECUCIÓN AISLADA",
                    tagColor: isParentGroup ? "#f59e0b" : "#00e5ff",
                    explanation: isParentGroup
                      ? `Esta alerta se configura a nivel de la posición consolidada de ${ticker} (Costo Promedio Ponderado WAP = $${entP.toFixed(2)}) y replica automáticamente el umbral a todos sus lotes abiertos.`
                      : `Esta alerta monitorea exclusivamente este lote específico de compra (${lotLabel || ticker}) con su precio de entrada individual P₀ = $${entP.toFixed(2)}, sin afectar ni replicarse a los demás lotes.`,
                    rule: isParentGroup
                      ? "Usa la campana superior de la tarjeta agrupada cuando quieras fijar una regla única para toda la posición."
                      : "Usa la campana dentro de cada fila de lote para definir objetivos de salida independientes por fecha de compra.",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                {lotLabel || companyName || ticker}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.15rem",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Position Telemetry Strip with Hover InfoTooltips */}
        <div
          style={{
            padding: "12px 20px",
            background: isLight ? "rgba(15, 23, 42, 0.025)" : "rgba(255, 255, 255, 0.02)",
            borderBottom: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "var(--border)"}`,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <span>{isParentGroup ? "Costo WAP:" : "Precio Entrada:"}</span>
              <InfoTooltip
                position="bottom"
                customContent={{
                  title: isParentGroup ? "Costo Promedio Ponderado (WAP)" : "Precio Base de Entrada (P₀)",
                  tag: "COST BASIS",
                  tagColor: "#38bdf8",
                  explanation: isParentGroup
                    ? "Representa el precio de compra promedio ponderado por volumen de todos tus lotes abiertos en este activo."
                    : "Es la cotización exacta de apertura/ejecución a la que adquiriste este lote específico.",
                  rule: `P₀ = $${entP.toFixed(2)} sirve como denominador invariante para calcular el retorno porcentual y el Precio Gatillo.`,
                }}
              />
            </div>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
              ${entP.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <span>Precio Spot:</span>
              <InfoTooltip
                position="bottom"
                customContent={{
                  title: "Cotización Spot (Mark-to-Market)",
                  tag: "TIEMPO REAL",
                  tagColor: "#00e5ff",
                  explanation: "Último precio negociado en bolsa para el activo subyacente, actualizado continuamente durante la sesión de mercado.",
                  rule: `Se compara cada 60s contra tu Precio Gatillo ($${calculatedTriggerPrice.toFixed(2)}) para disparar la orden de notificación.`,
                }}
              />
            </div>
            <div
              style={{
                fontSize: "0.92rem",
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--accent-primary)",
                marginTop: 2,
              }}
            >
              ${curP.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <span>ROI Latente:</span>
              <InfoTooltip
                position="bottom"
                customContent={{
                  title: "Rentabilidad Latente Acumulada (ROI)",
                  tag: curRet >= 0 ? "PLUSVALÍA" : "DRAWDOWN",
                  tagColor: curRet >= 0 ? "#10b981" : "#f43f5e",
                  explanation: `Variación porcentual no realizada entre tu Precio de Entrada ($${entP.toFixed(2)}) y la Cotización Spot actual ($${curP.toFixed(2)}).`,
                  rule: `Fórmula: ROI = [(P_actual − P₀) / P₀] × 100 = ${curRet >= 0 ? "+" : ""}${curRet.toFixed(2)}%.`,
                }}
              />
            </div>
            <div
              style={{
                fontSize: "0.92rem",
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                color: curRet >= 0 ? "#10b981" : "#f43f5e",
                marginTop: 2,
              }}
            >
              {curRet >= 0 ? "+" : ""}{curRet.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Active Switch */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: 10,
              background: isActive
                ? isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)"
                : isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isActive
                ? "rgba(16, 185, 129, 0.35)"
                : isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1rem" }}>{isActive ? "⚡" : "⏸️"}</span>
              <div>
                <div style={{ fontSize: "0.84rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{isActive ? "Alerta Activada" : "Alerta Pausada"}</span>
                  <InfoTooltip
                    customContent={{
                      title: "Motor Centinela de Cotizaciones",
                      tag: "POLLING 60S",
                      tagColor: "#10b981",
                      explanation: "Evalúa automáticamente en segundo plano cada actualización de precios en vivo contra el umbral configurado.",
                      rule: "Al cumplirse la condición lógica, marca la alerta como ejecutada, despliega el banner en pantalla y envía el correo electrónico.",
                    }}
                  />
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {isActive ? "Monitoreando cotizaciones continuamente" : "No emitirá avisos mientras esté pausada"}
                </div>
              </div>
            </div>

            <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer", flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: isActive ? "#10b981" : "#64748b",
                  borderRadius: 24,
                  transition: "all 0.2s ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: isActive ? 22 : 2,
                    top: 2,
                    width: 20,
                    height: 20,
                    backgroundColor: "#ffffff",
                    borderRadius: "50%",
                    transition: "all 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }}
                />
              </span>
            </label>
          </div>

          {/* Alert Type: Profit Target / Recovery vs Stop Loss */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Tipo de Disparador
              </label>
              <InfoTooltip
                customContent={{
                  title: "Condición Lógica de Cruce (Trigger Type)",
                  tag: alertType === "PROFIT_TARGET" ? "CRUCE ALCISTA ↑" : "CRUCE BAJISTA ↓",
                  tagColor: alertType === "PROFIT_TARGET" ? "#10b981" : "#ef4444",
                  explanation:
                    alertType === "PROFIT_TARGET"
                      ? `Evalúa la desigualdad alcista (ROI_actual ≥ ${numTarget}%). Ideal tanto para toma de ganancias como para recuperación parcial cuando el lote está en pérdida (${curRet.toFixed(2)}%) y deseas vender cuando suba hasta ${numTarget}% (~$${calculatedTriggerPrice.toFixed(2)}).`
                      : `Evalúa la desigualdad bajista (ROI_actual ≤ ${numTarget}%). Actúa como red de protección si la posición cae desde su nivel actual (${curRet.toFixed(2)}%) hasta perforar ${numTarget}% (~$${calculatedTriggerPrice.toFixed(2)}).`,
                  rule:
                    alertType === "PROFIT_TARGET"
                      ? `Requiere un umbral superior al retorno actual (> ${curRet.toFixed(2)}%).`
                      : `Requiere un umbral inferior al retorno actual (< ${curRet.toFixed(2)}%).`,
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={handleSelectProfitTarget}
                style={{
                  padding: "10px",
                  borderRadius: 8,
                  border: alertType === "PROFIT_TARGET"
                    ? "1.5px solid #10b981"
                    : `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                  background: alertType === "PROFIT_TARGET"
                    ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.18)"
                    : isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
                  color: alertType === "PROFIT_TARGET" ? (isLight ? "#047857" : "#34d399") : "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>🎯</span>
                <span>{curRet < 0 ? "Objetivo Recuperación" : "Objetivo Ganancia"}</span>
              </button>

              <button
                type="button"
                onClick={handleSelectStopLoss}
                style={{
                  padding: "10px",
                  borderRadius: 8,
                  border: alertType === "STOP_LOSS"
                    ? "1.5px solid #ef4444"
                    : `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                  background: alertType === "STOP_LOSS"
                    ? isLight ? "rgba(239, 68, 68, 0.12)" : "rgba(239, 68, 68, 0.18)"
                    : isLight ? "#ffffff" : "rgba(255,255,255,0.03)",
                  color: alertType === "STOP_LOSS" ? (isLight ? "#b91c1c" : "#f87171") : "var(--text-secondary)",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>🛑</span>
                <span>Stop Loss (Caída)</span>
              </button>
            </div>
          </div>

          {/* Target Value Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Rentabilidad Disparadora (%)
                </label>
                <InfoTooltip
                  customContent={{
                    title: "Cálculo del Precio Gatillo (P_trigger)",
                    tag: "FÓRMULA EXACTA",
                    tagColor: "#38bdf8",
                    explanation: `Determina la cotización exacta a la cual debe llegar ${ticker} para activar tu alerta, tomando como base tu precio de entrada P₀ ($${entP.toFixed(2)}).`,
                    rule: `P_trigger = $${entP.toFixed(2)} × (1 + ${numTarget}% / 100) = $${calculatedTriggerPrice.toFixed(2)} USD. Requiere una variación Spot adicional de ${spotDeltaPct >= 0 ? "+" : ""}${spotDeltaPct.toFixed(2)}% (${spotDeltaUsd >= 0 ? "+" : ""}$${spotDeltaUsd.toFixed(2)}) desde los $${curP.toFixed(2)} actuales.`,
                  }}
                />
              </div>
              {calculatedTriggerPrice > 0 && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: alertType === "PROFIT_TARGET" ? "#10b981" : "#ef4444",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  Dispara a ~${calculatedTriggerPrice.toFixed(2)}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
                border: `1.5px solid ${
                  isInvalidDirection
                    ? "#f59e0b"
                    : alertType === "PROFIT_TARGET"
                      ? "rgba(16, 185, 129, 0.45)"
                      : "rgba(239, 68, 68, 0.45)"
                }`,
                borderRadius: 8,
                padding: "8px 14px",
              }}
            >
              <span style={{ fontWeight: 800, color: "var(--text-muted)", marginRight: 6 }}>%</span>
              <input
                type="number"
                step="0.5"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                required
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              <span
                style={{
                  fontSize: "0.68rem",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  marginLeft: 8,
                }}
              >
                Δ Spot: {spotDeltaPct >= 0 ? "+" : ""}{spotDeltaPct.toFixed(1)}%
              </span>
            </div>

            {/* Quick Preset Buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              {activePresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetValue(preset)}
                  style={{
                    padding: "3px 9px",
                    borderRadius: 6,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: `1px solid ${
                      Number(targetValue) === preset
                        ? alertType === "PROFIT_TARGET"
                          ? "#10b981"
                          : "#ef4444"
                        : isLight
                          ? "rgba(0,0,0,0.1)"
                          : "rgba(255,255,255,0.08)"
                    }`,
                    background:
                      Number(targetValue) === preset
                        ? alertType === "PROFIT_TARGET"
                          ? "rgba(16, 185, 129, 0.16)"
                          : "rgba(239, 68, 68, 0.16)"
                        : "transparent",
                    color:
                      Number(targetValue) === preset
                        ? alertType === "PROFIT_TARGET"
                          ? isLight ? "#047857" : "#34d399"
                          : isLight ? "#b91c1c" : "#f87171"
                        : "var(--text-secondary)",
                  }}
                >
                  {preset > 0 ? `+${preset}%` : `${preset}%`}
                </button>
              ))}
            </div>

            {isInvalidDirection && (
              <div
                style={{
                  marginTop: 2,
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: "0.72rem",
                  background: isLight ? "rgba(245, 158, 11, 0.1)" : "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  color: isLight ? "#b45309" : "#fbbf24",
                }}
              >
                ⚠️ {alertType === "PROFIT_TARGET"
                  ? `Elige un objetivo mayor a tu retorno actual (${curRet.toFixed(2)}%).`
                  : `Elige un Stop Loss menor a tu retorno actual (${curRet.toFixed(2)}%).`}
              </div>
            )}
          </div>

          {/* Notification Channels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Canales de Notificación
              </label>
              <InfoTooltip
                customContent={{
                  title: "Despacho Multicanal (In-App & SMTP)",
                  tag: "ALERTA AUTOMÁTICA",
                  tagColor: "#8b5cf6",
                  explanation: "Define por qué medios recibirás el aviso apenas la cotización cruce el Precio Gatillo.",
                  rule: "El reporte por correo incluye el desglose técnico de Precio de Entrada, Precio Spot, ROI alcanzado y lote correspondiente.",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.8rem" }}>
                <input
                  type="checkbox"
                  checked={notifyApp}
                  onChange={(e) => setNotifyApp(e.target.checked)}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span>Notificación estética en la aplicación (In-App Banner)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.8rem" }}>
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                />
                <span>Enviar aviso al correo electrónico registrado</span>
              </label>

              {notifyEmail && (
                <div style={{ marginLeft: 26, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      value={customEmail}
                      onChange={(e) => {
                        setCustomEmail(e.target.value);
                        if (emailTestResult) setEmailTestResult(null);
                      }}
                      placeholder="ejemplo@correo.com"
                      style={{
                        flex: 1,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)"}`,
                        background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.5)",
                        color: "var(--text-primary)",
                        fontSize: "0.8rem",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleTestEmail}
                      disabled={testingEmail}
                      title="Enviar un correo de prueba ahora para comprobar la conexión SMTP"
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.35)" : "rgba(0, 229, 255, 0.35)"}`,
                        background: isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.12)",
                        color: isLight ? "#0284c7" : "#00e5ff",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: testingEmail ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {testingEmail ? "⏳ Probando..." : "🧪 Probar Envío"}
                    </button>
                  </div>

                  {emailTestResult && (
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        fontSize: "0.74rem",
                        lineHeight: 1.4,
                        background: emailTestResult.success
                          ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)"
                          : isLight ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.2)",
                        border: `1px solid ${emailTestResult.success ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                        color: emailTestResult.success
                          ? isLight ? "#047857" : "#34d399"
                          : isLight ? "#b91c1c" : "#fca5a5",
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: emailTestResult.instructions ? 4 : 0 }}>
                        {emailTestResult.success ? "✅ " : "⚠️ "}{emailTestResult.message || emailTestResult.error}
                      </div>
                      {emailTestResult.instructions && (
                        <div style={{ whiteSpace: "pre-line", fontSize: "0.7rem", opacity: 0.9 }}>
                          {emailTestResult.instructions}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isOwner && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.8rem", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={notifyTelegram}
                      onChange={(e) => setNotifyTelegram(e.target.checked)}
                      style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                    />
                    <span>📱 Enviar aviso directo al celular vía Telegram Bot (Exclusivo)</span>
                  </label>

                  {notifyTelegram && (
                    <div style={{ marginLeft: 26, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          Alerta sonora inmediata en tu teléfono móvil
                        </span>
                        <button
                          type="button"
                          onClick={handleTestTelegram}
                          disabled={testingTelegram}
                          title="Enviar un mensaje de prueba al bot de Telegram"
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: `1px solid ${isLight ? "rgba(34, 197, 94, 0.35)" : "rgba(34, 197, 94, 0.45)"}`,
                            background: isLight ? "rgba(34, 197, 94, 0.08)" : "rgba(34, 197, 94, 0.12)",
                            color: isLight ? "#16a34a" : "#4ade80",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            cursor: testingTelegram ? "not-allowed" : "pointer",
                            whiteSpace: "nowrap",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          {testingTelegram ? "⏳ Probando..." : "🧪 Probar Telegram"}
                        </button>
                      </div>

                      {telegramTestResult && (
                        <div
                          style={{
                            padding: "8px 12px",
                            borderRadius: 6,
                            fontSize: "0.74rem",
                            lineHeight: 1.4,
                            background: telegramTestResult.success
                              ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)"
                              : isLight ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.2)",
                            border: `1px solid ${telegramTestResult.success ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                            color: telegramTestResult.success
                              ? isLight ? "#047857" : "#34d399"
                              : isLight ? "#b91c1c" : "#fca5a5",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {telegramTestResult.success ? "✅ " : "⚠️ "}{telegramTestResult.message || telegramTestResult.error}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: initialAlert?.id ? "space-between" : "flex-end",
              alignItems: "center",
              marginTop: 6,
              gap: 12,
            }}
          >
            {initialAlert?.id && (
              <button
                type="button"
                onClick={async () => {
                  if (onDelete) {
                    await onDelete(initialAlert.id, isParentGroup ? ticker : null);
                    onClose();
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "8px 10px",
                }}
              >
                🗑️ Eliminar {isParentGroup ? "Todas" : "Alerta"}
              </button>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{ padding: "8px 16px", fontSize: "0.8rem" }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSaving || isInvalidDirection}
                className="btn btn-primary"
                style={{
                  padding: "8px 18px",
                  fontSize: "0.8rem",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: isInvalidDirection ? 0.5 : 1,
                  cursor: isInvalidDirection ? "not-allowed" : "pointer",
                }}
              >
                {isSaving
                  ? "Guardando..."
                  : isParentGroup
                    ? "Guardar en Todos los Lotes"
                    : "Guardar en Este Lote"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}


