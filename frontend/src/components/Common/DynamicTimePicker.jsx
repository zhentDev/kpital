import React, { useState, useEffect, useRef } from "react";
import "./InteractiveControls.css";

const MARKET_TIME_PRESETS = [
  { label: "🔔 Apertura NY", time: "09:30", desc: "NYSE / NASDAQ (09:30)" },
  { label: "🇬🇧 Londres LSE", time: "08:00", desc: "London Stock Exchange (08:00)" },
  { label: "🇩🇪 Xetra / EU", time: "09:00", desc: "Frankfurt Xetra (09:00)" },
  { label: "☀️ Mediodía", time: "12:00", desc: "12:00 PM" },
  { label: "🏁 Cierre NY", time: "16:00", desc: "Cierre Wall Street (16:00)" },
];

const QUICK_HOURS = [
  "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "20",
];

const QUICK_MINUTES = ["00", "05", "10", "15", "20", "30", "45", "55"];

/**
 * Formats 'HH:MM' into 12-hour badge e.g. '09:30 AM' or '04:00 PM'
 */
function format12HourBadge(timeStr) {
  if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

export default function DynamicTimePicker({
  value = "",
  onChange,
  placeholder = "HH:MM",
  disabled = false,
  align = "left",
  showPresets = true,
  className = "",
  style = {},
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [typedText, setTypedText] = useState(value || "");

  const containerRef = useRef(null);

  useEffect(() => {
    setTypedText(value || "");
  }, [value]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const currentHour = /^\d{2}:\d{2}$/.test(typedText) ? typedText.split(":")[0] : "09";
  const currentMinute = /^\d{2}:\d{2}$/.test(typedText) ? typedText.split(":")[1] : "30";

  const handleInputChange = (e) => {
    let raw = e.target.value.replace(/[^0-9:]/g, "");
    if (raw.length === 2 && !raw.includes(":") && typedText.length === 1) {
      raw = `${raw}:`;
    }
    if (raw.length > 5) raw = raw.slice(0, 5);
    setTypedText(raw);

    if (/^\d{2}:\d{2}$/.test(raw)) {
      const [h, m] = raw.split(":").map(Number);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        if (onChange) onChange(raw, e);
      }
    } else if (raw === "") {
      if (onChange) onChange("", e);
    }
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    if (typedText && !/^\d{2}:\d{2}$/.test(typedText)) {
      // Try auto-padding single digit hour like "9:30" -> "09:30"
      if (/^\d:\d{2}$/.test(typedText)) {
        const fixed = `0${typedText}`;
        setTypedText(fixed);
        if (onChange) onChange(fixed);
        return;
      }
      setTypedText(value || "");
    }
  };

  const selectHour = (hStr) => {
    const next = `${hStr}:${currentMinute || "30"}`;
    setTypedText(next);
    if (onChange) onChange(next);
  };

  const selectMinute = (mStr) => {
    const next = `${currentHour || "09"}:${mStr}`;
    setTypedText(next);
    if (onChange) onChange(next);
  };

  const selectPresetTime = (tStr) => {
    setTypedText(tStr);
    if (onChange) onChange(tStr);
    setIsOpen(false);
  };

  const handleSetNow = () => {
    const now = new Date();
    const tStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    selectPresetTime(tStr);
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    setTypedText("");
    if (onChange) onChange("");
    setIsOpen(false);
  };

  const badge12h = format12HourBadge(typedText);
  const displayValue = isFocused ? typedText : (badge12h || typedText);

  return (
    <div
      ref={containerRef}
      className={`dynamic-datepicker-wrapper dynamic-timepicker-wrapper interactive-control-base ${className}`}
      style={style}
    >
      <div
        className={`dynamic-datepicker-input-group ${isOpen ? "active" : ""}`}
        onClick={() => !disabled && setIsOpen(true)}
      >
        <input
          id={id}
          type="text"
          className={`dynamic-datepicker-field ${!isFocused && badge12h ? "formatted-display" : ""}`}
          value={displayValue}
          onFocus={() => setIsFocused(true)}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={10}
          autoComplete="off"
          title={badge12h ? `${badge12h} (${typedText})` : placeholder}
        />
        {typedText && !disabled && (
          <button
            type="button"
            className="currency-clear-btn"
            onClick={handleClear}
            title="Limpiar hora"
            style={{ padding: "2px 6px", fontSize: "0.72rem" }}
          >
            ✕
          </button>
        )}
        <button
          type="button"
          className="dynamic-datepicker-trigger-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setIsOpen(!isOpen);
          }}
          disabled={disabled}
          title="Abrir selector de hora y horarios de mercado"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div
          className={`dynamic-datepicker-popover dynamic-timepicker-popover ${
            align === "right" ? "align-right" : ""
          }`}
        >
          {/* Header */}
          <div className="datepicker-header-nav" style={{ marginBottom: 10 }}>
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 800,
                color: "var(--accent-primary, #38bdf8)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>🕒</span> Selector de Hora
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                type="button"
                className="datepicker-preset-chip"
                onClick={handleSetNow}
                title="Fijar hora actual"
              >
                ⌚ Ahora
              </button>
              {typedText && (
                <button
                  type="button"
                  className="datepicker-preset-chip"
                  onClick={handleClear}
                  style={{ color: "#f43f5e", borderColor: "rgba(244, 63, 94, 0.3)" }}
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Hour & Minute Interactive Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {/* Hours column */}
            <div>
              <div
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  textAlign: "center",
                }}
              >
                Hora (24h)
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 4,
                }}
              >
                {QUICK_HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`datepicker-day-btn ${currentHour === h && typedText ? "selected" : ""}`}
                    style={{ height: 28, fontSize: "0.76rem", fontFamily: "monospace" }}
                    onClick={() => selectHour(h)}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Minutes column */}
            <div>
              <div
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  textAlign: "center",
                }}
              >
                Minutos
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 4,
                }}
              >
                {QUICK_MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`datepicker-day-btn ${currentMinute === m && typedText ? "selected" : ""}`}
                    style={{ height: 28, fontSize: "0.76rem", fontFamily: "monospace" }}
                    onClick={() => selectMinute(m)}
                  >
                    :{m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Market Time Presets */}
          {showPresets && (
            <div className="datepicker-presets-container" style={{ flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  fontSize: "0.66rem",
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: "0.4px",
                }}
              >
                Atajos de Mercado Bursátil:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {MARKET_TIME_PRESETS.map((p) => (
                  <button
                    key={p.time + p.label}
                    type="button"
                    className="datepicker-preset-chip"
                    onClick={() => selectPresetTime(p.time)}
                    title={p.desc}
                    style={{
                      borderColor: typedText === p.time ? "#38bdf8" : undefined,
                      color: typedText === p.time ? "#38bdf8" : undefined,
                      background: typedText === p.time ? "rgba(56, 189, 248, 0.16)" : undefined,
                    }}
                  >
                    {p.label} ({p.time})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
