import React from "react";
import "./InteractiveControls.css";

/**
 * HourglassRangeSlider — Projection Horizon & Percentage Slider with Glowing Gradient Track & Dynamic Tooltip
 */
export default function HourglassRangeSlider({
  min = 0,
  max = 10,
  step = 0.5,
  value = 0,
  onChange,
  disabled = false,
  className = "",
  style = {},
  id,
  mode = "years", // 'years' | 'percentage' | 'custom'
  formatTooltip = null,
  thumbIcon = null,
}) {
  const currentVal = Number(value) || 0;
  const percentage = Math.min(100, Math.max(0, ((currentVal - min) / (max - min || 1)) * 100));

  const currentYear = new Date().getFullYear();
  const projectedYear = currentYear + Math.round(currentVal);

  let tooltipLabel = "";
  if (typeof formatTooltip === "function") {
    tooltipLabel = formatTooltip(currentVal);
  } else if (mode === "percentage") {
    tooltipLabel = `${Math.round(currentVal)}%`;
  } else {
    tooltipLabel =
      currentVal === 0
        ? `Hoy (${currentYear})`
        : `+${currentVal} ${currentVal === 1 ? "Año" : "Años"} (${projectedYear})`;
  }

  const tooltipTransform =
    percentage < 15
      ? "translateX(-10%)"
      : percentage > 85
      ? "translateX(-90%)"
      : "translateX(-50%)";

  const defaultThumb = mode === "percentage" ? "🎯" : "⏳";

  return (
    <div
      id={id}
      className={`hourglass-slider-wrapper interactive-control-base ${className}`}
      style={style}
    >
      <div className="hourglass-track-container">
        {/* Glowing Progress Fill */}
        <div
          className="hourglass-progress-bar"
          style={{ width: `${percentage}%` }}
        />

        {/* Native Range Slider for full accessibility and touch handling */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentVal}
          onChange={(e) => onChange && onChange(Number(e.target.value))}
          disabled={disabled}
          className="hourglass-native-slider"
        />

        {/* Floating Tooltip positioned dynamically */}
        <div
          className="hourglass-tooltip"
          style={{ left: `${percentage}%`, transform: tooltipTransform }}
        >
          {tooltipLabel}
        </div>

        {/* Glassmorphic Indicator Thumb */}
        <div
          className="hourglass-thumb-indicator"
          style={{ left: `${percentage}%` }}
        >
          <span style={{ transform: "scale(0.85)", display: "inline-block" }}>
            {thumbIcon || defaultThumb}
          </span>
        </div>
      </div>
    </div>
  );
}
