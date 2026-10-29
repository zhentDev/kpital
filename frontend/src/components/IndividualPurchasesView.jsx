import { ColorType, LineStyle, createChart } from "lightweight-charts";
import { useTheme } from "../context/ThemeContext";
import { getChartColors, applyChartTheme } from "../utils/chartTheme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchColInflationHistory,
  fetchFxHistory,
  fetchHistoricalPrice,
  fetchIndicesHistory,
  fetchLiveQuotes,
  fetchStockAlerts,
  saveStockAlert,
  deleteStockAlert,
  evaluateStockAlerts,
  searchTicker,
  searchTickersMultiple,
} from "../api/client";
import { usePortfolioStore } from "../store/portfolioStore";
import { useAuthStore } from "../store/authStore";
import { analyzeInvestmentPlan } from "../utils/investmentPlanAnalyzer";
import { toastConfirm, toastPrompt } from "../utils/toastAlerts";
import { getBrokerEquivalenceInfo, getMarketOpenTime, MARKET_REGIONS, translateBrokerTicker } from "../utils/marketHours";
import { DynamicDatePicker, DynamicTimePicker, InfoTooltip, MarketScheduleBadge } from "./Common";
import AffiliateBanner from "./Common/AffiliateBanner";
import ChangeTickerModal from "./ChangeTickerModal";
import InflationExplorerModal from "./InflationExplorerModal";
import PlanConfigModal from "./PlanConfigModal";
import PlanExecutionModal from "./PlanExecutionModal";
import XtbImportModal from "./XtbImportModal";
import FxRateExplorer from "./Common/FxRateExplorer";
import StockAlertModal from "./StockAlertModal";
import IndividualHoldingChart from "./IndividualHoldingChart";
import { getAssetName } from "../utils/assetNames";

export default function IndividualPurchasesView({ portfolioId = "hist_default", onSelectPortfolio }) {

  const {
    individualPurchases,
    purchaseSales,
    addPurchase,
    removePurchase,
    updatePurchase,
    updateMultiplePurchases,
    addPurchaseSale,
    removePurchaseSale,
    purchasePortfolios,
    addPurchasePortfolio,
    deletePurchasePortfolio,
    batchUpdateStatus,
    runBatchRecalculate,
    setAbortBatch,
    togglePortfolioPlan,
    updatePortfolioSettings,
    lastKnownQuotes,
    saveLastKnownQuotes,
    savePortfolioSummary,
  } = usePortfolioStore();

  const { theme } = useTheme();
  const isLight = theme === "light";
  const chartColors = useMemo(() => getChartColors(theme), [theme]);

  const status = batchUpdateStatus?.[portfolioId] || {};
  const isBatchUpdating = status.isUpdating || false;
  const batchProgress = status.progress || { current: 0, total: 0 };

  // Editing state
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editInvested, setEditInvested] = useState(0);
  const [editPrice, setEditPrice] = useState(0);
  const [editCommissionAmount, setEditCommissionAmount] = useState(0);
  const [editDate, setEditDate] = useState("");
  const [editPurchaseTime, setEditPurchaseTime] = useState("");
  const [editTicker, setEditTicker] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showExecutionModal, setShowExecutionModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showInflationExplorer, setShowInflationExplorer] = useState(false);
  const [showXtbModal, setShowXtbModal] = useState(false);
  const [changingTickerGroup, setChangingTickerGroup] = useState(null);

  // Stock Alerts state
  const { user } = useAuthStore();
  const [alerts, setAlerts] = useState([]);
  const [selectedAlertItem, setSelectedAlertItem] = useState(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadAlerts = () => {
      fetchStockAlerts("purchase", portfolioId)
        .then((data) => {
          if (isMounted && Array.isArray(data)) {
            setAlerts(data);
          }
        })
        .catch(() => {});
    };

    loadAlerts();

    const handleUpdate = () => {
      if (isMounted) loadAlerts();
    };
    window.addEventListener("stockAlertsUpdated", handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener("stockAlertsUpdated", handleUpdate);
    };
  }, [portfolioId]);

  const handleOpenAlertModal = (item, e) => {
    if (e) e.stopPropagation();
    setSelectedAlertItem(item);
    setIsAlertModalOpen(true);
  };

  const handleSaveAlert = async (alertPayload) => {
    try {
      const { isParentGroup, ...cleanPayload } = alertPayload;
      const baseTicker = (cleanPayload.ticker || "").split("::")[0];

      if (isParentGroup) {
        // Parent group save: save master alert AND replicate to all individual lots of this ticker
        const matchingLots = currentPurchases.filter((p) => p.ticker === baseTicker);
        const savedList = [];

        // 1. Save parent alert (keyed by baseTicker)
        const existingParent = alerts.find((a) => a.ticker === baseTicker);
        const parentSaved = await saveStockAlert({
          ...cleanPayload,
          id: existingParent?.id || undefined,
          ticker: baseTicker,
        });
        savedList.push(parentSaved);

        // 2. Replicate to each individual lot (keyed by `${baseTicker}::${lot.id}`)
        for (const lot of matchingLots) {
          const lotKey = `${baseTicker}::${lot.id}`;
          const existingLotAlert = alerts.find((a) => a.ticker === lotKey);
          const lotSaved = await saveStockAlert({
            ...cleanPayload,
            id: existingLotAlert?.id || undefined,
            ticker: lotKey,
          });
          savedList.push(lotSaved);
        }

        const savedKeys = new Set(savedList.map((s) => s.ticker));
        const savedIds = new Set(savedList.map((s) => s.id));
        setAlerts((prev) => {
          const filtered = prev.filter((a) => !savedKeys.has(a.ticker) && !savedIds.has(a.id));
          return [...filtered, ...savedList];
        });

        toast.success(
          `Alerta global ${parentSaved.alert_type === "STOP_LOSS" ? "Stop Loss" : "Recuperación / Take Profit"} aplicada a ${baseTicker} y sus ${matchingLots.length} lotes`,
          { icon: "🌐" }
        );
      } else {
        // Individual lot save: only affects this specific lotKey (`${ticker}::${lot.id}`)
        const saved = await saveStockAlert(cleanPayload);
        setAlerts((prev) => {
          const filtered = prev.filter((a) => a.id !== saved.id && a.ticker !== saved.ticker);
          return [...filtered, saved];
        });
        toast.success(
          `Alerta individual (${saved.target_value >= 0 ? "+" : ""}${saved.target_value}%) guardada solo para este lote de ${baseTicker}`,
          { icon: "🎯" }
        );
      }
    } catch {
      toast.error("Error al guardar la alerta");
    }
  };

  const handleDeleteAlert = async (alertId, parentTickerToCascade = null) => {
    try {
      if (parentTickerToCascade) {
        const baseUpper = parentTickerToCascade.toUpperCase();
        const toDelete = alerts.filter(
          (a) => a.id === alertId || a.ticker === baseUpper || a.ticker.startsWith(`${baseUpper}::`)
        );
        for (const a of toDelete) {
          await deleteStockAlert(a.id);
        }
        const deletedIds = new Set(toDelete.map((a) => a.id));
        setAlerts((prev) => prev.filter((a) => !deletedIds.has(a.id)));
        toast.success(`Alertas eliminadas en todos los lotes de ${baseUpper}`, { icon: "🗑️" });
      } else {
        await deleteStockAlert(alertId);
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        toast.success("Alerta del lote eliminada correctamente", { icon: "🗑️" });
      }
    } catch {
      toast.error("Error al eliminar la alerta");
    }
  };

  // Selling state
  const [sellingLot, setSellingLot] = useState(null);
  const [saleMode, setSaleMode] = useState("shares"); // 'shares' | 'usd'
  const [saleShares, setSaleShares] = useState(0);
  const [saleAmountUSD, setSaleAmountUSD] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [saleCommission, setSaleCommission] = useState(0);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [saleTime, setSaleTime] = useState("");
  const [saleNotes, setSaleNotes] = useState("");

  const portfolio = purchasePortfolios?.find((p) => p.id === portfolioId) || {
    name: "Histórico",
    assetCurrency: "USD",
    localCurrency: "USD",
    inflationRate: 0,
    useAutoColInflation: false,
  };

  // Yield View Mode: 'USD' | 'FX' | 'REAL'
  const [yieldViewMode, setYieldViewMode] = useState("USD");
  const [fxData, setFxData] = useState({ current: 1.0, history: {} });
  const [isFetchingFx, setIsFetchingFx] = useState(false);
  const [colInflationData, setColInflationData] = useState({ history: {} });
  const [isFetchingInflation, setIsFetchingInflation] = useState(false);
  const [showBreakdownCard, setShowBreakdownCard] = useState(false);

  useEffect(() => {
    if (
      portfolio.assetCurrency &&
      portfolio.localCurrency &&
      portfolio.assetCurrency !== portfolio.localCurrency
    ) {
      setIsFetchingFx(true);
      fetchFxHistory(portfolio.assetCurrency, portfolio.localCurrency)
        .then((res) => setFxData(res))
        .catch(console.error)
        .finally(() => setIsFetchingFx(false));
    } else {
      setFxData({ current: 1.0, history: {} });
      if (yieldViewMode === "FX") setYieldViewMode("USD");
    }
  }, [portfolio.assetCurrency, portfolio.localCurrency]);

  useEffect(() => {
    setIsFetchingInflation(true);
    fetchColInflationHistory()
      .then((res) => setColInflationData(res))
      .catch(console.error)
      .finally(() => setIsFetchingInflation(false));
  }, []);

  // Smart Analysis
  const autoPlanAnalysis = useMemo(() => {
    if (!portfolio.isPlan) return null;
    return analyzeInvestmentPlan(individualPurchases.filter((p) => p.portfolioId === portfolioId));
  }, [portfolio.isPlan, individualPurchases, portfolioId]);

  const planAnalysis = useMemo(() => {
    if (!portfolio.isPlan) return null;

    // Si hay configuración manual, úsala. Si no, usa la autodetectada.
    if (portfolio.planConfig) {
      let nextDateStr = null;
      const currentPurchases = individualPurchases.filter((p) => p.portfolioId === portfolioId);

      if (currentPurchases.length > 0) {
        // Encontrar la última fecha de compra real
        const latestDateStr = currentPurchases.reduce(
          (latest, p) => (p.date > latest ? p.date : latest),
          currentPurchases[0].date,
        );
        const lastDate = new Date(latestDateStr);
        // Ajustar zona horaria
        lastDate.setMinutes(lastDate.getMinutes() + lastDate.getTimezoneOffset());
        lastDate.setDate(lastDate.getDate() + (portfolio.planConfig.frequencyDays || 15));
        nextDateStr = lastDate.toISOString().split("T")[0];
      } else {
        // Fallback para próxima fecha si no hay nada de data: usar fecha actual + frecuencia
        const d = new Date();
        d.setDate(d.getDate() + (portfolio.planConfig.frequencyDays || 15));
        nextDateStr = d.toISOString().split("T")[0];
      }

      return {
        ...portfolio.planConfig,
        nextDate: nextDateStr,
        isManual: true,
      };
    }

    if (autoPlanAnalysis && autoPlanAnalysis.frequencyDays) {
      return { ...autoPlanAnalysis, isManual: false };
    }

    return null;
  }, [portfolio.isPlan, portfolio.planConfig, autoPlanAnalysis]);

  const currentPurchases = useMemo(() => {
    return individualPurchases.filter((p) => p.portfolioId === portfolioId);
  }, [individualPurchases, portfolioId]);

  const currentSales = useMemo(() => {
    return (purchaseSales || [])
      .filter((s) => (s.portfolioId || s.portfolio_id) === portfolioId)
      .map((s) => ({
        id: s.id,
        lotId: s.lotId || s.lot_id,
        portfolioId: s.portfolioId || s.portfolio_id,
        ticker: s.ticker,
        saleDate: s.saleDate || s.sale_date,
        saleTime: s.saleTime || s.sale_time,
        salePrice: Number(s.salePrice ?? s.sale_price ?? 0),
        shares: Number(s.shares ?? 0),
        saleCommission: Number(s.saleCommission ?? s.sale_commission ?? 0),
        realizedPnl: Number(s.realizedPnl ?? s.realized_pnl ?? 0),
        notes: s.notes,
        purchaseDate: s.purchaseDate || s.purchase_date,
        costBasis: Number(s.costBasis ?? s.cost_basis ?? 0),
        // keep snake_case aliases for any legacy references
        portfolio_id: s.portfolioId || s.portfolio_id,
        sale_date: s.saleDate || s.sale_date,
        sale_time: s.saleTime || s.sale_time,
        sale_price: Number(s.salePrice ?? s.sale_price ?? 0),
        sale_commission: Number(s.saleCommission ?? s.sale_commission ?? 0),
        realized_pnl: Number(s.realizedPnl ?? s.realized_pnl ?? 0),
      }))
      .sort((a, b) => new Date(b.saleDate) - new Date(a.saleDate));
  }, [purchaseSales, portfolioId]);

  const totalRealizedPnl = useMemo(() => {
    return currentSales.reduce((acc, s) => acc + (s.realizedPnl || 0), 0);
  }, [currentSales]);

  // Auto-asignar hora oficial de apertura de mercado a posiciones abiertas que no cuenten con hora registrada
  const processedNoTimeIdsRef = useRef(new Set());
  useEffect(() => {
    if (!currentPurchases || currentPurchases.length === 0) return;
    const purchasesWithoutTime = currentPurchases.filter(
      (p) =>
        (!p.purchaseTime || typeof p.purchaseTime !== "string" || !p.purchaseTime.trim()) &&
        !processedNoTimeIdsRef.current.has(p.id)
    );
    if (purchasesWithoutTime.length > 0) {
      purchasesWithoutTime.forEach((p) => processedNoTimeIdsRef.current.add(p.id));
      const updates = purchasesWithoutTime.map((p) => ({
        ...p,
        purchaseTime: getMarketOpenTime(p.ticker, p.exchange),
      }));
      updateMultiplePurchases(updates);
    }
  }, [currentPurchases, updateMultiplePurchases]);

  const cashReserve = useMemo(() => {
    if (!planAnalysis || !planAnalysis.avgAmount || !currentPurchases.length) return 0;

    const byDate = {};
    currentPurchases.forEach((p) => {
      if (!p.date) return;
      if (!byDate[p.date]) byDate[p.date] = 0;
      byDate[p.date] += (p.investedAmount ?? p.shares * p.purchasePrice) || 0;
    });

    let reserve = 0;
    Object.values(byDate).forEach((investedOnDate) => {
      // Considerarlo una ejecución del plan si la inversión no es desproporcionadamente grande
      // (asumimos que si invierte más del doble del objetivo, fue una compra manual extraordinaria)
      if (investedOnDate <= planAnalysis.avgAmount * 2) {
        reserve += planAnalysis.avgAmount - investedOnDate;
      }
    });

    return reserve;
  }, [planAnalysis, currentPurchases]);

  // Form State
  const [ticker, setTicker] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [purchaseTime, setPurchaseTime] = useState("");
  const [investedAmount, setInvestedAmount] = useState(500);
  const [price, setPrice] = useState(100);
  const [commissionAmount, setCommissionAmount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchRegion, setSearchRegion] = useState("ALL");

  const purchaseTranslationInfo = useMemo(() => {
    return translateBrokerTicker(ticker);
  }, [ticker]);

  // Chart Subtab State: "portfolio" | "individual" | "fx"
  const [purchasesChartTab, setPurchasesChartTab] = useState("portfolio");
  const [selectedHoldingKey, setSelectedHoldingKey] = useState(null);

  // Visibility state
  const [visibleSeries, setVisibleSeries] = useState({
    valor: true,
    sp500: true,
    nasdaq: true,
    invested: true,
  });
  const toggleSeries = (key) => setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));

  // Live quotes state for existing purchases
  const [liveQuotes, setLiveQuotes] = useState({});
  const [indicesHistory, setIndicesHistory] = useState({});

  const earliestDate = useMemo(() => {
    if (currentPurchases.length === 0) return null;
    const sorted = [...currentPurchases].sort((a, b) => new Date(a.date) - new Date(b.date));
    return sorted[0].date;
  }, [currentPurchases]);

  const purchaseDates = useMemo(() => {
    const dates = new Set();
    (currentPurchases || []).forEach((p) => {
      const d = p.purchaseDate || p.purchase_date || p.date;
      if (d) dates.add(String(d).split("T")[0]);
    });
    (currentSales || []).forEach((s) => {
      const d = s.purchaseDate || s.purchase_date;
      if (d) dates.add(String(d).split("T")[0]);
    });
    return Array.from(dates).sort();
  }, [currentPurchases, currentSales]);

  useEffect(() => {
    if (earliestDate) {
      // Subtract 14 days to ensure we catch the previous valid trading day if earliestDate is a weekend/holiday
      const d = new Date(earliestDate);
      d.setDate(d.getDate() - 14);
      const safeStartDate = d.toISOString().split("T")[0];
      fetchIndicesHistory(safeStartDate)
        .then((res) => {
          if (res && typeof res === "object") {
            setIndicesHistory((prev) => ({ ...prev, ...res }));
          }
        })
        .catch(console.error);
    }
  }, [earliestDate]);

  // Chart References
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const seriesRefs = useRef({ invested: null, value: null, sp500: null, nasdaq: null });

  useEffect(() => {
    if (seriesRefs.current.invested)
      seriesRefs.current.invested.applyOptions({ visible: visibleSeries.invested });
    if (seriesRefs.current.value)
      seriesRefs.current.value.applyOptions({ visible: visibleSeries.valor });
    if (seriesRefs.current.sp500)
      seriesRefs.current.sp500.applyOptions({ visible: visibleSeries.sp500 });
    if (seriesRefs.current.nasdaq)
      seriesRefs.current.nasdaq.applyOptions({ visible: visibleSeries.nasdaq });
  }, [visibleSeries]);

  const [selectedTimeRange, setSelectedTimeRange] = useState("ALL");

  const handleTimeRange = (range) => {
    setSelectedTimeRange(range);
    if (!chartInstanceRef.current) return;
    const timeScale = chartInstanceRef.current.timeScale();
    if (range === "ALL") {
      timeScale.fitContent();
      return;
    }

    const toDate = new Date();
    const fromDate = new Date();

    if (range === "1M") fromDate.setMonth(fromDate.getMonth() - 1);
    else if (range === "3M") fromDate.setMonth(fromDate.getMonth() - 3);
    else if (range === "6M") fromDate.setMonth(fromDate.getMonth() - 6);
    else if (range === "YTD") {
      fromDate.setMonth(0);
      fromDate.setDate(1);
    } else if (range === "1Y") fromDate.setFullYear(fromDate.getFullYear() - 1);
    else if (range === "5Y") fromDate.setFullYear(fromDate.getFullYear() - 5);

    const fromStr = fromDate.toISOString().split("T")[0];
    const from = earliestDate && fromStr < earliestDate ? earliestDate : fromStr;
    timeScale.setVisibleRange({
      from,
      to: toDate.toISOString().split("T")[0],
    });
  };

  const RANGE_MIN_DAYS = { "1M": 7, "3M": 30, "6M": 90, YTD: 0, "1Y": 180, "5Y": 1095, ALL: 0 };

  const isRangeEnabled = (range) => {
    if (!earliestDate) return true;
    const availableDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(`${earliestDate}T00:00:00Z`).getTime()) / 86400000),
    );
    return (RANGE_MIN_DAYS[range] ?? 0) <= availableDays;
  };

  const [isFetchingHistorical, setIsFetchingHistorical] = useState(false);

  // Auto-fetch historical price when creating a lot (supports date and exact intraday execution time)
  useEffect(() => {
    if (selectedMeta?.ticker && date) {
      setIsFetchingHistorical(true);
      fetchHistoricalPrice(selectedMeta.ticker, date, purchaseTime || null)
        .then((res) => {
          if (res && res.price) {
            setPrice(res.price);
          }
        })
        .finally(() => setIsFetchingHistorical(false));
    }
  }, [selectedMeta?.ticker, date, purchaseTime]);

  // Auto-fetch historical price when editing a lot date or execution time
  useEffect(() => {
    if (editingPurchase?.ticker && editDate) {
      const isDateChanged = editDate !== editingPurchase.date;
      const isTimeChanged = editPurchaseTime !== (editingPurchase.purchaseTime || "");
      if (isDateChanged || isTimeChanged) {
        setIsFetchingHistorical(true);
        fetchHistoricalPrice(editingPurchase.ticker, editDate, editPurchaseTime || null)
          .then((res) => {
            if (res && res.price) {
              setEditPrice(res.price);
            }
          })
          .finally(() => setIsFetchingHistorical(false));
      }
    }
  }, [editingPurchase?.ticker, editDate, editPurchaseTime]);

  // Unique tickers from purchases to fetch live quotes
  const uniqueTickers = useMemo(() => {
    return [...new Set(currentPurchases.map((p) => p.ticker))];
  }, [currentPurchases]);

  useEffect(() => {
    if (uniqueTickers.length === 0) return;

    const fetchQuotes = () => {
      fetchLiveQuotes(uniqueTickers)
        .then((res) => {
          if (Array.isArray(res)) {
            const map = {};
            res.forEach((q) => {
              if (q && q.ticker) map[q.ticker] = q;
            });
            setLiveQuotes((prev) => ({ ...prev, ...map }));
          }
        })
        .catch(console.error);
    };

    fetchQuotes();
    const intervalId = setInterval(fetchQuotes, 60000); // Fetch every 60 seconds

    return () => clearInterval(intervalId);
  }, [uniqueTickers.join(",")]);

  const [isRefreshingChart, setIsRefreshingChart] = useState(false);

  const handleManualChartRefresh = useCallback(async () => {
    if (isRefreshingChart) return;
    setIsRefreshingChart(true);
    try {
      const promises = [];
      if (uniqueTickers.length > 0) {
        promises.push(
          fetchLiveQuotes(uniqueTickers)
            .then((res) => {
              if (Array.isArray(res)) {
                const map = {};
                res.forEach((q) => {
                  if (q && q.ticker) map[q.ticker] = q;
                });
                setLiveQuotes((prev) => ({ ...prev, ...map }));
              }
            })
            .catch(() => {})
        );
      }
      if (earliestDate) {
        const d = new Date(earliestDate);
        d.setDate(d.getDate() - 14);
        const safeStartDate = d.toISOString().split("T")[0];
        promises.push(
          fetchIndicesHistory(safeStartDate)
            .then((res) => {
              if (res && typeof res === "object") {
                setIndicesHistory((prev) => ({ ...prev, ...res }));
              }
            })
            .catch(() => {})
        );
      }
      await Promise.all(promises);
      toast.success("Gráfica y cotizaciones actualizadas", { id: "purchases-chart-refresh" });
    } catch (e) {
      console.error("Error refreshing purchases chart:", e);
    } finally {
      setTimeout(() => setIsRefreshingChart(false), 500);
    }
  }, [isRefreshingChart, uniqueTickers, earliestDate]);

  useEffect(() => {
    const handleGlobalRefresh = () => {
      handleManualChartRefresh();
    };
    window.addEventListener("refreshPortfolioCharts", handleGlobalRefresh);
    return () => window.removeEventListener("refreshPortfolioCharts", handleGlobalRefresh);
  }, [handleManualChartRefresh]);

  const handleSearchTicker = async (e) => {
    e?.preventDefault();
    if (!ticker.trim()) return;

    setIsSearching(true);
    setSearchError("");
    setSelectedMeta(null);
    setSearchResults([]);
    try {
      const res = await searchTickersMultiple(ticker.trim());
      if (res.results && res.results.length > 0) {
        setSearchResults(res.results);
      } else {
        setSearchError(`"${ticker.toUpperCase()}" no encontrado.`);
      }
    } catch (err) {
      setSearchError("Error de red al buscar.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddPurchase = () => {
    if (!selectedMeta) {
      toast.error("Busca y verifica un ticker primero.");
      return;
    }
    if (Number(investedAmount) <= 0 || Number(price) <= 0) {
      toast.error("El monto invertido (Valor de apertura) y el precio deben ser mayores a cero.");
      return;
    }

    const inv = Number(investedAmount);
    const prc = Number(price);
    const calculatedShares = inv / prc;
    const defaultOpenTime = getMarketOpenTime(selectedMeta.ticker, selectedMeta.exchange);
    const finalPurchaseTime = purchaseTime.trim() || defaultOpenTime;

    const comm = Number(commissionAmount) || 0;

    const newPurchase = {
      id: Date.now().toString(),
      ticker: selectedMeta.ticker,
      name: selectedMeta.name,
      date,
      purchaseTime: finalPurchaseTime,
      investedAmount: inv,
      shares: calculatedShares,
      purchasePrice: prc,
      commissionAmount: comm,
      portfolioId,
    };

    addPurchase(newPurchase);

    setInvestedAmount(500);
    setCommissionAmount(0);
    setDate(new Date().toISOString().split("T")[0]);
    setPurchaseTime("");
  };

  const handleSaveEditedPurchase = () => {
    if (!editingPurchase) return;
    const inv = Number(editInvested);
    const prc = Number(editPrice);
    const comm = Number(editCommissionAmount) || 0;

    if (inv <= 0 || prc <= 0) {
      toast.error("El monto invertido y el precio deben ser mayores a cero.");
      return;
    }

    const defaultOpenTime = getMarketOpenTime(editTicker, editingPurchase.exchange);
    const finalPurchaseTime = editPurchaseTime.trim() || defaultOpenTime;

    const updated = {
      ...editingPurchase,
      ticker: editTicker.trim().toUpperCase(),
      date: editDate,
      purchaseTime: finalPurchaseTime,
      investedAmount: inv,
      purchasePrice: prc,
      commissionAmount: comm,
      shares: inv / prc,
      manualCurrentPrice: Number(editingPurchase.manualCurrentPrice) || undefined,
    };

    updatePurchase(updated);
    setEditingPurchase(null);
    setEditInvested(0);
    setEditPrice(0);
    setEditCommissionAmount(0);
    setEditDate("");
    setEditPurchaseTime("");
    setEditTicker("");
  };

  const handleExecuteSale = async () => {
    if (!sellingLot) return;
    const soldPrice = Number(salePrice);
    const soldComm = Number(saleCommission) || 0;
    const maxShares = Number(sellingLot.shares);

    if (soldPrice <= 0 || isNaN(soldPrice)) {
      toast.error("El precio de venta debe ser mayor a 0.");
      return;
    }

    let soldShares = 0;
    if (saleMode === "usd") {
      const amtUSD = Number(saleAmountUSD);
      if (amtUSD <= 0 || isNaN(amtUSD)) {
        toast.error("El monto en dólares a liquidar debe ser mayor a 0.");
        return;
      }
      soldShares = amtUSD / soldPrice;
    } else {
      soldShares = Number(saleShares);
      if (soldShares <= 0 || isNaN(soldShares)) {
        toast.error("Las unidades a vender deben ser mayores a 0.");
        return;
      }
    }

    // Si supera maxShares por más de un margen de redondeo minúsculo
    if (soldShares > maxShares + 1e-4) {
      toast.error(`No puedes vender más unidades de las disponibles (${maxShares.toFixed(4)} uds).`);
      return;
    }

    // Clamp si está muy cerca del 100%
    if (soldShares > maxShares) {
      soldShares = maxShares;
    }

    // Cost basis calculation (proportional)
    const originalInvested = Number(sellingLot.investedAmount || sellingLot.shares * sellingLot.purchasePrice);
    const costBasisSold = (soldShares / maxShares) * originalInvested;
    const grossRevenue = soldShares * soldPrice;
    const realizedPnl = grossRevenue - costBasisSold - soldComm;

    const saleRecord = {
      id: `sale_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      lot_id: sellingLot.id,
      lotId: sellingLot.id,
      portfolio_id: portfolioId,
      portfolioId: portfolioId,
      ticker: sellingLot.ticker,
      sale_date: saleDate,
      saleDate: saleDate,
      sale_time: saleTime.trim() || getMarketOpenTime(sellingLot.ticker, sellingLot.exchange),
      saleTime: saleTime.trim() || getMarketOpenTime(sellingLot.ticker, sellingLot.exchange),
      sale_price: soldPrice,
      salePrice: soldPrice,
      shares: soldShares,
      sale_commission: soldComm,
      saleCommission: soldComm,
      realized_pnl: realizedPnl,
      realizedPnl: realizedPnl,
      notes: saleNotes.trim() || undefined,
      purchase_date: sellingLot.date,
      purchaseDate: sellingLot.date,
      cost_basis: costBasisSold,
      costBasis: costBasisSold,
    };

    const remainingShares = Math.max(0, maxShares - soldShares);
    let updatedLot = null;

    if (remainingShares < 1e-5) {
      // 100% sold: lot is completely closed
      updatedLot = {
        ...sellingLot,
        shares: 0,
      };
    } else {
      // Partial sale: reduce shares and remaining invested amount proportionally
      const remainingInvested = originalInvested - costBasisSold;
      updatedLot = {
        ...sellingLot,
        shares: remainingShares,
        investedAmount: remainingInvested,
      };
    }

    await addPurchaseSale(saleRecord, updatedLot);
    setSellingLot(null);
    setSaleShares(0);
    setSaleAmountUSD(0);
    setSalePrice(0);
    setSaleCommission(0);
    setSaleNotes("");
  };

  const handleExecutePlan = async (purchases) => {
    const loadingToast = toast.loading("Registrando compras del plan...");
    try {
      for (const p of purchases) {
        const id = `buy_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const openTime = p.purchaseTime || getMarketOpenTime(p.ticker);
        await addPurchase({
          id,
          portfolioId,
          ticker: p.ticker,
          date: p.date,
          purchaseTime: openTime,
          purchasePrice: p.purchasePrice,
          shares: p.shares,
          manualCurrentPrice: 0,
        });
      }
      toast.success("¡Compras registradas exitosamente!", { id: loadingToast, icon: "🚀" });
      setShowExecutionModal(false);
    } catch (e) {
      toast.error("Error al registrar compras del plan", { id: loadingToast });
    }
  };

  const handleImportXtbPurchases = async (trades) => {
    for (const p of trades) {
      await addPurchase(p);
    }
  };

  const handleSaveManualPrice = (p, manualPrice) => {
    updatePurchase({
      ...p,
      manualCurrentPrice: Number(manualPrice) > 0 ? Number(manualPrice) : undefined,
    });
  };

  const sortedIndexDates = useMemo(
    () => (indicesHistory ? Object.keys(indicesHistory).sort() : []),
    [indicesHistory],
  );

  // Helper to resolve closest trading day price for S&P 500 or NASDAQ without any 10-day cutoff
  const getClosestIndexPrice = useCallback(
    (dateStr, indexName) => {
      if (!dateStr || !indicesHistory || sortedIndexDates.length === 0) return null;
      const cleanDate = String(dateStr).slice(0, 10);
      if (indicesHistory[cleanDate] && Number(indicesHistory[cleanDate][indexName]) > 0) {
        return Number(indicesHistory[cleanDate][indexName]);
      }
      // Binary search / reverse scan for closest trading date <= cleanDate
      for (let i = sortedIndexDates.length - 1; i >= 0; i--) {
        const dKey = sortedIndexDates[i];
        if (dKey <= cleanDate && indicesHistory[dKey] && Number(indicesHistory[dKey][indexName]) > 0) {
          return Number(indicesHistory[dKey][indexName]);
        }
      }
      // Fallback to earliest available trading date if cleanDate precedes all available history
      for (let i = 0; i < sortedIndexDates.length; i++) {
        const dKey = sortedIndexDates[i];
        if (indicesHistory[dKey] && Number(indicesHistory[dKey][indexName]) > 0) {
          return Number(indicesHistory[dKey][indexName]);
        }
      }
      return null;
    },
    [indicesHistory, sortedIndexDates],
  );

  // Calculations for ETF/ETC and Stock lots
  const lotDataList = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const currentSp500 = getClosestIndexPrice(todayStr, "SP500");
    const currentNasdaq = getClosestIndexPrice(todayStr, "NASDAQ");

    return currentPurchases.map((p) => {
      const invested = (p.shares && p.purchasePrice) ? p.shares * p.purchasePrice : (p.investedAmount ?? 0);
      const commission = Number(p.commissionAmount || 0);
      const liveQuote = liveQuotes[p.ticker];
      const cachedQuote = lastKnownQuotes?.[p.ticker];
      const currentPrice = p.manualCurrentPrice || liveQuote?.price || cachedQuote?.price || p.purchasePrice;

      // Calculate current value based on return ratio (ideal for ETFs/ETCs)
      const ratio = p.purchasePrice > 0 ? currentPrice / p.purchasePrice : 1;
      const currentValue = invested * ratio;
      // Net profit discounts broker / Plenti commission: profit = currentValue - (invested + commission)
      const totalCostBasis = invested + commission;
      const profit = currentValue - totalCostBasis;
      const profitPct = totalCostBasis > 0 ? (profit / totalCostBasis) * 100 : 0;

      // S&P 500 and NASDAQ benchmark comparison for the exact purchase date of this lot
      const lotSp500Start = getClosestIndexPrice(p.date, "SP500");
      const sp500ReturnPct =
        lotSp500Start && currentSp500 && lotSp500Start > 0
          ? ((currentSp500 - lotSp500Start) / lotSp500Start) * 100
          : null;
      const sp500EquivValue =
        sp500ReturnPct !== null ? invested * (1 + sp500ReturnPct / 100) : invested;
      const sp500Profit = sp500EquivValue - totalCostBasis;

      const lotNasdaqStart = getClosestIndexPrice(p.date, "NASDAQ");
      const nasdaqReturnPct =
        lotNasdaqStart && currentNasdaq && lotNasdaqStart > 0
          ? ((currentNasdaq - lotNasdaqStart) / lotNasdaqStart) * 100
          : null;
      const nasdaqEquivValue =
        nasdaqReturnPct !== null ? invested * (1 + nasdaqReturnPct / 100) : invested;
      const nasdaqProfit = nasdaqEquivValue - totalCostBasis;

      // FX and Real Yield Calculations
      const historicalFx = fxData.history[p.date] || fxData.current || 1.0;
      const currentFx = fxData.current || 1.0;

      const investedFx = invested * historicalFx;
      const commissionFx = commission * historicalFx;
      const totalCostBasisFx = totalCostBasis * historicalFx;
      const currentValueFx = currentValue * currentFx;
      const profitFx = currentValueFx - totalCostBasisFx;
      const profitPctFx = totalCostBasisFx > 0 ? (profitFx / totalCostBasisFx) * 100 : 0;

      // FX-ISOLATED effect: gain/loss purely from currency movement (assumes zero asset change)
      const fxEffect = invested * (currentFx - historicalFx);
      const fxEffectPct = historicalFx > 0 ? ((currentFx - historicalFx) / historicalFx) * 100 : 0;

      // Real Yield (Inflation)
      let inflationFactor = 1.0;
      let inflationRatePct = 0.0;
      if (
        portfolio.useAutoColInflation &&
        colInflationData.history &&
        Object.keys(colInflationData.history).length > 0
      ) {
        // Find CPI for purchase month
        const pDate = new Date(p.date);
        const pYear = pDate.getFullYear();
        const pMonth = String(pDate.getMonth() + 1).padStart(2, "0");
        let cpiPurchase = colInflationData.history[`${pYear}-${pMonth}-01`];

        // Find latest CPI
        const dates = Object.keys(colInflationData.history).sort();
        const cpiCurrent = colInflationData.history[dates[dates.length - 1]];

        if (!cpiPurchase) {
          // fallback to closest available past date
          const pastDates = dates.filter((d) => d <= p.date);
          if (pastDates.length > 0)
            cpiPurchase = colInflationData.history[pastDates[pastDates.length - 1]];
          else cpiPurchase = cpiCurrent; // fallback to current if extremely old
        }

        if (cpiPurchase && cpiCurrent && cpiPurchase > 0) {
          inflationFactor = cpiCurrent / cpiPurchase;
          inflationRatePct = (inflationFactor - 1) * 100;
        }
      } else {
        const yearsElapsed = Math.max(
          0,
          (new Date().getTime() - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
        );
        const inflationRate = portfolio.inflationRate || 0;
        inflationFactor = Math.pow(1 + inflationRate / 100, yearsElapsed);
        inflationRatePct = (inflationFactor - 1) * 100;
      }

      const currentValueReal = currentValueFx / (inflationFactor > 0 ? inflationFactor : 1.0);
      const inflationLoss = currentValueFx - currentValueReal;
      const profitReal = currentValueReal - totalCostBasisFx;
      const profitPctReal = totalCostBasisFx > 0 ? (profitReal / totalCostBasisFx) * 100 : 0;

      return {
        ...p,
        purchaseTime: p.purchaseTime || getMarketOpenTime(p.ticker, p.exchange),
        name: getAssetName(p.ticker, liveQuote?.name || p.name),
        invested,
        commission,
        commissionFx,
        totalCostBasis,
        totalCostBasisFx,
        currentPrice,
        currentValue,
        profit,
        profitPct,
        sp500ReturnPct,
        sp500EquivValue,
        sp500Profit,
        nasdaqReturnPct,
        nasdaqEquivValue,
        nasdaqProfit,
        investedFx,
        currentValueFx,
        profitFx,
        profitPctFx,
        fxEffect,
        fxEffectPct,
        inflationFactor,
        inflationRatePct,
        inflationLoss,
        currentValueReal,
        profitReal,
        profitPctReal,
        isPositive: profit >= 0,
        hasLiveQuote: liveQuote?.price != null,
      };
    });
  }, [
    currentPurchases,
    liveQuotes,
    lastKnownQuotes,
    fxData,
    portfolio.inflationRate,
    portfolio.useAutoColInflation,
    colInflationData,
    getClosestIndexPrice,
  ]);

  // Persist liveQuotes in global store whenever updated
  useEffect(() => {
    if (liveQuotes && Object.keys(liveQuotes).length > 0 && typeof saveLastKnownQuotes === "function") {
      saveLastKnownQuotes(liveQuotes);
    }
  }, [liveQuotes, saveLastKnownQuotes]);

  const summary = useMemo(() => {
    let totalInvested = 0;
    let totalCommission = 0;
    let totalCommissionFx = 0;
    let totalCurrentValue = 0;
    let totalSp500Value = 0;
    let totalNasdaqValue = 0;
    let hasBenchmarks = false;
    let totalInvestedFx = 0;
    let totalCurrentValueFx = 0;
    let totalCurrentValueReal = 0;
    let totalFxEffect = 0;

    lotDataList.forEach((lot) => {
      totalInvested += lot.invested;
      totalCommission += (lot.commission || 0);
      totalCommissionFx += (lot.commissionFx || 0);
      totalCurrentValue += lot.currentValue;
      totalSp500Value += lot.sp500EquivValue ?? lot.invested;
      totalNasdaqValue += lot.nasdaqEquivValue ?? lot.invested;
      if (lot.sp500ReturnPct !== null || lot.nasdaqReturnPct !== null) {
        hasBenchmarks = true;
      }
      totalInvestedFx += lot.investedFx;
      totalCurrentValueFx += lot.currentValueFx;
      totalCurrentValueReal += lot.currentValueReal;
      totalFxEffect += lot.fxEffect || 0;
    });

    const openCostBasis = totalInvested + totalCommission;
    const openCostBasisFx = totalInvestedFx + totalCommissionFx;
    const openNetReturn = totalCurrentValue - openCostBasis;
    const openNetReturnFx = totalCurrentValueFx - openCostBasisFx;

    const sp500Return = totalSp500Value - totalInvested;
    const sp500ReturnPct = totalInvested > 0 ? (sp500Return / totalInvested) * 100 : 0;
    const nasdaqReturn = totalNasdaqValue - totalInvested;
    const nasdaqReturnPct = totalInvested > 0 ? (nasdaqReturn / totalInvested) * 100 : 0;

    // Realized metrics from closed sales
    const currentFx = fxData.current || 1.0;
    let realizedPnlTotal = 0;
    let realizedProceedsTotal = 0;
    let realizedCostBasisTotal = 0;
    let realizedPnlTotalFx = 0;
    let realizedProceedsTotalFx = 0;
    let realizedCostBasisTotalFx = 0;

    currentSales.forEach((s) => {
      const pnl = Number(s.realizedPnl ?? s.realized_pnl ?? 0);
      const cost = Number(s.costBasis ?? s.cost_basis ?? 0);
      const shares = Number(s.shares ?? 0);
      const prc = Number(s.salePrice ?? s.sale_price ?? 0);
      const grossProceeds = (shares > 0 && prc > 0) ? shares * prc : (cost + pnl);

      realizedPnlTotal += pnl;
      realizedCostBasisTotal += cost;
      realizedProceedsTotal += grossProceeds;

      const saleFx = fxData.history?.[s.saleDate || s.sale_date] || currentFx;
      const buyFx = fxData.history?.[s.purchaseDate || s.purchase_date] || saleFx;

      realizedPnlTotalFx += pnl * saleFx;
      realizedCostBasisTotalFx += cost * buyFx;
      realizedProceedsTotalFx += grossProceeds * saleFx;
    });

    // Total Portfolio Metrics (Open positions + Realized sales)
    const netReturn = openNetReturn + realizedPnlTotal;
    const totalCostBasis = openCostBasis + realizedCostBasisTotal;
    const netReturnPct = totalCostBasis > 0 ? (netReturn / totalCostBasis) * 100 : (openCostBasis > 0 ? (netReturn / openCostBasis) * 100 : 0);

    const netReturnFx = openNetReturnFx + realizedPnlTotalFx;
    const totalCostBasisFx = openCostBasisFx + realizedCostBasisTotalFx;
    const netReturnPctFx = totalCostBasisFx > 0 ? (netReturnFx / totalCostBasisFx) * 100 : (openCostBasisFx > 0 ? (netReturnFx / openCostBasisFx) * 100 : 0);

    // FX effect isolated: purely from currency movement
    const totalFxEffectPct = totalCostBasisFx > 0 ? (totalFxEffect / totalCostBasisFx) * 100 : 0;
    // Asset-only gain in COP = total COP gain minus the FX movement contribution
    const assetGainInCop = netReturnFx - totalFxEffect;
    const assetGainInCopPct = totalCostBasisFx > 0 ? (assetGainInCop / totalCostBasisFx) * 100 : 0;

    const totalInflationLoss = totalCurrentValueFx - totalCurrentValueReal;
    const totalInflationLossPct =
      totalCostBasisFx > 0 ? (totalInflationLoss / totalCostBasisFx) * 100 : 0;

    const netReturnReal = (totalCurrentValueReal - openCostBasisFx) + realizedPnlTotalFx;
    const netReturnPctReal = totalCostBasisFx > 0 ? (netReturnReal / totalCostBasisFx) * 100 : 0;

    return {
      totalInvested,
      totalCommission,
      totalCommissionFx,
      totalCostBasis,
      totalCostBasisFx,
      openCostBasis,
      openCostBasisFx,
      totalCurrentValue,
      totalSp500Value,
      totalNasdaqValue,
      sp500Return,
      sp500ReturnPct,
      nasdaqReturn,
      nasdaqReturnPct,
      hasBenchmarks,
      openNetReturn,
      openNetReturnFx,
      realizedPnlTotal,
      realizedProceedsTotal,
      realizedCostBasisTotal,
      realizedPnlTotalFx,
      realizedProceedsTotalFx,
      realizedCostBasisTotalFx,
      netReturn,
      netReturnPct,
      totalInvestedFx,
      totalCurrentValueFx,
      netReturnFx,
      netReturnPctFx,
      totalFxEffect,
      totalFxEffectPct,
      assetGainInCop,
      assetGainInCopPct,
      totalInflationLoss,
      totalInflationLossPct,
      totalCurrentValueReal,
      netReturnReal,
      netReturnPctReal,
    };
  }, [lotDataList, currentSales, fxData]);

  // Persist calculated portfolio summary in global store for instant access in CashFlowHub
  useEffect(() => {
    if (portfolioId && summary && typeof savePortfolioSummary === "function") {
      savePortfolioSummary(portfolioId, {
        investedUSD: summary.totalInvested,
        marketValueUSD: summary.totalCurrentValue,
        openNetReturnUSD: summary.openNetReturn,
        realizedPnlUSD: summary.realizedPnlTotal,
      });
    }
  }, [portfolioId, summary?.totalInvested, summary?.totalCurrentValue, summary?.openNetReturn, summary?.realizedPnlTotal, savePortfolioSummary]);

  // Group lots by ticker
  const groupedLots = useMemo(() => {
    const groups = {};
    lotDataList.forEach((p) => {
      if (!groups[p.ticker]) {
        groups[p.ticker] = {
          ticker: p.ticker,
          name: getAssetName(p.ticker, p.name),
          lots: [],
          totalInvested: 0,
          totalCommission: 0,
          totalCommissionFx: 0,
          totalCostBasis: 0,
          totalCostBasisFx: 0,
          totalCurrentValue: 0,
          totalSp500Value: 0,
          totalNasdaqValue: 0,
          hasBenchmarks: false,
          totalShares: 0,
          totalInvestedFx: 0,
          totalCurrentValueFx: 0,
          totalInflationLoss: 0,
          totalCurrentValueReal: 0,
        };
      }
      groups[p.ticker].lots.push(p);
      groups[p.ticker].totalInvested += p.invested;
      groups[p.ticker].totalCommission += (p.commission || 0);
      groups[p.ticker].totalCommissionFx += (p.commissionFx || 0);
      groups[p.ticker].totalCostBasis += (p.totalCostBasis || p.invested);
      groups[p.ticker].totalCostBasisFx += (p.totalCostBasisFx || p.investedFx);
      groups[p.ticker].totalCurrentValue += p.currentValue;
      groups[p.ticker].totalSp500Value += p.sp500EquivValue ?? p.invested;
      groups[p.ticker].totalNasdaqValue += p.nasdaqEquivValue ?? p.invested;
      if (p.sp500ReturnPct !== null || p.nasdaqReturnPct !== null) {
        groups[p.ticker].hasBenchmarks = true;
      }
      groups[p.ticker].totalShares += p.shares;
      groups[p.ticker].totalInvestedFx += p.investedFx;
      groups[p.ticker].totalCurrentValueFx += p.currentValueFx;
      groups[p.ticker].totalInflationLoss += p.inflationLoss;
      groups[p.ticker].totalCurrentValueReal += p.currentValueReal;
    });

    Object.values(groups).forEach((g) => {
      g.profit = g.totalCurrentValue - g.totalCostBasis;
      g.profitPct = g.totalCostBasis > 0 ? (g.profit / g.totalCostBasis) * 100 : 0;
      g.isPositive = g.profit >= 0;

      g.sp500Profit = g.totalSp500Value - g.totalInvested;
      g.sp500ProfitPct = g.totalInvested > 0 ? (g.sp500Profit / g.totalInvested) * 100 : 0;
      g.nasdaqProfit = g.totalNasdaqValue - g.totalInvested;
      g.nasdaqProfitPct = g.totalInvested > 0 ? (g.nasdaqProfit / g.totalInvested) * 100 : 0;

      g.profitFx = g.totalCurrentValueFx - g.totalCostBasisFx;
      g.profitPctFx = g.totalCostBasisFx > 0 ? (g.profitFx / g.totalCostBasisFx) * 100 : 0;

      g.profitReal = g.totalCurrentValueReal - g.totalCostBasisFx;
      g.profitPctReal = g.totalCostBasisFx > 0 ? (g.profitReal / g.totalCostBasisFx) * 100 : 0;

      g.currentPrice = g.lots[0].currentPrice;
      g.avgOpenPrice = g.totalShares > 0 ? g.totalInvested / g.totalShares : 0;
      g.lots.sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    return Object.values(groups).sort((a, b) => b.totalInvested - a.totalInvested);
  }, [lotDataList]);

  const [expandedTickers, setExpandedTickers] = useState({});
  const toggleExpand = (ticker) =>
    setExpandedTickers((prev) => ({ ...prev, [ticker]: !prev[ticker] }));

  // Evaluar alertas de venta / recuperación / stop loss automáticamente cuando se actualizan las cotizaciones
  const evaluatedAlertsRef = useRef(new Set());
  useEffect(() => {
    if (!groupedLots.length || !alerts.some((a) => a.is_active && !a.triggered_at)) return;
    const positions = [];
    groupedLots.forEach((g) => {
      positions.push({
        ticker: g.ticker,
        entry_price: g.avgOpenPrice,
        current_price: g.currentPrice,
        return_pct: g.profitPct,
        name: g.name || g.ticker,
        scope_title: `Posición Consolidada (${portfolio.name || portfolioId})`,
      });
      (g.lots || []).forEach((lot) => {
        positions.push({
          ticker: `${g.ticker}::${lot.id}`,
          entry_price: lot.purchasePrice,
          current_price: lot.currentPrice,
          return_pct: lot.profitPct,
          name: `${g.name || g.ticker} (Lote ${lot.date})`,
          scope_title: `Lote ${lot.date} (${portfolio.name || portfolioId})`,
        });
      });
    });

    evaluateStockAlerts({
      scope: "purchase",
      targetId: portfolioId,
      positions,
    })
      .then((res) => {
        if (res?.triggered?.length > 0) {
          res.triggered.forEach((t) => {
            if (!evaluatedAlertsRef.current.has(t.alert_id)) {
              evaluatedAlertsRef.current.add(t.alert_id);
              setAlerts((prev) =>
                prev.map((a) =>
                  a.id === t.alert_id ? { ...a, triggered_at: new Date().toISOString() } : a
                )
              );
              toast(
                () => (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                      <span style={{ fontSize: "1.2rem" }}>
                        {t.alert_type === "STOP_LOSS" ? "🛑" : "🎯"}
                      </span>
                      <span>
                        ¡Alerta alcanzada en {t.ticker}! (
                        {t.current_return_pct >= 0 ? "+" : ""}
                        {t.current_return_pct.toFixed(2)}%)
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      Cotización actual: ${t.current_price.toFixed(2)} (Umbral:{" "}
                      {t.target_value >= 0 ? "+" : ""}
                      {t.target_value}%).{" "}
                      {t.email_sent
                        ? `Se envió aviso a ${t.recipient}.`
                        : `Revisa tu posición en ${t.scope_title}.`}
                    </div>
                  </div>
                ),
                {
                  duration: 9000,
                  position: "top-right",
                  style: {
                    background: theme === "light" ? "#ffffff" : "#0d1b2a",
                    color: theme === "light" ? "#0f172a" : "#f8fafc",
                    border: `1.5px solid ${t.alert_type === "STOP_LOSS" ? "#f43f5e" : "#10b981"}`,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
                    borderRadius: "12px",
                  },
                }
              );
            }
          });
        }
      })
      .catch(() => {});
  }, [groupedLots, alerts, portfolioId, portfolio.name, theme]);

  const handleEditParentTicker = (group, e) => {
    if (e) e.stopPropagation();
    setChangingTickerGroup(group);
  };

  const handleConfirmChangeTicker = async (selectedAsset) => {
    if (!changingTickerGroup || !selectedAsset) return;
    const tickerUpper = selectedAsset.ticker.trim().toUpperCase();
    const newName = selectedAsset.name || changingTickerGroup.name;

    const updates = changingTickerGroup.lots.map((p) => ({
      ...p,
      ticker: tickerUpper,
      name: newName,
    }));

    updateMultiplePurchases(updates);
  };

  const handleStopBatch = () => {
    setAbortBatch(portfolioId);
  };

  const handleBatchRecalculate = async () => {
    if (!currentPurchases.length) return;
    const isConfirmed = await toastConfirm(
      "Esto actualizará el Precio de Apertura de TODOS los lotes consultando el precio histórico real de Yahoo Finance.\n\n¿Deseas continuar?",
    );
    if (!isConfirmed) return;

    runBatchRecalculate(portfolioId, currentPurchases);
  };

  // Historical Chart Rendering
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const getResponsiveChartHeight = () => {
      if (typeof window === "undefined") return 460;
      if (window.innerWidth <= 640) return 280;
      if (window.innerWidth <= 1024) return 350;
      return 460;
    };

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: getResponsiveChartHeight(),
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
      timeScale: {
        borderColor: chartColors.borderColor,
        timeVisible: true,
      },
      rightPriceScale: {
        borderColor: chartColors.borderColor,
        textColor: chartColors.textColor,
        autoScale: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { price: true, time: true },
      },
    });

    chartInstanceRef.current = chart;

    seriesRefs.current.invested = chart.addLineSeries({
      color: chartColors.capital,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      visible: visibleSeries.invested,
    });

    seriesRefs.current.value = chart.addAreaSeries({
      lineColor: chartColors.nav,
      topColor: chartColors.navAreaTop,
      bottomColor: chartColors.navAreaBottom,
      lineWidth: 2,
      visible: visibleSeries.valor,
    });

    seriesRefs.current.sp500 = chart.addLineSeries({
      color: chartColors.sp500,
      lineWidth: 2,
      visible: visibleSeries.sp500,
    });

    seriesRefs.current.nasdaq = chart.addLineSeries({
      color: chartColors.nasdaq,
      lineWidth: 2,
      visible: visibleSeries.nasdaq,
    });

    const sortedPurchases = [...lotDataList].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Also collect closed / sold positions from currentSales so they have historical presence in the chart
    const closedSalesList = currentSales.map((s) => {
      const pDate = s.purchaseDate || s.saleDate;
      const costBasis = Number(s.costBasis || 0);
      const grossRev = Number(s.shares || 0) * Number(s.salePrice || 0);
      const realizedVal = grossRev > 0 ? grossRev : (costBasis + Number(s.realizedPnl || 0));
      return {
        id: s.id,
        ticker: s.ticker,
        purchaseDate: pDate,
        saleDate: s.saleDate,
        invested: costBasis > 0 ? costBasis : realizedVal,
        exitValue: realizedVal,
        realizedPnl: Number(s.realizedPnl || 0),
      };
    });

    const todayStr = new Date().toISOString().split("T")[0];
    const todayTime = new Date(todayStr).getTime();

    // Generate timeline dates: purchase dates + sale dates + today + 1st of every month in between
    const allKeyDates = [
      ...sortedPurchases.map((p) => p.date),
      ...closedSalesList.map((s) => s.purchaseDate),
      ...closedSalesList.map((s) => s.saleDate),
      todayStr,
    ].filter(Boolean);

    const datesSet = new Set(allKeyDates);
    const earliestDateStr = allKeyDates.length > 0
      ? allKeyDates.slice().sort()[0]
      : todayStr;

    if (earliestDateStr) {
      const currentDate = new Date(earliestDateStr);
      const endDate = new Date(todayStr);
      currentDate.setDate(1);
      while (currentDate <= endDate) {
        datesSet.add(currentDate.toISOString().split("T")[0]);
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    const uniqueDates = Array.from(datesSet).sort();

    const investedData = [];
    const valueData = [];
    const sp500Data = [];
    const nasdaqData = [];

    // Only plot S&P/NASDAQ once the index history has actually loaded, so they never show a
    // misleading flat line at the purchase value while fetching (or if the fetch fails).
    const hasIndexData = indicesHistory && Object.keys(indicesHistory).length > 0;

    uniqueDates.forEach((dateStr) => {
      const dateTime = new Date(dateStr).getTime();
      let totalInvested = 0;
      let totalValue = 0;
      let totalSp500 = 0;
      let totalNasdaq = 0;

      const currentSp500 = getClosestIndexPrice(dateStr, "SP500");
      const currentNasdaq = getClosestIndexPrice(dateStr, "NASDAQ");

      // 1. Active lots
      sortedPurchases.forEach((lot) => {
        const lotStartTime = new Date(lot.date).getTime();

        if (lotStartTime <= dateTime) {
          totalInvested += lot.invested;

          if (hasIndexData) {
            if (currentSp500) {
              const lotStartSp500 = getClosestIndexPrice(lot.date, "SP500");
              if (lotStartSp500) totalSp500 += lot.invested * (currentSp500 / lotStartSp500);
              else totalSp500 += lot.invested;
            } else {
              totalSp500 += lot.invested;
            }

            if (currentNasdaq) {
              const lotStartNasdaq = getClosestIndexPrice(lot.date, "NASDAQ");
              if (lotStartNasdaq) totalNasdaq += lot.invested * (currentNasdaq / lotStartNasdaq);
              else totalNasdaq += lot.invested;
            } else {
              totalNasdaq += lot.invested;
            }
          }

          if (dateStr === todayStr) {
            totalValue += lot.currentValue;
          } else if (dateStr === lot.date) {
            totalValue += lot.invested; // At purchase time, value is exactly what was invested
          } else {
            // Linearly interpolate value for realistic historical growth curve
            if (todayTime > lotStartTime) {
              const progress = (dateTime - lotStartTime) / (todayTime - lotStartTime);
              const interpolatedValue = lot.invested + (lot.currentValue - lot.invested) * progress;
              totalValue += interpolatedValue;
            } else {
              totalValue += lot.currentValue;
            }
          }
        }
      });

      // 2. Closed / Sold positions trace during their holding period
      closedSalesList.forEach((closed) => {
        const buyTime = new Date(closed.purchaseDate).getTime();
        const saleTime = new Date(closed.saleDate).getTime();

        if (buyTime <= dateTime && dateTime <= saleTime) {
          // While the lot was held between purchaseDate and saleDate: part of active portfolio exposure
          totalInvested += closed.invested;
          if (hasIndexData) {
            const closedStartSp500 = getClosestIndexPrice(closed.purchaseDate, "SP500");
            if (currentSp500 && closedStartSp500) {
              totalSp500 += closed.invested * (currentSp500 / closedStartSp500);
            } else {
              totalSp500 += closed.invested;
            }
            const closedStartNasdaq = getClosestIndexPrice(closed.purchaseDate, "NASDAQ");
            if (currentNasdaq && closedStartNasdaq) {
              totalNasdaq += closed.invested * (currentNasdaq / closedStartNasdaq);
            } else {
              totalNasdaq += closed.invested;
            }
          }
          if (dateStr === closed.purchaseDate) {
            totalValue += closed.invested;
          } else if (dateStr === closed.saleDate) {
            totalValue += closed.exitValue;
          } else {
            // Interpolate value between purchase cost and exit value over the holding period
            const holdingDuration = saleTime - buyTime;
            const progress = holdingDuration > 0 ? (dateTime - buyTime) / holdingDuration : 1;
            const interpolatedVal = closed.invested + (closed.exitValue - closed.invested) * Math.min(1, Math.max(0, progress));
            totalValue += interpolatedVal;
          }
        }
      });

      investedData.push({ time: dateStr, value: Number(totalInvested.toFixed(2)) });
      valueData.push({ time: dateStr, value: Number(totalValue.toFixed(2)) });
      if (hasIndexData) {
        sp500Data.push({ time: dateStr, value: Number(totalSp500.toFixed(2)) });
        nasdaqData.push({ time: dateStr, value: Number(totalNasdaq.toFixed(2)) });
      }
    });

    seriesRefs.current.invested.setData(investedData);
    seriesRefs.current.value.setData(valueData);

    // Apply markers to highlight stock/ETF purchase points
    if (valueData.length > 0 && purchaseDates.length > 0) {
      const availableTimes = new Set(valueData.map((d) => d.time));
      const sortedTimes = valueData.map((d) => d.time);
      const minTime = sortedTimes[0];
      const maxTime = sortedTimes[sortedTimes.length - 1];
      const minMs = new Date(`${minTime}T00:00:00Z`).getTime() - 4 * 86400000;
      const maxMs = new Date(`${maxTime}T00:00:00Z`).getTime() + 4 * 86400000;
      const markers = [];
      const usedTimes = new Set();

      purchaseDates.forEach((dStr) => {
        const targetMs = new Date(`${dStr}T00:00:00Z`).getTime();
        if (Number.isNaN(targetMs) || targetMs < minMs || targetMs > maxMs) return;
        let matchedTime = null;
        if (availableTimes.has(dStr)) {
          matchedTime = dStr;
        } else {
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
      seriesRefs.current.value.setMarkers(markers);
    } else if (seriesRefs.current.value) {
      seriesRefs.current.value.setMarkers([]);
    }

    seriesRefs.current.sp500.setData(sp500Data);
    seriesRefs.current.nasdaq.setData(nasdaqData);

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        const w = chartContainerRef.current.clientWidth;
        chartInstanceRef.current.applyOptions({
          width: w,
          height: getResponsiveChartHeight(),
        });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [lotDataList, currentSales, indicesHistory, purchasesChartTab]);

  useEffect(() => {
    if (chartInstanceRef.current) {
      applyChartTheme(chartInstanceRef.current, theme, {
        nav: seriesRefs.current.value,
        capital: seriesRefs.current.invested,
        sp500: seriesRefs.current.sp500,
        nasdaq: seriesRefs.current.nasdaq,
      });
    }
  }, [theme]);

  const hasIndexData = indicesHistory && Object.keys(indicesHistory).length > 0;

  return (
    <>
      <div style={{ maxWidth: 1600, width: "100%", margin: "0 auto", paddingBottom: 60, padding: 20, boxSizing: "border-box" }}>
        {/* HEADER & SUMMARY */}
        <div className="card fade-up" style={{ padding: "24px", marginBottom: "24px" }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <h2
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    margin: 0,
                  }}
                >
                  <span>🛒</span> {portfolio.name}
                </h2>

                {purchasePortfolios && purchasePortfolios.length > 1 && onSelectPortfolio && (
                  <select
                    value={portfolioId}
                    onChange={(e) => onSelectPortfolio(e.target.value)}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-accent)",
                      borderRadius: 8,
                      color: "var(--accent-primary)",
                      padding: "4px 10px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      outline: "none",
                    }}
                    title="Cambiar Histórico de Compras"
                  >
                    {purchasePortfolios.map((p) => (
                      <option key={p.id} value={p.id} style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}>
                        📁 {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 20 }}>
                Registra y trackea compras reales de ETFs, ETCs, Acciones y Criptos / Oro Digital (XAUt, PAXG, BTC) con sus valores de
                apertura exactos y descuento de comisiones.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 8, flexWrap: "wrap" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: portfolio.isPlan ? "var(--accent-primary)" : "var(--text-secondary)",
                    padding: "6px 12px",
                    borderRadius: "10px",
                    background: "var(--bg-card-hover)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!portfolio.isPlan}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      togglePortfolioPlan(portfolioId, isChecked, portfolio.planConfig);
                      if (
                        isChecked &&
                        (!autoPlanAnalysis || !autoPlanAnalysis.frequencyDays) &&
                        !portfolio.planConfig
                      ) {
                        setShowPlanModal(true);
                      }
                    }}
                    style={{ accentColor: "var(--accent-primary)", width: 16, height: 16 }}
                  />
                  🤖 Convertir en Plan
                </label>

                <button
                  onClick={() => setShowInflationExplorer(true)}
                  style={{
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: theme === "light" ? "#b45309" : "#f59e0b",
                    padding: "6px 14px",
                    borderRadius: "10px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    minHeight: 34,
                  }}
                >
                  🔍 Ver Historial IPC (
                  {colInflationData.latest?.yoy ? `${colInflationData.latest.yoy}%` : "Colombia"})
                </button>

                <button
                  onClick={() => setShowSettingsModal(true)}
                  style={{
                    background: theme === "light" ? "rgba(0,0,0,0.03)" : "transparent",
                    border: theme === "light" ? "1px solid var(--border)" : "1px solid rgba(255,255,255,0.2)",
                    color: "var(--text-secondary)",
                    padding: "6px 14px",
                    borderRadius: "10px",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    minHeight: 34,
                  }}
                >
                  ⚙️ Configurar Divisa/Inflación
                </button>

                <button
                  onClick={() => setShowXtbModal(true)}
                  style={{
                    background: theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)",
                    border: theme === "light" ? "1px solid rgba(2, 132, 199, 0.3)" : "1px solid rgba(0, 229, 255, 0.35)",
                    color: theme === "light" ? "#0284c7" : "#00e5ff",
                    padding: "6px 14px",
                    borderRadius: "10px",
                    fontSize: "0.8rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    minHeight: 34,
                    fontWeight: 700,
                  }}
                  title="Importar compras copiadas desde xStation 5 de XTB"
                >
                  📥 Importar de XTB
                </button>
              </div>
            </div>

            {portfolioId !== "hist_default" && (
              <button
                onClick={async () => {
                  const isConfirmed = await toastConfirm(
                    `¿Estás seguro de eliminar el portafolio "${portfolio.name}" y todas sus compras?`,
                  );
                  if (isConfirmed) {
                    deletePurchasePortfolio(portfolioId);
                  }
                }}
                className="btn btn-sm"
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                }}
              >
                🗑️ Eliminar Portafolio
              </button>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 24px 0" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 4,
                background: theme === "light" ? "#f1f5f9" : "rgba(0,0,0,0.3)",
                borderRadius: 20,
                padding: 4,
                border: theme === "light" ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.1)",
                maxWidth: "100%",
              }}
            >
              <button
                onClick={() => setYieldViewMode("USD")}
                style={{
                  padding: "6px 16px",
                  borderRadius: 16,
                  border: "none",
                  background: yieldViewMode === "USD" ? (theme === "light" ? "#ffffff" : "rgba(255,255,255,0.1)") : "transparent",
                  color: yieldViewMode === "USD" ? (theme === "light" ? "#0284c7" : "#fff") : (theme === "light" ? "#64748b" : "var(--text-muted)"),
                  boxShadow: yieldViewMode === "USD" && theme === "light" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  fontSize: "0.8rem",
                  fontWeight: yieldViewMode === "USD" ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Nominal ({portfolio.assetCurrency || "USD"})
              </button>
              <button
                onClick={() => {
                  if (
                    portfolio.localCurrency &&
                    portfolio.localCurrency !== (portfolio.assetCurrency || "USD")
                  ) {
                    setYieldViewMode("FX");
                  } else if (portfolio.localCurrency) {
                    setYieldViewMode("FX");
                  } else {
                    toast("Configura tu Divisa Local en ⚙️ primero.", { icon: "ℹ️" });
                  }
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 16,
                  border: "none",
                  background: yieldViewMode === "FX" ? (theme === "light" ? "#ffffff" : "rgba(0, 229, 255, 0.15)") : "transparent",
                  color: yieldViewMode === "FX" ? (theme === "light" ? "#0284c7" : "#00e5ff") : (theme === "light" ? "#64748b" : "var(--text-muted)"),
                  boxShadow: yieldViewMode === "FX" && theme === "light" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  fontSize: "0.8rem",
                  fontWeight: yieldViewMode === "FX" ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Divisa ({portfolio.localCurrency || "COP"}){" "}
                {isFetchingFx && yieldViewMode === "FX" && "⏳"}
              </button>
              <button
                onClick={() => {
                  if (portfolio.useAutoColInflation || portfolio.inflationRate > 0) {
                    setYieldViewMode("REAL");
                  } else {
                    toast("Configura la Inflación en ⚙️ primero.", { icon: "ℹ️" });
                  }
                }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 16,
                  border: "none",
                  background: yieldViewMode === "REAL" ? (theme === "light" ? "#ffffff" : "rgba(245, 158, 11, 0.15)") : "transparent",
                  color: yieldViewMode === "REAL" ? (theme === "light" ? "#d97706" : "#f59e0b") : (theme === "light" ? "#64748b" : "var(--text-muted)"),
                  boxShadow: yieldViewMode === "REAL" && theme === "light" ? "0 2px 6px rgba(0,0,0,0.08)" : "none",
                  fontSize: "0.8rem",
                  fontWeight: yieldViewMode === "REAL" ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Poder Adquisitivo Real {isFetchingInflation && yieldViewMode === "REAL" && "⏳"}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 16,
            }}
          >
            <div
              style={{
                padding: 16,
                background: theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.02)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Capital Total Invertido (
                {yieldViewMode === "USD"
                  ? portfolio.assetCurrency || "USD"
                  : portfolio.localCurrency || "COP"}
                )
              </div>
              <div
                className="mono"
                style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)" }}
              >
                $
                {yieldViewMode === "USD"
                  ? summary.totalInvested.toFixed(2)
                  : summary.totalInvestedFx.toFixed(2)}
              </div>
            </div>
            <div
              style={{
                padding: 16,
                background: theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.02)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Valor Actual {yieldViewMode === "REAL" && "(Ajustado)"}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  color: yieldViewMode === "REAL"
                    ? (theme === "light" ? "#d97706" : "#f59e0b")
                    : (theme === "light" ? "#0284c7" : "#00e5ff"),
                }}
              >
                $
                {yieldViewMode === "USD"
                  ? summary.totalCurrentValue.toFixed(2)
                  : yieldViewMode === "FX"
                    ? summary.totalCurrentValueFx.toFixed(2)
                    : summary.totalCurrentValueReal.toFixed(2)}
              </div>
            </div>
            {(() => {
              const netReturn =
                yieldViewMode === "USD"
                  ? summary.netReturn
                  : yieldViewMode === "FX"
                    ? summary.netReturnFx
                    : summary.netReturnReal;
              const netReturnPct =
                yieldViewMode === "USD"
                  ? summary.netReturnPct
                  : yieldViewMode === "FX"
                    ? summary.netReturnPctFx
                    : summary.netReturnPctReal;
              const isPositive = netReturn >= 0;
              const color = isPositive
                ? (theme === "light" ? "#16a34a" : "#4ade80")
                : (theme === "light" ? "#dc2626" : "#f87171");
              const bgColor = isPositive
                ? (theme === "light" ? "rgba(22, 163, 74, 0.08)" : "rgba(34, 197, 94, 0.05)")
                : (theme === "light" ? "rgba(220, 38, 38, 0.08)" : "rgba(239, 68, 68, 0.05)");
              const borderColor = isPositive
                ? (theme === "light" ? "rgba(22, 163, 74, 0.25)" : "rgba(34, 197, 94, 0.2)")
                : (theme === "light" ? "rgba(220, 38, 38, 0.25)" : "rgba(239, 68, 68, 0.2)");

              return (
                <div
                  style={{
                    padding: 16,
                    background: bgColor,
                    borderRadius: "var(--radius)",
                    border: `1px solid ${borderColor}`,
                  }}
                >
                  <div style={{ fontSize: "0.75rem", color }}>Beneficio Neto Total</div>
                  <div className="mono" style={{ fontSize: "1.4rem", fontWeight: 800, color }}>
                    {isPositive ? "+" : ""}${netReturn.toFixed(2)}
                    <span style={{ fontSize: "0.8rem", marginLeft: 8 }}>
                      ({isPositive ? "+" : ""}
                      {netReturnPct.toFixed(2)}%)
                    </span>
                  </div>
                  {summary.realizedPnlTotal !== 0 && (
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>
                      Latente: <span className="mono" style={{ color: summary.openNetReturn >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>{summary.openNetReturn >= 0 ? "+" : ""}${summary.openNetReturn.toFixed(2)}</span>
                      {" | "}
                      Realizado: <span className="mono" style={{ color: summary.realizedPnlTotal >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>{summary.realizedPnlTotal >= 0 ? "+" : ""}${summary.realizedPnlTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* S&P 500 & NASDAQ Benchmark Comparison Card */}
            <div
              style={{
                padding: 16,
                background: theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.02)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>
                <span>Benchmarks (Mismas Fechas)</span>
                <InfoTooltip
                  customContent={{
                    title: "Comparativa Cash-Flow Exacta vs S&P 500 y NASDAQ",
                    tag: "BENCHMARKING",
                    tagColor: "#ec4899",
                    explanation:
                      "Calcula cuánto habrías ganado en USD si cada dólar invertido en tus lotes individuales se hubiera depositado exactamente en la misma fecha de compra en el S&P 500 (^GSPC) o en el NASDAQ (^IXIC).",
                    rule: "Permite evaluar tu Alpha real frente al mercado estadounidense descontando el efecto calendario de tus aportes.",
                  }}
                />
              </div>
              {summary.hasBenchmarks ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: "0.74rem", fontWeight: 700, color: theme === "light" ? "#be185d" : "#ec4899", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme === "light" ? "#be185d" : "#ec4899" }} />
                      S&P 500
                    </span>
                    <span className="mono" style={{ fontSize: "0.86rem", fontWeight: 800, color: summary.sp500Return >= 0 ? (theme === "light" ? "#16a34a" : "#4ade80") : (theme === "light" ? "#dc2626" : "#f87171") }}>
                      {summary.sp500Return >= 0 ? "+" : ""}${summary.sp500Return.toFixed(2)}{" "}
                      <span style={{ fontSize: "0.75rem" }}>
                        ({summary.sp500ReturnPct >= 0 ? "+" : ""}{summary.sp500ReturnPct.toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: "0.74rem", fontWeight: 700, color: theme === "light" ? "#6d28d9" : "#8b5cf6", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme === "light" ? "#6d28d9" : "#8b5cf6" }} />
                      NASDAQ
                    </span>
                    <span className="mono" style={{ fontSize: "0.86rem", fontWeight: 800, color: summary.nasdaqReturn >= 0 ? (theme === "light" ? "#16a34a" : "#4ade80") : (theme === "light" ? "#dc2626" : "#f87171") }}>
                      {summary.nasdaqReturn >= 0 ? "+" : ""}${summary.nasdaqReturn.toFixed(2)}{" "}
                      <span style={{ fontSize: "0.75rem" }}>
                        ({summary.nasdaqReturnPct >= 0 ? "+" : ""}{summary.nasdaqReturnPct.toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  ⏳ Calculando comparativa de índices...
                </div>
              )}
            </div>
          </div>

          {/* ── 3-Level Comparative Breakdown Card (Nominal vs Divisa vs Real) ── */}
          <div
            style={{
              marginTop: 16,
              padding: "16px 20px",
              background: theme === "light" ? "var(--bg-card)" : "rgba(0,0,0,0.25)",
              borderRadius: "var(--radius)",
              border: theme === "light" ? "1px solid var(--border)" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: theme === "light" ? "var(--shadow-card)" : "none",
            }}
          >
            <div
              style={{
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "var(--text-secondary)",
                marginBottom: showBreakdownCard ? 12 : 0,
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
                    color: theme === "light" ? "#b45309" : "#f59e0b",
                    background: theme === "light" ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.1)",
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  {portfolio.useAutoColInflation
                    ? "IPC Automático (FRED/DANE)"
                    : `Inflación Manual ${portfolio.inflationRate || 0}%/año`}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBreakdownCard(!showBreakdownCard);
                }}
                style={{
                  background: theme === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
                  border: theme === "light" ? "1px solid var(--border)" : "1px solid rgba(255,255,255,0.12)",
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
                    gap: 14,
                  }}
                >
              {/* Level 1: Nominal */}
              <div
                style={{
                  padding: 12,
                  background: theme === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)",
                  borderRadius: 8,
                  border: theme === "light" ? "1px solid var(--border)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: theme === "light" ? "#64748b" : "#94a3b8", textTransform: "uppercase", fontWeight: 700 }}>
                  1. Nominal ({portfolio.assetCurrency || "USD"})
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 800,
                    color: summary.netReturn >= 0 ? (theme === "light" ? "#16a34a" : "#4ade80") : (theme === "light" ? "#dc2626" : "#f87171"),
                    marginTop: 4,
                  }}
                >
                  {summary.netReturn >= 0 ? "+" : ""}${summary.netReturn.toFixed(2)} (
                  {summary.netReturnPct >= 0 ? "+" : ""}
                  {summary.netReturnPct.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Inv: ${summary.totalInvested.toFixed(2)}
                  {summary.totalCommission > 0 && ` + Fees: $${summary.totalCommission.toFixed(2)}`}
                  {" "}➔ Val: ${summary.totalCurrentValue.toFixed(2)}
                </div>
              </div>

              {/* Level 2: FX Adjusted */}
              <div
                style={{
                  padding: 12,
                  background: theme === "light" ? "rgba(2, 132, 199, 0.05)" : "rgba(0, 229, 255, 0.03)",
                  borderRadius: 8,
                  border: theme === "light" ? "1px solid rgba(2, 132, 199, 0.2)" : "1px solid rgba(0, 229, 255, 0.15)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: theme === "light" ? "#0284c7" : "#00e5ff", textTransform: "uppercase", fontWeight: 700 }}>
                  2. Al Cambio Divisa ({portfolio.localCurrency || "COP"})
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 800,
                    color: summary.netReturnFx >= 0 ? (theme === "light" ? "#16a34a" : "#4ade80") : (theme === "light" ? "#dc2626" : "#f87171"),
                    marginTop: 4,
                  }}
                >
                  {summary.netReturnFx >= 0 ? "+" : ""}${summary.netReturnFx.toFixed(2)} (
                  {summary.netReturnPctFx >= 0 ? "+" : ""}
                  {summary.netReturnPctFx.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Inv: ${summary.totalInvestedFx.toFixed(2)} ➔ Val: $
                  {summary.totalCurrentValueFx.toFixed(2)}
                </div>
              </div>

              {/* Level 3: Real Purchasing Power */}
              <div
                style={{
                  padding: 12,
                  background: theme === "light" ? "rgba(245, 158, 11, 0.05)" : "rgba(245, 158, 11, 0.03)",
                  borderRadius: 8,
                  border: theme === "light" ? "1px solid rgba(245, 158, 11, 0.25)" : "1px solid rgba(245, 158, 11, 0.15)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: theme === "light" ? "#b45309" : "#f59e0b", textTransform: "uppercase", fontWeight: 700 }}>
                  3. Poder Adquisitivo Real (Neto)
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 800,
                    color: summary.netReturnReal >= 0 ? (theme === "light" ? "#d97706" : "#f59e0b") : (theme === "light" ? "#dc2626" : "#f87171"),
                    marginTop: 4,
                  }}
                >
                  {summary.netReturnReal >= 0 ? "+" : ""}${summary.netReturnReal.toFixed(2)} (
                  {summary.netReturnPctReal >= 0 ? "+" : ""}
                  {summary.netReturnPctReal.toFixed(2)}%)
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Val. Real: ${summary.totalCurrentValueReal.toFixed(2)} (Resta inflación)
                </div>
              </div>
            </div>

            {/* FX Effect Isolated Block */}
            {portfolio.localCurrency &&
              portfolio.localCurrency !== (portfolio.assetCurrency || "USD") && (
                <div
                style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: theme === "light" ? "rgba(2, 132, 199, 0.05)" : "rgba(0, 229, 255, 0.04)",
                  borderRadius: 8,
                  border: theme === "light" ? "1px dashed rgba(2, 132, 199, 0.25)" : "1px dashed rgba(0, 229, 255, 0.2)",
                  fontSize: "0.78rem",
                }}
              >
                <div style={{ fontWeight: 700, color: theme === "light" ? "#0284c7" : "#00e5ff", marginBottom: 6 }}>
                  💱 Efecto Cambiario Aislado (USD→{portfolio.localCurrency || "COP"})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    Si el dólar no hubiera movido, tu ganancia en COP sería:
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      color: summary.assetGainInCop >= 0 ? (theme === "light" ? "#16a34a" : "#4ade80") : (theme === "light" ? "#dc2626" : "#f87171"),
                    }}
                  >
                    {summary.assetGainInCop >= 0 ? "+" : ""}
                    {summary.assetGainInCop.toFixed(2)} ({summary.assetGainInCop >= 0 ? "+" : ""}
                    {summary.assetGainInCopPct.toFixed(2)}%)
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>+</span>
                  <span style={{ color: theme === "light" ? "#0284c7" : "#00e5ff", fontWeight: 600 }}>Movimiento divisa:</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      color: summary.totalFxEffect >= 0 ? (theme === "light" ? "#16a34a" : "#4ade80") : (theme === "light" ? "#dc2626" : "#f87171"),
                    }}
                  >
                    {summary.totalFxEffect >= 0 ? "+" : ""}
                    {summary.totalFxEffect.toFixed(2)} ({summary.totalFxEffect >= 0 ? "+" : ""}
                    {summary.totalFxEffectPct.toFixed(2)}%)
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>= Ganancia total COP</span>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 800,
                      color: summary.netReturnFx >= 0 ? (theme === "light" ? "#16a34a" : "#4ade80") : (theme === "light" ? "#dc2626" : "#f87171"),
                    }}
                  >
                    {summary.netReturnFx >= 0 ? "+" : ""}
                    {summary.netReturnFx.toFixed(2)} ({summary.netReturnFx >= 0 ? "+" : ""}
                    {summary.netReturnPctFx.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Explicit Deduction Equation Bar */}
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: theme === "light" ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.06)",
                borderRadius: 8,
                border: theme === "light" ? "1px dashed rgba(245, 158, 11, 0.35)" : "1px dashed rgba(245, 158, 11, 0.25)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: "0.78rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: theme === "light" ? "#0284c7" : "#00e5ff", fontWeight: 700 }}>
                  Ganancia Bruta ({portfolio.localCurrency || "COP"}):
                </span>
                <span
                  className="mono"
                  style={{
                    color: summary.netReturnFx >= 0 ? (theme === "light" ? "#16a34a" : "#4ade80") : (theme === "light" ? "#dc2626" : "#f87171"),
                    fontWeight: 700,
                  }}
                >
                  {summary.netReturnFx >= 0 ? "+" : ""}${summary.netReturnFx.toFixed(2)}
                </span>
                <span style={{ color: "var(--text-muted)" }}>➖</span>
                <span style={{ color: theme === "light" ? "#dc2626" : "#f87171", fontWeight: 700 }}>
                  Descuento Inflación (IPC):
                </span>
                <span className="mono" style={{ color: theme === "light" ? "#dc2626" : "#f87171", fontWeight: 700 }}>
                  -${summary.totalInflationLoss.toFixed(2)} (
                  {summary.totalInflationLossPct.toFixed(2)}%)
                </span>
                <span style={{ color: "var(--text-muted)" }}>🟰</span>
                <span style={{ color: theme === "light" ? "#b45309" : "#f59e0b", fontWeight: 700 }}>Ganancia Real Neta:</span>
                <span
                  className="mono"
                  style={{
                    color: summary.netReturnReal >= 0 ? (theme === "light" ? "#d97706" : "#f59e0b") : (theme === "light" ? "#dc2626" : "#f87171"),
                    fontWeight: 800,
                  }}
                >
                  {summary.netReturnReal >= 0 ? "+" : ""}${summary.netReturnReal.toFixed(2)} (
                  {summary.netReturnPctReal >= 0 ? "+" : ""}
                  {summary.netReturnPctReal.toFixed(2)}% Real)
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>

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
                ⚙️ Configuración del Portafolio
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
                    value={portfolio.assetCurrency || "USD"}
                    onChange={(e) =>
                      updatePortfolioSettings(
                        portfolio.id,
                        e.target.value,
                        portfolio.localCurrency || "COP",
                        portfolio.inflationRate || 0,
                        portfolio.useAutoColInflation || false,
                      )
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
                    value={portfolio.localCurrency || "COP"}
                    onChange={(e) =>
                      updatePortfolioSettings(
                        portfolio.id,
                        portfolio.assetCurrency || "USD",
                        e.target.value,
                        portfolio.inflationRate || 0,
                        portfolio.useAutoColInflation || false,
                      )
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
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginTop: -8,
                  marginBottom: 16,
                }}
              >
                Calcularemos la ganancia en Divisa Local ajustando por la tasa de cambio histórica
                vs actual del par seleccionado.
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
                    checked={portfolio.useAutoColInflation || false}
                    onChange={(e) =>
                      updatePortfolioSettings(
                        portfolio.id,
                        portfolio.assetCurrency || "USD",
                        portfolio.localCurrency || "COP",
                        portfolio.inflationRate || 0,
                        e.target.checked,
                      )
                    }
                  />
                  Usar Inflación Automática (Colombia, mensual)
                </label>

                {!portfolio.useAutoColInflation && (
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
                      value={portfolio.inflationRate || 0}
                      onChange={(e) =>
                        updatePortfolioSettings(
                          portfolio.id,
                          portfolio.assetCurrency || "USD",
                          portfolio.localCurrency || "COP",
                          Number.parseFloat(e.target.value) || 0,
                          false,
                        )
                      }
                      className="input"
                      style={{ width: "100%" }}
                    />
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>
                      Descontaremos este % anual compuesto según el tiempo transcurrido de cada
                      lote.
                    </div>
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

        {/* SMART ANALYSIS CARD */}
        {portfolio.isPlan && (
          <div
            className="card fade-up"
            style={{
              padding: "20px",
              marginBottom: "24px",
              background: "rgba(0, 229, 255, 0.03)",
              border: "1px solid rgba(0, 229, 255, 0.15)",
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
            >
              <h3
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: isLight ? "#0284c7" : "#00e5ff",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>🤖</span> Análisis Inteligente del Plan{" "}
                {planAnalysis?.isManual && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.12)",
                      color: isLight ? "#0284c7" : "#00e5ff",
                      padding: "2px 6px",
                      borderRadius: 10,
                      fontWeight: 600,
                    }}
                  >
                    (Manual)
                  </span>
                )}
              </h3>
              <div style={{ display: "flex", gap: 10 }}>
                {planAnalysis?.nextDate &&
                  new Date().toISOString().split("T")[0] >= planAnalysis.nextDate && (
                    <button
                      onClick={() => setShowExecutionModal(true)}
                      className="btn btn-sm"
                      style={{
                        background: isLight ? "#0284c7" : "#00e5ff",
                        color: isLight ? "#ffffff" : "#000",
                        fontWeight: 600,
                        border: "none",
                        boxShadow: isLight ? "0 2px 8px rgba(2, 132, 199, 0.3)" : "0 0 10px rgba(0, 229, 255, 0.4)",
                      }}
                    >
                      🚀 Ejecutar Plan
                    </button>
                  )}
                <button
                  onClick={() => setShowPlanModal(true)}
                  className="btn btn-sm"
                  style={{
                    background: isLight ? "rgba(2, 132, 199, 0.06)" : "transparent",
                    border: isLight ? "1px solid rgba(2, 132, 199, 0.3)" : "1px solid rgba(0, 229, 255, 0.3)",
                    color: isLight ? "#0284c7" : "#00e5ff",
                    fontWeight: 600,
                  }}
                >
                  ⚙️ Configurar
                </button>
              </div>
            </div>

            {planAnalysis ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Frecuencia Detectada
                    </div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: isLight ? "#0f172a" : "#f1f5f9" }}>
                      {planAnalysis.frequencyDays
                        ? `Cada ${planAnalysis.frequencyDays} días`
                        : "---"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Inversión Promedio
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: "1.1rem", fontWeight: 700, color: isLight ? "#0f172a" : "#f1f5f9" }}
                    >
                      ${planAnalysis.avgAmount?.toFixed(2) || "0.00"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Próxima Inversión Esperada
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 700,
                          color: planAnalysis.nextDate
                            ? new Date().toISOString().split("T")[0] >= planAnalysis.nextDate
                              ? "#ef4444"
                              : (isLight ? "#16a34a" : "#4ade80")
                            : "var(--text-muted)",
                        }}
                      >
                        {planAnalysis.nextDate ? planAnalysis.nextDate : "---"}
                      </div>
                      {planAnalysis.nextDate &&
                        new Date().toISOString().split("T")[0] >= planAnalysis.nextDate && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              background: "#ef444420",
                              color: "#ef4444",
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontWeight: 700,
                              animation: "pulse 2s infinite",
                            }}
                          >
                            ¡PENDIENTE!
                          </span>
                        )}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                      title="Dinero sobrante de tus depósitos esperados menos lo invertido realmente"
                    >
                      Reserva en Efectivo Acum.
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        color: cashReserve > 0 ? (isLight ? "#d97706" : "#f59e0b") : "var(--text-muted)",
                      }}
                    >
                      {cashReserve > 0 ? "+" : ""}${cashReserve.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8 }}>
                    Distribución Objetivo Detectada (Promedio):
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {planAnalysis.distribution &&
                      Object.entries(planAnalysis.distribution).map(([ticker, pct]) => (
                        <div
                          key={ticker}
                          style={{
                            padding: "5px 12px",
                            background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)",
                            border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: 12,
                            fontSize: "0.82rem",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            color: isLight ? "#0f172a" : "#f1f5f9",
                          }}
                        >
                          <span style={{ fontWeight: 800 }}>{ticker}</span>
                          <span style={{ color: isLight ? "#0284c7" : "#00e5ff", fontWeight: 700 }}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.9rem",
                  background: "rgba(0,0,0,0.2)",
                  borderRadius: 8,
                }}
              >
                No hay suficientes datos para detectar un patrón automáticamente.
                <br />
                <button
                  onClick={() => setShowPlanModal(true)}
                  className="btn btn-sm btn-primary"
                  style={{ marginTop: 12 }}
                >
                  Configurar Manualmente
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Chart Mode Tabs (Portafolio vs Divisa USD/COP) ── */}
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
              background: theme === "light" ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.03)",
              padding: "4px",
              borderRadius: 10,
              border: `1px solid ${theme === "light" ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.06)"}`,
              maxWidth: "100%",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => setPurchasesChartTab("portfolio")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 14px",
                borderRadius: 7,
                border: purchasesChartTab === "portfolio"
                  ? `1px solid ${theme === "light" ? "rgba(2, 132, 199, 0.4)" : "rgba(0, 229, 255, 0.4)"}`
                  : "1px solid transparent",
                background: purchasesChartTab === "portfolio"
                  ? theme === "light" ? "rgba(2, 132, 199, 0.12)" : "rgba(0, 229, 255, 0.12)"
                  : "transparent",
                color: purchasesChartTab === "portfolio"
                  ? theme === "light" ? "#0284c7" : "var(--accent-primary)"
                  : "var(--text-secondary)",
                fontSize: "0.85rem",
                fontWeight: purchasesChartTab === "portfolio" ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.18s ease",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span>📈</span>
              <span>Portafolio General ({portfolio.name || "Compras"})</span>
            </button>

            <button
              type="button"
              onClick={() => setPurchasesChartTab("individual")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 14px",
                borderRadius: 7,
                border: purchasesChartTab === "individual"
                  ? `1px solid ${theme === "light" ? "rgba(16, 185, 129, 0.4)" : "rgba(16, 185, 129, 0.4)"}`
                  : "1px solid transparent",
                background: purchasesChartTab === "individual"
                  ? theme === "light" ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.12)"
                  : "transparent",
                color: purchasesChartTab === "individual"
                  ? theme === "light" ? "#059669" : "#34d399"
                  : "var(--text-secondary)",
                fontSize: "0.85rem",
                fontWeight: purchasesChartTab === "individual" ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.18s ease",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span>🔍</span>
              <span>Acción o Lote Individual</span>
              {currentPurchases.length > 0 && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: theme === "light" ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.25)",
                    color: theme === "light" ? "#047857" : "#34d399",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    display: "inline-flex",
                    marginLeft: 4,
                  }}
                >
                  {groupedLots.length} activos • {currentPurchases.length} lotes
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setPurchasesChartTab("fx")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 14px",
                borderRadius: 7,
                border: purchasesChartTab === "fx"
                  ? `1px solid ${theme === "light" ? "rgba(245, 158, 11, 0.5)" : "rgba(245, 158, 11, 0.5)"}`
                  : "1px solid transparent",
                background: purchasesChartTab === "fx"
                  ? theme === "light" ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.15)"
                  : "transparent",
                color: purchasesChartTab === "fx"
                  ? theme === "light" ? "#d97706" : "#fbbf24"
                  : "var(--text-secondary)",
                fontSize: "0.85rem",
                fontWeight: purchasesChartTab === "fx" ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.18s ease",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span>💱</span>
              <span>Divisa USD / COP</span>
            </button>
          </div>
        </div>

        {/* GRAPH CONTAINER */}
        <div className="card chart-card fade-up" style={{ padding: "20px", marginBottom: "24px" }}>
          {purchasesChartTab === "fx" ? (
            <FxRateExplorer
              defaultAsset="USD"
              defaultLocal="COP"
              period={selectedTimeRange}
              onPeriodChange={handleTimeRange}
              purchaseDates={purchaseDates}
              minDate={earliestDate}
            />
          ) : purchasesChartTab === "individual" ? (
            <IndividualHoldingChart
              purchases={lotDataList}
              activeKey={selectedHoldingKey}
              onSelectKey={setSelectedHoldingKey}
            />
          ) : (
            <>
              <div
                className="purchases-chart-header"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 16,
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
            <h3
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span>📈</span>
              <span>Evolución del Portafolio Histórico</span>
            </h3>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
                flexWrap: "wrap",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: "0.75rem",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => toggleSeries("valor")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: theme === "light" ? "#0284c7" : "#00e5ff",
                    fontWeight: 700,
                    opacity: visibleSeries.valor ? 1 : 0.4,
                  }}
                >
                  <span
                    style={{ width: 10, height: 10, borderRadius: "50%", background: theme === "light" ? "#0284c7" : "#00e5ff" }}
                  />{" "}
                  Valor ({summary.netReturnPct >= 0 ? "+" : ""}{summary.netReturnPct.toFixed(1)}%)
                </button>
                <button
                  onClick={() => toggleSeries("sp500")}
                  disabled={!hasIndexData}
                  title={!hasIndexData ? "Cargando datos de índices…" : "Mostrar/ocultar S&P 500"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: hasIndexData ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: theme === "light" ? "#be185d" : "#ec4899",
                    fontWeight: 700,
                    opacity: hasIndexData ? (visibleSeries.sp500 ? 1 : 0.4) : 0.3,
                  }}
                >
                  <span style={{ width: 10, height: 2, background: theme === "light" ? "#be185d" : "#ec4899" }} /> S&P 500
                  {summary.hasBenchmarks && (
                    <span className="mono" style={{ fontSize: "0.7rem" }}>
                      ({summary.sp500ReturnPct >= 0 ? "+" : ""}{summary.sp500ReturnPct.toFixed(1)}%)
                    </span>
                  )}
                </button>
                <button
                  onClick={() => toggleSeries("nasdaq")}
                  disabled={!hasIndexData}
                  title={!hasIndexData ? "Cargando datos de índices…" : "Mostrar/ocultar NASDAQ"}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: hasIndexData ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: theme === "light" ? "#6d28d9" : "#8b5cf6",
                    fontWeight: 700,
                    opacity: hasIndexData ? (visibleSeries.nasdaq ? 1 : 0.4) : 0.3,
                  }}
                >
                  <span style={{ width: 10, height: 2, background: theme === "light" ? "#6d28d9" : "#8b5cf6" }} /> NASDAQ
                  {summary.hasBenchmarks && (
                    <span className="mono" style={{ fontSize: "0.7rem" }}>
                      ({summary.nasdaqReturnPct >= 0 ? "+" : ""}{summary.nasdaqReturnPct.toFixed(1)}%)
                    </span>
                  )}
                </button>
                <button
                  onClick={() => toggleSeries("invested")}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: theme === "light" ? "#b45309" : "#f59e0b",
                    fontWeight: 700,
                    opacity: visibleSeries.invested ? 1 : 0.4,
                  }}
                >
                  <span style={{ width: 10, height: 2, background: theme === "light" ? "#b45309" : "#f59e0b" }} /> Invertido
                </button>
              </div>

              {!hasIndexData && (
                <span
                  style={{
                    fontSize: "0.68rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: "0.8rem" }}>⏳</span> Cargando S&P 500 / NASDAQ…
                </span>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                  maxWidth: "100%",
                }}
              >
                {/* Botón Actualizar Manual */}
                <button
                  type="button"
                  onClick={handleManualChartRefresh}
                  disabled={isRefreshingChart}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 4,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: isRefreshingChart ? "not-allowed" : "pointer",
                    background: theme === "light" ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.04)",
                    border: `1px solid ${theme === "light" ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.1)"}`,
                    color: theme === "light" ? "#0284c7" : "#38bdf8",
                    transition: "all 0.15s ease",
                    minHeight: 26,
                    opacity: isRefreshingChart ? 0.7 : 1,
                  }}
                  title="Actualizar cotizaciones e índices históricos sin recargar la página"
                >
                  <span
                    style={{
                      display: "inline-block",
                      animation: isRefreshingChart ? "spin 0.8s linear infinite" : "none",
                    }}
                  >
                    🔄
                  </span>
                  <span>{isRefreshingChart ? "Actualizando…" : "Actualizar"}</span>
                </button>

                {["1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"].map((range) => {
                  const isSelected = selectedTimeRange === range;
                  const isEnabled = isRangeEnabled(range);
                  return (
                    <button
                      key={range}
                      onClick={() => handleTimeRange(range)}
                      disabled={!isEnabled}
                      style={{
                        background: isSelected
                          ? theme === "light"
                            ? "#0284c7"
                            : "var(--accent-primary)"
                          : theme === "light"
                          ? "rgba(0,0,0,0.05)"
                          : "rgba(255,255,255,0.05)",
                        border: isSelected
                          ? `1px solid ${theme === "light" ? "#0284c7" : "var(--accent-primary)"}`
                          : `1px solid ${theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
                        color: isSelected
                          ? theme === "light"
                            ? "#ffffff"
                            : "#0d1117"
                          : "var(--text-secondary)",
                        borderRadius: 4,
                        padding: "3px 8px",
                        fontSize: "0.72rem",
                        fontWeight: isSelected ? 700 : 500,
                        cursor: isEnabled ? "pointer" : "not-allowed",
                        opacity: isEnabled ? 1 : 0.35,
                        transition: "all 0.2s",
                        minHeight: 26,
                      }}
                    >
                      {range}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {currentPurchases.length === 0 && currentSales.length === 0 ? (
            <div
              style={{
                height: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
              }}
            >
              Registra tu primera compra para ver la gráfica de evolución temporal.
            </div>
          ) : (
            <div
              ref={chartContainerRef}
              className="purchases-chart-container"
              style={{
                width: "100%",
                height: typeof window !== "undefined" && window.innerWidth <= 640 ? 280 : typeof window !== "undefined" && window.innerWidth <= 1024 ? 350 : 460,
              }}
            />
          )}
            </>
          )}
        </div>

        {/* FORM & PURCHASES LIST */}
        <div
          className="purchases-main-grid"
          style={{ display: "grid", gap: 24, alignItems: "start" }}
        >
          {/* ADD PURCHASE FORM */}
          <div className="card fade-up" style={{ padding: "20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
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
                <span>➕</span>
                <span>Registrar Compra (ETF/Acción/Cripto)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowXtbModal(true)}
                className="btn btn-sm btn-ghost"
                style={{
                  border: "1px solid rgba(0, 229, 255, 0.3)",
                  color: "#00e5ff",
                  fontSize: "0.76rem",
                  padding: "4px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title="Importar posiciones desde xStation de XTB"
              >
                <span>📥</span> Pegar tabla XTB
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  1. Buscar Ticker / ETF / Cripto
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Ticker (ej. XAUT-USD, SMH, BTC-USD, AAPL)"
                    value={ticker}
                    onChange={(e) => {
                      setTicker(e.target.value.toUpperCase());
                      setSelectedMeta(null);
                      setSearchResults([]);
                      setSearchError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchTicker()}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "4px",
                      border: "1px solid var(--border)",
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      fontSize: "0.8rem",
                      textTransform: "uppercase",
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleSearchTicker}
                    disabled={isSearching || !ticker}
                  >
                    {isSearching ? "⏳" : "Buscar"}
                  </button>
                </div>
                {searchError && (
                  <div style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: 4 }}>
                    {searchError}
                  </div>
                )}

                {/* Broker Suffix Auto-translation Suggestion in Purchase Form */}
                {purchaseTranslationInfo.suggestions.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 8px",
                      background: "rgba(56, 189, 248, 0.08)",
                      border: "1px solid rgba(56, 189, 248, 0.25)",
                      borderRadius: 6,
                      fontSize: "0.72rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    <span style={{ color: "#38bdf8" }}>💡 En Yahoo:</span>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {purchaseTranslationInfo.suggestions.map((sug) => (
                        <button
                          key={sug.ticker}
                          type="button"
                          onClick={() => {
                            setTicker(sug.ticker);
                            searchTickersMultiple(sug.ticker)
                              .then((res) => {
                                if (res.results && res.results.length > 0) {
                                  setSearchResults(res.results);
                                }
                              })
                              .catch(() => {});
                          }}
                          style={{
                            background: "rgba(56, 189, 248, 0.2)",
                            border: "1px solid #38bdf8",
                            color: "#f0f9ff",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: "0.7rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                          title={sug.note}
                        >
                          {sug.ticker}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Market Location Filters */}
                {searchResults.length > 0 && !selectedMeta && (
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                        Filtrar por Mercado / Ubicación:
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {MARKET_REGIONS.map((reg) => {
                        const isActive = searchRegion === reg.id;
                        return (
                          <button
                            key={reg.id}
                            type="button"
                            onClick={() => setSearchRegion(reg.id)}
                            title={reg.hint}
                            style={{
                              background: isActive ? "rgba(0, 229, 255, 0.2)" : "rgba(255, 255, 255, 0.04)",
                              border: isActive ? "1px solid #00e5ff" : "1px solid rgba(255, 255, 255, 0.08)",
                              color: isActive ? "#00e5ff" : "var(--text-secondary)",
                              padding: "2px 7px",
                              borderRadius: "12px",
                              fontSize: "0.68rem",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              fontWeight: isActive ? 600 : 400,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>{reg.icon}</span> {reg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {searchResults.length > 0 && !selectedMeta && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: "300px",
                      overflowY: "auto",
                    }}
                  >
                    {(() => {
                      const filteredResults = searchResults.filter((r) => {
                        if (searchRegion === "ALL") return true;
                        const eq = getBrokerEquivalenceInfo(r.ticker, r.exchange);
                        return eq.region === searchRegion;
                      });

                      if (filteredResults.length === 0) {
                        return (
                          <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            No hay resultados bajo el filtro seleccionado.
                            <br />
                            <button
                              type="button"
                              className="btn btn-xs btn-ghost"
                              style={{ marginTop: 6, color: "#00e5ff" }}
                              onClick={() => setSearchRegion("ALL")}
                            >
                              Ver todos ({searchResults.length})
                            </button>
                          </div>
                        );
                      }

                      return filteredResults.map((r, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setTicker(r.ticker);
                          setSelectedMeta(r);
                          setPrice(r.price > 0 ? r.price : 100);
                          if (!purchaseTime) {
                            setPurchaseTime(getMarketOpenTime(r.ticker, r.exchange));
                          }
                          setSearchResults([]);
                        }}
                        style={{
                          cursor: "pointer",
                          padding: "12px",
                          background: "rgba(255, 255, 255, 0.05)",
                          borderRadius: "6px",
                          border: "1px solid rgba(255,255,255,0.1)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "rgba(0, 229, 255, 0.1)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)")
                        }
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontWeight: 800, color: "#00e5ff", fontSize: "1.05rem" }}>
                            {r.ticker}
                          </div>
                          {r.price > 0 && <div style={{ fontWeight: 700 }}>${r.price}</div>}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#f1f5f9", fontWeight: 500 }}>
                          {r.name}
                        </div>
                        <div
                          style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: 4, alignItems: "center" }}
                        >
                          {(() => {
                            const eq = getBrokerEquivalenceInfo(r.ticker, r.exchange);
                            return (
                              <span
                                style={{
                                  padding: "2px 8px",
                                  background: "rgba(56, 189, 248, 0.12)",
                                  border: "1px solid rgba(56, 189, 248, 0.25)",
                                  borderRadius: "12px",
                                  fontSize: "0.65rem",
                                  fontWeight: 600,
                                  color: "#38bdf8",
                                }}
                              >
                                {eq.flag} {eq.marketLabel}
                              </span>
                            );
                          })()}
                          {r.exchange && (
                            <span
                              style={{
                                padding: "2px 8px",
                                background: "rgba(255,255,255,0.08)",
                                borderRadius: "12px",
                                fontSize: "0.65rem",
                                fontWeight: 500,
                              }}
                            >
                              🏛️ {r.exchange}
                            </span>
                          )}
                          {r.quoteType && (
                            <span
                              style={{
                                padding: "2px 8px",
                                background: "rgba(255,255,255,0.08)",
                                borderRadius: "12px",
                                fontSize: "0.65rem",
                                fontWeight: 500,
                              }}
                            >
                              📊 {r.quoteType}
                            </span>
                          )}
                          {r.currency && (
                            <span
                              style={{
                                padding: "2px 8px",
                                background:
                                  r.currency !== (portfolio.assetCurrency || "USD")
                                    ? "rgba(239, 68, 68, 0.2)"
                                    : "rgba(255,255,255,0.08)",
                                border:
                                  r.currency !== (portfolio.assetCurrency || "USD")
                                    ? "1px solid rgba(239, 68, 68, 0.4)"
                                    : "none",
                                borderRadius: "12px",
                                fontSize: "0.65rem",
                                fontWeight: r.currency !== (portfolio.assetCurrency || "USD") ? 700 : 500,
                                color: r.currency !== (portfolio.assetCurrency || "USD") ? "#fca5a5" : "inherit",
                              }}
                            >
                              💵 {r.currency}
                              {r.currency !== (portfolio.assetCurrency || "USD") && " ⚠️"}
                            </span>
                          )}
                          <MarketScheduleBadge ticker={r.ticker} exchange={r.exchange} size="xs" />
                        </div>
                        {(() => {
                          const eq = getBrokerEquivalenceInfo(r.ticker, r.exchange);
                          if (!eq.brokerTip) return null;
                          return (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: "0.68rem",
                                color: "#94a3b8",
                                background: "rgba(255, 255, 255, 0.03)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                borderLeft: "2px solid #00e5ff",
                              }}
                            >
                              💡 {eq.brokerTip}
                            </div>
                          );
                        })()}
                      </div>
                    ));
                  })()}
                </div>
              )}

                {selectedMeta && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "16px",
                      background: "rgba(0, 229, 255, 0.05)",
                      borderRadius: "8px",
                      border: "1px solid rgba(0, 229, 255, 0.3)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "1.2rem", color: "#00e5ff", fontWeight: 800 }}>
                          {selectedMeta.ticker}
                        </div>
                        <div
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            marginTop: "2px",
                          }}
                        >
                          {selectedMeta.name}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
                          ${selectedMeta.price}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: 4 }}>
                      {selectedMeta.exchange && (
                        <span
                          style={{
                            padding: "4px 10px",
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          🏛️ {selectedMeta.exchange}
                        </span>
                      )}
                      {selectedMeta.quoteType && (
                        <span
                          style={{
                            padding: "4px 10px",
                            background: "rgba(255,255,255,0.08)",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          📊 {selectedMeta.quoteType}
                        </span>
                      )}
                      {selectedMeta.currency && (
                        <span
                          style={{
                            padding: "4px 10px",
                            background:
                              selectedMeta.currency !== (portfolio.assetCurrency || "USD")
                                ? "rgba(239, 68, 68, 0.2)"
                                : "rgba(255,255,255,0.08)",
                            border:
                              selectedMeta.currency !== (portfolio.assetCurrency || "USD")
                                ? "1px solid rgba(239, 68, 68, 0.5)"
                                : "none",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: selectedMeta.currency !== (portfolio.assetCurrency || "USD") ? 700 : 500,
                            color: selectedMeta.currency !== (portfolio.assetCurrency || "USD") ? "#fca5a5" : "inherit",
                          }}
                        >
                          💵 {selectedMeta.currency}
                          {selectedMeta.currency !== (portfolio.assetCurrency || "USD") && " ⚠️"}
                        </span>
                      )}
                      <MarketScheduleBadge
                        ticker={selectedMeta.ticker}
                        exchange={selectedMeta.exchange}
                        size="sm"
                      />
                    </div>

                    {/* ALERTA DE DISCREPANCIA DE DIVISA (EUR, GBP, HKD vs Portafolio) */}
                    {selectedMeta.currency && selectedMeta.currency !== (portfolio.assetCurrency || "USD") && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "10px 12px",
                          background: "rgba(239, 68, 68, 0.12)",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          fontSize: "0.75rem",
                          color: "#fca5a5",
                          lineHeight: "1.3",
                        }}
                      >
                        <span style={{ fontSize: "1.1rem" }}>⚠️</span>
                        <div>
                          <strong style={{ color: "#ef4444", display: "block", marginBottom: 2 }}>
                            ¡Atención con la Divisa ({selectedMeta.currency})!
                          </strong>
                          Este producto cotiza en <strong>{selectedMeta.currency}</strong>, mientras tu portafolio base está en <strong>{portfolio.assetCurrency || "USD"}</strong>.
                          Al comprarlo, tu broker aplicará <strong>conversión de tasa de cambio y comisión FX</strong>, lo cual te descontará saldo adicional.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  3. Valor de Apertura (Monto Invertido en {portfolio.assetCurrency || "USD"})
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={investedAmount}
                  onChange={(e) => setInvestedAmount(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    fontSize: "0.8rem",
                  }}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Volumen / Acciones</span>
                </label>
                <div
                  style={{
                    padding: "0.75rem",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    borderRadius: "var(--radius)",
                    fontSize: "1.1rem",
                    fontWeight: 600,
                  }}
                >
                  {price > 0 ? (investedAmount / price).toFixed(4) : 0} uds
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
                <div className="form-control" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                  <label
                    className="label"
                    style={{
                      minHeight: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 0 6px 0",
                    }}
                  >
                    <span className="label-text" style={{ whiteSpace: "nowrap" }}>Fecha de Compra</span>
                  </label>
                  <DynamicDatePicker
                    value={date}
                    onChange={(val) => setDate(val)}
                  />
                </div>
                <div className="form-control" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                  <label
                    className="label"
                    style={{
                      minHeight: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                      flexWrap: "nowrap",
                      padding: "0 0 6px 0",
                    }}
                  >
                    <span className="label-text" style={{ whiteSpace: "nowrap" }}>Hora</span>
                    <button
                      type="button"
                      style={{
                        fontSize: "0.68rem",
                        color: theme === "light" ? "#0284c7" : "#00e5ff",
                        background: theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.1)",
                        border: theme === "light" ? "1px solid rgba(2, 132, 199, 0.25)" : "1px solid rgba(0, 229, 255, 0.25)",
                        borderRadius: 6,
                        padding: "1px 6px",
                        cursor: "pointer",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                      onClick={() => setPurchaseTime(getMarketOpenTime(selectedMeta?.ticker, selectedMeta?.exchange))}
                      title="Fijar primera hora / apertura de mercado"
                    >
                      🔔 Apertura
                    </button>
                  </label>
                  <DynamicTimePicker
                    value={purchaseTime}
                    onChange={(val) => setPurchaseTime(val)}
                    placeholder="HH:MM"
                    align="right"
                  />
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">
                    Precio de Apertura / Ejecución{" "}
                    {isFetchingHistorical && (
                      <span style={{ color: "#f59e0b", fontSize: "0.7rem" }}>Buscando a las {purchaseTime || "cierre"}...</span>
                    )}
                  </span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  className="input input-bordered"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
                <label className="label">
                  <span className="label-text-alt text-muted">
                    {purchaseTime ? `Auto-completado intradía a las ${purchaseTime}` : "Auto-completado por fecha (Cierre)"}
                  </span>
                </label>
              </div>

              <div className="form-control">
                <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="label-text">
                    Comisión / Descuento Broker o Plenti ({portfolio.assetCurrency || "USD"})
                  </span>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    Opcional
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  className="input input-bordered"
                  value={commissionAmount}
                  onChange={(e) => setCommissionAmount(e.target.value)}
                />
                <label className="label">
                  <span className="label-text-alt text-muted" style={{ fontSize: "0.7rem", lineHeight: 1.25 }}>
                    💡 Se sumará al costo base para descontar la tarifa o spread de tu rentabilidad neta real.
                    {(selectedMeta?.ticker?.includes("XAUT") || selectedMeta?.ticker?.includes("PAXG") || selectedMeta?.ticker?.includes("-USD")) && (
                      <span style={{ color: "#00e5ff", display: "block", marginTop: 2 }}>
                        🪙 Compra en Plenti: Ingresa aquí la comisión o spread cobrado por la app.
                      </span>
                    )}
                  </span>
                </label>
              </div>

              {(() => {
                const canAdd = Boolean(
                  selectedMeta &&
                  Number(investedAmount) > 0 &&
                  Number(price) > 0 &&
                  date &&
                  date.trim().length > 0
                );
                return (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      marginTop: 8,
                      padding: "12px",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: canAdd ? "pointer" : "not-allowed",
                      opacity: canAdd ? 1 : 0.45,
                    }}
                    disabled={!canAdd}
                    onClick={handleAddPurchase}
                    title={
                      canAdd
                        ? "Registrar compra en el portafolio"
                        : "Completa los campos obligatorios: Buscar/seleccionar activo, Monto invertido > 0, Precio > 0 y Fecha válida"
                    }
                  >
                    Registrar Compra
                  </button>
                );
              })()}
            </div>
          </div>

          {/* PURCHASES LIST */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Tus Lotes Agrupados
              </h3>
              {lotDataList.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-sm"
                    style={{
                      background: isBatchUpdating
                        ? "var(--bg-surface)"
                        : theme === "light"
                          ? "rgba(2, 132, 199, 0.1)"
                          : "rgba(0, 229, 255, 0.1)",
                      color: theme === "light" ? "#0284c7" : "#00e5ff",
                      border: theme === "light" ? "1px solid rgba(2, 132, 199, 0.3)" : "1px solid rgba(0, 229, 255, 0.2)",
                    }}
                    onClick={handleBatchRecalculate}
                    disabled={isBatchUpdating}
                  >
                    {isBatchUpdating
                      ? `⏳ Recalculando... ${batchProgress.current}/${batchProgress.total}`
                      : "🔄 Auto-Calcular Todo"}
                  </button>
                  {isBatchUpdating && (
                    <button
                      className="btn btn-sm"
                      style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                      }}
                      onClick={handleStopBatch}
                    >
                      🛑 Detener
                    </button>
                  )}
                </div>
              )}
            </div>

            {groupedLots.length === 0 ? (
              <div
                className="card"
                style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}
              >
                Aún no has registrado ninguna compra en este portafolio.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  maxHeight: 650,
                  overflowY: "auto",
                  overflowX: "auto",
                }}
              >
                {groupedLots.map((group) => {
                  const isExpanded = expandedTickers[group.ticker];
                  const lq = liveQuotes[group.ticker];
                  const fullName = getAssetName(group.ticker, lq?.name || group.name);

                  // Detect if this group or any of its lots is currently active/selected in the chart
                  const isGroupConsolidatedSelected =
                    selectedHoldingKey === `GROUP_${group.ticker}` ||
                    selectedHoldingKey === group.ticker;

                  const selectedLotInGroup = group.lots.find((lot) =>
                    selectedHoldingKey === `LOT_${lot.id}` ||
                    selectedHoldingKey === `LOT_${group.ticker}_${lot.id}` ||
                    selectedHoldingKey === `LOT_${group.ticker}_${lot.date}` ||
                    (typeof selectedHoldingKey === "string" &&
                      selectedHoldingKey.startsWith(`LOT_${group.ticker}_`) &&
                      selectedHoldingKey.includes(String(lot.id)))
                  );

                  const isSelectedGroup = isGroupConsolidatedSelected || Boolean(selectedLotInGroup);

                  return (
                    <div
                      key={group.ticker}
                      className="lot-group-wrapper"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        marginBottom: 10,
                      }}
                    >
                      {/* TICKER SUMMARY CARD */}
                      <div
                        className="card lot-group-card"
                        style={{
                          padding: "16px 20px",
                          background: isSelectedGroup
                            ? (theme === "light" ? "rgba(2, 132, 199, 0.05)" : "rgba(0, 229, 255, 0.06)")
                            : (theme === "light" ? "#ffffff" : "rgba(255,255,255,0.03)"),
                          borderRadius: 12,
                          border: isSelectedGroup
                            ? (theme === "light" ? "2px solid #0284c7" : "2px solid #00e5ff")
                            : (theme === "light" ? "1px solid #cbd5e1" : "1px solid rgba(255,255,255,0.1)"),
                          borderLeft: `5px solid ${group.isPositive ? "#10b981" : "#ef4444"}`,
                          boxShadow: isSelectedGroup
                            ? (theme === "light" ? "0 6px 22px rgba(2, 132, 199, 0.22)" : "0 6px 26px rgba(0, 229, 255, 0.28)")
                            : (theme === "light" ? "0 2px 8px rgba(0, 0, 0, 0.05)" : "0 4px 12px rgba(0, 0, 0, 0.25)"),
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          gap: 16,
                        }}
                        onClick={() => toggleExpand(group.ticker)}
                        onMouseEnter={(e) => {
                          if (!isSelectedGroup) {
                            e.currentTarget.style.background =
                              theme === "light" ? "var(--bg-surface)" : "rgba(255,255,255,0.06)";
                            e.currentTarget.style.borderColor =
                              theme === "light" ? "#94a3b8" : "rgba(255,255,255,0.2)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelectedGroup) {
                            e.currentTarget.style.background =
                              theme === "light" ? "#ffffff" : "rgba(255,255,255,0.03)";
                            e.currentTarget.style.borderColor =
                              theme === "light" ? "#cbd5e1" : "rgba(255,255,255,0.1)";
                          }
                        }}
                      >
                        <div className="lot-group-header-left">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 4,
                              flexWrap: "wrap",
                            }}
                          >
                            <strong style={{ fontSize: "1.15rem", color: "var(--text-primary)", letterSpacing: "0.3px" }}>
                              {group.ticker}
                            </strong>
                            {isGroupConsolidatedSelected ? (
                              <span
                                className="badge-active-in-chart group-consolidated"
                                title="Posición completa (consolidada) activa en la gráfica horaria interactiva"
                              >
                                <span>🏢</span> Consolidado en Gráfica
                              </span>
                            ) : selectedLotInGroup ? (
                              <span
                                className="badge-active-in-chart group-lot"
                                title={`Lote específico del ${selectedLotInGroup.date} activo en la gráfica horaria interactiva`}
                              >
                                <span>🎯</span> Lote {selectedLotInGroup.date} en Gráfica
                              </span>
                            ) : isSelectedGroup ? (
                              <span
                                className="badge-active-in-chart group-consolidated"
                                title="Activo en la gráfica interactiva"
                              >
                                <span>👁️</span> Activo en Gráfica
                              </span>
                            ) : null}
                            <button
                              onClick={(e) => handleEditParentTicker(group, e)}
                              style={{
                                background: theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)",
                                border: theme === "light" ? "1px solid rgba(2, 132, 199, 0.3)" : "1px solid rgba(0, 229, 255, 0.25)",
                                color: theme === "light" ? "#0284c7" : "#00e5ff",
                                cursor: "pointer",
                                padding: "2px 7px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontWeight: 500,
                                flexShrink: 0,
                                transition: "all 0.15s ease",
                              }}

                              title="Cambiar Acción o ETF a todos los lotes de esta posición"
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = theme === "light" ? "rgba(2, 132, 199, 0.18)" : "rgba(0, 229, 255, 0.2)";
                                e.currentTarget.style.borderColor = theme === "light" ? "#0284c7" : "#00e5ff";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)";
                                e.currentTarget.style.borderColor = theme === "light" ? "rgba(2, 132, 199, 0.3)" : "rgba(0, 229, 255, 0.25)";
                              }}
                            >
                              <span>🔄</span> Cambiar activo
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedHoldingKey(`GROUP_${group.ticker}`);
                                setPurchasesChartTab("individual");
                                window.scrollTo({ top: 380, behavior: "smooth" });
                              }}
                              style={{
                                background: theme === "light" ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)",
                                border: `1px solid ${theme === "light" ? "rgba(16, 185, 129, 0.28)" : "rgba(16, 185, 129, 0.3)"}`,
                                color: theme === "light" ? "#047857" : "#34d399",
                                borderRadius: "6px",
                                padding: "2px 8px",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                flexShrink: 0,
                                transition: "all 0.15s ease",
                              }}
                              title={`Inspeccionar gráfica individual hora a hora de ${group.ticker}`}
                            >
                              <span>📈</span> Gráfica
                            </button>
                            <button
                              type="button"
                              onClick={(e) =>
                                handleOpenAlertModal(
                                  {
                                    ticker: group.ticker,
                                    alertKey: group.ticker,
                                    isParentGroup: true,
                                    lotLabel: `Posición Consolidada (${group.lots.length} Lotes • Costo Promedio WAP $${group.avgOpenPrice.toFixed(2)})`,
                                    name: group.name,
                                    currentPrice: group.currentPrice,
                                    entryPrice: group.avgOpenPrice,
                                    returnPct: group.profitPct,
                                  },
                                  e
                                )
                              }
                              title={
                                alerts.some((a) => a.ticker === group.ticker && a.is_active && !a.triggered_at)
                                  ? `Alerta global activa en ${group.ticker}: ${
                                      alerts.find((a) => a.ticker === group.ticker)?.alert_type === "STOP_LOSS" ? "Stop Loss" : "Recuperación / Take Profit"
                                    } (${alerts.find((a) => a.ticker === group.ticker)?.target_value >= 0 ? "+" : ""}${alerts.find((a) => a.ticker === group.ticker)?.target_value}%)`
                                  : `Configurar alerta maestra para toda la posición de ${group.ticker} (replica a todos sus lotes)`
                              }
                              style={{
                                background: alerts.some((a) => a.ticker === group.ticker && a.is_active && !a.triggered_at)
                                  ? (theme === "light" ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.2)")
                                  : (theme === "light" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)"),
                                border: alerts.some((a) => a.ticker === group.ticker && a.is_active && !a.triggered_at)
                                  ? "1px solid rgba(16, 185, 129, 0.4)"
                                  : `1px solid ${theme === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                                borderRadius: "6px",
                                padding: "2px 7px",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                color: alerts.some((a) => a.ticker === group.ticker && a.is_active && !a.triggered_at)
                                  ? "#10b981"
                                  : "var(--text-muted)",
                                flexShrink: 0,
                                transition: "all 0.15s ease",
                              }}
                            >
                              <span>🔔</span>
                              {alerts.some((a) => a.ticker === group.ticker && a.is_active && !a.triggered_at) && (
                                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#10b981" }}>
                                  {alerts.find((a) => a.ticker === group.ticker)?.target_value >= 0 ? "+" : ""}
                                  {alerts.find((a) => a.ticker === group.ticker)?.target_value}%
                                </span>
                              )}
                            </button>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                color: "var(--text-secondary)",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}
                            >
                              {group.lots.length} Lote{group.lots.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {(() => {
                            const lq = liveQuotes[group.ticker];
                            return (
                              <>
                                <div
                                  style={{
                                    fontSize: "0.85rem",
                                    fontWeight: 600,
                                    color: theme === "light" ? "#1e293b" : "#f1f5f9",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    maxWidth: 380,
                                    marginTop: 2,
                                  }}
                                  title={`${group.ticker} — ${fullName}`}
                                >
                                  {fullName}
                                </div>
                                {lq && (lq.exchange || lq.quoteType || lq.currency) && (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "6px",
                                      flexWrap: "wrap",
                                      marginTop: 6,
                                    }}
                                  >
                                    {lq.exchange && (
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          background: "var(--bg-surface)",
                                          border: "1px solid var(--border)",
                                          borderRadius: "12px",
                                          fontSize: "0.65rem",
                                          fontWeight: 500,
                                          color: "var(--text-secondary)",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        🏛️ {lq.exchange}
                                      </span>
                                    )}
                                    {lq.quoteType && (
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          background: "var(--bg-surface)",
                                          border: "1px solid var(--border)",
                                          borderRadius: "12px",
                                          fontSize: "0.65rem",
                                          fontWeight: 500,
                                          color: "var(--text-secondary)",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        📊 {lq.quoteType}
                                      </span>
                                    )}
                                    {lq.currency && (
                                      <span
                                        style={{
                                          padding: "2px 8px",
                                          background:
                                            lq.currency !== (portfolio.assetCurrency || "USD")
                                              ? (theme === "light" ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.2)")
                                              : "var(--bg-surface)",
                                          border:
                                            lq.currency !== (portfolio.assetCurrency || "USD")
                                              ? "1px solid rgba(239, 68, 68, 0.4)"
                                              : "1px solid var(--border)",
                                          borderRadius: "12px",
                                          fontSize: "0.65rem",
                                          fontWeight: lq.currency !== (portfolio.assetCurrency || "USD") ? 700 : 500,
                                          color: lq.currency !== (portfolio.assetCurrency || "USD")
                                            ? (theme === "light" ? "#dc2626" : "#fca5a5")
                                            : "var(--text-secondary)",
                                          whiteSpace: "nowrap",
                                        }}
                                        title={
                                          lq.currency !== (portfolio.assetCurrency || "USD")
                                            ? `Cotiza en ${lq.currency}. Tu portafolio base es ${portfolio.assetCurrency || "USD"}.`
                                            : undefined
                                        }
                                      >
                                        💵 {lq.currency}
                                        {lq.currency !== (portfolio.assetCurrency || "USD") && " ⚠️"}
                                      </span>
                                    )}
                                    <MarketScheduleBadge ticker={group.ticker} exchange={lq?.exchange} size="xs" />
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        <div
                          className="lot-group-metrics"
                          style={{
                            textAlign: "right",
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 16,
                          }}
                        >
                          <div className="lot-metric-col" style={{ width: 110, textAlign: "right", flexShrink: 0 }}>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                              Total Invertido
                            </div>
                            <div className="mono" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                              $
                              {yieldViewMode === "USD"
                                ? group.totalInvested.toFixed(2)
                                : group.totalInvestedFx.toFixed(2)}
                            </div>
                            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                              Vol: {group.totalShares.toFixed(4)}
                            </div>
                            {group.totalCommission > 0 && (
                              <div style={{ fontSize: "0.65rem", color: "#f59e0b", fontWeight: 600, whiteSpace: "nowrap" }}>
                                Fees: -${group.totalCommission.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <div className="lot-metric-col" style={{ width: 115, textAlign: "right", flexShrink: 0 }}>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                              Valor Mercado
                            </div>
                            <div
                              className="mono"
                              style={{
                                fontWeight: 700,
                                color: yieldViewMode === "REAL"
                                  ? (theme === "light" ? "#d97706" : "#f59e0b")
                                  : (theme === "light" ? "#0284c7" : "#00e5ff"),
                              }}
                            >
                              $
                              {yieldViewMode === "USD"
                                ? group.totalCurrentValue.toFixed(2)
                                : yieldViewMode === "FX"
                                  ? group.totalCurrentValueFx.toFixed(2)
                                  : group.totalCurrentValueReal.toFixed(2)}
                            </div>
                            <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                              Apertura: ${group.avgOpenPrice.toFixed(2)}
                            </div>
                          </div>

                          {/* Movimiento Hoy 24h & Alertas de Saltos Bruscos */}
                          {(() => {
                            const lq = liveQuotes[group.ticker];
                            const chg1d = Number(lq?.change_pct ?? lq?.regularMarketChangePercent ?? 0);
                            const chgUsd1d = Number(lq?.change ?? lq?.regularMarketChange ?? 0);
                            const totalShares = Number(group.totalShares || 0);
                            const chgHoldingUsd = totalShares > 0 ? totalShares * chgUsd1d : chgUsd1d;
                            const has1d = lq && (lq.change_pct != null || lq.regularMarketChangePercent != null);
                            const isExtreme = Math.abs(chg1d) >= 6;
                            const isAbrupt = Math.abs(chg1d) >= 3;
                            const isUp1d = chg1d >= 0;

                            return (
                              <div className="lot-metric-col" style={{ width: 110, textAlign: "right", flexShrink: 0 }}>
                                <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                                  Hoy (24h)
                                </div>
                                {has1d ? (
                                  <div>
                                    <div
                                      className="mono"
                                      style={{
                                        fontWeight: 800,
                                        fontSize: "0.85rem",
                                        color: isUp1d
                                          ? theme === "light" ? "#16a34a" : "#4ade80"
                                          : theme === "light" ? "#dc2626" : "#f87171",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {isUp1d ? "+" : ""}{chg1d.toFixed(2)}%
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 1, whiteSpace: "nowrap" }}>
                                      <span
                                        style={{ fontSize: "0.65rem", color: "var(--text-muted)", cursor: "help" }}
                                        className="mono"
                                        title={`Impacto hoy en lote: ${chgHoldingUsd >= 0 ? "+" : ""}$${chgHoldingUsd.toFixed(2)} USD (${totalShares > 0 ? `${totalShares.toFixed(4)} acc × ${chgUsd1d >= 0 ? "+" : ""}$${chgUsd1d.toFixed(2)}/acc` : "1 acc"})`}
                                      >
                                        {chgHoldingUsd >= 0 ? "+" : ""}${chgHoldingUsd.toFixed(2)}
                                      </span>
                                      {isExtreme ? (
                                        <span
                                          title="Movimiento brusco extraordinario (±6%)"
                                          style={{
                                            fontSize: "0.58rem",
                                            padding: "1px 4px",
                                            borderRadius: 4,
                                            background: isUp1d ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)",
                                            color: isUp1d ? (theme === "light" ? "#047857" : "#34d399") : (theme === "light" ? "#be123c" : "#fb7185"),
                                            fontWeight: 800,
                                            border: `1px solid ${isUp1d ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)"}`,
                                          }}
                                        >
                                          ⚡ BRUSCO
                                        </span>
                                      ) : isAbrupt ? (
                                        <span
                                          title="Movimiento relevante en la sesión (±3%)"
                                          style={{
                                            fontSize: "0.58rem",
                                            padding: "1px 4px",
                                            borderRadius: 4,
                                            background: isUp1d ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                                            color: isUp1d ? (theme === "light" ? "#059669" : "#10b981") : (theme === "light" ? "#e11d48" : "#f43f5e"),
                                            fontWeight: 700,
                                          }}
                                        >
                                          {isUp1d ? "🚀 SALTO" : "🔻 CAÍDA"}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                    —
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {(() => {
                            const profit =
                              yieldViewMode === "USD"
                                ? group.profit
                                : yieldViewMode === "FX"
                                  ? group.profitFx
                                  : group.profitReal;
                            const profitPct =
                              yieldViewMode === "USD"
                                ? group.profitPct
                                : yieldViewMode === "FX"
                                  ? group.profitPctFx
                                  : group.profitPctReal;
                            const isPositive = profit >= 0;
                            return (
                              <div className="lot-metric-col" style={{ width: 155, textAlign: "right", flexShrink: 0 }}>
                                <div style={{ color: "var(--text-secondary)", fontSize: "0.7rem", whiteSpace: "nowrap" }}>
                                  {yieldViewMode === "REAL"
                                    ? "Beneficio Real"
                                    : "Beneficio"}
                                </div>
                                <div
                                  style={{
                                    color: isPositive
                                      ? yieldViewMode === "REAL"
                                        ? (theme === "light" ? "#d97706" : "#f59e0b")
                                        : (theme === "light" ? "#16a34a" : "#4ade80")
                                      : (theme === "light" ? "#dc2626" : "#f87171"),
                                    fontWeight: 700,
                                    fontSize: "0.9rem",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {isPositive ? "+" : ""}${profit.toFixed(2)}
                                  <div style={{ fontSize: "0.7rem" }}>
                                    ({isPositive ? "+" : ""}
                                    {profitPct.toFixed(2)}%{yieldViewMode === "REAL" ? " Real" : ""}
                                    )
                                  </div>
                                </div>
                                {group.hasBenchmarks && (
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      gap: 4,
                                      marginTop: 3,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      className="mono"
                                      title={`Si hubieras invertido los lotes de ${group.ticker} en el S&P 500 en sus mismas fechas de compra: ${group.sp500Profit >= 0 ? "+" : ""}$${group.sp500Profit.toFixed(2)} USD`}
                                      style={{
                                        fontSize: "0.58rem",
                                        padding: "1px 5px",
                                        borderRadius: 4,
                                        background: theme === "light" ? "rgba(190, 24, 93, 0.08)" : "rgba(236, 72, 153, 0.12)",
                                        color: theme === "light" ? "#be185d" : "#f472b6",
                                        border: `1px solid ${theme === "light" ? "rgba(190, 24, 93, 0.25)" : "rgba(236, 72, 153, 0.28)"}`,
                                        fontWeight: 700,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      S&P {group.sp500ProfitPct >= 0 ? "+" : ""}{group.sp500ProfitPct.toFixed(1)}%
                                    </span>
                                    <span
                                      className="mono"
                                      title={`Si hubieras invertido los lotes de ${group.ticker} en el NASDAQ en sus mismas fechas de compra: ${group.nasdaqProfit >= 0 ? "+" : ""}$${group.nasdaqProfit.toFixed(2)} USD`}
                                      style={{
                                        fontSize: "0.58rem",
                                        padding: "1px 5px",
                                        borderRadius: 4,
                                        background: theme === "light" ? "rgba(109, 40, 217, 0.08)" : "rgba(139, 92, 246, 0.12)",
                                        color: theme === "light" ? "#6d28d9" : "#a78bfa",
                                        border: `1px solid ${theme === "light" ? "rgba(109, 40, 217, 0.25)" : "rgba(139, 92, 246, 0.28)"}`,
                                        fontWeight: 700,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      NDX {group.nasdaqProfitPct >= 0 ? "+" : ""}{group.nasdaqProfitPct.toFixed(1)}%
                                    </span>
                                  </div>
                                )}
                                {yieldViewMode === "REAL" && (
                                  <div
                                    style={{ fontSize: "0.65rem", color: "#f87171", marginTop: 2, whiteSpace: "nowrap" }}
                                  >
                                    📉 -${(group.totalInflationLoss || 0).toFixed(2)} por IPC
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          <div className="lot-expand-chevron" style={{ width: 32, textAlign: "center", fontSize: "1.1rem", color: "var(--text-muted)", flexShrink: 0 }}>
                            {isExpanded ? "🔽" : "▶️"}
                          </div>
                        </div>
                      </div>

                      {/* EXPANDED INDIVIDUAL LOTS */}
                      {isExpanded && (
                        <div
                          className="lot-expanded-list"
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            paddingLeft: "clamp(6px, 2vw, 24px)",
                          }}
                        >
                          {group.lots.map((p) => {
                            const isLotSelected =
                              selectedHoldingKey === `LOT_${p.id}` ||
                              selectedHoldingKey === `LOT_${p.ticker}_${p.date}`;

                            return (
                              <div
                                key={p.id}
                                className="lot-expanded-item"
                                style={{
                                  padding: "12px 18px",
                                  background: isLotSelected
                                    ? (theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.1)")
                                    : (theme === "light" ? "#ffffff" : "rgba(0,0,0,0.2)"),
                                  borderRadius: "var(--radius)",
                                  border: isLotSelected
                                    ? (theme === "light" ? "2px solid #0284c7" : "2px solid #00e5ff")
                                    : (theme === "light" ? "1px solid #cbd5e1" : "1px solid var(--border)"),
                                  borderLeft: `4px solid ${p.isPositive ? "#10b981" : "#ef4444"}`,
                                  boxShadow: isLotSelected
                                    ? (theme === "light" ? "0 4px 14px rgba(2, 132, 199, 0.18)" : "0 4px 16px rgba(0, 229, 255, 0.22)")
                                    : "none",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: 12,
                                  transition: "all 0.15s ease",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      marginBottom: 2,
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "0.8rem",
                                        background: theme === "light" ? "var(--bg-card)" : "rgba(255,255,255,0.05)",
                                        border: "1px solid var(--border)",
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        color: "var(--text-primary)",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                      }}
                                    >
                                      <span>📅 {p.date}</span>
                                      {p.purchaseTime && (
                                        <span style={{ color: theme === "light" ? "#0284c7" : "#00e5ff", fontWeight: 600 }}>
                                          🕒 {p.purchaseTime}
                                        </span>
                                      )}
                                    </span>
                                    {isLotSelected && (
                                      <span
                                        className="badge-active-in-chart group-lot"
                                        style={{
                                          fontSize: "0.68rem",
                                          padding: "1px 7px",
                                          borderRadius: 4,
                                        }}
                                        title={`Este lote específico del ${p.date} está activo en la gráfica horaria`}
                                      >
                                        <span>🎯</span> Lote en Gráfica
                                      </span>
                                    )}
                                  </div>
                                </div>

                              <div style={{ textAlign: "right" }}>
                                <div style={{ display: "flex", gap: 16, fontSize: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                  <div>
                                    <div style={{ color: "var(--text-secondary)" }}>Invertido</div>
                                    <div className="mono" style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                                      $
                                      {yieldViewMode === "USD"
                                        ? p.invested.toFixed(2)
                                        : p.investedFx.toFixed(2)}
                                    </div>
                                    <div
                                      style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}
                                    >
                                      Apertura: ${p.purchasePrice.toFixed(2)}
                                    </div>
                                    <div
                                      style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}
                                    >
                                      Vol: {p.shares.toFixed(4)}
                                    </div>
                                    {p.commission > 0 && (
                                      <div
                                        style={{
                                          fontSize: "0.65rem",
                                          color: "#f59e0b",
                                          marginTop: 2,
                                          fontWeight: 600,
                                        }}
                                        title="Comisión o spread descontado (Plenti/Broker)"
                                      >
                                        🏷️ Fee: -${p.commission.toFixed(2)}
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div style={{ color: "var(--text-secondary)" }}>
                                      Valor Mercado
                                    </div>
                                    <div
                                      className="mono"
                                      style={{
                                        fontWeight: 700,
                                        color: yieldViewMode === "REAL"
                                          ? (theme === "light" ? "#d97706" : "#f59e0b")
                                          : (theme === "light" ? "#0284c7" : "#00e5ff"),
                                      }}
                                    >
                                      $
                                      {yieldViewMode === "USD"
                                        ? p.currentValue.toFixed(2)
                                        : yieldViewMode === "FX"
                                          ? p.currentValueFx.toFixed(2)
                                          : p.currentValueReal.toFixed(2)}
                                    </div>
                                    <div
                                      style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}
                                    >
                                      Actual: ${p.currentPrice.toFixed(2)}
                                      {p.manualCurrentPrice && (
                                        <span style={{ color: "#f59e0b", marginLeft: 4 }}>
                                          (Manual)
                                        </span>
                                      )}
                                      {!p.hasLiveQuote && !p.manualCurrentPrice && (
                                        <span style={{ color: "#ef4444", marginLeft: 4 }}>
                                          (Sin conexión)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ minWidth: 70, textAlign: "right" }}>
                                    <div style={{ color: "var(--text-secondary)" }}>
                                      Hoy (24h)
                                    </div>
                                    {(() => {
                                      const lq = liveQuotes[p.ticker];
                                      const chg1d = Number(lq?.change_pct ?? lq?.regularMarketChangePercent ?? 0);
                                      const has1d = lq && (lq.change_pct != null || lq.regularMarketChangePercent != null);
                                      const isExtreme = Math.abs(chg1d) >= 6;
                                      const isAbrupt = Math.abs(chg1d) >= 3;
                                      const isUp1d = chg1d >= 0;

                                      if (!has1d) {
                                        return <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>—</span>;
                                      }

                                      return (
                                        <div>
                                          <div
                                            className="mono"
                                            style={{
                                              fontWeight: 800,
                                              fontSize: "0.8rem",
                                              color: isUp1d
                                                ? theme === "light" ? "#16a34a" : "#4ade80"
                                                : theme === "light" ? "#dc2626" : "#f87171",
                                            }}
                                          >
                                            {isUp1d ? "+" : ""}{chg1d.toFixed(2)}%
                                          </div>
                                          {isExtreme ? (
                                            <span
                                              title="Movimiento brusco extraordinario (±6%)"
                                              style={{
                                                fontSize: "0.55rem",
                                                padding: "1px 3px",
                                                borderRadius: 3,
                                                background: isUp1d ? "rgba(16, 185, 129, 0.2)" : "rgba(244, 63, 94, 0.2)",
                                                color: isUp1d ? (theme === "light" ? "#047857" : "#34d399") : (theme === "light" ? "#be123c" : "#fb7185"),
                                                fontWeight: 800,
                                                border: `1px solid ${isUp1d ? "rgba(16, 185, 129, 0.4)" : "rgba(244, 63, 94, 0.4)"}`,
                                              }}
                                            >
                                              ⚡ BRUSCO
                                            </span>
                                          ) : isAbrupt ? (
                                            <span
                                              title="Movimiento relevante en la sesión (±3%)"
                                              style={{
                                                fontSize: "0.55rem",
                                                padding: "1px 3px",
                                                borderRadius: 3,
                                                background: isUp1d ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                                                color: isUp1d ? (theme === "light" ? "#059669" : "#10b981") : (theme === "light" ? "#e11d48" : "#f43f5e"),
                                                fontWeight: 700,
                                              }}
                                            >
                                              {isUp1d ? "🚀 SALTO" : "🔻 CAÍDA"}
                                            </span>
                                          ) : null}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                                {(() => {
                                  const profit =
                                    yieldViewMode === "USD"
                                      ? p.profit
                                      : yieldViewMode === "FX"
                                        ? p.profitFx
                                        : p.profitReal;
                                  const profitPct =
                                    yieldViewMode === "USD"
                                      ? p.profitPct
                                      : yieldViewMode === "FX"
                                        ? p.profitPctFx
                                        : p.profitPctReal;
                                  const isPositive = profit >= 0;
                                  return (
                                    <div style={{ marginTop: 4 }}>
                                      <div
                                        style={{
                                          color: isPositive
                                            ? yieldViewMode === "REAL"
                                              ? (theme === "light" ? "#d97706" : "#f59e0b")
                                              : (theme === "light" ? "#16a34a" : "#4ade80")
                                            : (theme === "light" ? "#dc2626" : "#f87171"),
                                          fontWeight: 700,
                                          fontSize: "0.8rem",
                                        }}
                                      >
                                        {yieldViewMode === "REAL" ? "Beneficio Real" : "Beneficio"}:{" "}
                                        {isPositive ? "+" : ""}${profit.toFixed(2)} (
                                        {isPositive ? "+" : ""}
                                        {profitPct.toFixed(2)}%
                                        {yieldViewMode === "REAL" ? " Real" : ""})
                                      </div>
                                      {(p.sp500ReturnPct !== null || p.nasdaqReturnPct !== null) && (
                                        <div
                                          style={{
                                            display: "flex",
                                            justifyContent: "flex-end",
                                            alignItems: "center",
                                            gap: 6,
                                            marginTop: 3,
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          {p.sp500ReturnPct !== null && (
                                            <span
                                              className="mono"
                                              title={`Rentabilidad del S&P 500 desde el ${p.date}: ${p.sp500Profit >= 0 ? "+" : ""}$${p.sp500Profit.toFixed(2)} USD`}
                                              style={{
                                                fontSize: "0.62rem",
                                                padding: "1px 6px",
                                                borderRadius: 4,
                                                background: theme === "light" ? "rgba(190, 24, 93, 0.08)" : "rgba(236, 72, 153, 0.12)",
                                                color: theme === "light" ? "#be185d" : "#f472b6",
                                                border: `1px solid ${theme === "light" ? "rgba(190, 24, 93, 0.25)" : "rgba(236, 72, 153, 0.28)"}`,
                                                fontWeight: 700,
                                              }}
                                            >
                                              vs S&P 500: {p.sp500ReturnPct >= 0 ? "+" : ""}{p.sp500ReturnPct.toFixed(2)}% ({p.sp500Profit >= 0 ? "+" : ""}${p.sp500Profit.toFixed(2)})
                                            </span>
                                          )}
                                          {p.nasdaqReturnPct !== null && (
                                            <span
                                              className="mono"
                                              title={`Rentabilidad del NASDAQ desde el ${p.date}: ${p.nasdaqProfit >= 0 ? "+" : ""}$${p.nasdaqProfit.toFixed(2)} USD`}
                                              style={{
                                                fontSize: "0.62rem",
                                                padding: "1px 6px",
                                                borderRadius: 4,
                                                background: theme === "light" ? "rgba(109, 40, 217, 0.08)" : "rgba(139, 92, 246, 0.12)",
                                                color: theme === "light" ? "#6d28d9" : "#a78bfa",
                                                border: `1px solid ${theme === "light" ? "rgba(109, 40, 217, 0.25)" : "rgba(139, 92, 246, 0.28)"}`,
                                                fontWeight: 700,
                                              }}
                                            >
                                              vs NASDAQ: {p.nasdaqReturnPct >= 0 ? "+" : ""}{p.nasdaqReturnPct.toFixed(2)}% ({p.nasdaqProfit >= 0 ? "+" : ""}${p.nasdaqProfit.toFixed(2)})
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {yieldViewMode === "REAL" && (
                                        <div
                                          style={{
                                            fontSize: "0.65rem",
                                            color: "#fca5a5",
                                            marginTop: 1,
                                          }}
                                        >
                                          📉 Inflación descontada: -$
                                          {(p.inflationLoss || 0).toFixed(2)} (-
                                          {(p.inflationRatePct || 0).toFixed(2)}% acum.)
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 16 }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedHoldingKey(`LOT_${p.id || `${p.ticker}_${p.date}`}`);
                                      setPurchasesChartTab("individual");
                                      window.scrollTo({ top: 380, behavior: "smooth" });
                                    }}
                                    style={{
                                      background: theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)",
                                      border: `1px solid ${theme === "light" ? "rgba(2, 132, 199, 0.3)" : "rgba(0, 229, 255, 0.25)"}`,
                                      color: theme === "light" ? "#0284c7" : "#00e5ff",
                                      borderRadius: "6px",
                                      padding: "3px 8px",
                                      fontSize: "0.75rem",
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      transition: "all 0.15s ease",
                                    }}
                                    title={`Inspeccionar gráfica individual hora a hora para este lote específico del ${p.date}`}
                                  >
                                    <span>📊</span>
                                  </button>
                                  {(() => {
                                    const lotKey = `${p.ticker}::${p.id}`;
                                    const lotAlert = alerts.find(
                                      (a) => a.ticker === lotKey && a.is_active && !a.triggered_at
                                    );
                                    const hasLotAlert = Boolean(lotAlert);
                                    const isStop = lotAlert?.alert_type === "STOP_LOSS";
                                    const badgeColor = isStop ? "#ef4444" : "#10b981";
                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) =>
                                          handleOpenAlertModal(
                                            {
                                              ticker: p.ticker,
                                              alertKey: lotKey,
                                              isParentGroup: false,
                                              lotLabel: `Lote Individual (${p.date}${p.purchaseTime ? ` ${p.purchaseTime}` : ""} • Vol: ${Number(p.shares || 0).toFixed(4)} uds • P₀: $${Number(p.purchasePrice || 0).toFixed(2)})`,
                                              name: p.name || p.ticker,
                                              currentPrice: p.currentPrice,
                                              entryPrice: p.purchasePrice,
                                              returnPct: p.profitPct,
                                            },
                                            e
                                          )
                                        }
                                        title={
                                          hasLotAlert
                                            ? `Alerta activa en este lote (${p.date}): ${
                                                isStop ? "Stop Loss" : "Recuperación / Take Profit"
                                              } (${lotAlert.target_value >= 0 ? "+" : ""}${lotAlert.target_value}%)`
                                            : `Configurar alerta individual únicamente para este lote de ${p.ticker} (${p.date})`
                                        }
                                        style={{
                                          background: hasLotAlert
                                            ? isStop
                                              ? theme === "light" ? "rgba(239, 68, 68, 0.14)" : "rgba(239, 68, 68, 0.2)"
                                              : theme === "light" ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.2)"
                                            : "transparent",
                                          border: hasLotAlert
                                            ? `1px solid ${isStop ? "rgba(239, 68, 68, 0.45)" : "rgba(16, 185, 129, 0.45)"}`
                                            : `1px solid ${theme === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}`,
                                          borderRadius: "6px",
                                          padding: "3px 8px",
                                          fontSize: "0.75rem",
                                          cursor: "pointer",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 4,
                                          color: hasLotAlert ? badgeColor : "var(--text-muted)",
                                          transition: "all 0.15s ease",
                                        }}
                                      >
                                        <span>🔔</span>
                                        {hasLotAlert && (
                                          <span style={{ fontSize: "0.68rem", fontWeight: 700, color: badgeColor }}>
                                            {lotAlert.target_value >= 0 ? "+" : ""}
                                            {lotAlert.target_value}%
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })()}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const curPrice = p.currentPrice || p.purchasePrice;
                                      const totalValUSD = (p.shares * curPrice);
                                      setSellingLot(p);
                                      setSaleMode("shares");
                                      setSaleShares(p.shares);
                                      setSaleAmountUSD(Number(totalValUSD.toFixed(2)));
                                      setSalePrice(curPrice);
                                      setSaleCommission(0);
                                      setSaleDate(new Date().toISOString().split("T")[0]);
                                      setSaleTime(new Date().toTimeString().slice(0, 5));
                                      setSaleNotes("");
                                    }}
                                    title="Registrar venta o liquidación de este lote para acumular ganancia/pérdida"
                                    style={{
                                      background: "rgba(16, 185, 129, 0.15)",
                                      border: "1px solid rgba(16, 185, 129, 0.35)",
                                      color: "#10b981",
                                      fontWeight: 700,
                                      padding: "3px 8px",
                                      borderRadius: 6,
                                      fontSize: "0.75rem",
                                      cursor: "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 3,
                                    }}
                                  >
                                    💰 Vender / Cerrar
                                  </button>
                                  <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={() => {
                                      setEditingPurchase(p);
                                      setEditTicker(p.ticker);
                                      setEditInvested(p.investedAmount || p.invested);
                                      setEditPrice(p.purchasePrice);
                                      setEditCommissionAmount(p.commissionAmount || p.commission || 0);
                                      setEditDate(p.date);
                                      setEditPurchaseTime(p.purchaseTime || getMarketOpenTime(p.ticker, p.exchange));
                                    }}
                                    title="Editar"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={async () => {
                                      const newPrice = await toastPrompt(
                                        `Precio actual de mercado para ${p.ticker} (ej. XTB):`,
                                        p.currentPrice,
                                      );
                                      if (newPrice !== null && !isNaN(Number(newPrice))) {
                                        handleSaveManualPrice(p, newPrice);
                                      }
                                    }}
                                    title="Corregir precio actual si Yahoo Finance no coincide con XTB"
                                  >
                                    ⚙️
                                  </button>
                                  <button
                                    className="btn btn-sm btn-ghost"
                                    onClick={async () => {
                                      const ok = await toastConfirm(
                                        `¿Seguro que deseas eliminar definitivamente este lote de ${p.ticker}?\n\nTip: Si lo vendiste en tu broker, usa el botón "💰 Vender / Cerrar" para guardar tu ganancia o pérdida acumulada.`
                                      );
                                      if (ok) removePurchase(p.id);
                                    }}
                                    title="Eliminar lote definitivamente"
                                  >
                                    🗑️
                                  </button>
                                </div>
                            </div>
                          );
                        })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Historial de Ventas Realizadas / Liquidaciones ── */}
        <div className="card fade-up" style={{ padding: 24, marginTop: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>💰</span> Historial de Ventas Realizadas
              </h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Registro de posiciones cerradas y liquidaciones con ganancia/pérdida consolidada
              </p>
            </div>
            {currentSales.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 8,
                  background: totalRealizedPnl >= 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                  border: `1px solid ${totalRealizedPnl >= 0 ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                }}
              >
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>PnL Realizado Total:</span>
                <span
                  className="mono"
                  style={{
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    color: totalRealizedPnl >= 0 ? "#10b981" : "#ef4444",
                  }}
                >
                  {totalRealizedPnl >= 0 ? "+" : ""}${totalRealizedPnl.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {currentSales.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "var(--text-muted)",
                fontSize: "0.85rem",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 8,
                border: "1px dashed var(--border-subtle)",
              }}
            >
              No has registrado ninguna venta en este portafolio aún.
              <br />
              <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>
                Haz clic en el botón 💰 de cualquiera de tus lotes arriba para liquidar o vender posiciones parciales o totales.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentSales.map((s) => {
                const isWin = (s.realized_pnl || 0) >= 0;
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--border-subtle)",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "1rem",
                          color: "var(--text-primary)",
                          background: "rgba(255,255,255,0.05)",
                          padding: "4px 8px",
                          borderRadius: 6,
                        }}
                      >
                        {s.ticker}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                          Vendidas: <strong className="mono">{Number(s.shares).toFixed(4)}</strong> uds a{" "}
                          <strong className="mono">${Number(s.sale_price).toFixed(2)}</strong>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          📅 {s.sale_date} {s.sale_time ? `• ⏰ ${s.sale_time}` : ""}
                          {s.sale_commission > 0 && ` • Comisión/Fee: $${s.sale_commission.toFixed(2)}`}
                          {s.notes && ` • Nota: ${s.notes}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Beneficio Realizado</div>
                        <div
                          className="mono"
                          style={{
                            fontWeight: 700,
                            fontSize: "0.95rem",
                            color: isWin ? "#10b981" : "#ef4444",
                          }}
                        >
                          {isWin ? "+" : ""}${Number(s.realized_pnl || 0).toFixed(2)}
                        </div>
                      </div>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={async () => {
                          const ok = await toastConfirm("¿Eliminar este registro de venta?");
                          if (ok) removePurchaseSale(s.id);
                        }}
                        title="Eliminar registro de venta"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Banner de Monetización / Afiliados ───────────── */}
        <AffiliateBanner />

        {/* SALE MODAL */}
        {sellingLot && (
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
                maxWidth: 480,
                padding: 24,
                background: "#1e293b",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h3 style={{ margin: 0, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
                  💰 Registrar Venta ({sellingLot.ticker})
                </h3>
                <button
                  onClick={() => setSellingLot(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "1.2rem",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 8,
                    fontSize: "0.8rem",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Lote Comprado: </span>
                    <strong className="mono" style={{ color: "#f1f5f9" }}>
                      {Number(sellingLot.shares).toFixed(4)} uds
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Precio Compra: </span>
                    <strong className="mono" style={{ color: "#f1f5f9" }}>
                      ${Number(sellingLot.purchasePrice).toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
                  <div className="form-control" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                    <label className="label" style={{ minHeight: 26, display: "flex", alignItems: "center", padding: "0 0 6px 0" }}>
                      <span className="label-text" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>Fecha de Venta</span>
                    </label>
                    <DynamicDatePicker
                      value={saleDate}
                      onChange={(val) => setSaleDate(val)}
                    />
                  </div>
                  <div className="form-control" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                    <label className="label" style={{ minHeight: 26, display: "flex", alignItems: "center", padding: "0 0 6px 0" }}>
                      <span className="label-text" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>Hora</span>
                    </label>
                    <DynamicTimePicker
                      value={saleTime}
                      onChange={(val) => setSaleTime(val)}
                      align="right"
                    />
                  </div>
                </div>

                {/* Precio Ejecutado */}
                <div className="form-control">
                  <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label-text" style={{ fontSize: "0.8rem" }}>Precio de Venta Ejecutado ($)</span>
                    {sellingLot.currentPrice && (
                      <span
                        style={{ fontSize: "0.68rem", color: "#38bdf8", cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => {
                          const curP = Number(sellingLot.currentPrice);
                          setSalePrice(curP);
                          if (saleMode === "shares") {
                            setSaleAmountUSD(Number((saleShares * curP).toFixed(2)));
                          }
                        }}
                      >
                        Usar precio actual (${Number(sellingLot.currentPrice).toFixed(2)})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="input input-bordered input-sm"
                    value={salePrice}
                    onChange={(e) => {
                      const newP = Number(e.target.value);
                      setSalePrice(newP);
                      if (newP > 0) {
                        if (saleMode === "shares") {
                          setSaleAmountUSD(Number((saleShares * newP).toFixed(2)));
                        } else {
                          setSaleShares(saleAmountUSD / newP);
                        }
                      }
                    }}
                  />
                </div>

                {/* Selector de Modo: Por Unidades o Por Dólares */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      background: "rgba(255,255,255,0.05)",
                      padding: 2,
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSaleMode("shares");
                        if (salePrice > 0 && saleAmountUSD > 0) {
                          setSaleShares(saleAmountUSD / salePrice);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        border: "none",
                        borderRadius: 6,
                        background: saleMode === "shares" ? "#3b82f6" : "transparent",
                        color: saleMode === "shares" ? "#fff" : "var(--text-muted)",
                        fontWeight: 600,
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Por Unidades (uds)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSaleMode("usd");
                        if (salePrice > 0 && saleShares > 0) {
                          setSaleAmountUSD(Number((saleShares * salePrice).toFixed(2)));
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        border: "none",
                        borderRadius: 6,
                        background: saleMode === "usd" ? "#3b82f6" : "transparent",
                        color: saleMode === "usd" ? "#fff" : "var(--text-muted)",
                        fontWeight: 600,
                        fontSize: "0.78rem",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Por Monto en Dólares ($)
                    </button>
                  </div>

                  {saleMode === "shares" ? (
                    <div className="form-control">
                      <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="label-text" style={{ fontSize: "0.8rem" }}>Unidades a Vender</span>
                        <span
                          style={{ fontSize: "0.68rem", color: "#38bdf8", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => {
                            setSaleShares(sellingLot.shares);
                            if (salePrice > 0) {
                              setSaleAmountUSD(Number((sellingLot.shares * salePrice).toFixed(2)));
                            }
                          }}
                        >
                          Vender 100% ({Number(sellingLot.shares).toFixed(4)} uds)
                        </span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        max={sellingLot.shares}
                        className="input input-bordered input-sm"
                        value={saleShares}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSaleShares(val);
                          if (salePrice > 0) {
                            setSaleAmountUSD(Number((val * salePrice).toFixed(2)));
                          }
                        }}
                      />
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                        ≈ ${(Number(saleShares) * Number(salePrice || 0)).toFixed(2)} USD brutos
                      </span>
                    </div>
                  ) : (
                    <div className="form-control">
                      <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="label-text" style={{ fontSize: "0.8rem" }}>Monto en Dólares a Vender ($)</span>
                        <span
                          style={{ fontSize: "0.68rem", color: "#38bdf8", cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => {
                            const maxUSD = Number((sellingLot.shares * (salePrice || sellingLot.purchasePrice)).toFixed(2));
                            setSaleAmountUSD(maxUSD);
                            setSaleShares(sellingLot.shares);
                          }}
                        >
                          Vender Todo ($
                          {Number((sellingLot.shares * (salePrice || sellingLot.purchasePrice)).toFixed(2))})
                        </span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        className="input input-bordered input-sm"
                        placeholder="Ej. 100.00"
                        value={saleAmountUSD}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSaleAmountUSD(val);
                          if (salePrice > 0) {
                            setSaleShares(val / salePrice);
                          }
                        }}
                      />
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Equivale a: <strong className="mono" style={{ color: "#38bdf8" }}>{salePrice > 0 ? (saleAmountUSD / salePrice).toFixed(4) : 0}</strong> unidades de {sellingLot.ticker}
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-control">
                  <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label-text" style={{ fontSize: "0.8rem" }}>
                      Comisión / Fee de Venta o Retiro Plenti ($)
                    </span>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Opcional</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    className="input input-bordered input-sm"
                    value={saleCommission}
                    onChange={(e) => setSaleCommission(Number(e.target.value))}
                  />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text" style={{ fontSize: "0.8rem" }}>Notas o Motivo</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Toma de ganancias, liquidación Plenti..."
                    className="input input-bordered input-sm"
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                  />
                </div>

                {/* Calculation preview */}
                {(() => {
                  const sPrice = Number(salePrice) || 0;
                  const sComm = Number(saleCommission) || 0;
                  const maxSh = Number(sellingLot.shares) || 1;
                  const sShares = saleMode === "usd" 
                    ? (sPrice > 0 ? Number(saleAmountUSD) / sPrice : 0)
                    : Number(saleShares) || 0;

                  const origInv = Number(sellingLot.investedAmount || sellingLot.shares * sellingLot.purchasePrice);
                  const costBasis = (Math.min(sShares, maxSh) / maxSh) * origInv;
                  const grossRev = sShares * sPrice;
                  const netGain = grossRev - costBasis - sComm;
                  const gainPct = costBasis > 0 ? (netGain / costBasis) * 100 : 0;
                  const isPositive = netGain >= 0;

                  return (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: isPositive ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                        border: `1px solid ${isPositive ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                        borderRadius: 8,
                        fontSize: "0.8rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--text-muted)" }}>Ingreso Bruto de Venta:</span>
                        <strong className="mono" style={{ color: "#f1f5f9" }}>
                          ${grossRev.toFixed(2)}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--text-muted)" }}>Costo Base de lo Vendido:</span>
                        <span className="mono" style={{ color: "var(--text-muted)" }}>
                          ${costBasis.toFixed(2)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          borderTop: "1px solid rgba(255,255,255,0.08)",
                          paddingTop: 4,
                          marginTop: 2,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Ganancia Realizada Neta:</span>
                        <strong
                          className="mono"
                          style={{ color: isPositive ? "#10b981" : "#ef4444", fontSize: "0.9rem" }}
                        >
                          {isPositive ? "+" : ""}${netGain.toFixed(2)} ({isPositive ? "+" : ""}{gainPct.toFixed(2)}%)
                        </strong>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setSellingLot(null)}
                  >
                    Cancelar
                  </button>
                  {(() => {
                    const sPrice = Number(salePrice) || 0;
                    const maxSh = Number(sellingLot?.shares) || 0;
                    const sShares = saleMode === "usd"
                      ? (sPrice > 0 ? Number(saleAmountUSD) / sPrice : 0)
                      : Number(saleShares) || 0;
                    const canSell = Boolean(
                      sPrice > 0 &&
                      sShares > 0 &&
                      sShares <= maxSh + 1e-4 &&
                      saleDate &&
                      saleDate.trim().length > 0
                    );
                    return (
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        onClick={handleExecuteSale}
                        disabled={!canSell}
                        style={{
                          color: "#fff",
                          fontWeight: 600,
                          cursor: canSell ? "pointer" : "not-allowed",
                          opacity: canSell ? 1 : 0.45,
                        }}
                        title={
                          canSell
                            ? "Confirmar liquidación o venta"
                            : "Completa los campos obligatorios: Precio > 0, Cantidad/Monto a vender > 0 (sin exceder el disponible) y Fecha válida"
                        }
                      >
                        Confirmar Venta
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT PURCHASE MODAL */}
        {editingPurchase && (
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
                maxWidth: 460,
                padding: 24,
                background: "#1e293b",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h3 style={{ margin: 0, color: "#f1f5f9", display: "flex", alignItems: "center", gap: 8 }}>
                  ✏️ Editar Lote ({editTicker})
                </h3>
                <button
                  onClick={() => setEditingPurchase(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "1.2rem",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
                  <div className="form-control" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                    <label className="label" style={{ minHeight: 26, display: "flex", alignItems: "center", padding: "0 0 6px 0" }}>
                      <span className="label-text" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>Fecha</span>
                    </label>
                    <DynamicDatePicker
                      value={editDate}
                      onChange={(val) => setEditDate(val)}
                    />
                  </div>
                  <div className="form-control" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                    <label
                      className="label"
                      style={{
                        minHeight: 26,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        flexWrap: "nowrap",
                        padding: "0 0 6px 0",
                      }}
                    >
                      <span className="label-text" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>Hora</span>
                      <button
                        type="button"
                        style={{
                          fontSize: "0.65rem",
                          color: theme === "light" ? "#0284c7" : "#00e5ff",
                          background: theme === "light" ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.1)",
                          border: theme === "light" ? "1px solid rgba(2, 132, 199, 0.25)" : "1px solid rgba(0, 229, 255, 0.25)",
                          borderRadius: 6,
                          padding: "1px 6px",
                          cursor: "pointer",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                        onClick={() =>
                          setEditPurchaseTime(
                            getMarketOpenTime(editTicker, editingPurchase?.exchange)
                          )
                        }
                        title="Fijar primera hora / apertura de mercado"
                      >
                        🔔 Apertura
                      </button>
                    </label>
                    <DynamicTimePicker
                      value={editPurchaseTime}
                      onChange={(val) => setEditPurchaseTime(val)}
                      align="right"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text" style={{ fontSize: "0.8rem" }}>Monto Invertido ($)</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      className="input input-bordered input-sm"
                      value={editInvested}
                      onChange={(e) => setEditInvested(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text" style={{ fontSize: "0.8rem" }}>
                        Precio Apertura{" "}
                        {isFetchingHistorical && (
                          <span style={{ color: "#f59e0b", fontSize: "0.65rem" }}>Buscando...</span>
                        )}
                      </span>
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      className="input input-bordered input-sm"
                      value={editPrice}
                      onChange={(e) => setEditPrice(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-control">
                  <label className="label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label-text" style={{ fontSize: "0.8rem" }}>
                      Comisión / Descuento Plenti o Broker ($)
                    </span>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                      Opcional
                    </span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    className="input input-bordered input-sm"
                    value={editCommissionAmount}
                    onChange={(e) => setEditCommissionAmount(Number(e.target.value))}
                  />
                </div>

                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Volumen resultante:</span>
                  <strong className="mono" style={{ color: "#f1f5f9" }}>
                    {editPrice > 0 ? (editInvested / editPrice).toFixed(4) : 0} uds
                  </strong>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setEditingPurchase(null)}
                  >
                    Cancelar
                  </button>
                  {(() => {
                    const canSave = Boolean(
                      Number(editInvested) > 0 &&
                      Number(editPrice) > 0 &&
                      editDate &&
                      editDate.trim().length > 0
                    );
                    return (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={handleSaveEditedPurchase}
                        disabled={!canSave}
                        style={{
                          cursor: canSave ? "pointer" : "not-allowed",
                          opacity: canSave ? 1 : 0.45,
                        }}
                        title={
                          canSave
                            ? "Guardar cambios del lote"
                            : "Completa los campos obligatorios: Monto invertido > 0, Precio > 0 y Fecha válida"
                        }
                      >
                        Guardar Cambios
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        <PlanConfigModal
          isOpen={showPlanModal}
          onClose={() => setShowPlanModal(false)}
          initialConfig={portfolio.planConfig || autoPlanAnalysis}
          onSave={(newConfig) => {
            togglePortfolioPlan(portfolioId, true, newConfig);
            setShowPlanModal(false);
          }}
        />
        <PlanExecutionModal
          isOpen={showExecutionModal}
          onClose={() => setShowExecutionModal(false)}
          planAnalysis={planAnalysis}
          liveQuotes={liveQuotes}
          currentPurchases={currentPurchases}
          onSave={handleExecutePlan}
        />
        <InflationExplorerModal
          isOpen={showInflationExplorer}
          onClose={() => setShowInflationExplorer(false)}
          inflationData={colInflationData}
          startDate={
            currentPurchases.length > 0
              ? currentPurchases.reduce((min, p) => (p.date < min ? p.date : min), currentPurchases[0].date)
              : undefined
          }
        />
        <ChangeTickerModal
          isOpen={Boolean(changingTickerGroup)}
          onClose={() => setChangingTickerGroup(null)}
          group={changingTickerGroup}
          liveQuote={changingTickerGroup ? liveQuotes[changingTickerGroup.ticker] : null}
          portfolioCurrency={portfolio.assetCurrency || "USD"}
          onConfirmChange={handleConfirmChangeTicker}
        />
        <XtbImportModal
          isOpen={showXtbModal}
          onClose={() => setShowXtbModal(false)}
          currentPortfolioId={portfolioId}
          purchasePortfolios={purchasePortfolios}
          onImportPurchases={handleImportXtbPurchases}
          onCreatePortfolio={addPurchasePortfolio}
          onSelectPortfolio={onSelectPortfolio}
        />
        <StockAlertModal
          isOpen={isAlertModalOpen}
          onClose={() => {
            setIsAlertModalOpen(false);
            setSelectedAlertItem(null);
          }}
          initialAlert={
            selectedAlertItem
              ? alerts.find(
                  (a) => a.ticker === (selectedAlertItem.alertKey || selectedAlertItem.ticker)
                )
              : null
          }
          ticker={selectedAlertItem?.ticker || ""}
          alertKey={selectedAlertItem?.alertKey || selectedAlertItem?.ticker || ""}
          lotLabel={selectedAlertItem?.lotLabel || null}
          isParentGroup={Boolean(selectedAlertItem?.isParentGroup)}
          companyName={selectedAlertItem?.name || selectedAlertItem?.ticker || ""}
          currentPrice={selectedAlertItem?.currentPrice || 0}
          entryPrice={selectedAlertItem?.entryPrice || 0}
          currentReturnPct={selectedAlertItem?.returnPct || 0}
          scope="purchase"
          targetId={portfolioId}
          userEmail={user?.email || ""}
          onSave={handleSaveAlert}
          onDelete={handleDeleteAlert}
        />
      </div>
    </>
  );
}
