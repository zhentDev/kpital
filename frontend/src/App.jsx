import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { fetchColInflationHistory, fetchFxHistory, fetchNAV, fetchLiveQuotes, evaluateStockAlerts } from "./api/client";
import CorrelationHeatmap from "./components/CorrelationHeatmap";
import CreateStrategyModal from "./components/CreateStrategyModal";
import DynamicStrategyView from "./components/DynamicStrategyView";
import FixedIncomeHub from "./components/FixedIncome/FixedIncomeHub";
import CashFlowHub from "./components/CashFlow/CashFlowHub";
import HoldingsTable from "./components/HoldingsTable";
import IndividualHoldingChart from "./components/IndividualHoldingChart";
import IndividualPurchasesView from "./components/IndividualPurchasesView";
import InflationExplorerModal from "./components/InflationExplorerModal";
import LiveMode from "./components/LiveMode";
import MonteCarloCard from "./components/MonteCarloCard";
import NavChart from "./components/NavChart";
import QuantRadar from "./components/QuantRadar";
import QuantitativeCard from "./components/QuantitativeCard";
import RebalanceManager from "./components/RebalanceManager";
import RebalanceTimer from "./components/RebalanceTimer";
import SectorAllocation from "./components/SectorAllocation";
import WarrenAIModal from "./components/WarrenAIModal";
import WasmNavSimulator from "./components/WasmNavSimulator";
import { InfoTooltip } from "./components/Common";
import AffiliateBanner from "./components/Common/AffiliateBanner";
import AuthModal from "./components/AuthModal";
import FxRateExplorer from "./components/Common/FxRateExplorer";
import AuthWall from "./components/AuthWall";
import StrategyPaywall from "./components/StrategyPaywall";
import QuantumOrbitalLoader from "./components/QuantumOrbitalLoader";
import { useAuthStore } from "./store/authStore";
import { usePortfolioStore } from "./store/portfolioStore";
import { exportPortfolioExcel, exportPortfolioPyScript } from "./utils/exportReport";
import { toastPrompt } from "./utils/toastAlerts";
import { useTheme } from "./context/ThemeContext";
import "./App.css";

const PERIODS = ["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"];

export default function App() {
  const {
    settingsByMode,
    mode,
    setPeriod,
    setMode,
    customStrategies,
    addCustomStrategy,
    updateCustomStrategy,
    deleteCustomStrategy,
    purchasePortfolios,
    addPurchasePortfolio,
    renamePurchasePortfolio,
    mainPortfolioSettings,
    setMainPortfolioSettings,
    strategyRebalances,
    initFetchPurchases,
    initFetchCustomStrategies,
  } = usePortfolioStore();

  const [coreStrategyName, setCoreStrategyName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("kpital_core_strategy_name") || "Titanes Tecnológicos";
    }
    return "Titanes Tecnológicos";
  });
  const currentSettings = settingsByMode[mode] || settingsByMode.historical;
  const { tickers, investment, period, numSlots } = currentSettings;
  const [baseNavData, setBaseNavData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTickers, setSelectedTickers] = useState(null); // null = all active tickers included
  const [unit, setUnit] = useState("pct"); // 'pct' | 'usd'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showMainSettingsModal, setShowMainSettingsModal] = useState(false);
  const [showMainInflationExplorer, setShowMainInflationExplorer] = useState(false);
  const [mainYieldViewMode, setMainYieldViewMode] = useState("USD");
  const [mainFxData, setMainFxData] = useState({ current: 1.0, history: {} });
  const [isFetchingMainFx, setIsFetchingMainFx] = useState(false);
  const [mainColInflationData, setMainColInflationData] = useState({
    history: {},
    latest: {},
    monthly_rates: [],
  });
  const [isFetchingMainInflation, setIsFetchingMainInflation] = useState(false);
  const [showBreakdownCard, setShowBreakdownCard] = useState(false);
  const [showQuantIntelligence, setShowQuantIntelligence] = useState(false);
  const [mainChartViewTab, setMainChartViewTab] = useState("portfolio"); // "portfolio" | "individual"

  // Theme — managed globally by ThemeProvider in main.jsx
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  // Auth state & User Dropdown
  const { user, isInitialized, openAuthModal, logout, fetchMe } = useAuthStore();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Navigation Dropdown States & Outside Click Handlers
  const [stratOpen, setStratOpen] = useState(false);
  const [purchasesOpen, setPurchasesOpen] = useState(false);
  const [mobileStratModalOpen, setMobileStratModalOpen] = useState(false);
  const [mobilePurchasesModalOpen, setMobilePurchasesModalOpen] = useState(false);
  const [showWarrenModal, setShowWarrenModal] = useState(false);
  const [showWasmLabModal, setShowWasmLabModal] = useState(false);
  const stratDropdownRef = useRef(null);
  const purchasesDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (stratDropdownRef.current && !stratDropdownRef.current.contains(e.target)) {
        setStratOpen(false);
      }
      if (purchasesDropdownRef.current && !purchasesDropdownRef.current.contains(e.target)) {
        setPurchasesOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isOwner = Boolean(
    user?.email && user.email.toLowerCase().trim() === "caballerojesus703@hotmail.com"
  );
  const isPro = Boolean(user?.is_pro || isOwner);

  const isStrategyMode =
    mode === "historical" || mode === "live" || (customStrategies || []).some((s) => s.id === mode);
  const isPurchaseMode = (purchasePortfolios || []).some((p) => p.id === mode);

  // If user is not PRO and lands on the historical default strategy mode, guide them to fixed_income
  const hasCheckedInitialMode = useRef(false);
  useEffect(() => {
    if (isInitialized && !hasCheckedInitialMode.current) {
      hasCheckedInitialMode.current = true;
      if (!isPro && mode === "historical") {
        setMode("fixed_income");
      }
    }
  }, [isInitialized, isPro, mode, setMode]);

  const currentStrategyLabel = useMemo(() => {
    if (mode === "historical") return `🏆 ${coreStrategyName}`;
    if (mode === "live") return "⚡ Live Tracker";
    const match = (customStrategies || []).find((s) => s.id === mode);
    return match ? `${match.country || "🌎"} ${match.name}` : "Seleccionar...";
  }, [mode, customStrategies, coreStrategyName]);

  const currentPurchaseLabel = useMemo(() => {
    const match = (purchasePortfolios || []).find((p) => p.id === mode);
    return match ? match.name : purchasePortfolios?.[0]?.name || "Seleccionar...";
  }, [mode, purchasePortfolios]);

  const mainSettings = mainPortfolioSettings || {
    assetCurrency: "USD",
    localCurrency: "COP",
    inflationRate: 0,
    useAutoColInflation: false,
  };

  useEffect(() => {
    if (
      mainSettings.assetCurrency &&
      mainSettings.localCurrency &&
      mainSettings.assetCurrency !== mainSettings.localCurrency
    ) {
      setIsFetchingMainFx(true);
      fetchFxHistory(mainSettings.assetCurrency, mainSettings.localCurrency)
        .then((res) => setMainFxData(res))
        .catch(console.error)
        .finally(() => setIsFetchingMainFx(false));
    } else {
      setMainFxData({ current: 1.0, history: {} });
      if (mainYieldViewMode === "FX") setMainYieldViewMode("USD");
    }
  }, [mainSettings.assetCurrency, mainSettings.localCurrency]);

  useEffect(() => {
    setIsFetchingMainInflation(true);
    fetchColInflationHistory()
      .then((res) => setMainColInflationData(res))
      .catch(console.error)
      .finally(() => setIsFetchingMainInflation(false));
  }, []);

  const toggleUnit = () => setUnit((u) => (u === "pct" ? "usd" : "pct"));

  // Only trigger network/DuckDB load on period, investment or rebalance refresh
  useEffect(() => {
    if (user) {
      initFetchPurchases();
      initFetchCustomStrategies?.();
    }
  }, [user, initFetchPurchases, initFetchCustomStrategies]);

  useEffect(() => {
    setRefreshKey((k) => k + 1);
  }, [mode]);

  useEffect(() => {
    if (!isPro) {
      setLoading(false);
      return;
    }
    let isCancelled = false;
    setLoading(true);
    setError(null);
    fetchNAV({ tickers, period, investment, numSlots })
      .then((data) => {
        if (!isCancelled) {
          setBaseNavData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [tickers, period, investment, numSlots, refreshKey, isPro]);

  useEffect(() => {
    const handleGlobalChartRefresh = () => {
      setRefreshKey((k) => k + 1);
    };
    window.addEventListener("refreshPortfolioCharts", handleGlobalChartRefresh);
    return () => {
      window.removeEventListener("refreshPortfolioCharts", handleGlobalChartRefresh);
    };
  }, []);

  const [liveQuotesMap, setLiveQuotesMap] = useState({});

  useEffect(() => {
    if (!baseNavData?.holdings?.length) return;
    const activeTickers = baseNavData.holdings.map((h) => h.ticker);
    let isCancelled = false;
    const fetchQuotes = () => {
      fetchLiveQuotes(activeTickers)
        .then((quotes) => {
          if (!isCancelled && Array.isArray(quotes)) {
            const map = {};
            quotes.forEach((q) => {
              if (q?.ticker) map[q.ticker] = q;
            });
            setLiveQuotesMap(map);
          }
        })
        .catch(() => {});
    };
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60_000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [baseNavData]);

  // Evaluate Stock Alerts automatically when holdings data updates
  const evaluatedAlertsRef = useRef(new Set());
  useEffect(() => {
    if (!baseNavData?.holdings?.length) return;
    const positions = baseNavData.holdings.map((h) => {
      const live = liveQuotesMap[h.ticker];
      const curP = live?.price ?? h.current_price;
      const startP = h.start_price || curP;
      const retPct = startP > 0 ? ((curP - startP) / startP) * 100 : (h.return_pct || 0);
      return {
        ticker: h.ticker,
        entry_price: startP,
        current_price: curP,
        return_pct: retPct,
        name: h.name || h.ticker,
        scope_title: `Estrategia Kpital (${mode})`,
      };
    });

    evaluateStockAlerts({
      scope: "strategy",
      targetId: mode,
      positions,
    })
      .then((res) => {
        if (res?.triggered?.length > 0) {
          res.triggered.forEach((t) => {
            if (!evaluatedAlertsRef.current.has(t.alert_id)) {
              evaluatedAlertsRef.current.add(t.alert_id);
              toast(
                (toastInstance) => (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                      <span style={{ fontSize: "1.2rem" }}>
                        {t.alert_type === "STOP_LOSS" ? "🛑" : "🎯"}
                      </span>
                      <span>
                        ¡Objetivo alcanzado en {t.ticker}! (
                        {t.current_return_pct >= 0 ? "+" : ""}
                        {t.current_return_pct.toFixed(2)}%)
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {t.alert_type === "STOP_LOSS" ? "Stop Loss activado" : "Take Profit alcanzado"} a $
                      {t.current_price.toFixed(2)}.{" "}
                      {t.email_dispatched
                        ? `Se envió notificación al correo registrado.`
                        : `Revisa tu posición para ejecutar la orden de venta.`}
                    </div>
                  </div>
                ),
                {
                  duration: 9000,
                  position: "top-right",
                  style: {
                    background: t.alert_type === "STOP_LOSS" ? "#1e131d" : "#0d1b2a",
                    color: "#f8fafc",
                    border: `1px solid ${t.alert_type === "STOP_LOSS" ? "#f43f5e" : "#10b981"}`,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
                    borderRadius: "12px",
                  },
                }
              );
            }
          });
        }
      })
      .catch(() => {});
  }, [baseNavData, liveQuotesMap, mode]);

  // Client-side instant recalculation: 0ms latency, no spinner, no page reload, pure butter-smooth animation!
  const navData = useMemo(() => {
    if (!baseNavData) return null;

    const allHoldings = baseNavData.holdings || [];
    const currentSelected = selectedTickers ?? allHoldings.map((h) => h.ticker);
    const updatedHoldings = allHoldings.map((h) => {
      const live = liveQuotesMap[h.ticker];
      const curPrice = live?.price ?? h.current_price;
      const chg1dPct = live?.change_pct ?? h.change_pct_1d ?? (h.previous_price > 0 ? ((curPrice - h.previous_price) / h.previous_price) * 100 : 0);
      const chg1dUsd = live?.change ?? h.change_usd_1d ?? (curPrice - (h.previous_price || curPrice));
      const curVal = (h.shares || 0) * curPrice;
      const startPrice = h.start_price || 0;
      const retPct = startPrice > 0 ? ((curPrice - startPrice) / startPrice) * 100 : (h.return_pct ?? 0);
      const retUsd = curVal - (h.shares || 0) * startPrice;

      return {
        ...h,
        selected: currentSelected.includes(h.ticker),
        current_price: curPrice,
        current_value: curVal,
        change_pct_1d: chg1dPct,
        change_usd_1d: chg1dUsd,
        return_pct: retPct,
        return_usd: retUsd,
        market_open: live?.market_open ?? h.market_open,
      };
    });

    const slotValue = investment / numSlots;

    // Safety fallback: if backend returned 0 shares due to a transient data glitch on rebalance day,
    // ensure active portfolio tickers get their nominal slot shares so holdings and chart never collapse
    const sanitizedHoldings = updatedHoldings.map((h) => {
      let shares = h.shares;
      let startPrice = h.start_price;
      const curPrice = h.current_price;
      if ((!shares || shares <= 0) && curPrice > 0) {
        shares = slotValue / curPrice;
        if (!startPrice || startPrice <= 0) startPrice = curPrice;
      }
      const curVal = shares * curPrice;
      const retPct = startPrice > 0 ? ((curPrice - startPrice) / startPrice) * 100 : 0;
      const retUsd = curVal - shares * startPrice;
      return {
        ...h,
        shares,
        start_price: startPrice,
        current_value: curVal,
        return_pct: retPct,
        return_usd: retUsd,
      };
    });

    const activeList = sanitizedHoldings.filter((h) => h.selected && h.shares > 0);
    const activeInvested = activeList.length * slotValue;
    const currentStockValue = activeList.reduce((sum, h) => sum + h.shares * h.current_price, 0);
    const activeReturn = currentStockValue - activeInvested;
    const activeReturnPct = activeInvested > 0 ? (activeReturn / activeInvested) * 100 : 0;

    // Rescale all benchmarks to start from activeInvested so that the Y-axis scale is 100% harmonized
    const baseFirstVal = baseNavData.nav?.[0]?.value || investment;
    const baseSP0 = baseNavData.sp500?.[0]?.value || baseFirstVal;
    const baseND0 = baseNavData.nasdaq?.[0]?.value || baseFirstVal;

    // Rescaled Portfolio NAV using exact individual ticker price action per tranche
    const datePoints = baseNavData.nav || [];
    const defaultActiveInvested = baseNavData.summary?.active_invested || activeInvested;
    const filterRatio = defaultActiveInvested > 0 ? activeInvested / defaultActiveInvested : 1;
    const isAllSelected = !selectedTickers || activeList.length === sanitizedHoldings.length;

    let scaledNav = isAllSelected
      ? [...datePoints]
      : datePoints.map((pt) => ({
          ...pt,
          value: Number((pt.value * filterRatio).toFixed(4)),
          active_invested: typeof pt.active_invested === "number" ? Number((pt.active_invested * filterRatio).toFixed(4)) : undefined,
        }));

    // Rescaled S&P 500 and NASDAQ:
    let scaledSP500 = [...(baseNavData.sp500 || [])].map((pt) => ({
      ...pt,
      value: Number((pt.value * filterRatio).toFixed(4)),
    }));

    let scaledNasdaq = [...(baseNavData.nasdaq || [])].map((pt) => ({
      ...pt,
      value: Number((pt.value * filterRatio).toFixed(4)),
    }));

    // Intraday / Real-Time Market Injection:
    // When market opens today, ensure the current day's price action is dynamically plotted on the chart
    if (scaledNav.length > 0 && currentStockValue > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const lastNavPt = scaledNav[scaledNav.length - 1];
      const liveNavValue = Number(currentStockValue.toFixed(4));

      if (lastNavPt && String(lastNavPt.date).slice(0, 10) === todayStr) {
        // Update today's existing point with latest live value
        scaledNav[scaledNav.length - 1] = { ...lastNavPt, value: liveNavValue };
      } else if (lastNavPt && String(lastNavPt.date).slice(0, 10) < todayStr) {
        // Append today's point dynamically as soon as the market opens
        scaledNav.push({ date: todayStr, value: liveNavValue });

        if (scaledSP500.length > 0) {
          const lastSP = scaledSP500[scaledSP500.length - 1];
          const spChangePct = (baseNavData.summary?.sp500_return_pct ?? 0) / 100;
          scaledSP500.push({
            date: todayStr,
            value: Number((lastSP.value * (1 + spChangePct * 0.05)).toFixed(4)),
          });
        }
        if (scaledNasdaq.length > 0) {
          const lastND = scaledNasdaq[scaledNasdaq.length - 1];
          const ndChangePct = (baseNavData.summary?.nasdaq_return_pct ?? 0) / 100;
          scaledNasdaq.push({
            date: todayStr,
            value: Number((lastND.value * (1 + ndChangePct * 0.05)).toFixed(4)),
          });
        }
      }
    }

    const sp500Pct = baseNavData.summary?.sp500_return_pct || 0;
    const nasdaqPct = baseNavData.summary?.nasdaq_return_pct || 0;
    const sp500ReturnUsd = (sp500Pct / 100) * activeInvested;
    const nasdaqReturnUsd = (nasdaqPct / 100) * activeInvested;

    return {
      ...baseNavData,
      nav: scaledNav,
      sp500: scaledSP500,
      nasdaq: scaledNasdaq,
      holdings: sanitizedHoldings,
      summary: {
        ...baseNavData.summary,
        active_invested: activeInvested,
        active_stock_value: currentStockValue,
        active_return: activeReturn,
        active_return_pct: activeReturnPct,
        sp500_return: sp500ReturnUsd,
        sp500_return_pct: sp500Pct,
        nasdaq_return: nasdaqReturnUsd,
        nasdaq_return_pct: nasdaqPct,
        alpha_sp500: Number((activeReturnPct - sp500Pct).toFixed(2)),
        alpha_sp500_usd: Number((activeReturn - sp500ReturnUsd).toFixed(2)),
        alpha_nasdaq: Number((activeReturnPct - nasdaqPct).toFixed(2)),
        alpha_nasdaq_usd: Number((activeReturn - nasdaqReturnUsd).toFixed(2)),
        num_holdings: activeList.length,
        cash_reserved: investment - activeInvested,
      },
    };
  }, [baseNavData, selectedTickers, investment, numSlots]);

  const summary = navData?.summary;
  const holdings = navData?.holdings || [];
  const activeHoldings = holdings.filter((h) => h.selected !== false);
  const allTickers = holdings.map((h) => h.ticker);

  const purchaseDates = useMemo(() => {
    const dates = new Set();
    const localRebs = strategyRebalances[mode] || [];
    const navRebs = navData?.rebalances || [];
    [...localRebs, ...navRebs].forEach((r) => {
      const d = r.rebalance_date || r.date;
      if (d) dates.add(String(d).split("T")[0]);
    });
    (holdings || []).forEach((h) => {
      const d = h.purchase_date || h.entry_date || h.date;
      if (d) dates.add(String(d).split("T")[0]);
    });
    (navData?.closed_holdings || []).forEach((h) => {
      const d = h.purchase_date || h.entry_date || h.date;
      if (d) dates.add(String(d).split("T")[0]);
    });
    return Array.from(dates).sort();
  }, [strategyRebalances, mode, navData, holdings]);

  // Toggle single ticker
  const toggleTicker = (ticker) => {
    const current = selectedTickers ?? allTickers;
    let next;
    if (current.includes(ticker)) {
      if (current.length <= 1) return; // keep at least 1
      next = current.filter((t) => t !== ticker);
    } else {
      next = [...current, ticker];
    }
    setSelectedTickers(next.length === allTickers.length ? null : next);
  };

  // Quick filter presets
  const selectAll = () => setSelectedTickers(null);
  const selectGainers = () => {
    const gainers = holdings.filter((h) => (h.return_pct ?? 0) >= 0).map((h) => h.ticker);
    if (gainers.length > 0) setSelectedTickers(gainers);
  };
  const selectLosers = () => {
    const losers = holdings.filter((h) => (h.return_pct ?? 0) < 0).map((h) => h.ticker);
    if (losers.length > 0) setSelectedTickers(losers);
  };
  const invertSelection = () => {
    const current = selectedTickers ?? allTickers;
    const inverted = allTickers.filter((t) => !current.includes(t));
    if (inverted.length > 0) setSelectedTickers(inverted);
  };

  const isSimulating = selectedTickers !== null && selectedTickers.length < allTickers.length;

  // ── Period unlock logic ──────────────────────────────────
  // A period button becomes enabled once the portfolio has enough days of history.
  // Same progressive thresholds used in DynamicStrategyView.
  const UNLOCK_DAYS = {
    "1W": 1,
    "1M": 7,
    "3M": 30,
    "6M": 90,
    "1Y": 180,
    "3Y": 365,
    "5Y": 1095,
    MAX: 90,
  };

  // Track maximum known days of history for each portfolio mode so zooming into 1W never shrinks available period buttons
  const maxHistoryDaysRef = useRef({});

  const periodEnabled = useMemo(() => {
    const map = {};

    // Earliest recorded rebalance date for this custom strategy or portfolio
    const localRebs = strategyRebalances[mode] || [];
    const navRebs = baseNavData?.rebalances || [];
    const allRebs = [...localRebs, ...navRebs];
    const rebDates = allRebs.map((r) => r.rebalance_date || r.date).filter(Boolean).sort();
    const earliestRebDate = rebDates[0] || (mode === "historical" ? "2026-08-03" : null);

    const candidateDate = earliestRebDate || baseNavData?.nav?.[0]?.date;
    if (candidateDate) {
      const days = Math.max(
        0,
        Math.floor((Date.now() - new Date(`${candidateDate}T00:00:00Z`).getTime()) / 86400000),
      );
      if (!maxHistoryDaysRef.current[mode] || days > maxHistoryDaysRef.current[mode]) {
        maxHistoryDaysRef.current[mode] = days;
      }
    }

    const availableDays = maxHistoryDaysRef.current[mode] ?? (mode === "historical" ? 60 : Infinity);
    for (const p of PERIODS) {
      map[p] = UNLOCK_DAYS[p] <= availableDays;
    }
    return map;
  }, [mode, strategyRebalances, baseNavData]);

  // Si el periodo actual seleccionado no está habilitado para el historial disponible,
  // retroceder al periodo más alto que sí esté habilitado (o "1W").
  useEffect(() => {
    if (periodEnabled && period && !periodEnabled[period]) {
      const fallbackPeriod = [...PERIODS].reverse().find((p) => periodEnabled[p]) || "1W";
      setPeriod(fallbackPeriod);
    }
  }, [period, periodEnabled, setPeriod]);

  // Si la sesión aún se está verificando, mostrar pantalla de carga suave con la animación cuántica
  if (!isInitialized) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--bg-main)",
          padding: 20,
        }}
      >
        <div style={{ width: "100%", maxWidth: 860 }}>
          <QuantumOrbitalLoader
            message="Iniciando Terminal Cuantitativa…"
            submessage="Verificando sesión segura y sincronizando modelos estocásticos"
            height={500}
          />
        </div>
      </div>
    );
  }

  // Muro de Privacidad: Si no hay usuario autenticado, bloquear acceso a datos financieros
  if (!user) {
    return (
      <>
        <Toaster
          position="bottom-right"
          containerStyle={{ zIndex: 99999999 }}
          toastOptions={{
            style: {
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              fontSize: "0.88rem",
              fontWeight: 600,
            },
            success: {
              iconTheme: {
                primary: "#10b981",
                secondary: "var(--bg-surface)",
              },
            },
            error: {
              iconTheme: {
                primary: "#ef4444",
                secondary: "var(--bg-surface)",
              },
            },
          }}
        />
        <AuthWall />
      </>
    );
  }

  return (
    <div className="app-wrapper">
      <Toaster
        position="bottom-right"
        containerStyle={{ zIndex: 99999999 }}
        toastOptions={{
          style: {
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            fontSize: "0.88rem",
            fontWeight: 600,
          },
          success: {
            iconTheme: {
              primary: "#10b981",
              secondary: "var(--bg-surface)",
            },
          },
          error: {
            iconTheme: {
              primary: "#ef4444",
              secondary: "var(--bg-surface)",
            },
          },
        }}
      />
      {/* ── Header ──────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <img
              src="./favicon.svg"
              alt="Kpital Zhent Logo"
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                filter: "drop-shadow(0 0 8px rgba(0, 229, 255, 0.4))",
              }}
            />
            <span className="logo-text">
              Kpital <span>Zhent</span>
            </span>
          </div>
          <div className="header-subtitle">Terminal Multiactivo & Estrategias Cuantitativas</div>
        </div>

        <nav className="header-nav-menu">
          {/* 1. Estrategias & Portafolios Dropdown */}
          <div className="nav-dropdown" ref={stratDropdownRef}>
            <button
              type="button"
              className={`nav-dropdown-btn ${isStrategyMode ? "active" : ""}`}
              onClick={() => {
                setStratOpen((prev) => !prev);
                setPurchasesOpen(false);
              }}
            >
              <span className="btn-label" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                📊 Estrategias
                {!isPro && (
                  <span
                    style={{
                      background: "rgba(168, 85, 247, 0.2)",
                      border: "1px solid rgba(168, 85, 247, 0.5)",
                      color: "#c084fc",
                      fontSize: "0.62rem",
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: 4,
                      letterSpacing: "0.04em",
                    }}
                  >
                    🔒 PRO
                  </span>
                )}
              </span>
              <span className="active-badge">{currentStrategyLabel}</span>
              <span className="chevron">{stratOpen ? "▲" : "▼"}</span>
            </button>

            {stratOpen && (
              <div className="nav-dropdown-menu fade-up">
                <div className="dropdown-header">Estrategias & Portafolios</div>

                {/* Core Portfolios */}
                <div
                  className={`dropdown-item ${mode === "historical" ? "selected" : ""}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                  onClick={() => {
                    setMode("historical");
                    setStratOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    <span className="item-icon">🏆</span>
                    <span className="item-title">{coreStrategyName}</span>
                    <span className="system-badge core">CORE</span>
                  </div>
                  <button
                    type="button"
                    title="Renombrar estrategia"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const newName = await toastPrompt("Nuevo nombre para la estrategia CORE:", coreStrategyName);
                      if (newName && newName.trim()) {
                        const trimmed = newName.trim();
                        setCoreStrategyName(trimmed);
                        localStorage.setItem("kpital_core_strategy_name", trimmed);
                        toast.success(`Estrategia renombrada a "${trimmed}"`);
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 6px",
                      fontSize: "0.85rem",
                      opacity: 0.65,
                    }}
                  >
                    ✏️
                  </button>
                </div>

                <button
                  type="button"
                  className={`dropdown-item ${mode === "live" ? "selected" : ""}`}
                  onClick={() => {
                    setMode("live");
                    setStratOpen(false);
                  }}
                >
                  <span className="item-icon">⚡</span>
                  <span className="item-title">Live Tracker</span>
                  <span className="system-badge pro">LIVE</span>
                </button>

                {/* Categoría: Portafolios / Estrategias de Dinero Real */}
                {(() => {
                  const realMoneyStrats = (customStrategies || []).filter((s) => s.isRealMoney);
                  if (realMoneyStrats.length === 0) return null;
                  return (
                    <>
                      <div className="dropdown-divider" />
                      <div className="dropdown-header" style={{ color: "#34d399" }}>
                        💵 Dinero Real Activo
                      </div>
                      {realMoneyStrats.map((strat) => (
                        <div
                          key={strat.id}
                          className={`dropdown-item ${mode === strat.id ? "selected" : ""}`}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                          onClick={() => {
                            setMode(strat.id);
                            setStratOpen(false);
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                            <span className="item-icon">{strat.country || "💵"}</span>
                            <span className="item-title">{strat.name}</span>
                            <span className="system-badge real">REAL</span>
                          </div>
                          <button
                            type="button"
                            title="Renombrar estrategia"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newName = await toastPrompt("Nuevo nombre para la estrategia:", strat.name);
                              if (newName && newName.trim()) {
                                await updateCustomStrategy(strat.id, { name: newName.trim() });
                                toast.success(`Estrategia renombrada a "${newName.trim()}"`);
                              }
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: "2px 6px",
                              fontSize: "0.85rem",
                              opacity: 0.65,
                            }}
                          >
                            ✏️
                          </button>
                        </div>
                      ))}
                    </>
                  );
                })()}

                {/* Categoría: Modelos & Simulaciones */}
                {(() => {
                  const simulatedStrats = (customStrategies || []).filter((s) => !s.isRealMoney);
                  if (simulatedStrats.length === 0) return null;
                  return (
                    <>
                      <div className="dropdown-divider" />
                      <div className="dropdown-header" style={{ color: "#c084fc" }}>
                        🧪 Modelos & Simulaciones
                      </div>
                      {simulatedStrats.map((strat) => (
                        <div
                          key={strat.id}
                          className={`dropdown-item ${mode === strat.id ? "selected" : ""}`}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                          onClick={() => {
                            setMode(strat.id);
                            setStratOpen(false);
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                            <span className="item-icon">{strat.country || "🌎"}</span>
                            <span className="item-title">{strat.name}</span>
                            {strat.isSystem ? (
                              <span className="system-badge pro">PRO</span>
                            ) : (
                              <span className="system-badge custom">{strat.numSlots} slots</span>
                            )}
                          </div>
                          <button
                            type="button"
                            title="Renombrar estrategia"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const newName = await toastPrompt("Nuevo nombre para la estrategia:", strat.name);
                              if (newName && newName.trim()) {
                                await updateCustomStrategy(strat.id, { name: newName.trim() });
                                toast.success(`Estrategia renombrada a "${newName.trim()}"`);
                              }
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: "2px 6px",
                              fontSize: "0.85rem",
                              opacity: 0.65,
                            }}
                          >
                            ✏️
                          </button>
                        </div>
                      ))}
                    </>
                  );
                })()}

                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="dropdown-action-btn cyan"
                  onClick={() => {
                    setIsModalOpen(true);
                    setStratOpen(false);
                  }}
                >
                  <span>+ Nueva Estrategia</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Compras Individuales Dropdown */}
          <div className="nav-dropdown" ref={purchasesDropdownRef}>
            <button
              type="button"
              className={`nav-dropdown-btn ${isPurchaseMode ? "active" : ""}`}
              onClick={() => {
                setPurchasesOpen((prev) => !prev);
                setStratOpen(false);
              }}
            >
              <span className="btn-label">🛒 Compras</span>
              <span className="active-badge warning">{currentPurchaseLabel}</span>
              <span className="chevron">{purchasesOpen ? "▲" : "▼"}</span>
            </button>

            {purchasesOpen && (
              <div className="nav-dropdown-menu fade-up">
                <div className="dropdown-header">Históricos de Compras</div>

                {(purchasePortfolios || []).map((port) => (
                  <div
                    key={port.id}
                    className={`dropdown-item ${mode === port.id ? "selected" : ""}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                    onClick={() => {
                      setMode(port.id);
                      setPurchasesOpen(false);
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                      <span className="item-icon">
                        {port.id === "hist_crypto" || (port.name && port.name.toLowerCase().includes("cripto"))
                          ? "🪙"
                          : "🛒"}
                      </span>
                      <span className="item-title">{port.name}</span>
                    </div>
                    <button
                      type="button"
                      title="Renombrar portafolio de compras"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const newName = await toastPrompt("Nuevo nombre para el portafolio de compras:", port.name);
                        if (newName && newName.trim()) {
                          await renamePurchasePortfolio(port.id, newName.trim());
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px 6px",
                        fontSize: "0.85rem",
                        opacity: 0.65,
                      }}
                    >
                      ✏️
                    </button>
                  </div>
                ))}

                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="dropdown-action-btn orange"
                  onClick={async () => {
                    setPurchasesOpen(false);
                    const name = await toastPrompt("Nombre del nuevo Histórico de Compras:");
                    if (name) addPurchasePortfolio(name);
                  }}
                >
                  <span>+ Nuevo Histórico</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Renta Fija & Ahorros */}
          <button
            type="button"
            className={`nav-pill-btn emerald ${mode === "fixed_income" ? "active" : ""}`}
            onClick={() => {
              setMode("fixed_income");
              setStratOpen(false);
              setPurchasesOpen(false);
            }}
          >
            <span>🏦 Renta Fija & Ahorros</span>
          </button>

          {/* 4. Distribución del Dinero & Flujo de Caja */}
          <button
            type="button"
            className={`nav-pill-btn cyan ${mode === "cash_flow" ? "active" : ""}`}
            onClick={() => {
              setMode("cash_flow");
              setStratOpen(false);
              setPurchasesOpen(false);
            }}
          >
            <span>🌊 Distribución & Flujo</span>
          </button>



          {/* 6. Selector Modo Diurno / Nocturno (Compacto & Elegante) */}
          <button
            type="button"
            className="nav-action-btn theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Cambiar a Modo Diurno (☀️)" : "Cambiar a Modo Nocturno (🌙)"}
            aria-label="Cambiar tema diurno/nocturno"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.95rem",
              borderRadius: "var(--radius-sm)",
              minWidth: "36px",
            }}
          >
            <span>{theme === "dark" ? "☀️" : "🌙"}</span>
          </button>

          {/* 7. Cuenta de Usuario & Login */}
          <div className="nav-dropdown header-user-dropdown" ref={userDropdownRef} style={{ position: "relative" }}>
            {user ? (
              <button
                type="button"
                className="nav-dropdown-btn user-pill-btn"
                onClick={() => setUserDropdownOpen((prev) => !prev)}
                title={user.name || user.email}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid var(--border-accent)",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  padding: "5px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  maxWidth: "180px",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: user.provider === "google" ? "#4285F4" : "var(--accent-primary)",
                    color: "#080c18",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "0.72rem",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    (user.name || user.email || "U").charAt(0).toUpperCase()
                  )}
                </div>
                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {(user.name ? user.name.split(" ")[0] : user.email.split("@")[0])}
                </span>
                <span style={{ fontSize: "0.6rem", marginLeft: 1, opacity: 0.7 }}>{userDropdownOpen ? "▲" : "▼"}</span>
              </button>
            ) : (
              <button
                type="button"
                className="nav-action-btn"
                onClick={() => openAuthModal("login")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(0, 229, 255, 0.1)",
                  border: "1px solid var(--border-accent)",
                  color: "var(--text-accent)",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "6px 14px",
                  borderRadius: 8,
                }}
              >
                <span>🔑</span>
                <span>Acceder</span>
              </button>
            )}

            {user && userDropdownOpen && (
              <div
                className="nav-dropdown-menu fade-up"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "100%",
                  marginTop: 6,
                  minWidth: 240,
                  maxWidth: 320,
                  zIndex: 1000,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "var(--shadow-card)",
                  padding: 8,
                }}
              >
                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>{user.name || "Usuario"}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", wordBreak: "break-all", whiteSpace: "normal" }}>{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setUserDropdownOpen(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    color: "var(--loss)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>🚪</span>
                  <span>Cerrar sesión</span>
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      {/* ── Modal Creador de Nueva Estrategia ─────────────── */}
      <CreateStrategyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={(stratData) => {
          addCustomStrategy(stratData);
        }}
      />

      {/* ── Mobile Selector Sheet: Estrategias & Portafolios ── */}
      {mobileStratModalOpen && (
        <div
          className="modal-overlay-responsive"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.65)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setMobileStratModalOpen(false)}
        >
          <div
            className="modal-sheet-responsive"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "18px",
              width: "100%",
              maxWidth: 440,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                📊 Seleccionar Estrategia
              </div>
              <button
                type="button"
                onClick={() => setMobileStratModalOpen(false)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  borderRadius: "50%",
                  width: 30,
                  height: 30,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="dropdown-header">Estrategias Base</div>
              <button
                type="button"
                className={`dropdown-item ${mode === "historical" ? "selected" : ""}`}
                style={{ padding: "10px 12px", borderRadius: 8, fontSize: "0.9rem" }}
                onClick={() => {
                  setMode("historical");
                  setMobileStratModalOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <span className="item-icon">🏆</span>
                <span className="item-title">Kpital Tech</span>
                <span className="system-badge core">CORE</span>
              </button>

              <button
                type="button"
                className={`dropdown-item ${mode === "live" ? "selected" : ""}`}
                style={{ padding: "10px 12px", borderRadius: 8, fontSize: "0.9rem" }}
                onClick={() => {
                  setMode("live");
                  setMobileStratModalOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <span className="item-icon">⚡</span>
                <span className="item-title">Live Tracker</span>
                <span className="system-badge pro">LIVE</span>
              </button>

              {/* Dinero Real */}
              {(() => {
                const realMoneyStrats = (customStrategies || []).filter((s) => s.isRealMoney);
                if (realMoneyStrats.length === 0) return null;
                return (
                  <>
                    <div className="dropdown-divider" style={{ margin: "8px 0" }} />
                    <div className="dropdown-header" style={{ color: "#34d399" }}>
                      💵 Dinero Real Activo
                    </div>
                    {realMoneyStrats.map((strat) => (
                      <button
                        type="button"
                        key={strat.id}
                        className={`dropdown-item ${mode === strat.id ? "selected" : ""}`}
                        style={{ padding: "10px 12px", borderRadius: 8, fontSize: "0.9rem" }}
                        onClick={() => {
                          setMode(strat.id);
                          setMobileStratModalOpen(false);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <span className="item-icon">{strat.country || "💵"}</span>
                        <span className="item-title">{strat.name}</span>
                        <span className="system-badge real">REAL</span>
                      </button>
                    ))}
                  </>
                );
              })()}

              {/* Modelos & Simulaciones */}
              {(() => {
                const simulatedStrats = (customStrategies || []).filter((s) => !s.isRealMoney);
                if (simulatedStrats.length === 0) return null;
                return (
                  <>
                    <div className="dropdown-divider" style={{ margin: "8px 0" }} />
                    <div className="dropdown-header" style={{ color: "#c084fc" }}>
                      🧪 Modelos & Simulaciones
                    </div>
                    {simulatedStrats.map((strat) => (
                      <button
                        type="button"
                        key={strat.id}
                        className={`dropdown-item ${mode === strat.id ? "selected" : ""}`}
                        style={{ padding: "10px 12px", borderRadius: 8, fontSize: "0.9rem" }}
                        onClick={() => {
                          setMode(strat.id);
                          setMobileStratModalOpen(false);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <span className="item-icon">{strat.country || "🌎"}</span>
                        <span className="item-title">{strat.name}</span>
                        {strat.isSystem ? (
                          <span className="system-badge pro">PRO</span>
                        ) : (
                          <span className="system-badge custom">{strat.numSlots} slots</span>
                        )}
                      </button>
                    ))}
                  </>
                );
              })()}

              <div className="dropdown-divider" style={{ margin: "8px 0" }} />
              <button
                type="button"
                className="dropdown-action-btn cyan"
                style={{ padding: "10px 12px", fontSize: "0.85rem" }}
                onClick={() => {
                  setMobileStratModalOpen(false);
                  setIsModalOpen(true);
                }}
              >
                <span>+ Crear Nueva Estrategia</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Selector Sheet: Históricos de Compras ─────── */}
      {mobilePurchasesModalOpen && (
        <div
          className="modal-overlay-responsive"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.65)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setMobilePurchasesModalOpen(false)}
        >
          <div
            className="modal-sheet-responsive"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "18px",
              width: "100%",
              maxWidth: 440,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-drag-handle" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-primary)" }}>
                🛒 Históricos de Compras
              </div>
              <button
                type="button"
                onClick={() => setMobilePurchasesModalOpen(false)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  borderRadius: "50%",
                  width: 30,
                  height: 30,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(purchasePortfolios || []).map((port) => (
                <button
                  type="button"
                  key={port.id}
                  className={`dropdown-item ${mode === port.id ? "selected" : ""}`}
                  style={{ padding: "10px 12px", borderRadius: 8, fontSize: "0.9rem" }}
                  onClick={() => {
                    setMode(port.id);
                    setMobilePurchasesModalOpen(false);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span className="item-icon">🛒</span>
                  <span className="item-title">{port.name}</span>
                </button>
              ))}

              <div className="dropdown-divider" style={{ margin: "8px 0" }} />
              <button
                type="button"
                className="dropdown-action-btn orange"
                style={{ padding: "10px 12px", fontSize: "0.85rem" }}
                onClick={async () => {
                  setMobilePurchasesModalOpen(false);
                  const name = await toastPrompt("Nombre del nuevo Histórico de Compras:");
                  if (name) addPurchasePortfolio(name);
                }}
              >
                <span>+ Nuevo Histórico</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout ─────────────────────────────────── */}
      <main className="app-main">
        {mode === "cash_flow" ? (
          <CashFlowHub />
        ) : mode === "fixed_income" ? (
          <FixedIncomeHub />
        ) : (purchasePortfolios || []).some((p) => p.id === mode) ? (
          <IndividualPurchasesView portfolioId={mode} onSelectPortfolio={(id) => setMode(id)} />
        ) : !isPro && isStrategyMode ? (
          <StrategyPaywall onOpenAuth={openAuthModal} />
        ) : mode === "live" ? (
          <LiveMode key={refreshKey} navData={navData} investment={investment} />
        ) : customStrategies?.some((s) => s.id === mode) ? (
          <DynamicStrategyView
            key={mode}
            strategy={customStrategies.find((s) => s.id === mode)}
            onDelete={deleteCustomStrategy}
            onUpdate={updateCustomStrategy}
            onBack={() => setMode("historical")}
            onSelectStrategy={(id) => setMode(id)}
            customStrategies={customStrategies}
            firstInvestDate={
              (() => {
                const strat = customStrategies.find((s) => s.id === mode);
                const rebs = strategyRebalances?.[mode];
                if (Array.isArray(rebs) && rebs.length > 0) {
                  const dates = rebs
                    .map((r) => r.rebalance_date || r.date)
                    .filter(Boolean);
                  if (dates.length > 0) {
                    return [...dates].sort()[0];
                  }
                }
                if (strat?.isSystem) {
                  return baseNavData?.nav?.[0]?.date || "2026-08-03";
                }
                if (strat?.createdAt) {
                  return strat.createdAt.slice(0, 10); // "YYYY-MM-DD"
                }
                return baseNavData?.nav?.[0]?.date;
              })()
            }
          />
        ) : (
          <>
            {/* ── Yield View Controls for Main Portfolio (Nominal / Divisa / Real) ── */}
            <div
              className="fade-up"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-accent)",
                    borderRadius: 8,
                    color: "var(--accent-primary)",
                    padding: "6px 12px",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    outline: "none",
                  }}
                  title="Cambiar de Estrategia o Portafolio"
                >
                  <option value="historical" style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}>
                    🏆 {coreStrategyName} (CORE)
                  </option>
                  <option value="live" style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}>
                    ⚡ Live Tracker (LIVE)
                  </option>
                  {(customStrategies || []).map((s) => (
                    <option key={s.id} value={s.id} style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}>
                      {s.isRealMoney ? "💵" : "🧪"} {s.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  title="Renombrar la estrategia activa"
                  onClick={async () => {
                    if (mode === "historical") {
                      const newName = await toastPrompt("Nuevo nombre para la estrategia CORE:", coreStrategyName);
                      if (newName && newName.trim()) {
                        const trimmed = newName.trim();
                        setCoreStrategyName(trimmed);
                        localStorage.setItem("kpital_core_strategy_name", trimmed);
                        toast.success(`Estrategia renombrada a "${trimmed}"`);
                      }
                    } else {
                      const currentStrat = (customStrategies || []).find((s) => s.id === mode);
                      if (currentStrat) {
                        const newName = await toastPrompt("Nuevo nombre para la estrategia:", currentStrat.name);
                        if (newName && newName.trim()) {
                          await updateCustomStrategy(mode, { name: newName.trim() });
                          toast.success(`Estrategia renombrada a "${newName.trim()}"`);
                        }
                      }
                    }
                  }}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  ✏️ Renombrar
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  background: "var(--bg-card-hover)",
                  borderRadius: 20,
                  padding: 4,
                  border: "1px solid var(--border)",
                }}
              >
                <button
                  onClick={() => setMainYieldViewMode("USD")}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 16,
                    border: "none",
                    background:
                      mainYieldViewMode === "USD" ? "var(--bg-card)" : "transparent",
                    color: mainYieldViewMode === "USD" ? "var(--accent-primary)" : "var(--text-secondary)",
                    boxShadow: mainYieldViewMode === "USD" ? "var(--shadow-card)" : "none",
                    fontSize: "0.8rem",
                    fontWeight: mainYieldViewMode === "USD" ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  Nominal ({mainSettings.assetCurrency || "USD"})
                </button>
                <button
                  onClick={() => {
                    if (
                      mainSettings.localCurrency &&
                      mainSettings.localCurrency !== (mainSettings.assetCurrency || "USD")
                    ) {
                      setMainYieldViewMode("FX");
                    } else if (mainSettings.localCurrency) {
                      setMainYieldViewMode("FX");
                    } else {
                      toast("Configura tu Divisa Local en ⚙️ primero.", { icon: "ℹ️" });
                    }
                  }}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 16,
                    border: "none",
                    background:
                      mainYieldViewMode === "FX" ? "var(--bg-card)" : "transparent",
                    color: mainYieldViewMode === "FX" ? "var(--accent-primary)" : "var(--text-secondary)",
                    boxShadow: mainYieldViewMode === "FX" ? "var(--shadow-card)" : "none",
                    fontSize: "0.8rem",
                    fontWeight: mainYieldViewMode === "FX" ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  Divisa ({mainSettings.localCurrency || "COP"}){" "}
                  {isFetchingMainFx && mainYieldViewMode === "FX" && "⏳"}
                </button>
                <button
                  onClick={() => {
                    if (mainSettings.useAutoColInflation || mainSettings.inflationRate > 0) {
                      setMainYieldViewMode("REAL");
                    } else {
                      toast("Configura la Inflación en ⚙️ primero.", { icon: "ℹ️" });
                    }
                  }}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 16,
                    border: "none",
                    background:
                      mainYieldViewMode === "REAL" ? "var(--bg-card)" : "transparent",
                    color: mainYieldViewMode === "REAL" ? "#d97706" : "var(--text-secondary)",
                    boxShadow: mainYieldViewMode === "REAL" ? "var(--shadow-card)" : "none",
                    fontSize: "0.8rem",
                    fontWeight: mainYieldViewMode === "REAL" ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  Poder Adquisitivo Real{" "}
                  {isFetchingMainInflation && mainYieldViewMode === "REAL" && "⏳"}
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={() => setShowMainInflationExplorer(true)}
                  style={{
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: "#d97706",
                    padding: "6px 14px",
                    borderRadius: "14px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  🔍 Ver Historial IPC (
                  {mainColInflationData.latest?.yoy
                    ? `${mainColInflationData.latest.yoy}%`
                    : "Colombia"}
                  )
                </button>

                <button
                  onClick={() => setShowMainSettingsModal(true)}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "var(--text-secondary)",
                    padding: "6px 14px",
                    borderRadius: "14px",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                  }}
                >
                  ⚙️ Configurar Divisa/Inflación
                </button>
              </div>
            </div>

            {/* ── Summary strip with % and $ Unit Toggle ─── */}
            {summary &&
              !loading &&
              (() => {
                let fxMultiplier = 1.0;
                if (mainYieldViewMode !== "USD") {
                  fxMultiplier = mainFxData.current || 1.0;
                }

                // Calculate inflation factor for the selected period
                let periodInflationFactor = 1.0;
                const yoyRate = mainSettings.useAutoColInflation
                  ? mainColInflationData.latest?.yoy || 5.16
                  : mainSettings.inflationRate || 0;

                if (yoyRate > 0) {
                  const years =
                    period === "1W"
                      ? 1 / 52
                      : period === "1M"
                        ? 1 / 12
                        : period === "3M"
                          ? 3 / 12
                          : period === "6M"
                            ? 6 / 12
                            : period === "1Y"
                              ? 1
                              : period === "3Y"
                                ? 3
                                : period === "5Y"
                                  ? 5
                                  : 5;
                  periodInflationFactor = Math.pow(1 + yoyRate / 100, years);
                }

                const inflationFactor = mainYieldViewMode === "REAL" ? periodInflationFactor : 1.0;

                const rawActiveInvested =
                  summary.active_invested || investment - (summary.cash_reserved || 0);
                const activeInvested =
                  rawActiveInvested * (mainYieldViewMode !== "USD" ? fxMultiplier : 1.0);

                const rawActiveStockVal =
                  summary.active_stock_value || rawActiveInvested + (summary.active_return ?? 0);
                const currentStockValueAdjusted =
                  (rawActiveStockVal * (mainYieldViewMode !== "USD" ? fxMultiplier : 1.0)) /
                  inflationFactor;

                const activeReturnUsd = currentStockValueAdjusted - activeInvested;
                const activeReturnPct =
                  activeInvested > 0 ? (activeReturnUsd / activeInvested) * 100 : 0;
                const isActGain = (unit === "pct" ? activeReturnPct : activeReturnUsd) >= 0;

                const alphaSPPct = summary.alpha_sp500 ?? 0;
                const alphaSPUsd =
                  (summary.alpha_sp500_usd ?? activeReturnUsd - (summary.sp500_return || 0)) *
                  (mainYieldViewMode !== "USD" ? fxMultiplier : 1.0);

                const alphaNDPct = summary.alpha_nasdaq ?? 0;
                const alphaNDUsd =
                  (summary.alpha_nasdaq_usd ?? activeReturnUsd - (summary.nasdaq_return || 0)) *
                  (mainYieldViewMode !== "USD" ? fxMultiplier : 1.0);

                const maxDDPct = summary.max_drawdown_pct ?? 0;
                const maxDDUsd =
                  (summary.max_drawdown_usd ?? 0) *
                  (mainYieldViewMode !== "USD" ? fxMultiplier : 1.0);

                const currSymbol =
                  mainYieldViewMode === "USD"
                    ? mainSettings.assetCurrency || "USD"
                    : mainSettings.localCurrency || "COP";

                return (
                  <>
                    <div className="summary-strip fade-up" style={{ position: "relative" }}>
                      <SummaryItem
                        label={
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            Capital Activo ({summary.num_holdings} Acciones - {currSymbol})
                            <InfoTooltip conceptKey="active_invested" />
                          </span>
                        }
                        value={`$${activeInvested.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        large
                        mono
                      />
                      <div className="summary-divider" />
                      <SummaryItem
                        label={
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                            }}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center" }}>
                              Rendimiento{" "}
                              {mainYieldViewMode === "REAL" ? "Real (Ajustado)" : "Kpital"}
                              <InfoTooltip conceptKey={mainYieldViewMode === "REAL" ? "real_return" : "nav"} />
                            </span>
                          </div>
                        }
                        value={
                          <span
                            className={`badge ${isActGain ? "gain" : "loss"}`}
                            style={{
                              fontSize: "0.95rem",
                              padding: "4px 10px",
                              cursor: "pointer",
                              color: mainYieldViewMode === "REAL" ? "#f59e0b" : undefined,
                            }}
                            onClick={toggleUnit}
                            title="Haz clic para alternar entre % y $"
                          >
                            {isActGain ? "▲" : "▼"}{" "}
                            {unit === "pct"
                              ? `${Math.abs(activeReturnPct).toFixed(2)}%`
                              : `$${Math.abs(activeReturnUsd).toFixed(2)}`}
                          </span>
                        }
                      />
                      <div className="summary-divider" />
                      <SummaryItem
                        label={
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            Alfa vs S&P 500 (α)
                            <InfoTooltip conceptKey="alpha_sp500" />
                          </span>
                        }
                        value={
                          <span
                            className={`badge ${alphaSPPct >= 0 ? "gain" : "loss"}`}
                            style={{ fontSize: "0.95rem", padding: "4px 10px", cursor: "pointer" }}
                            onClick={toggleUnit}
                            title="Haz clic para alternar entre % y $"
                          >
                            {alphaSPPct >= 0 ? "+" : ""}
                            {unit === "pct"
                              ? `${alphaSPPct.toFixed(2)}%`
                              : `$${alphaSPUsd.toFixed(2)}`}
                          </span>
                        }
                        mono
                      />
                      <div className="summary-divider" />
                      <SummaryItem
                        label={
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            Alfa vs NASDAQ (α)
                            <InfoTooltip conceptKey="alpha_nasdaq" />
                          </span>
                        }
                        value={
                          <span
                            className={`badge ${alphaNDPct >= 0 ? "gain" : "loss"}`}
                            style={{ fontSize: "0.95rem", padding: "4px 10px", cursor: "pointer" }}
                            onClick={toggleUnit}
                            title="Haz clic para alternar entre % y $"
                          >
                            {alphaNDPct >= 0 ? "+" : ""}
                            {unit === "pct"
                              ? `${alphaNDPct.toFixed(2)}%`
                              : `$${alphaNDUsd.toFixed(2)}`}
                          </span>
                        }
                        mono
                      />
                      <div className="summary-divider" />
                      <SummaryItem
                        label={
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            Max Drawdown
                            <InfoTooltip conceptKey="max_drawdown" />
                          </span>
                        }
                        value={
                          <span
                            style={{
                              color: maxDDPct < -5 ? "#ef4444" : "#94a3b8",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            onClick={toggleUnit}
                            title="Haz clic para alternar entre % y $"
                          >
                            {unit === "pct"
                              ? `${maxDDPct.toFixed(2)}%`
                              : `-$${Math.abs(maxDDUsd).toFixed(2)}`}
                          </span>
                        }
                        mono
                      />
                      <div className="summary-divider" />
                      <SummaryItem
                        label={
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            Cash Reservado (Q)
                            <InfoTooltip conceptKey="cash_reserved" />
                          </span>
                        }
                        value={`$${((summary.cash_reserved ?? 0) * (mainYieldViewMode !== "USD" ? fxMultiplier : 1.0)).toFixed(2)}`}
                        muted
                        mono
                      />
                      <div className="summary-divider" />
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 10px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.65rem",
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Unidad
                        </span>
                        <div
                          className="unit-toggle"
                          onClick={toggleUnit}
                          title="Alternar métricas entre Porcentaje (%) y Dólares ($)"
                        >
                          <button className={`unit-btn ${unit === "pct" ? "active" : ""}`}>
                            %
                          </button>
                          <button className={`unit-btn ${unit === "usd" ? "active" : ""}`}>
                            $
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ── 3-Level Comparative Breakdown Card (Nominal vs Divisa vs Real) ── */}
                    <div
                      className="fade-up"
                      style={{
                        marginTop: 12,
                        marginBottom: 16,
                        padding: "14px 20px",
                        background: "rgba(0,0,0,0.25)",
                        borderRadius: "var(--radius)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 700,
                          color: "var(--text-secondary)",
                          marginBottom: showBreakdownCard ? 10 : 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                        onClick={() => setShowBreakdownCard(!showBreakdownCard)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span>
                            📊 Comparativa de Rendimiento Multinivel (Nominal ➔ Divisa ➔ Real)
                          </span>
                          <span
                            style={{
                              fontSize: "0.74rem",
                              color: "#f59e0b",
                              background: "rgba(245,158,11,0.1)",
                              padding: "2px 8px",
                              borderRadius: 6,
                            }}
                          >
                            {mainSettings.useAutoColInflation
                              ? "IPC Automático (FRED/DANE)"
                              : `Inflación Manual ${mainSettings.inflationRate || 0}%/año`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowBreakdownCard(!showBreakdownCard);
                          }}
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 6,
                            padding: "2px 8px",
                            color: "var(--text-muted)",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                          }}
                        >
                          {showBreakdownCard ? "▲ Ocultar" : "▼ Desplegar"}
                        </button>
                      </div>
                      {showBreakdownCard && (() => {
                        const nomInvested = rawActiveInvested;
                        const nomReturnUsd =
                          summary.active_return ??
                          (summary.active_stock_value || nomInvested) - nomInvested;
                        const nomReturnPct = summary.active_return_pct ?? 0;

                        const fxMult = mainFxData.current || 1.0;
                        const currentFx = fxMult;
                        let startFx = currentFx;
                        const rebs = strategyRebalances?.historical;
                        const startDate =
                          (Array.isArray(rebs) && rebs[0]?.rebalance_date) ||
                          navData?.[0]?.date ||
                          "2026-08-03";
                        if (startDate && mainFxData.history && Object.keys(mainFxData.history).length > 0) {
                          if (mainFxData.history[startDate]) {
                            startFx = mainFxData.history[startDate];
                          } else {
                            const histDates = Object.keys(mainFxData.history).sort();
                            const pastDates = histDates.filter((d) => d <= startDate);
                            if (pastDates.length > 0) {
                              startFx = mainFxData.history[pastDates[pastDates.length - 1]];
                            } else if (histDates.length > 0) {
                              startFx = mainFxData.history[0];
                            }
                          }
                        }

                        const pureAssetGainCOP = nomReturnUsd * currentFx;
                        const pureAssetGainCOPPct =
                          nomInvested * startFx > 0
                            ? (pureAssetGainCOP / (nomInvested * startFx)) * 100
                            : 0;

                        const fxEffectCOP = nomInvested * (currentFx - startFx);
                        const fxEffectCOPPct =
                          nomInvested * startFx > 0
                            ? (fxEffectCOP / (nomInvested * startFx)) * 100
                            : 0;

                        const fxInvested = nomInvested * startFx;
                        const fxStockVal = rawActiveStockVal * currentFx;
                        const fxReturnNet = fxStockVal - fxInvested;
                        const fxReturnPct = fxInvested > 0 ? (fxReturnNet / fxInvested) * 100 : 0;

                        const realStockVal = fxStockVal / periodInflationFactor;
                        const realReturnNet = realStockVal - fxInvested;
                        const realReturnPct =
                          fxInvested > 0 ? (realReturnNet / fxInvested) * 100 : 0;

                        const inflationLossAmount = fxStockVal - realStockVal;
                        const inflationLossPct =
                          fxInvested > 0 ? (inflationLossAmount / fxInvested) * 100 : 0;

                        return (
                          <>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: 12,
                              }}
                            >
                              {/* Level 1: Nominal */}
                              <div
                                style={{
                                  padding: 10,
                                  background: "rgba(255,255,255,0.02)",
                                  borderRadius: 8,
                                  border: "1px solid rgba(255,255,255,0.06)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#94a3b8",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  1. Nominal ({mainSettings.assetCurrency || "USD"})
                                </div>
                                <div
                                  className="mono"
                                  style={{
                                    fontSize: "1.1rem",
                                    fontWeight: 800,
                                    color: nomReturnUsd >= 0 ? "#4ade80" : "#f87171",
                                    marginTop: 4,
                                  }}
                                >
                                  {nomReturnUsd >= 0 ? "+" : ""}${nomReturnUsd.toFixed(2)} (
                                  {nomReturnPct >= 0 ? "+" : ""}
                                  {nomReturnPct.toFixed(2)}%)
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "var(--text-muted)",
                                    marginTop: 2,
                                  }}
                                >
                                  Crecimiento puro del ETF en dólares
                                </div>
                              </div>

                              {/* Level 2: FX Adjusted */}
                              <div
                                style={{
                                  padding: 10,
                                  background: "rgba(0, 229, 255, 0.03)",
                                  borderRadius: 8,
                                  border: "1px solid rgba(0, 229, 255, 0.15)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#00e5ff",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  2. Al Cambio Divisa ({mainSettings.localCurrency || "COP"})
                                </div>
                                <div
                                  className="mono"
                                  style={{
                                    fontSize: "1.1rem",
                                    fontWeight: 800,
                                    color: fxReturnNet >= 0 ? "#4ade80" : "#f87171",
                                    marginTop: 4,
                                  }}
                                >
                                  {fxReturnNet >= 0 ? "+" : ""}${fxReturnNet.toFixed(2)} (
                                  {fxReturnPct >= 0 ? "+" : ""}
                                  {fxReturnPct.toFixed(2)}%)
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "var(--text-muted)",
                                    marginTop: 2,
                                  }}
                                >
                                  Tipo de cambio: $
                                  {fxMult.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                                </div>
                              </div>

                              {/* Level 3: Real Purchasing Power */}
                              <div
                                style={{
                                  padding: 10,
                                  background: "rgba(245, 158, 11, 0.03)",
                                  borderRadius: 8,
                                  border: "1px solid rgba(245, 158, 11, 0.15)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#f59e0b",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  3. Poder Adquisitivo Real
                                </div>
                                <div
                                  className="mono"
                                  style={{
                                    fontSize: "1.1rem",
                                    fontWeight: 800,
                                    color: realReturnNet >= 0 ? "#f59e0b" : "#f87171",
                                    marginTop: 4,
                                  }}
                                >
                                  {realReturnNet >= 0 ? "+" : ""}${realReturnNet.toFixed(2)} (
                                  {realReturnPct >= 0 ? "+" : ""}
                                  {realReturnPct.toFixed(2)}%)
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "var(--text-muted)",
                                    marginTop: 2,
                                  }}
                                >
                                  Factor Inflación: -
                                  {((periodInflationFactor - 1) * 100).toFixed(2)}% ({period})
                                </div>
                              </div>
                            </div>

                            {/* FX Effect Isolated Block */}
                            {mainSettings.localCurrency &&
                              mainSettings.localCurrency !== (mainSettings.assetCurrency || "USD") && (
                                <div
                                  style={{
                                    marginTop: 12,
                                    padding: "10px 14px",
                                    background: "rgba(0, 229, 255, 0.04)",
                                    borderRadius: 8,
                                    border: "1px dashed rgba(0, 229, 255, 0.2)",
                                    fontSize: "0.78rem",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      color: "#00e5ff",
                                      marginBottom: 6,
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                      gap: 6,
                                    }}
                                  >
                                    <span>
                                      💱 Desglose Cambiario Aislado (
                                      {mainSettings.assetCurrency || "USD"} ➔{" "}
                                      {mainSettings.localCurrency || "COP"})
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "0.72rem",
                                        color: "var(--text-muted)",
                                        fontWeight: 400,
                                      }}
                                    >
                                      TRM Inicio: $
                                      {startFx.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                                      ➔ Hoy: $
                                      {currentFx.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      flexWrap: "wrap",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                                      Ganancia activo puro ({mainSettings.localCurrency || "COP"}):
                                    </span>
                                    <span
                                      className="mono"
                                      style={{
                                        fontWeight: 700,
                                        color: pureAssetGainCOP >= 0 ? "#4ade80" : "#f87171",
                                      }}
                                    >
                                      {pureAssetGainCOP >= 0 ? "+" : ""}$
                                      {pureAssetGainCOP.toLocaleString("en-US", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                      <span style={{ fontSize: "0.72rem", marginLeft: 4 }}>
                                        ({pureAssetGainCOPPct >= 0 ? "+" : ""}
                                        {pureAssetGainCOPPct.toFixed(2)}%)
                                      </span>
                                    </span>
                                    <span style={{ color: "var(--text-muted)" }}>➕</span>
                                    <span style={{ color: "#00e5ff", fontWeight: 600 }}>
                                      Efecto variación divisa:
                                    </span>
                                    <span
                                      className="mono"
                                      style={{
                                        fontWeight: 700,
                                        color: fxEffectCOP >= 0 ? "#4ade80" : "#f87171",
                                      }}
                                    >
                                      {fxEffectCOP >= 0 ? "+" : ""}$
                                      {fxEffectCOP.toLocaleString("en-US", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                      <span style={{ fontSize: "0.72rem", marginLeft: 4 }}>
                                        ({fxEffectCOPPct >= 0 ? "+" : ""}
                                        {fxEffectCOPPct.toFixed(2)}%)
                                      </span>
                                    </span>
                                    <span style={{ color: "var(--text-muted)" }}>🟰</span>
                                    <span style={{ color: "#f1f5f9", fontWeight: 700 }}>
                                      Ganancia Bruta {mainSettings.localCurrency || "COP"}:
                                    </span>
                                    <span
                                      className="mono"
                                      style={{
                                        fontWeight: 800,
                                        color: fxReturnNet >= 0 ? "#4ade80" : "#f87171",
                                      }}
                                    >
                                      {fxReturnNet >= 0 ? "+" : ""}$
                                      {fxReturnNet.toLocaleString("en-US", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </span>
                                  </div>
                                </div>
                              )}

                            {/* Explicit Deduction Equation Bar */}
                            <div
                              style={{
                                marginTop: 12,
                                padding: "10px 14px",
                                background: "rgba(245, 158, 11, 0.06)",
                                borderRadius: 8,
                                border: "1px dashed rgba(245, 158, 11, 0.25)",
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                fontSize: "0.78rem",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span style={{ color: "#00e5ff", fontWeight: 700 }}>
                                  Ganancia Bruta ({mainSettings.localCurrency || "COP"}):
                                </span>
                                <span
                                  className="mono"
                                  style={{
                                    color: fxReturnNet >= 0 ? "#4ade80" : "#f87171",
                                    fontWeight: 700,
                                  }}
                                >
                                  {fxReturnNet >= 0 ? "+" : ""}${fxReturnNet.toFixed(2)}
                                </span>
                                <span style={{ color: "var(--text-muted)" }}>➖</span>
                                <span style={{ color: "#f87171", fontWeight: 700 }}>
                                  Descuento Inflación (IPC):
                                </span>
                                <span
                                  className="mono"
                                  style={{ color: "#f87171", fontWeight: 700 }}
                                >
                                  -${inflationLossAmount.toFixed(2)} ({inflationLossPct.toFixed(2)}
                                  %)
                                </span>
                                <span style={{ color: "var(--text-muted)" }}>🟰</span>
                                <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                                  Ganancia Real Neta:
                                </span>
                                <span
                                  className="mono"
                                  style={{
                                    color: realReturnNet >= 0 ? "#f59e0b" : "#f87171",
                                    fontWeight: 800,
                                  }}
                                >
                                  {realReturnNet >= 0 ? "+" : ""}${realReturnNet.toFixed(2)} (
                                  {realReturnPct >= 0 ? "+" : ""}
                                  {realReturnPct.toFixed(2)}% Real)
                                </span>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </>
                );
              })()}

            {/* ── Main Portfolio Settings Modal ────────────────── */}
            {showMainSettingsModal && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(0,0,0,0.8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1000,
                  padding: 20,
                }}
              >
                <div
                  className="card fade-up"
                  style={{
                    width: "100%",
                    maxWidth: 450,
                    padding: 24,
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 20px 0",
                      color: "#f1f5f9",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    ⚙️ Configuración del Portafolio Principal
                  </h3>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          color: "var(--text-secondary)",
                          marginBottom: 8,
                        }}
                      >
                        Divisa del Activo
                      </label>
                      <select
                        value={mainSettings.assetCurrency || "USD"}
                        onChange={(e) =>
                          setMainPortfolioSettings({ assetCurrency: e.target.value })
                        }
                        className="input"
                        style={{ width: "100%" }}
                      >
                        <option value="USD">USD - Dólar</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="GBP">GBP - Libra</option>
                        <option value="COP">COP - Peso Col.</option>
                        <option value="MXN">MXN - Peso Mex.</option>
                        <option value="CLP">CLP - Peso Chi.</option>
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          color: "var(--text-secondary)",
                          marginBottom: 8,
                        }}
                      >
                        Divisa Local
                      </label>
                      <select
                        value={mainSettings.localCurrency || "COP"}
                        onChange={(e) =>
                          setMainPortfolioSettings({ localCurrency: e.target.value })
                        }
                        className="input"
                        style={{ width: "100%" }}
                      >
                        <option value="COP">COP - Peso Col.</option>
                        <option value="MXN">MXN - Peso Mex.</option>
                        <option value="CLP">CLP - Peso Chi.</option>
                        <option value="USD">USD - Dólar</option>
                        <option value="EUR">EUR - Euro</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                        marginBottom: 12,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={mainSettings.useAutoColInflation || false}
                        onChange={(e) =>
                          setMainPortfolioSettings({ useAutoColInflation: e.target.checked })
                        }
                      />
                      Usar Inflación Automática (Colombia, mensual)
                    </label>

                    {!mainSettings.useAutoColInflation && (
                      <>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.85rem",
                            color: "var(--text-secondary)",
                            marginBottom: 8,
                          }}
                        >
                          Inflación Anual Manual (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={mainSettings.inflationRate || 0}
                          onChange={(e) =>
                            setMainPortfolioSettings({
                              inflationRate: Number.parseFloat(e.target.value) || 0,
                            })
                          }
                          className="input"
                          style={{ width: "100%" }}
                        />
                      </>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setShowMainSettingsModal(false)}
                      className="btn btn-primary"
                      style={{ minWidth: 100 }}
                    >
                      Listo
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Chart Mode Tabs (Portafolio vs Acción Individual) ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  maxWidth: "100%",
                  overflowX: "auto",
                  background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.03)",
                  padding: "4px",
                  borderRadius: 10,
                  border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)"}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setMainChartViewTab("portfolio")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 14px",
                    borderRadius: 7,
                    border: mainChartViewTab === "portfolio"
                      ? `1px solid ${isLight ? "rgba(2, 132, 199, 0.4)" : "rgba(0, 229, 255, 0.4)"}`
                      : "1px solid transparent",
                    background: mainChartViewTab === "portfolio"
                      ? isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.12)"
                      : "transparent",
                    color: mainChartViewTab === "portfolio"
                      ? isLight ? "#0284c7" : "var(--accent-primary)"
                      : "var(--text-secondary)",
                    fontSize: "0.85rem",
                    fontWeight: mainChartViewTab === "portfolio" ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                >
                  <span>📊</span>
                  <span>Portafolio General (Kpital)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMainChartViewTab("individual")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 14px",
                    borderRadius: 7,
                    border: mainChartViewTab === "individual"
                      ? `1px solid ${isLight ? "rgba(16, 185, 129, 0.4)" : "rgba(16, 185, 129, 0.4)"}`
                      : "1px solid transparent",
                    background: mainChartViewTab === "individual"
                      ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.12)"
                      : "transparent",
                    color: mainChartViewTab === "individual"
                      ? isLight ? "#059669" : "#34d399"
                      : "var(--text-secondary)",
                    fontSize: "0.85rem",
                    fontWeight: mainChartViewTab === "individual" ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                >
                  <span>🔍</span>
                  <span>Acción Individual (Hora a Hora)</span>
                  {((holdings?.length || 0) + (navData?.closed_holdings?.length || 0)) > 0 && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: isLight ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.25)",
                        color: isLight ? "#047857" : "#34d399",
                        fontWeight: 700,
                      }}
                    >
                      {(holdings?.length || 0) + (navData?.closed_holdings?.length || 0)}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setMainChartViewTab("fx")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 14px",
                    borderRadius: 7,
                    border: mainChartViewTab === "fx"
                      ? `1px solid ${isLight ? "rgba(245, 158, 11, 0.5)" : "rgba(245, 158, 11, 0.5)"}`
                      : "1px solid transparent",
                    background: mainChartViewTab === "fx"
                      ? isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.15)"
                      : "transparent",
                    color: mainChartViewTab === "fx"
                      ? isLight ? "#d97706" : "#fbbf24"
                      : "var(--text-secondary)",
                    fontSize: "0.85rem",
                    fontWeight: mainChartViewTab === "fx" ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                  }}
                >
                  <span>💱</span>
                  <span>Divisa USD / COP</span>
                </button>
              </div>

              {/* Period selector (shown when viewing portfolio) */}
              {mainChartViewTab === "portfolio" && (
                <div className="period-selector fade-up" style={{ margin: 0 }}>
                  {PERIODS.map((p) => {
                    const isFx = mainChartViewTab === "fx";
                    const isEnabled = isFx || periodEnabled[p];
                    return (
                      <button
                        key={p}
                        className={`period-btn ${p === period ? "active" : ""}`}
                        onClick={() => setPeriod(p)}
                        disabled={!isEnabled}
                        title={
                          !isEnabled
                            ? "Requiere más historial desde tu primera inversión"
                            : undefined
                        }
                        style={{
                          opacity: isEnabled ? 1 : 0.35,
                          cursor: isEnabled ? "pointer" : "not-allowed",
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Main Chart Card ─────────────────────────────── */}
            <div className="card chart-card fade-up" style={{ minHeight: 480 }}>
              {loading ? (
                <QuantumOrbitalLoader
                  message={`Cargando simulación para período ${period}…`}
                  submessage="Transición cuántica de Schrödinger (orbitales 1s ➔ 2s ➔ 2p ➔ 3d ➔ 4f)"
                  height={480}
                />
              ) : error ? (
                <div
                  className="chart-error"
                  style={{
                    textAlign: "left",
                    padding: "24px 28px",
                    background: "rgba(239, 68, 68, 0.04)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  {error.backendError ? (
                    <div>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}
                      >
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 4,
                            background: "#ef4444",
                            color: "#fff",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                          }}
                        >
                          {error.backendError.error_type || "Python Error"}
                        </span>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "0.85rem",
                            color: "#fca5a5",
                          }}
                        >
                          {error.backendError.file}:{error.backendError.line}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "#fee2e2",
                          marginBottom: 12,
                        }}
                      >
                        {error.backendError.message}
                      </div>
                      {error.backendError.code && (
                        <div
                          style={{
                            background: "rgba(0,0,0,0.5)",
                            padding: "12px 16px",
                            borderRadius: 6,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "0.82rem",
                            color: "#fecaca",
                            borderLeft: "3px solid #ef4444",
                          }}
                        >
                          <span style={{ color: "#94a3b8", marginRight: 14 }}>
                            Línea {error.backendError.line}
                          </span>
                          <code>{error.backendError.code}</code>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: "#fca5a5", fontSize: "0.95rem" }}>
                      ⚠️ {error.message || String(error)}
                    </div>
                  )}
                </div>
              ) : mainChartViewTab === "fx" ? (
                <FxRateExplorer
                  defaultAsset="USD"
                  defaultLocal="COP"
                  period={period}
                  onPeriodChange={setPeriod}
                  purchaseDates={purchaseDates}
                  minDate={navData?.summary?.first_rebalance_date || navData?.nav?.[0]?.date || "2026-08-03"}
                />
              ) : mainChartViewTab === "individual" ? (
                <IndividualHoldingChart
                  holdings={holdings}
                  closedHoldings={navData?.closed_holdings}
                  rebalances={navData?.rebalances}
                  investment={investment}
                  numSlots={numSlots}
                  customStrategies={customStrategies}
                  activeStrategyId="historical"
                />
              ) : (
                <NavChart
                  strategyName={mode === "historical" ? "Titanes" : currentStrategyLabel}
                  navData={navData?.nav}
                  sp500Data={navData?.sp500}
                  nasdaqData={navData?.nasdaq}
                  investment={investment}
                  numSlots={numSlots}
                  period={period}
                  rebalances={navData?.rebalances}
                  summary={navData?.summary}
                  holdings={holdings}
                  onToggleTicker={toggleTicker}
                  selectAll={selectAll}
                  selectGainers={selectGainers}
                  selectLosers={selectLosers}
                  invertSelection={invertSelection}
                  isSimulating={isSimulating}
                  onRefresh={() => setRefreshKey((k) => k + 1)}
                  isRefreshing={loading}
                />
              )}
            </div>

            {/* ── Quantitative Intelligence & Allocation Grid ── */}
            {summary && !loading && (
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "var(--radius)",
                    marginBottom: showQuantIntelligence ? "14px" : 0,
                    cursor: "pointer",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                  onClick={() => setShowQuantIntelligence(!showQuantIntelligence)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      🧠 Inteligencia Cuantitativa & Métricas Institucionales (6 Módulos)
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400 }}>
                      Radar 360°, Sharpe, Sectores, Monte Carlo, Correlaciones, Rebalanceo
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowQuantIntelligence(!showQuantIntelligence);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      padding: "3px 10px",
                      color: "var(--text-secondary)",
                      fontSize: "0.72rem",
                      cursor: "pointer",
                    }}
                  >
                    {showQuantIntelligence ? "▲ Ocultar Métricas" : "▼ Expandir Métricas"}
                  </button>
                </div>

                {showQuantIntelligence && (
                  <>
                    {/* Row 1: Institutional Quant Suite, 360 Radar & Sector Allocation */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                        gap: "20px",
                        marginBottom: "20px",
                      }}
                    >
                      <QuantitativeCard summary={summary} />
                      <QuantRadar radar={navData?.radar} />
                      <SectorAllocation
                        holdings={navData?.holdings}
                        investment={investment}
                        numSlots={numSlots}
                      />
                    </div>

                    {/* Row 2: Monte Carlo Simulation & Correlation Heatmap & Rebalance Timer */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                        gap: "20px",
                      }}
                    >
                      <MonteCarloCard
                        monteCarlo={navData?.monte_carlo}
                        activeInvested={summary.active_invested}
                      />
                      <CorrelationHeatmap correlations={navData?.correlations} />
                      <RebalanceTimer rebalances={navData?.rebalances} holdings={navData?.holdings} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Banner de Monetización / Afiliados ───────────── */}
            <AffiliateBanner />

            {/* ── Bottom grid ───────────────────────────── */}
            <div className="bottom-grid">
              {/* Holdings table */}
              <div className="card fade-up" style={{ animationDelay: "100ms" }}>
                {navData?.holdings?.length > 0 || navData?.closed_holdings?.length > 0 ? (
                  <HoldingsTable
                    holdings={navData.holdings || []}
                    closedHoldings={navData.closed_holdings || []}
                    summary={navData.summary || {}}
                    investment={investment}
                    numSlots={numSlots}
                    onToggleTicker={toggleTicker}
                    unit={unit}
                    onToggleUnit={toggleUnit}
                    onOpenWasmLab={() => setShowWasmLabModal(true)}
                    onOpenWarren={() => setShowWarrenModal(true)}
                    onExportExcel={() => exportPortfolioExcel(mode, investment, numSlots)}
                    onExportPyScript={() => exportPortfolioPyScript(navData, investment)}
                    strategyId={mode}
                  />
                ) : loading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <div className="spinner" />
                  </div>
                ) : null}
              </div>

              {/* Portfolio manager */}
              <div className="card fade-up" style={{ animationDelay: "150ms" }}>
                <RebalanceManager onRefresh={() => setRefreshKey((k) => k + 1)} />
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── Main Portfolio Inflation Explorer Modal ────── */}
      <InflationExplorerModal
        isOpen={showMainInflationExplorer}
        onClose={() => setShowMainInflationExplorer(false)}
        inflationData={mainColInflationData}
      />

      {/* ── WarrenAI (Investing.com ProPicks) Modal ────── */}
      <WarrenAIModal
        isOpen={showWarrenModal}
        onClose={() => setShowWarrenModal(false)}
      />

      {/* ── WASM / Web Worker Simulation Lab Modal ────── */}
      <WasmNavSimulator
        isOpen={showWasmLabModal}
        onClose={() => setShowWasmLabModal(false)}
      />

      {/* ── Modal de Autenticación (Login / Registro / OAuth2) ── */}
      <AuthModal />

      {/* ── Mobile Bottom Navigation Bar (< 768px) ── */}
      <nav className="mobile-bottom-nav" aria-label="Navegación Móvil Principal">
        {/* 1. Estrategias */}
        <button
          type="button"
          className={`bottom-nav-item ${isStrategyMode ? "active" : ""}`}
          onClick={() => {
            setMobileStratModalOpen(true);
            setMobilePurchasesModalOpen(false);
          }}
          aria-label="Estrategias"
        >
          <span className="nav-icon">{isPro ? "📊" : "🔒"}</span>
          <span>{isPro ? "Estrategias" : "PRO"}</span>
        </button>

        {/* 2. Compras */}
        <button
          type="button"
          className={`bottom-nav-item ${isPurchaseMode ? "active" : ""}`}
          onClick={() => {
            setMobilePurchasesModalOpen(true);
            setMobileStratModalOpen(false);
          }}
          aria-label="Compras"
        >
          <span className="nav-icon">🛒</span>
          <span>Compras</span>
        </button>

        {/* 3. Renta Fija */}
        <button
          type="button"
          className={`bottom-nav-item ${mode === "fixed_income" ? "active" : ""}`}
          onClick={() => {
            setMode("fixed_income");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="Renta Fija y CDTs"
        >
          <span className="nav-icon">🏦</span>
          <span>Renta Fija</span>
        </button>

        {/* 4. Flujo de Caja */}
        <button
          type="button"
          className={`bottom-nav-item ${mode === "cash_flow" ? "active" : ""}`}
          onClick={() => {
            setMode("cash_flow");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="Flujo de Caja"
        >
          <span className="nav-icon">🌊</span>
          <span>Flujo</span>
        </button>

        {/* 5. Alternar Tema Diurno / Nocturno */}
        <button
          type="button"
          className="bottom-nav-item"
          onClick={toggleTheme}
          aria-label="Cambiar Tema"
        >
          <span className="nav-icon">{theme === "dark" ? "☀️" : "🌙"}</span>
          <span>{theme === "dark" ? "Diurno" : "Noche"}</span>
        </button>

        {/* 6. Perfil / Auth */}
        <button
          type="button"
          className="bottom-nav-item"
          onClick={() => {
            if (user) {
              setUserDropdownOpen((prev) => !prev);
            } else {
              openAuthModal("login");
            }
          }}
          aria-label="Perfil de usuario"
        >
          <span className="nav-icon">👤</span>
          <span>{user ? "Perfil" : "Acceder"}</span>
        </button>
      </nav>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="app-footer">
        Datos vía Yahoo Finance · 15min delay en live · Solo para análisis personal · No es
        asesoramiento financiero
      </footer>
    </div>
  );
}

function SummaryItem({ label, value, mono, large, muted }) {
  return (
    <div className="summary-item">
      <div className="summary-label">{label}</div>
      <div
        className={`summary-value ${mono ? "mono" : ""} ${large ? "large" : ""} ${muted ? "muted" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
