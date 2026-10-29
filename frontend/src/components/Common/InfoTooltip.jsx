import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FINANCIAL_CONCEPTS } from "../../data/financialConcepts";
import { useTheme } from "../../context/ThemeContext";

/**
 * Componente InfoTooltip
 * Muestra un botón o disparador discreto (ícono ℹ️ o badge / texto subrayado).
 * Soporta hover y click (indispensable en móviles o pantallas táctiles).
 * Renderiza mediante createPortal para no ser afectado por overflow: hidden o z-index de padres.
 *
 * Props:
 * - conceptKey: Clave del concepto en FINANCIAL_CONCEPTS (ej: "sharpe_ratio")
 * - customContent: Objeto alternativo { title, tag, tagColor, explanation, rule }
 * - children: Si se pasa contenido, envuelve ese contenido como activador de hover/click.
 * - position: 'top' | 'bottom' | 'left' | 'right' (default: 'top')
 * - icon: Ícono a mostrar si no hay children (default: "ℹ️")
 * - size: 'sm' | 'md' (default: 'sm')
 */
export default function InfoTooltip({
  conceptKey,
  customContent,
  children,
  position = "top",
  icon = "ℹ️",
  size = "sm",
  style = {},
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const timerRef = useRef(null);

  const data = customContent || (conceptKey ? FINANCIAL_CONCEPTS[conceptKey] : null);

  if (!data) return children || null;

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsOpen(true), 120);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsOpen(false), 220);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsOpen((prev) => !prev);
  };

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [isOpen]);

  // Dynamic calculation to prevent tooltip clipping on screen edges
  const [popoverCoords, setPopoverCoords] = useState(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updateCoords = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const tooltipWidth = Math.min(320, window.innerWidth - 24);
      const padding = 12;

      // Detect if opening on top would overflow viewport top
      const spaceAbove = rect.top;
      const showOnBottom = position === "bottom" || spaceAbove < 220;

      // Horizontal centering & clamp within viewport
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      if (left < padding) left = padding;
      if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth - tooltipWidth - padding;
      }

      setPopoverCoords({
        top: showOnBottom ? rect.bottom + 8 : undefined,
        bottom: showOnBottom ? undefined : window.innerHeight - rect.top + 8,
        left,
        width: tooltipWidth,
      });
    };

    updateCoords();
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", updateCoords, true);
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [isOpen, position]);

  const popoverContent = isOpen && popoverCoords && typeof document !== "undefined" ? (
    createPortal(
      <div
        ref={popoverRef}
        className="info-tooltip-popover fade-up"
        onMouseEnter={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
        }}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: popoverCoords.top,
          bottom: popoverCoords.bottom,
          left: popoverCoords.left,
          width: popoverCoords.width,
          maxWidth: "calc(100vw - 24px)",
          zIndex: 9999999,
          background: isLight ? "rgba(255, 255, 255, 0.98)" : "rgba(10, 15, 29, 0.96)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: isLight ? "1px solid rgba(0, 120, 180, 0.25)" : "1px solid rgba(0, 229, 255, 0.35)",
          borderRadius: "12px",
          padding: "14px 16px",
          boxShadow: isLight
            ? "0 10px 30px rgba(0, 0, 0, 0.15), 0 0 14px rgba(0, 120, 180, 0.1)"
            : "0 14px 40px rgba(0, 0, 0, 0.8), 0 0 24px rgba(0, 229, 255, 0.15)",
          textAlign: "left",
          pointerEvents: "auto",
          fontSize: "0.8rem",
          color: isLight ? "#1e293b" : "#f1f5f9",
          lineHeight: 1.45,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
            borderBottom: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
            paddingBottom: 6,
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.85rem",
              color: isLight ? "#0f172a" : "#fff",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            💡 {data.title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {data.tag && (
              <span
                style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: isLight ? "rgba(0, 120, 180, 0.08)" : "rgba(255, 255, 255, 0.06)",
                  color: data.tagColor || "var(--accent-primary)",
                  border: `1px solid ${data.tagColor || "var(--accent-primary)"}44`,
                  whiteSpace: "nowrap",
                }}
              >
                {data.tag}
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: isLight ? "#64748b" : "#94a3b8",
                cursor: "pointer",
                padding: "2px 4px",
                fontSize: "0.85rem",
                lineHeight: 1,
                borderRadius: 4,
              }}
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Explanation */}
        <p
          style={{
            margin: "0 0 10px 0",
            lineHeight: 1.45,
            color: isLight ? "#334155" : "#cbd5e1",
            fontSize: "0.78rem",
          }}
        >
          {data.explanation}
        </p>

        {/* Rule / How to read */}
        {data.rule && (
          <div
            style={{
              background: isLight ? "rgba(0, 120, 180, 0.06)" : "rgba(0, 229, 255, 0.06)",
              borderLeft: "3px solid var(--accent-primary)",
              padding: "6px 10px",
              borderRadius: "0 6px 6px 0",
              fontSize: "0.73rem",
              lineHeight: 1.4,
              color: isLight ? "#475569" : "#94a3b8",
            }}
          >
            <strong style={{ color: "var(--accent-primary)", display: "block", marginBottom: 2 }}>
              🎯 Interpretación práctica:
            </strong>
            {data.rule}
          </div>
        )}
      </div>,
      document.body
    )
  ) : null;

  return (
    <>
      <span
        ref={containerRef}
        className="info-tooltip-wrapper"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          cursor: "pointer",
          verticalAlign: "middle",
          ...style,
        }}
      >
        {children ? (
          <span
            className="info-tooltip-trigger-custom"
            style={{
              borderBottom: isLight ? "1px dashed rgba(0, 0, 0, 0.25)" : "1px dashed rgba(255, 255, 255, 0.35)",
              paddingBottom: "1px",
              transition: "border-color 0.2s ease",
            }}
          >
            {children}
          </span>
        ) : (
          <span
            className="info-tooltip-btn"
            title={data.title}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: size === "sm" ? 18 : 22,
              height: size === "sm" ? 18 : 22,
              fontSize: size === "sm" ? "0.68rem" : "0.78rem",
              borderRadius: "50%",
              background: isLight ? "rgba(0, 120, 180, 0.1)" : "rgba(255, 255, 255, 0.08)",
              color: isLight ? "#0284c7" : "var(--text-secondary)",
              border: isLight ? "1px solid rgba(0, 120, 180, 0.3)" : "1px solid rgba(255, 255, 255, 0.15)",
              lineHeight: 1,
              userSelect: "none",
              transition: "all 0.2s ease",
              marginLeft: 4,
            }}
          >
            {icon}
          </span>
        )}
      </span>
      {popoverContent}
    </>
  );
}
