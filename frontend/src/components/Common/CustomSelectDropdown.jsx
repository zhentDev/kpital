import React, { useState, useEffect, useRef } from "react";
import "./InteractiveControls.css";

/**
 * CustomSelectDropdown — Glassmorphic Dropdown with Logos, Badges, and Search Filter
 */
export default function CustomSelectDropdown({
  options = [],
  value,
  onChange,
  placeholder = "Seleccionar...",
  searchPlaceholder = "Buscar opción...",
  disabled = false,
  showSearch = true,
  className = "",
  style = {},
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close on outside click
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

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Find currently selected option
  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  // Filter options
  const filteredOptions = options.filter((opt) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const label = (opt.label || opt.name || "").toLowerCase();
    const badge = (opt.badge || opt.country || opt.currency || "").toLowerCase();
    return label.includes(query) || badge.includes(query);
  });

  const handleSelect = (opt) => {
    if (disabled) return;
    setIsOpen(false);
    if (onChange) {
      onChange(opt.value, opt);
    }
  };

  const renderLogoOrIcon = (opt) => {
    if (opt?.logoUrl) {
      return (
        <div className="select-logo-container">
          <img src={opt.logoUrl} alt={opt.label || ""} className="select-logo-img" />
        </div>
      );
    }
    if (opt?.logoSvg) {
      return (
        <div
          className="select-logo-container"
          dangerouslySetInnerHTML={{ __html: opt.logoSvg }}
        />
      );
    }
    if (opt?.icon) {
      return (
        <span style={{ fontSize: "1.05rem", lineHeight: 1, flexShrink: 0 }}>
          {opt.icon}
        </span>
      );
    }
    return null;
  };

  return (
    <div
      ref={containerRef}
      id={id}
      className={`custom-select-wrapper interactive-control-base ${className}`}
      style={style}
    >
      <div
        className={`custom-select-trigger ${isOpen ? "is-open" : ""} ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="select-selection-preview">
          {selectedOption ? (
            <>
              {renderLogoOrIcon(selectedOption)}
              <span className="select-label-text">{selectedOption.label || selectedOption.name}</span>
              {(selectedOption.badge || selectedOption.country) && (
                <span className="select-option-badge">
                  {selectedOption.badge || selectedOption.country}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{placeholder}</span>
          )}
        </div>
        <span className="select-chevron">▼</span>
      </div>

      {/* Floating Menu Popover */}
      {isOpen && (
        <div className="custom-select-menu">
          {showSearch && options.length > 4 && (
            <div className="select-search-box">
              <input
                ref={searchInputRef}
                type="text"
                className="select-search-input"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <div className="select-options-list">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    className={`select-option-item ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelect(opt)}
                  >
                    <div className="select-option-left">
                      {renderLogoOrIcon(opt)}
                      <span className="select-option-name">{opt.label || opt.name}</span>
                    </div>
                    {(opt.badge || opt.country || opt.currency) && (
                      <span className="select-option-badge">
                        {opt.badge || opt.country || opt.currency}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "12px", textAlign: "center", color: "#64748b", fontSize: "0.8rem" }}>
                No se encontraron opciones
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
