import React, { useState, useMemo } from "react";
import { useTheme } from "../../context/ThemeContext";
import {
  STANDARD_CDT_TERMS,
  getRankedCDTRates,
} from "../../utils/cdtComparator";

/**
 * CdtComparatorWidget
 * Interactive CDT rates comparator across all major Colombian financial entities.
 * Supports dual theme, term filters, search, and one-click application to the CDT form.
 */
export default function CdtComparatorWidget({
  capital = 1000000,
  initialTermDays = 180,
  historicalRates = null,
  portfolioEntities = [],
  onSelectOption = null,
  compact = true,
  initialCurrency = "COP",
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [selectedTerm, setSelectedTerm] = useState(initialTermDays);
  const [searchQuery, setSearchQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState(initialCurrency || "COP");
  const [isExpanded, setIsExpanded] = useState(!compact);

  // Compute ranking for selected term, capital, and currency
  const rankingData = useMemo(() => {
    const defaultCap = currencyFilter === "USD" ? 1000 : 1000000;
    return getRankedCDTRates(
      selectedTerm,
      Number(capital) > 0 ? Number(capital) : defaultCap,
      historicalRates,
      portfolioEntities,
      currencyFilter
    );
  }, [selectedTerm, capital, historicalRates, portfolioEntities, currencyFilter]);

  // Filter by user search query
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return rankingData.rankedList;
    const q = searchQuery.toLowerCase().trim();
    return rankingData.rankedList.filter(
      (item) =>
        item.bankName.toLowerCase().includes(q) ||
        item.tierLabel.toLowerCase().includes(q)
    );
  }, [rankingData.rankedList, searchQuery]);

  const showAll = isExpanded || Boolean(searchQuery.trim());
  const displayList = showAll ? filteredList : filteredList.slice(0, 3);

  const containerBg = isLight
    ? "rgba(248, 250, 252, 0.95)"
    : "rgba(15, 23, 42, 0.65)";
  const containerBorder = isLight
    ? "1px solid rgba(226, 232, 240, 0.9)"
    : "1px solid rgba(255, 255, 255, 0.08)";
  const cardBg = isLight ? "#ffffff" : "rgba(30, 41, 59, 0.55)";
  const cardBorder = isLight
    ? "1px solid rgba(203, 213, 225, 0.6)"
    : "1px solid rgba(255, 255, 255, 0.06)";
  const bestCardBorder = isLight
    ? "1.5px solid rgba(245, 158, 11, 0.5)"
    : "1.5px solid rgba(245, 158, 11, 0.4)";
  const textMuted = isLight ? "#64748b" : "#94a3b8";

  return (
    <div
      style={{
        background: containerBg,
        border: containerBorder,
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 14,
        boxShadow: isLight
          ? "0 4px 16px rgba(0, 0, 0, 0.03)"
          : "0 4px 20px rgba(0, 0, 0, 0.2)",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "1.2rem" }}>🏆</span>
          <div>
            <div
              style={{
                fontSize: "0.88rem",
                fontWeight: 700,
                color: isLight ? "#0f172a" : "#f8fafc",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Comparador de Tasas para Nuevos CDTs
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "1px 6px",
                  borderRadius: 10,
                  background: isLight ? "#ecfdf5" : "rgba(16, 185, 129, 0.15)",
                  color: isLight ? "#059669" : "#34d399",
                  fontWeight: 600,
                  border: isLight
                    ? "1px solid rgba(16, 185, 129, 0.3)"
                    : "1px solid rgba(16, 185, 129, 0.25)",
                }}
              >
                {currencyFilter === "USD" ? "Mercado USD" : currencyFilter === "ALL" ? "COP + USD" : "Mercado CO"}
              </span>
            </div>
            <div style={{ fontSize: "0.72rem", color: textMuted }}>
              Tasas E.A. vigentes ordenadas de mayor a menor rendimiento neto
              (4% retención)
            </div>
          </div>
        </div>

        {/* Term selector chips */}
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {STANDARD_CDT_TERMS.map((t) => {
            const isSelected = selectedTerm === t.days;
            return (
              <button
                key={t.days}
                type="button"
                onClick={() => setSelectedTerm(t.days)}
                style={{
                  padding: "4px 9px",
                  borderRadius: 6,
                  fontSize: "0.74rem",
                  fontWeight: isSelected ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  border: isSelected
                    ? "1px solid #f59e0b"
                    : isLight
                    ? "1px solid rgba(203, 213, 225, 0.8)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  background: isSelected
                    ? isLight
                      ? "rgba(245, 158, 11, 0.12)"
                      : "rgba(245, 158, 11, 0.22)"
                    : isLight
                    ? "#ffffff"
                    : "rgba(255, 255, 255, 0.03)",
                  color: isSelected
                    ? isLight
                      ? "#b45309"
                      : "#fbbf24"
                    : isLight
                    ? "#475569"
                    : "#cbd5e1",
                }}
              >
                {t.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + Currency filter row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar entidad (ej. KOA, Ban100, Finandina, Caja Social...)"
          style={{
            flex: "1 1 200px",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: "0.75rem",
            background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.75)",
            color: isLight ? "#0f172a" : "#f8fafc",
            border: isLight ? "1px solid rgba(203, 213, 225, 0.9)" : "1px solid rgba(255, 255, 255, 0.12)",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "COP", label: "🇨🇴 COP" },
            { id: "USD", label: "🇺🇸 USD" },
            { id: "ALL", label: "Todos" },
          ].map((currOpt) => {
            const activeCurr = currencyFilter === currOpt.id;
            return (
              <button
                key={currOpt.id}
                type="button"
                onClick={() => setCurrencyFilter(currOpt.id)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: "0.7rem",
                  fontWeight: activeCurr ? 700 : 500,
                  cursor: "pointer",
                  border: activeCurr
                    ? "1px solid #0ea5e9"
                    : isLight
                    ? "1px solid rgba(203, 213, 225, 0.8)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  background: activeCurr
                    ? isLight
                      ? "rgba(14, 165, 233, 0.12)"
                      : "rgba(14, 165, 233, 0.22)"
                    : isLight
                    ? "#ffffff"
                    : "rgba(255, 255, 255, 0.03)",
                  color: activeCurr ? (isLight ? "#0284c7" : "#38bdf8") : textMuted,
                }}
              >
                {currOpt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Capital context note */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.72rem",
          color: textMuted,
          marginBottom: 10,
          background: isLight
            ? "rgba(241, 245, 249, 0.7)"
            : "rgba(255, 255, 255, 0.02)",
          padding: "4px 8px",
          borderRadius: 6,
        }}
      >
        <span>
          Simulando con capital de:{" "}
          <strong style={{ color: isLight ? "#0f172a" : "#f1f5f9" }}>
            ${Number(rankingData.capital || 1000000).toLocaleString("es-CO")}{" "}
            {currencyFilter === "USD" ? "USD" : "COP"}
          </strong>
        </span>
        {filteredList.length > 3 && !searchQuery.trim() && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: "none",
              border: "none",
              color: isLight ? "#2563eb" : "#38bdf8",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.72rem",
            }}
          >
            {isExpanded
              ? `Mostrar top 3 ▲`
              : `Ver todas (${filteredList.length} entidades) ▼`}
          </button>
        )}
      </div>

      {/* Ranked list grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            displayList.length <= 2
              ? "repeat(auto-fit, minmax(280px, 1fr))"
              : "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 8,
        }}
      >
        {displayList.map((item) => {
          const isTop1 = item.rank === 1;
          return (
            <div
              key={item.key}
              style={{
                background: cardBg,
                border: isTop1 ? bestCardBorder : cardBorder,
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 8,
                position: "relative",
                transition: "transform 0.15s ease, border-color 0.15s ease",
              }}
            >
              {/* Card top row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Medal / Rank */}
                  <span
                    style={{
                      fontSize: item.medal ? "1.1rem" : "0.75rem",
                      fontWeight: 800,
                      color: isLight ? "#475569" : "#94a3b8",
                      minWidth: 20,
                      textAlign: "center",
                    }}
                  >
                    {item.medal || `#${item.rank}`}
                  </span>

                  {/* Bank Logo / Icon */}
                  {item.logoUrl ? (
                    <img
                      src={item.logoUrl}
                      alt={item.bankName}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: item.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.85rem",
                        color: "#fff",
                      }}
                    >
                      {item.icon}
                    </span>
                  )}

                  <div>
                    <div
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        color: isLight ? "#0f172a" : "#f8fafc",
                        lineHeight: 1.2,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{item.bankName}</span>
                      {item.inPortfolio && (
                        <span
                          style={{
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            padding: "1px 5px",
                            borderRadius: 4,
                            background: isLight ? "rgba(16, 185, 129, 0.14)" : "rgba(16, 185, 129, 0.2)",
                            color: isLight ? "#047857" : "#34d399",
                          }}
                        >
                          En Portafolio
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: textMuted }}>
                      {item.tierLabel} • {item.currency} ({item.dayBase}d)
                    </div>
                  </div>
                </div>

                {/* Rate E.A. */}
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: isTop1
                        ? isLight
                          ? "#d97706"
                          : "#fbbf24"
                        : isLight
                        ? "#059669"
                        : "#10b981",
                      lineHeight: 1.1,
                    }}
                  >
                    {Number(item.rateEA ?? 0).toFixed(2)}%
                  </div>
                  <div
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 600,
                      color: textMuted,
                      textTransform: "uppercase",
                    }}
                  >
                    E.A.
                  </div>
                </div>
              </div>

              {/* Card bottom row: net profit & select button */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 6,
                  borderTop: isLight
                    ? "1px dashed rgba(226, 232, 240, 0.8)"
                    : "1px dashed rgba(255, 255, 255, 0.07)",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.64rem", color: textMuted }}>
                    Ganancia neta ({selectedTerm}d):
                  </div>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: isLight ? "#047857" : "#34d399",
                    }}
                  >
                    +${Math.round(item.netYield).toLocaleString("es-CO")} {item.currency || "COP"}
                  </div>
                </div>

                {onSelectOption && (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectOption({
                        entityId: item.entityId,
                        bankName: item.bankName,
                        suggestedName: item.suggestedName,
                        rateEA: item.rateEA,
                        termDays: selectedTerm,
                        currency: item.currency || "COP",
                        dayBase: item.dayBase || 365,
                      })
                    }
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      background: isTop1
                        ? isLight
                          ? "#f59e0b"
                          : "#f59e0b"
                        : isLight
                        ? "rgba(37, 99, 235, 0.08)"
                        : "rgba(56, 189, 248, 0.12)",
                      color: isTop1
                        ? "#000000"
                        : isLight
                        ? "#1d4ed8"
                        : "#38bdf8",
                      border: isTop1
                        ? "none"
                        : isLight
                        ? "1px solid rgba(37, 99, 235, 0.2)"
                        : "1px solid rgba(56, 189, 248, 0.25)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isTop1 ? "✨ Usar Top 1" : "Elegir"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
