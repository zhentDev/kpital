import React, { useMemo, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import "./InteractiveControls.css";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const WEEKDAY_NAMES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export default function LiveHistoryCalendar({
  selectedDate = null,
  onSelectDate,
  minDate = "2026-08-03",
  maxDate = null,
  activeDates = [], // array of YYYY-MM-DD that had market activity
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const effectiveMaxDate = maxDate || todayStr;
  const effectiveMinDate = minDate || "2026-08-03";

  // Current viewed month state: year and month (0-11)
  const initialDateObj = useMemo(() => {
    const base = selectedDate || effectiveMaxDate;
    const parts = (base || todayStr).split("-");
    return {
      year: parseInt(parts[0], 10),
      month: parseInt(parts[1], 10) - 1,
    };
  }, [selectedDate, effectiveMaxDate, todayStr]);

  const [currentYear, setCurrentYear] = useState(initialDateObj.year);
  const [currentMonth, setCurrentMonth] = useState(initialDateObj.month);

  const activeDatesSet = useMemo(() => new Set(activeDates), [activeDates]);

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Calendar matrix calculation
  const calendarCells = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Monday is 0, Sunday is 6
    let startingDayOfWeek = firstDay.getDay() - 1;
    if (startingDayOfWeek === -1) startingDayOfWeek = 6;

    const cells = [];

    // Empty lead cells
    for (let i = 0; i < startingDayOfWeek; i++) {
      cells.push({ empty: true, key: `empty_lead_${i}` });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOfWeek = new Date(currentYear, currentMonth, d).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const isBeforeMin = dateStr < effectiveMinDate;
      const isAfterMax = dateStr > effectiveMaxDate;
      const isDisabled = isBeforeMin || isAfterMax || isWeekend;

      const isToday = dateStr === todayStr;
      const isSelected = selectedDate ? dateStr === selectedDate : isToday;
      const hasActivity = activeDatesSet.has(dateStr);

      cells.push({
        empty: false,
        key: `day_${dateStr}`,
        dateStr,
        dayNumber: d,
        isDisabled,
        isToday,
        isSelected,
        hasActivity,
      });
    }

    return cells;
  }, [currentYear, currentMonth, effectiveMinDate, effectiveMaxDate, todayStr, selectedDate, activeDatesSet]);

  return (
    <div
      className="dynamic-datepicker-popover"
      style={{
        position: "relative",
        top: "auto",
        left: "auto",
        right: "auto",
        zIndex: 2500,
        width: 330,
        minWidth: 330,
        maxWidth: 330,
        boxSizing: "border-box",
        padding: "16px",
        borderRadius: 14,
        background: isLight ? "#ffffff" : "#0d1226",
        border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)"}`,
        boxShadow: isLight
          ? "0 20px 45px rgba(0, 0, 0, 0.16), 0 4px 14px rgba(0, 0, 0, 0.08)"
          : "0 24px 50px rgba(0, 0, 0, 0.75), 0 0 30px rgba(56, 189, 248, 0.15)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        userSelect: "none",
      }}
    >
      {/* ── Header: Month Navigation & Quick Actions ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          paddingBottom: 10,
          borderBottom: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexShrink: 1 }}>
          <span style={{ fontSize: "1rem" }}>📅</span>
          <span
            style={{
              fontSize: "0.92rem",
              fontWeight: 800,
              color: isLight ? "#0f172a" : "#f8fafc",
              whiteSpace: "nowrap",
              letterSpacing: "-0.01em",
            }}
          >
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handlePrevMonth}
            style={{
              background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.06)",
              border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)"}`,
              borderRadius: 6,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: isLight ? "#475569" : "#cbd5e1",
              fontWeight: 800,
              fontSize: "0.85rem",
              transition: "all 0.15s ease",
            }}
            title="Mes anterior"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={() => {
              const parts = todayStr.split("-");
              setCurrentYear(parseInt(parts[0], 10));
              setCurrentMonth(parseInt(parts[1], 10) - 1);
              onSelectDate(null); // Return to Live Today
            }}
            style={{
              background: !selectedDate
                ? isLight
                  ? "rgba(2, 132, 199, 0.12)"
                  : "rgba(0, 229, 255, 0.15)"
                : isLight
                  ? "#f1f5f9"
                  : "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${
                !selectedDate
                  ? isLight
                    ? "rgba(2, 132, 199, 0.35)"
                    : "rgba(0, 229, 255, 0.4)"
                  : isLight
                    ? "rgba(0, 0, 0, 0.1)"
                    : "rgba(255, 255, 255, 0.1)"
              }`,
              borderRadius: 6,
              padding: "0 9px",
              height: 28,
              fontSize: "0.72rem",
              fontWeight: 800,
              cursor: "pointer",
              whiteSpace: "nowrap",
              color: !selectedDate
                ? isLight
                  ? "#0284c7"
                  : "var(--accent-primary)"
                : isLight
                  ? "#475569"
                  : "#94a3b8",
              transition: "all 0.15s ease",
            }}
            title="Volver a la sesión de Hoy en Vivo"
          >
            ⚡ Hoy Live
          </button>

          <button
            type="button"
            onClick={handleNextMonth}
            style={{
              background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.06)",
              border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)"}`,
              borderRadius: 6,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: isLight ? "#475569" : "#cbd5e1",
              fontWeight: 800,
              fontSize: "0.85rem",
              transition: "all 0.15s ease",
            }}
            title="Mes siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Weekday Headers ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center",
          fontSize: "0.7rem",
          fontWeight: 700,
          color: isLight ? "#64748b" : "#94a3b8",
          paddingBottom: 6,
          borderBottom: `1px solid ${isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.06)"}`,
          letterSpacing: "0.04em",
        }}
      >
        {WEEKDAY_NAMES.map((w, idx) => (
          <div key={w} style={{ color: idx >= 5 ? (isLight ? "#94a3b8" : "#64748b") : "inherit" }}>
            {w}
          </div>
        ))}
      </div>

      {/* ── Days Grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
        }}
      >
        {calendarCells.map((c) => {
          if (c.empty) {
            return <div key={c.key} style={{ height: 34 }} />;
          }

          let bg = "transparent";
          let color = isLight ? "#0f172a" : "#f1f5f9";
          let border = "1px solid transparent";
          let cursor = "pointer";
          let boxShadow = "none";

          if (c.isDisabled) {
            cursor = "not-allowed";
            color = isLight ? "rgba(0, 0, 0, 0.25)" : "rgba(255, 255, 255, 0.2)";
          } else if (c.isSelected) {
            bg = isLight ? "linear-gradient(135deg, #0284c7, #38bdf8)" : "linear-gradient(135deg, #0284c7, #00e5ff)";
            color = "#ffffff";
            border = "1px solid transparent";
            boxShadow = "0 2px 8px rgba(2, 132, 199, 0.4)";
          } else if (c.isToday) {
            bg = isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(0, 229, 255, 0.12)";
            border = `1px solid ${isLight ? "rgba(2, 132, 199, 0.4)" : "rgba(0, 229, 255, 0.4)"}`;
            color = isLight ? "#0284c7" : "var(--accent-primary)";
          } else if (c.hasActivity) {
            bg = isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.15)";
            border = `1px solid ${isLight ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.3)"}`;
          }

          return (
            <button
              key={c.key}
              type="button"
              disabled={c.isDisabled}
              onClick={() => {
                if (!c.isDisabled) {
                  onSelectDate(c.isToday ? null : c.dateStr);
                }
              }}
              style={{
                height: 34,
                borderRadius: 8,
                background: bg,
                color,
                border,
                boxShadow,
                fontSize: "0.8rem",
                fontWeight: c.isSelected || c.isToday ? 800 : 600,
                cursor,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                transition: "all 0.15s ease",
              }}
              title={
                c.isDisabled
                  ? c.dateStr < effectiveMinDate
                    ? "Antes de la fecha de apertura de posiciones"
                    : c.dateStr > effectiveMaxDate
                    ? "Fecha futura no disponible"
                    : "Fin de semana (Mercados cerrados)"
                  : `Inspeccionar trayectoria del ${c.dateStr}`
              }
            >
              <span>{c.dayNumber}</span>
              {c.hasActivity && !c.isSelected && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 3,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: isLight ? "#059669" : "#10b981",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Footer Info ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.7rem",
          color: isLight ? "#64748b" : "#94a3b8",
          paddingTop: 8,
          borderTop: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)"}`,
          whiteSpace: "nowrap",
          gap: 8,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
          <span>Día con histórico</span>
        </span>
        <span style={{ opacity: 0.9 }}>
          Apertura: <strong>{effectiveMinDate}</strong>
        </span>
      </div>
    </div>
  );
}
