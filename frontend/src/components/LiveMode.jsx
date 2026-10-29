import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchIntraday, fetchLiveQuotes, fetchNAV } from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";
import NavChart from "./NavChart";
import QuantumOrbitalLoader from "./QuantumOrbitalLoader";
import LiveHistoryCalendar from "./Common/LiveHistoryCalendar";
import { useTheme } from "../context/ThemeContext";

const POLL_INTERVAL = 60_000;

// Helper dinámico para verificar el horario de mercado de cualquier acción según su exchange o ticker
function isStockMarketOpen(ticker, exchange) {
  const tClean = (ticker || "").trim().toUpperCase();
  const exClean = (exchange || "").trim().toUpperCase();

  try {
    // Criptomonedas: 24/7
    if (
      ["CRYPTO", "CRYPTOCURRENCY", "CCC"].includes(exClean) ||
      (tClean.endsWith("-USD") && ["BTC", "ETH", "XAUT", "PAXG", "SOL", "ADA", "BNB"].some((c) => tClean.includes(c)))
    ) {
      return true;
    }

    // Hong Kong (HKEX, .HK): Mon-Fri 09:30-12:00 y 13:00-16:00 HKT
    if (tClean.endsWith(".HK") || ["HKG", "HKEX", "HONG KONG"].includes(exClean)) {
      const hkt = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
      const day = hkt.getDay();
      if (day === 0 || day === 6) return false;
      const mins = hkt.getHours() * 60 + hkt.getMinutes();
      return (mins >= 570 && mins <= 720) || (mins >= 780 && mins <= 960);
    }

    // Londres (LSE, .L): Mon-Fri 08:00-16:30 GMT/BST
    if (tClean.endsWith(".L") || ["LSE", "LON", "LONDON", "FTSE"].includes(exClean)) {
      const lon = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
      const day = lon.getDay();
      if (day === 0 || day === 6) return false;
      const mins = lon.getHours() * 60 + lon.getMinutes();
      return mins >= 480 && mins <= 990;
    }

    // Europa (Euronext, XETRA, etc.): Mon-Fri 09:00-17:30 CET
    if (
      [".PA", ".DE", ".AS", ".MI", ".MC", ".F"].some((sfx) => tClean.endsWith(sfx)) ||
      ["EURONEXT", "XETRA", "PAR", "GER", "FRA"].includes(exClean)
    ) {
      const par = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
      const day = par.getDay();
      if (day === 0 || day === 6) return false;
      const mins = par.getHours() * 60 + par.getMinutes();
      return mins >= 540 && mins <= 1050;
    }

    // Colombia (BVC, .CL): Mon-Fri 09:30-16:00 COT
    if (tClean.endsWith(".CL") || ["BVC", "COLOMBIA"].includes(exClean)) {
      const cot = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
      const day = cot.getDay();
      if (day === 0 || day === 6) return false;
      const mins = cot.getHours() * 60 + cot.getMinutes();
      return mins >= 570 && mins <= 960;
    }

    // Por defecto bolsas de EE.UU. (NYSE, NASDAQ, AMEX): Mon-Fri 09:30-16:00 ET
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = et.getDay();
    if (day === 0 || day === 6) return false;
    const mins = et.getHours() * 60 + et.getMinutes();
    return mins >= 570 && mins <= 960;
  } catch {
    return false;
  }
}

export default function LiveMode({ navData: initialNavData, investment = 2000 }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const { customStrategies } = usePortfolioStore();

  // Filter all strategies that have isRealMoney === true (Dinero Real)
  const realStrategies = useMemo(() => {
    return (customStrategies || []).filter((s) => s.isRealMoney);
  }, [customStrategies]);

  const simulatedStrategies = useMemo(() => {
    return (customStrategies || []).filter((s) => !s.isRealMoney && s.id !== "historical");
  }, [customStrategies]);

  // Selected portfolio: 'titanes' (default) or any custom strategy ID
  const [selectedRealId, setSelectedRealId] = useState("titanes");

  const currentStrat = useMemo(() => {
    if (selectedRealId === "titanes") return null;
    return (customStrategies || []).find((s) => s.id === selectedRealId) || null;
  }, [selectedRealId, customStrategies]);

  const activeStrategyName = currentStrat?.name || (selectedRealId === "titanes" ? "Kpital" : selectedRealId);
  const activeInvestment = currentStrat?.capital || investment;
  const activeNumSlots = currentStrat?.numSlots || 15;

  const [navData, setNavData] = useState(selectedRealId === "titanes" ? initialNavData : null);
  const [quotes, setQuotes] = useState([]);
  const [intradayChart, setIntradayChart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [error, setError] = useState(null);
  const [driftThreshold, setDriftThreshold] = useState(2.0); // Threshold in percent (e.g. ±2%)
  const [selectedHistoricalDate, setSelectedHistoricalDate] = useState(null); // null = Live today, "YYYY-MM-DD" = historical day
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarContainerRef = useRef(null);

  // Outside click listener & Escape key for calendar popover
  useEffect(() => {
    if (!showCalendar) return;
    const handleOutsideClick = (e) => {
      if (calendarContainerRef.current && !calendarContainerRef.current.contains(e.target)) {
        setShowCalendar(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setShowCalendar(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showCalendar]);

  // Ref mirror of marketOpen so the polling interval reads the latest value without stale closures
  const marketOpenRef = useRef(false);
  useEffect(() => {
    marketOpenRef.current = marketOpen;
  }, [marketOpen]);

  // Reset navData, historical date & intraday chart when user switches portfolio
  useEffect(() => {
    if (selectedRealId === "titanes" && initialNavData) {
      setNavData(initialNavData);
    } else {
      setNavData(null);
    }
    setSelectedHistoricalDate(null);
    setShowCalendar(false);
    setIntradayChart([]);
    setQuotes([]);
    setLoading(true);
  }, [selectedRealId, initialNavData]);

  const load = useCallback(
    async (isManual = false, targetDate = null) => {
      if (isManual) setRefreshing(true);

      try {
        setError(null);

        // 1. Ensure navData is available for the selected portfolio
        let currentNav = navData;
        if (!currentNav || !currentNav.holdings || currentNav.holdings.length === 0) {
          try {
            if (selectedRealId === "titanes") {
              currentNav = await fetchNAV({ period: "1Y", investment: activeInvestment, numSlots: activeNumSlots });
            } else {
              currentNav = await fetchNAV({
                period: "1Y",
                investment: activeInvestment,
                numSlots: activeNumSlots,
                strategyId: selectedRealId,
              });
            }
            if (currentNav) {
              setNavData(currentNav);
            }
          } catch (navErr) {
            console.warn("[LIVE MODE] No se pudo cargar NAV inicial:", navErr);
          }
        }

        const activeHoldings = (currentNav?.holdings || []).filter(
          (h) => h.selected !== false && h.shares > 0,
        );
        const activeTickers = activeHoldings.map((h) => h.ticker);

        if (activeTickers.length === 0) {
          setLoading(false);
          setRefreshing(false);
          return;
        }

        // 2. Fetch live quotes for active positions only
        let safeQuotesData = [];
        try {
          const quotesData = await fetchLiveQuotes(activeTickers);
          safeQuotesData = Array.isArray(quotesData) ? quotesData : [];
        } catch (quoteErr) {
          console.warn("[LIVE MODE] No se pudieron cargar cotizaciones en vivo:", quoteErr);
        }

        if (safeQuotesData.length > 0) {
          setQuotes(safeQuotesData);
        }

        // Si cualquiera de las acciones de la estrategia reporta mercado abierto, o el reloj de mercado de EE.UU./BVC está activo
        const anyStockOpenReported = safeQuotesData.some((q) => q.market_open === true);
        const anyMarketOpenByHours = activeHoldings.some((h) => isStockMarketOpen(h.ticker, h.exchange));
        setMarketOpen(anyStockOpenReported || anyMarketOpenByHours);
        setLastUpdate(new Date());

        // 3. Intraday chart: Carga la trayectoria completa de la sesión seleccionada (o la más reciente en vivo)
        let chartLoaded = false;
        try {
          const targetDateToFetch = targetDate || selectedHistoricalDate;

          // Determinar los holdings que estaban realmente activos en la fecha consultada
          let sessionHoldings = activeHoldings;
          if (targetDateToFetch) {
            const allKnownHoldings = [
              ...activeHoldings,
              ...((currentNav?.closed_holdings || []).map((ch) => ({
                ...ch,
                current_price: ch.exit_price || ch.entry_price,
                start_price: ch.entry_price,
                selected: true,
              }))),
            ];
            const filteredForDate = allKnownHoldings.filter((h) => {
              const entryD = String(h.entry_date || "2026-08-03").slice(0, 10);
              const exitD = h.exit_date ? String(h.exit_date).slice(0, 10) : null;
              return entryD <= targetDateToFetch && (!exitD || exitD > targetDateToFetch);
            });
            if (filteredForDate.length > 0) {
              sessionHoldings = filteredForDate;
            }
          }

          const sessionTickers = sessionHoldings.map((h) => h.ticker);
          const intradayPromises = sessionTickers.map((t) =>
            fetchIntraday(t, targetDateToFetch).catch(() => []),
          );
          const rawIntradayResults = await Promise.all(intradayPromises);

          // Helper para obtener el precio de referencia esperado de cada activo en la fecha consultada
          const getExpectedPriceForHolding = (holding) => {
            if (!holding) return 0;
            const liveQ = safeQuotesData.find((q) => q.ticker === holding.ticker);
            if (!targetDateToFetch) {
              return (
                liveQ?.price ??
                liveQ?.previous_close ??
                holding.current_price ??
                holding.start_price ??
                0
              );
            }
            if (Array.isArray(holding.history) && holding.history.length > 0 && holding.start_price > 0) {
              let matchedFactor = null;
              for (let i = holding.history.length - 1; i >= 0; i--) {
                const hd = String(holding.history[i]?.date || "").slice(0, 10);
                if (hd && hd <= targetDateToFetch) {
                  matchedFactor = Number(holding.history[i].factor);
                  break;
                }
              }
              if (matchedFactor == null && holding.history[0]?.factor) {
                matchedFactor = Number(holding.history[0].factor);
              }
              if (matchedFactor && matchedFactor > 0) {
                return holding.start_price * matchedFactor;
              }
            }
            return (
              holding.current_price ??
              liveQ?.price ??
              holding.exit_price ??
              holding.start_price ??
              0
            );
          };

          // Sanitizar cada serie intradía y corregir cualquier contaminación de caché por carrera en yfinance
          const intradayResults = rawIntradayResults.map((series, idx) => {
            const holding = sessionHoldings[idx];
            const expectedPrice = getExpectedPriceForHolding(holding);
            const cleanSeries = (Array.isArray(series) ? series : []).filter(
              (p) => p && typeof p.time === "number" && typeof p.value === "number" && !isNaN(p.value) && p.value > 0,
            );
            if (cleanSeries.length === 0) return [];

            const lastVal = cleanSeries[cleanSeries.length - 1].value;
            if (expectedPrice > 0 && lastVal > 0) {
              const relDiff = Math.abs(lastVal - expectedPrice) / expectedPrice;
              // Si el precio intradía difiere >25% del precio real del activo en esa fecha, reescalar al nivel real del activo
              if (relDiff > 0.25) {
                const scaleFactor = expectedPrice / lastVal;
                return cleanSeries.map((pt) => ({
                  time: pt.time,
                  value: Number((pt.value * scaleFactor).toFixed(4)),
                }));
              }
            }
            return cleanSeries;
          });

          // Verificar si hay datos intradía válidos en al menos una parte de los tickers
          const validResults = intradayResults.filter(
            (res) => Array.isArray(res) && res.length > 2,
          );

          if (validResults.length > 0) {
            // Agrupar timestamps por fecha de sesión (America/New_York) para evitar mezclar días distintos
            const dateCounts = new Map();
            const timeToDateStr = new Map();

            intradayResults.forEach((series) => {
              if (Array.isArray(series)) {
                series.forEach((p) => {
                  if (p && p.time) {
                    const dStr = new Date(p.time * 1000).toLocaleDateString("en-CA", {
                      timeZone: "America/New_York",
                    });
                    timeToDateStr.set(p.time, dStr);
                    dateCounts.set(dStr, (dateCounts.get(dStr) || 0) + 1);
                  }
                });
              }
            });

            // Seleccionar la fecha dominante (o targetDateToFetch si existe en los datos)
            let dominantDate = targetDateToFetch;
            if (!dominantDate || !dateCounts.has(dominantDate)) {
              let maxCount = -1;
              for (const [dStr, count] of dateCounts.entries()) {
                if (count > maxCount || (count === maxCount && dStr > (dominantDate || ""))) {
                  maxCount = count;
                  dominantDate = dStr;
                }
              }
            }

            const allTimes = new Set();
            intradayResults.forEach((series) => {
              if (Array.isArray(series)) {
                series.forEach((p) => {
                  if (p && p.time && (!dominantDate || timeToDateStr.get(p.time) === dominantDate)) {
                    allTimes.add(p.time);
                  }
                });
              }
            });

            const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);
            const chartSeries = [];

            for (const t of sortedTimes) {
              let stockValue = 0;
              let validPoint = true;

              intradayResults.forEach((series, i) => {
                const holding = sessionHoldings[i];
                const shares = holding ? (Number(holding.shares) || 0) : 0;

                const safeSeries = Array.isArray(series) ? series : [];
                // Buscar el punto exacto o el precio más cercano anterior (stepwise holding)
                let point = safeSeries.find((p) => p && p.time === t);
                if (!point && safeSeries.length > 0) {
                  for (let idx = safeSeries.length - 1; idx >= 0; idx--) {
                    if (safeSeries[idx]?.time <= t) {
                      point = safeSeries[idx];
                      break;
                    }
                  }
                  // Si t es anterior a la primera vela del activo en esa mañana (ej. 09:30 vs 09:35),
                  // usar la primera vela de apertura de ese mismo día (nunca el precio de cierre de hoy)
                  if (!point) {
                    point = safeSeries[0];
                  }
                }
                const price = point?.value ?? getExpectedPriceForHolding(holding);

                if (price && !isNaN(price)) {
                  stockValue += price * shares;
                } else {
                  validPoint = false;
                }
              });

              // Strictly active equity only
              if (validPoint && stockValue > 0) {
                chartSeries.push({
                  time: t,
                  value: round2(stockValue),
                });
              }
            }

            if (chartSeries.length > 1) {
              // En modo Hoy Live, alinear el último punto de la curva con la cotización actual consolidada
              if (!targetDateToFetch) {
                const currentLiveTotal = sessionHoldings.reduce((sum, h) => {
                  const p = getExpectedPriceForHolding(h);
                  return sum + (Number(h.shares) || 0) * p;
                }, 0);
                if (currentLiveTotal > 0) {
                  chartSeries[chartSeries.length - 1] = {
                    ...chartSeries[chartSeries.length - 1],
                    value: round2(currentLiveTotal),
                  };
                }
              }
              setIntradayChart(chartSeries);
              chartLoaded = true;
            }
          }
        } catch (intradayErr) {
          console.warn("[LIVE MODE] Velas intradía no disponibles:", intradayErr);
        }

        // Si fallaron las velas intradía o no hubo puntos, usar línea base de último cierre
        if (!chartLoaded) {
          const baseline =
            activeHoldings.reduce((sum, h) => {
              const q = safeQuotesData.find((qq) => qq.ticker === h.ticker);
              const price = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
              return sum + h.shares * price;
            }, 0) || currentNav?.summary?.active_invested || activeInvestment;

          setIntradayChart((prev) => {
            if (prev && prev.length > 1) return prev;
            const now = Math.floor(Date.now() / 1000);
            return [
              { time: now - 3600, value: round2(baseline) },
              { time: now, value: round2(baseline) },
            ];
          });
        }
      } catch (e) {
        console.error("[LIVE MODE] Error:", e);
        setError(e.message || "Error cargando cotizaciones en vivo");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [navData, selectedRealId, activeInvestment, activeNumSlots, selectedHistoricalDate],
  );

  useEffect(() => {
    load(false, selectedHistoricalDate);
    // Polling only applies if viewing today's live session
    if (selectedHistoricalDate) return;

    const interval = setInterval(() => {
      // 1. Si el mercado ya está abierto según cotizaciones previas, consultar actualización
      if (marketOpenRef.current) {
        load(false);
      } else {
        // 2. Si alguna de las acciones de la cartera activa entra en su horario de negociación, despertar y cargar
        const activeHoldings = (navData?.holdings || []).filter(
          (h) => h.selected !== false && h.shares > 0,
        );
        const shouldAwake = activeHoldings.some((h) =>
          isStockMarketOpen(h.ticker, h.exchange),
        );
        if (shouldAwake) {
          load(false);
        }
      }
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load, navData, selectedHistoricalDate]);

  useEffect(() => {
    const handleGlobalRefresh = () => {
      load(true);
    };
    window.addEventListener("refreshPortfolioCharts", handleGlobalRefresh);
    return () => window.removeEventListener("refreshPortfolioCharts", handleGlobalRefresh);
  }, [load]);

  // Derived metrics — ONLY ACTIVE INVESTED CAPITAL (no flat uninvested cash)
  const holdings = navData?.holdings || [];
  const cashReserved = navData?.summary?.cash_reserved ?? 0;
  const totalSlots = navData?.summary?.total_slots || activeNumSlots || 15;
  const activeInvested =
    navData?.summary?.active_invested ??
    (holdings.length > 0 ? (activeInvestment * holdings.length) / totalSlots : activeInvestment);

  // Live stock portfolio value (Pure active positions: sum of shares * current price)
  const safeQuotesList = Array.isArray(quotes) ? quotes : [];
  const liveStockValue = holdings.reduce((sum, h) => {
    const q = safeQuotesList.find((quote) => quote && quote.ticker === h.ticker);
    const price = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
    return sum + h.shares * price;
  }, 0);

  const displayStockValue = liveStockValue > 0 ? liveStockValue : activeInvested;
  const totalReturn = displayStockValue - activeInvested;
  const totalReturnPct = activeInvested > 0 ? (totalReturn / activeInvested) * 100 : 0;
  const isGain = totalReturn >= 0;

  // ── DRIFT & REBALANCE CALCULATIONS ──
  const totalLivePortfolioValue = liveStockValue + cashReserved;
  const targetWeight = 100 / totalSlots; // Target Weight per position (e.g. 6.67%)

  const driftData = holdings.map((h) => {
    const q = safeQuotesList.find((quote) => quote && quote.ticker === h.ticker);
    const price = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
    const currentValue = h.shares * price;
    const currentWeight =
      totalLivePortfolioValue > 0 ? (currentValue / totalLivePortfolioValue) * 100 : 0;
    const drift = currentWeight - targetWeight;
    return {
      ticker: h.ticker,
      name: h.name || h.ticker,
      exchange: h.exchange || q?.exchange || "US",
      market_open: q?.market_open ?? h.market_open,
      currentValue,
      currentWeight,
      targetWeight,
      drift,
      absDrift: Math.abs(drift),
    };
  });

  const activeHoldingsWithDrift = driftData.filter((d) => d.currentValue > 0);
  const driftedAssets = activeHoldingsWithDrift.filter((d) => d.absDrift > driftThreshold);
  const sortedDriftData = [...activeHoldingsWithDrift].sort((a, b) => b.absDrift - a.absDrift);

  if (loading && holdings.length === 0) {
    return (
      <div className="card fade-up" style={{ padding: "10px" }}>
        <QuantumOrbitalLoader
          message="Conectando con Yahoo Finance y cargando posiciones en vivo…"
          submessage="Transición cuántica de Schrödinger (orbitales 1s ➔ 2s ➔ 2p ➔ 3d ➔ 4f)"
          height={460}
        />
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Live summary header ─────────────────────────── */}
      <div
        className="card"
        style={{
          display: "flex",
          gap: "24px",
          alignItems: "center",
          flexWrap: "wrap",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(0,212,255,0.03) 100%)",
        }}
      >
        <div style={{ flex: "1 1 300px" }}>
          {/* Portfolio Switcher (Titanes vs Real & Custom Strategies) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
              Estrategia en Vivo:
            </span>
            <div
              style={{
                display: "inline-flex",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "3px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                gap: 4,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedRealId("titanes")}
                style={{
                  background: selectedRealId === "titanes" ? "var(--accent-primary)" : "transparent",
                  color: selectedRealId === "titanes" ? "#000" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "0.76rem",
                  fontWeight: selectedRealId === "titanes" ? 700 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                ⚡ Kpital (Base Real)
              </button>
              {realStrategies.map((strat) => (
                <button
                  key={strat.id}
                  type="button"
                  onClick={() => setSelectedRealId(strat.id)}
                  style={{
                    background: selectedRealId === strat.id ? "var(--gain)" : "transparent",
                    color: selectedRealId === strat.id ? "#000" : "var(--text-secondary)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.76rem",
                    fontWeight: selectedRealId === strat.id ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>💵</span>
                  <span>{strat.name}</span>
                </button>
              ))}
              {simulatedStrategies.map((strat) => (
                <button
                  key={strat.id}
                  type="button"
                  onClick={() => setSelectedRealId(strat.id)}
                  style={{
                    background: selectedRealId === strat.id ? "rgba(168, 85, 247, 0.25)" : "transparent",
                    color: selectedRealId === strat.id ? "#c084fc" : "var(--text-muted)",
                    border: selectedRealId === strat.id ? "1px solid #a855f7" : "none",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.76rem",
                    fontWeight: selectedRealId === strat.id ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  title="Estrategia Simulada"
                >
                  <span>🧪</span>
                  <span>{strat.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⚡ Capital Activo en Acciones — {activeStrategyName} (Live)</span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: "2.2rem",
              fontWeight: 800,
              color: "var(--accent-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            ${displayStockValue.toFixed(2)}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <span className={`badge ${isGain ? "gain" : "loss"}`} style={{ fontSize: "0.85rem" }}>
              {isGain ? "▲" : "▼"} ${Math.abs(totalReturn).toFixed(2)} (
              {Math.abs(totalReturnPct).toFixed(2)}%)
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              base: ${activeInvested.toFixed(2)} ({holdings.length} posiciones activas de {totalSlots})
            </span>
          </div>
        </div>

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
            <span className={`market-dot ${marketOpen ? "open" : "closed"}`} />
            <span style={{ color: marketOpen ? "var(--gain)" : "#94a3b8", fontWeight: 600 }}>
              {marketOpen ? "NYSE / NASDAQ En Vivo" : "Mercado Cerrado — curva continua (último cierre)"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {lastUpdate && (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                🕒 {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              className="btn btn-ghost"
              style={{
                fontSize: "0.75rem",
                padding: "5px 10px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => load(true)}
              disabled={refreshing}
              title="Refrescar cotizaciones ahora"
            >
              <span
                style={{
                  display: "inline-block",
                  animation: refreshing ? "spin 1s linear infinite" : "none",
                }}
              >
                🔄
              </span>
              <span>{refreshing ? "Actualizando…" : "Refrescar"}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "var(--radius)",
            color: "#fca5a5",
            fontSize: "0.85rem",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Drift Alert Banner ─────────────────────────── */}
      {driftedAssets.length > 0 && (
        <div
          className="card fade-up"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            padding: "16px 20px",
            display: "flex",
            gap: "16px",
            alignItems: "center",
            borderRadius: "var(--radius)",
          }}
        >
          <div style={{ fontSize: "1.5rem" }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <h4
              style={{
                margin: 0,
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "#fca5a5",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Alerta de Rebalanceo Inteligente (Límite: ±{driftThreshold}%)
            </h4>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Se ha detectado desviación significativa (drift) en {driftedAssets.length} activo(s):{" "}
              {driftedAssets.map((d, idx) => (
                <span
                  key={d.ticker}
                  style={{ color: d.drift > 0 ? "var(--gain)" : "var(--loss)", fontWeight: 600 }}
                >
                  {d.ticker} ({d.drift > 0 ? "+" : ""}
                  {d.drift.toFixed(2)}%){idx < driftedAssets.length - 1 ? ", " : ""}
                </span>
              ))}
              . Se sugiere rebalancear para volver a la equiponderación del{" "}
              {targetWeight.toFixed(2)}%.
            </p>
          </div>
        </div>
      )}

      {/* ── Live Curve & Calendar Historical Day Inspector ── */}
      {intradayChart.length > 1 && (
        <div className="card" style={{ paddingBottom: "20px", position: "relative" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
              position: "relative",
              zIndex: 100,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span>
                {selectedHistoricalDate
                  ? `📅 Trayectoria Intradía del ${selectedHistoricalDate}`
                  : marketOpen
                  ? "⚡ Gráfica Intradía de Hoy (5m - En Vivo)"
                  : "Trayectoria Intradía (Última Sesión Cerrada)"}
              </span>

              {selectedHistoricalDate ? (
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.12)",
                    color: isLight ? "#0284c7" : "var(--accent-primary)",
                    fontWeight: 700,
                    border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.3)" : "rgba(0, 229, 255, 0.3)"}`,
                  }}
                >
                  Historial de Sesión Pasada
                </span>
              ) : !marketOpen ? (
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(148, 163, 184, 0.12)",
                    color: "#94a3b8",
                    fontWeight: 600,
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                  }}
                >
                  Mercado Cerrado — Historial de la sesión preservado
                </span>
              ) : null}
            </h3>

            {/* Calendar toggle button */}
            <div
              ref={calendarContainerRef}
              style={{ display: "flex", alignItems: "center", gap: 8, position: "relative", zIndex: 110 }}
            >
              {selectedHistoricalDate && (
                <button
                  type="button"
                  onClick={() => setSelectedHistoricalDate(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 10px",
                    borderRadius: 6,
                    background: isLight ? "rgba(244, 63, 94, 0.1)" : "rgba(244, 63, 94, 0.15)",
                    border: `1px solid ${isLight ? "rgba(244, 63, 94, 0.3)" : "rgba(244, 63, 94, 0.3)"}`,
                    color: isLight ? "#e11d48" : "#fb7185",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="Restablecer a la jornada de Hoy en vivo"
                >
                  <span>✕</span>
                  <span>Volver a Hoy Live</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCalendar((prev) => !prev)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${showCalendar || selectedHistoricalDate
                    ? isLight ? "rgba(2, 132, 199, 0.5)" : "rgba(0, 229, 255, 0.5)"
                    : isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                  background: showCalendar || selectedHistoricalDate
                    ? isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.12)"
                    : isLight ? "#ffffff" : "rgba(255, 255, 255, 0.04)",
                  color: showCalendar || selectedHistoricalDate
                    ? isLight ? "#0284c7" : "var(--accent-primary)"
                    : "var(--text-secondary)",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: isLight ? "0 2px 6px rgba(0,0,0,0.04)" : "none",
                }}
                title="Explorar el historial de todos los días de negociación en el calendario"
              >
                <span>📅</span>
                <span>{selectedHistoricalDate ? selectedHistoricalDate : "Ver Historial por Día"}</span>
                <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>{showCalendar ? "▲" : "▼"}</span>
              </button>

              {/* Popover Calendar */}
              {showCalendar && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    zIndex: 2500,
                  }}
                >
                  <LiveHistoryCalendar
                    selectedDate={selectedHistoricalDate}
                    onSelectDate={(newDate) => {
                      setSelectedHistoricalDate(newDate);
                      setShowCalendar(false);
                    }}
                    minDate={navData?.summary?.first_rebalance_date || navData?.nav?.[0]?.date || "2026-08-03"}
                    activeDates={(navData?.nav || []).map((pt) => pt.date)}
                  />
                </div>
              )}
            </div>
          </div>

          <div style={{ width: "100%", minHeight: "320px", overflow: "hidden" }}>
            {(() => {
              const sessionOpenVal = intradayChart[0]?.value || activeInvested;
              const sessionEndVal = intradayChart[intradayChart.length - 1]?.value || displayStockValue;
              const sessionDiff = sessionEndVal - sessionOpenVal;
              const sessionPct = sessionOpenVal > 0 ? (sessionDiff / sessionOpenVal) * 100 : 0;
              const cumDiff = sessionEndVal - activeInvested;
              const cumPct = activeInvested > 0 ? (cumDiff / activeInvested) * 100 : 0;
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 10,
                    padding: "8px 12px",
                    marginBottom: 10,
                    borderRadius: 8,
                    background: isLight ? "rgba(2, 132, 199, 0.05)" : "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(255, 255, 255, 0.07)"}`,
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>Apertura Día (Base Sesión): </span>
                      <strong className="mono" style={{ color: "var(--text-primary)" }}>${sessionOpenVal.toFixed(2)}</strong>
                    </span>
                    <span>
                      <span style={{ color: "var(--text-muted)" }}>{selectedHistoricalDate ? "Cierre Día: " : "Valor Actual: "}</span>
                      <strong className="mono" style={{ color: "var(--accent-primary)" }}>${sessionEndVal.toFixed(2)}</strong>
                      <span
                        className="mono"
                        style={{
                          marginLeft: 6,
                          fontWeight: 700,
                          color: sessionDiff >= 0 ? "var(--gain)" : "var(--loss)",
                        }}
                      >
                        ({sessionDiff >= 0 ? "+" : ""}${sessionDiff.toFixed(2)} / {sessionPct >= 0 ? "+" : ""}{sessionPct.toFixed(2)}% hoy)
                      </span>
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--text-muted)" }}>vs. Capital Base Invertido (${activeInvested.toFixed(2)}):</span>
                    <strong
                      className="mono"
                      style={{
                        color: cumDiff >= 0 ? "var(--gain)" : "var(--loss)",
                      }}
                    >
                      {cumDiff >= 0 ? "+" : ""}${cumDiff.toFixed(2)} ({cumPct >= 0 ? "+" : ""}{cumPct.toFixed(2)}% acum.)
                    </strong>
                  </div>
                </div>
              );
            })()}
            <NavChart
              navData={intradayChart}
              investment={activeInvested}
              numSlots={totalSlots}
              chartHeight={300}
              isLiveMode={true}
              strategyName={activeStrategyName}
              summary={{ active_invested: activeInvested }}
              holdings={holdings}
              onRefresh={() => load(true)}
              isRefreshing={refreshing}
            />
          </div>
        </div>
      )}

      {/* ── Drift Monitor Card ─────────────────────────── */}
      <div className="card fade-up" style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "1rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>📊 Monitor de Desviación (Drift)</span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.06)",
                  color: "var(--text-secondary)",
                }}
              >
                Target: {targetWeight.toFixed(2)}%
              </span>
            </h3>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Mide la desviación real del peso de cada activo frente al objetivo equiponderado.
            </span>
          </div>

          {/* Threshold controller */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Tolerancia:</span>
            <div
              style={{
                display: "flex",
                gap: 4,
                background: "var(--bg-surface)",
                padding: 3,
                borderRadius: 6,
                border: "1px solid var(--border)",
              }}
            >
              {[1.0, 2.0, 3.0, 5.0].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDriftThreshold(t)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    border: "none",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: driftThreshold === t ? "rgba(0, 229, 255, 0.15)" : "transparent",
                    color: driftThreshold === t ? "var(--accent-primary)" : "var(--text-muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  ±{t}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "16px",
          }}
        >
          {/* Left: Drift List */}
          <div style={{ overflowX: "auto", maxHeight: "300px", paddingRight: "4px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "8px 4px", color: "var(--text-muted)", fontWeight: 500 }}>
                    Activo
                  </th>
                  <th
                    style={{
                      padding: "8px 4px",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    Peso Real
                  </th>
                  <th
                    style={{
                      padding: "8px 4px",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      textAlign: "right",
                    }}
                  >
                    Desviación (Drift)
                  </th>
                  <th
                    style={{
                      padding: "8px 8px",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      width: "120px",
                    }}
                  >
                    Visual
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDriftData.map((d) => {
                  const hasCrossed = d.absDrift > driftThreshold;
                  const driftColor = d.drift >= 0 ? "var(--gain)" : "var(--loss)";

                  // divergent bar calc
                  const maxRange = 10; // max scale representation ±10% drift
                  const widthPct = Math.min(50, (d.absDrift / maxRange) * 50);
                  const leftPos = d.drift >= 0 ? 50 : 50 - widthPct;

                  return (
                    <tr
                      key={d.ticker}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.02)",
                        background: hasCrossed ? "rgba(239, 68, 68, 0.02)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "8px 4px", fontWeight: 600 }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: hasCrossed ? "#fca5a5" : "var(--text-primary)" }}>
                            {d.ticker}
                          </span>
                          {d.market_open !== undefined && (
                            <span
                              title={
                                d.market_open
                                  ? `Mercado abierto (${d.exchange})`
                                  : `Mercado cerrado (${d.exchange})`
                              }
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: d.market_open ? "#22c55e" : "#ef4444",
                                boxShadow: d.market_open ? "0 0 6px #22c55e" : "none",
                                display: "inline-block",
                              }}
                            />
                          )}
                          {hasCrossed && (
                            <span
                              style={{
                                fontSize: "0.65rem",
                                padding: "1px 4px",
                                borderRadius: 3,
                                background: "rgba(239, 68, 68, 0.15)",
                                color: "var(--loss)",
                              }}
                            >
                              DRIFT!
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          textAlign: "right",
                          fontFamily: "JetBrains Mono",
                        }}
                      >
                        {d.currentWeight.toFixed(2)}%
                      </td>
                      <td
                        style={{
                          padding: "8px 4px",
                          textAlign: "right",
                          fontFamily: "JetBrains Mono",
                          color: driftColor,
                          fontWeight: 600,
                        }}
                      >
                        {d.drift >= 0 ? "+" : ""}
                        {d.drift.toFixed(2)}%
                      </td>
                      <td style={{ padding: "8px 8px" }}>
                        <div
                          style={{
                            position: "relative",
                            height: "6px",
                            width: "100px",
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: "3px",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: 0,
                              bottom: 0,
                              width: "1px",
                              background: "rgba(255,255,255,0.2)",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              left: `${leftPos}%`,
                              width: `${widthPct}%`,
                              height: "100%",
                              background: driftColor,
                              borderRadius: "3px",
                              boxShadow: hasCrossed ? `0 0 4px ${driftColor}` : "none",
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Right: Analytical Insight Box */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              padding: "16px",
              borderRadius: "var(--radius)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h4
                style={{
                  margin: "0 0 8px 0",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "var(--accent-primary)",
                }}
              >
                💡 Insight del Monitor de Deriva (Drift)
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.78rem",
                  color: "var(--text-muted)",
                  lineHeight: "1.4",
                }}
              >
                En una cartera equiponderada (Equal Weight), los activos ganadores crecen
                orgánicamente de tamaño, mientras que los rezagados se encogen.
                <br />
                <br />
                Un **rebalanceo por umbral** (threshold rebalancing) vende automáticamente porciones
                de los activos ganadores (sobre-ponderados) y compra más de los rezagados
                (sub-ponderados), cosechando ganancias de manera inteligente.
              </p>
            </div>

            <div
              style={{
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--border)",
                fontSize: "0.76rem",
                color: "var(--text-secondary)",
              }}
            >
              <strong>Resumen de Estado:</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Desviación Máxima:</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 600,
                      color: sortedDriftData[0]
                        ? sortedDriftData[0].drift >= 0
                          ? "var(--gain)"
                          : "var(--loss)"
                        : "var(--text-primary)",
                    }}
                  >
                    {sortedDriftData[0]
                      ? `${sortedDriftData[0].ticker} (${sortedDriftData[0].drift >= 0 ? "+" : ""}${sortedDriftData[0].drift.toFixed(2)}%)`
                      : "0.00%"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Activos fuera de límite:</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 600,
                      color: driftedAssets.length > 0 ? "var(--loss)" : "var(--gain)",
                    }}
                  >
                    {driftedAssets.length} activo(s)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quotes Grid ─────────────────────────────────── */}
      <div>
        <h3 style={{ marginBottom: "14px", fontSize: "1rem", fontWeight: 600 }}>
          Cotizaciones en Vivo de tus Posiciones Activas
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {holdings.map((h) => {
            const q = safeQuotesList.find((quote) => quote && quote.ticker === h.ticker);
            const currentP = q?.price ?? q?.previous_close ?? h.current_price ?? 0;
            const change = q?.change ?? h.current_price - h.start_price;
            const changePct = q?.change_pct ?? h.return_pct ?? 0;
            const isChangeGain = change >= 0;

            const slotValue = activeInvestment / totalSlots;
            const cardShares = h.start_price > 0 ? slotValue / h.start_price : h.shares;
            const initialInvested = slotValue;
            const currentVal = cardShares * currentP;
            const totalGain = currentVal - initialInvested;
            const totalGainPct = initialInvested > 0 ? (totalGain / initialInvested) * 100 : 0;
            const isTotalGain = totalGain >= 0;

            const periodRaw = navData?.summary?.period || "1Y";
            const periodText =
              periodRaw === "1Y"
                ? "1 Año"
                : periodRaw === "3Y"
                  ? "3 Años"
                  : periodRaw === "5Y"
                    ? "5 Años"
                    : periodRaw;

            return (
              <div
                key={h.ticker}
                className="card"
                style={{
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  border: isChangeGain
                    ? "1px solid rgba(16,185,129,0.2)"
                    : "1px solid rgba(239,68,68,0.2)",
                  background: "var(--bg-surface)",
                  transition: "transform 0.15s ease, border-color 0.15s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "8px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "1.05rem",
                          color: "var(--accent-primary)",
                        }}
                      >
                        {h.ticker}
                      </span>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "rgba(255,255,255,0.06)",
                          color: "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        {h.exchange || "US"}
                      </span>
                      {(q?.market_open !== undefined || h.market_open !== undefined) && (
                        <span
                          style={{
                            fontSize: "0.62rem",
                            padding: "1px 6px",
                            borderRadius: 10,
                            background: (q?.market_open ?? h.market_open)
                              ? "rgba(34, 197, 94, 0.12)"
                              : "rgba(239, 68, 68, 0.12)",
                            border: `1px solid ${
                              (q?.market_open ?? h.market_open)
                                ? "rgba(34, 197, 94, 0.25)"
                                : "rgba(239, 68, 68, 0.25)"
                            }`,
                            color: (q?.market_open ?? h.market_open) ? "#4ade80" : "#f87171",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: (q?.market_open ?? h.market_open) ? "#22c55e" : "#ef4444",
                              boxShadow: (q?.market_open ?? h.market_open)
                                ? "0 0 5px #22c55e"
                                : "none",
                            }}
                          />
                          {(q?.market_open ?? h.market_open) ? "Abierto" : "Cerrado"}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "0.76rem",
                        color: "var(--text-muted)",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "180px",
                      }}
                      title={h.name}
                    >
                      {h.name || h.ticker}
                    </div>
                  </div>

                  <span
                    className={`badge ${isChangeGain ? "gain" : "loss"}`}
                    style={{
                      fontSize: "0.72rem",
                      padding: "4px 8px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      alignSelf: "flex-start",
                      lineHeight: 1.2,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                    title="Variación intradía en vivo de la sesión de hoy"
                  >
                    Hoy: {isChangeGain ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginTop: 2,
                  }}
                >
                  <div>
                    <div
                      className="mono"
                      style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)" }}
                      title="Valor actual en vivo de tu posición total"
                    >
                      ${currentVal ? currentVal.toFixed(2) : "—"}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                      {h.shares.toFixed(4)} acc. @ ${currentP.toFixed(2)}
                    </div>
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      color: isChangeGain ? "var(--gain)" : "var(--loss)",
                    }}
                    title="Variación en dólares durante la jornada de hoy"
                  >
                    {isChangeGain ? "+" : ""}${change ? change.toFixed(2) : "0.00"} (Hoy)
                  </span>
                </div>

                <div
                  style={{
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: "0.74rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Inversión Inicial Base:</span>
                    <span
                      className="mono"
                      style={{ fontWeight: 600, color: "var(--text-secondary)" }}
                    >
                      ${initialInvested.toFixed(2)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Valor Actual (Live):</span>
                    <span
                      className="mono"
                      style={{ fontWeight: 700, color: "var(--accent-primary)" }}
                    >
                      ${currentVal.toFixed(2)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>Acumulado ({periodText}):</span>
                    <span
                      className="mono"
                      style={{
                        fontWeight: 700,
                        color: isTotalGain ? "var(--gain)" : "var(--loss)",
                      }}
                    >
                      {isTotalGain ? "+" : ""}${totalGain.toFixed(2)} ({isTotalGain ? "+" : ""}
                      {totalGainPct.toFixed(1)}%)
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 2,
                      fontSize: "0.7rem",
                    }}
                  >
                    <span>Posición Comprada:</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {h.shares.toFixed(4)} acc. @ ${h.start_price?.toFixed(2) || "—"}/acc
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Unallocated cash placeholder */}
          {cashReserved > 0 && (
            <div
              className="card"
              style={{
                opacity: 0.6,
                border: "1px dashed var(--border)",
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-muted)" }}>
                Q (Cash Plano No Invertido)
              </div>
              <div
                className="mono"
                style={{ fontSize: "1.3rem", color: "var(--text-muted)", fontWeight: 700 }}
              >
                ${cashReserved.toFixed(2)}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                {Math.max(0, totalSlots - holdings.length)} slots de liquidez no expuesta al mercado
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
