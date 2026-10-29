import React from "react";
import HourglassRangeSlider from "../Common/HourglassRangeSlider";
import { formatCashFlowMoney, calculateEffectiveExpense } from "../../utils/cashFlowFormatters";
import "./CashFlow.css";

export default function CashFlowRuleSelector({
  allocationModel = "50_30_20",
  onSelectModel,
  customRatios = { needs: 50, wants: 30, savings: 20 },
  onUpdateRatios,
  totalInflow = 0,
  totalNeeds = 0,
  totalWants = 0,
  totalWealth = 0,
  expensesLog = [],
  debts = [],
  currency = "COP",
  fxRate = 4150,
}) {
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const STANDARD_PRESETS = [
    { id: "35_30_35", label: "35/30/35 Mi Balance", needs: 35, wants: 30, savings: 35 },
    { id: "50_30_20", label: "50/30/20 Estándar", needs: 50, wants: 30, savings: 20 },
    { id: "60_20_20", label: "60/20/20 Conservador", needs: 60, wants: 20, savings: 20 },
    { id: "70_10_20", label: "70/10/20 Alto Fijo", needs: 70, wants: 10, savings: 20 },
    { id: "40_20_40", label: "40/20/40 Ultra FIRE 🔥", needs: 40, wants: 20, savings: 40 },
  ];

  const isMatchingStandardPreset = STANDARD_PRESETS.some(
    (p) =>
      customRatios.needs === p.needs &&
      customRatios.wants === p.wants &&
      customRatios.savings === p.savings
  );

  const handleApplyPreset = (preset) => {
    onUpdateRatios({
      needs: preset.needs,
      wants: preset.wants,
      savings: preset.savings,
    });
  };

  const handleRatioChange = (key, value) => {
    const val = Math.max(0, Math.min(100, Math.round(Number(value))));
    const otherKeys = ["needs", "wants", "savings"].filter((k) => k !== key);
    const remaining = 100 - val;
    const currentSumOthers = (customRatios[otherKeys[0]] || 0) + (customRatios[otherKeys[1]] || 0);

    let nextRatios = { ...customRatios, [key]: val };
    if (currentSumOthers > 0) {
      nextRatios[otherKeys[0]] = Math.round(
        (customRatios[otherKeys[0]] / currentSumOthers) * remaining
      );
      nextRatios[otherKeys[1]] = 100 - val - nextRatios[otherKeys[0]];
    } else {
      nextRatios[otherKeys[0]] = Math.round(remaining / 2);
      nextRatios[otherKeys[1]] = remaining - nextRatios[otherKeys[0]];
    }

    onUpdateRatios(nextRatios);
  };

  // ── Financial Targets & Real Capacities ───────────────────
  const targetNeedsAmt = (totalInflow * (customRatios.needs || 50)) / 100;
  const targetWantsAmt = (totalInflow * (customRatios.wants || 30)) / 100;
  const targetWealthAmt = (totalInflow * (customRatios.savings || 20)) / 100;

  // Real Spending by Pillar (Net Personal Spending after debt repayments/settlements)
  const needsSpent = (expensesLog || [])
    .filter((tx) => tx.budgetItemId?.startsWith("need_") || tx.budgetItemType === "needs" || tx.budgetItemName?.includes("Arriendo") || tx.budgetItemName?.includes("Servicio") || tx.budgetItemName?.includes("Alimentación"))
    .reduce((acc, tx) => acc + calculateEffectiveExpense(tx, debts).effectiveSpent, 0);

  const wantsSpent = (expensesLog || [])
    .filter((tx) => tx.budgetItemId?.startsWith("want_") || tx.budgetItemType === "wants" || tx.budgetItemName?.includes("Restaurante") || tx.budgetItemName?.includes("Suscrip") || tx.budgetItemName?.includes("Ocio"))
    .reduce((acc, tx) => acc + calculateEffectiveExpense(tx, debts).effectiveSpent, 0);

  // Remaining Strategy Capacities (Cupo Libre para Gastar)
  const needsRemainingQuota = targetNeedsAmt - totalNeeds;
  const wantsRemainingQuota = targetWantsAmt - totalWants;
  const wealthSurplus = totalWealth - targetWealthAmt;

  const totalSpentAll = (expensesLog || []).reduce((acc, tx) => {
    return acc + calculateEffectiveExpense(tx, debts).effectiveSpent;
  }, 0);
  const totalTargetSpending = targetNeedsAmt + targetWantsAmt;
  const totalFreeSpendingQuota = Math.max(0, totalTargetSpending - (totalNeeds + totalWants));

  return (
    <div className="cashflow-rule-card">
      {/* Header & Tabs */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 10 }}>
            <span>⚙️</span> Modelo de Asignación & Cupos por Estrategia
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Adapta los porcentajes para calcular cuánto cupo te queda disponible para gastar o ahorrar según tu estrategia.
          </p>
        </div>

        {/* Model Tabs */}
        <div className="cashflow-rule-tabs">
          <button
            type="button"
            className={`cashflow-rule-tab-btn ${allocationModel === "50_30_20" ? "active" : ""}`}
            onClick={() => onSelectModel("50_30_20")}
          >
            <span>📊</span> Regla Adaptativa
          </button>
          <button
            type="button"
            className={`cashflow-rule-tab-btn ${allocationModel === "pay_yourself_first" ? "active" : ""}`}
            onClick={() => onSelectModel("pay_yourself_first")}
          >
            <span>💎</span> Pay Yourself First
          </button>
          <button
            type="button"
            className={`cashflow-rule-tab-btn ${allocationModel === "envelope" ? "active" : ""}`}
            onClick={() => onSelectModel("envelope")}
          >
            <span>✉️</span> Sobres Digitales
          </button>
        </div>
      </div>

      {/* Preset Quick Chips */}
      {allocationModel === "50_30_20" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-muted)" }}>
            Atajos Recomendados:
          </span>

          {/* Dedicated Custom Strategy Chip */}
          <button
            type="button"
            style={{
              padding: "5px 12px",
              borderRadius: "10px",
              fontSize: "0.76rem",
              fontWeight: !isMatchingStandardPreset ? 700 : 500,
              background: !isMatchingStandardPreset ? "rgba(0, 229, 255, 0.22)" : "var(--bg-card)",
              border: !isMatchingStandardPreset ? "1px solid #00e5ff" : "1px solid var(--border)",
              color: !isMatchingStandardPreset ? "#00e5ff" : "var(--text-muted)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxShadow: !isMatchingStandardPreset ? "0 0 12px rgba(0, 229, 255, 0.25)" : "none",
            }}
          >
            ⭐ Personalizada ({customRatios.needs}/{customRatios.wants}/{customRatios.savings})
          </button>

          {STANDARD_PRESETS.map((p) => {
            const isSelected =
              customRatios.needs === p.needs &&
              customRatios.wants === p.wants &&
              customRatios.savings === p.savings;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => handleApplyPreset(p)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "10px",
                  fontSize: "0.76rem",
                  fontWeight: isSelected ? 700 : 500,
                  background: isSelected ? "rgba(0, 229, 255, 0.18)" : "var(--bg-card)",
                  border: isSelected ? "1px solid #00e5ff" : "1px solid var(--border)",
                  color: isSelected ? "#00e5ff" : "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Global Capacity Runway Callout Banner */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          padding: "12px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.4rem" }}>🎯</span>
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Margen Global Disponible para Gastar este Mes
            </div>
            <div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Tope Total de Gastos ({customRatios.needs + customRatios.wants}%): {formatMoney(totalTargetSpending, currency)} • Planeado: {formatMoney(totalNeeds + totalWants, currency)}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Cupo Libre sin Romper tu Regla</div>
          <div
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "1.25rem",
              fontWeight: 800,
              color: totalFreeSpendingQuota > 0 ? "#10b981" : "#f43f5e",
            }}
          >
            {totalFreeSpendingQuota > 0 ? `+${formatMoney(totalFreeSpendingQuota, currency)} Libre` : "Tope Alcanzado (100%)"}
          </div>
        </div>
      </div>

      {/* 3 Pillar Ratio Sliders with Live Strategy Runway Gauges */}
      <div className="cashflow-ratio-sliders">
        {/* Needs Slider & Quota Gauge */}
        <div className="cashflow-slider-box" style={{ borderTop: "3px solid #f43f5e" }}>
          <div className="cashflow-slider-header">
            <span className="cashflow-slider-title" style={{ color: "#f43f5e" }}>
              🔴 Gastos Fijos (Needs)
            </span>
            <span className="cashflow-slider-value">{customRatios.needs}%</span>
          </div>

          <HourglassRangeSlider
            min={10}
            max={80}
            step={1}
            value={customRatios.needs}
            mode="percentage"
            thumbIcon="🎯"
            onChange={(val) => handleRatioChange("needs", val)}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Tope Estrategia ({customRatios.needs}%):</span>
              <strong style={{ color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>{formatMoney(targetNeedsAmt, currency)}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Presupuestado en Sobres:</span>
              <span style={{ color: totalNeeds > targetNeedsAmt ? "#f43f5e" : "var(--text-primary)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                {formatMoney(totalNeeds, currency)} ({totalInflow > 0 ? ((totalNeeds / totalInflow) * 100).toFixed(0) : 0}%)
              </span>
            </div>

            {/* Quota Status Alert / Pill */}
            <div
              style={{
                marginTop: 4,
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.74rem",
                fontWeight: 700,
                background: needsRemainingQuota >= 0 ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.15)",
                border: needsRemainingQuota >= 0 ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(244, 63, 94, 0.35)",
                color: needsRemainingQuota >= 0 ? "#10b981" : "#f43f5e",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{needsRemainingQuota >= 0 ? "🟢 Cupo Libre:" : "⚠️ Te pasaste por:"}</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {formatMoney(Math.abs(needsRemainingQuota), currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Wants Slider & Quota Gauge */}
        <div className="cashflow-slider-box" style={{ borderTop: "3px solid #a855f7" }}>
          <div className="cashflow-slider-header">
            <span className="cashflow-slider-title" style={{ color: "#a855f7" }}>
              🟣 Estilo de Vida (Wants)
            </span>
            <span className="cashflow-slider-value">{customRatios.wants}%</span>
          </div>

          <HourglassRangeSlider
            min={5}
            max={50}
            step={1}
            value={customRatios.wants}
            mode="percentage"
            thumbIcon="🎯"
            onChange={(val) => handleRatioChange("wants", val)}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Tope Estrategia ({customRatios.wants}%):</span>
              <strong style={{ color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>{formatMoney(targetWantsAmt, currency)}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Presupuestado en Sobres:</span>
              <span style={{ color: totalWants > targetWantsAmt ? "#f43f5e" : "var(--text-primary)", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                {formatMoney(totalWants, currency)} ({totalInflow > 0 ? ((totalWants / totalInflow) * 100).toFixed(0) : 0}%)
              </span>
            </div>

            {/* Quota Status Alert / Pill */}
            <div
              style={{
                marginTop: 4,
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.74rem",
                fontWeight: 700,
                background: wantsRemainingQuota >= 0 ? "rgba(168, 85, 247, 0.15)" : "rgba(244, 63, 94, 0.15)",
                border: wantsRemainingQuota >= 0 ? "1px solid rgba(168, 85, 247, 0.35)" : "1px solid rgba(244, 63, 94, 0.35)",
                color: wantsRemainingQuota >= 0 ? "#c084fc" : "#f43f5e",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{wantsRemainingQuota >= 0 ? "🎉 Cupo para Gustos:" : "⚠️ Te pasaste por:"}</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {formatMoney(Math.abs(wantsRemainingQuota), currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Savings Slider & Goal Fulfillment Gauge */}
        <div className="cashflow-slider-box" style={{ borderTop: "3px solid #38bdf8" }}>
          <div className="cashflow-slider-header">
            <span className="cashflow-slider-title" style={{ color: "#38bdf8" }}>
              🔵 Ahorro & Inversión (Wealth)
            </span>
            <span className="cashflow-slider-value">{customRatios.savings}%</span>
          </div>

          <HourglassRangeSlider
            min={5}
            max={70}
            step={1}
            value={customRatios.savings}
            mode="percentage"
            thumbIcon="🎯"
            onChange={(val) => handleRatioChange("savings", val)}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Meta Estrategia ({customRatios.savings}%):</span>
              <strong style={{ color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace" }}>{formatMoney(targetWealthAmt, currency)}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Aporte Asignado:</span>
              <span style={{ color: totalWealth >= targetWealthAmt ? "#10b981" : "#f59e0b", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
                {formatMoney(totalWealth, currency)} ({totalInflow > 0 ? ((totalWealth / totalInflow) * 100).toFixed(0) : 0}%)
              </span>
            </div>

            {/* Savings Goal Status */}
            <div
              style={{
                marginTop: 4,
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.74rem",
                fontWeight: 700,
                background: wealthSurplus >= 0 ? "rgba(56, 189, 248, 0.15)" : "rgba(245, 158, 11, 0.15)",
                border: wealthSurplus >= 0 ? "1px solid rgba(56, 189, 248, 0.35)" : "1px solid rgba(245, 158, 11, 0.35)",
                color: wealthSurplus >= 0 ? "#38bdf8" : "#fbbf24",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{wealthSurplus >= 0 ? "🔥 Superavit Ahorro:" : "⏳ Te faltan para la meta:"}</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace" }}>
                {wealthSurplus >= 0 ? `+${formatMoney(wealthSurplus, currency)}` : formatMoney(Math.abs(wealthSurplus), currency)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
