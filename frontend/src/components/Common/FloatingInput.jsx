import React, { useRef } from "react";
import "./InteractiveControls.css";

/**
 * FloatingInput — Smooth Animated Floating Label & Neon Focus Border
 */
export default function FloatingInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder = " ",
  prefix,
  suffix,
  disabled = false,
  required = false,
  step,
  min,
  max,
  className = "",
  style = {},
  id,
  autoFocus = false,
}) {
  const inputRef = useRef(null);
  const hasValue = value !== "" && value !== null && value !== undefined;

  return (
    <div
      className={`floating-input-group interactive-control-base ${className}`}
      style={style}
      onClick={() => inputRef.current?.focus()}
    >
      <div className={`floating-input-container ${hasValue ? "has-value" : ""} ${!label ? "no-label" : ""}`}>
        {prefix && <span style={{ marginRight: 8, color: "#94a3b8", fontSize: "0.85rem" }}>{prefix}</span>}
        <input
          ref={inputRef}
          id={id}
          type={type}
          className="floating-input-field"
          value={value ?? ""}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          step={step}
          min={min}
          max={max}
          autoFocus={autoFocus}
          autoComplete="off"
        />
        {label && <label className="floating-label-text">{label}</label>}
        {suffix && <span className="floating-suffix">{suffix}</span>}
      </div>
    </div>
  );
}
