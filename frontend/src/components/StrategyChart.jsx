import { ColorType, LineStyle, createChart } from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortfolioStore } from "../store/portfolioStore";
import { useTheme } from "../context/ThemeContext";
import { getChartColors, applyChartTheme } from "../utils/chartTheme";

const COLORS = {
  sp500: "#f59e0b",
  nasdaq: "#a855f7",
  mm20: "#10b981",
};

export const SYNTHETIC_RETURNS = {
  "1D": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 1, points: 7 },
  "1W": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 7, points: 7 },
  "1M": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 30, points: 30 },
  "3M": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 90, points: 45 },
  "6M": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 180, points: 60 },
  "1Y": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 365, points: 90 },
  "3Y": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 1095, points: 120 },
  "5Y": { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 1825, points: 150 },
  MAX: { sp: 0.0, nasdaq: 0.0, strat: 0.0, days: 90, points: 45 },
};

// Generador pseudoaleatorio predecible para que la curva no salte con cada render
function seededRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function generateSyntheticData(
  baseActive,
  period,
  firstInvestDate,
  rebalances = [],
  slotValue = 0,
  targetReturns = null,
  navData = null,
  strategy = null,
) {
  // If navData with valid historical series is provided by backend, use real data directly!
  if (navData && Array.isArray(navData.nav) && navData.nav.length > 1) {
    const isMidCap = strategy?.benchmark === "S&P MidCap 400" || strategy?.id === "strat_mm20";
    const benchmarkPoints = isMidCap && Array.isArray(navData.mm20) && navData.mm20.length > 0
      ? navData.mm20
      : (Array.isArray(navData.sp500) ? navData.sp500 : []);
    const spPoints = benchmarkPoints;
    const nsdPoints = Array.isArray(navData.nasdaq) ? navData.nasdaq : [];

    const spMap = new Map(spPoints.map((p) => [p.date, p.value]));
    const nsdMap = new Map(nsdPoints.map((p) => [p.date, p.value]));

    const sortedRebalances = Array.isArray(rebalances) && rebalances.length > 0
      ? [...rebalances].sort((a, b) => (a.rebalance_date || a.date || "").localeCompare(b.rebalance_date || b.date || ""))
      : [];
    const initialCapital = (sortedRebalances.length > 0 && slotValue > 0)
      ? (sortedRebalances[0].tickers?.length || 0) * slotValue
      : (baseActive || 500);

    const getCap = (dateStr) => {
      if (sortedRebalances.length > 0 && slotValue > 0) {
        const valid = sortedRebalances.filter((r) => (r.rebalance_date || r.date) <= dateStr);
        if (valid.length > 0) {
          return (valid[valid.length - 1].tickers?.length || 0) * slotValue;
        }
        return initialCapital;
      }
      return baseActive || 500;
    };

    const sp500 = [];
    const nasdaq = [];
    const strat = [];
    const baseLine = [];

    navData.nav.forEach((pt) => {
      const rawDate = pt.date;
      // If rawDate is numeric string or number (unix seconds), convert to Number for lightweight-charts
      const d = (!isNaN(Number(rawDate)) && String(rawDate).trim() !== "") ? Number(rawDate) : rawDate;
      const stratVal = pt.value || pt.stock_value || baseActive;
      const capVal = pt.active_invested || getCap(String(rawDate));
      strat.push({ time: d, value: stratVal });
      baseLine.push({ time: d, value: capVal });
      sp500.push({ time: d, value: spMap.get(rawDate) ?? capVal });
      nasdaq.push({ time: d, value: nsdMap.get(rawDate) ?? capVal });
    });

    if (strat.length > 0) {
      return { sp500, nasdaq, strat, baseLine };
    }
  }

  let effectivePeriod = period;
  if (effectivePeriod === "MAX") {
    effectivePeriod = "3M";
  }
  const defaultPData = SYNTHETIC_RETURNS[effectivePeriod] || SYNTHETIC_RETURNS["3M"];
  const pData = {
    sp: targetReturns?.sp ?? defaultPData.sp,
    nasdaq: targetReturns?.nasdaq ?? defaultPData.nasdaq,
    strat: targetReturns?.strat ?? defaultPData.strat,
    days: defaultPData.days,
    points: defaultPData.points,
  };
  const data = { sp500: [], nasdaq: [], strat: [], baseLine: [] };

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Ordenar rebalanceos cronológicamente si existen
  const sortedRebalances = Array.isArray(rebalances) && rebalances.length > 0
    ? [...rebalances].sort((a, b) => (a.rebalance_date || a.date || "").localeCompare(b.rebalance_date || b.date || ""))
    : [];

  const initialCapital = (sortedRebalances.length > 0 && slotValue > 0)
    ? (sortedRebalances[0].tickers?.length || 0) * slotValue
    : (baseActive || 500);

  const getCapitalOnDate = (dateStr) => {
    if (sortedRebalances.length > 0 && slotValue > 0) {
      const valid = sortedRebalances.filter((r) => (r.rebalance_date || r.date) <= dateStr);
      if (valid.length > 0) {
        return (valid[valid.length - 1].tickers?.length || 0) * slotValue;
      }
      return initialCapital;
    }
    return baseActive || 500;
  };

  // Si hay firstInvestDate y el periodo seleccionado o la fecha de inicio es anterior a pData.days,
  // expandimos spanDays para abarcar desde firstInvestDate (ej. 3 de agosto)
  let spanDays = pData.days;
  if (firstInvestDate) {
    const dInvest = new Date(`${firstInvestDate}T12:00:00`);
    if (!isNaN(dInvest.getTime())) {
      const daysSinceInvest = Math.ceil((today.getTime() - dInvest.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceInvest > 0) {
        spanDays = Math.max(spanDays, daysSinceInvest);
      }
    }
  }

  const pointsCount = Math.max(pData.points, spanDays);
  const dayStep = spanDays / pointsCount;

  // 1. Generate standard random walks
  const rawWalks = { sp500: [0], nasdaq: [0], strat: [0] };
  let seed = spanDays; // seed based on period length

  for (let i = 1; i <= pointsCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - spanDays + Math.round(i * dayStep));
    const year = d.getFullYear();

    // Base random step (-0.5 to 0.5)
    let stepSP = seededRandom(seed++) - 0.5;
    let stepND = seededRandom(seed++) - 0.5;
    let stepMM = seededRandom(seed++) - 0.5;

    // Simulate historical shocks if the date falls in known bear markets
    if (year === 2020 && d.getMonth() === 2) {
      // COVID crash March 2020
      stepSP -= 3;
      stepND -= 2;
      stepMM -= 4;
    } else if (year === 2022) {
      // 2022 Bear Market
      stepSP -= 0.2;
      stepND -= 0.3;
      stepMM -= 0.4;
    } else if (year === 2018 && d.getMonth() === 11) {
      // Late 2018 crash
      stepSP -= 2;
      stepND -= 2;
      stepMM -= 3;
    }

    rawWalks.sp500.push(rawWalks.sp500[i - 1] + stepSP);
    rawWalks.nasdaq.push(rawWalks.nasdaq[i - 1] + stepND);
    rawWalks.strat.push(rawWalks.strat[i - 1] + stepMM);
  }

  // 2. Tie the random walks to the exact target returns (Brownian bridge concept)
  const endSP = rawWalks.sp500[pointsCount];
  const endND = rawWalks.nasdaq[pointsCount];
  const endMM = rawWalks.strat[pointsCount];

  for (let i = 0; i <= pointsCount; i++) {
    let timeVal;
    if (period === "1D") {
      // Intraday hours from 09:30 to 15:30 (intervals of 1h)
      const baseHour = new Date(today);
      baseHour.setHours(9 + Math.floor(i), 30, 0, 0);
      timeVal = Math.floor(baseHour.getTime() / 1000);
    } else {
      const d = new Date(today);
      d.setDate(d.getDate() - spanDays + Math.round(i * dayStep));
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      timeVal = `${year}-${month}-${day}`;
    }

    const progress = i / pointsCount;

    // Calculate the correction needed to force the endpoint to exactly match pData target
    const correctionSP = (pData.sp - endSP) * progress;
    const correctionND = (pData.nasdaq - endND) * progress;
    const correctionMM = (pData.strat - endMM) * progress;

    const volScale = Math.max(0.005, Math.min(0.04, Math.abs(pData.strat || 0.05) / 10));

    const capOnDate = getCapitalOnDate(typeof timeVal === "string" ? timeVal : today.toISOString().split("T")[0]);

    const stratGrowth = pData.strat * Math.pow(progress, 1.4) + (rawWalks.strat[i] + correctionMM) * volScale;
    const spGrowth = pData.sp * Math.pow(progress, 1.2) + (rawWalks.sp500[i] + correctionSP) * volScale * 0.5;
    const ndGrowth = pData.nasdaq * Math.pow(progress, 1.2) + (rawWalks.nasdaq[i] + correctionND) * volScale * 0.7;

    const valSP = capOnDate * (1 + spGrowth);
    const valND = capOnDate * (1 + ndGrowth);
    const valMM = capOnDate * (1 + stratGrowth);

    data.sp500.push({ time: timeVal, value: Math.max(1, valSP) });
    data.nasdaq.push({ time: timeVal, value: Math.max(1, valND) });
    data.strat.push({ time: timeVal, value: Math.max(1, valMM) });
    data.baseLine.push({ time: timeVal, value: Math.max(1, capOnDate) });
  }

  // Ensure unique dates in case of DST overlaps
  const uniqueData = { sp500: [], nasdaq: [], strat: [], baseLine: [] };
  const seenDates = new Set();
  for (let i = 0; i < data.sp500.length; i++) {
    if (!seenDates.has(data.sp500[i].time)) {
      seenDates.add(data.sp500[i].time);
      uniqueData.sp500.push(data.sp500[i]);
      uniqueData.nasdaq.push(data.nasdaq[i]);
      uniqueData.strat.push(data.strat[i]);
      uniqueData.baseLine.push(data.baseLine[i]);
    }
  }

  // Ensure first point matches initial capital and last point matches final target return
  if (uniqueData.sp500.length > 0) {
    const firstTime = uniqueData.strat[0].time;
    const firstCap = getCapitalOnDate(typeof firstTime === "string" ? firstTime : today.toISOString().split("T")[0]);
    uniqueData.sp500[0].value = firstCap;
    uniqueData.nasdaq[0].value = firstCap;
    uniqueData.strat[0].value = firstCap;
    uniqueData.baseLine[0].value = firstCap;

    const last = uniqueData.sp500.length - 1;
    const lastTime = uniqueData.strat[last].time;
    const lastCap = getCapitalOnDate(typeof lastTime === "string" ? lastTime : today.toISOString().split("T")[0]);
    uniqueData.sp500[last].value = lastCap * (1 + pData.sp);
    uniqueData.nasdaq[last].value = lastCap * (1 + pData.nasdaq);
    uniqueData.strat[last].value = lastCap * (1 + pData.strat);
    uniqueData.baseLine[last].value = lastCap;
  }

  // Recorte a la fecha de la primera inversión: nunca se muestra historial anterior (solo para periodos multidiarios)
  if (firstInvestDate && period !== "1D") {
    const clipped = {
      sp500: uniqueData.sp500.filter((pt) => pt.time >= firstInvestDate),
      nasdaq: uniqueData.nasdaq.filter((pt) => pt.time >= firstInvestDate),
      strat: uniqueData.strat.filter((pt) => pt.time >= firstInvestDate),
      baseLine: uniqueData.baseLine.filter((pt) => pt.time >= firstInvestDate),
    };
    if (clipped.strat.length > 0) {
      const firstCap = getCapitalOnDate(clipped.strat[0].time);
      clipped.sp500[0].value = firstCap;
      clipped.nasdaq[0].value = firstCap;
      clipped.strat[0].value = firstCap;
      clipped.baseLine[0].value = firstCap;
      return clipped;
    }
  }

  return uniqueData;
}

export default function StrategyChart({
  strategy,
  activeInvested,
  period: periodProp,
  firstInvestDate,
  rebalances = [],
  slotValue = 0,
  targetReturns = null,
  navData = null,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const [hoverValues, setHoverValues] = useState(null);

  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 640 : false));

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 640;
      setIsMobile((prev) => (prev !== mobile ? mobile : prev));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { theme } = useTheme();
  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  const { period: storePeriod } = usePortfolioStore();
  const period = periodProp ?? storePeriod;

  const [visibleSeries, setVisibleSeries] = useState({
    sp500: strategy?.benchmark !== "NASDAQ",
    nasdaq: strategy?.benchmark === "NASDAQ",
    strat: true,
    baseLine: true,
  });

  const handleToggle = (key) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const chartData = useMemo(
    () =>
      generateSyntheticData(
        activeInvested || 500,
        period,
        firstInvestDate,
        rebalances,
        slotValue,
        targetReturns,
        navData,
        strategy,
      ),
    [activeInvested, period, firstInvestDate, rebalances, slotValue, targetReturns, navData, strategy],
  );

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    Object.entries(visibleSeries).forEach(([key, isVis]) => {
      seriesRef.current[key]?.applyOptions({ visible: !!isVis });
    });
  }, [visibleSeries]);

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    chartRef.current = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: chartColors.textColor,
        fontFamily: "'Inter', -apple-system, sans-serif",
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
      },
      rightPriceScale: {
        borderColor: chartColors.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: chartColors.borderColor,
        timeVisible: false,
        barSpacing: isMobile ? 12 : 8,
      },
      handleScroll: true,
      handleScale: true,
    });

    seriesRef.current.baseLine = chartRef.current.addLineSeries({
      color: chartColors.base || "#94a3b8",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
      priceFormat: isMobile
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
    });

    seriesRef.current.sp500 = chartRef.current.addLineSeries({
      color: chartColors.sp500,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
      priceFormat: isMobile
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
    });

    seriesRef.current.nasdaq = chartRef.current.addLineSeries({
      color: chartColors.nasdaq,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
      priceFormat: isMobile
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
    });

    const isStratReal = strategy?.isRealMoney === true;
    seriesRef.current.strat = chartRef.current.addLineSeries({
      color: strategy?.color || (isStratReal ? "#10b981" : COLORS.mm20),
      lineWidth: isStratReal ? 2.5 : 2,
      lineStyle: isStratReal ? LineStyle.Solid : LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "",
      priceFormat: isMobile
        ? { type: "price", precision: 0, minMove: 1 }
        : { type: "price", precision: 2, minMove: 0.01 },
    });

    chartRef.current.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoverValues(null);
        return;
      }
      const spData = param.seriesData.get(seriesRef.current.sp500);
      const nsdData = param.seriesData.get(seriesRef.current.nasdaq);
      const mmData = param.seriesData.get(seriesRef.current.strat);
      const baseData = param.seriesData.get(seriesRef.current.baseLine);

      setHoverValues({
        sp500: spData?.value ?? null,
        nasdaq: nsdData?.value ?? null,
        strat: mmData?.value ?? null,
        baseLine: baseData?.value ?? null,
      });
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        const responsiveHeight = window.innerWidth <= 640 ? 280 : 320;
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: responsiveHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
    };
  }, [strategy?.color, strategy?.benchmark, strategy?.name, isMobile]);

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [initChart]);

  // Apply theme changes to existing chart instance without full re-creation
  useEffect(() => {
    if (chartRef.current) {
      applyChartTheme(chartRef.current, theme, seriesRef.current);
    }
  }, [theme]);

  // Downsample helper for mobile
  const sampleArr = (arr) => {
    if (!arr || !Array.isArray(arr)) return [];
    if (isMobile && arr.length > 30) {
      const sampled = [];
      const interval = Math.ceil(arr.length / 28);
      const lastPoint = arr[arr.length - 1];
      for (let i = 0; i < arr.length; i += interval) {
        sampled.push(arr[i]);
      }
      if (sampled[sampled.length - 1]?.time !== lastPoint?.time) {
        sampled.push(lastPoint);
      }
      return sampled;
    }
    return arr;
  };

  const purchaseMarkers = useMemo(() => {
    if (!chartData || !chartData.strat || chartData.strat.length === 0) return [];
    const dateSet = new Set();
    (rebalances || []).forEach((r) => {
      const d = r.rebalance_date || r.date;
      if (d) dateSet.add(String(d).split("T")[0]);
    });
    (navData?.holdings || []).forEach((h) => {
      const d = h.purchase_date || h.date;
      if (d) dateSet.add(String(d).split("T")[0]);
    });

    if (dateSet.size === 0) return [];

    const availableTimes = new Set(chartData.strat.map((d) => String(d.time || "").split("T")[0]));
    const sortedTimes = Array.from(availableTimes).sort();
    if (sortedTimes.length === 0) return [];
    const minTime = sortedTimes[0];
    const maxTime = sortedTimes[sortedTimes.length - 1];

    const markers = [];
    const usedTimes = new Set();

    dateSet.forEach((dStr) => {
      if (dStr < minTime || dStr > maxTime) return;
      let matchedTime = null;
      if (availableTimes.has(dStr)) {
        matchedTime = dStr;
      } else {
        const targetMs = new Date(`${dStr}T00:00:00Z`).getTime();
        let closest = null;
        let minDiff = 4 * 86400000;
        for (const t of sortedTimes) {
          const diff = Math.abs(new Date(`${t}T00:00:00Z`).getTime() - targetMs);
          if (diff < minDiff) {
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
          color: theme === "light" ? "rgba(2, 132, 199, 0.45)" : "rgba(0, 229, 255, 0.45)",
          shape: "circle",
          size: 0.5,
        });
      }
    });

    markers.sort((a, b) => (a.time < b.time ? -1 : 1));
    return markers;
  }, [chartData, rebalances, navData, theme]);

  useEffect(() => {
    if (!chartRef.current || !chartData) return;
    const isIntraday = period === "1D";
    chartRef.current.applyOptions({
      timeScale: {
        timeVisible: isIntraday,
        secondsVisible: false,
      },
    });
    seriesRef.current.sp500?.setData(sampleArr(chartData.sp500));
    seriesRef.current.nasdaq?.setData(sampleArr(chartData.nasdaq));
    seriesRef.current.baseLine?.setData(sampleArr(chartData.baseLine));
    seriesRef.current.strat?.setData(sampleArr(chartData.strat));
    if (purchaseMarkers.length > 0) {
      seriesRef.current.strat?.setMarkers(purchaseMarkers);
    } else {
      seriesRef.current.strat?.setMarkers([]);
    }
    chartRef.current.timeScale().fitContent();
  }, [chartData, period, isMobile, purchaseMarkers]);

  const lastSP = chartData.sp500[chartData.sp500.length - 1]?.value;
  const lastNasdaq = chartData.nasdaq[chartData.nasdaq.length - 1]?.value;
  const lastStrat = chartData.strat[chartData.strat.length - 1]?.value;
  const lastBase = chartData.baseLine[chartData.baseLine.length - 1]?.value;

  const currentSP = hoverValues?.sp500 ?? lastSP;
  const currentNasdaq = hoverValues?.nasdaq ?? lastNasdaq;
  const currentStrat = hoverValues?.strat ?? lastStrat;
  const currentBase = hoverValues?.baseLine ?? lastBase;

  const baseVal = currentBase || activeInvested || 500;

  const isMidCap = strategy?.benchmark === "S&P MidCap 400" || strategy?.id === "strat_mm20";
  const benchmarkName = strategy?.benchmark || (isMidCap ? "S&P MidCap 400" : "S&P 500");

  // If hovering, compute return from the specific point relative to baseVal
  // If not hovering, prefer the exact computed return from navData / targetReturns
  const spPct = hoverValues
    ? (currentSP ? ((currentSP - baseVal) / baseVal) * 100 : 0)
    : (targetReturns?.sp != null
        ? targetReturns.sp * 100
        : (currentSP ? ((currentSP - baseVal) / baseVal) * 100 : 0));

  const nasdaqPct = hoverValues
    ? (currentNasdaq ? ((currentNasdaq - baseVal) / baseVal) * 100 : 0)
    : (targetReturns?.nasdaq != null
        ? targetReturns.nasdaq * 100
        : (currentNasdaq ? ((currentNasdaq - baseVal) / baseVal) * 100 : 0));

  const stratPct = hoverValues
    ? (currentStrat ? ((currentStrat - baseVal) / baseVal) * 100 : 0)
    : (targetReturns?.strat != null
        ? targetReturns.strat * 100
        : (currentStrat ? ((currentStrat - baseVal) / baseVal) * 100 : 0));

  const isLight = theme === "light";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => handleToggle("sp500")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: visibleSeries.sp500
              ? isLight
                ? "rgba(245, 158, 11, 0.16)"
                : "rgba(245, 158, 11, 0.08)"
              : isLight
                ? "rgba(0,0,0,0.04)"
                : "rgba(255,255,255,0.02)",
            border: `1px solid ${
              visibleSeries.sp500
                ? isLight
                  ? "rgba(245, 158, 11, 0.6)"
                  : "rgba(245, 158, 11, 0.3)"
                : isLight
                  ? "rgba(0,0,0,0.12)"
                  : "#334155"
            }`,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            color: visibleSeries.sp500
              ? isLight
                ? "#92400e"
                : "#f1f5f9"
              : isLight
                ? "#64748b"
                : "#94a3b8",
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLORS.sp500,
              opacity: visibleSeries.sp500 ? 1 : 0.3,
            }}
          />
          <strong style={{ color: isLight ? "#92400e" : "#f1f5f9" }}>{benchmarkName}</strong>
          <span className="mono" style={{ color: isLight ? "#d97706" : "#fbbf24", fontWeight: 700 }}>
            ${currentSP?.toFixed(2)}
          </span>
          <span style={{ color: spPct >= 0 ? (isLight ? "#16a34a" : "#22c55e") : (isLight ? "#dc2626" : "#ef4444"), fontSize: "0.7rem", fontWeight: 600 }}>
            ({spPct >= 0 ? "+" : ""}
            {spPct.toFixed(2)}%)
          </span>
        </button>

        <button
          onClick={() => handleToggle("nasdaq")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: visibleSeries.nasdaq
              ? isLight
                ? "rgba(168, 85, 247, 0.16)"
                : "rgba(168, 85, 247, 0.08)"
              : isLight
                ? "rgba(0,0,0,0.04)"
                : "rgba(255,255,255,0.02)",
            border: `1px solid ${
              visibleSeries.nasdaq
                ? isLight
                  ? "rgba(168, 85, 247, 0.6)"
                  : "rgba(168, 85, 247, 0.3)"
                : isLight
                  ? "rgba(0,0,0,0.12)"
                  : "#334155"
            }`,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            color: visibleSeries.nasdaq
              ? isLight
                ? "#6b21a8"
                : "#f1f5f9"
              : isLight
                ? "#64748b"
                : "#94a3b8",
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: COLORS.nasdaq,
              opacity: visibleSeries.nasdaq ? 1 : 0.3,
            }}
          />
          <strong style={{ color: isLight ? "#6b21a8" : "#f1f5f9" }}>NASDAQ</strong>
          <span className="mono" style={{ color: isLight ? "#7c3aed" : "#c084fc", fontWeight: 700 }}>
            ${currentNasdaq?.toFixed(2)}
          </span>
          <span style={{ color: nasdaqPct >= 0 ? (isLight ? "#16a34a" : "#22c55e") : (isLight ? "#dc2626" : "#ef4444"), fontSize: "0.7rem", fontWeight: 600 }}>
            ({nasdaqPct >= 0 ? "+" : ""}
            {nasdaqPct.toFixed(2)}%)
          </span>
        </button>

        <button
          onClick={() => handleToggle("strat")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: visibleSeries.strat
              ? isLight
                ? `${strategy?.color || COLORS.mm20}25`
                : `${strategy?.color || COLORS.mm20}20`
              : isLight
                ? "rgba(0,0,0,0.04)"
                : "rgba(255,255,255,0.02)",
            border: `1px solid ${
              visibleSeries.strat
                ? isLight
                  ? `${strategy?.color || COLORS.mm20}99`
                  : `${strategy?.color || COLORS.mm20}66`
                : isLight
                  ? "rgba(0,0,0,0.12)"
                  : "#334155"
            }`,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            color: visibleSeries.strat
              ? isLight
                ? "#0f172a"
                : "#f1f5f9"
              : isLight
                ? "#64748b"
                : "#94a3b8",
            fontSize: "0.75rem",
          }}
        >
          {strategy?.isRealMoney ? (
            <span
              style={{
                width: 10,
                height: 3,
                borderRadius: 2,
                background: strategy?.color || "#10b981",
                opacity: visibleSeries.strat ? 1 : 0.3,
                flexShrink: 0,
              }}
            />
          ) : (
            <span
              style={{
                width: 10,
                height: 0,
                borderTop: `2.5px dashed ${strategy?.color || COLORS.mm20}`,
                opacity: visibleSeries.strat ? 1 : 0.35,
                flexShrink: 0,
              }}
            />
          )}
          <strong style={{ color: isLight ? "#0f172a" : "#f1f5f9" }}>
            {strategy?.name || "Estrategia"} {strategy?.isSystem ? "PRO" : ""}
          </strong>
          <span
            style={{
              fontSize: "0.6rem",
              padding: "1px 4px",
              borderRadius: 3,
              background: strategy?.isRealMoney
                ? isLight
                  ? "rgba(16, 185, 129, 0.25)"
                  : "rgba(16, 185, 129, 0.2)"
                : isLight
                  ? "rgba(168, 85, 247, 0.25)"
                  : "rgba(168, 85, 247, 0.2)",
              color: strategy?.isRealMoney
                ? isLight
                  ? "#047857"
                  : "#34d399"
                : isLight
                  ? "#6b21a8"
                  : "#c084fc",
              fontWeight: 700,
            }}
          >
            {strategy?.isRealMoney ? "REAL" : "SIM"}
          </span>
          <span className="mono" style={{ color: isLight ? (strategy?.isRealMoney ? "#047857" : "#6b21a8") : (strategy?.color || COLORS.mm20), fontWeight: 700 }}>
            ${currentStrat?.toFixed(2)}
          </span>
          <span style={{ color: stratPct >= 0 ? (isLight ? "#16a34a" : "#22c55e") : (isLight ? "#dc2626" : "#ef4444"), fontSize: "0.7rem", fontWeight: 600 }}>
            ({stratPct >= 0 ? "+" : ""}
            {stratPct.toFixed(2)}%)
          </span>
        </button>

        <button
          onClick={() => handleToggle("baseLine")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: visibleSeries.baseLine
              ? isLight
                ? "rgba(71, 85, 105, 0.12)"
                : "rgba(255,255,255,0.06)"
              : isLight
                ? "rgba(0,0,0,0.04)"
                : "rgba(255,255,255,0.02)",
            border: `1px solid ${
              visibleSeries.baseLine
                ? isLight
                  ? "rgba(71, 85, 105, 0.35)"
                  : "rgba(255,255,255,0.25)"
                : isLight
                  ? "rgba(0,0,0,0.12)"
                  : "#334155"
            }`,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            color: visibleSeries.baseLine
              ? isLight
                ? "#1e293b"
                : "#f1f5f9"
              : isLight
                ? "#64748b"
                : "#94a3b8",
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              width: 8,
              height: 2,
              borderTop: `2px dashed ${isLight ? "#475569" : "#94a3b8"}`,
              opacity: visibleSeries.baseLine ? 1 : 0.3,
            }}
          />
          <strong style={{ color: isLight ? "#1e293b" : "#f1f5f9" }}>Base Asignada</strong>
          <span className="mono" style={{ color: isLight ? "#475569" : "#94a3b8", fontWeight: 700 }}>
            ${currentBase?.toFixed(2)}
          </span>
        </button>
      </div>

      <div style={{ width: "100%", position: "relative" }}>
        <div ref={containerRef} style={{ width: "100%", height: "320px", position: "relative" }} />
        
        {/* Floating Top-Left Series Indicators (Hidden on small/mobile screens) */}
        {!isMobile && (
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 14,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              background: isLight ? "rgba(255, 255, 255, 0.9)" : "rgba(15, 23, 42, 0.85)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.12)" : "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 6,
              padding: "6px 10px",
              boxShadow: isLight ? "0 4px 12px rgba(0, 0, 0, 0.08)" : "0 4px 12px rgba(0, 0, 0, 0.35)",
              pointerEvents: "none",
              zIndex: 10,
              maxWidth: 150,
            }}
          >
            {visibleSeries.strat && (() => {
              const isReal = strategy?.isRealMoney === true;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 700 }}>
                  {isReal ? (
                    <span style={{ width: 10, height: 3, borderRadius: 2, background: strategy?.color || "#10b981", flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 10, height: 0, borderTop: `2px dashed ${strategy?.color || COLORS.mm20}`, flexShrink: 0 }} />
                  )}
                  <span style={{ color: isLight ? "#0f172a" : "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {strategy?.name ? (strategy.name.length > 12 ? strategy.name.slice(0, 11) + "…" : strategy.name) : "Estrategia"}
                  </span>
                  <span
                    style={{
                      fontSize: "0.55rem",
                      padding: "1px 3px",
                      borderRadius: 3,
                      lineHeight: 1,
                      background: isReal
                        ? isLight
                          ? "rgba(16, 185, 129, 0.25)"
                          : "rgba(16, 185, 129, 0.25)"
                        : isLight
                          ? "rgba(168, 85, 247, 0.25)"
                          : "rgba(168, 85, 247, 0.25)",
                      color: isReal ? (isLight ? "#047857" : "#34d399") : (isLight ? "#6b21a8" : "#c084fc"),
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {isReal ? "REAL" : "SIM"}
                  </span>
                </div>
              );
            })()}
            {visibleSeries.sp500 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: chartColors.sp500, flexShrink: 0 }} />
                <span style={{ color: isLight ? "#334155" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {benchmarkName === "S&P 500" ? "S&P 500" : benchmarkName}
                </span>
              </div>
            )}
            {visibleSeries.nasdaq && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: chartColors.nasdaq, flexShrink: 0 }} />
                <span style={{ color: isLight ? "#334155" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  NASDAQ
                </span>
              </div>
            )}
            {visibleSeries.baseLine && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600 }}>
                <span style={{ width: 10, height: 2, background: isLight ? "#475569" : (chartColors.base || "#94a3b8"), flexShrink: 0, borderRadius: 1 }} />
                <span style={{ color: isLight ? "#334155" : "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Base
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
