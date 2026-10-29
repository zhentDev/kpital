import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import "./InteractiveControls.css";

/**
 * GlassModalWrapper — High-performance Glassmorphism Modal Container
 */
export default function GlassModalWrapper({
  isOpen,
  onClose,
  maxWidth = 620,
  children,
  headerContent,
  className = "",
  style = {},
  zIndex = 1000,
}) {
  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="glass-modal-overlay"
      style={{ zIndex }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div
        className={`glass-modal-panel interactive-control-base ${className}`}
        style={{
          maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth,
          ...style,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {headerContent}
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
