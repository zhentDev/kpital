import React, { useState, useEffect, useRef } from "react";
import "./InteractiveControls.css";

/**
 * CurrencyInput — Dynamic Financial Input Formatter
 * Eliminates spinner arrows, avoids leading zeros (e.g. 05000000),
 * formats thousands with locale rules, and emits clean numbers to parent.
 * Preserves cursor position during in-place edits and auto-selects on focus.
 */
export default function CurrencyInput({
  value,
  onChange,
  currency = "COP",
  placeholder = "0",
  disabled = false,
  prefix,
  id,
  className = "",
  style = {},
  allowDecimals = currency === "USD",
  showClear = false,
  autoFocus = false,
}) {
  const inputRef = useRef(null);

  // Format a numeric value into a readable string with thousand dots / commas
  const formatDisplay = (val) => {
    if (val === "" || val === null || val === undefined) return "";
    const num = Number(val);
    if (isNaN(num)) return "";

    if (currency === "USD") {
      // Allow decimals if present
      if (typeof val === "string" && val.endsWith(".")) return num.toLocaleString("en-US") + ".";
      if (typeof val === "string" && val.includes(".")) {
        const parts = val.split(".");
        return Number(parts[0]).toLocaleString("en-US") + "." + parts[1];
      }
      return num.toLocaleString("en-US", {
        minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
        maximumFractionDigits: 4,
      });
    }

    // Default COP format: 1.500.000
    if (allowDecimals && typeof val === "string" && val.includes(".")) {
      const parts = val.split(".");
      return Number(parts[0]).toLocaleString("es-CO") + "," + parts[1];
    }
    return Math.round(num).toLocaleString("es-CO");
  };

  const [displayValue, setDisplayValue] = useState(() => formatDisplay(value));

  // Sync when parent value changes externally
  useEffect(() => {
    setDisplayValue(formatDisplay(value));
  }, [value, currency]);

  // Clean raw typed string to valid numeric string
  const cleanToNumericString = (raw) => {
    if (!raw) return "";
    let clean = raw.trim();

    if (currency === "USD") {
      clean = clean.replace(/[^0-9.]/g, "");
      const parts = clean.split(".");
      if (parts.length > 2) {
        clean = parts[0] + "." + parts.slice(1).join("");
      }
    } else {
      if (!allowDecimals) {
        clean = clean.replace(/\D/g, "");
      } else {
        clean = clean.replace(/,/g, ".").replace(/[^0-9.]/g, "");
        const parts = clean.split(".");
        if (parts.length > 2) {
          clean = parts[0] + "." + parts.slice(1).join("");
        }
      }
    }

    // Strip leading zeros unless it is "0."
    if (clean.length > 1 && clean.startsWith("0") && !clean.startsWith("0.")) {
      clean = clean.replace(/^0+/, "") || "0";
    }

    return clean;
  };

  const handleInputChange = (e) => {
    const rawValue = e.target.value;
    const cursor = e.target.selectionStart || 0;

    if (rawValue === "") {
      setDisplayValue("");
      if (onChange) onChange("");
      return;
    }

    // Calculate how many digits were before the cursor before formatting
    const digitsBeforeCursor = rawValue.slice(0, cursor).replace(/\D/g, "").length;

    const cleanStr = cleanToNumericString(rawValue);
    if (!cleanStr) {
      setDisplayValue("");
      if (onChange) onChange("");
      return;
    }

    const numVal = parseFloat(cleanStr);
    const newFormatted = formatDisplay(cleanStr);
    setDisplayValue(newFormatted);

    // Calculate target cursor position in newFormatted to prevent cursor jumping
    let targetPos = newFormatted.length;
    let count = 0;
    for (let i = 0; i < newFormatted.length; i++) {
      if (/\d/.test(newFormatted[i])) {
        count++;
      }
      if (count === digitsBeforeCursor) {
        targetPos = i + 1;
        break;
      }
    }
    if (digitsBeforeCursor === 0) {
      targetPos = 0;
    }

    // Restore cursor position smoothly
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(targetPos, targetPos);
      }
    });

    if (onChange) {
      onChange(isNaN(numVal) ? "" : numVal, e);
    }
  };

  const handleFocus = (e) => {
    // Select all text on focus so user can immediately replace the value by typing
    e.target.select();
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setDisplayValue("");
    if (onChange) onChange("");
    if (inputRef.current) inputRef.current.focus();
  };

  const resolvedPrefix =
    prefix !== undefined
      ? prefix
      : currency === "USD"
      ? "USD $"
      : "COP $";

  return (
    <div
      className={`currency-input-container interactive-control-base ${disabled ? "disabled" : ""} ${className}`}
      style={style}
      onClick={() => inputRef.current?.focus()}
    >
      {resolvedPrefix && (
        <span className="currency-prefix-badge">{resolvedPrefix}</span>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        className="currency-native-input"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck="false"
      />
      {showClear && displayValue && !disabled && (
        <button
          type="button"
          className="currency-clear-btn"
          onClick={handleClear}
          title="Borrar monto"
        >
          ✕
        </button>
      )}
    </div>
  );
}
