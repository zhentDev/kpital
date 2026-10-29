import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColorType, LineStyle, createChart } from "lightweight-charts";
import toast from "react-hot-toast";
import { fetchHoldingChart } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { getChartColors } from "../utils/chartTheme";
import { getAssetName } from "../utils/assetNames";

export default function IndividualHoldingChart({
  holdings = [],
  closedHoldings = [],
  purchases = [],
  rebalances = [],
  investment = 2000,
  numSlots = 15,
  customStrategies = [],
  activeStrategyId = "historical",
  activeKey = null,
  onSelectKey = null,
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const valSeriesRef = useRef(null);
  const baseSeriesRef = useRef(null);

  // Group options by Active, Closed, and Individual Purchases / Open Lots
  const availableOptions = useMemo(() => {
    const list = [];
    const slotVal = investment / (numSlots || 15);

    // 0. If individual purchases/lots provided (e.g. from IndividualPurchasesView)
    if (purchases && purchases.length > 0) {
      // a. Grouped consolidated positions
      const groupedMap = {};
      purchases.forEach((p) => {
        if (!groupedMap[p.ticker]) {
          const resolvedName = getAssetName(p.ticker, p.name);
          groupedMap[p.ticker] = {
            ticker: p.ticker,
            name: resolvedName,
            shares: 0,
            invested: 0,
            earliestDate: p.date,
            lots: [],
            currentPrice: p.currentPrice || p.purchasePrice,
          };
        }
        const g = groupedMap[p.ticker];
        g.shares += Number(p.shares || 0);
        g.invested += Number(p.invested || p.investedAmount || 0);
        if (p.date < g.earliestDate) g.earliestDate = p.date;
        g.lots.push(p);
      });

      // Add grouped consolidated positions
      Object.values(groupedMap).forEach((g) => {
        const curPrice = g.currentPrice || (g.shares > 0 ? g.invested / g.shares : 0);
        const curVal = g.shares * curPrice;
        const retUsd = curVal - g.invested;
        const retPct = g.invested > 0 ? (retUsd / g.invested) * 100 : 0;
        const avgPrice = g.shares > 0 ? g.invested / g.shares : curPrice;
        const fullName = getAssetName(g.ticker, g.name);

        list.push({
          key: `GROUP_${g.ticker}`,
          ticker: g.ticker,
          name: `${g.ticker} — ${fullName} (Consolidado ${g.lots.length} Lote${g.lots.length !== 1 ? "s" : ""})`,
          fullName,
          status: "PURCHASE_GROUP",
          groupTicker: g.ticker,
          shares: g.shares,
          startPrice: avgPrice,
          entryDate: g.earliestDate,
          exitDate: null,
          costBasis: g.invested,
          currentPrice: curPrice,
          currentValue: curVal,
          returnPct: retPct,
          returnUsd: retUsd,
          lotCount: g.lots.length,
        });
      });

      // b. Individual open lots
      purchases.forEach((p) => {
        const invested = Number(p.invested || p.investedAmount || (p.shares * p.purchasePrice));
        const curPrice = p.currentPrice || p.purchasePrice;
        const curVal = p.shares * curPrice;
        const retUsd = curVal - invested;
        const retPct = invested > 0 ? (retUsd / invested) * 100 : 0;
        const fullName = getAssetName(p.ticker, p.name);

        list.push({
          key: `LOT_${p.id || `${p.ticker}_${p.date}`}`,
          ticker: p.ticker,
          name: `Lote ${p.date} (${Number(p.shares || 0).toFixed(4)} uds @ $${Number(p.purchasePrice || 0).toFixed(2)})`,
          fullName,
          status: "PURCHASE_LOT",
          groupTicker: p.ticker,
          lotId: p.id,
          shares: p.shares,
          startPrice: p.purchasePrice,
          entryDate: p.date,
          exitDate: null,
          costBasis: invested,
          currentPrice: curPrice,
          currentValue: curVal,
          returnPct: retPct,
          returnUsd: retUsd,
        });
      });

      return list;
    }

    // 1. Active holdings from props (Titanes / Dynamic Strategy)
    (holdings || []).forEach((h) => {
      const fullName = getAssetName(h.ticker, h.name);
      list.push({
        key: `${h.ticker}_ACTIVE`,
        ticker: h.ticker,
        name: `${h.ticker} — ${fullName}`,
        fullName,
        status: "ACTIVE",
        shares: h.shares,
        startPrice: h.start_price,
        entryDate: h.entry_date || "2026-08-03",
        exitDate: null,
        costBasis: (h.shares || 0) * (h.start_price || 0) || slotVal,
        currentPrice: h.current_price,
        currentValue: h.current_value,
        returnPct: h.return_pct,
        returnUsd: h.return_usd,
      });
    });

    // 1b. Fallback for simulated strategies where holdings might be empty or partial
    if (Array.isArray(rebalances) && rebalances.length > 0) {
      const latestReb = rebalances[rebalances.length - 1];
      const rebTickers = Array.isArray(latestReb?.tickers) ? latestReb.tickers : [];
      const rebDate = latestReb?.rebalance_date || latestReb?.date || "2026-08-03";

      rebTickers.forEach((t) => {
        if (!list.some((item) => item.ticker === t && item.status === "ACTIVE")) {
          const fullName = getAssetName(t);
          list.push({
            key: `${t}_ACTIVE`,
            ticker: t,
            name: `${t} — ${fullName}`,
            fullName,
            status: "ACTIVE",
            shares: 1.0,
            startPrice: slotVal,
            entryDate: rebDate,
            exitDate: null,
            costBasis: slotVal,
            currentPrice: null,
            currentValue: null,
            returnPct: 0,
            returnUsd: 0,
          });
        }
      });
    }

    // 2. Closed holdings
    (closedHoldings || []).forEach((c) => {
      const fullName = getAssetName(c.ticker, c.name);
      list.push({
        key: `${c.ticker}_CLOSED_${c.exit_date}`,
        ticker: c.ticker,
        name: `${c.ticker} — ${fullName} (Cerrada ${c.exit_date})`,
        fullName,
        status: "CLOSED",
        shares: c.shares,
        startPrice: c.entry_price,
        entryDate: c.entry_date,
        exitDate: c.exit_date,
        costBasis: c.cost_basis || (c.shares * c.entry_price),
        currentPrice: c.exit_price,
        currentValue: c.exit_value,
        returnPct: c.realized_return_pct,
        returnUsd: c.realized_pnl,
      });
    });

    return list;
  }, [holdings, closedHoldings, purchases, rebalances, investment, numSlots]);


  // Selected item state (controlled or uncontrolled)
  const [internalKey, setInternalKey] = useState(() => {
    return availableOptions[0]?.key || "";
  });

  const currentKey = activeKey !== undefined && activeKey !== null ? activeKey : internalKey;

  const handleKeyChange = (newKey) => {
    setInternalKey(newKey);
    if (onSelectKey) onSelectKey(newKey);
  };

  // Keep selection valid if options change
  useEffect(() => {
    if (!currentKey && availableOptions.length > 0) {
      handleKeyChange(availableOptions[0].key);
    }
  }, [availableOptions, currentKey]);

  const selectedItem = useMemo(() => {
    return availableOptions.find((opt) => opt.key === currentKey) || availableOptions[0] || null;
  }, [availableOptions, currentKey]);

  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const lastFetchedKeyRef = useRef("");

  // Fetch hourly data ONLY when selectedItem identity changes
  const selectedKey = selectedItem?.key || "";
  useEffect(() => {
    if (!selectedItem || !selectedKey) return;
    if (lastFetchedKeyRef.current === selectedKey && chartData) return;

    let isCancelled = false;
    lastFetchedKeyRef.current = selectedKey;
    setLoading(true);

    fetchHoldingChart({
      ticker: selectedItem.ticker,
      startDate: selectedItem.entryDate,
      exitDate: null, // Always fetch up to present day
      shares: selectedItem.shares,
      costBasis: selectedItem.costBasis,
      entryPrice: selectedItem.startPrice,
    })
      .then((res) => {
        if (!isCancelled && res) {
          setChartData(res);
        }
      })
      .catch((err) => {
        console.error("Error fetching holding hourly chart:", err);
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedKey, selectedItem?.ticker, selectedItem?.entryDate, selectedItem?.shares, selectedItem?.costBasis, selectedItem?.startPrice]);

  const [isRefreshingManual, setIsRefreshingManual] = useState(false);

  const handleManualRefresh = useCallback(() => {
    if (!selectedItem || loading || isRefreshingManual) return;
    setIsRefreshingManual(true);
    fetchHoldingChart({
      ticker: selectedItem.ticker,
      startDate: selectedItem.entryDate,
      exitDate: null,
      shares: selectedItem.shares,
      costBasis: selectedItem.costBasis,
      entryPrice: selectedItem.startPrice,
    })
      .then((res) => {
        if (res) {
          setChartData(res);
          toast.success(`Gráfica de ${selectedItem.ticker} actualizada`, { id: "holding-chart-refresh" });
        }
      })
      .catch((err) => {
        console.error("Error refreshing holding chart:", err);
        toast.error("Error al actualizar la gráfica");
      })
      .finally(() => {
        setTimeout(() => setIsRefreshingManual(false), 500);
      });
  }, [selectedItem, loading, isRefreshingManual]);

  useEffect(() => {
    const handleGlobalRefresh = () => {
      if (selectedItem) {
        handleManualRefresh();
      }
    };
    window.addEventListener("refreshPortfolioCharts", handleGlobalRefresh);
    return () => window.removeEventListener("refreshPortfolioCharts", handleGlobalRefresh);
  }, [handleManualRefresh, selectedItem]);

  // Effect 1: Initialize chart instance ONCE (or on theme change)
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy existing chart if present
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: chartColors.textColor,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: chartColors.gridColor },
        horzLines: { color: chartColors.gridColor },
      },
      crosshair: {
        vertLine: { color: chartColors.crosshairColor, width: 1, style: LineStyle.Dashed },
        horzLine: { color: chartColors.crosshairColor, width: 1, style: LineStyle.Dashed },
      },
      timeScale: {
        borderColor: chartColors.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: chartColors.borderColor,
        textColor: chartColors.rightScaleText,
        autoScale: true,
      },
      localization: {
        locale: "es-CO",
        priceFormatter: (price) => "$" + Number(price).toFixed(2),
        timeFormatter: (time) => {
          if (typeof time === "number") {
            const d = new Date(time * 1000);
            return d.toLocaleDateString("es-CO", {
              timeZone: "America/Bogota",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
          }
          return String(time);
        },
      },
      width: containerRef.current.clientWidth,
      height: 380,
    });

    chartRef.current = chart;

    // 1. Base reference line (Inversión base inicial de esta única acción)
    const baseSeries = chart.addLineSeries({
      color: chartColors.base || "#94a3b8",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "",
    });
    baseSeriesRef.current = baseSeries;

    // 2. Valuation curve of the stock position (shares * price)
    const valSeries = chart.addAreaSeries({
      topColor: "rgba(16, 185, 129, 0.28)",
      bottomColor: "rgba(16, 185, 129, 0.00)",
      lineColor: "#10b981",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "",
    });
    valSeriesRef.current = valSeries;

    // Crosshair listener for hover details
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverPoint(null);
        return;
      }
      const val = param.seriesData.get(valSeries)?.value;
      const base = param.seriesData.get(baseSeries)?.value;
      if (val != null) {
        const costBasis = base != null && base > 0 ? base : (chartData?.cost_basis || 1);
        const retUsd = val - costBasis;
        const retPct = costBasis > 0 ? (retUsd / costBasis) * 100 : 0;
        setHoverPoint({
          time: param.time,
          value: val,
          base: costBasis,
          returnUsd: retUsd,
          returnPct: retPct,
        });
      } else {
        setHoverPoint(null);
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [theme, chartColors]);

  // Effect 2: Update series data and markers when chartData or selectedItem status changes
  useEffect(() => {
    if (!chartRef.current || !valSeriesRef.current || !baseSeriesRef.current) return;
    if (!chartData || !Array.isArray(chartData.series) || chartData.series.length === 0) return;

    const valPoints = chartData.series
      .map((pt) => ({ time: pt.time, value: pt.value }))
      .sort((a, b) => a.time - b.time)
      .filter((v, idx, arr) => idx === 0 || v.time !== arr[idx - 1].time);

    const costBasis = chartData.cost_basis || selectedItem?.costBasis || 100;
    const basePoints = valPoints.map((pt) => ({ time: pt.time, value: costBasis }));

    const isGain = (chartData?.return_usd ?? 0) >= 0;
    const curveColor = isGain ? "#10b981" : "#ef4444";

    valSeriesRef.current.applyOptions({
      topColor: isGain ? "rgba(16, 185, 129, 0.28)" : "rgba(239, 68, 68, 0.28)",
      bottomColor: isGain ? "rgba(16, 185, 129, 0.00)" : "rgba(239, 68, 68, 0.00)",
      lineColor: curveColor,
    });

    baseSeriesRef.current.setData(basePoints);
    valSeriesRef.current.setData(valPoints);

    // If holding was closed/sold, place an explicit prominent marker on the exit day
    const exitDateStr = selectedItem?.exitDate || chartData?.exit_date;
    if (selectedItem?.status === "CLOSED" && exitDateStr) {
      let markerPt = null;
      for (let i = 0; i < valPoints.length; i++) {
        const pt = valPoints[i];
        const ptIso = chartData.series.find((s) => s.time === pt.time)?.date || "";
        if (ptIso.slice(0, 10) <= exitDateStr) {
          markerPt = pt;
        } else {
          break;
        }
      }
      if (!markerPt && valPoints.length > 0) {
        markerPt = valPoints[0];
      }

      if (markerPt) {
        valSeriesRef.current.setMarkers([
          {
            time: markerPt.time,
            position: "aboveBar",
            color: "#ef4444",
            shape: "arrowDown",
            text: `🔻 VENDIDA (${exitDateStr})`,
            size: 2,
          },
        ]);
      }
    } else {
      valSeriesRef.current.setMarkers([]);
    }

    chartRef.current.timeScale().fitContent();
  }, [chartData, selectedItem?.status, selectedItem?.exitDate, selectedItem?.costBasis]);


  const displayVal = hoverPoint ? hoverPoint.value : (chartData?.current_value ?? selectedItem?.currentValue ?? 0);
  const displayBase = hoverPoint ? hoverPoint.base : (chartData?.cost_basis ?? selectedItem?.costBasis ?? 0);
  const displayRetUsd = hoverPoint ? hoverPoint.returnUsd : (chartData?.return_usd ?? selectedItem?.returnUsd ?? 0);
  const displayRetPct = hoverPoint ? hoverPoint.returnPct : (chartData?.return_pct ?? selectedItem?.returnPct ?? 0);

  return (
    <div style={{ width: "100%" }}>
      {/* ── Sub-header: Selector de Acción Individual y Métricas Clave ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "10px 16px",
          marginBottom: "14px",
          background: isLight ? "#ffffff" : "rgba(0, 0, 0, 0.25)",
          borderRadius: 10,
          border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)"}`,
          boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.04)" : "none",
        }}
      >
        {/* Fila 1: Selector de Acción/Lote + Insignia de Contexto */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              📈 Acción a inspeccionar:
            </span>
            <select
              value={currentKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                background: isLight ? "#f8fafc" : "#1e293b",
                color: isLight ? "#0f172a" : "#f1f5f9",
                border: `1px solid ${isLight ? "#cbd5e1" : "#334155"}`,
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                outline: "none",
                maxWidth: 420,
                boxShadow: isLight ? "0 1px 4px rgba(0,0,0,0.05)" : "0 2px 6px rgba(0,0,0,0.3)",
              }}
            >
              {/* 1. Posiciones Consolidadas */}
              {availableOptions.some((o) => o.status === "PURCHASE_GROUP") && (
                <optgroup label="🏢 Posiciones Consolidadas (Todos los Lotes)">
                  {availableOptions
                    .filter((o) => o.status === "PURCHASE_GROUP")
                    .map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.name} ({o.returnPct >= 0 ? "+" : ""}{Number(o.returnPct || 0).toFixed(2)}%)
                      </option>
                    ))}
                </optgroup>
              )}

              {/* 2. Lotes Individuales Agrupados Limpiamente por Acción / ETF */}
              {(() => {
                const purchaseLots = availableOptions.filter((o) => o.status === "PURCHASE_LOT");
                if (purchaseLots.length === 0) return null;

                // Group lots by ticker
                const lotsByTicker = {};
                purchaseLots.forEach((lot) => {
                  const t = lot.groupTicker || lot.ticker;
                  if (!lotsByTicker[t]) lotsByTicker[t] = [];
                  lotsByTicker[t].push(lot);
                });

                return Object.entries(lotsByTicker).map(([ticker, lots]) => {
                  const assetName = lots[0]?.fullName || getAssetName(ticker);
                  return (
                    <optgroup
                      key={ticker}
                      label={`🎯 ${ticker} • ${assetName} (${lots.length} Lote${lots.length !== 1 ? "s" : ""})`}
                    >
                      {lots.map((o) => (
                        <option key={o.key} value={o.key}>
                          {ticker} — {o.name} ({o.returnPct >= 0 ? "+" : ""}{Number(o.returnPct || 0).toFixed(2)}%)
                        </option>
                      ))}
                    </optgroup>
                  );
                });
              })()}

              {/* 3. Acciones Activas (Titanes) */}
              {availableOptions.some((o) => o.status === "ACTIVE") && (
                <optgroup label="🟢 Acciones Activas (En Cartera)">
                  {availableOptions
                    .filter((o) => o.status === "ACTIVE")
                    .map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.name} ({o.returnPct >= 0 ? "+" : ""}{Number(o.returnPct || 0).toFixed(2)}%)
                      </option>
                    ))}
                </optgroup>
              )}

              {/* 4. Posiciones Cerradas */}
              {availableOptions.some((o) => o.status === "CLOSED") && (
                <optgroup label="🔴 Acciones Vendidas / Posiciones Cerradas">
                  {availableOptions
                    .filter((o) => o.status === "CLOSED")
                    .map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.name} ({o.returnPct >= 0 ? "+" : ""}{Number(o.returnPct || 0).toFixed(2)}%)
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {selectedItem?.status === "PURCHASE_LOT" ? (
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: isLight ? "rgba(124, 58, 237, 0.12)" : "rgba(168, 85, 247, 0.2)",
                  color: isLight ? "#6d28d9" : "#c084fc",
                  border: `1px solid ${isLight ? "rgba(124, 58, 237, 0.35)" : "rgba(168, 85, 247, 0.4)"}`,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🎯</span>
                <span>
                  Lote {selectedItem.ticker}: <strong>{selectedItem.entryDate}</strong> ({Number(selectedItem.shares || 0).toFixed(4)} uds)
                </span>
              </span>
            ) : selectedItem?.status === "PURCHASE_GROUP" ? (
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.18)",
                  color: isLight ? "#0284c7" : "#00e5ff",
                  border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.35)" : "rgba(0, 229, 255, 0.4)"}`,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🏢</span>
                <span>
                  Consolidado {selectedItem.ticker} (<strong>{selectedItem.lotCount || "Varios"} Lotes</strong>)
                </span>
              </span>
            ) : selectedItem?.status === "CLOSED" ? (
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(239, 68, 68, 0.15)",
                  color: isLight ? "#dc2626" : "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🔒</span>
                <span>
                  {selectedItem.ticker} (Cerrada {selectedItem.exitDate})
                </span>
              </span>
            ) : (
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "rgba(16, 185, 129, 0.15)",
                  color: isLight ? "#059669" : "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🟢</span>
                <span>
                  {selectedItem?.ticker} (Activa en Cartera)
                </span>
              </span>
            )}

            {/* Manual refresh button for individual holding chart */}
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={loading || isRefreshingManual}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: 6,
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: loading || isRefreshingManual ? "not-allowed" : "pointer",
                background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)",
                border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.1)"}`,
                color: isLight ? "#0284c7" : "#38bdf8",
                transition: "all 0.15s ease",
                opacity: loading || isRefreshingManual ? 0.7 : 1,
              }}
              title="Actualizar cotización y datos horarios de la acción sin recargar la página"
            >
              <span
                style={{
                  display: "inline-block",
                  animation: loading || isRefreshingManual ? "spin 0.8s linear infinite" : "none",
                }}
              >
                🔄
              </span>
              <span>{loading || isRefreshingManual ? "Actualizando…" : "Actualizar"}</span>
            </button>
          </div>
        </div>

        {/* Fila 2: Resumen Métricas de la Acción (Posición fija e inalterable) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 20,
            flexWrap: "wrap",
            width: "100%",
            paddingTop: 8,
            borderTop: `1px solid ${isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.06)"}`,
          }}
        >
          <div>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
              Inversión Base
            </span>
            <span className="mono" style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-secondary)" }}>
              ${Number(displayBase).toFixed(2)}
            </span>
          </div>

          {selectedItem?.status === "CLOSED" && (
            <div>
              <span style={{ fontSize: "0.68rem", color: "#f87171", textTransform: "uppercase", display: "block", fontWeight: 700 }}>
                Valor al Vender ({selectedItem?.exitDate})
              </span>
              <span className="mono" style={{ fontSize: "0.95rem", fontWeight: 800, color: (selectedItem?.returnUsd ?? 0) >= 0 ? (isLight ? "#059669" : "#34d399") : (isLight ? "#dc2626" : "#f87171") }}>
                ${Number(selectedItem?.currentValue ?? chartData?.exit_value ?? 0).toFixed(2)}
                <span style={{ fontSize: "0.75rem", marginLeft: 4 }}>
                  ({(selectedItem?.returnPct ?? 0) >= 0 ? "+" : ""}{Number(selectedItem?.returnPct ?? 0).toFixed(2)}%)
                </span>
              </span>
            </div>
          )}

          <div>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
              {selectedItem?.status === "CLOSED" ? "Valor de Mercado Hoy (Si siguiera)" : "Valor Actual (Hora a Hora)"}
            </span>
            <span className="mono" style={{ fontSize: "0.95rem", fontWeight: 800, color: displayRetUsd >= 0 ? (isLight ? "#059669" : "#34d399") : (isLight ? "#dc2626" : "#f87171") }}>
              ${Number(displayVal).toFixed(2)}
            </span>
          </div>

          <div>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", display: "block" }}>
              {selectedItem?.status === "CLOSED" ? "Rendimiento Teórico Total" : "Rendimiento Puro"}
            </span>
            <span className="mono" style={{ fontSize: "0.95rem", fontWeight: 800, color: displayRetUsd >= 0 ? (isLight ? "#16a34a" : "#22c55e") : (isLight ? "#dc2626" : "#ef4444") }}>
              {displayRetUsd >= 0 ? "+" : ""}${Number(displayRetUsd).toFixed(2)} ({displayRetPct >= 0 ? "+" : ""}{Number(displayRetPct).toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      {/* ── Chart Container con Canvas Lightweight Charts ── */}
      <div style={{ position: "relative", width: "100%", height: 380 }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isLight ? "rgba(255, 255, 255, 0.7)" : "rgba(10, 15, 30, 0.7)",
              zIndex: 10,
              borderRadius: 8,
              backdropFilter: "blur(2px)",
              pointerEvents: "none",
            }}
          >
            <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>⏳</div>
              Cargando historial hora a hora de <strong>{selectedItem?.ticker}</strong>...
            </div>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {/* Floating Top-Left Series Indicators Box (Matching Titanes NavChart style) */}
        <div
          className="chart-floating-legend"
          style={{
            position: "absolute",
            top: 10,
            left: 14,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background: isLight ? "rgba(255, 255, 255, 0.88)" : "rgba(15, 23, 42, 0.82)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)"}`,
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: isLight
              ? "0 4px 12px rgba(0, 0, 0, 0.06)"
              : "0 4px 12px rgba(0, 0, 0, 0.35)",
            pointerEvents: "none",
            zIndex: 10,
            maxWidth: 280,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.74rem", fontWeight: 700 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: (chartData?.return_usd ?? 0) >= 0 ? "#10b981" : "#ef4444",
                flexShrink: 0,
              }}
            />
            <span style={{ color: isLight ? "#0f172a" : "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedItem?.ticker} — {selectedItem?.fullName || getAssetName(selectedItem?.ticker)}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600 }}>
            <span
              style={{
                width: 10,
                height: 2,
                background: chartColors.base || "#94a3b8",
                flexShrink: 0,
                borderRadius: 1,
              }}
            />
            <span style={{ color: isLight ? "#475569" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Inversión Base
            </span>
          </div>
        </div>
      </div>

      {/* ── Info footer de la acción ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginTop: 10,
          paddingTop: 8,
          borderTop: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}`,
          fontSize: "0.72rem",
          color: "var(--text-muted)",
        }}
      >
        <span>
          📊 Velas y cotizaciones de 1 hora (1h) desde apertura hasta cierre de mercado de EE.UU.
        </span>
        <span>
          Acciones poseídas: <strong style={{ color: "var(--text-primary)" }}>{selectedItem?.shares ? Number(selectedItem.shares).toFixed(4) : "1.0000"}</strong>
          {selectedItem?.startPrice ? ` | Precio Compra: $${Number(selectedItem.startPrice).toFixed(2)}` : ""}
        </span>
      </div>
    </div>
  );
}
