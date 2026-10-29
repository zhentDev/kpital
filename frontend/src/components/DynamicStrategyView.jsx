import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  createRebalance,
  deleteRebalance,
  updateRebalanceDateApi,
  fetchColInflationHistory,
  fetchFxHistory,
  fetchLiveQuotes,
  fetchNAV,
  fetchRebalances,
  fetchStockAlerts,
  searchTicker,
} from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";
import { toastConfirm } from "../utils/toastAlerts";
import CreateStrategyModal from "./CreateStrategyModal";
import InflationExplorerModal from "./InflationExplorerModal";
import StrategyChart, { SYNTHETIC_RETURNS } from "./StrategyChart";
import { DynamicDatePicker, InfoTooltip } from "./Common";
import QuantumOrbitalLoader from "./QuantumOrbitalLoader";
import HoldingsTable from "./HoldingsTable";
import IndividualHoldingChart from "./IndividualHoldingChart";
import FxRateExplorer from "./Common/FxRateExplorer";
import { exportPortfolioExcel } from "../utils/exportReport";
import { useTheme } from "../context/ThemeContext";

const PERIODS = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"];

export default function DynamicStrategyView({
  strategy,
  onDelete,
  onUpdate,
  onBack,
  onSelectStrategy,
  customStrategies,
  firstInvestDate,
}) {
  const [showEditModal, setShowEditModal] = useState(false);

  // Settings for currency and inflation
  const [stratSettings, setStratSettings] = useState({
    assetCurrency: "USD",
    localCurrency: "COP",
    inflationRate: 0,
    useAutoColInflation: false,
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInflationExplorer, setShowInflationExplorer] = useState(false);
  const [stratYieldViewMode, setStratYieldViewMode] = useState("USD");
  const [fxData, setFxData] = useState({ current: 1.0, history: {} });
  const [isFetchingFx, setIsFetchingFx] = useState(false);
  const [colInflationData, setColInflationData] = useState({
    history: {},
    latest: {},
    monthly_rates: [],
  });
  const [isFetchingInflation, setIsFetchingInflation] = useState(false);
  const [showBreakdownCard, setShowBreakdownCard] = useState(false);
  const [showQuantIntelligence, setShowQuantIntelligence] = useState(false);
  const [stratChartTab, setStratChartTab] = useState("portfolio"); // "portfolio" | "individual"

  const { theme } = useTheme();
  const isLight = theme === "light";

  useEffect(() => {
    if (
      stratSettings.assetCurrency &&
      stratSettings.localCurrency &&
      stratSettings.assetCurrency !== stratSettings.localCurrency
    ) {
      setIsFetchingFx(true);
      fetchFxHistory(stratSettings.assetCurrency, stratSettings.localCurrency)
        .then((res) => setFxData(res))
        .catch(console.error)
        .finally(() => setIsFetchingFx(false));
    } else {
      setFxData({ current: 1.0, history: {} });
      if (stratYieldViewMode === "FX") setStratYieldViewMode("USD");
    }
  }, [stratSettings.assetCurrency, stratSettings.localCurrency]);

  useEffect(() => {
    setIsFetchingInflation(true);
    fetchColInflationHistory()
      .then((res) => setColInflationData(res))
      .catch(console.error)
      .finally(() => setIsFetchingInflation(false));
  }, []);

  const {
    period: storePeriod,
    updateStrategyCapital,
    setStrategyRebalances,
    strategyRebalances,
    saveStrategySummary,
    saveLastKnownQuotes,
  } = usePortfolioStore();

  // Rebalance history for this specific custom strategy (Supabase SSOT)
  const [rebalances, setRebalances] = useState(() => {
    if (strategyRebalances?.[strategy.id]?.length > 0) {
      return strategyRebalances[strategy.id];
    }
    return [
      {
        rebalance_date: new Date().toISOString().split("T")[0],
        cash_added: 0,
        tickers: [],
      },
    ];
  });

  useEffect(() => {
    let isMounted = true;
    fetchRebalances(strategy.id)
      .then(async (data) => {
        if (!isMounted) return;
        if (Array.isArray(data) && data.length > 0) {
          setRebalances(data);
          setStrategyRebalances(strategy.id, data);
          const latestTickers = data[data.length - 1].tickers || [];
          setFormTickers([...latestTickers]);
          // Immediately request fresh NAV for this strategy with loaded rebalances
          fetchNAV({
            period,
            investment: simulatedCapital,
            numSlots,
            strategyId: strategy.id,
          })
            .then((nData) => {
              if (isMounted && nData) {
                setNavData(nData);
                setIsNavLoading(false);
                setLastRefreshedAt(new Date());
              }
            })
            .catch(() => {});
        } else {
          // Backend is empty for this strategy. If we have local rebalances with tickers, sync them!
          const localRebs = rebalances.filter((r) => Array.isArray(r.tickers) && r.tickers.length > 0);
          if (localRebs.length > 0) {
            for (const r of localRebs) {
              try {
                await createRebalance({
                  rebalance_date: r.rebalance_date || r.date,
                  cash_added: r.cash_added || 0,
                  tickers: r.tickers,
                  strategy_id: strategy.id,
                });
              } catch (err) {
                console.warn("Auto-sync rebalance failed", err);
              }
            }
          }
        }
      })
      .catch((e) => {
        console.warn("Could not fetch rebalances from backend for strategy", strategy.id, e);
      });
    return () => {
      isMounted = false;
    };
  }, [strategy.id]);

  // Fecha efectiva de inicio: la fecha del rebalanceo más antiguo registrado/editado, con fallback a firstInvestDate
  const effectiveFirstInvestDate = useMemo(() => {
    if (Array.isArray(rebalances) && rebalances.length > 0) {
      const dates = rebalances
        .map((r) => r.rebalance_date || r.date)
        .filter(Boolean);
      if (dates.length > 0) {
        return [...dates].sort()[0];
      }
    }
    return firstInvestDate;
  }, [rebalances, firstInvestDate]);

  // Real NAV data fetched from backend for this strategy
  const [navData, setNavData] = useState(null);
  const [isNavLoading, setIsNavLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [navRefreshKey, setNavRefreshKey] = useState(0);

  const purchaseDates = useMemo(() => {
    const dates = new Set();
    (rebalances || []).forEach((r) => {
      const d = r.rebalance_date || r.date;
      if (d) dates.add(String(d).split("T")[0]);
    });
    (navData?.holdings || []).forEach((h) => {
      const d = h.purchase_date || h.entry_date || h.date;
      if (d) dates.add(String(d).split("T")[0]);
    });
    (navData?.closed_holdings || []).forEach((h) => {
      const d = h.purchase_date || h.entry_date || h.date;
      if (d) dates.add(String(d).split("T")[0]);
    });
    return Array.from(dates).sort();
  }, [rebalances, navData]);

  // Umbrales de desbloqueo: un periodo se activa al tener al menos estos días de historial
  // desde la primera inversión. Escala progresiva: cada periodo se desbloquea con una fracción
  // de su ventana (p. ej. 1M desde la 1ra semana), evitando saltos bruscos entre niveles.
  const UNLOCK_DAYS = {
    "1D": 0,
    "1W": 1,
    "1M": 7,
    "3M": 30,
    "6M": 90,
    "1Y": 180,
    "3Y": 365,
    "5Y": 1095,
    MAX: 90,
  };
  const maxHistoryDaysRef = useRef(0);
  const periodEnabled = useMemo(() => {
    const map = {};
    if (effectiveFirstInvestDate) {
      const days = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(`${effectiveFirstInvestDate}T00:00:00Z`).getTime()) / 86400000,
        ),
      );
      if (days > maxHistoryDaysRef.current) {
        maxHistoryDaysRef.current = days;
      }
    }
    const availableDays = maxHistoryDaysRef.current > 0 ? maxHistoryDaysRef.current : Infinity;
    for (const p of PERIODS) map[p] = !effectiveFirstInvestDate || UNLOCK_DAYS[p] <= availableDays;
    return map;
  }, [effectiveFirstInvestDate]);

  // Periodo activo más alto disponible (excluyendo MAX si hay otros disponibles, o retrocediendo ordenadamente)
  const highestActivePeriod = useMemo(() => {
    const selectable = PERIODS.filter((p) => p !== "MAX");
    return [...selectable].reverse().find((p) => periodEnabled[p]) || "1W";
  }, [periodEnabled]);

  const [period, setPeriod] = useState(() =>
    periodEnabled[storePeriod] ? storePeriod : highestActivePeriod,
  );

  // Si el periodo actual deja de estar habilitado o al montar con datos válidos, asegurar que use el más alto activo
  useEffect(() => {
    if (periodEnabled && !periodEnabled[period]) {
      setPeriod(highestActivePeriod);
    }
  }, [highestActivePeriod, period, periodEnabled]);

  const [simulatedCapital, setLocalSimulatedCapital] = useState(
    () => strategy.activeInvested || 1000
  );

  const numSlots = strategy.numSlots || 20;
  const [unit, setUnit] = useState("pct");

  const [selectedTickers, setSelectedTickers] = useState(null); // null = all active by default

  // Form state to add new dated rebalance
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formTickers, setFormTickers] = useState(() => {
    return rebalances.length > 0 ? [...(rebalances[rebalances.length - 1].tickers || [])] : [];
  });
  const [selectedForDeletion, setSelectedForDeletion] = useState([]);
  const [editingRebalanceDate, setEditingRebalanceDate] = useState(null); // { oldDate: "2026-08-08", tempDate: "2026-08-08" }


  // Search & Batch paste input
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [batchInput, setBatchInput] = useState("");

  // Latest active rebalance
  const activeRebalance = rebalances[rebalances.length - 1] || {
    tickers: [],
    rebalance_date: date,
  };
  const activeTickers = activeRebalance.tickers || [];
  const slotValue = simulatedCapital / numSlots;
  const activeInvested = activeTickers.length * slotValue;
  const cashBuffer = simulatedCapital - activeInvested;
  const weightPerSlot = (100 / numSlots).toFixed(1);

  const [tickerMetadata, setTickerMetadata] = useState({});

  useEffect(() => {
    if (activeTickers.length > 0) {
      fetchLiveQuotes(activeTickers)
        .then((res) => {
          if (Array.isArray(res)) {
            const map = {};
            res.forEach((q) => {
              map[q.ticker] = q;
            });
            setTickerMetadata(map);
            if (typeof saveLastKnownQuotes === "function") {
              saveLastKnownQuotes(map);
            }
          }
        })
        .catch(console.error);
    }
  }, [activeTickers.join(","), saveLastKnownQuotes]);

  // Persist calculated NAV summary in global store for instant access in CashFlowHub
  useEffect(() => {
    if (strategy?.id && navData?.summary && typeof saveStrategySummary === "function") {
      saveStrategySummary(strategy.id, navData);
    }
  }, [strategy?.id, navData, saveStrategySummary]);

  // Sync to global store (NavChart needs this)
  useEffect(() => {
    if (strategy?.id) {
      updateStrategyCapital(strategy.id, simulatedCapital, activeInvested);
    }
  }, [simulatedCapital, activeInvested, strategy?.id, updateStrategyCapital]);

  useEffect(() => {
    let isMounted = true;

    const loadNAV = (isSilent = false) => {
      if (!isSilent) setIsNavLoading(true);
      fetchNAV({
        period,
        investment: simulatedCapital,
        numSlots,
        strategyId: strategy.id,
      })
        .then((data) => {
          if (isMounted) {
            setNavData(data);
            setIsNavLoading(false);
            setLastRefreshedAt(new Date());
          }
        })
        .catch((err) => {
          if (isMounted) {
            console.warn("Could not fetch real NAV for strategy", strategy.id, err);
            setIsNavLoading(false);
          }
        });
    };

    // Initial load
    loadNAV(false);

    // Auto-refresh interval:
    // When period === "1D", poll every 60 seconds (1 minute) for live hourly bars.
    // For other historical periods, poll every 60 minutes (3600 seconds).
    const pollIntervalMs = period === "1D" ? 60 * 1000 : 60 * 60 * 1000;
    const intervalId = setInterval(() => {
      loadNAV(true);
    }, pollIntervalMs);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [strategy?.id, period, simulatedCapital, numSlots, activeTickers.join(","), navRefreshKey]);

  useEffect(() => {
    const handleGlobalRefresh = () => {
      setNavRefreshKey((prev) => prev + 1);
    };
    window.addEventListener("refreshPortfolioCharts", handleGlobalRefresh);
    return () => window.removeEventListener("refreshPortfolioCharts", handleGlobalRefresh);
  }, []);

  const handleManualNavRefresh = useCallback(() => {
    if (isNavLoading) return;
    setNavRefreshKey((prev) => prev + 1);
    toast.success("Gráfica de estrategia actualizada", { id: "strat-nav-refresh" });
  }, [isNavLoading]);

  // Client-side instantaneous filtering & scaling when user toggles positions
  const { filteredNavData, filteredHoldings, effectiveActiveInvested, effectiveSlotValue } = useMemo(() => {
    const rawHoldings = navData?.holdings || [];
    const allHoldings = rawHoldings.length > 0
      ? rawHoldings
      : activeTickers.map((t) => ({
          ticker: t,
          shares: 1,
          current_price: tickerMetadata[t]?.price || 100,
          start_price: tickerMetadata[t]?.price || 100,
          unrealized_pnl: (tickerMetadata[t]?.change_pct || 0) >= 0 ? 1 : -1,
          return_pct: tickerMetadata[t]?.change_pct || 0,
        }));

    const currentSelected = selectedTickers ?? allHoldings.map((h) => h.ticker);
    const updatedHoldings = allHoldings.map((h) => ({
      ...h,
      selected: currentSelected.includes(h.ticker),
    }));

    const activeList = updatedHoldings.filter((h) => h.selected);
    const currSlotVal = slotValue;
    const computedActiveInvested = activeList.length * currSlotVal;

    if (!navData) {
      return {
        filteredNavData: null,
        filteredHoldings: updatedHoldings,
        effectiveActiveInvested: computedActiveInvested,
        effectiveSlotValue: currSlotVal,
      };
    }

    const defaultActiveInvested = navData?.summary?.active_invested || activeInvested || computedActiveInvested;
    const filterRatio = defaultActiveInvested > 0 ? computedActiveInvested / defaultActiveInvested : 1;
    const isAllSelected = !selectedTickers || activeList.length === allHoldings.length;

    const datePoints = navData.nav || [];
    const scaledNav = isAllSelected
      ? [...datePoints]
      : datePoints.map((pt) => ({
          ...pt,
          value: Number((pt.value * filterRatio).toFixed(4)),
          stock_value: typeof pt.stock_value === "number" ? Number((pt.stock_value * filterRatio).toFixed(4)) : undefined,
          active_invested: typeof pt.active_invested === "number"
            ? Number((pt.active_invested * filterRatio).toFixed(4))
            : computedActiveInvested,
        }));

    const scaledSP500 = [...(navData.sp500 || [])].map((pt) => ({
      ...pt,
      value: Number((pt.value * filterRatio).toFixed(4)),
    }));

    const scaledNasdaq = [...(navData.nasdaq || [])].map((pt) => ({
      ...pt,
      value: Number((pt.value * filterRatio).toFixed(4)),
    }));

    const scaledMm20 = [...(navData.mm20 || [])].map((pt) => ({
      ...pt,
      value: Number((pt.value * filterRatio).toFixed(4)),
    }));

    const scaledData = {
      ...navData,
      nav: scaledNav,
      sp500: scaledSP500,
      nasdaq: scaledNasdaq,
      mm20: scaledMm20,
      holdings: updatedHoldings,
      summary: {
        ...navData.summary,
        active_invested: computedActiveInvested,
      },
    };

    return {
      filteredNavData: scaledData,
      filteredHoldings: updatedHoldings,
      effectiveActiveInvested: computedActiveInvested,
      effectiveSlotValue: currSlotVal,
    };
  }, [navData, selectedTickers, activeTickers, tickerMetadata, slotValue, activeInvested]);

  const [alerts, setAlerts] = useState([]);

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
  }, [strategy.id]);

  const handleToggleTicker = (ticker) => {
    const all = (filteredHoldings || []).map((h) => h.ticker);
    const curr = selectedTickers ?? all;
    if (curr.includes(ticker)) {
      if (curr.length <= 1) {
        toast("Debes mantener al menos una posición activa", { icon: "⚠️" });
        return;
      }
      setSelectedTickers(curr.filter((t) => t !== ticker));
    } else {
      setSelectedTickers([...curr, ticker]);
    }
  };

  const handleSelectAll = () => {
    setSelectedTickers((filteredHoldings || []).map((h) => h.ticker));
  };

  const handleSelectGainers = () => {
    const gainers = (filteredHoldings || [])
      .filter((h) => (h.unrealized_pnl ?? h.return_pct ?? 0) >= 0)
      .map((h) => h.ticker);
    if (gainers.length === 0) {
      toast("No hay posiciones con ganancia activa", { icon: "ℹ️" });
      return;
    }
    setSelectedTickers(gainers);
  };

  const handleSelectLosers = () => {
    const losers = (filteredHoldings || [])
      .filter((h) => (h.unrealized_pnl ?? h.return_pct ?? 0) < 0)
      .map((h) => h.ticker);
    if (losers.length === 0) {
      toast("No hay posiciones en pérdida", { icon: "ℹ️" });
      return;
    }
    setSelectedTickers(losers);
  };

  const handleSelectWithAlerts = () => {
    const withAlerts = (filteredHoldings || [])
      .filter((h) => alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at))
      .map((h) => h.ticker);
    if (withAlerts.length === 0) {
      toast("No hay posiciones con alerta de venta activa", { icon: "ℹ️" });
      return;
    }
    setSelectedTickers(withAlerts);
  };

  const handleInvertSelection = () => {
    const all = (filteredHoldings || []).map((h) => h.ticker);
    const curr = selectedTickers ?? all;
    const inverted = all.filter((t) => !curr.includes(t));
    if (inverted.length === 0) {
      toast("La inversión dejaría 0 posiciones activas", { icon: "⚠️" });
      return;
    }
    setSelectedTickers(inverted);
  };

  // Compute real market returns instead of hardcoded percentages
  const currentReturns = useMemo(() => {
    let realStratReturn = null;
    let realSpReturn = null;
    let realNasdaqReturn = null;
    let realMm20Return = null;

    // 1. If backend returned summary metrics for this strategy
    const activeNav = filteredNavData || navData;
    if (activeNav?.summary) {
      if (typeof activeNav.summary.active_return_pct === "number" && !isNaN(activeNav.summary.active_return_pct)) {
        realStratReturn = activeNav.summary.active_return_pct / 100;
      }
      if (typeof activeNav.summary.sp500_return_pct === "number" && !isNaN(activeNav.summary.sp500_return_pct)) {
        realSpReturn = activeNav.summary.sp500_return_pct / 100;
      }
      if (typeof activeNav.summary.nasdaq_return_pct === "number" && !isNaN(activeNav.summary.nasdaq_return_pct)) {
        realNasdaqReturn = activeNav.summary.nasdaq_return_pct / 100;
      }
      if (typeof activeNav.summary.mm20_return_pct === "number" && !isNaN(activeNav.summary.mm20_return_pct)) {
        realMm20Return = activeNav.summary.mm20_return_pct / 100;
      }
    }

    // 2. Fallback for strategy return: compute from live quotes of active tickers if backend NAV series not yet generated
    if (realStratReturn === null && activeTickers.length > 0) {
      const validChanges = activeTickers
        .map((t) => tickerMetadata[t]?.change_pct)
        .filter((c) => typeof c === "number" && !isNaN(c));
      if (validChanges.length > 0) {
        const avgChangePct = validChanges.reduce((a, b) => a + b, 0) / validChanges.length;
        realStratReturn = avgChangePct / 100;
      }
    }

    // Pick appropriate benchmark return for strategy
    const isMidCap = strategy?.benchmark === "S&P MidCap 400" || strategy?.id === "strat_mm20";
    const benchmarkSpReturn = isMidCap ? (realMm20Return ?? realSpReturn) : realSpReturn;

    const baseSynthetic = SYNTHETIC_RETURNS[period] || SYNTHETIC_RETURNS["MAX"];

    return {
      sp: benchmarkSpReturn !== null ? benchmarkSpReturn : 0.0,
      nasdaq: realNasdaqReturn !== null ? realNasdaqReturn : 0.0,
      mm20: realMm20Return !== null ? realMm20Return : 0.0,
      strat: realStratReturn !== null ? realStratReturn : 0.0,
      days: baseSynthetic.days,
      points: baseSynthetic.points,
      isReal: realStratReturn !== null,
    };
  }, [filteredNavData, navData, period, activeTickers, tickerMetadata, strategy?.benchmark, strategy?.id]);

  const handleSearchAndAdd = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    const ticker = query.trim().toUpperCase();
    if (formTickers.includes(ticker)) {
      setSearchError(`${ticker} ya está en la lista`);
      return;
    }
    if (formTickers.length >= numSlots) {
      setSearchError(`Límite máximo de ${numSlots} slots alcanzado`);
      return;
    }

    setSearching(true);
    setSearchError("");
    try {
      const res = await searchTicker(ticker);
      if (res.valid) {
        setFormTickers((prev) => [...prev, res.ticker]);
        setQuery("");
      } else {
        setFormTickers((prev) => [...prev, ticker]);
        setQuery("");
      }
    } catch {
      setFormTickers((prev) => [...prev, ticker]);
      setQuery("");
    } finally {
      setSearching(false);
    }
  };

  const handleBatchAdd = () => {
    if (!batchInput.trim()) return;
    const extracted = batchInput
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0 && /^[A-Z0-9.-]+$/.test(t));

    const uniqueNew = extracted.filter((t) => !formTickers.includes(t));
    const combined = [...formTickers, ...uniqueNew].slice(0, numSlots);
    setFormTickers(combined);
    setBatchInput("");
  };

  const handleRemoveTicker = (tickerToRemove) => {
    setFormTickers((prev) => prev.filter((t) => t !== tickerToRemove));
    setSelectedForDeletion((prev) => prev.filter((t) => t !== tickerToRemove));
  };

  const toggleForDeletion = (ticker) => {
    setSelectedForDeletion((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker],
    );
  };

  const handleDeleteSelected = () => {
    setFormTickers((prev) => prev.filter((t) => !selectedForDeletion.includes(t)));
    setSelectedForDeletion([]);
  };

  const handleSaveRebalance = async () => {
    if (!date) {
      toast.error("Por favor selecciona una fecha válida");
      return;
    }
    if (formTickers.length === 0) {
      toast.error("Debes agregar al menos 1 posición al rebalanceo");
      return;
    }

    const updated = [
      ...rebalances.filter((r) => r.rebalance_date !== date),
      {
        rebalance_date: date,
        cash_added: 0,
        tickers: formTickers,
        strategy_id: strategy.id,
      },
    ].sort((a, b) => (a.rebalance_date > b.rebalance_date ? 1 : -1));

    setRebalances(updated);
    setStrategyRebalances(strategy.id, updated);

    try {
      await createRebalance({
        rebalance_date: date,
        cash_added: 0,
        tickers: formTickers,
        strategy_id: strategy.id,
      });
      toast.success(`Rebalanceo del ${date} guardado con éxito (${formTickers.length} posiciones)`);
    } catch (e) {
      console.warn("Backend save failed", e);
      toast.error(`Error guardando rebalanceo del ${date} en la nube`);
    } finally {
      // Refrescar inmediatamente los cálculos de NAV y la gráfica sin recargar la página
      setNavRefreshKey((prev) => prev + 1);
    }
  };

  const handleUpdateRebalanceDate = async (oldDate, newDate) => {
    if (!newDate || newDate === oldDate) {
      setEditingRebalanceDate(null);
      return;
    }
    const updated = rebalances.map((r) => {
      if (r.rebalance_date === oldDate) {
        return { ...r, rebalance_date: newDate, date: newDate };
      }
      return r;
    }).sort((a, b) => (a.rebalance_date > b.rebalance_date ? 1 : -1));

    setRebalances(updated);
    setStrategyRebalances(strategy.id, updated);
    setEditingRebalanceDate(null);

    try {
      await updateRebalanceDateApi(oldDate, newDate, strategy.id);
      toast.success(`Fecha actualizada de ${oldDate} a ${newDate}`);
    } catch (e) {
      console.warn("Backend date update failed", e);
      toast.error(`Error actualizando fecha a ${newDate}`);
    } finally {
      setNavRefreshKey((prev) => prev + 1);
    }
  };

  const handleDeleteRebalance = async (delDate) => {
    const isConfirmed = await toastConfirm(`¿Eliminar el rebalanceo de la fecha ${delDate}?`);
    if (!isConfirmed) return;
    const updated = rebalances.filter((r) => r.rebalance_date !== delDate);
    setRebalances(updated);
    setStrategyRebalances(strategy.id, updated);
    try {
      await deleteRebalance(delDate, strategy.id);
      toast.success(`Rebalanceo del ${delDate} eliminado`);
    } catch (e) {
      console.warn("Backend delete failed", e);
      toast.error(`Error eliminando rebalanceo del ${delDate}`);
    } finally {
      setNavRefreshKey((prev) => prev + 1);
    }
  };

  const handleDeleteStrategy = async () => {
    if (strategy.isSystem) {
      toast.error("Esta es una estrategia base del sistema y no puede eliminarse.");
      return;
    }
    const isConfirmed = await toastConfirm(
      `¿Estás seguro de eliminar por completo la estrategia "${strategy.name}"?`,
    );
    if (isConfirmed) {
      onDelete(strategy.id);
    }
  };

  // ── Slot Matrix Management: Colocar y Quitar acciones directamente ──
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [slotTargetIndex, setSlotTargetIndex] = useState(null);
  const [slotSearchQuery, setSlotSearchQuery] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const handleOpenSlotModal = (targetIndex = null) => {
    setSlotTargetIndex(targetIndex);
    setSlotSearchQuery("");
    setSlotModalOpen(true);
  };

  const handleCloseSlotModal = () => {
    setSlotModalOpen(false);
    setSlotTargetIndex(null);
    setSlotSearchQuery("");
    setIsAssigning(false);
  };

  const handleRemoveTickerFromSlot = async (tickerToRemove) => {
    if (!tickerToRemove) return;
    const isConfirmed = await toastConfirm(
      `¿Quitar ${tickerToRemove} de la estrategia "${strategy.name}"?\nEl slot de $${slotValue.toFixed(2)} (${weightPerSlot}%) pasará a reserva de liquidez (Cash Q).`
    );
    if (!isConfirmed) return;

    const latest = rebalances[rebalances.length - 1];
    if (!latest) return;

    const currentTickers = latest.tickers || [];
    const nextTickers = currentTickers.filter((t) => t !== tickerToRemove);

    const updated = rebalances.map((r, idx) =>
      idx === rebalances.length - 1 ? { ...r, tickers: nextTickers } : r
    );

    setRebalances(updated);
    setStrategyRebalances(strategy.id, updated);
    setFormTickers(nextTickers);

    try {
      await createRebalance({
        rebalance_date: latest.rebalance_date || date,
        cash_added: latest.cash_added || 0,
        tickers: nextTickers,
        strategy_id: strategy.id,
      });
      toast.success(`Acción ${tickerToRemove} retirada del slot. Capital liberado a Cash Q.`);
    } catch (e) {
      console.warn("Backend update failed", e);
      toast.error(`Error retirando acción ${tickerToRemove}`);
    } finally {
      setNavRefreshKey((prev) => prev + 1);
    }
  };

  const handleAssignTickerToSlot = async (tickerCandidate, targetIndex = null) => {
    const cleanTicker = (tickerCandidate || "").trim().toUpperCase();
    if (!cleanTicker) return;

    const latest = rebalances[rebalances.length - 1] || {
      rebalance_date: date,
      cash_added: 0,
      tickers: [],
      strategy_id: strategy.id,
    };

    const currentTickers = [...(latest.tickers || [])];
    let nextTickers;

    if (targetIndex !== null && targetIndex < currentTickers.length) {
      // Reemplazo en slot específico ocupado
      if (currentTickers[targetIndex] === cleanTicker) {
        toast("El ticker ya ocupa este slot", { icon: "ℹ️" });
        handleCloseSlotModal();
        return;
      }
      if (currentTickers.includes(cleanTicker)) {
        toast.error(`El ticker ${cleanTicker} ya está presente en la estrategia`);
        return;
      }
      nextTickers = [...currentTickers];
      nextTickers[targetIndex] = cleanTicker;
    } else {
      // Asignación a slot vacío o añadir
      if (currentTickers.includes(cleanTicker)) {
        toast.error(`El ticker ${cleanTicker} ya está presente en la estrategia`);
        return;
      }
      if (currentTickers.length >= numSlots) {
        toast.error(`Límite máximo de ${numSlots} slots alcanzado`);
        return;
      }
      nextTickers = [...currentTickers, cleanTicker];
    }

    setIsAssigning(true);
    try {
      try {
        await searchTicker(cleanTicker);
      } catch (err) {
        console.warn("Search validation warning", err);
      }

      const updated =
        rebalances.length > 0
          ? rebalances.map((r, idx) =>
              idx === rebalances.length - 1 ? { ...r, tickers: nextTickers } : r
            )
          : [{ ...latest, tickers: nextTickers }];

      setRebalances(updated);
      setStrategyRebalances(strategy.id, updated);
      setFormTickers(nextTickers);

      try {
        await createRebalance({
          rebalance_date: latest.rebalance_date || date,
          cash_added: latest.cash_added || 0,
          tickers: nextTickers,
          strategy_id: strategy.id,
        });
        toast.success(
          targetIndex !== null && targetIndex < currentTickers.length
            ? `Reemplazado por ${cleanTicker} en el Slot ${targetIndex + 1}`
            : `Acción ${cleanTicker} colocada en el Slot ${nextTickers.length}`
        );
      } catch (e) {
        console.warn("Backend update failed, updated locally", e);
        toast.success(`Acción ${cleanTicker} asignada localmente`);
      }

      handleCloseSlotModal();
    } finally {
      setIsAssigning(false);
      setNavRefreshKey((prev) => prev + 1);
    }
  };

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Strategy Header ──────────────────────────── */}
      <div
        className="card"
        style={{
          padding: "24px",
          background: isLight
            ? "var(--bg-card)"
            : `linear-gradient(135deg, ${strategy.color}14 0%, rgba(0, 0, 0, 0.4) 100%)`,
          border: isLight ? "1px solid var(--border)" : `1px solid ${strategy.color}40`,
          boxShadow: isLight ? "var(--shadow-card)" : "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: "1.5rem" }}>{strategy.country || "🌎"}</span>
            <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "var(--text-primary)" }}>
              {strategy.name}
            </h2>

            {onSelectStrategy && (
              <select
                value={strategy.id}
                onChange={(e) => onSelectStrategy(e.target.value)}
                style={{
                  background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.08)",
                  border: isLight ? "1px solid var(--border)" : "1px solid var(--border-accent)",
                  borderRadius: 8,
                  color: isLight ? "#0284c7" : "var(--accent-primary)",
                  padding: "4px 10px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  outline: "none",
                }}
                title="Cambiar de Estrategia"
              >
                <option value="historical" style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}>
                  🏆 Kpital Tech (CORE)
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
            )}
            {strategy.isRealMoney ? (
              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: "6px",
                  background: isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)",
                  color: isLight ? "#047857" : "#34d399",
                  border: isLight ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid rgba(16, 185, 129, 0.5)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  boxShadow: isLight ? "0 1px 4px rgba(16, 185, 129, 0.15)" : "0 0 10px rgba(16, 185, 129, 0.3)",
                }}
              >
                <span>🟢</span> 💵 DINERO REAL
              </span>
            ) : (
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: isLight ? "rgba(124, 58, 237, 0.1)" : "rgba(168, 85, 247, 0.15)",
                  color: isLight ? "#7c3aed" : "#c084fc",
                  border: isLight ? "1px solid rgba(124, 58, 237, 0.3)" : "1px solid rgba(168, 85, 247, 0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>🧪</span> SIMULACIÓN / PROPICKS
              </span>
            )}
            {strategy.isSystem && (
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: `${strategy.color}33`,
                  color: strategy.color,
                  border: `1px solid ${strategy.color}4D`,
                }}
              >
                PRO
              </span>
            )}
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 800,
                padding: "2px 8px",
                borderRadius: "4px",
                background: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)",
                color: isLight ? "#334155" : "#fff",
                border: isLight ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.2)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {numSlots} SLOTS
              <InfoTooltip conceptKey="active_invested" size="sm" />
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "2px 8px",
                borderRadius: "4px",
                background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.15)",
                color: isLight ? "#b45309" : "#fbbf24",
                fontWeight: 600,
                border: isLight ? "1px solid rgba(245, 158, 11, 0.25)" : "none",
              }}
            >
              Benchmark: {strategy.benchmark || "S&P 500"}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            {strategy.isRealMoney
              ? `Portafolio de dinero real activo con ${numSlots} posiciones equiponderadas (${weightPerSlot}% por slot).`
              : `Estrategia simulada / modelo con ${numSlots} posiciones equiponderadas (${weightPerSlot}% por slot).`}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: isLight ? "var(--bg-card)" : "var(--bg-surface)",
              padding: "6px 14px",
              borderRadius: "var(--radius)",
              border: strategy.isRealMoney
                ? (isLight ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(16, 185, 129, 0.5)")
                : "1px solid var(--border)",
              boxShadow: strategy.isRealMoney
                ? (isLight ? "0 2px 8px rgba(16, 185, 129, 0.1)" : "0 0 12px rgba(16, 185, 129, 0.15)")
                : "none",
            }}
          >
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {strategy.isRealMoney ? "Capital Real Invertido:" : "Capital Simulado:"}
            </span>
            <span style={{ color: strategy.isRealMoney ? (isLight ? "#047857" : "#10b981") : strategy.color, fontWeight: 700 }}>$</span>
            <input
              type="number"
              min={1}
              step="any"
              value={simulatedCapital}
              onChange={(e) => setLocalSimulatedCapital(e.target.value === "" ? "" : Number(e.target.value))}
              style={{
                width: 90,
                background: isLight ? "var(--bg-surface)" : "rgba(0,0,0,0.25)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "3px 8px",
                color: strategy.isRealMoney ? (isLight ? "#047857" : "#34d399") : strategy.color,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.9rem",
                textAlign: "right",
              }}
            />
          </div>

          <div
            className="unit-toggle"
            onClick={() => setUnit((u) => (u === "pct" ? "usd" : "pct"))}
          >
            <button
              className={`unit-btn ${unit === "pct" ? "active" : ""}`}
              style={unit === "pct" ? { color: strategy.color } : {}}
            >
              %
            </button>
            <button
              className={`unit-btn ${unit === "usd" ? "active" : ""}`}
              style={unit === "usd" ? { color: strategy.color } : {}}
            >
              $
            </button>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setShowEditModal(true)}
            style={{
              padding: "6px 12px",
              fontSize: "0.75rem",
              fontWeight: 700,
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            title="Modificar parámetros de esta estrategia"
          >
            ✏️ Modificar Estrategia
          </button>

          {!strategy.isSystem && (
            <button
              className="btn btn-sm btn-danger"
              onClick={handleDeleteStrategy}
              style={{ padding: "6px 12px", fontSize: "0.75rem", fontWeight: 700 }}
              title="Eliminar esta estrategia personalizada"
            >
              🗑️ Eliminar Estrategia
            </button>
          )}
        </div>
      </div>

      {/* ── Modal Modificador de Estrategia ─────────────── */}
      <CreateStrategyModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        editStrategy={strategy}
        onUpdate={onUpdate}
      />

      {/* ── Yield View Controls for Strategy (Nominal / Divisa / Real) ── */}
      <div
        className="fade-up"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
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
            onClick={() => setStratYieldViewMode("USD")}
            style={{
              padding: "6px 16px",
              borderRadius: 16,
              border: "none",
              background: stratYieldViewMode === "USD" ? "var(--bg-card)" : "transparent",
              color: stratYieldViewMode === "USD" ? "var(--accent-primary)" : "var(--text-secondary)",
              boxShadow: stratYieldViewMode === "USD" ? "var(--shadow-card)" : "none",
              fontSize: "0.8rem",
              fontWeight: stratYieldViewMode === "USD" ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Nominal ({stratSettings.assetCurrency || "USD"})
          </button>
          <button
            onClick={() => {
              if (
                stratSettings.localCurrency &&
                stratSettings.localCurrency !== (stratSettings.assetCurrency || "USD")
              ) {
                setStratYieldViewMode("FX");
              } else if (stratSettings.localCurrency) {
                setStratYieldViewMode("FX");
              } else {
                toast("Configura tu Divisa Local en ⚙️ primero.", { icon: "ℹ️" });
              }
            }}
            style={{
              padding: "6px 16px",
              borderRadius: 16,
              border: "none",
              background: stratYieldViewMode === "FX" ? "var(--bg-card)" : "transparent",
              color: stratYieldViewMode === "FX" ? "var(--accent-primary)" : "var(--text-secondary)",
              boxShadow: stratYieldViewMode === "FX" ? "var(--shadow-card)" : "none",
              fontSize: "0.8rem",
              fontWeight: stratYieldViewMode === "FX" ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Divisa ({stratSettings.localCurrency || "COP"}){" "}
            {isFetchingFx && stratYieldViewMode === "FX" && "⏳"}
          </button>
          <button
            onClick={() => {
              if (stratSettings.useAutoColInflation || stratSettings.inflationRate > 0) {
                setStratYieldViewMode("REAL");
              } else {
                toast("Configura la Inflación en ⚙️ primero.", { icon: "ℹ️" });
              }
            }}
            style={{
              padding: "6px 16px",
              borderRadius: 16,
              border: "none",
              background:
                stratYieldViewMode === "REAL" ? "var(--bg-card)" : "transparent",
              color: stratYieldViewMode === "REAL" ? "#d97706" : "var(--text-secondary)",
              boxShadow: stratYieldViewMode === "REAL" ? "var(--shadow-card)" : "none",
              fontSize: "0.8rem",
              fontWeight: stratYieldViewMode === "REAL" ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Poder Adquisitivo Real {isFetchingInflation && stratYieldViewMode === "REAL" && "⏳"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setShowInflationExplorer(true)}
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
            {colInflationData.latest?.yoy ? `${colInflationData.latest.yoy}%` : "Colombia"})
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
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

      {(() => {
        let fxMult = 1.0;
        if (stratYieldViewMode !== "USD") {
          fxMult = fxData.current || 1.0;
        }

        let inflationFactor = 1.0;
        if (stratYieldViewMode === "REAL") {
          if (
            stratSettings.useAutoColInflation &&
            colInflationData.history &&
            Object.keys(colInflationData.history).length > 0
          ) {
            const dates = Object.keys(colInflationData.history).sort();
            const cpiCurrent = colInflationData.history[dates[dates.length - 1]];
            const pastDates = dates.slice(0, Math.max(1, dates.length - 12));
            const cpiStart =
              pastDates.length > 0 ? colInflationData.history[pastDates[0]] : cpiCurrent;
            if (cpiStart && cpiCurrent) {
              inflationFactor = cpiCurrent / cpiStart;
            }
          } else if (stratSettings.inflationRate > 0) {
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
                            : 3 / 12; // MAX equivale al horizonte real de 3M
            inflationFactor = Math.pow(1 + stratSettings.inflationRate / 100, years);
          }
        }

        const rawInvested = activeInvested;
        const investedAdjusted = rawInvested * (stratYieldViewMode !== "USD" ? fxMult : 1.0);

        const rawStockVal = rawInvested * (1 + currentReturns.strat);
        const currentStockValueAdjusted =
          (rawStockVal * (stratYieldViewMode !== "USD" ? fxMult : 1.0)) / inflationFactor;

        const netReturnAdjusted = currentStockValueAdjusted - investedAdjusted;
        const returnPctAdjusted = investedAdjusted > 0 ? netReturnAdjusted / investedAdjusted : 0;

        const currSymbol =
          stratYieldViewMode === "USD"
            ? stratSettings.assetCurrency || "USD"
            : stratSettings.localCurrency || "COP";

        return (
          <div className="summary-strip fade-up">
            <div className="summary-item">
              <div className="summary-label">
                Rentabilidad {strategy.name} ({stratYieldViewMode === "REAL" ? "Real" : period})
              </div>
              <div
                className="summary-value large mono"
                style={{
                  color: returnPctAdjusted >= 0 ? "var(--gain)" : "var(--loss)",
                  fontWeight: 800,
                }}
              >
                {unit === "pct"
                  ? `${returnPctAdjusted >= 0 ? "+" : ""}${(returnPctAdjusted * 100).toFixed(1)}%`
                  : `${netReturnAdjusted >= 0 ? "+" : "-"}$${Math.abs(netReturnAdjusted).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <div className="summary-label">
                Benchmark ({strategy.benchmark}) ({period})
              </div>
              <div className="summary-value mono" style={{ color: "#fbbf24", fontWeight: 700 }}>
                {unit === "pct"
                  ? `${currentReturns[strategy.benchmark === "NASDAQ" ? "nasdaq" : "sp"] >= 0 ? "+" : ""}${(currentReturns[strategy.benchmark === "NASDAQ" ? "nasdaq" : "sp"] * 100).toFixed(1)}%`
                  : `${currentReturns[strategy.benchmark === "NASDAQ" ? "nasdaq" : "sp"] >= 0 ? "+" : "-"}$${Math.abs(investedAdjusted * currentReturns[strategy.benchmark === "NASDAQ" ? "nasdaq" : "sp"]).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <div className="summary-label">
                Capital Activo ({activeTickers.length}/{numSlots} Slots - {currSymbol})
              </div>
              <div
                className="summary-value mono large"
                style={{ color: strategy.color, fontWeight: 800 }}
              >
                {unit === "pct"
                  ? `${((activeTickers.length / numSlots) * 100).toFixed(1)}%`
                  : `$${investedAdjusted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div className="summary-divider" />
            <div className="summary-item">
              <div className="summary-label">Regla de Asignación</div>
              <div
                className="summary-value mono"
                style={{ color: strategy.color, fontWeight: 700 }}
              >
                {weightPerSlot}% / slot ($
                {(slotValue * (stratYieldViewMode !== "USD" ? fxMult : 1.0)).toFixed(2)})
              </div>
            </div>

            {navData?.summary?.total_realized_pnl !== undefined && (navData.summary.closed_count > 0 || navData.summary.total_realized_pnl !== 0) && (
              <>
                <div className="summary-divider" />
                <div className="summary-item">
                  <div className="summary-label">
                    Ganancia Realizada ({navData.summary.closed_count} Cerradas)
                  </div>
                  <div
                    className="summary-value mono"
                    style={{
                      color: (navData.summary.total_realized_pnl || 0) >= 0 ? "#10b981" : "#f43f5e",
                      fontWeight: 700,
                    }}
                  >
                    {(navData.summary.total_realized_pnl || 0) >= 0 ? "+" : ""}$
                    {(Number(navData.summary.total_realized_pnl || 0) * (stratYieldViewMode !== "USD" ? fxMult : 1.0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── 3-Level Comparative Breakdown Card (Nominal vs Divisa vs Real) ── */}
      {(() => {
        const nomInvested = activeInvested;
        const nomReturnUsd = nomInvested * (currentReturns.strat || 0);
        const nomReturnPct = (currentReturns.strat || 0) * 100;

        const currentFx = fxData.current || 1.0;
        const fxMult = currentFx;
        let startFx = currentFx;
        const startDate =
          firstInvestDate || navData?.[0]?.date || strategy?.createdAt?.slice(0, 10);
        if (startDate && fxData.history && Object.keys(fxData.history).length > 0) {
          if (fxData.history[startDate]) {
            startFx = fxData.history[startDate];
          } else {
            const histDates = Object.keys(fxData.history).sort();
            const pastDates = histDates.filter((d) => d <= startDate);
            if (pastDates.length > 0) {
              startFx = fxData.history[pastDates[pastDates.length - 1]];
            } else if (histDates.length > 0) {
              startFx = fxData.history[0];
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
        const fxStockVal = (nomInvested + nomReturnUsd) * currentFx;
        const fxReturnNet = fxStockVal - fxInvested;
        const fxReturnPct = fxInvested > 0 ? (fxReturnNet / fxInvested) * 100 : 0;

        let inflationFactor = 1.0;
        if (stratSettings.useAutoColInflation && colInflationData.latest?.yoy) {
          const yoy = colInflationData.latest.yoy;
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
                          : 3 / 12; // MAX equivale a 3M
          inflationFactor = Math.pow(1 + yoy / 100, years);
        } else if (stratSettings.inflationRate > 0) {
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
                          : 3 / 12; // MAX equivale a 3M
          inflationFactor = Math.pow(1 + stratSettings.inflationRate / 100, years);
        }

        const realStockVal = fxStockVal / inflationFactor;
        const realReturnNet = realStockVal - fxInvested;
        const realReturnPct = fxInvested > 0 ? (realReturnNet / fxInvested) * 100 : 0;

        const inflationLossAmount = fxStockVal - realStockVal;
        const inflationLossPct = fxInvested > 0 ? (inflationLossAmount / fxInvested) * 100 : 0;

        return (
          <div
            className="fade-up"
            style={{
              marginTop: 12,
              marginBottom: 16,
              padding: "14px 20px",
              background: isLight ? "var(--bg-card)" : "rgba(0,0,0,0.25)",
              borderRadius: "var(--radius)",
              border: isLight ? "1px solid var(--border)" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: isLight ? "var(--shadow-card)" : "none",
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
                <span>📊 Comparativa de Rendimiento Multinivel (Nominal ➔ Divisa ➔ Real)</span>
                <span
                  style={{
                    fontSize: "0.74rem",
                    color: isLight ? "#b45309" : "#f59e0b",
                    background: isLight ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.1)",
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  {stratSettings.useAutoColInflation
                    ? "IPC Automático (FRED/DANE)"
                    : `Inflación Manual ${stratSettings.inflationRate || 0}%/año`}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBreakdownCard(!showBreakdownCard);
                }}
                style={{
                  background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
                  border: isLight ? "1px solid var(--border)" : "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  padding: "3px 10px",
                  color: "var(--text-muted)",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {showBreakdownCard ? "▲ Ocultar" : "▼ Desplegar"}
              </button>
            </div>
            {showBreakdownCard && (
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
                  background: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
                  borderRadius: 8,
                  border: isLight ? "1px solid var(--border)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: isLight ? "#64748b" : "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                  1. Nominal ({stratSettings.assetCurrency || "USD"})
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: nomReturnUsd >= 0 ? (isLight ? "#16a34a" : "#4ade80") : (isLight ? "#dc2626" : "#f87171"),
                    marginTop: 4,
                  }}
                >
                  {nomReturnUsd >= 0 ? "+" : ""}${nomReturnUsd.toFixed(2)} (
                  {nomReturnPct >= 0 ? "+" : ""}
                  {nomReturnPct.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Crecimiento puro en moneda del activo
                </div>
              </div>

              {/* Level 2: FX Adjusted */}
              <div
                style={{
                  padding: 10,
                  background: isLight ? "rgba(2, 132, 199, 0.05)" : "rgba(0, 229, 255, 0.03)",
                  borderRadius: 8,
                  border: isLight ? "1px solid rgba(2, 132, 199, 0.2)" : "1px solid rgba(0, 229, 255, 0.15)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: isLight ? "#0284c7" : "#00e5ff", textTransform: "uppercase", fontWeight: 700 }}>
                  2. Al Cambio Divisa ({stratSettings.localCurrency || "COP"})
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: fxReturnNet >= 0 ? (isLight ? "#16a34a" : "#4ade80") : (isLight ? "#dc2626" : "#f87171"),
                    marginTop: 4,
                  }}
                >
                  {fxReturnNet >= 0 ? "+" : ""}${fxReturnNet.toFixed(2)} (
                  {fxReturnPct >= 0 ? "+" : ""}
                  {fxReturnPct.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Tipo de cambio: ${fxMult.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* Level 3: Real Purchasing Power */}
              <div
                style={{
                  padding: 10,
                  background: isLight ? "rgba(245, 158, 11, 0.05)" : "rgba(245, 158, 11, 0.03)",
                  borderRadius: 8,
                  border: isLight ? "1px solid rgba(245, 158, 11, 0.25)" : "1px solid rgba(245, 158, 11, 0.15)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: isLight ? "#b45309" : "#f59e0b", textTransform: "uppercase", fontWeight: 700 }}>
                  3. Poder Adquisitivo Real
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 800,
                    color: realReturnNet >= 0 ? (isLight ? "#d97706" : "#f59e0b") : (isLight ? "#dc2626" : "#f87171"),
                    marginTop: 4,
                  }}
                >
                  {realReturnNet >= 0 ? "+" : ""}${realReturnNet.toFixed(2)} (
                  {realReturnPct >= 0 ? "+" : ""}
                  {realReturnPct.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Factor Inflación: -{((inflationFactor - 1) * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* FX Effect Isolated Block */}
            {stratSettings.localCurrency &&
              stratSettings.localCurrency !== (stratSettings.assetCurrency || "USD") && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    background: isLight ? "rgba(2, 132, 199, 0.05)" : "rgba(0, 229, 255, 0.04)",
                    borderRadius: 8,
                    border: isLight ? "1px dashed rgba(2, 132, 199, 0.25)" : "1px dashed rgba(0, 229, 255, 0.2)",
                    fontSize: "0.78rem",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: isLight ? "#0284c7" : "#00e5ff",
                      marginBottom: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <span>
                      💱 Desglose Cambiario Aislado ({stratSettings.assetCurrency || "USD"} ➔{" "}
                      {stratSettings.localCurrency || "COP"})
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
                      ➔ Hoy: ${currentFx.toLocaleString("en-US", { maximumFractionDigits: 2 })}
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
                    <span style={{ color: isLight ? "#475569" : "#94a3b8", fontWeight: 600 }}>
                      Ganancia activo puro ({stratSettings.localCurrency || "COP"}):
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontWeight: 700,
                        color: pureAssetGainCOP >= 0 ? (isLight ? "#16a34a" : "#4ade80") : (isLight ? "#dc2626" : "#f87171"),
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
                    <span style={{ color: isLight ? "#0284c7" : "#00e5ff", fontWeight: 600 }}>
                      Efecto variación divisa:
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontWeight: 700,
                        color: fxEffectCOP >= 0 ? (isLight ? "#16a34a" : "#4ade80") : (isLight ? "#dc2626" : "#f87171"),
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
                    <span style={{ color: isLight ? "#0f172a" : "#f1f5f9", fontWeight: 700 }}>
                      Ganancia Bruta {stratSettings.localCurrency || "COP"}:
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontWeight: 800,
                        color: fxReturnNet >= 0 ? (isLight ? "#16a34a" : "#4ade80") : (isLight ? "#dc2626" : "#f87171"),
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
                background: isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.06)",
                borderRadius: 8,
                border: isLight ? "1px dashed rgba(245, 158, 11, 0.35)" : "1px dashed rgba(245, 158, 11, 0.25)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: "0.78rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: isLight ? "#0284c7" : "#00e5ff", fontWeight: 700 }}>
                  Ganancia Bruta ({stratSettings.localCurrency || "COP"}):
                </span>
                <span
                  className="mono"
                  style={{ color: fxReturnNet >= 0 ? (isLight ? "#16a34a" : "#4ade80") : (isLight ? "#dc2626" : "#f87171"), fontWeight: 700 }}
                >
                  {fxReturnNet >= 0 ? "+" : ""}${fxReturnNet.toFixed(2)}
                </span>
                <span style={{ color: "var(--text-muted)" }}>➖</span>
                <span style={{ color: isLight ? "#dc2626" : "#f87171", fontWeight: 700 }}>
                  Descuento Inflación (IPC):
                </span>
                <span className="mono" style={{ color: isLight ? "#dc2626" : "#f87171", fontWeight: 700 }}>
                  -${inflationLossAmount.toFixed(2)} ({inflationLossPct.toFixed(2)}%)
                </span>
                <span style={{ color: "var(--text-muted)" }}>🟰</span>
                <span style={{ color: isLight ? "#b45309" : "#f59e0b", fontWeight: 700 }}>Ganancia Real Neta:</span>
                <span
                  className="mono"
                  style={{ color: realReturnNet >= 0 ? (isLight ? "#d97706" : "#f59e0b") : (isLight ? "#dc2626" : "#f87171"), fontWeight: 800 }}
                >
                  {realReturnNet >= 0 ? "+" : ""}${realReturnNet.toFixed(2)} (
                  {realReturnPct >= 0 ? "+" : ""}
                  {realReturnPct.toFixed(2)}% Real)
                </span>
              </div>
            </div>
          </>
        )}
          </div>
        );
      })()}

      {/* ── Settings Modal ────────────────────────────── */}
      {showSettingsModal && (
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
              ⚙️ Configuración: {strategy.name}
            </h3>

            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
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
                  value={stratSettings.assetCurrency || "USD"}
                  onChange={(e) =>
                    setStratSettings((prev) => ({ ...prev, assetCurrency: e.target.value }))
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
                  value={stratSettings.localCurrency || "COP"}
                  onChange={(e) =>
                    setStratSettings((prev) => ({ ...prev, localCurrency: e.target.value }))
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
                  checked={stratSettings.useAutoColInflation || false}
                  onChange={(e) =>
                    setStratSettings((prev) => ({ ...prev, useAutoColInflation: e.target.checked }))
                  }
                />
                Usar Inflación Automática (Colombia, mensual)
              </label>

              {!stratSettings.useAutoColInflation && (
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
                    value={stratSettings.inflationRate || 0}
                    onChange={(e) =>
                      setStratSettings((prev) => ({
                        ...prev,
                        inflationRate: Number.parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="input"
                    style={{ width: "100%" }}
                  />
                </>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="btn btn-primary"
                style={{ minWidth: 100 }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inflation Explorer Modal ──────────────────── */}
      <InflationExplorerModal
        isOpen={showInflationExplorer}
        onClose={() => setShowInflationExplorer(false)}
        inflationData={colInflationData}
        startDate={effectiveFirstInvestDate}
      />

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
            onClick={() => setStratChartTab("portfolio")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 14px",
              borderRadius: 7,
              border: stratChartTab === "portfolio"
                ? `1px solid ${isLight ? "rgba(2, 132, 199, 0.4)" : "rgba(0, 229, 255, 0.4)"}`
                : "1px solid transparent",
              background: stratChartTab === "portfolio"
                ? isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.12)"
                : "transparent",
              color: stratChartTab === "portfolio"
                ? isLight ? "#0284c7" : "var(--accent-primary)"
                : "var(--text-secondary)",
              fontSize: "0.85rem",
              fontWeight: stratChartTab === "portfolio" ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.18s ease",
            }}
          >
            <span>📊</span>
            <span>Portafolio General ({strategy.name || "Estrategia"})</span>
          </button>

          <button
            type="button"
            onClick={() => setStratChartTab("individual")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 14px",
              borderRadius: 7,
              border: stratChartTab === "individual"
                ? `1px solid ${isLight ? "rgba(16, 185, 129, 0.4)" : "rgba(16, 185, 129, 0.4)"}`
                : "1px solid transparent",
              background: stratChartTab === "individual"
                ? isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.12)"
                : "transparent",
              color: stratChartTab === "individual"
                ? isLight ? "#059669" : "#34d399"
                : "var(--text-secondary)",
              fontSize: "0.85rem",
              fontWeight: stratChartTab === "individual" ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.18s ease",
            }}
          >
            <span>🔍</span>
            <span>Acción Individual (Hora a Hora)</span>
            {((navData?.holdings?.length || activeTickers.length || 0) + (navData?.closed_holdings?.length || 0)) > 0 && (
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
                {(navData?.holdings?.length || activeTickers.length || 0) + (navData?.closed_holdings?.length || 0)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStratChartTab("fx")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 14px",
              borderRadius: 7,
              border: stratChartTab === "fx"
                ? `1px solid ${isLight ? "rgba(245, 158, 11, 0.5)" : "rgba(245, 158, 11, 0.5)"}`
                : "1px solid transparent",
              background: stratChartTab === "fx"
                ? isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.15)"
                : "transparent",
              color: stratChartTab === "fx"
                ? isLight ? "#d97706" : "#fbbf24"
                : "var(--text-secondary)",
              fontSize: "0.85rem",
              fontWeight: stratChartTab === "fx" ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.18s ease",
            }}
          >
            <span>💱</span>
            <span>Divisa USD / COP</span>
          </button>
        </div>

        {stratChartTab === "portfolio" && (
          <div
            className="period-selector"
            style={{ margin: 0, padding: 0, background: "transparent" }}
          >
            {PERIODS.map((p) => {
              const isFx = stratChartTab === "fx";
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
                    padding: "4px 10px",
                    fontSize: "0.75rem",
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

      <div className="card chart-card fade-up" style={{ padding: "20px" }}>
        {stratChartTab === "fx" ? (
          <FxRateExplorer
            defaultAsset="USD"
            defaultLocal="COP"
            period={period}
            onPeriodChange={setPeriod}
            purchaseDates={purchaseDates}
            minDate={firstInvestDate}
          />
        ) : stratChartTab === "individual" ? (
          <IndividualHoldingChart
            holdings={navData?.holdings || []}
            closedHoldings={navData?.closed_holdings || []}
            rebalances={rebalances}
            investment={simulatedCapital}
            numSlots={numSlots}
            customStrategies={customStrategies}
            activeStrategyId={strategy.id}
          />
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>📊 Crecimiento Histórico</h3>
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: period === "1D" ? "#10b981" : "var(--text-muted)",
                    background: period === "1D" ? "rgba(16, 185, 129, 0.12)" : "rgba(255,255,255,0.04)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    border: period === "1D" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(255,255,255,0.08)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                  title={
                    period === "1D"
                      ? "Actualización en vivo cada 1 minuto (barras horarias de 9:30 a 16:00 ET)"
                      : "Actualización de cierre automático cada 1 hora"
                  }
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: period === "1D" ? "#10b981" : "#64748b",
                      display: "inline-block",
                      animation: period === "1D" ? "pulse 2s infinite" : "none",
                    }}
                  />
                  {period === "1D" ? "En vivo (1m)" : "Auto-actualización (1h)"}
                  {isNavLoading && " ⏳"}
                </span>
              </div>

              {/* Botón Actualizar Gráfica de Estrategia */}
              <button
                type="button"
                onClick={handleManualNavRefresh}
                disabled={isNavLoading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 11px",
                  borderRadius: 6,
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  cursor: isNavLoading ? "not-allowed" : "pointer",
                  background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.1)"}`,
                  color: isLight ? "#0284c7" : "#38bdf8",
                  transition: "all 0.15s ease",
                  opacity: isNavLoading ? 0.7 : 1,
                }}
                title="Actualizar datos históricos y cotizaciones de la estrategia sin recargar la página"
              >
                <span
                  style={{
                    display: "inline-block",
                    animation: isNavLoading ? "spin 0.8s linear infinite" : "none",
                  }}
                >
                  🔄
                </span>
                <span>{isNavLoading ? "Actualizando…" : "Actualizar"}</span>
              </button>
            </div>

            {/* ── Integrated Interactive Ticker Activator Bar (Position Switchers with Smooth Animations) ── */}
            {filteredHoldings && filteredHoldings.length > 0 && (
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
                      color: selectedTickers ? "var(--accent-primary)" : "var(--text-secondary)",
                    }}
                  >
                    🎯 Posiciones:
                  </span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: selectedTickers
                        ? isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0,229,255,0.1)"
                        : isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
                      color: selectedTickers
                        ? isLight ? "#0284c7" : "var(--accent-primary)"
                        : "var(--text-muted)",
                      fontWeight: 700,
                      minWidth: "85px",
                      display: "inline-block",
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {filteredHoldings.filter((h) => h.selected !== false).length} de {filteredHoldings.length} activas
                  </span>
                </div>

                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button className="btn-chip" onClick={handleSelectAll} title="Incluir todas las posiciones">
                    ⚡ Todos
                  </button>
                  <button
                    className="btn-chip gainer"
                    onClick={handleSelectGainers}
                    title="Solo posiciones ganadoras"
                  >
                    🚀 Ganadoras
                  </button>
                  <button
                    className="btn-chip loser"
                    onClick={handleSelectLosers}
                    title="Solo posiciones perdedoras"
                  >
                    🔴 Perdedoras
                  </button>
                  {filteredHoldings.some((h) => alerts.some((a) => a.ticker === h.ticker && a.is_active && !a.triggered_at)) && (
                    <button
                      className="btn-chip"
                      onClick={handleSelectWithAlerts}
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
                    onClick={handleInvertSelection}
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
                  {filteredHoldings.map((h) => {
                    const isSelected = h.selected !== false;
                    const isGain = (h.unrealized_pnl ?? h.return_pct ?? 0) >= 0;
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
                        ? isLight ? "1px solid rgba(2, 132, 199, 0.35)" : "1px solid rgba(0, 229, 255, 0.3)"
                        : "1px solid rgba(239, 68, 68, 0.3)"
                      : isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.08)";
                    const regularColor = isSelected
                      ? isGain
                        ? isLight ? "#0284c7" : "var(--accent-primary)"
                        : "#ef4444"
                      : "var(--text-muted)";

                    return (
                      <button
                        key={h.ticker}
                        onClick={() => handleToggleTicker(h.ticker)}
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
                          opacity: isSelected ? 1 : 0.45,
                        }}
                        title={
                          hasAlert
                            ? `Alerta de venta activa en ${h.ticker}: ${
                                activeAlert.alert_type === "STOP_LOSS" ? "Stop Loss" : "Take Profit"
                              } (${activeAlert.target_value >= 0 ? "+" : ""}${activeAlert.target_value}%). Clic para alternar.`
                            : `Clic para ${isSelected ? "excluir" : "incluir"} ${h.ticker}`
                        }
                      >
                        {hasAlert && isSelected && (
                          <span style={{ fontSize: "0.75rem", flexShrink: 0 }}>🔔</span>
                        )}
                        <span>{h.ticker}</span>
                        {hasAlert && isSelected && typeof activeAlert.target_value === "number" ? (
                          <span
                            style={{
                              fontSize: "0.62rem",
                              fontWeight: 800,
                              opacity: 0.9,
                            }}
                          >
                            {activeAlert.target_value >= 0 ? "+" : ""}{activeAlert.target_value}%
                          </span>
                        ) : typeof h.return_pct === "number" ? (
                          <span style={{ fontSize: "0.62rem", opacity: isSelected ? 0.9 : 0.6 }}>
                            {h.return_pct >= 0 ? "+" : ""}{h.return_pct.toFixed(0)}%
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isNavLoading && !navData ? (
              <QuantumOrbitalLoader
                message={`Cargando modelo cuantitativo (${period})…`}
                submessage="Transición cuántica de Schrödinger (orbitales 1s ➔ 2s ➔ 2p ➔ 3d ➔ 4f)"
                height={420}
              />
            ) : (
              <StrategyChart
                strategy={strategy}
                activeInvested={effectiveActiveInvested}
                period={period}
                firstInvestDate={effectiveFirstInvestDate}
                rebalances={rebalances}
                slotValue={effectiveSlotValue}
                targetReturns={currentReturns}
                navData={filteredNavData || navData}
              />
            )}
          </>
        )}
      </div>

      {/* ── Detalle de Posiciones (Posiciones Reales vs Ganancias Cerradas en Simuladas) ── */}
      {strategy.isRealMoney ? (
        (filteredHoldings.length > 0 || navData?.closed_holdings?.length > 0) && (
          <div className="card fade-up" style={{ padding: "20px" }}>
            <HoldingsTable
              holdings={filteredHoldings}
              closedHoldings={navData?.closed_holdings || []}
              summary={{
                ...(navData?.summary || {}),
                active_invested: effectiveActiveInvested,
              }}
              investment={simulatedCapital}
              numSlots={numSlots}
              unit={unit}
              onToggleUnit={() => setUnit((u) => (u === "pct" ? "usd" : "pct"))}
              onToggleTicker={handleToggleTicker}
              onRemoveTicker={handleRemoveTickerFromSlot}
              isRealMoney={true}
              closedOnly={false}
              onExportExcel={() => exportPortfolioExcel(strategy.id, simulatedCapital, numSlots)}
              strategyId={strategy.id}
            />
          </div>
        )
      ) : (
        navData?.closed_holdings?.length > 0 && (
          <div className="card fade-up" style={{ padding: "20px" }}>
            <HoldingsTable
              holdings={[]}
              closedHoldings={navData?.closed_holdings || []}
              summary={{
                ...(navData?.summary || {}),
                active_invested: effectiveActiveInvested,
              }}
              investment={simulatedCapital}
              numSlots={numSlots}
              unit={unit}
              onToggleUnit={() => setUnit((u) => (u === "pct" ? "usd" : "pct"))}
              onToggleTicker={handleToggleTicker}
              onRemoveTicker={handleRemoveTickerFromSlot}
              isRealMoney={false}
              closedOnly={true}
              onExportExcel={() => exportPortfolioExcel(strategy.id, simulatedCapital, numSlots)}
              strategyId={strategy.id}
            />
          </div>
        )
      )}

      {/* ── Constellation Grid Visualizer (Slots) ────── */}
      <div className="card fade-up" style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "14px",
            flexWrap: "wrap",
            gap: 8,
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
                gap: 6,
              }}
            >
              <span>🧩 Matriz de Asignación de {numSlots} Slots</span>
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: `${strategy.color}26`,
                  color: strategy.color,
                  fontWeight: 700,
                }}
              >
                1 / {numSlots} = {weightPerSlot}% Equiponderado
              </span>
            </h3>
            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
              Cada posición ocupa exactamente 1 slot (${slotValue.toFixed(2)} / {weightPerSlot}%).
              Los slots vacíos se preservan en liquidez (Cash Q).
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: strategy.color }}>
              {activeTickers.length} Asignados · {numSlots - activeTickers.length} en Cash
            </div>
            {activeTickers.length < numSlots && (
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  fontSize: "0.75rem",
                  padding: "5px 12px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: strategy.color,
                  borderColor: strategy.color,
                  color: "#ffffff",
                  boxShadow: `0 2px 8px ${strategy.color}40`,
                }}
                onClick={() => handleOpenSlotModal(null)}
              >
                <span>➕</span>
                <span>Colocar Acción</span>
              </button>
            )}
          </div>
        </div>

        {/* N-Slots Box Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
            gap: "10px",
          }}
        >
          {Array.from({ length: numSlots }).map((_, i) => {
            const ticker = activeTickers[i];
            const isOccupied = !!ticker;
            return isOccupied ? (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius)",
                  border: isLight ? `1px solid ${strategy.color}55` : `1px solid ${strategy.color}66`,
                  background: isLight
                    ? "var(--bg-card, #ffffff)"
                    : `linear-gradient(135deg, ${strategy.color}20 0%, rgba(0,0,0,0.3) 100%)`,
                  boxShadow: isLight ? "0 2px 6px rgba(0,0,0,0.04)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  transition: "all 0.15s ease",
                  position: "relative",
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span
                    style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600 }}
                  >
                    Slot {i + 1}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <span
                      style={{
                        fontSize: "0.62rem",
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: isLight ? `${strategy.color}18` : `${strategy.color}40`,
                        color: strategy.color,
                        fontWeight: 700,
                      }}
                    >
                      {weightPerSlot}%
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenSlotModal(i);
                      }}
                      title={`Cambiar ${ticker} por otra acción`}
                      aria-label={`Cambiar ${ticker}`}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "1px 3px",
                        borderRadius: 3,
                        fontSize: "0.72rem",
                        lineHeight: 1,
                        color: "var(--text-muted)",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = strategy.color;
                        e.currentTarget.style.background = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      🔄
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTickerFromSlot(ticker);
                      }}
                      title={`Quitar ${ticker} de la estrategia`}
                      aria-label={`Quitar ${ticker}`}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: "1px 4px",
                        borderRadius: 3,
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        lineHeight: 1,
                        color: isLight ? "#94a3b8" : "rgba(255, 255, 255, 0.45)",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#ef4444";
                        e.currentTarget.style.background = isLight ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.2)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = isLight ? "#94a3b8" : "rgba(255, 255, 255, 0.45)";
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                  <strong
                    className="mono"
                    style={{ fontSize: "1.05rem", color: strategy.color, lineHeight: 1.1 }}
                  >
                    {ticker}
                  </strong>
                  {tickerMetadata[ticker]?.market_open !== undefined && (
                    <span
                      title={
                        tickerMetadata[ticker].market_open
                          ? `Mercado Abierto (${tickerMetadata[ticker]?.exchange || "US"})`
                          : `Mercado Cerrado (${tickerMetadata[ticker]?.exchange || "US"})`
                      }
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: tickerMetadata[ticker].market_open ? "#22c55e" : "#ef4444",
                        boxShadow: tickerMetadata[ticker].market_open ? "0 0 6px #22c55e" : "none",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
                {tickerMetadata[ticker] && (
                  <div
                    style={{
                      fontSize: "0.62rem",
                      color: isLight ? "var(--text-secondary, #475569)" : "#cbd5e1",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={tickerMetadata[ticker].name}
                  >
                    {tickerMetadata[ticker].name}
                  </div>
                )}
                <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>
                  ${slotValue.toFixed(2)} asignados
                </div>
              </div>
            ) : (
              <div
                key={i}
                onClick={() => handleOpenSlotModal(i)}
                title={`Hacer clic para colocar una acción en este slot`}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius)",
                  border: isLight ? "1.5px dashed #cbd5e1" : "1px dashed rgba(255, 255, 255, 0.15)",
                  background: isLight ? "rgba(241, 245, 249, 0.4)" : "rgba(255, 255, 255, 0.02)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = strategy.color;
                  e.currentTarget.style.background = isLight ? `${strategy.color}0c` : `${strategy.color}15`;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isLight ? "#cbd5e1" : "rgba(255, 255, 255, 0.15)";
                  e.currentTarget.style.background = isLight ? "rgba(241, 245, 249, 0.4)" : "rgba(255, 255, 255, 0.02)";
                  e.currentTarget.style.transform = "none";
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span
                    style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600 }}
                  >
                    Slot {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "1px 5px",
                      borderRadius: 4,
                      background: isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.05)",
                      color: "var(--text-muted)",
                      fontWeight: 700,
                    }}
                  >
                    Cash Q
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    marginTop: 2,
                    color: strategy.color,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                  }}
                >
                  <span style={{ fontSize: "0.85rem" }}>➕</span>
                  <span>Colocar</span>
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                  ${slotValue.toFixed(2)} en reserva
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Modal para Colocar o Cambiar Acción en Slot ── */}
      {slotModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={handleCloseSlotModal}
        >
          <div
            className="fade-up"
            style={{
              background: isLight ? "#ffffff" : "var(--bg-card, #111827)",
              border: isLight ? "1px solid var(--border)" : "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 12,
              width: "100%",
              maxWidth: 440,
              padding: "22px 24px",
              boxShadow: isLight ? "0 10px 25px rgba(0, 0, 0, 0.15)" : "0 10px 30px rgba(0, 0, 0, 0.7)",
              color: "var(--text-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 16,
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>
                    {slotTargetIndex !== null && activeTickers[slotTargetIndex]
                      ? "🔄 Cambiar Acción"
                      : "➕ Colocar Acción"}
                  </span>
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  {slotTargetIndex !== null && activeTickers[slotTargetIndex]
                    ? `Reemplazar ${activeTickers[slotTargetIndex]} en el Slot ${slotTargetIndex + 1}`
                    : slotTargetIndex !== null
                    ? `Asignar al Slot ${slotTargetIndex + 1} · $${slotValue.toFixed(2)} (${weightPerSlot}%)`
                    : `Asignar a la estrategia ${strategy.name} · $${slotValue.toFixed(2)} (${weightPerSlot}%)`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseSlotModal}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1.2rem",
                  color: "var(--text-muted)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (slotSearchQuery.trim()) {
                  handleAssignTickerToSlot(slotSearchQuery, slotTargetIndex);
                }
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  marginBottom: 6,
                  color: "var(--text-muted)",
                }}
              >
                Símbolo o Ticker de la Acción:
              </label>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ej. NVDA, AAPL, MSFT, GOOGL..."
                  value={slotSearchQuery}
                  onChange={(e) => setSlotSearchQuery(e.target.value.toUpperCase())}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: "var(--radius)",
                    border: isLight ? "1px solid #cbd5e1" : "1px solid var(--border)",
                    background: isLight ? "#f8fafc" : "var(--bg-surface)",
                    color: isLight ? "#0f172a" : "#ffffff",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                />
                <button
                  type="submit"
                  disabled={!slotSearchQuery.trim() || isAssigning}
                  className="btn btn-primary"
                  style={{
                    padding: "0 18px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    background: strategy.color,
                    borderColor: strategy.color,
                    color: "#ffffff",
                    opacity: !slotSearchQuery.trim() || isAssigning ? 0.6 : 1,
                    cursor: !slotSearchQuery.trim() || isAssigning ? "not-allowed" : "pointer",
                  }}
                >
                  {isAssigning ? "Guardando..." : "Colocar"}
                </button>
              </div>

              {/* Quick suggestions */}
              <div style={{ marginBottom: 18 }}>
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Sugerencias rápidas:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["NVDA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "PLTR", "CRM", "NFLX"]
                    .filter((t) => !activeTickers.includes(t))
                    .slice(0, 8)
                    .map((sugTicker) => (
                      <button
                        key={sugTicker}
                        type="button"
                        onClick={() => setSlotSearchQuery(sugTicker)}
                        style={{
                          fontSize: "0.72rem",
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: isLight ? "1px solid #e2e8f0" : "1px solid rgba(255, 255, 255, 0.1)",
                          background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.05)",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 600,
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = strategy.color;
                          e.currentTarget.style.color = strategy.color;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = isLight ? "#e2e8f0" : "rgba(255, 255, 255, 0.1)";
                          e.currentTarget.style.color = "var(--text-primary)";
                        }}
                      >
                        {sugTicker}
                      </button>
                    ))}
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={handleCloseSlotModal}
                  style={{
                    padding: "8px 14px",
                    fontSize: "0.82rem",
                    borderRadius: 6,
                    background: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.08)",
                    color: "var(--text-secondary)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!slotSearchQuery.trim() || isAssigning}
                  className="btn btn-primary"
                  style={{
                    padding: "8px 16px",
                    fontSize: "0.82rem",
                    borderRadius: 6,
                    background: strategy.color,
                    borderColor: strategy.color,
                    color: "#ffffff",
                    cursor: !slotSearchQuery.trim() || isAssigning ? "not-allowed" : "pointer",
                    boxShadow: `0 2px 8px ${strategy.color}40`,
                  }}
                >
                  {isAssigning ? "Guardando..." : "Confirmar y Asignar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Rebalance Manager Grid ────────────────────── */}
      <div className="bottom-grid">
        {/* Formulario para agregar rebalanceo con fecha específica */}
        <div className="card fade-up" style={{ padding: "20px" }}>
          <h3
            style={{
              margin: "0 0 12px 0",
              fontSize: "1.05rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📅</span>
            <span>Registrar Nuevo Rebalanceo Fechado</span>
          </h3>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 16 }}>
            Define la fecha de entrada en vigor y la lista exacta de posiciones para {strategy.name}
            .
          </p>

          {/* Fecha del Rebalanceo */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Fecha del Rebalanceo / Compra:
            </label>
            <DynamicDatePicker
              value={date}
              onChange={(val) => setDate(val)}
            />
          </div>

          {/* Búsqueda y Adición Individual */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Buscar y agregar ticker ({formTickers.length}/{numSlots} slots):
            </label>
            <form onSubmit={handleSearchAndAdd} style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="Ej. AAPL NVDA MSFT..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "#fff",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.85rem",
                }}
              />
              <button type="submit" className="btn btn-ghost" disabled={searching}>
                {searching ? "Buscando…" : "+ Agregar"}
              </button>
            </form>
            {searchError && (
              <span
                style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: 4, display: "block" }}
              >
                {searchError}
              </span>
            )}
          </div>

          {/* Pegar Grupo de Tickers en Bloque */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 6,
              }}
            >
              O pegar grupo de tickers separados por espacio:
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="AAPL NVDA MSFT GOOGL AMZN..."
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "#fff",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.78rem",
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleBatchAdd}
                style={{ fontSize: "0.75rem" }}
              >
                Cargar Grupo
              </button>
            </div>
          </div>

          {/* Chips de Tickers en este Rebalanceo */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
                Posiciones asignadas ({formTickers.length}):
              </span>
              {formTickers.length > 0 && (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    style={{
                      background: "#ef444422",
                      border: "1px solid #ef444455",
                      color: "#ef4444",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontWeight: 700,
                      opacity: selectedForDeletion.length > 0 ? 1 : 0,
                      pointerEvents: selectedForDeletion.length > 0 ? "auto" : "none",
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    Borrar seleccionados ({Math.max(selectedForDeletion.length, 1)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTickers([]);
                      setSelectedForDeletion([]);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Limpiar todo
                  </button>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                minHeight: 40,
                padding: 10,
                background: "rgba(0,0,0,0.2)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              {formTickers.length === 0 ? (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  No hay posiciones agregadas para esta fecha.
                </span>
              ) : (
                formTickers.map((t) => (
                  <span
                    key={t}
                    onClick={() => toggleForDeletion(t)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 16,
                      background: selectedForDeletion.includes(t)
                        ? "#ef444426"
                        : `${strategy.color}26`,
                      border: `1px solid ${selectedForDeletion.includes(t) ? "#ef444459" : `${strategy.color}59`}`,
                      color: selectedForDeletion.includes(t) ? "#ef4444" : strategy.color,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title="Clic para seleccionar/deseleccionar para borrar"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTicker(t);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "1rem",
                        lineHeight: 1,
                        padding: 0,
                        opacity: 0.7,
                      }}
                      title="Eliminar posición"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveRebalance}
            style={{ width: "100%", padding: "12px", fontSize: "0.85rem", fontWeight: 700 }}
          >
            💾 Guardar Rebalanceo ({date})
          </button>
        </div>

        {/* Historial de Rebalanceos Fechados */}
        <div className="card fade-up" style={{ padding: "20px" }}>
          <h3
            style={{
              margin: "0 0 14px 0",
              fontSize: "1.05rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📜</span>
            <span>Historial de Rebalanceos ({rebalances.length})</span>
          </h3>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              maxHeight: 520,
              overflowY: "auto",
            }}
          >
            {rebalances.map((reb, idx) => {
              const isCurrent = idx === rebalances.length - 1;
              return (
                <div
                  key={reb.rebalance_date}
                  style={{
                    padding: "14px",
                    borderRadius: "var(--radius)",
                    background: isCurrent ? `${strategy.color}10` : "var(--bg-surface)",
                    border: `1px solid ${isCurrent ? `${strategy.color}4D` : "var(--border)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {editingRebalanceDate?.oldDate === reb.rebalance_date ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <DynamicDatePicker
                            value={editingRebalanceDate.tempDate}
                            onChange={(val) =>
                              setEditingRebalanceDate({
                                ...editingRebalanceDate,
                                tempDate: val,
                              })
                            }
                            showPresets={false}
                            style={{ minWidth: "160px" }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateRebalanceDate(
                                editingRebalanceDate.oldDate,
                                editingRebalanceDate.tempDate,
                              )
                            }
                            style={{
                              background: "rgba(16, 185, 129, 0.2)",
                              border: "1px solid #10b981",
                              color: "#34d399",
                              borderRadius: 4,
                              padding: "2px 6px",
                              fontSize: "0.72rem",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                            title="Guardar nueva fecha"
                          >
                            ✓ Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRebalanceDate(null)}
                            style={{
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid var(--border)",
                              color: "var(--text-muted)",
                              borderRadius: 4,
                              padding: "2px 6px",
                              fontSize: "0.72rem",
                              cursor: "pointer",
                            }}
                            title="Cancelar"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <span
                            className="mono"
                            style={{
                              fontWeight: 800,
                              fontSize: "0.9rem",
                              color: isCurrent ? strategy.color : "var(--text-primary)",
                            }}
                          >
                            {reb.rebalance_date}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingRebalanceDate({
                                oldDate: reb.rebalance_date,
                                tempDate: reb.rebalance_date,
                              })
                            }
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              fontSize: "0.75rem",
                              padding: "0 2px",
                            }}
                            title="Modificar fecha de este rebalanceo"
                          >
                            ✏️
                          </button>
                          {isCurrent && (
                            <span
                              style={{
                                fontSize: "0.65rem",
                                padding: "1px 6px",
                                borderRadius: 4,
                                background: `${strategy.color}33`,
                                color: strategy.color,
                                fontWeight: 700,
                              }}
                            >
                              VIGENTE
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRebalance(reb.rebalance_date)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                      }}
                      title="Eliminar este evento"
                    >
                      🗑️ Eliminar
                    </button>
                  </div>

                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 8 }}>
                    {reb.tickers?.length || 0} acciones asignadas ($
                    {(((reb.tickers?.length || 0) / numSlots) * simulatedCapital).toFixed(2)}{" "}
                    {strategy.isRealMoney ? "invertido" : "simulado"})
                  </div>

                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {reb.tickers?.map((t) => (
                      <span
                        key={t}
                        className="mono"
                        style={{
                          fontSize: "0.68rem",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "#cbd5e1",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
