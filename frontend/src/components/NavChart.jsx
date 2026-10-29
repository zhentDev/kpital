import { ColorType, LineStyle, PriceScaleMode, createChart } from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { fetchStockAlerts } from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";
import { InfoTooltip } from "./Common";
import { useTheme } from "../context/ThemeContext";
import { getChartColors, applyChartTheme } from "../utils/chartTheme";

const COLORS = {
  nav: "#00e5ff",
  sp500: "#f59e0b",
  nasdaq: "#a855f7",
  mm20: "#10b981",
};

export default function NavChart({
  navData,
  sp500Data,
  nasdaqData,
  investment = 2000,
  numSlots = 15,
  rebalances = [],
  summary = null,
  holdings = [],
  closedHoldings = [],
  onToggleTicker,
  selectAll,
  selectGainers,
  selectLosers,
  invertSelection,
  isSimulating,
  chartHeight = 400,
  isLiveMode = false,
  period = "3M",
  strategyName = null,
  onRefresh = null,
  isRefreshing = false,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [hoverValues, setHoverValues] = useState(null);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 640 : false));
  const [manualScaleMode, setManualScaleMode] = useState(null); // null = auto, 'log' = force log, 'normal' = force normal
  const [chartReady, setChartReady] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [localRefreshing, setLocalRefreshing] = useState(false);

  const handleManualRefresh = useCallback(() => {
    if (isRefreshing || localRefreshing) return;
    setLocalRefreshing(true);

    if (typeof onRefresh === "function") {
      onRefresh();
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("refreshPortfolioCharts"));
    }

    fetchStockAlerts()
      .then((data) => {
        if (Array.isArray(data)) setAlerts(data);
      })
      .catch(() => {});

    setTimeout(() => {
      setLocalRefreshing(false);
      toast.success("Gráfica y cotizaciones actualizadas", { id: "navchart-refresh" });
    }, 800);
  }, [isRefreshing, localRefreshing, onRefresh]);

  useEffect(() => {
    let isMounted = true;
    const loadAlerts = () => {
      fetchStockAlerts()
        .then((data) => {
          if (isMounted && Array.isArray(data)) {
            setAlerts(data);
          }
        })
        .catch(() => {});
    };
    loadAlerts();
    if (typeof window !== "undefined") {
      window.addEventListener("stockAlertsUpdated", loadAlerts);
      window.addEventListener("focus", loadAlerts);
    }
    return () => {
      isMounted = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("stockAlertsUpdated", loadAlerts);
        window.removeEventListener("focus", loadAlerts);
      }
    };
  }, []);

  const { visibleSeries, toggleSeries } = usePortfolioStore();
  const { theme } = useTheme();
  const isLight = theme === "light";

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 640;
      setIsMobile((prev) => (prev !== mobile ? mobile : prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  const baseActive = navData?.[0]?.value ?? investment;
  const isLogActive = manualScaleMode === "log";

  const handleToggle = (key) => {
    toggleSeries(key);
  };


  // Dedicated effect to toggle line visibility without destroying the chart canvas
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    Object.entries(visibleSeries || {}).forEach(([key, isVis]) => {
      seriesRef.current[key]?.applyOptions({ visible: !!isVis });
    });
  }, [visibleSeries]);

  // Dynamically update scale modes on Right price scale
  useEffect(() => {
    if (!chartRef.current) return;
    const mode = isLogActive ? (PriceScaleMode?.Logarithmic ?? 1) : (PriceScaleMode?.Normal ?? 0);

    chartRef.current.applyOptions({
      rightPriceScale: {
        visible: true,
        mode: mode,
        borderColor: chartColors.borderColor,
        textColor: chartColors.rightScaleText,
        autoScale: true,
      },
    });
  }, [isLogActive, chartColors]);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    const initialMode = isLogActive
      ? (PriceScaleMode?.Logarithmic ?? 1)
      : (PriceScaleMode?.Normal ?? 0);

    chartRef.current = createChart(containerRef.current, {
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
      localization: {
        locale: "es-CO",
        priceFormatter: (price) => {
          if (typeof price !== "number" || isNaN(price)) return "";
          if (isMobile) {
            return "$" + Math.round(price);
          }
          return "$" + price.toFixed(2);
        },
        timeFormatter: (time) => {
          if (typeof time === "number") {
            const date = new Date(time * 1000);
            if (isLiveMode) {
              return date.toLocaleTimeString("es-CO", {
                timeZone: "America/Bogota",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });
            }
            return date.toLocaleDateString("es-CO", {
              timeZone: "America/Bogota",
              year: "numeric",
              month: "short",
              day: "numeric",
            });
          }
          return String(time);
        },
      },
      rightPriceScale: {
        visible: true,
        mode: initialMode,
        borderColor: chartColors.borderColor,
        textColor: chartColors.rightScaleText,
        autoScale: true,
      },
      timeScale: {
        borderColor: chartColors.borderColor,
        barSpacing: isMobile ? 14 : 9,
        minBarSpacing: 6,
        fixLeftEdge: true,
        fixRightEdge: true,
        timeVisible: isLiveMode,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          if (isLiveMode) {
            if (typeof time === "number") {
              const date = new Date(time * 1000);
              return date.toLocaleTimeString("es-CO", {
                timeZone: "America/Bogota",
                hour: "numeric",
                minute: "2-digit",
                hour12: false,
              });
            }
            return String(time);
          }

          // Formato elegante y conciso para evitar colisión de textos:
          // Ej: "Ago 26", "Sep 26", "Oct 26" (o "08/26" / "15 Ago" si es zoom corto)
          try {
            const raw = typeof time === "number" ? new Date(time * 1000) : new Date(String(time).slice(0, 10) + "T12:00:00Z");
            if (isNaN(raw.getTime())) return String(time);

            const mNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            const m = mNames[raw.getUTCMonth()];
            const yr = String(raw.getUTCFullYear()).slice(2);
            const d = raw.getUTCDate();

            // Si es un periodo corto (1W o 1M), mostrar día y mes (ej. "15 Ago")
            if (period === "1W" || period === "1M") {
              return `${d} ${m}`;
            }

            // En móvil o periodos medios/largos (3M, 6M, 1Y, MAX), mostrar Mes y Año conciso ("Ago 26")
            return `${m} ${yr}`;
          } catch {
            return String(time);
          }
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const chart = chartRef.current;

    // Portfolio NAV — area (Right Axis)
    seriesRef.current.nav = chart.addAreaSeries({
      lineColor: chartColors.nav,
      topColor: chartColors.navAreaTop,
      bottomColor: chartColors.navAreaBottom,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
      priceFormat: isMobile
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
      visible: visibleSeries?.nav !== false,
      priceScaleId: "right",
    });

    // S&P 500 — amber line (Right Axis)
    seriesRef.current.sp500 = chart.addLineSeries({
      color: chartColors.sp500,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
      priceFormat: isMobile
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
      visible: visibleSeries?.sp500 !== false,
      priceScaleId: "right",
    });

    // NASDAQ — purple line (Right Axis)
    seriesRef.current.nasdaq = chart.addLineSeries({
      color: chartColors.nasdaq,
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
      priceFormat: isMobile
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
      visible: visibleSeries?.nasdaq !== false,
      priceScaleId: "right",
    });

    // Base investment line (Right Axis) — highlighted with clear visibility and clean dashed style
    seriesRef.current.base = chart.addLineSeries({
      color: chartColors.base || "#94a3b8",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
      priceFormat: isMobile
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
      visible: visibleSeries?.base !== false,
      priceScaleId: "right",
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverValues(null);
        return;
      }

      const navVal = seriesRef.current.nav
        ? param.seriesData.get(seriesRef.current.nav)?.value
        : null;
      const spVal = seriesRef.current.sp500
        ? param.seriesData.get(seriesRef.current.sp500)?.value
        : null;
      const nsdVal = seriesRef.current.nasdaq
        ? param.seriesData.get(seriesRef.current.nasdaq)?.value
        : null;
      const baseVal = seriesRef.current.base
        ? param.seriesData.get(seriesRef.current.base)?.value
        : null;

      setHoverValues({
        date: param.time,
        nav: navVal != null ? navVal : null,
        sp500: spVal != null ? spVal : null,
        nasdaq: nsdVal != null ? nsdVal : null,
        base: baseVal != null ? baseVal : null,
      });
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        const w = containerRef.current.clientWidth;
        const responsiveHeight = window.innerWidth <= 640 ? 290 : window.innerWidth <= 1024 ? 350 : chartHeight;
        chartRef.current.applyOptions({
          width: w,
          height: responsiveHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    setChartReady((prev) => prev + 1);

    return () => ro.disconnect();
  }, [isLiveMode, chartHeight, isMobile, chartColors, isLogActive, visibleSeries]);

  // Init chart once on component mount or isMobile change
  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
  }, [initChart]);

  // Apply theme updates to an already-mounted chart instance (including curve colors)
  useEffect(() => {
    if (chartRef.current) {
      applyChartTheme(chartRef.current, theme, seriesRef.current);
    }
  }, [theme]);

  // Helper to convert array to Lightweight Charts format with responsive downsampling for mobile
  const toSeries = (arr) => {
    const raw = (arr || [])
      .filter((d) => d && (d.date || d.time) && d.value != null && !isNaN(d.value))
      .map((d) => {
        const rawTime = d.time ?? d.date;
        let timeFormatted;
        if (typeof rawTime === "number") {
          timeFormatted = Math.floor(rawTime);
        } else {
          timeFormatted = String(rawTime).slice(0, 10);
        }
        return { time: timeFormatted, value: Number(d.value) };
      })
      .sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0))
      .filter((v, idx, self) => idx === 0 || v.time !== self[idx - 1].time);

    // On mobile devices, downsample if there are more than 30 data points
    // (e.g. taking periodic samples to avoid cramped jitter while preserving start and end points)
    if (isMobile && raw.length > 30) {
      const sampled = [];
      const interval = Math.ceil(raw.length / 28);
      const lastPoint = raw[raw.length - 1];

      for (let i = 0; i < raw.length; i += interval) {
        sampled.push(raw[i]);
      }
      if (sampled[sampled.length - 1].time !== lastPoint.time) {
        sampled.push(lastPoint);
      }
      return sampled;
    }

    return raw;
  };

  const purchaseMarkers = useMemo(() => {
    if (!navData || navData.length === 0) return [];
    const dateSet = new Set();
    (rebalances || []).forEach((r) => {
      const d = r.rebalance_date || r.date;
      if (d) dateSet.add(String(d).split("T")[0]);
    });
    (holdings || []).forEach((h) => {
      const d = h.purchase_date || h.entry_date || h.date;
      if (d) dateSet.add(String(d).split("T")[0]);
    });

    if (dateSet.size === 0) return [];

    const availableTimes = new Set(navData.map((d) => String(d.date || d.time || "").split("T")[0]));
    const sortedTimes = Array.from(availableTimes).sort();
    if (sortedTimes.length === 0) return [];
    const minTime = sortedTimes[0];
    const maxTime = sortedTimes[sortedTimes.length - 1];
    const minMs = new Date(`${minTime}T00:00:00Z`).getTime() - 4 * 86400000;
    const maxMs = new Date(`${maxTime}T00:00:00Z`).getTime() + 4 * 86400000;

    const markers = [];
    const usedTimes = new Set();

    dateSet.forEach((dStr) => {
      const targetMs = new Date(`${dStr}T00:00:00Z`).getTime();
      if (isNaN(targetMs) || targetMs < minMs || targetMs > maxMs) return;
      let matchedTime = null;
      if (availableTimes.has(dStr)) {
        matchedTime = dStr;
      } else {
        let closest = null;
        let minDiff = 4 * 86400000;
        for (const t of sortedTimes) {
          const diff = Math.abs(new Date(`${t}T00:00:00Z`).getTime() - targetMs);
          if (diff <= minDiff) {
            minDiff = diff;
            closest = t;
          }
        }
        matchedTime = closest;
      }

      if (matchedTime && !usedTimes.has(matchedTime)) {
        usedTimes.add(matchedTime);
        markers.push({
          time: matchedTime,
          position: "inBar",
          color: isLight ? "rgba(2, 132, 199, 0.45)" : "rgba(0, 229, 255, 0.45)",
          shape: "circle",
          size: 0.5,
        });
      }
    });

    markers.sort((a, b) => (a.time < b.time ? -1 : 1));
    return markers;
  }, [navData, rebalances, holdings, isLight]);

  // Update series data with real price action
  useEffect(() => {
    if (!chartRef.current) return;

    if (navData?.length) {
      const sNav = toSeries(navData);
      if (sNav.length) {
        seriesRef.current.nav?.setData(sNav);
        if (purchaseMarkers.length > 0) {
          seriesRef.current.nav?.setMarkers(purchaseMarkers);
        } else {
          seriesRef.current.nav?.setMarkers([]);
        }
      }
    }

    if (sp500Data?.length) {
      const sSP500 = toSeries(sp500Data);
      if (sSP500.length) {
        seriesRef.current.sp500?.setData(sSP500);
      }
    }

    if (nasdaqData?.length) {
      const sNasdaq = toSeries(nasdaqData);
      if (sNasdaq.length) {
        seriesRef.current.nasdaq?.setData(sNasdaq);
      }
    }

    // Base investment line (tracks active capital invested per tranche, e.g. $666.67 in Aug -> $800.00 in Sept)
    if (navData && navData.length > 1) {
      const slotVal = investment / (numSlots || 15);
      const sortedRebs = Array.isArray(rebalances) && rebalances.length > 0
        ? [...rebalances].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        : [];

      const activeHoldingsList = holdings.filter((h) => h.selected !== false && h.shares > 0);
      const isFiltered = holdings.length > 0 && activeHoldingsList.length < holdings.length;
      const selectedTickersSet = new Set(activeHoldingsList.map((h) => h.ticker));

      const baseLine = navData.map((pt) => {
        const ptDate = pt.date || pt.time;
        // En modo Live / Intradía, la línea Base de la gráfica es siempre la apertura de esa sesión intradía
        if (isLiveMode) {
          return {
            date: ptDate,
            value: navData[0].value,
          };
        }
        if (sortedRebs.length > 0 && slotVal > 0) {
          const ptStr = String(ptDate).slice(0, 10);
          const validRebs = sortedRebs.filter((r) => (r.date || "") <= ptStr);
          if (validRebs.length > 0) {
            const rawTickers = validRebs[validRebs.length - 1].tickers || [];
            // Si el usuario filtró acciones, contar solo los tickers del rebalanceo que estén seleccionados
            const count = isFiltered
              ? rawTickers.filter((t) => selectedTickersSet.has(t)).length
              : rawTickers.length;
            return { date: ptDate, value: count * slotVal };
          }
        }
        if (typeof pt.active_invested === "number" && pt.active_invested > 0) {
          return { date: ptDate, value: pt.active_invested };
        }
        let activeCount = 0;
        for (const h of holdings) {
          if (h.selected !== false && h.shares > 0) {
            const entry = h.entry_date || (rebalances?.[0]?.date || "");
            if (!entry || String(ptDate) >= String(entry)) {
              activeCount++;
            }
          }
        }
        const activeCapOnDate = activeCount > 0 ? activeCount * slotVal : navData[0].value;
        return {
          date: ptDate,
          value: activeCapOnDate,
        };
      });
      seriesRef.current.base?.setData(toSeries(baseLine));
    }

    chartRef.current.timeScale().fitContent();
  }, [navData, sp500Data, nasdaqData, investment, numSlots, rebalances, holdings, chartReady, isMobile, isLiveMode]);

  const lastNav = navData?.[navData.length - 1]?.value;
  const lastSP = sp500Data?.[sp500Data.length - 1]?.value;
  const lastNasdaq = nasdaqData?.[nasdaqData.length - 1]?.value;

  const currentNav = hoverValues?.nav ?? lastNav;
  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;

  // En modo Live / Intradía, la referencia de la gráfica es la apertura de la sesión (baseActive = navData[0].value),
  // garantizando coherencia total al mover o quitar el cursor. En modo histórico, usa active_invested.
  const currentBase = isLiveMode
    ? (hoverValues?.base ?? baseActive)
    : (hoverValues?.base ?? summary?.active_invested ?? baseActive);

  // Real % returns:
  // When hovering (or in Live intraday mode), dynamically compute return against currentBase.
  // When not hovering in historical mode, use the official summary active return if available.
  const navPct = isLiveMode || hoverValues
    ? (currentBase && currentNav != null ? ((currentNav - currentBase) / currentBase) * 100 : null)
    : (summary?.active_return_pct != null
        ? summary.active_return_pct
        : currentBase && currentNav != null
          ? ((currentNav - currentBase) / currentBase) * 100
          : null);

  const spPct = hoverValues
    ? (currentBase && currentSP != null ? ((currentSP - currentBase) / currentBase) * 100 : null)
    : (summary?.sp500_return_pct != null
        ? summary.sp500_return_pct
        : currentBase && currentSP != null
          ? ((currentSP - currentBase) / currentBase) * 100
          : null);

  const nasdaqPct = hoverValues
    ? (currentBase && currentNasdaq != null ? ((currentNasdaq - currentBase) / currentBase) * 100 : null)
    : (summary?.nasdaq_return_pct != null
        ? summary.nasdaq_return_pct
        : currentBase && currentNasdaq != null
          ? ((currentNasdaq - currentBase) / currentBase) * 100
          : null);

  return (
    <div
      className="card nav-chart-inner-card fade-up"
      style={{
        padding: "16px 20px",
        marginBottom: "18px",
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* ── Interactive Chart Legend Bar ─── */}
      <div
        style={{
          display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: "14px",
              paddingBottom: "12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Titanes Portfolio */}
            <button
              onClick={() => handleToggle("nav")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: visibleSeries?.nav ? "rgba(0, 229, 255, 0.12)" : "rgba(0, 0, 0, 0.04)",
                border: `1px solid ${visibleSeries?.nav ? "var(--accent-primary)" : "var(--border)"}`,
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                color: visibleSeries?.nav ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: "0.75rem",
                transition: "all 0.15s ease",
                fontVariantNumeric: "tabular-nums",
              }}
              title="Clic para mostrar/ocultar curva de Titanes"
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: chartColors.nav,
                  opacity: visibleSeries?.nav ? 1 : 0.3,
                  flexShrink: 0,
                }}
              />
              <strong>{isLiveMode ? (strategyName ? `En Vivo: ${strategyName}` : "Portafolio En Vivo") : (strategyName || "Titanes")}</strong>
              <InfoTooltip conceptKey="nav" />
              {currentNav != null && (
                <span
                  className="mono"
                  style={{
                    color: chartColors.nav,
                    fontWeight: 700,
                    minWidth: "62px",
                    textAlign: "right",
                    display: "inline-block",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ${currentNav.toFixed(2)}
                </span>
              )}
              {navPct != null && (
                <span
                  style={{
                    color: navPct >= 0 ? "#22c55e" : "#ef4444",
                    fontSize: "0.7rem",
                    minWidth: "64px",
                    textAlign: "right",
                    display: "inline-block",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ({navPct >= 0 ? "+" : ""}
                  {navPct.toFixed(2)}%)
                </span>
              )}
            </button>

            {/* S&P 500 Benchmark */}
            <button
              onClick={() => handleToggle("sp500")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: visibleSeries?.sp500
                  ? "rgba(245, 158, 11, 0.12)"
                  : "rgba(0, 0, 0, 0.04)",
                border: `1px solid ${visibleSeries?.sp500 ? "rgba(245, 158, 11, 0.4)" : "var(--border)"}`,
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                color: visibleSeries?.sp500 ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: "0.75rem",
                transition: "all 0.15s ease",
                fontVariantNumeric: "tabular-nums",
              }}
              title="Clic para mostrar/ocultar curva de S&P 500"
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: chartColors.sp500,
                  opacity: visibleSeries?.sp500 ? 1 : 0.3,
                  flexShrink: 0,
                }}
              />
              <strong>S&P 500</strong>
              {currentSP != null && (
                <span
                  className="mono"
                  style={{
                    color: chartColors.sp500,
                    fontWeight: 700,
                    minWidth: "62px",
                    textAlign: "right",
                    display: "inline-block",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ${currentSP.toFixed(2)}
                </span>
              )}
              {spPct != null && (
                <span
                  style={{
                    color: spPct >= 0 ? "#22c55e" : "#ef4444",
                    fontSize: "0.7rem",
                    minWidth: "64px",
                    textAlign: "right",
                    display: "inline-block",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ({spPct >= 0 ? "+" : ""}
                  {spPct.toFixed(2)}%)
                </span>
              )}
            </button>

            {/* NASDAQ Benchmark */}
            <button
              onClick={() => handleToggle("nasdaq")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: visibleSeries?.nasdaq
                  ? "rgba(168, 85, 247, 0.12)"
                  : "rgba(0, 0, 0, 0.04)",
                border: `1px solid ${visibleSeries?.nasdaq ? "rgba(168, 85, 247, 0.4)" : "var(--border)"}`,
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                color: visibleSeries?.nasdaq ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: "0.75rem",
                transition: "all 0.15s ease",
                fontVariantNumeric: "tabular-nums",
              }}
              title="Clic para mostrar/ocultar curva de NASDAQ"
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: chartColors.nasdaq,
                  opacity: visibleSeries?.nasdaq ? 1 : 0.3,
                  flexShrink: 0,
                }}
              />
              <strong>NASDAQ</strong>
              {currentNasdaq != null && (
                <span
                  className="mono"
                  style={{
                    color: chartColors.nasdaq,
                    fontWeight: 700,
                    minWidth: "62px",
                    textAlign: "right",
                    display: "inline-block",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ${currentNasdaq.toFixed(2)}
                </span>
              )}
              {nasdaqPct != null && (
                <span
                  style={{
                    color: nasdaqPct >= 0 ? "#22c55e" : "#ef4444",
                    fontSize: "0.7rem",
                    minWidth: "64px",
                    textAlign: "right",
                    display: "inline-block",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ({nasdaqPct >= 0 ? "+" : ""}
                  {nasdaqPct.toFixed(2)}%)
                </span>
              )}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing || localRefreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: 6,
                fontSize: "0.72rem",
                fontWeight: 700,
                cursor: isRefreshing || localRefreshing ? "not-allowed" : "pointer",
                background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)",
                border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.1)"}`,
                color: isLight ? "#0284c7" : "#38bdf8",
                transition: "all 0.15s ease",
                opacity: isRefreshing || localRefreshing ? 0.7 : 1,
              }}
              title="Actualizar datos del mercado y re-renderizar la gráfica en vivo sin recargar la página"
            >
              <span
                style={{
                  display: "inline-block",
                  animation: isRefreshing || localRefreshing ? "spin 0.8s linear infinite" : "none",
                }}
              >
                🔄
              </span>
              <span>{isRefreshing || localRefreshing ? "Actualizando…" : "Actualizar"}</span>
            </button>

            {/* Interactive Scale Mode Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <button
                onClick={() =>
                  setManualScaleMode((prev) => (prev === "log" ? "normal" : "log"))
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  borderRadius: 6,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: isLogActive
                    ? isLight
                      ? "rgba(2, 132, 199, 0.12)"
                      : "rgba(56, 189, 248, 0.12)"
                    : isLight
                      ? "rgba(0, 0, 0, 0.04)"
                      : "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${
                    isLogActive
                      ? isLight
                        ? "rgba(2, 132, 199, 0.4)"
                        : "rgba(56, 189, 248, 0.35)"
                      : isLight
                        ? "rgba(0, 0, 0, 0.12)"
                        : "rgba(255, 255, 255, 0.1)"
                  }`,
                  color: isLogActive
                    ? isLight
                      ? "#0369a1"
                      : "#38bdf8"
                    : "var(--text-muted)",
                  transition: "all 0.15s ease",
                  boxShadow: isLogActive
                    ? isLight
                      ? "0 0 10px rgba(2, 132, 199, 0.15)"
                      : "0 0 10px rgba(56, 189, 248, 0.15)"
                    : "none",
                }}
                title={
                  isLogActive
                    ? "Escala Logarítmica activa. Clic para volver a Escala Lineal."
                    : "Escala Lineal. Clic para activar Escala Logarítmica."
                }
              >
                <span>⚖️</span>
                <span>{isLogActive ? "LOG" : "LINEAL"}</span>
                {manualScaleMode && (
                  <span style={{ fontSize: "0.6rem", opacity: 0.7, marginLeft: 2 }}>[Fijada]</span>
                )}
              </button>
              <InfoTooltip conceptKey="log_scale" position="bottom" />
            </div>

            <span
              style={{
                fontSize: "0.75rem",
                color: isLight ? "#475569" : "#94a3b8",
                fontFamily: "'JetBrains Mono', monospace",
                opacity: hoverValues?.date ? 1 : 0,
                transition: "opacity 0.15s ease",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                minWidth: "125px",
                display: "inline-block",
                textAlign: "right",
              }}
            >
              📅 {(() => {
                const dateVal = hoverValues?.date;
                if (!dateVal) return "";
                if (typeof dateVal === "number") {
                  const d = new Date(dateVal * 1000);
                  return d.toLocaleDateString("es-CO", {
                    timeZone: "America/Bogota",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });
                }
                const str = String(dateVal);
                if (str.length >= 10 && str.includes("-")) {
                  const [y, m, d] = str.split("-");
                  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                  return dateObj.toLocaleDateString("es-CO", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                }
                return str;
              })()}
            </span>
          </div>
        </div>

        {/* ── Integrated Interactive Ticker Activator Bar (Position Switchers with Smooth Animations) ── */}
        {holdings && holdings.length > 0 && onToggleTicker && (
          <div
            className="posiciones-bar-box"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              padding: "10px 14px",
              background: isLight ? "rgba(241, 245, 249, 0.75)" : "rgba(255, 255, 255, 0.02)",
              border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)"}`,
              borderRadius: "var(--radius)",
              marginBottom: "14px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: isSimulating ? "var(--accent-primary)" : "var(--text-secondary)",
                }}
              >
                🎯 Posiciones:
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: isSimulating
                    ? isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0,229,255,0.1)"
                    : isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
                  color: isSimulating
                    ? isLight ? "#0284c7" : "var(--accent-primary)"
                    : "var(--text-muted)",
                  fontWeight: 700,
                  minWidth: "85px",
                  display: "inline-block",
                  textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {holdings.filter((h) => h.selected !== false).length} de {holdings.length} activas
              </span>
            </div>

            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
              <button className="btn-chip" onClick={selectAll} title="Incluir todas las posiciones">
                ⚡ Todos
              </button>
              <button
                className="btn-chip gainer"
                onClick={selectGainers}
                title="Solo posiciones ganadoras"
              >
                🚀 Ganadoras
              </button>
              <button
                className="btn-chip loser"
                onClick={selectLosers}
                title="Solo posiciones perdedoras"
              >
                🔴 Perdedoras
              </button>
              {holdings.some((h) => alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)) && (
                <button
                  className="btn-chip"
                  onClick={() => {
                    const alertTickers = holdings
                      .filter((h) => alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at))
                      .map((h) => h.ticker);
                    if (alertTickers.length === 0) {
                      toast("No hay posiciones con alerta activa", { icon: "ℹ️" });
                      return;
                    }
                    holdings.forEach((h) => {
                      const isSelected = h.selected !== false;
                      const shouldBeSelected = alertTickers.includes(h.ticker);
                      if (isSelected !== shouldBeSelected && onToggleTicker) {
                        onToggleTicker(h.ticker);
                      }
                    });
                  }}
                  title="Filtrar solo posiciones con alerta de venta activa"
                  style={{
                    color: isLight ? "#b45309" : "#fbbf24",
                    borderColor: isLight ? "rgba(217, 119, 6, 0.45)" : "rgba(245, 158, 11, 0.5)",
                    background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.18)",
                    fontWeight: 700,
                  }}
                >
                  🔔 Con Alerta
                </button>
              )}
              <button
                className="btn-chip"
                onClick={invertSelection}
                title="Invertir selección actual"
              >
                🔄 Invertir
              </button>
            </div>

            <div
              style={{
                width: 1,
                height: 16,
                background: isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)",
                margin: "0 4px",
                flexShrink: 0,
              }}
            />

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {holdings.map((h) => {
                const isSelected = h.selected !== false;
                const isGain = (h.unrealized_pnl ?? 0) >= 0;
                const activeAlert = alerts.find(
                  (a) => a.ticker === h.ticker && a.is_active && !a.triggered_at
                );
                const hasAlert = Boolean(activeAlert);

                // Distinct warm amber/orange styling for active sell alert
                const alertBg = isSelected
                  ? isLight ? "rgba(245, 158, 11, 0.16)" : "rgba(245, 158, 11, 0.22)"
                  : isLight ? "rgba(245, 158, 11, 0.05)" : "rgba(245, 158, 11, 0.06)";
                const alertBorder = isSelected
                  ? isLight ? "1px solid rgba(217, 119, 6, 0.55)" : "1px solid rgba(245, 158, 11, 0.65)"
                  : isLight ? "1px dashed rgba(217, 119, 6, 0.3)" : "1px dashed rgba(245, 158, 11, 0.35)";
                const alertColor = isSelected
                  ? isLight ? "#b45309" : "#fbbf24"
                  : isLight ? "#d97706" : "#f59e0b";
                const alertShadow = isSelected
                  ? isLight ? "0 0 10px rgba(245, 158, 11, 0.25)" : "0 0 12px rgba(245, 158, 11, 0.35)"
                  : "none";

                const regularBg = isSelected
                  ? isGain
                    ? isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(0, 229, 255, 0.08)"
                    : "rgba(239, 68, 68, 0.08)"
                  : isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.02)";
                const regularBorder = isSelected
                  ? isGain
                    ? isLight ? "1px solid rgba(2, 132, 199, 0.35)" : "1px solid rgba(0, 229, 255, 0.35)"
                    : "1px solid rgba(239, 68, 68, 0.35)"
                  : isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.08)";
                const regularColor = isSelected
                  ? isGain
                    ? isLight ? "#0284c7" : "#00e5ff"
                    : "#f87171"
                  : isLight ? "#94a3b8" : "#64748b";

                return (
                  <button
                    key={h.ticker}
                    onClick={() => onToggleTicker(h.ticker)}
                    className={`ticker-chip ${isSelected ? "active" : "inactive"} ${hasAlert ? "alert" : isGain ? "gain" : "loss"}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxSizing: "border-box",
                      minWidth: "68px",
                      height: "26px",
                      transition: "all 0.15s ease",
                      background: hasAlert ? alertBg : regularBg,
                      border: hasAlert ? alertBorder : regularBorder,
                      color: hasAlert ? alertColor : regularColor,
                      boxShadow: hasAlert ? alertShadow : "none",
                      opacity: isSelected ? 1 : 0.55,
                    }}
                    title={
                      hasAlert
                        ? `Alerta de venta activa en ${h.ticker}: ${
                            activeAlert.alert_type === "STOP_LOSS" ? "Stop Loss" : "Take Profit"
                          } (${activeAlert.target_value >= 0 ? "+" : ""}${activeAlert.target_value}%). Clic para ${isSelected ? "excluir" : "incluir"}.`
                        : `Clic para ${isSelected ? "excluir" : "incluir"} ${h.ticker}`
                    }
                  >
                    <span style={{ fontSize: hasAlert && isSelected ? "0.75rem" : "0.65rem", width: "12px", textAlign: "center", flexShrink: 0 }}>
                      {isSelected ? (hasAlert ? "🔔" : "✓") : "✗"}
                    </span>
                    <span style={{ flexShrink: 0 }}>{h.ticker}</span>
                    {hasAlert && isSelected && typeof activeAlert.target_value === "number" && (
                      <span
                        style={{
                          fontSize: "0.62rem",
                          fontWeight: 800,
                          opacity: 0.9,
                          marginLeft: 1,
                        }}
                      >
                        {activeAlert.target_value >= 0 ? "+" : ""}{activeAlert.target_value}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      {/* ── Main Canvas & Floating Top-Right Indicator Box ─── */}
      <div
        style={{
          width: "100%",
          position: "relative",
          borderRadius: "calc(var(--radius) - 4px)",
          overflow: "hidden",
        }}
      >
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: `${typeof window !== "undefined" && window.innerWidth <= 640 ? 290 : typeof window !== "undefined" && window.innerWidth <= 1024 ? 350 : chartHeight}px`,
            minHeight: "260px",
            position: "relative",
          }}
        />

        {/* Floating Top-Left Series Indicators (Hidden on small/medium screens to maximize chart view) */}
        {!isMobile && (
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
              maxWidth: 185,
            }}
          >
            {visibleSeries?.nav !== false && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 700 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: chartColors.nav, flexShrink: 0 }} />
                <span style={{ color: isLight ? "#0f172a" : "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isLiveMode ? (strategyName ? `En Vivo (${strategyName})` : "En Vivo") : (strategyName || "Titanes")}
                </span>
              </div>
            )}
            {visibleSeries?.sp500 !== false && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: chartColors.sp500, flexShrink: 0 }} />
                <span style={{ color: isLight ? "#475569" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  S&P 500
                </span>
              </div>
            )}
            {visibleSeries?.nasdaq !== false && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: chartColors.nasdaq, flexShrink: 0 }} />
                <span style={{ color: isLight ? "#475569" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  NASDAQ
                </span>
              </div>
            )}
            {visibleSeries?.base !== false && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600 }}>
                <span style={{ width: 10, height: 2, background: chartColors.base || "#94a3b8", flexShrink: 0, borderRadius: 1 }} />
                <span style={{ color: isLight ? "#475569" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isLiveMode ? "Apertura Día" : "Base"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
