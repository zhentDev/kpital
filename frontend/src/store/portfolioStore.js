import toast from "react-hot-toast";
/**
 * Zustand store — portfolio state.
 * 100% Cloud-Synced with Supabase PostgreSQL (SSOT).
 * Zero financial data persistence in localStorage.
 */
import { create } from "zustand";
import { isMainOwnerUser, getCurrentUserEmail, useAuthStore } from "./authStore";
import {
  createPurchaseLot,
  createPurchasePortfolio,
  createPurchaseSale,
  deleteCustomStrategyApi,
  deletePurchaseLot,
  deletePurchasePortfolioApi,
  deletePurchaseSale,
  fetchCustomStrategiesApi,
  fetchHistoricalPrice,
  fetchPurchasesData,
  fetchRebalances,
  saveCustomStrategyApi,
  togglePortfolioPlanApi,
  updatePortfolioSettingsApi,
  renamePurchasePortfolioApi,
  updatePurchaseLots,
} from "../api/client";
import { getMarketOpenTime } from "../utils/marketHours";

const DEFAULT_TICKERS = [
  "AMD",
  "AMAT",
  "HPQ",
  "INTC",
  "ON",
  "ORCL",
  "POWI",
  "QCOM",
  "TXN",
  "MRVL",
  "HIMX",
  "NTAP",
  "KD",
  "ARM",
];

export const usePortfolioStore = create((set, get) => ({
  // ── State ────────────────────────────────────────
  settingsByMode: {
    historical: {
      tickers: DEFAULT_TICKERS,
      investment: 2000,
      period: "3M",
      numSlots: 15,
    },
    live: {
      tickers: DEFAULT_TICKERS,
      investment: 2000,
      period: "3M",
      numSlots: 15,
    },
    strat_mm20: {
      tickers: ["ARLP", "ACLS", "BHC", "DIOD", "HAE", "NSIT", "POWI", "VECO", "OSK", "SM"],
      investment: 1000,
      period: "1Y",
      numSlots: 20,
    },
  },
  mode: "cash_flow", // Default tab: Flujo de Caja ('cash_flow') | 'historical' | 'live' | etc
  period: "3M",
  visibleSeries: {
    nav: true,
    sp500: true,
    nasdaq: true,
    base: true,
    strat_mm20: true,
  },
  // ── Main Mode Settings (Divisa e Inflación) ──
  mainPortfolioSettings: {
    assetCurrency: "USD",
    localCurrency: "COP",
    inflationRate: 0,
    useAutoColInflation: false,
  },
  setMainPortfolioSettings: (newSettings) =>
    set((state) => ({
      mainPortfolioSettings: { ...state.mainPortfolioSettings, ...newSettings },
    })),
  // ── HISTORICAL INDIVIDUAL PURCHASES (Supabase SSOT) ──
  purchasePortfolios: [{ id: "hist_default", name: "Compras Principales" }],
  individualPurchases: [],
  purchaseSales: [],
  initFetchPurchases: async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("titanes-portfolio");
        localStorage.removeItem("kpital-portfolio");
      }
      const currentUser = useAuthStore.getState()?.user;
      const currentEmail = currentUser?.email || getCurrentUserEmail();
      const isOwner = isMainOwnerUser(currentEmail);

      if (!isOwner) {
        set({
          purchasePortfolios: [{ id: "purchases_default", name: "Compras Principales", isPlan: false }],
          individualPurchases: [],
          purchaseSales: [],
        });
        return;
      }

      const res = await fetchPurchasesData();
      if (res && Array.isArray(res.purchasePortfolios) && res.purchasePortfolios.length > 0) {
        set({
          purchasePortfolios: res.purchasePortfolios,
          individualPurchases: res.individualPurchases || [],
          purchaseSales: res.purchaseSales || [],
        });
      }
    } catch (err) {
      if (err.name === "AbortError" || (err.message && err.message.toLowerCase().includes("abort"))) {
        return;
      }
      console.error("Error fetching purchases from Supabase backend:", err);
    }
  },
  addPurchase: async (purchase) => {
    try {
      await createPurchaseLot(purchase);
      set((state) => ({ individualPurchases: [...state.individualPurchases, purchase] }));
    } catch {
      toast.error("Error guardando la compra en BD");
    }
  },
  removePurchase: async (id) => {
    try {
      await deletePurchaseLot(id);
      set((state) => ({
        individualPurchases: state.individualPurchases.filter((p) => p.id !== id),
      }));
    } catch {
      toast.error("Error eliminando la compra de BD");
    }
  },
  addPurchaseSale: async (sale, updatedLot) => {
    try {
      await createPurchaseSale(sale);
      if (updatedLot) {
        if (updatedLot.shares <= 0) {
          await deletePurchaseLot(updatedLot.id);
          set((state) => ({
            purchaseSales: [sale, ...state.purchaseSales],
            individualPurchases: state.individualPurchases.filter((p) => p.id !== updatedLot.id),
          }));
        } else {
          await updatePurchaseLots([updatedLot]);
          set((state) => ({
            purchaseSales: [sale, ...state.purchaseSales],
            individualPurchases: state.individualPurchases.map((p) =>
              p.id === updatedLot.id ? { ...p, ...updatedLot } : p,
            ),
          }));
        }
      } else {
        set((state) => ({
          purchaseSales: [sale, ...state.purchaseSales],
        }));
      }
      toast.success("¡Venta registrada exitosamente!");
    } catch (e) {
      console.error("Error al registrar venta:", e);
      toast.error("Error registrando la venta en BD");
    }
  },
  removePurchaseSale: async (id) => {
    try {
      await deletePurchaseSale(id);
      set((state) => ({
        purchaseSales: state.purchaseSales.filter((s) => s.id !== id),
      }));
      toast.success("Registro de venta eliminado");
    } catch (e) {
      console.error("Error al eliminar venta:", e);
      toast.error("Error eliminando la venta de BD");
    }
  },
  updatePurchase: async (updated) => {
    try {
      await updatePurchaseLots([updated]);
      set((state) => ({
        individualPurchases: state.individualPurchases.map((p) =>
          p.id === updated.id ? { ...p, ...updated } : p,
        ),
      }));
    } catch {
      toast.error("Error actualizando la compra en BD");
    }
  },
  updateMultiplePurchases: async (updates) => {
    try {
      await updatePurchaseLots(updates);
      set((state) => {
        const updateMap = new Map(updates.map((u) => [u.id, u]));
        return {
          individualPurchases: state.individualPurchases.map((p) =>
            updateMap.has(p.id) ? { ...p, ...updateMap.get(p.id) } : p,
          ),
        };
      });
    } catch {
      toast.error("Error actualizando múltiples compras en BD");
    }
  },
  addPurchasePortfolio: async (name) => {
    const newPort = {
      id: `hist_${Date.now()}`,
      name: name.trim() || "Nuevo Histórico",
    };
    try {
      await createPurchasePortfolio(newPort.id, newPort.name);
      set((state) => ({
        purchasePortfolios: [...state.purchasePortfolios, newPort],
        mode: newPort.id,
      }));
      return newPort;
    } catch {
      toast.error("Error creando portafolio en BD");
    }
  },
  deletePurchasePortfolio: async (id) => {
    try {
      await deletePurchasePortfolioApi(id);
      set((state) => ({
        purchasePortfolios: state.purchasePortfolios.filter((p) => p.id !== id),
        individualPurchases: state.individualPurchases.filter((p) => p.portfolioId !== id),
        mode: state.mode === id ? "historical" : state.mode,
      }));
    } catch {
      toast.error("Error eliminando portafolio de BD");
    }
  },
  togglePortfolioPlan: async (id, isPlan, planConfig = null) => {
    try {
      await togglePortfolioPlanApi(id, isPlan, planConfig);
      set((state) => ({
        purchasePortfolios: state.purchasePortfolios.map((p) =>
          p.id === id ? { ...p, isPlan, planConfig } : p,
        ),
      }));
      if (isPlan) {
        toast.success("El histórico ha sido marcado como Plan de Inversión", { icon: "🤖" });
      } else {
        toast.success("El Plan de Inversión ha sido desactivado");
      }
    } catch {
      toast.error("Error actualizando estado del plan en BD");
    }
  },
  updatePortfolioSettings: async (
    id,
    assetCurrency,
    localCurrency,
    inflationRate,
    useAutoColInflation,
  ) => {
    try {
      await updatePortfolioSettingsApi(
        id,
        assetCurrency,
        localCurrency,
        inflationRate,
        useAutoColInflation,
      );
      set((state) => ({
        purchasePortfolios: state.purchasePortfolios.map((p) =>
          p.id === id
            ? { ...p, assetCurrency, localCurrency, inflationRate, useAutoColInflation }
            : p,
        ),
      }));
      toast.success("Configuración del portafolio actualizada");
    } catch {
      toast.error("Error actualizando configuración del portafolio");
    }
  },
  renamePurchasePortfolio: async (id, newName) => {
    if (!id || !newName || !newName.trim()) return;
    const trimmed = newName.trim();
    try {
      await renamePurchasePortfolioApi(id, trimmed);
      set((state) => ({
        purchasePortfolios: state.purchasePortfolios.map((p) =>
          p.id === id ? { ...p, name: trimmed } : p
        ),
      }));
      toast.success(`Portafolio renombrado a "${trimmed}"`);
    } catch {
      toast.error("Error al actualizar el nombre del portafolio");
    }
  },
  // ── BATCH RECALCULATE STATE ──
  batchUpdateStatus: {},
  setAbortBatch: (portfolioId) =>
    set((state) => ({
      batchUpdateStatus: {
        ...state.batchUpdateStatus,
        [portfolioId]: { ...state.batchUpdateStatus[portfolioId], abort: true },
      },
    })),
  runBatchRecalculate: async (portfolioId, purchases) => {
    set((state) => ({
      batchUpdateStatus: {
        ...state.batchUpdateStatus,
        [portfolioId]: {
          isUpdating: true,
          abort: false,
          progress: { current: 0, total: purchases.length },
        },
      },
    }));
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < purchases.length; i++) {
      if (get().batchUpdateStatus[portfolioId]?.abort) {
        toast(`Recálculo detenido manualmente para ${portfolioId}.`, {
          icon: "🛑",
          duration: 4000,
        });
        break;
      }
      const p = purchases[i];
      set((state) => ({
        batchUpdateStatus: {
          ...state.batchUpdateStatus,
          [portfolioId]: {
            ...state.batchUpdateStatus[portfolioId],
            progress: { current: i + 1, total: purchases.length },
          },
        },
      }));
      try {
        const timeToQuery = p.purchaseTime || getMarketOpenTime(p.ticker, p.exchange);
        const res = await fetchHistoricalPrice(p.ticker, p.date, timeToQuery);
        if (res && res.price) {
          const newPrice = res.price;
          const invested = p.investedAmount ?? p.shares * p.purchasePrice;
          get().updateMultiplePurchases([
            {
              ...p,
              purchaseTime: timeToQuery,
              purchasePrice: newPrice,
              shares: invested / newPrice,
              manualCurrentPrice: null,
            },
          ]);
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (get().batchUpdateStatus[portfolioId]?.abort) {
      // Handled
    } else if (failCount > 0) {
      toast(`Recálculo terminado: ${successCount} OK, ${failCount} fallidos.`, {
        icon: "⚠️",
        duration: 5000,
      });
    } else {
      toast.success(`Recálculo terminado: ${successCount} actualizados correctamente.`, {
        duration: 4000,
      });
    }
    set((state) => {
      const newStatus = { ...state.batchUpdateStatus };
      delete newStatus[portfolioId];
      return { batchUpdateStatus: newStatus };
    });
  },

  customStrategies: [
    {
      id: "strat_mm20",
      name: "MM20 Mid-caps PRO",
      country: "🇺🇸",
      numSlots: 20,
      capital: 1000,
      activeInvested: 250,
      benchmark: "S&P MidCap 400",
      color: "#10b981",
      createdAt: "2026-08-01T00:00:00.000Z",
      isSystem: true,
      isRealMoney: false,
    },
    {
      id: "strat_1788304141581",
      name: "Mejores acciones - sept 2026",
      country: "🇺🇸",
      numSlots: 20,
      capital: 1010,
      activeInvested: 353.5,
      benchmark: "S&P 500",
      color: "#a855f7",
      createdAt: "2026-09-02T00:00:00.000Z",
      isSystem: false,
      isRealMoney: true,
    },
  ],
  strategyRebalances: {
    strat_mm20: [
      {
        date: "2026-08-01",
        rebalance_date: "2026-08-01",
        cash_added: 0,
        tickers: ["ARLP", "ACLS", "BHC", "DIOD", "HAE", "NSIT", "POWI", "VECO", "OSK", "SM"],
      },
    ],
    strat_1788304141581: [
      {
        date: "2026-09-02",
        rebalance_date: "2026-09-02",
        cash_added: 0,
        tickers: ["OSIS", "PAYC", "DK", "HALO"],
      },
      {
        date: "2026-09-03",
        rebalance_date: "2026-09-03",
        cash_added: 0,
        tickers: ["OSIS", "PAYC", "DK", "HALO", "MCK"],
      },
      {
        date: "2026-10-01",
        rebalance_date: "2026-10-01",
        cash_added: 0,
        tickers: ["OSIS", "PAYC", "MCK", "ENS", "AYI", "ANF", "CRM"],
      },
    ],
  },
  lastKnownQuotes: {},
  lastStrategySummaries: {},
  lastPortfolioSummaries: {},
  saveLastKnownQuotes: (quotesMapOrArray) => {
    if (!quotesMapOrArray) return;
    set((state) => {
      const next = { ...(state.lastKnownQuotes || {}) };
      if (Array.isArray(quotesMapOrArray)) {
        quotesMapOrArray.forEach((q) => {
          if (q?.ticker && q?.price != null) {
            next[q.ticker] = { ...next[q.ticker], ...q, updatedAt: new Date().toISOString() };
          }
        });
      } else if (typeof quotesMapOrArray === "object") {
        Object.entries(quotesMapOrArray).forEach(([k, q]) => {
          if (q && q.price != null) {
            next[k] = { ...next[k], ...q, ticker: k, updatedAt: new Date().toISOString() };
          }
        });
      }
      return { lastKnownQuotes: next };
    });
  },
  saveStrategySummary: (strategyId, navData) => {
    if (!strategyId || !navData?.summary) return;
    set((state) => ({
      lastStrategySummaries: {
        ...(state.lastStrategySummaries || {}),
        [strategyId]: {
          summary: navData.summary,
          closed_holdings: navData.closed_holdings || state.lastStrategySummaries?.[strategyId]?.closed_holdings || [],
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  },
  savePortfolioSummary: (portfolioId, summaryData) => {
    if (!portfolioId || !summaryData) return;
    set((state) => ({
      lastPortfolioSummaries: {
        ...(state.lastPortfolioSummaries || {}),
        [portfolioId]: {
          ...summaryData,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  },

  initFetchCustomStrategies: async () => {
    try {
      const backendStrats = await fetchCustomStrategiesApi();
      if (Array.isArray(backendStrats) && backendStrats.length > 0) {
        set((state) => {
          const sysStrat = state.customStrategies.find((s) => s.id === "strat_mm20");
          const existingMap = new Map(state.customStrategies.map((s) => [s.id, s]));
          backendStrats.forEach((bs) => {
            existingMap.set(bs.id, { ...existingMap.get(bs.id), ...bs });
          });
          if (sysStrat && !existingMap.has("strat_mm20")) {
            existingMap.set("strat_mm20", sysStrat);
          }
          const mergedStrats = Array.from(existingMap.values());
          const updatedSettings = { ...state.settingsByMode };
          mergedStrats.forEach((st) => {
            if (!updatedSettings[st.id]) {
              updatedSettings[st.id] = {
                tickers: [],
                investment: st.capital || 1000,
                period: "1Y",
                numSlots: st.numSlots || 20,
              };
            }
          });
          return {
            customStrategies: mergedStrats,
            settingsByMode: updatedSettings,
          };
        });

        const strats = get().customStrategies;
        strats.forEach(async (st) => {
          try {
            const rebs = await fetchRebalances(st.id);
            if (Array.isArray(rebs) && rebs.length > 0) {
              get().setStrategyRebalances(st.id, rebs);
            }
          } catch (err) {
            console.warn(`Could not pre-fetch rebalances for ${st.id}`, err);
          }
        });
      }
    } catch (e) {
      console.error("Error fetching custom strategies from backend:", e);
    }
  },

  // ── Actions ──────────────────────────────────────
  addTicker: (ticker) => {
    const upper = ticker.toUpperCase();
    const mode = get().mode in get().settingsByMode ? get().mode : "historical";
    const currentModeSettings = get().settingsByMode[mode] || {
      tickers: DEFAULT_TICKERS,
      investment: 2000,
      period: "1Y",
      numSlots: 15,
    };
    if (!currentModeSettings.tickers.includes(upper)) {
      set((s) => ({
        settingsByMode: {
          ...s.settingsByMode,
          [mode]: {
            ...currentModeSettings,
            tickers: [...currentModeSettings.tickers, upper],
          },
        },
      }));
    }
  },

  removeTicker: (ticker) => {
    const mode = get().mode in get().settingsByMode ? get().mode : "historical";
    const currentModeSettings = get().settingsByMode[mode] || {
      tickers: DEFAULT_TICKERS,
      investment: 2000,
      period: "1Y",
      numSlots: 15,
    };
    set((s) => ({
      settingsByMode: {
        ...s.settingsByMode,
        [mode]: {
          ...currentModeSettings,
          tickers: currentModeSettings.tickers.filter((t) => t !== ticker),
        },
      },
    }));
  },

  setInvestment: (amount) =>
    set((state) => {
      const mode = state.mode in state.settingsByMode ? state.mode : "historical";
      const currentModeSettings = state.settingsByMode[mode] || {
        tickers: DEFAULT_TICKERS,
        investment: 2000,
        period: "1Y",
        numSlots: 15,
      };
      return {
        settingsByMode: {
          ...state.settingsByMode,
          [mode]: { ...currentModeSettings, investment: Number(amount) },
        },
      };
    }),

  setPeriod: (period) =>
    set((state) => {
      const mode = state.mode in state.settingsByMode ? state.mode : "historical";
      const currentModeSettings = state.settingsByMode[mode] || {
        tickers: DEFAULT_TICKERS,
        investment: 2000,
        period: "1Y",
        numSlots: 15,
      };
      return {
        period,
        settingsByMode: {
          ...state.settingsByMode,
          [mode]: { ...currentModeSettings, period },
        },
      };
    }),

  setMode: (mode) =>
    set((state) => {
      const targetMode = mode in state.settingsByMode ? mode : "historical";
      const currentPeriod = state.settingsByMode[targetMode]?.period || "1Y";
      return { mode, period: currentPeriod };
    }),

  toggleSeries: (key) =>
    set((s) => ({
      visibleSeries: {
        ...s.visibleSeries,
        [key]: !s.visibleSeries[key],
      },
    })),

  setMultipleSeries: (updates) =>
    set((s) => ({
      visibleSeries: {
        ...s.visibleSeries,
        ...updates,
      },
    })),

  addCustomStrategy: async ({
    name,
    country,
    numSlots,
    capital,
    benchmark,
    color,
    isRealMoney = false,
  }) => {
    const newStrat = {
      id: `strat_${Date.now()}`,
      name: name.trim() || "Nueva Estrategia",
      country: country || "🌎",
      numSlots: Number(numSlots) || 20,
      capital: Number(capital) || 1000,
      activeInvested: Number(capital) || 1000,
      benchmark: benchmark || "S&P 500",
      color: color || "#a855f7",
      isRealMoney: Boolean(isRealMoney),
      createdAt: new Date().toISOString(),
      isSystem: false,
    };
    set((s) => ({
      customStrategies: [...s.customStrategies, newStrat],
      settingsByMode: {
        ...s.settingsByMode,
        [newStrat.id]: {
          tickers: [],
          investment: Number(capital) || 1000,
          period: "1Y",
          numSlots: Number(numSlots) || 20,
        },
      },
      visibleSeries: { ...s.visibleSeries, [newStrat.id]: true },
      mode: newStrat.id,
    }));
    await saveCustomStrategyApi(newStrat);
    return newStrat;
  },

  updateCustomStrategy: async (id, updates) => {
    let updatedStrat = null;
    set((s) => {
      const nextStrats = s.customStrategies.map((str) => {
        if (str.id === id) {
          updatedStrat = { ...str, ...updates };
          return updatedStrat;
        }
        return str;
      });
      const nextSettings = { ...s.settingsByMode };
      if (nextSettings[id]) {
        nextSettings[id] = {
          ...nextSettings[id],
          numSlots:
            updates.numSlots !== undefined ? Number(updates.numSlots) : nextSettings[id].numSlots,
          investment:
            updates.capital !== undefined ? Number(updates.capital) : nextSettings[id].investment,
        };
      }
      return {
        customStrategies: nextStrats,
        settingsByMode: nextSettings,
      };
    });
    if (updatedStrat) {
      await saveCustomStrategyApi(updatedStrat);
    }
  },

  deleteCustomStrategy: async (id) => {
    const strat = get().customStrategies.find((s) => s.id === id);
    if (!strat || strat.isSystem) return;
    set((s) => {
      const nextSeries = { ...s.visibleSeries };
      delete nextSeries[id];
      const nextSettings = { ...s.settingsByMode };
      delete nextSettings[id];
      const nextRebal = { ...s.strategyRebalances };
      delete nextRebal[id];
      return {
        customStrategies: s.customStrategies.filter((str) => str.id !== id),
        settingsByMode: nextSettings,
        strategyRebalances: nextRebal,
        visibleSeries: nextSeries,
        mode: s.mode === id ? "historical" : s.mode,
      };
    });
    await deleteCustomStrategyApi(id);
  },

  setStrategyRebalances: (strategyId, rebalances) => {
    const latestTickers =
      rebalances.length > 0 ? rebalances[rebalances.length - 1].tickers || [] : [];
    set((s) => ({
      strategyRebalances: {
        ...s.strategyRebalances,
        [strategyId]: rebalances,
      },
      settingsByMode: {
        ...s.settingsByMode,
        [strategyId]: {
          ...(s.settingsByMode[strategyId] || { investment: 1000, period: "1Y", numSlots: 20 }),
          tickers: latestTickers,
        },
      },
    }));
  },

  updateStrategyCapital: (id, capital, activeInvested) => {
    set((s) => ({
      customStrategies: s.customStrategies.map((str) =>
        str.id === id
          ? { ...str, capital: Number(capital), activeInvested: Number(activeInvested) }
          : str,
      ),
    }));
  },

  resetToDefaults: () =>
    set({
      settingsByMode: {
        historical: {
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: "1Y",
          numSlots: 15,
        },
        live: {
          tickers: DEFAULT_TICKERS,
          investment: 2000,
          period: "1Y",
          numSlots: 15,
        },
      },
      visibleSeries: { nav: true, sp500: true, nasdaq: true, base: true },
    }),
  getSettingsForMode: (mode) => {
    const state = get();
    return state.settingsByMode[mode] || state.settingsByMode.historical;
  },
}));
