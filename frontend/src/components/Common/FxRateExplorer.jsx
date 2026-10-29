import React, { useEffect, useMemo, useRef, useState } from "react";
import { ColorType, createChart } from "lightweight-charts";
import { fetchFxHistory, fetchColInflationHistory } from "../../api/client";
import { useTheme } from "../../context/ThemeContext";
import { getChartColors } from "../../utils/chartTheme";

const RANGES = [
  { label: "1D", days: 1 },
  { label: "1S", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "YTD", days: "YTD" },
  { label: "1A", days: 365 },
  { label: "3A", days: 1095 },
  { label: "5A", days: 1825 },
  { label: "TODO", days: null },
];

const normalizePeriodToRange = (p) => {
  if (!p) return "1A";
  const s = String(p).trim().toUpperCase();
  if (s === "1D") return "1D";
  if (s === "1W" || s === "1S") return "1S";
  if (s === "1M") return "1M";
  if (s === "3M") return "3M";
  if (s === "6M") return "6M";
  if (s === "YTD") return "YTD";
  if (s === "1Y" || s === "1A") return "1A";
  if (s === "3Y" || s === "3A") return "3A";
  if (s === "5Y" || s === "5A") return "5A";
  if (s === "MAX" || s === "ALL" || s === "TODO") return "TODO";
  return "1A";
};

const mapRangeToParentPeriod = (rangeLabel) => {
  if (rangeLabel === "1S") return "1W";
  if (rangeLabel === "1A") return "1Y";
  if (rangeLabel === "3A") return "3Y";
  if (rangeLabel === "5A") return "5Y";
  if (rangeLabel === "TODO") return "MAX";
  return rangeLabel;
};

export default function FxRateExplorer({
  defaultAsset = "USD",
  defaultLocal = "COP",
  minDate = null,
  period = null,
  onPeriodChange = null,
  purchaseDates = [],
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  // Pair state: base is what we want (e.g. USD) and quote is target (e.g. COP)
  const [baseCurrency, setBaseCurrency] = useState(defaultAsset);
  const [quoteCurrency, setQuoteCurrency] = useState(defaultLocal);
  const [isInverted, setIsInverted] = useState(false); // false: USD -> COP, true: COP -> USD

  // Data state
  const [rawFxData, setRawFxData] = useState({ current: 0, history: {} });
  const [rawInflationData, setRawInflationData] = useState({ monthly_rates: [], latest: null });
  const [showInflation, setShowInflation] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Time range filter - synchronized with parent period if provided (default "TODO" to see the complete history)
  const [selectedRange, setSelectedRange] = useState(() => (period ? normalizePeriodToRange(period) : "TODO"));

  useEffect(() => {
    if (period) {
      setSelectedRange(normalizePeriodToRange(period));
    }
  }, [period]);

  const handleSelectRange = (rangeLabel) => {
    setSelectedRange(rangeLabel);
    if (onPeriodChange) {
      onPeriodChange(mapRangeToParentPeriod(rangeLabel));
    }
  };

  // Converter state: default 1 USD / 1 unit
  const [convertAmount, setConvertAmount] = useState(1);

  // Chart DOM refs
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const areaSeriesRef = useRef(null);
  const inflationSeriesRef = useRef(null);

  // Fetch FX data (lazy: only loads when component is mounted / tab activated)
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchFxHistory("USD", "COP")
      .then((res) => {
        if (!isMounted) return;
        if (res && res.history) {
          setRawFxData(res);
        } else {
          setError("No se pudieron cargar los datos de la tasa de cambio");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error fetching FX history:", err);
        setError("Error de conexión al cargar la TRM");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    fetchColInflationHistory()
      .then((res) => {
        if (!isMounted) return;
        if (res && res.monthly_rates) {
          setRawInflationData(res);
        }
      })
      .catch((err) => console.warn("Error fetching inflation history:", err));

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute active rate and transformed historical series based on inversion, period range, and minDate
  const { currentRate, historyList, stats } = useMemo(() => {
    const hist = rawFxData?.history || {};
    const dates = Object.keys(hist).sort();

    if (dates.length === 0) {
      return { currentRate: 0, historyList: [], stats: null };
    }

    const fullList = dates
      .map((d) => {
        const rawVal = Number(hist[d]);
        if (!rawVal || isNaN(rawVal) || rawVal <= 0) return null;
        const val = isInverted ? 1 / rawVal : rawVal;
        return {
          time: d,
          value: isInverted ? Number(val.toFixed(8)) : Number(val.toFixed(2)),
          rawVal,
        };
      })
      .filter(Boolean);

    if (fullList.length === 0) {
      return { currentRate: 0, historyList: [], stats: null };
    }

    const latestRaw = rawFxData.current || fullList[fullList.length - 1].rawVal;
    const curr = isInverted ? (latestRaw > 0 ? 1 / latestRaw : 0) : latestRaw;

    // Filter by selected range (particular del periodo de graficación)
    let filteredList = fullList;
    const rangeObj = RANGES.find((r) => r.label === selectedRange);

    if (selectedRange === "TODO") {
      // Si minDate está presente (p. ej. en Compras), mostrar solo desde la primera compra
      if (minDate) {
        filteredList = fullList.filter((item) => item.time >= minDate);
        if (filteredList.length === 0) filteredList = fullList;
      } else {
        filteredList = fullList;
      }
    } else if (rangeObj && fullList.length > 0) {
      const lastItemDate = new Date(`${fullList[fullList.length - 1].time}T00:00:00Z`);
      let cutoffStr = "";

      if (rangeObj.days === "YTD") {
        const startOfYear = new Date(Date.UTC(lastItemDate.getUTCFullYear(), 0, 1));
        cutoffStr = startOfYear.toISOString().split("T")[0];
      } else if (typeof rangeObj.days === "number") {
        const cutoff = new Date(lastItemDate);
        cutoff.setUTCDate(cutoff.getUTCDate() - rangeObj.days);
        cutoffStr = cutoff.toISOString().split("T")[0];
      }

      // Respetar minDate si el periodo seleccionado va más atrás que la primera compra
      if (minDate && (!cutoffStr || cutoffStr < minDate)) {
        cutoffStr = minDate;
      }

      if (cutoffStr) {
        filteredList = fullList.filter((item) => item.time >= cutoffStr);
      }
      if (filteredList.length === 0) filteredList = fullList;
    }

    // High / Low / Change stats
    let minVal = Infinity;
    let maxVal = -Infinity;
    filteredList.forEach((pt) => {
      if (pt.value < minVal) minVal = pt.value;
      if (pt.value > maxVal) maxVal = pt.value;
    });

    const firstPt = filteredList[0];
    const lastPt = filteredList[filteredList.length - 1];
    const changeVal = firstPt && lastPt ? lastPt.value - firstPt.value : 0;
    const changePct = firstPt && firstPt.value > 0 ? (changeVal / firstPt.value) * 100 : 0;

    return {
      currentRate: curr,
      historyList: filteredList,
      stats: {
        min: minVal === Infinity ? 0 : minVal,
        max: maxVal === -Infinity ? 0 : maxVal,
        changeVal,
        changePct,
        firstTime: firstPt?.time,
        lastTime: lastPt?.time,
      },
    };
  }, [rawFxData, isInverted, selectedRange, minDate]);

  // Filtered inflation data matching active time range
  const filteredInflation = useMemo(() => {
    if (!rawInflationData?.monthly_rates || rawInflationData.monthly_rates.length === 0 || historyList.length === 0) {
      return [];
    }
    const minTime = historyList[0].time;
    const maxTime = historyList[historyList.length - 1].time;
    return rawInflationData.monthly_rates
      .filter((r) => r.date && r.yoy != null && r.date >= minTime && r.date <= maxTime)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        time: r.date,
        value: Number(Number(r.yoy).toFixed(2)),
      }));
  }, [rawInflationData, historyList]);

  // Compute purchase markers for highlighted stock/ETF points
  const purchaseMarkers = useMemo(() => {
    if (!historyList || historyList.length === 0 || !purchaseDates || purchaseDates.length === 0) {
      return [];
    }

    const availableTimes = new Set(historyList.map((pt) => pt.time));
    const sortedTimes = historyList.map((pt) => pt.time);
    const minTime = sortedTimes[0];
    const maxTime = sortedTimes[sortedTimes.length - 1];
    const minMs = new Date(`${minTime}T00:00:00Z`).getTime() - 4 * 86400000;
    const maxMs = new Date(`${maxTime}T00:00:00Z`).getTime() + 4 * 86400000;

    const markers = [];
    const usedTimes = new Set();

    purchaseDates.forEach((rawDate) => {
      if (!rawDate) return;
      const dStr = String(rawDate).split("T")[0];
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
          color: isLight ? "#d97706" : "#fbbf24",
          shape: "circle",
          size: 1.5,
        });
      }
    });

    markers.sort((a, b) => (a.time < b.time ? -1 : 1));
    return markers;
  }, [historyList, purchaseDates, isLight]);

  // Handle Chart Creation & Updates
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth || 600,
      height: 380,
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
        vertLine: { color: chartColors.crosshairColor, width: 1, style: 2 },
        horzLine: { color: chartColors.crosshairColor, width: 1, style: 2 },
      },
      leftPriceScale: {
        visible: showInflation,
        borderColor: chartColors.borderColor,
        textColor: isLight ? "#b45309" : "#fbbf24",
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      rightPriceScale: {
        visible: true,
        borderColor: chartColors.borderColor,
        textColor: chartColors.textColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: chartColors.borderColor,
        timeVisible: false,
        secondsVisible: false,
      },
    });

    chartInstanceRef.current = chart;

    const areaSeries = chart.addAreaSeries({
      lineColor: isInverted ? (isLight ? "#059669" : "#10b981") : isLight ? "#0284c7" : "#00e5ff",
      topColor: isInverted
        ? isLight
          ? "rgba(5, 150, 105, 0.28)"
          : "rgba(16, 185, 129, 0.28)"
        : isLight
        ? "rgba(2, 132, 199, 0.25)"
        : "rgba(0, 229, 255, 0.25)",
      bottomColor: "rgba(0, 0, 0, 0.00)",
      lineWidth: 2,
      priceFormat: isInverted
        ? { type: "price", precision: 6, minMove: 0.000001 }
        : { type: "price", precision: 2, minMove: 0.05 },
    });

    areaSeriesRef.current = areaSeries;

    if (showInflation) {
      const inflationSeries = chart.addLineSeries({
        priceScaleId: "left",
        color: isLight ? "#d97706" : "#f59e0b",
        lineWidth: 2,
        lineStyle: 0,
        title: "IPC Colombia (%)",
        priceFormat: {
          type: "custom",
          formatter: (val) => `${val.toFixed(2)}%`,
        },
      });
      inflationSeriesRef.current = inflationSeries;
      if (filteredInflation.length > 0) {
        inflationSeries.setData(filteredInflation);
      }
    } else {
      inflationSeriesRef.current = null;
    }

    if (historyList.length > 0) {
      areaSeries.setData(historyList);
      if (purchaseMarkers.length > 0) {
        areaSeries.setMarkers(purchaseMarkers);
      }
      chart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => {
      if (container && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: container.clientWidth,
        });
        chartInstanceRef.current.timeScale().fitContent();
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [isInverted, theme, chartColors, isLight, isLoading, showInflation]);

  // Update chart data whenever historyList or purchaseMarkers changes without recreating the chart
  useEffect(() => {
    if (areaSeriesRef.current && chartInstanceRef.current && historyList.length > 0) {
      areaSeriesRef.current.setData(historyList);
      if (purchaseMarkers.length > 0) {
        areaSeriesRef.current.setMarkers(purchaseMarkers);
      } else {
        areaSeriesRef.current.setMarkers([]);
      }
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, [historyList, purchaseMarkers]);

  useEffect(() => {
    if (inflationSeriesRef.current && showInflation && filteredInflation.length > 0) {
      inflationSeriesRef.current.setData(filteredInflation);
    }
  }, [filteredInflation, showInflation]);

  // Switch / Toggle inversion
  const handleToggleInversion = () => {
    setIsInverted((prev) => !prev);
  };

  // Conversions
  const convertedResult = useMemo(() => {
    const num = Number(convertAmount) || 0;
    if (currentRate <= 0) return 0;
    return num * currentRate;
  }, [convertAmount, currentRate]);

  const activeFromSym = isInverted ? "COP" : "USD";
  const activeToSym = isInverted ? "USD" : "COP";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Top Bar: Pair Title, Invert Button & Quick Metrics ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          padding: "16px 20px",
          background: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
          borderRadius: 12,
          border: `1px solid ${isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.3rem",
              background: isInverted
                ? isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.2)"
                : isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(0, 229, 255, 0.15)",
              color: isInverted
                ? isLight ? "#059669" : "#34d399"
                : isLight ? "#0284c7" : "#00e5ff",
            }}
          >
            💱
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                {activeFromSym} / {activeToSym}
              </h3>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontWeight: 700,
                  background: isInverted ? "rgba(16, 185, 129, 0.15)" : "rgba(0, 229, 255, 0.15)",
                  color: isInverted ? (isLight ? "#059669" : "#34d399") : isLight ? "#0284c7" : "var(--accent-primary)",
                  border: `1px solid ${isInverted ? "rgba(16, 185, 129, 0.3)" : "rgba(0, 229, 255, 0.3)"}`,
                }}
              >
                {isInverted ? "Pesos Colombianos a Dólares" : "TRM Dólar / Peso Colombiano"}
              </span>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
              Tasa de cambio spot del mercado interbancario
            </div>
          </div>
        </div>

        {/* Invert Button & Current Value Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              marginRight: 6,
            }}
          >
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Tasa Actual (Spot)
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontSize: "1.35rem",
                  fontWeight: 800,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: isInverted ? (isLight ? "#059669" : "#34d399") : isLight ? "#0284c7" : "var(--accent-primary)",
                }}
              >
                {isInverted
                  ? `$${currentRate.toFixed(6)}`
                  : `$${currentRate.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 700 }}>
                {activeToSym}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleInversion}
            title={`Invertir par a ${activeToSym} → ${activeFromSym}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 8,
              border: `1px solid ${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)"}`,
              background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.05)",
              color: "var(--text-primary)",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: "pointer",
              boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.06)" : "0 2px 8px rgba(0,0,0,0.2)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = isInverted ? "#10b981" : "var(--accent-primary)";
              e.currentTarget.style.transform = "scale(1.02)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            <span style={{ fontSize: "1rem" }}>⇄</span>
            <span>Invertir ({activeToSym} → {activeFromSym})</span>
          </button>
        </div>
      </div>

      {/* ── Conversor de Divisa Rápido e Interactivo ── */}
      <div
        className="fx-explorer-converter-box"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          padding: "16px 20px",
          background: isLight ? "rgba(2, 132, 199, 0.04)" : "rgba(0, 229, 255, 0.03)",
          border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(0, 229, 255, 0.1)"}`,
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Monto a Convertir ({activeFromSym})
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8,
              padding: "6px 12px",
            }}
          >
            <span style={{ fontWeight: 800, color: "var(--text-muted)", marginRight: 8 }}>
              {activeFromSym === "USD" ? "$" : "COP$"}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={convertAmount}
              onChange={(e) => setConvertAmount(e.target.value)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
              placeholder="0.00"
            />
            <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", marginLeft: 6 }}>
              {activeFromSym}
            </span>
          </div>
        </div>

        {/* Central Arrow */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            onClick={handleToggleInversion}
            title="Click para alternar dirección de conversión"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 20,
              background: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 700,
              color: "var(--text-secondary)",
              transition: "all 0.2s ease",
            }}
          >
            <span>{activeFromSym}</span>
            <span>➔</span>
            <span>{activeToSym}</span>
          </div>
        </div>

        {/* Result Output */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Equivalente Resultante ({activeToSym})
          </label>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.7)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <span
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                color: isInverted ? (isLight ? "#059669" : "#34d399") : isLight ? "#0284c7" : "var(--accent-primary)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {isInverted
                ? `$${convertedResult.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                : `$${convertedResult.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 800,
                color: "var(--text-muted)",
              }}
            >
              {activeToSym}
            </span>
          </div>
        </div>
      </div>

      {/* ── Chart Section & Range Filters ── */}
      <div
        className="fx-explorer-chart-box"
        style={{
          background: isLight ? "#ffffff" : "var(--bg-surface)",
          border: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "var(--border)"}`,
          borderRadius: 12,
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          {/* Stats summary & Dual Series Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 700 }}>
              📈 Gráfica Histórica ({activeFromSym} / {activeToSym})
            </span>

            {/* Badges for dual scales */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontWeight: 700,
                  background: isInverted ? (isLight ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.2)") : (isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(0, 229, 255, 0.15)"),
                  color: isInverted ? (isLight ? "#059669" : "#34d399") : (isLight ? "#0284c7" : "var(--accent-primary)"),
                  border: `1px solid ${isInverted ? "rgba(16, 185, 129, 0.3)" : "rgba(0, 229, 255, 0.3)"}`,
                }}
              >
                ● {activeFromSym}/{activeToSym} (Eje Derecho)
              </span>

              {showInflation && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontWeight: 700,
                    background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)",
                    color: isLight ? "#b45309" : "#fbbf24",
                    border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
                  }}
                  title="Inflación anual acumulada en Colombia según DANE / Banco de la República"
                >
                  ● Inflación IPC CO {rawInflationData?.latest?.yoy ? `${rawInflationData.latest.yoy}%` : ""} (Eje Izquierdo)
                </span>
              )}
            </div>

            {stats && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "0.78rem" }}>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Mín: </span>
                  <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isInverted ? stats.min.toFixed(6) : stats.min.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Máx: </span>
                  <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isInverted ? stats.max.toFixed(6) : stats.max.toFixed(1)}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    color: stats.changeVal >= 0 ? "#10b981" : "#f43f5e",
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span>{stats.changeVal >= 0 ? "▲" : "▼"}</span>
                  <span>{Math.abs(stats.changePct).toFixed(2)}%</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 500 }}>
                    en el periodo
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Toggle Inflación */}
            <button
              type="button"
              onClick={() => setShowInflation((v) => !v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: showInflation
                  ? isLight ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.22)"
                  : isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${showInflation ? (isLight ? "rgba(217, 119, 6, 0.4)" : "rgba(245, 158, 11, 0.45)") : isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: showInflation ? (isLight ? "#b45309" : "#fbbf24") : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Superponer la curva de Inflación Anual IPC de Colombia en el eje izquierdo del gráfico"
            >
              <span>📊 Inflación IPC</span>
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: showInflation ? (isLight ? "#d97706" : "#f59e0b") : (isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"),
                  color: showInflation ? "#ffffff" : "var(--text-muted)",
                }}
              >
                {showInflation ? "ON" : "OFF"}
              </span>
            </button>

            {/* Timeframe Buttons */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
                padding: 3,
                borderRadius: 8,
                border: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
            {RANGES.map((r) => {
              const isSelected = selectedRange === r.label;
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => handleSelectRange(r.label)}
                  style={{
                    border: "none",
                    background: isSelected
                      ? isInverted
                        ? isLight ? "#059669" : "#10b981"
                        : isLight ? "#0284c7" : "var(--accent-primary)"
                      : "transparent",
                    color: isSelected
                      ? isLight ? "#ffffff" : "#0d1117"
                      : "var(--text-muted)",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    fontWeight: isSelected ? 800 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {r.label}
                </button>
              );
            })}
            </div>
          </div>
        </div>

        {/* Chart View Container */}
        <div style={{ position: "relative", width: "100%", height: 380 }}>
          {isLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isLight ? "rgba(255,255,255,0.75)" : "rgba(13, 18, 38, 0.75)",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                zIndex: 5,
                borderRadius: 8,
              }}
            >
              Cargando histórico de tipo de cambio...
            </div>
          )}
          {error && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f43f5e",
                fontSize: "0.85rem",
                zIndex: 5,
              }}
            >
              {error}
            </div>
          )}
          <div
            ref={chartContainerRef}
            style={{
              width: "100%",
              height: 380,
            }}
          />
        </div>
      </div>
    </div>
  );
}
