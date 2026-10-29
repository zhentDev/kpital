import React, { useState, useRef, useEffect, useMemo } from "react";
import { useTheme } from "../../context/ThemeContext";
import { formatCashFlowMoney } from "../../utils/cashFlowFormatters";

export default function CascadingCategorySelector({
  budgetItems = [], // Array of items with { id, name, icon, amount, pillarType }
  value,
  onChange,
  currency = "COP",
  fxRate = 4150,
}) {
  const formatMoney = (val, cur = currency) => formatCashFlowMoney(val, cur, fxRate);
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredPillar, setHoveredPillar] = useState("needs");
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef(null);

  // Group items by pillar
  const pillarGroups = useMemo(() => {
    const groups = {
      needs: {
        id: "needs",
        title: "Gastos Fijos (Needs)",
        icon: "🔴",
        color: "#f43f5e",
        items: [],
      },
      wants: {
        id: "wants",
        title: "Estilo de Vida (Wants)",
        icon: "🟣",
        color: "#a855f7",
        items: [],
      },
      wealth: {
        id: "wealth",
        title: "Ahorro & Inversión (Wealth)",
        icon: "🔵",
        color: "#38bdf8",
        items: [],
      },
    };

    budgetItems.forEach((item) => {
      const p = item.pillarType || "needs";
      if (groups[p]) {
        groups[p].items.push(item);
      } else {
        groups.needs.items.push(item);
      }
    });

    return groups;
  }, [budgetItems]);

  // Current selected item
  const selectedItem = value ? budgetItems.find((b) => b.id === value) || null : null;

  // Set initial hovered pillar based on selected item
  useEffect(() => {
    if (selectedItem?.pillarType) {
      setHoveredPillar(selectedItem.pillarType);
    }
  }, [selectedItem]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectItem = (item) => {
    onChange(item.id);
    setIsOpen(false);
    setSearchQuery("");
  };

  // Search filter across all items
  const filteredSearchItems = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return budgetItems.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        b.pillarType?.toLowerCase().includes(q) ||
        b.category?.toLowerCase().includes(q)
    );
  }, [budgetItems, searchQuery]);

  const activePillarObj = pillarGroups[hoveredPillar] || pillarGroups.needs;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.8)",
          border: isOpen
            ? "1px solid #00e5ff"
            : (isLight ? "1px solid rgba(0, 0, 0, 0.15)" : "1px solid rgba(255, 255, 255, 0.12)"),
          borderRadius: "10px",
          padding: "10px 14px",
          color: isLight ? "#0f172a" : "#f8fafc",
          fontSize: "0.86rem",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: isLight
            ? (isOpen ? "0 0 0 2px rgba(0, 229, 255, 0.3)" : "0 1px 3px rgba(0,0,0,0.06)")
            : (isOpen ? "0 0 12px rgba(0, 229, 255, 0.25)" : "none"),
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          {selectedItem ? (
            <>
              <span
                style={{
                  background:
                    selectedItem.pillarType === "wealth"
                      ? "rgba(56, 189, 248, 0.18)"
                      : selectedItem.pillarType === "wants"
                      ? "rgba(168, 85, 247, 0.18)"
                      : "rgba(244, 63, 94, 0.18)",
                  border: `1px solid ${
                    selectedItem.pillarType === "wealth"
                      ? "#38bdf8"
                      : selectedItem.pillarType === "wants"
                      ? "#a855f7"
                      : "#f43f5e"
                  }`,
                  color:
                    selectedItem.pillarType === "wealth"
                      ? "#38bdf8"
                      : selectedItem.pillarType === "wants"
                      ? "#c084fc"
                      : "#f43f5e",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                }}
              >
                {selectedItem.pillarType === "wealth"
                  ? "🔵 Ahorro / CDT"
                  : selectedItem.pillarType === "wants"
                  ? "🟣 Estilo de Vida"
                  : "🔴 Gastos Fijos"}
              </span>
              <span style={{ fontWeight: 600, color: isLight ? "#0f172a" : "#f8fafc" }}>
                {selectedItem.icon || "🎯"} {selectedItem.name}
              </span>
              <span style={{ color: "#64748b", fontSize: "0.76rem" }}>
                ({selectedItem.pillarType === "wealth" ? "Meta" : "Tope"}: {formatMoney(selectedItem.amount, currency)})
              </span>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1rem" }}>🏷️</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.84rem" }}>
                Sin Asignar (Seleccionar rubro opcional)
              </span>
            </div>
          )}
        </div>

        <span style={{ color: "#94a3b8", fontSize: "0.8rem", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>
          ▼
        </span>
      </div>

      {/* 2-Pane Cascading Dropdown Popover */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 1200,
            background: isLight ? "#ffffff" : "rgba(15, 22, 42, 0.96)",
            backdropFilter: "blur(20px)",
            border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(0, 229, 255, 0.25)",
            borderRadius: "14px",
            boxShadow: isLight ? "0 16px 36px rgba(0, 0, 0, 0.15)" : "0 16px 40px rgba(0, 0, 0, 0.6)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Search Header */}
          <div style={{ padding: "10px 12px", borderBottom: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)", background: isLight ? "rgba(0,0,0,0.02)" : "rgba(0,0,0,0.3)" }}>
            <input
              type="text"
              placeholder="🔍 Buscar sobre, gasto o inversión en CDT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.06)",
                border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                padding: "6px 12px",
                color: isLight ? "#0f172a" : "#f8fafc",
                fontSize: "0.8rem",
                boxSizing: "border-box",
                outline: "none",
              }}
              autoFocus
            />
          </div>

          {/* Quick Option: Sin Asignar */}
          <div
            onClick={() => {
              onChange("");
              setIsOpen(false);
              setSearchQuery("");
            }}
            style={{
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              background: !value ? (isLight ? "rgba(100, 116, 139, 0.12)" : "rgba(100, 116, 139, 0.25)") : "transparent",
              borderBottom: isLight ? "1px solid rgba(0, 0, 0, 0.06)" : "1px solid rgba(255, 255, 255, 0.06)",
              transition: "background 0.15s ease",
            }}
          >
            <span style={{ fontSize: "1rem" }}>🚫</span>
            <div>
              <strong style={{ fontSize: "0.82rem", color: isLight ? "#475569" : "#cbd5e1", display: "block" }}>
                Sin Asignar (Dejar libre / Asignar más tarde)
              </strong>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                No descuenta ningún sobre mensual de presupuesto
              </span>
            </div>
            {!value && <span style={{ marginLeft: "auto", color: "#64748b", fontWeight: 700 }}>✓</span>}
          </div>

          {/* Search Results Mode */}
          {filteredSearchItems ? (
            <div style={{ maxHeight: "280px", overflowY: "auto", padding: "8px" }}>
              {filteredSearchItems.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "0.8rem" }}>
                  No se encontraron rubros con esa búsqueda.
                </div>
              ) : (
                filteredSearchItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      background: item.id === value ? "rgba(0, 229, 255, 0.15)" : "transparent",
                      color: isLight ? "#0f172a" : "#f8fafc",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)")}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = item.id === value ? "rgba(0, 229, 255, 0.15)" : "transparent")
                    }
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{item.icon || "🎯"}</span>
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                    </div>
                    <span style={{ color: "#94a3b8", fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace" }}>
                      {formatMoney(item.amount, currency)}
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* 2-Pane Cascading Flyout Layout (General Categories on Left -> Specific Envelopes on Right on Hover) */
            <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", minHeight: "240px", maxHeight: "310px" }}>
              {/* Left Pane: General Pillar Categories */}
              <div
                style={{
                  borderRight: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
                  background: isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(10, 15, 30, 0.6)",
                  padding: "8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {Object.values(pillarGroups).map((pillar) => {
                  const isHovered = hoveredPillar === pillar.id;
                  return (
                    <div
                      key={pillar.id}
                      onMouseEnter={() => setHoveredPillar(pillar.id)}
                      onClick={() => setHoveredPillar(pillar.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.8rem",
                        fontWeight: isHovered ? 700 : 500,
                        background: isHovered ? `${pillar.color}22` : "transparent",
                        borderLeft: isHovered ? `3px solid ${pillar.color}` : "3px solid transparent",
                        color: isHovered ? (isLight ? "#0f172a" : "#f8fafc") : (isLight ? "#64748b" : "#94a3b8"),
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{pillar.icon}</span>
                        <span>{pillar.title.split(" ")[0]}</span>
                      </div>
                      <span style={{ fontSize: "0.7rem", color: isHovered ? pillar.color : "#475569" }}>
                        ▶
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Right Pane: Specific Budget Envelopes for the Hovered Pillar */}
              <div
                style={{
                  padding: "8px 10px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.4)",
                }}
              >
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: activePillarObj.color, padding: "4px 8px 8px 8px", borderBottom: "1px solid rgba(255, 255, 255, 0.05)", display: "flex", justifyContent: "space-between" }}>
                  <span>{activePillarObj.title}</span>
                  <span>{activePillarObj.items.length} rubros</span>
                </div>

                {activePillarObj.items.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "0.78rem" }}>
                    No hay ítems configurados en este pilar.
                  </div>
                ) : (
                  activePillarObj.items.map((item) => {
                    const isSelected = item.id === value;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "0.82rem",
                          background: isSelected ? "rgba(0, 229, 255, 0.18)" : "transparent",
                          border: isSelected ? "1px solid rgba(0, 229, 255, 0.3)" : "1px solid transparent",
                          color: isSelected ? (isLight ? "#0284c7" : "#00e5ff") : (isLight ? "#0f172a" : "#f8fafc"),
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = "transparent";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: "1.1rem" }}>{item.icon || "🎯"}</span>
                          <span style={{ fontWeight: 600 }}>{item.name}</span>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.78rem", fontWeight: 700, color: isSelected ? "#00e5ff" : "#94a3b8" }}>
                            {formatMoney(item.amount, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
