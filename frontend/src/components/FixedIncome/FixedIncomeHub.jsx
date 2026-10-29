import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchColInflationHistory, fetchFxHistory, fetchRateTrackerAlerts, applyUpdatedAccountRate } from "../../api/client";
import { useFixedIncomeStore } from "../../store/fixedIncomeStore";
import { BANK_PRESETS, computeMissingMonthlyYieldTransactions, getBankPreset, svgToDataUri } from "../../utils/bankPresets";
import { toastConfirm } from "../../utils/toastAlerts";
import { calculateAccountYield, getCDTAccruedYield } from "../../utils/yieldCalculator";
import FixedIncomeModal from "./FixedIncomeModal";
import FixedIncomeProjectionChart from "./FixedIncomeProjectionChart";
import StatementImporterModal from "./StatementImporterModal";
import HourglassRangeSlider from "../Common/HourglassRangeSlider";
import AffiliateBanner from "../Common/AffiliateBanner";
import { getReferralForEntity } from "../../utils/referralLinks";
import { useTheme } from "../../context/ThemeContext";
import "./FixedIncome.css";

const PERIOD_UNLOCK_DAYS = {
  "1M": 7,
  "3M": 30,
  "6M": 90,
  "1Y": 180,
  "3Y": 365,
  "5Y": 1095,
};

export default function FixedIncomeHub() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const {
    entities,
    accounts,
    cdts,
    transactions,
    historicalRates,
    preferredCurrency,
    projectionTimeline,
    projectionMode,
    monthlyDepositContribution,
    setPreferredCurrency,
    setProjectionTimeline,
    setProjectionMode,
    addTransaction,
    updateAccount,
    updateCDT,
    deleteEntity,
    deleteAccount,
    deleteCDT,
    deleteTransaction,
    deleteTransactions,
    updateTransactionsYear,
    migrateEntityProducts,
    initFetchFixedIncome,
    transferBetweenAccounts,
  } = useFixedIncomeStore();

  // Movimiento interno: { fromId, toId, amount } (Principal ➔ Bolsillo de la misma entidad)
  const [internalTransfer, setInternalTransfer] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState("account");
  const [importerOpen, setImporterOpen] = useState(false);
  const [showAllEntities, setShowAllEntities] = useState(false);
  const [selectedEntityView, setSelectedEntityView] = useState("all");
  const [selectedDetailEntityId, setSelectedDetailEntityId] = useState("ent_nu"); // 'all' | entityId
  const [futureYears, setFutureYears] = useState(0); // 0 to 10 years future simulation
  const [showSimulator, setShowSimulator] = useState(false); // Collapsible simulator
  const [showFixedIncomeChart, setShowFixedIncomeChart] = useState(true); // Default OPEN as main visual
  const [showEntitiesSection, setShowEntitiesSection] = useState(false); // Default COLLAPSED
  const [selectedModalEntityId, setSelectedModalEntityId] = useState(null); // Pre-select entity in modal
  const [fxRate, setFxRate] = useState(4150); // USD-COP fallback
  const [colInflationRate, setColInflationRate] = useState(5.16); // YoY IPC fallback

  // Automated Rate Tracker State
  const [rateTrackerAlerts, setRateTrackerAlerts] = useState([]);
  const [isCheckingRates, setIsCheckingRates] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetchRateTrackerAlerts()
      .then((data) => {
        if (isMounted && Array.isArray(data?.alerts)) {
          setRateTrackerAlerts(data.alerts);
        }
      })
      .catch((err) => {
        console.warn("[RateTracker] Background rate check bypassed:", err);
      });
    return () => {
      isMounted = false;
    };
  }, [accounts]);

  const handleCheckRatesNow = async () => {
    setIsCheckingRates(true);
    try {
      const data = await fetchRateTrackerAlerts();
      setRateTrackerAlerts(data?.alerts || []);
      if ((data?.alerts || []).length === 0) {
        toast.success("¡Todas tus cuentas están al día con las tasas de mercado!", { icon: "✅" });
      }
    } catch {
      toast.error("Error al consultar tasas de mercado");
    } finally {
      setIsCheckingRates(false);
    }
  };

  const handleFlashRateTest = async () => {
    setIsCheckingRates(true);
    try {
      const data = await fetchRateTrackerAlerts(true);
      setRateTrackerAlerts(data?.alerts || []);
      toast.success("¡Prueba Flash ejecutada! Alerta de mercado generada en vivo ⚡", { icon: "🧪" });
    } catch {
      toast.error("Error al ejecutar prueba flash");
    } finally {
      setIsCheckingRates(false);
    }
  };

  const handleApplyRateUpdate = async (alert) => {
    try {
      await applyUpdatedAccountRate({
        accountId: alert.accountId,
        newRate: alert.marketRateEA,
        effectiveDate: alert.suggestedEffectiveDate,
      });
      toast.success(`Tasa de ${alert.accountName} actualizada a ${alert.marketRateEA}% E.A.`, { icon: "⚡" });
      setRateTrackerAlerts((prev) => prev.filter((a) => a.accountId !== alert.accountId));
      if (typeof initFetchFixedIncome === "function") {
        initFetchFixedIncome();
      }
    } catch {
      toast.error("Error al aplicar la nueva tasa");
    }
  };
  const [editItem, setEditItem] = useState(null);
  const [editType, setEditType] = useState(null); // 'account' | 'cdt' | 'entity' | 'transaction'
  const [migrateFrom, setMigrateFrom] = useState(null); // entityId being migrated
  const [expandedAccountIds, setExpandedAccountIds] = useState(new Set());
  const [expandedAccountCdts, setExpandedAccountCdts] = useState(new Set());
  const [expandedAccountRates, setExpandedAccountRates] = useState(new Set());
  const [expandedMaturedEntities, setExpandedMaturedEntities] = useState(new Set());
  const [expandedEntityIds, setExpandedEntityIds] = useState(new Set());
  const [movementFilterType, setMovementFilterType] = useState({});
  const [movementSearch, setMovementSearch] = useState({});
  const [movementYear, setMovementYear] = useState({});
  const [selectedTxIds, setSelectedTxIds] = useState(new Set());
  const [batchTargetYear, setBatchTargetYear] = useState("2025");

  const handleDeleteTransaction = async (tx) => {
    const ok = await toastConfirm(
      `¿Estás seguro de eliminar el movimiento "${tx.description || "Movimiento"}" (${tx.date})?`
    );
    if (ok) {
      await deleteTransaction(tx.id);
      setSelectedTxIds((prev) => {
        const next = new Set(prev);
        next.delete(tx.id);
        return next;
      });
    }
  };

  const handleToggleSelectTx = (txId) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  };

  const handleSelectAllInAccount = (txList) => {
    const allIds = txList.map((t) => t.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedTxIds.has(id));
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allIds.forEach((id) => next.delete(id));
      } else {
        allIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBatchDelete = async (txIdsToDelete) => {
    const ids = txIdsToDelete || Array.from(selectedTxIds);
    if (ids.length === 0) return;
    const ok = await toastConfirm(
      `¿Estás seguro de eliminar los ${ids.length} movimientos seleccionados?`
    );
    if (ok) {
      await deleteTransactions(ids);
      setSelectedTxIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleBatchChangeYear = async (txIdsToUpdate, targetYear) => {
    const ids = txIdsToUpdate || Array.from(selectedTxIds);
    if (ids.length === 0) return;
    if (!targetYear || targetYear.length !== 4) {
      toast.error("Año inválido");
      return;
    }
    await updateTransactionsYear(ids, targetYear);
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleAccountExpand = (accId) => {
    setExpandedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accId)) next.delete(accId);
      else next.add(accId);
      return next;
    });
  };

  const toggleAccountCdts = (accId) => {
    setExpandedAccountCdts((prev) => {
      const next = new Set(prev);
      if (next.has(accId)) next.delete(accId);
      else next.add(accId);
      return next;
    });
  };

  const toggleAccountRates = (accId) => {
    setExpandedAccountRates((prev) => {
      const next = new Set(prev);
      if (next.has(accId)) next.delete(accId);
      else next.add(accId);
      return next;
    });
  };

  const toggleMaturedExpand = (entId) => {
    setExpandedMaturedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entId)) next.delete(entId);
      else next.add(entId);
      return next;
    });
  };

  const toggleEntityCollapse = (entId) => {
    setExpandedEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entId)) next.delete(entId);
      else next.add(entId);
      return next;
    });
  };

  useEffect(() => {
    initFetchFixedIncome();
    fetchFxHistory("USD", "COP")
      .then((res) => {
        if (res?.current) setFxRate(res.current);
      })
      .catch(console.error);

    fetchColInflationHistory()
      .then((res) => {
        if (res?.latest?.yoy) setColInflationRate(res.latest.yoy);
      })
      .catch(console.error);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        initFetchFixedIncome();
      }
    };
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [initFetchFixedIncome]);

  const handleDeleteAccount = async (acc) => {
    const ok = await toastConfirm(`¿Estás seguro de eliminar la cuenta "${acc.name}"?`);
    if (ok) {
      deleteAccount(acc.id);
      toast.success(`Cuenta "${acc.name}" eliminada`);
    }
  };

  const handleDeleteCDT = async (cdt) => {
    const ok = await toastConfirm(`¿Estás seguro de eliminar el CDT "${cdt.name}"?`);
    if (ok) {
      deleteCDT(cdt.id);
      toast.success(`CDT "${cdt.name}" eliminado`);
    }
  };

  const handleDeleteEntity = async (entity) => {
    const ok = await toastConfirm(
      `¿Eliminar la entidad "${entity.name}" y todos sus productos asociados?`,
    );
    if (ok) {
      deleteEntity(entity.id);
      toast.success(`Entidad "${entity.name}" eliminada`);
    }
  };

  const handleEdit = (item, type) => {
    setEditItem(item);
    setEditType(type);
    setModalTab(type);
    setModalOpen(true);
  };

  // Helper to convert any amount to the preferred currency (COP or USD)
  const convertAmount = (amount, fromCurrency) => {
    if (!amount) return 0;
    if (fromCurrency === preferredCurrency) return amount;
    if (fromCurrency === "USD" || fromCurrency === "USDC") {
      return preferredCurrency === "COP" ? amount * fxRate : amount;
    }
    if (fromCurrency === "COP") {
      return preferredCurrency === "USD" ? amount / fxRate : amount;
    }
    return amount;
  };

  const formatMoney = (amount, currency = "COP") => {
    const val = Number(amount || 0);
    if (currency === "USD" || currency === "USDC") {
      return `USD $${val.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const hasDecimals = Math.abs(val - Math.round(val)) >= 0.005;
    return `$${val.toLocaleString("es-CO", {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  };

  // ── Auto-generate Monthly Yield Transactions Handler ──────────
  const handleGenerateMonthlyYields = async (account) => {
    try {
      const missingPayouts = computeMissingMonthlyYieldTransactions(account, transactions, historicalRates);
      if (missingPayouts.length === 0) {
        toast.success(`Todos los rendimientos mensuales de ${account.name} ya están al día`);
        return;
      }

      const totalNewYield = missingPayouts.reduce((sum, t) => sum + t.amount, 0);
      const confirmed = await toastConfirm(
        `¿Deseas auto-generar ${missingPayouts.length} rendimientos mensuales (+COP $${totalNewYield.toLocaleString("es-CO", { minimumFractionDigits: 2 })} en total) para ${account.name}?`
      );

      if (!confirmed) return;

      // Add all generated transactions to store
      for (const tx of missingPayouts) {
        await addTransaction(tx);
      }

      // Update account balance to include new yields
      const newBal = (account.balance || 0) + totalNewYield;
      await updateAccount({ ...account, balance: newBal });

      toast.success(`¡Se agregaron ${missingPayouts.length} abonos de rendimientos mensuales exitosamente!`);
    } catch (err) {
      console.error(err);
      toast.error("Error al generar rendimientos mensuales");
    }
  };

  // ── 1. Entities for Yield Chart & Top Filter (ONLY entities that generate >0% E.A. or have CDTs; excludes 0% wallets like Nequi / Daviplata from chart) ──
  const chartEntities = useMemo(() => {
    return entities.filter((entity) => {
      const entNameLower = (entity.name || "").toLowerCase();
      if (entNameLower.includes("nequi") || entNameLower.includes("daviplata")) return false;

      const hasYieldAcc = accounts.some(
        (a) =>
          a.entityId === entity.id &&
          Number(a.interestRateEA || 0) > 0 &&
          a.accountCategory !== "digital_wallet" &&
          a.type !== "wallet"
      );
      const hasCdt = cdts.some((c) => c.entityId === entity.id);
      return hasYieldAcc || hasCdt;
    });
  }, [entities, accounts, cdts]);

  // ── 2. Active Entities for Master-Detail Account List (Includes Yield Entities + Nequi & Daviplata so balances are always visible) ──
  const activeEntities = useMemo(() => {
    if (showAllEntities) return entities;
    return entities.filter((entity) => {
      const hasAcc = accounts.some((a) => a.entityId === entity.id);
      const hasCdt = cdts.some((c) => c.entityId === entity.id);
      return hasAcc || hasCdt;
    });
  }, [entities, accounts, cdts, showAllEntities]);

  const activeEntityIdSet = useMemo(() => new Set(activeEntities.map((e) => e.id)), [activeEntities]);

  // ── Filtered data by selected entity view (all vs specific bank) ──
  const viewAccounts = useMemo(() => {
    if (selectedEntityView === "all") return accounts.filter((a) => activeEntityIdSet.has(a.entityId));
    return accounts.filter((a) => a.entityId === selectedEntityView);
  }, [accounts, selectedEntityView, activeEntityIdSet]);

  const viewCDTs = useMemo(() => {
    if (selectedEntityView === "all") return cdts.filter((c) => activeEntityIdSet.has(c.entityId));
    return cdts.filter((c) => c.entityId === selectedEntityView);
  }, [cdts, selectedEntityView, activeEntityIdSet]);

  const viewTransactions = useMemo(() => {
    if (selectedEntityView === "all") return transactions;
    const validAccIds = new Set(accounts.filter((a) => a.entityId === selectedEntityView).map((a) => a.id));
    return transactions.filter((t) => validAccIds.has(t.accountId));
  }, [transactions, accounts, selectedEntityView]);

  // ── Financial Metrics Aggregation ───────────────────────
  const metrics = useMemo(() => {
    let liquidBalance = 0; // Solo cuentas de inversión / cajitas que generan rendimiento (descontando CDTs activos)
    let transactionalBalance = 0; // Cuentas transaccionales de nómina y billeteras (0% E.A.)
    let totalDailyIncome = 0;
    let weightedRateSum = 0;

    // 1. Accounts / Cajitas Líquidas (Calculated Balance + Current Rate)
    viewAccounts.forEach((acc) => {
      const isZeroYield = acc.accountCategory === "digital_wallet" || acc.accountCategory === "payroll" || Number(acc.interestRateEA || 0) === 0 || acc.type === "wallet";
      const accTx = viewTransactions.filter((t) => (t.accountId ? t.accountId === acc.id : (t.description || "").toLowerCase().includes(acc.name.toLowerCase())));
      const yieldData = calculateAccountYield(acc, accTx, historicalRates, viewCDTs);
      const val = convertAmount(yieldData.liquidTotalBalance ?? acc.balance, acc.currency);

      if (isZeroYield) {
        transactionalBalance += val;
        return; // No se computa en el capital invertido de Renta Fija ni distorsiona la tasa ponderada
      }

      liquidBalance += val;

      const currentRateEA = Number(
        acc.interestRateEA !== undefined && acc.interestRateEA !== null ? acc.interestRateEA :
        (historicalRates?.entities?.[acc.entityId]?.savings_rates?.slice(-1)[0]?.rateEA || 9.30)
      );

      const dailyRate = Math.pow(1 + currentRateEA / 100, 1 / 360) - 1;
      const dailyIncome = val * dailyRate;

      totalDailyIncome += dailyIncome;
      weightedRateSum += currentRateEA * val;
    });

    // 2. CDTs Activos (Capital + Rendimientos Devengados + Tasa CDT)
    let cdtsCapitalTotal = 0;
    let cdtsExtraYield = 0;
    let activeCdtsCount = 0;

    viewCDTs.forEach((cdt) => {
      if (cdt.status === "matured") return; // CDTs cerrados ya reingresaron a las cajitas

      activeCdtsCount += 1;
      const capitalVal = convertAmount(cdt.capital || 0, cdt.currency);
      cdtsCapitalTotal += capitalVal;
      const rateDecimal = Number(cdt.interestRateEA || 11.0) / 100;
      const reteFuenteMultiplier = 1 - Number(cdt.reteFuentePct || 4) / 100;

      const startDate = new Date(cdt.startDate || new Date().toISOString().slice(0, 10));
      const today = new Date();
      const daysElapsed = Math.max(0, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)));

      // Rendimiento acumulado devengado
      const accruedGain = getCDTAccruedYield(cdt);
      cdtsExtraYield += accruedGain;

      const dailyRate = (Math.pow(1 + rateDecimal, 1 / 360) - 1) * reteFuenteMultiplier;
      const dailyIncome = capitalVal * dailyRate;

      totalDailyIncome += dailyIncome;
      weightedRateSum += (cdt.interestRateEA || 11.0) * capitalVal;
    });

    // Patrimonio total consolidado en Renta Fija = Saldo de Cajitas de Inversión + Capital de CDTs + Rendimientos Devengados de CDTs
    const totalPatrimony = liquidBalance + cdtsCapitalTotal + cdtsExtraYield;
    const totalPortfolioBase = liquidBalance + cdtsCapitalTotal;
    const weightedEA = totalPortfolioBase > 0 ? weightedRateSum / totalPortfolioBase : (viewAccounts[0]?.interestRateEA || 9.30);
    const monthlyIncome = totalDailyIncome * 30.416; // Promedio 30.416 días/mes

    // Fisher Equation Real Rate: (1 + EA) / (1 + Inflation) - 1
    const inflationDecimal = (preferredCurrency === "COP" ? colInflationRate : 3.0) / 100;
    const realRateEA = ((1 + weightedEA / 100) / (1 + inflationDecimal) - 1) * 100;

    return {
      liquidBalance,
      transactionalBalance,
      cdtsCapitalTotal,
      cdtsExtraYield,
      activeCdtsCount,
      totalPatrimony,
      totalDailyIncome,
      monthlyIncome,
      weightedEA,
      realRateEA,
    };
  }, [viewAccounts, viewCDTs, viewTransactions, historicalRates, preferredCurrency, fxRate, colInflationRate]);

  // ── Real Historical Compound Interest Growth Calculator ──
  const hasAnyData = viewAccounts.length > 0 || viewTransactions.length > 0 || viewCDTs.length > 0;

  // ── Primera apertura real (fecha más temprana de primera transacción o apertura de CDT) ──
  const firstOpenDate = useMemo(() => {
    const dates = [];
    const sortedTx = [...viewTransactions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (sortedTx.length > 0) dates.push(sortedTx[0].date);
    viewCDTs.forEach((c) => { if (c.startDate) dates.push(c.startDate); });
    
    if (dates.length === 0) {
      viewAccounts.forEach((a) => {
        if (a.startDate && a.startDate !== "2023-06-01") dates.push(a.startDate.slice(0, 10));
      });
    }
    
    dates.sort();
    return dates[0] || new Date().toISOString().slice(0, 10);
  }, [viewAccounts, viewTransactions, viewCDTs]);

  const daysSinceOpen = useMemo(() => {
    const start = new Date(firstOpenDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
  }, [firstOpenDate]);

  const historicalSeries = useMemo(() => {
    if (!hasAnyData) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const label = new Date(todayStr).toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
      const total = Number(metrics.totalPatrimony || 0);
      return [{ date: todayStr, dateLabel: label, projectedValue: total, baseCapital: total, earnings: 0, rate: metrics.weightedEA || 9.30 }];
    }

    const startDateStr = firstOpenDate;
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);

    // 1. Prepare individual account simulators (SOLO para cuentas de inversión en Renta Fija; excluye nómina y billeteras para evitar distorsión o picos artificiales)
    const investmentAccounts = viewAccounts.filter((acc) => {
      const isZeroYield = acc.accountCategory === "digital_wallet" || acc.accountCategory === "payroll" || Number(acc.interestRateEA || 0) === 0 || acc.type === "wallet";
      return !isZeroYield;
    });

    const accountSimulators = investmentAccounts.map((acc) => {
      const accTx = viewTransactions.filter((t) =>
        t.accountId ? t.accountId === acc.id : (t.description || "").toLowerCase().includes(acc.name.toLowerCase())
      );

      const capTxByDate = {};
      const intTxByDate = {};
      let hasExplicitPayouts = false;

      accTx.forEach((t) => {
        const d = t.date || new Date().toISOString().slice(0, 10);
        const amt = Math.abs(Number(t.amount || 0));
        const descLower = (t.description || "").toLowerCase();
        const isInterest =
          t.isInterestPayout ||
          descLower.includes("rendimiento") ||
          descLower.includes("interés") ||
          descLower.includes("interes");

        const isDebit =
          !isInterest &&
          (t.type === "debit" ||
            descLower.includes("retiraste") ||
            descLower.includes("retiro") ||
            descLower.includes("invertiste") ||
            Number(t.amount) < 0);

        if (isInterest) {
          hasExplicitPayouts = true;
          intTxByDate[d] = (intTxByDate[d] || 0) + amt;
        } else {
          const change = isDebit ? -amt : amt;
          capTxByDate[d] = (capTxByDate[d] || 0) + change;
        }
      });

      const sortedAccRateHistory = Array.isArray(acc.rateHistory)
        ? [...acc.rateHistory].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        : [];

      const getRate = (dStr, balance = 0) => {
        if (acc.accountCategory === "digital_wallet" || acc.accountCategory === "payroll" || Number(acc.interestRateEA || 0) === 0 || acc.type === "wallet") {
          return 0.0;
        }

        if (acc.type === "crypto") {
          return Number(acc.interestRateEA || 8.0);
        }

        if (sortedAccRateHistory.length > 0) {
          let activeHistRate = null;
          for (const rh of sortedAccRateHistory) {
            if (rh.date && dStr >= rh.date) {
              activeHistRate = Number(rh.rateEA);
            }
          }
          if (activeHistRate && activeHistRate > 0) {
            return activeHistRate;
          }
        }

        if (acc.tieredRates && acc.tieredRates.length > 0) {
          for (const tier of acc.tieredRates) {
            if (balance <= (tier.maxBalance || Infinity)) {
              return Number(tier.rateEA || acc.interestRateEA || 4.0);
            }
          }
          return Number(acc.tieredRates[acc.tieredRates.length - 1].rateEA || acc.interestRateEA || 4.0);
        }

        let entityRates = historicalRates?.entities?.[acc.entityId]?.savings_rates;
        if (!entityRates && historicalRates?.entities) {
          const entName = (acc.entityName || "").toLowerCase();
          for (const [k, v] of Object.entries(historicalRates.entities)) {
            const kClean = k.toLowerCase().replace("ent_", "");
            const vClean = (v.name || "").toLowerCase();
            if ((entName && (kClean.includes(entName) || vClean.includes(entName))) || (acc.entityId && acc.entityId.includes(kClean))) {
              entityRates = v.savings_rates;
              break;
            }
          }
        }

        if (!entityRates && (acc.entityId === "ent_nu" || acc.entityId?.includes("nu") || (acc.name || "").toLowerCase().includes("nu"))) {
          entityRates = [
            { from: "2023-06-01", to: "2024-10-07", rateEA: 13.0 },
            { from: "2024-10-08", to: "2024-12-09", rateEA: 12.0 },
            { from: "2024-12-10", to: "2025-03-09", rateEA: 11.0 },
            { from: "2025-03-10", to: "2025-05-08", rateEA: 9.5 },
            { from: "2025-05-09", to: "2025-08-11", rateEA: 9.25 },
            { from: "2025-08-12", to: "2026-02-05", rateEA: 8.25 },
            { from: "2026-02-06", to: "2026-10-05", rateEA: 9.25 },
            { from: "2026-10-06", to: "2099-12-31", rateEA: 9.35 },
          ];
        }

        if (entityRates && entityRates.length > 0) {
          for (const r of entityRates) {
            if (dStr >= r.from && dStr <= r.to) return Number(r.rateEA || 9.30);
          }
        }

        return Number(acc.interestRateEA || (acc.currency === "USD" ? 4.0 : 9.30));
      };

      return {
        acc,
        capTxByDate,
        intTxByDate,
        hasExplicitPayouts,
        getRate,
        currCapital: 0,
        currBalance: 0,
        currEarnings: 0,
      };
    });

    const series = [];
    let currDate = new Date(startDateStr + "T00:00:00");

    while (currDate <= endDate) {
      const dStr = currDate.toISOString().slice(0, 10);

      let dayTotalCapital = 0;
      let dayTotalBalance = 0;
      let dayTotalEarnings = 0;
      let dayWeightedRateSum = 0;

      // Advance each account for this day
      accountSimulators.forEach((sim) => {
        // Apply capital transactions
        if (sim.capTxByDate[dStr]) {
          sim.currCapital = Math.max(0, sim.currCapital + sim.capTxByDate[dStr]);
          sim.currBalance = Math.max(0, sim.currBalance + sim.capTxByDate[dStr]);
        }

        // Apply explicit interest transactions
        if (sim.intTxByDate[dStr]) {
          sim.currBalance = Math.max(0, sim.currBalance + sim.intTxByDate[dStr]);
          sim.currEarnings += sim.intTxByDate[dStr];
        }

        // Dynamic daily compounding for accounts without explicit monthly payout rows (e.g. Nu)
        const rateEA = sim.getRate(dStr, sim.currBalance);
        if (!sim.hasExplicitPayouts && sim.currBalance > 0) {
          const dailyRate = Math.pow(1 + rateEA / 100, 1 / 360) - 1;
          const dailyInterest = sim.currBalance * dailyRate;
          sim.currEarnings += dailyInterest;
          sim.currBalance += dailyInterest;
        }

        const capConv = convertAmount(sim.currCapital, sim.acc.currency);
        const balConv = convertAmount(sim.currBalance, sim.acc.currency);
        const earnConv = convertAmount(sim.currEarnings, sim.acc.currency);

        dayTotalCapital += capConv;
        dayTotalBalance += balConv;
        dayTotalEarnings += earnConv;
        if (balConv > 0) {
          dayWeightedRateSum += rateEA * balConv;
        }
      });

      // Active CDTs extra yield on this day
      let activeCDTsExtraYield = 0;
      let activeCDTsCapitalOnDay = 0;
      let activeCDTsRateSum = 0;

      viewCDTs.forEach((c) => {
        if (c.status !== "matured") {
          const sDate = c.startDate || "2024-01-01";
          const mDate = c.maturityDate || c.payoutDate || sDate;
          if (dStr >= sDate && dStr <= mDate) {
            const capRaw = Number(c.capital || 0);
            const cap = convertAmount(capRaw, c.currency);
            const rEA = Number(c.interestRateEA || 11.0);
            const rete = 1 - Number(c.reteFuentePct || 4) / 100;
            const startD = new Date(sDate);
            const thisD = new Date(dStr);
            const daysEl = Math.max(0, Math.floor((thisD - startD) / (1000 * 60 * 60 * 24)));
            const cdtYieldRaw = capRaw * (Math.pow(1 + rEA / 100, daysEl / 360) - 1) * rete;
            const cdtYield = convertAmount(cdtYieldRaw, c.currency);

            const isLinkedToPocket = investmentAccounts.some((acc) => {
              if (c.entityId !== acc.entityId) return false;
              const accNameLower = (acc.name || "").toLowerCase().replace("cajita", "").trim();
              const catLower = (c.category || "").toLowerCase();
              const nameLower = (c.name || "").toLowerCase();
              return (
                (accNameLower && (catLower.includes(accNameLower) || nameLower.includes(accNameLower))) ||
                c.accountId === acc.id
              );
            });

            activeCDTsExtraYield += cdtYield;
            if (!isLinkedToPocket) {
              activeCDTsCapitalOnDay += cap;
            }
            activeCDTsRateSum += rEA * cap;
          }
        }
      });

      const totalPortfolioBalance = dayTotalBalance + activeCDTsCapitalOnDay + activeCDTsExtraYield;
      const totalPortfolioCapital = dayTotalCapital + activeCDTsCapitalOnDay;
      const totalPortfolioEarnings = dayTotalEarnings + activeCDTsExtraYield;
      
      const totalActiveAssets = dayTotalBalance + activeCDTsCapitalOnDay;
      let finalWeightedRate = 13.0;
      if (totalActiveAssets > 0) {
        finalWeightedRate = (dayWeightedRateSum + activeCDTsRateSum) / totalActiveAssets;
      } else {
        const firstSim = accountSimulators[0];
        finalWeightedRate = firstSim ? firstSim.getRate(dStr, 0) : 13.0;
      }

      const label = currDate.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });

      series.push({
        date: dStr,
        dateLabel: label,
        projectedValue: Number(totalPortfolioBalance.toFixed(2)),
        baseCapital: Number(totalPortfolioCapital.toFixed(2)),
        earnings: Number(Math.max(0, totalPortfolioEarnings).toFixed(2)),
        rate: Number((finalWeightedRate || 9.30).toFixed(2)),
      });

      currDate.setDate(currDate.getDate() + 1);
    }

    return series;
  }, [viewTransactions, viewCDTs, viewAccounts, historicalRates, metrics, firstOpenDate, hasAnyData, selectedEntityView, preferredCurrency, fxRate]);

  // ── Historical & Future Compound Interest Projection Series ───────────────────
  const projectionSeries = useMemo(() => {
    if (historicalSeries.length === 0) return [];
    
    let baseData = historicalSeries;

    const daysMap = {
      "1M": 30,
      "3M": 90,
      "6M": 180,
      "1Y": 365,
      "3Y": 1095,
      "5Y": 1825,
    };
    
    if (futureYears === 0 && projectionTimeline !== "ALL" && projectionTimeline !== "MAX" && daysMap[projectionTimeline]) {
      const totalDays = daysMap[projectionTimeline];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - totalDays);
      const cutoffStr = cutoffDate.toISOString().slice(0, 10);
      const filtered = historicalSeries.filter((pt) => pt.date >= cutoffStr);
      baseData = filtered.length > 0 ? filtered : historicalSeries;
    }

    if (futureYears <= 0) {
      return baseData;
    }

    // ── Extend series into the future with current rate & capital ──
    const extended = [...baseData];
    const latestPt = historicalSeries[historicalSeries.length - 1];
    if (!latestPt) return baseData;

    const todayD = new Date();
    todayD.setHours(0, 0, 0, 0);

    const endFutureD = new Date(todayD);
    endFutureD.setDate(endFutureD.getDate() + Math.round(Number(futureYears) * 365.25));

    const stepDays = Number(futureYears) > 5 ? 5 : Number(futureYears) > 2 ? 3 : 1;
    let fD = new Date(todayD);
    fD.setDate(fD.getDate() + stepDays);

    const currentRate = Number(metrics.weightedEA || 9.88);

    while (fD <= endFutureD) {
      const dStr = fD.toISOString().slice(0, 10);
      const daysFromToday = Math.max(0, Math.floor((fD - todayD) / (1000 * 60 * 60 * 24)));
      const futureBal = latestPt.projectedValue * Math.pow(1 + currentRate / 100, daysFromToday / 360);
      const futureEarnings = latestPt.earnings + (futureBal - latestPt.projectedValue);
      const label = fD.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });

      extended.push({
        date: dStr,
        dateLabel: `${label} (Proy.)`,
        projectedValue: Number(futureBal.toFixed(2)),
        baseCapital: Number(latestPt.baseCapital.toFixed(2)),
        earnings: Number(Math.max(0, futureEarnings).toFixed(2)),
        rate: currentRate,
        isProjected: true,
      });

      fD.setDate(fD.getDate() + stepDays);
    }

    return extended;
  }, [historicalSeries, projectionTimeline, futureYears, metrics.weightedEA]);

  const currSymbol = preferredCurrency === "COP" ? "COP $" : "USD $";



  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── AUTOMATED WEEKLY RATE TRACKER ALERTS BANNER ──────── */}
      {rateTrackerAlerts.length > 0 && (
        <div
          style={{
            background: isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(14, 165, 233, 0.12)",
            border: "1px solid rgba(14, 165, 233, 0.35)",
            borderRadius: "14px",
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.4rem" }}>🔔</span>
              <div>
                <strong style={{ fontSize: "0.92rem", color: "var(--text-primary)" }}>
                  Seguimiento Semanal de Tasas de Mercado ({rateTrackerAlerts.length} detectadas)
                </strong>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
                  Verificado con fuentes oficiales del sistema financiero colombiano y USD. Solo afecta cálculos desde la fecha de vigencia sin alterar tus rendimientos históricos pasados.
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleFlashRateTest}
                disabled={isCheckingRates}
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid #10b981",
                  color: "#10b981",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
                title="Genera una alerta de prueba en vivo para verificar el flujo de actualización"
              >
                ⚡ Prueba Flash en Vivo
              </button>

              <button
                type="button"
                onClick={handleCheckRatesNow}
                disabled={isCheckingRates}
                style={{
                  background: "rgba(14, 165, 233, 0.2)",
                  border: "1px solid #0ea5e9",
                  color: "#0ea5e9",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isCheckingRates ? "Verificando..." : "🔄 Re-verificar Ahora"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rateTrackerAlerts.map((alert) => (
              <div
                key={alert.accountId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: isLight ? "#ffffff" : "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 240px" }}>
                  <span style={{ fontSize: "1.1rem" }}>{alert.direction === "up" ? "📈" : "📉"}</span>
                  <div>
                    <strong style={{ fontSize: "0.86rem", color: "var(--text-primary)", display: "block" }}>
                      {alert.entityName} • {alert.accountName}
                    </strong>
                    <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      Tasa actual: <span style={{ color: "#f43f5e", fontWeight: 700 }}>{alert.currentRateEA.toFixed(2)}% E.A.</span> ➔ Mercado: <span style={{ color: "#10b981", fontWeight: 700 }}>{alert.marketRateEA.toFixed(2)}% E.A.</span> ({alert.diff > 0 ? `+${alert.diff.toFixed(2)}%` : `${alert.diff.toFixed(2)}%`})
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleApplyRateUpdate(alert)}
                    style={{
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      border: "none",
                      color: "#fff",
                      borderRadius: "8px",
                      padding: "6px 12px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ⚡ Actualizar a {alert.marketRateEA.toFixed(2)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setRateTrackerAlerts((prev) => prev.filter((a) => a.accountId !== alert.accountId))}
                    style={{
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      borderRadius: "8px",
                      padding: "6px 10px",
                      fontSize: "0.76rem",
                      cursor: "pointer",
                    }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── ENTITY VIEW SELECTOR TABS ─────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflowX: "auto",
          padding: "4px 0",
        }}
      >
        <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, whiteSpace: "nowrap" }}>
          👁️ Filtrar Vista:
        </span>
        <button
          onClick={() => setSelectedEntityView("all")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            background: selectedEntityView === "all" ? "rgba(56, 189, 248, 0.2)" : "rgba(15, 23, 42, 0.6)",
            border: `1px solid ${selectedEntityView === "all" ? "#38bdf8" : "rgba(255, 255, 255, 0.08)"}`,
            color: selectedEntityView === "all" ? "#38bdf8" : "#94a3b8",
            fontSize: "0.78rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>🌐 Consolidado Global ({chartEntities.length})</span>
        </button>

        {chartEntities.map((ent) => {
          const isSelected = selectedEntityView === ent.id;
          return (
            <button
              key={ent.id}
              onClick={() => setSelectedEntityView(ent.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 8,
                background: isSelected ? `${ent.color}33` : "rgba(15, 23, 42, 0.6)",
                border: `1px solid ${isSelected ? ent.color : "rgba(255, 255, 255, 0.08)"}`,
                color: isSelected ? "#fff" : "#94a3b8",
                fontSize: "0.78rem",
                fontWeight: isSelected ? 800 : 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <img
                  src={ent.logoUrl || svgToDataUri(getBankPreset(ent.name).logoSvg)}
                  alt={ent.name}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
              <span>{ent.name}</span>
            </button>
          );
        })}
      </div>

      {/* ── HEADER SUMMARY KPI BAR ────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          background: "var(--bg-card)",
          padding: "16px 20px",
          borderRadius: 14,
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
            }}
          >
            Patrimonio Renta Fija
          </div>
          <div
            style={{
              fontSize: "1.45rem",
              fontWeight: 800,
              color: "var(--text-primary)",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            {currSymbol}{" "}
            {metrics.totalPatrimony.toLocaleString("es-CO", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--accent-primary)", marginTop: 4, fontWeight: 600, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span>💧 Cajitas de Inversión: {currSymbol} {metrics.liquidBalance.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            {metrics.cdtsCapitalTotal > 0 && (
              <>
                <span>•</span>
                <span>⏳ CDTs ({metrics.activeCdtsCount}): {currSymbol} {metrics.cdtsCapitalTotal.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </>
            )}
            {metrics.cdtsExtraYield > 0 && (
              <>
                <span>•</span>
                <span style={{ color: "var(--gain)" }}>📈 +{currSymbol} {metrics.cdtsExtraYield.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} rend.</span>
              </>
            )}
            {metrics.transactionalBalance > 0 && (
              <>
                <span>•</span>
                <span style={{ color: "var(--text-muted)" }}>💼 Nómina & Billeteras: {currSymbol} {metrics.transactionalBalance.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </>
            )}
          </div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>
            {preferredCurrency === "COP"
              ? `≈ USD $${(metrics.totalPatrimony / fxRate).toFixed(2)}`
              : `≈ COP $${(metrics.totalPatrimony * fxRate).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`}
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
            }}
          >
            Rendimiento Diario
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "var(--gain)",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            +{currSymbol}{" "}
            {metrics.totalDailyIncome.toLocaleString("es-CO", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--gain)", marginTop: 2, fontWeight: 600 }}>
            Generación pasiva diaria
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
            }}
          >
            Rendimiento Mensual Estimado
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "var(--accent-primary)",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            +{currSymbol}{" "}
            {metrics.monthlyIncome.toLocaleString("es-CO", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
            ≈ 30.4 días capitalizables
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
            }}
          >
            Tasa Ponderada E.A.
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 800,
              color: isLight ? "#92400e" : "#d97706",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            {metrics.weightedEA.toFixed(2)}%{" "}
            <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)" }}>E.A.</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: isLight ? "#92400e" : "#d97706", marginTop: 2, fontWeight: 600 }}>
            Promedio ponderado del capital
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
            }}
          >
            Rendimiento Real (vs IPC)
          </div>
          <div
            style={{
              fontSize: "1.35rem",
              fontWeight: 800,
              color: metrics.realRateEA >= 0 ? "var(--gain)" : "var(--loss)",
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: 4,
            }}
          >
            {metrics.realRateEA >= 0 ? "+" : ""}
            {metrics.realRateEA.toFixed(2)}%{" "}
            <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)" }}>Real</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
            Ajustado por inflación (
            {preferredCurrency === "COP" ? `IPC CO ${colInflationRate}%` : "IPC US 3.0%"})
          </div>
        </div>
      </div>

      {/* ── ACTION & FILTER CONTROLS BAR ─────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setImporterOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
              color: "#0f172a",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 800,
              fontSize: "0.8rem",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(56, 189, 248, 0.3)",
            }}
          >
            📄 Importar Extracto PDF / Foto
          </button>
          <button
            onClick={() => {
              setEditItem(null);
              setEditType(null);
              setModalTab("account");
              setModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#10b981",
              color: "#000",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            + Cuenta / Bolsillo
          </button>
          <button
            onClick={() => {
              setEditItem(null);
              setEditType(null);
              setModalTab("cdt");
              setModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#f59e0b",
              color: "#000",
              border: "none",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            + Nuevo CDT
          </button>
          <button
            onClick={() => {
              setEditItem(null);
              setEditType(null);
              setModalTab("entity");
              setModalOpen(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255, 255, 255, 0.08)",
              color: "#f1f5f9",
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            🏦 + Entidad
          </button>
        </div>

        {/* Currency & Timeline Switchers */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Divisa */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 18,
              padding: 3,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <button
              onClick={() => setPreferredCurrency("COP")}
              style={{
                padding: "5px 12px",
                borderRadius: 15,
                border: "none",
                background: preferredCurrency === "COP" ? "#10b981" : "transparent",
                color: preferredCurrency === "COP" ? "#000" : "#94a3b8",
                fontWeight: preferredCurrency === "COP" ? 700 : 400,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              🇨🇴 COP
            </button>
            <button
              onClick={() => setPreferredCurrency("USD")}
              style={{
                padding: "5px 12px",
                borderRadius: 15,
                border: "none",
                background: preferredCurrency === "USD" ? "#00e5ff" : "transparent",
                color: preferredCurrency === "USD" ? "#000" : "#94a3b8",
                fontWeight: preferredCurrency === "USD" ? 700 : 400,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              🇺🇸 USD
            </button>
          </div>

          {/* Modo Proyección */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 18,
              padding: 3,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <button
              onClick={() => setProjectionMode("NOMINAL")}
              style={{
                padding: "5px 12px",
                borderRadius: 15,
                border: "none",
                background: projectionMode === "NOMINAL" ? "#38bdf8" : "transparent",
                color: projectionMode === "NOMINAL" ? "#000" : "#94a3b8",
                fontWeight: projectionMode === "NOMINAL" ? 700 : 400,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Nominal
            </button>
            <button
              onClick={() => setProjectionMode("REAL")}
              style={{
                padding: "5px 12px",
                borderRadius: 15,
                border: "none",
                background: projectionMode === "REAL" ? "#f59e0b" : "transparent",
                color: projectionMode === "REAL" ? "#000" : "#94a3b8",
                fontWeight: projectionMode === "REAL" ? 700 : 400,
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              Real (Ajustado IPC)
            </button>
          </div>

          {/* Horizonte Temporal */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 18,
              padding: 3,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {["1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"].map((t) => {
              const isLocked = t !== "MAX" && daysSinceOpen < (PERIOD_UNLOCK_DAYS[t] || 0);
              const isSelected =
                projectionTimeline === t ||
                (t === "MAX" && (projectionTimeline === "ALL" || projectionTimeline === "MAX"));
              return (
                <button
                  key={t}
                  onClick={() => {
                    if (isLocked) return;
                    setProjectionTimeline(t === "MAX" ? "ALL" : t);
                  }}
                  title={isLocked ? "Requiere más historial desde la apertura de tu primera cuenta" : undefined}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 15,
                    border: "none",
                    background: isSelected ? "#820ad1" : "transparent",
                    color: isSelected ? "#fff" : "#94a3b8",
                    fontWeight: isSelected ? 700 : 400,
                    fontSize: "0.75rem",
                    cursor: isLocked ? "not-allowed" : "pointer",
                    opacity: isLocked ? 0.35 : 1,
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── INTERACTIVE 10-YEAR FUTURE PROJECTION SIMULATOR ──────── */}
      <div
        style={{
          background: futureYears > 0 ? "rgba(15, 23, 42, 0.85)" : "rgba(15, 23, 42, 0.5)",
          border: `1px solid ${futureYears > 0 ? "rgba(56, 189, 248, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
          borderRadius: 14,
          padding: "12px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxShadow: futureYears > 0 ? "0 4px 20px rgba(56, 189, 248, 0.15)" : "0 4px 16px rgba(0, 0, 0, 0.2)",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: futureYears > 0 ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
              }}
            >
              🔮
            </div>
            <div>
              <div style={{ fontWeight: 800, color: futureYears > 0 ? "#38bdf8" : "#f1f5f9", fontSize: "0.86rem", display: "flex", alignItems: "center", gap: 6 }}>
                <span>Simulador Proyectivo a Futuro</span>
                <span
                  style={{
                    background: futureYears > 0 ? "#38bdf8" : "rgba(255,255,255,0.1)",
                    color: futureYears > 0 ? "#000" : "#94a3b8",
                    padding: "1px 8px",
                    borderRadius: 12,
                    fontSize: "0.7rem",
                    fontWeight: 800,
                  }}
                >
                  {futureYears === 0 ? "0 Años (Hoy)" : `+${futureYears} Años (${Math.round(futureYears * 12)} meses)`}
                </span>
              </div>
              <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: 2 }}>
                Interés compuesto a partir de hoy con tu capital actual y tasa vigente ({metrics.weightedEA.toFixed(2)}% E.A.)
              </div>
            </div>
          </div>

          {/* Toggle button */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowSimulator(!showSimulator);
              }}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: "4px 10px",
                color: "var(--text-muted)",
                fontSize: "0.74rem",
                cursor: "pointer",
              }}
            >
              {showSimulator ? "▲ Ocultar Simulador" : "▼ Desplegar Simulador"}
            </button>
          </div>
        </div>

        {showSimulator && (
          <>
            {/* Quick preset buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {[0, 1, 3, 5, 10].map((yr) => (
                <button
                  key={yr}
                  onClick={() => setFutureYears(yr)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 6,
                    border: `1px solid ${futureYears === yr ? "#38bdf8" : "rgba(255,255,255,0.1)"}`,
                    background: futureYears === yr ? "rgba(56, 189, 248, 0.2)" : "rgba(0,0,0,0.25)",
                    color: futureYears === yr ? "#38bdf8" : "#94a3b8",
                  fontSize: "0.7rem",
                  fontWeight: futureYears === yr ? 800 : 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {yr === 0 ? "Hoy (0A)" : `+${yr}A`}
              </button>
            ))}
          </div>

        {/* Hourglass Range Slider Proyectivo */}
        <div style={{ margin: "4px 0" }}>
          <HourglassRangeSlider
            min={0}
            max={10}
            step={0.5}
            value={futureYears}
            onChange={(val) => setFutureYears(val)}
          />
        </div>

        {/* Live Projections Result Badge */}
        {futureYears > 0 && (() => {
          const latestPt = projectionSeries[projectionSeries.length - 1];
          const futBal = latestPt?.projectedValue || metrics.totalPatrimony;
          const futGain = latestPt?.earnings || 0;
          const futMonthlyIncome = futBal * (Math.pow(1 + (metrics.weightedEA / 100), 1 / 360) - 1) * 30.416;

          return (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8,
                padding: "8px 12px",
                background: "rgba(0, 0, 0, 0.35)",
                borderRadius: 8,
                border: "1px solid rgba(56, 189, 248, 0.2)",
                marginTop: 2,
              }}
            >
              <div>
                <span style={{ fontSize: "0.6rem", color: "#94a3b8", display: "block" }}>💰 Saldo Proyectado (+{futureYears}A)</span>
                <span className="mono" style={{ fontSize: "0.88rem", fontWeight: 800, color: "#10b981" }}>
                  {currSymbol} {futBal.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "0.6rem", color: "#94a3b8", display: "block" }}>📈 Ganancia Neta Proyectada</span>
                <span className="mono" style={{ fontSize: "0.88rem", fontWeight: 800, color: "#38bdf8" }}>
                  +{currSymbol} {futGain.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "0.6rem", color: "#94a3b8", display: "block" }}>💎 Renta Pasiva Estimada al Año {futureYears}</span>
                <span className="mono" style={{ fontSize: "0.88rem", fontWeight: 800, color: isLight ? "#92400e" : "#f59e0b" }}>
                  {currSymbol} {futMonthlyIncome.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mes
                </span>
              </div>
            </div>
          );
        })()}
        </>
      )}
      </div>

      {/* ── INTERACTIVE HISTORICAL & FUTURE GROWTH CHART ───────── */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 14,
          padding: showFixedIncomeChart ? "14px" : "12px 18px",
          transition: "all 0.2s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            marginBottom: showFixedIncomeChart ? 12 : 0,
          }}
          onClick={() => setShowFixedIncomeChart(!showFixedIncomeChart)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>📈</span>
            <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Gráfico de Crecimiento Histórico & Curva de Proyección
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowFixedIncomeChart(!showFixedIncomeChart);
            }}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: "var(--text-muted)",
              fontSize: "0.74rem",
              cursor: "pointer",
            }}
          >
            {showFixedIncomeChart ? "▲ Ocultar Gráfico" : "▼ Desplegar Gráfico"}
          </button>
        </div>

        {showFixedIncomeChart && (
          <FixedIncomeProjectionChart
            projectionData={projectionSeries}
            currency={preferredCurrency}
            mode={projectionMode}
          />
        )}
      </div>

      {/* ── ENTITIES & ACCOUNTS SECTION (COLLAPSIBLE) ───────── */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: showEntitiesSection ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: showEntitiesSection ? 16 : 0,
          }}
          onClick={() => setShowEntitiesSection(!showEntitiesSection)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>🏦</span>
            <h4 style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 700 }}>
              Entidades y Cuentas Activas ({activeEntities.length})
            </h4>
            <span
              style={{
                fontSize: "0.7rem",
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.1)",
                padding: "2px 8px",
                borderRadius: 12,
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              {accounts.filter((a) => activeEntityIdSet.has(a.entityId)).length} cuenta(s) • {cdts.filter((c) => activeEntityIdSet.has(c.entityId) && c.status !== "matured").length} CDT(s) activo(s)
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showEntitiesSection && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAllEntities(!showAllEntities);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#94a3b8",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: "0.72rem",
                  cursor: "pointer",
                }}
              >
                {showAllEntities ? "Ver solo entidades con saldo" : "Ver catálogo completo de entidades"}
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowEntitiesSection(!showEntitiesSection);
              }}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                color: "var(--text-muted)",
                fontSize: "0.74rem",
                cursor: "pointer",
              }}
            >
              {showEntitiesSection ? "▲ Ocultar Entidades" : "▼ Desplegar Entidades"}
            </button>
          </div>
        </div>

        {showEntitiesSection && (
          <>
            {/* ── ENTITIES & ACCOUNTS CONTAINER (ADAPTIVE SMART MASONRY) ── */}
      {(() => {
        const renderEntityCard = (entity, forceExpanded = false) => {
          if (!entity) return null;
          const isEntityCollapsed = forceExpanded ? false : !expandedEntityIds.has(entity.id);
          const rawAccounts = accounts.filter((a) => a.entityId === entity.id);
          // Sort accounts: Nómina & Débito Principal ALWAYS first at the top
          const entityAccounts = [...rawAccounts].sort((a, b) => {
            const isPayrollA =
              a.accountCategory === "payroll" ||
              a.isPayroll ||
              a.type === "payroll" ||
              /n[oó]mina|principal|d[eé]bito/i.test(a.name);
            const isPayrollB =
              b.accountCategory === "payroll" ||
              b.isPayroll ||
              b.type === "payroll" ||
              /n[oó]mina|principal|d[eé]bito/i.test(b.name);

            if (isPayrollA && !isPayrollB) return -1;
            if (!isPayrollA && isPayrollB) return 1;
            return (b.balance || 0) - (a.balance || 0);
          });
          const entityCDTs = cdts.filter((c) => c.entityId === entity.id);
          const activeEntityCDTs = entityCDTs.filter((c) => c.status !== "matured");

          const entityCurrency = entityAccounts[0]?.currency || entityCDTs[0]?.currency || "COP";
          const entCurrSymbol = entityCurrency === "USD" ? "USD $" : "COP $";

          const isAccountTransactional = (acc) =>
            acc.accountCategory === "payroll" ||
            acc.accountCategory === "digital_wallet" ||
            acc.type === "wallet" ||
            Number(acc.interestRateEA || 0) === 0;

          const investedAccounts = entityAccounts.filter((a) => !isAccountTransactional(a));
          const transactionalAccounts = entityAccounts.filter((a) => isAccountTransactional(a));

          const accountsLiquidInvested = investedAccounts.reduce((sum, a) => {
            const accTx = transactions.filter(t => t.accountId ? t.accountId === a.id : (t.description || "").toLowerCase().includes(a.name.toLowerCase()));
            const yieldData = calculateAccountYield(a, accTx, historicalRates, cdts);
            return sum + (yieldData.liquidTotalBalance ?? a.balance ?? 0);
          }, 0);

          const accountsTransactionalTotal = transactionalAccounts.reduce((sum, a) => {
            const accTx = transactions.filter(t => t.accountId ? t.accountId === a.id : (t.description || "").toLowerCase().includes(a.name.toLowerCase()));
            if (accTx.length > 0) {
              const netTx = accTx.reduce((s, tx) => {
                const descLower = (tx.description || "").toLowerCase();
                const isDebit = tx.type === "debit" || descLower.includes("retiraste") || descLower.includes("retiro") || descLower.includes("invertiste") || Number(tx.amount) < 0;
                const amt = Math.abs(Number(tx.amount || 0));
                return s + (isDebit ? -amt : amt);
              }, 0);
              return sum + Math.max(0, netTx);
            }
            return sum + (a.balance || 0);
          }, 0);

          // Rendimientos devengados de CDTs activos a la fecha de hoy
          const activeCDTsAccruedYield = activeEntityCDTs.reduce((sum, cdt) => {
            return sum + getCDTAccruedYield(cdt);
          }, 0);

          const activeCDTsCapitalTotal = activeEntityCDTs.reduce((sum, c) => sum + (c.capital || 0), 0);
          const activeCDTsTotal = activeCDTsCapitalTotal + activeCDTsAccruedYield;
          const entityInvestedTotal = accountsLiquidInvested + activeCDTsTotal;
          const entityGrandTotal = entityInvestedTotal + accountsTransactionalTotal;

          return (
            <div
              key={entity.id}
              style={{
                background: "var(--bg-card)",
                borderRadius: 14,
                border: `1px solid ${entity.color}33`,
                overflow: "hidden",
                boxShadow: "var(--shadow-card)",
              }}
            >
              {/* Entity Card Header */}
              <div
                style={{
                  padding: "14px 18px",
                  background: `${entity.color}15`,
                  borderBottom: isEntityCollapsed ? "none" : `1px solid ${entity.color}33`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {/* Fila 1: Identidad de la entidad (Izquierda) + Acciones rápidas y Botón Desplegar/Ocultar fijo (Derecha) */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: `${entity.color}22`,
                        border: `1px solid ${entity.color}44`,
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={entity.logoUrl || svgToDataUri(getBankPreset(entity.name).logoSvg)}
                        alt={entity.name}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "1.05rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {entity.name} <span style={{ fontSize: "0.8rem" }}>{entity.country}</span>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                        {entityAccounts.length} cuenta(s) de ahorro • {entityCDTs.length} CDT(s)
                      </div>
                    </div>
                  </div>

                  {/* Controles fijos a la derecha (Eliminar, Migrar y Botón Desplegar/Ocultar resaltado) */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
                    <button
                      onClick={() => handleDeleteEntity(entity)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        padding: "4px",
                        opacity: 0.75,
                      }}
                      title="Eliminar Entidad"
                    >
                      🗑️
                    </button>
                    {entities.length > 1 && (
                      <button
                        onClick={() => setMigrateFrom(migrateFrom === entity.id ? null : entity.id)}
                        style={{
                          background: migrateFrom === entity.id ? "rgba(59,130,246,0.15)" : "transparent",
                          border: migrateFrom === entity.id ? "1px solid #3b82f6" : "1px solid transparent",
                          color: migrateFrom === entity.id ? "#3b82f6" : "var(--text-secondary)",
                          cursor: "pointer",
                          fontSize: "0.72rem",
                          borderRadius: 6,
                          padding: "4px 7px",
                          fontWeight: 600,
                        }}
                        title="Migrar todos los productos a otra entidad"
                      >
                        🔄 Migrar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleEntityCollapse(entity.id)}
                      style={{
                        background: isEntityCollapsed
                          ? "var(--bg-surface)"
                          : "rgba(16, 185, 129, 0.14)",
                        border: isEntityCollapsed
                          ? `1.5px solid ${entity.color || "var(--accent-primary)"}88`
                          : "1.5px solid rgba(16, 185, 129, 0.55)",
                        borderRadius: 8,
                        color: isEntityCollapsed ? "var(--text-primary)" : "#10b981",
                        cursor: "pointer",
                        fontSize: "0.76rem",
                        padding: "5px 12px",
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
                        transition: "all 0.18s ease",
                      }}
                      title={isEntityCollapsed ? "Desplegar productos de la entidad" : "Ocultar productos de la entidad"}
                    >
                      <span style={{ fontSize: "0.68rem" }}>{isEntityCollapsed ? "▼" : "▲"}</span>
                      <span>{isEntityCollapsed ? "Desplegar" : "Ocultar"}</span>
                    </button>
                  </div>
                </div>

                {/* Fila 2: Botones de Creación (+ Cuenta / + CDT / Referido) a la izquierda y Balance Total a la derecha */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                    width: "100%",
                  }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {/* Botón de Referido / Beneficio de Bienvenida si existe para esta entidad */}
                    {(() => {
                      const ref = getReferralForEntity(entity.name || entity.id);
                      if (!ref) return null;
                      return (
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            textDecoration: "none",
                            background: isLight
                              ? "linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(16, 185, 129, 0.15) 100%)"
                              : "linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)",
                            border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
                            color: isLight ? "#92400e" : "#fbbf24",
                            borderRadius: 6,
                            padding: "4px 8px",
                            fontSize: "0.72rem",
                            fontWeight: 800,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                          title={`Abrir cuenta en ${entity.name} con beneficios y tasas preferenciales`}
                        >
                          🎁 Abrir Cuenta
                        </a>
                      );
                    })()}
                    <button
                      onClick={() => {
                        setSelectedModalEntityId(entity.id);
                        setEditItem(null);
                        setEditType(null);
                        setModalTab("account");
                        setModalOpen(true);
                      }}
                      style={{
                        background: "rgba(16, 185, 129, 0.18)",
                        border: "1px solid rgba(16, 185, 129, 0.4)",
                        color: "#10b981",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      title={`Crear nueva cuenta / bolsillo en ${entity.name}`}
                    >
                      + Cuenta
                    </button>
                    <button
                      onClick={() => {
                        setSelectedModalEntityId(entity.id);
                        setEditItem(null);
                        setEditType(null);
                        setModalTab("cdt");
                        setModalOpen(true);
                      }}
                      style={{
                        background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.18)",
                        border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.4)" : "rgba(245, 158, 11, 0.4)"}`,
                        color: isLight ? "#92400e" : "#f59e0b",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      title={`Registrar nuevo CDT en ${entity.name}`}
                    >
                      + CDT
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>
                    {/* 1. Inversión Líquida en Cajitas / Bolsillos de Rendimiento */}
                    {investedAccounts.length > 0 && (
                      <div
                        style={{
                          textAlign: "right",
                          background: isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.12)",
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${isLight ? "rgba(16, 185, 129, 0.3)" : "rgba(16, 185, 129, 0.35)"}`,
                        }}
                        title="Capital líquido en cajitas / bolsillos que generan rendimientos diarios"
                      >
                        <span style={{ fontSize: "0.68rem", color: isLight ? "#059669" : "#34d399", fontWeight: 700, display: "block", textTransform: "uppercase" }}>
                          📦 Inversión Cajitas
                        </span>
                        <span className="mono" style={{ fontWeight: 800, color: isLight ? "#047857" : "#10b981", fontSize: "1.08rem" }}>
                          {entCurrSymbol} {accountsLiquidInvested.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {/* 2. Saldo Transaccional / Nómina / Billetera (0% E.A. - Sin Rendimiento) */}
                    {accountsTransactionalTotal > 0 && (
                      <div
                        style={{
                          textAlign: "right",
                          background: isLight ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.14)",
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${isLight ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.4)"}`,
                        }}
                        title="Saldo disponible transaccional (nómina o billetera a la vista) sin rendimiento (0% E.A.). No se grafica en la curva de renta fija."
                      >
                        <span style={{ fontSize: "0.68rem", color: isLight ? "#1d4ed8" : "#93c5fd", fontWeight: 700, display: "block", textTransform: "uppercase" }}>
                          {investedAccounts.length === 0 && activeEntityCDTs.length === 0 ? "👛 Saldo en Billetera" : "💼 Nómina / Efectivo"}
                        </span>
                        <span className="mono" style={{ fontWeight: 800, color: isLight ? "#1e40af" : "#60a5fa", fontSize: "1.08rem" }}>
                          {entCurrSymbol} {accountsTransactionalTotal.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontWeight: 600 }}>
                          (0% E.A. • No graficado)
                        </div>
                      </div>
                    )}

                    {/* 3. Inversión en CDTs Activos (Capital + Rendimiento a hoy) */}
                    {activeEntityCDTs.length > 0 && (
                      <div
                        style={{
                          textAlign: "right",
                          background: isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.12)",
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.4)" : "rgba(245, 158, 11, 0.35)"}`,
                        }}
                        title={`Capital en CDTs: $${activeCDTsCapitalTotal.toLocaleString()} + Rendimientos devengados a hoy: +$${activeCDTsAccruedYield.toLocaleString()}`}
                      >
                        <span style={{ fontSize: "0.68rem", color: isLight ? "#92400e" : "#d97706", fontWeight: 700, display: "block", textTransform: "uppercase" }}>
                          ⏳ En {activeEntityCDTs.length} CDT(s)
                        </span>
                        <span className="mono" style={{ fontWeight: 800, color: isLight ? "#92400e" : "#d97706", fontSize: "1.02rem" }}>
                          {entCurrSymbol} {activeCDTsTotal.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {activeCDTsAccruedYield > 0 && (
                          <div style={{ fontSize: "0.65rem", color: isLight ? "#059669" : "#34d399", fontWeight: 600 }}>
                            (+$ {activeCDTsAccruedYield.toLocaleString("es-CO", { maximumFractionDigits: 2 })} rend. a hoy)
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. Total Invertido Consolidado en Renta Fija (Solo cuando hay inversión real > 0) */}
                    {entityInvestedTotal > 0 && (activeEntityCDTs.length > 0 || accountsTransactionalTotal > 0) && (
                      <div
                        style={{
                          textAlign: "right",
                          paddingLeft: 10,
                          borderLeft: `1px solid ${isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)"}`,
                        }}
                        title="Patrimonio total invertido en Renta Fija en esta entidad (Cajitas + CDTs con sus ganancias a hoy)"
                      >
                        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", display: "block", fontWeight: 600, textTransform: "uppercase" }}>
                          Total Invertido (RF)
                        </span>
                        <span className="mono" style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "1.05rem" }}>
                          {entCurrSymbol} {entityInvestedTotal.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {accountsTransactionalTotal > 0 && (
                          <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontWeight: 600 }}>
                            Total Global: {entCurrSymbol} {entityGrandTotal.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Migration Target Selector */}
                {migrateFrom === entity.id && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(0,0,0,0.3)",
                    padding: "4px 8px",
                    borderRadius: 8,
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    width: "100%",
                    marginTop: 6,
                  }}>
                    <span>Mover a:</span>
                    {entities.filter(e => e.id !== entity.id).map(targetEnt => (
                      <button
                        key={targetEnt.id}
                        onClick={() => {
                          migrateEntityProducts(entity.id, targetEnt.id);
                          setMigrateFrom(null);
                        }}
                        style={{
                          background: `${targetEnt.color}22`,
                          border: `1px solid ${targetEnt.color}66`,
                          borderRadius: 6,
                          color: "#f8fafc",
                          padding: "2px 8px",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {targetEnt.icon} {targetEnt.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setMigrateFrom(null)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#64748b",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        marginLeft: "auto",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Accounts & Pockets List */}
              {!isEntityCollapsed && (
                <div
                  style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}
                >
                {entityAccounts.map((acc) => {
                  const isExpanded = expandedAccountIds.has(acc.id);
                  const accTx = transactions
                    .filter((t) => {
                      if (t.accountId) return t.accountId === acc.id;
                      const desc = (t.description || "").toLowerCase();
                      const cat = (t.category || "").toLowerCase();
                      const accName = acc.name.toLowerCase();
                      return desc.includes(accName) || cat.includes(accName);
                    })
                    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

                  const netTxBalance = accTx.reduce((sum, tx) => {
                    const descLower = (tx.description || "").toLowerCase();
                    const isDebit =
                      tx.type === "debit" ||
                      descLower.includes("retiraste") ||
                      descLower.includes("retiro") ||
                      descLower.includes("invertiste") ||
                      Number(tx.amount) < 0;
                    const amt = Math.abs(Number(tx.amount || 0));
                    return sum + (isDebit ? -amt : amt);
                  }, 0);

                  const hasDiscrepancy = accTx.length > 0 && Math.abs(acc.balance - netTxBalance) > 0.01;

                  const isAccZeroYield =
                    acc.accountCategory === "payroll" ||
                    acc.accountCategory === "digital_wallet" ||
                    acc.type === "wallet" ||
                    Number(acc.interestRateEA || 0) === 0;

                  const yieldData = calculateAccountYield(acc, accTx, historicalRates, cdts);

                  return (
                    <div
                      key={acc.id}
                      style={{
                        background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                        borderRadius: 12,
                        border: `1px solid ${isExpanded ? "rgba(16, 185, 129, 0.35)" : "var(--border)"}`,
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div
                        style={{
                          padding: "16px 18px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 14,
                        }}
                      >
                        {/* Fila 1: Identidad de la Cuenta (Izquierda) + Barra de Acciones (Derecha) */}
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 12,
                          }}
                        >
                          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "1.05rem", letterSpacing: "0.2px" }}>
                                {acc.name}
                              </span>

                              {/* Sync Type Badge: API vs Manual */}
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 6,
                                  background: acc.syncType === "manual"
                                    ? (isLight ? "rgba(100, 116, 139, 0.12)" : "rgba(148, 163, 184, 0.15)")
                                    : (isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)"),
                                  color: acc.syncType === "manual"
                                    ? (isLight ? "#475569" : "#94a3b8")
                                    : (isLight ? "#059669" : "#34d399"),
                                  border: acc.syncType === "manual"
                                    ? (isLight ? "1px solid rgba(100, 116, 139, 0.25)" : "1px solid rgba(148, 163, 184, 0.25)")
                                    : (isLight ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(16, 185, 129, 0.35)"),
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                                title={acc.syncType === "manual" ? "Movimientos registrados manualmente" : "Sincronizado automáticamente por notificaciones/webhook"}
                              >
                                {acc.syncType === "manual" ? "✍️ Manual" : "🤖 API"}
                              </span>

                              {/* Account Category: Payroll */}
                              {acc.accountCategory === "payroll" && (
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "2px 7px",
                                    borderRadius: 6,
                                    background: isLight ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.2)",
                                    color: isLight ? "#1d4ed8" : "#93c5fd",
                                    border: isLight ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid rgba(59, 130, 246, 0.3)",
                                  }}
                                  title="Cuenta de nómina transaccional sin rendimiento (solo las cajitas generan rendimiento)"
                                >
                                  💼 Nómina (Sin rendimiento)
                                </span>
                              )}

                              {/* Account Category: Digital Wallet */}
                              {(acc.accountCategory === "digital_wallet" || acc.type === "wallet" || (Number(acc.interestRateEA || 0) === 0 && acc.accountCategory !== "payroll")) && acc.accountCategory !== "payroll" && (
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "2px 7px",
                                    borderRadius: 6,
                                    background: isLight ? "rgba(168, 85, 247, 0.12)" : "rgba(168, 85, 247, 0.2)",
                                    color: isLight ? "#7e22ce" : "#c084fc",
                                    border: isLight ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid rgba(168, 85, 247, 0.3)",
                                  }}
                                  title="Cuenta transaccional sin rendimiento (entradas y salidas)"
                                >
                                  👛 Principal (0% E.A.)
                                </span>
                              )}

                              {/* Cascading Overdraft Fallback Pill */}
                              {(acc.fallbackAccountId || (acc.type === "pocket" && (acc.entityId === "ent_nu" || acc.entityId === "ent_1789616750396"))) && (
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "2px 7px",
                                    borderRadius: 6,
                                    background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)",
                                    color: isLight ? "#d97706" : "#fbbf24",
                                    border: isLight ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)",
                                  }}
                                  title="Si un gasto supera el saldo de este bolsillo, el excedente se completa automáticamente desde la Cuenta Principal"
                                >
                                  🛡️ Respaldo Cascada
                                </span>
                              )}
                            </div>

                            <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", marginTop: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span>
                                {acc.type === "crypto" ? "Tasa Staking:" : "Tasa actual:"}{" "}
                                {acc.accountCategory === "payroll" ? (
                                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>0.00% E.A. (Cuenta Nómina / Débito)</span>
                                ) : acc.accountCategory === "digital_wallet" || Number(acc.interestRateEA || 0) === 0 ? (
                                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                                    0.00% E.A. {acc.entityId === "ent_1789616750396" ? "(Cuenta Principal)" : "(Cuenta Transaccional)"}
                                  </span>
                                ) : (
                                  <span style={{ color: "#10b981", fontWeight: 700, fontSize: "0.8rem" }}>
                                    {Number(
                                      acc.type === "crypto"
                                        ? (acc.interestRateEA || 8.00)
                                        : (historicalRates?.entities?.[acc.entityId]?.savings_rates?.slice(-1)[0]?.rateEA || acc.interestRateEA || 9.30)
                                    ).toFixed(2)}% E.A.
                                  </span>
                                )}
                              </span>
                              {acc.type === "crypto" && (
                                <span style={{ color: isLight ? "#92400e" : "#f59e0b", fontSize: "0.68rem", fontWeight: 700, background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.15)", padding: "2px 6px", borderRadius: 4, border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.4)" : "rgba(245, 158, 11, 0.3)"}` }}>
                                  🪙 Inversión
                                </span>
                              )}
                              {acc.isTaxExemptGMF && acc.type !== "crypto" && (
                                <span style={{ color: "var(--accent-primary)", fontSize: "0.72rem", fontWeight: 700 }}>
                                  • Exenta 4×1000
                                </span>
                              )}
                              {yieldData.activeCDTsCount > 0 && (
                                <span style={{ color: isLight ? "#92400e" : "#f59e0b", fontSize: "0.72rem", fontWeight: 700 }}>
                                  • ⏳ {yieldData.activeCDTsCount} CDT(s) activo(s)
                                </span>
                              )}
                              {!isAccZeroYield && yieldData.isMonthlyDisbursement && (
                                <span
                                  style={{
                                    color: isLight ? "#92400e" : "#fbbf24",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.15)",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.35)" : "rgba(245, 158, 11, 0.3)"}`,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                  }}
                                  title="RappiPay genera rendimientos diarios que se abonan en efectivo a tu saldo el primer día de cada mes"
                                >
                                  🗓️ Abono el 1º de cada mes
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Barra de Acciones Compacta y Ordenada a la Derecha */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={() => toggleAccountExpand(acc.id)}
                              style={{
                                background: isExpanded ? "rgba(16, 185, 129, 0.18)" : "var(--bg-surface)",
                                border: `1px solid ${isExpanded ? "#10b981" : "var(--border)"}`,
                                borderRadius: 8,
                                color: isExpanded ? "#10b981" : "var(--text-primary)",
                                cursor: "pointer",
                                padding: "5px 11px",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                              title="Ver / Ocultar movimientos y desglose de rentabilidad"
                            >
                              <span style={{ fontSize: "0.66rem" }}>{isExpanded ? "▲" : "▼"}</span>
                              <span>Movimientos {accTx.length > 0 ? `(${accTx.length})` : ""}</span>
                            </button>

                            {!isAccZeroYield && (() => {
                              const targetBalance = yieldData.isMonthlyDisbursement ? yieldData.liquidAvailableBalance : yieldData.liquidTotalBalance;
                              if (Math.abs(acc.balance - targetBalance) <= 1) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await updateAccount({ ...acc, balance: targetBalance });
                                    toast.success(`Saldo líquido de "${acc.name}" sincronizado a $${targetBalance.toLocaleString("es-CO", { maximumFractionDigits: 2 })} COP`);
                                  }}
                                  style={{
                                    background: "rgba(16, 185, 129, 0.15)",
                                    border: "1px solid rgba(16, 185, 129, 0.4)",
                                    borderRadius: 8,
                                    color: "#10b981",
                                    fontSize: "0.73rem",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    padding: "5px 10px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                  title={`Sincronizar el saldo oficial de la cuenta con el saldo líquido real ($${targetBalance.toLocaleString("es-CO", { maximumFractionDigits: 2 })})`}
                                >
                                  <span>🔄 Sincronizar</span>
                                </button>
                              );
                            })()}

                            {!isAccZeroYield && accTx.length > 0 && (
                              <button
                                onClick={() => handleGenerateMonthlyYields(acc)}
                                style={{
                                  background: "rgba(56, 189, 248, 0.12)",
                                  border: "1px solid rgba(56, 189, 248, 0.35)",
                                  borderRadius: 8,
                                  color: "#38bdf8",
                                  fontSize: "0.73rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  padding: "5px 10px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                                title="Auto-generar y agregar al historial todas las transacciones de rendimientos mensuales devengados mes a mes"
                              >
                                <span>⚡ +Rend. Mensuales</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleEdit(acc, "account")}
                              style={{
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                padding: "5px 8px",
                              }}
                              title="Editar Cuenta"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteAccount(acc)}
                              style={{
                                background: "rgba(244, 63, 94, 0.08)",
                                border: "1px solid rgba(244, 63, 94, 0.25)",
                                borderRadius: 8,
                                color: "#f43f5e",
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                padding: "5px 8px",
                              }}
                              title="Eliminar Cuenta"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Fila 2: Grilla Espaciosa de Métricas Financieras */}
                        {isAccZeroYield ? (() => {
                          const siblingPockets = (accounts || [])
                            .filter(
                              (a) =>
                                a.entityId === acc.entityId &&
                                a.id !== acc.id &&
                                Number(a.interestRateEA || 0) > 0
                            )
                            .sort((a, b) => {
                              const ae = (a.name || "").toLowerCase().includes("emergencia") ? 0 : 1;
                              const be = (b.name || "").toLowerCase().includes("emergencia") ? 0 : 1;
                              return ae - be || Number(b.balance || 0) - Number(a.balance || 0);
                            });
                          const displayBalance = accTx.length > 0 ? netTxBalance : Number(acc.balance || 0);
                          const canMove = siblingPockets.length > 0 && displayBalance > 0;
                          const isMoving = internalTransfer?.fromId === acc.id;
                          return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              background: "var(--bg-surface)",
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "1px solid var(--border)",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 700 }}>
                              {acc.accountCategory === "payroll" ? "💼 Saldo Disponible en Nómina / Débito" : "👛 Saldo Disponible en Cuenta Principal"}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                              <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: "1.12rem" }}>
                                ${displayBalance.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 600 }}>{acc.currency}</span>
                              </span>
                              {canMove && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInternalTransfer(
                                      isMoving
                                        ? null
                                        : { fromId: acc.id, toId: siblingPockets[0].id, amount: String(Number(acc.balance || 0)) }
                                    )
                                  }
                                  style={{
                                    background: isMoving ? "rgba(16, 185, 129, 0.2)" : (isLight ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.14)"),
                                    border: `1px solid ${isLight ? "rgba(5, 150, 105, 0.45)" : "rgba(16, 185, 129, 0.45)"}`,
                                    color: isLight ? "#047857" : "#34d399",
                                    borderRadius: 8,
                                    padding: "5px 11px",
                                    fontSize: "0.74rem",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                  title="Mover dinero de la cuenta principal a un bolsillo de esta misma entidad"
                                >
                                  {isMoving ? "✕ Cancelar" : "🔁 Mover a bolsillo"}
                                </button>
                              )}
                            </div>
                          </div>

                          {isMoving && (
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "flex-end",
                                gap: 10,
                                padding: "12px 14px",
                                borderRadius: 10,
                                background: isLight ? "rgba(16, 185, 129, 0.06)" : "rgba(16, 185, 129, 0.08)",
                                border: `1px dashed ${isLight ? "rgba(5, 150, 105, 0.45)" : "rgba(16, 185, 129, 0.4)"}`,
                              }}
                            >
                              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                                <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                                  Destino (movimiento interno)
                                </label>
                                <select
                                  value={internalTransfer.toId}
                                  onChange={(e) => setInternalTransfer((p) => ({ ...p, toId: e.target.value }))}
                                  style={{
                                    width: "100%",
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    color: "var(--text-primary)",
                                    fontSize: "0.78rem",
                                    padding: "6px 8px",
                                  }}
                                >
                                  {siblingPockets.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} — {Number(p.interestRateEA || 0)}% E.A.
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div style={{ flex: "0 1 160px" }}>
                                <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                                  Monto ({acc.currency})
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={internalTransfer.amount}
                                  onChange={(e) => setInternalTransfer((p) => ({ ...p, amount: e.target.value }))}
                                  style={{
                                    width: "100%",
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    color: "var(--text-primary)",
                                    fontSize: "0.8rem",
                                    padding: "6px 8px",
                                    fontFamily: "JetBrains Mono, monospace",
                                  }}
                                />
                              </div>
                              <button
                                type="button"
                                disabled={!(Number(internalTransfer.amount) > 0)}
                                onClick={async () => {
                                  const ok = await transferBetweenAccounts({
                                    fromAccountId: acc.id,
                                    toAccountId: internalTransfer.toId,
                                    amount: Number(internalTransfer.amount),
                                  });
                                  if (ok) setInternalTransfer(null);
                                }}
                                style={{
                                  background: "#10b981",
                                  border: "none",
                                  borderRadius: 8,
                                  color: "#04101e",
                                  fontWeight: 800,
                                  fontSize: "0.78rem",
                                  padding: "8px 14px",
                                  cursor: Number(internalTransfer.amount) > 0 ? "pointer" : "not-allowed",
                                  opacity: Number(internalTransfer.amount) > 0 ? 1 : 0.5,
                                }}
                              >
                                ✓ Confirmar movimiento
                              </button>
                            </div>
                          )}
                          </div>
                          );
                        })() : (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
                              gap: 10,
                              background: "var(--bg-surface)",
                              padding: "12px 14px",
                              borderRadius: 10,
                              border: "1px solid var(--border)",
                            }}
                          >
                            {/* 1. Aportado Neto Líquido */}
                            <div
                              style={{
                                padding: "4px 8px",
                                borderRight: "1px solid var(--border)",
                              }}
                              title="Capital neto depositado líquido en la cuenta (descontando retiros y capital congelado en CDTs)"
                            >
                              <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", display: "block", fontWeight: 600 }}>
                                📥 Aportado Neto
                              </span>
                              <span className="mono" style={{ color: "var(--text-secondary)", fontWeight: 700, fontSize: "0.95rem", display: "block", marginTop: 2 }}>
                                ${yieldData.liquidNetCapital.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                              </span>
                              {yieldData.liquidNetCapital === 0 && (yieldData.activeCDTsCapital > 0 || yieldData.totalDeposits > 0) && (
                                <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", display: "block", marginTop: 1 }}>
                                  (En CDT / Retirado)
                                </span>
                              )}
                            </div>

                            {/* 2. Rentabilidad */}
                            <div
                              style={{
                                padding: "4px 8px",
                                borderRight: "1px solid var(--border)",
                              }}
                              title={yieldData.isMonthlyDisbursement ? `Total devengado: +$${yieldData.liquidEarnedInterest.toLocaleString("es-CO", { maximumFractionDigits: 2 })} (+$${yieldData.creditedYield.toLocaleString("es-CO", { maximumFractionDigits: 2 })} ya abonado en caja + $${yieldData.pendingMonthlyYield.toLocaleString("es-CO", { maximumFractionDigits: 2 })} en curso por abonar el ${yieldData.nextPayoutDateLabel})` : "Rendimientos diarios acumulados ganados en esta cajita"}
                            >
                              <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", display: "block", fontWeight: 600 }}>
                                📈 Rentabilidad
                              </span>
                              <span className="mono" style={{ color: "#10b981", fontWeight: 700, fontSize: "0.95rem", display: "block", marginTop: 2 }}>
                                +${yieldData.liquidEarnedInterest.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                              </span>
                              {yieldData.isMonthlyDisbursement && yieldData.pendingMonthlyYield > 0 && (
                                <span style={{ color: isLight ? "#b45309" : "#fbbf24", fontSize: "0.63rem", display: "block", fontWeight: 600, marginTop: 1 }}>
                                  ⏳ (+${yieldData.pendingMonthlyYield.toLocaleString("es-CO", { maximumFractionDigits: 0 })} el {yieldData.nextPayoutDateLabel})
                                </span>
                              )}
                            </div>

                            {/* 3. Saldo Líquido Disponible (Descontando CDT) */}
                            {yieldData.isMonthlyDisbursement ? (
                              <>
                                <div
                                  style={{
                                    padding: "4px 8px",
                                    borderRight: "1px solid var(--border)",
                                  }}
                                  title="Saldo efectivamente disponible en caja hoy (con rendimientos de meses anteriores ya abonados)"
                                >
                                  <span style={{ color: "#0284c7", fontSize: "0.7rem", display: "block", fontWeight: 700 }}>
                                    💵 Disp. en Caja
                                  </span>
                                  <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: "1.02rem", display: "block", marginTop: 2 }}>
                                    ${yieldData.liquidAvailableBalance.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{acc.currency}</span>
                                  </span>
                                </div>
                                <div
                                  style={{
                                    padding: "4px 8px",
                                  }}
                                  title="Saldo acumulado total sumando rendimientos devengados en curso que se abonarán el 1º"
                                >
                                  <span style={{ color: isLight ? "#047857" : "#34d399", fontSize: "0.7rem", display: "block", fontWeight: 700 }}>
                                    ✨ Total + Devengado
                                  </span>
                                  <span className="mono" style={{ color: isLight ? "#065f46" : "#6ee7b7", fontWeight: 700, fontSize: "0.95rem", display: "block", marginTop: 2 }}>
                                    ${yieldData.liquidTotalBalance.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div
                                style={{
                                  padding: "4px 8px",
                                  borderRight: yieldData.activeCDTsList.length > 0 ? "1px solid var(--border)" : "none",
                                }}
                                title="Saldo líquido disponible actualmente en la cajita (descontando el capital congelado en CDTs activos)"
                              >
                                <span style={{ color: "#38bdf8", fontSize: "0.7rem", display: "block", fontWeight: 700 }}>
                                  💰 Saldo Líquido
                                </span>
                                <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: "1.05rem", display: "block", marginTop: 2 }}>
                                  ${yieldData.liquidTotalBalance.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600 }}>{acc.currency}</span>
                                </span>
                                {yieldData.activeCDTsCapital > 0 && (
                                  <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", display: "block", marginTop: 1 }}>
                                    (Libre fuera de CDT)
                                  </span>
                                )}
                              </div>
                            )}

                            {/* 4. CDTs Activos vinculados a esta cajita */}
                            {yieldData.activeCDTsList.length > 0 && (
                              <div
                                style={{
                                  padding: "4px 8px",
                                  borderRight: "1px solid var(--border)",
                                }}
                                title={`Capital en CDT: $${yieldData.activeCDTsCapital.toLocaleString("es-CO")} + Rendimientos devengados a hoy: +$${yieldData.activeCDTsAccruedInterest.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`}
                              >
                                <span style={{ color: isLight ? "#92400e" : "#f59e0b", fontSize: "0.7rem", display: "block", fontWeight: 700 }}>
                                  ⏳ En {yieldData.activeCDTsList.length} CDT(s)
                                </span>
                                <span className="mono" style={{ color: "var(--text-primary)", fontWeight: 800, fontSize: "0.98rem", display: "block", marginTop: 2 }}>
                                  ${(yieldData.activeCDTsCapital + yieldData.activeCDTsAccruedInterest).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span style={{ color: "#10b981", fontSize: "0.65rem", display: "block", fontWeight: 600, marginTop: 1 }}>
                                  (+${yieldData.activeCDTsAccruedInterest.toLocaleString("es-CO", { maximumFractionDigits: 0 })} rend. a hoy)
                                </span>
                              </div>
                            )}

                            {/* 5. Total Consolidado Cuenta (Líquido + CDTs) */}
                            {yieldData.activeCDTsList.length > 0 && (
                              <div
                                style={{
                                  padding: "4px 8px",
                                }}
                                title="Total consolidado de esta cajita (Saldo Líquido disponible + Capital y rendimientos en CDTs activos)"
                              >
                                <span style={{ color: "var(--text-secondary)", fontSize: "0.7rem", display: "block", fontWeight: 700 }}>
                                  💼 Total Cuenta
                                </span>
                                <span className="mono" style={{ color: "#10b981", fontWeight: 800, fontSize: "1.06rem", display: "block", marginTop: 2 }}>
                                  ${(yieldData.liquidTotalBalance + yieldData.activeCDTsCapital + yieldData.activeCDTsAccruedInterest).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.62rem", display: "block", marginTop: 1 }}>
                                  (Líquido + CDT)
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Desplegable Compacto de Movimientos con Filtros Interactivos, CDTs y Desglose */}
                      {isExpanded && (() => {
                        const currentType = movementFilterType[acc.id] || "all";
                        const currentSearch = (movementSearch[acc.id] || "").toLowerCase().trim();
                        const currentYear = movementYear[acc.id] || "all";

                        const filteredTx = accTx.filter((tx) => {
                          const descLower = (tx.description || "").toLowerCase();
                          const isDebit =
                            tx.type === "debit" ||
                            descLower.includes("retiraste") ||
                            descLower.includes("retiro") ||
                            descLower.includes("invertiste") ||
                            Number(tx.amount) < 0;
                          const isCredit = !isDebit;

                          if (currentType === "credit" && !isCredit) return false;
                          if (currentType === "debit" && !isDebit) return false;
                          if (currentYear !== "all" && !tx.date?.startsWith(currentYear)) return false;

                          if (currentSearch) {
                            const matchDesc = descLower.includes(currentSearch);
                            const matchAmount = String(Math.abs(Number(tx.amount || 0))).includes(currentSearch);
                            const matchDate = (tx.date || "").includes(currentSearch);
                            if (!matchDesc && !matchAmount && !matchDate) return false;
                          }
                          return true;
                        });

                        const totalCredits = filteredTx
                          .filter((t) => t.type === "credit" || (!t.type && Number(t.amount) > 0))
                          .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);
                        const totalDebits = filteredTx
                          .filter((t) => t.type === "debit" || Number(t.amount) < 0)
                          .reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

                        const availableYears = Array.from(
                          new Set(
                            accTx
                              .map((t) => (t.date ? t.date.slice(0, 4) : null))
                              .filter(Boolean)
                          )
                        ).sort((a, b) => b.localeCompare(a));

                        return (
                          <div
                            style={{
                              background: "var(--bg-surface)",
                              borderTop: "1px solid var(--border)",
                              padding: "10px 14px",
                            }}
                          >
                            {/* CDTs Vinculados a esta Cajita (Activos y Cerrados) (Acordeón Desplegable) */}
                            {(yieldData.activeCDTsList.length > 0 || yieldData.maturedCDTsList.length > 0) && (() => {
                              const isCdtsExpanded = expandedAccountCdts.has(acc.id);
                              const totalCdts = yieldData.activeCDTsList.length + yieldData.maturedCDTsList.length;

                              return (
                                <div
                                  style={{
                                    background: isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(245, 158, 11, 0.08)",
                                    borderRadius: 8,
                                    padding: "10px 14px",
                                    marginBottom: 12,
                                    border: `1px solid ${isLight ? "rgba(245, 158, 11, 0.3)" : "rgba(245, 158, 11, 0.25)"}`,
                                    transition: "all 0.2s ease",
                                  }}
                                >
                                  <div
                                    onClick={() => toggleAccountCdts(acc.id)}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                      gap: 8,
                                      cursor: "pointer",
                                      userSelect: "none",
                                    }}
                                    title={isCdtsExpanded ? "Click para ocultar CDTs" : "Click para desplegar CDTs"}
                                  >
                                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: isLight ? "#92400e" : "#d97706", display: "flex", alignItems: "center", gap: 6 }}>
                                      <span>⏳ CDTs Vinculados a {acc.name}:</span>
                                      <span
                                        style={{
                                          fontSize: "0.68rem",
                                          background: isLight ? "rgba(245, 158, 11, 0.15)" : "rgba(245, 158, 11, 0.25)",
                                          color: isLight ? "#92400e" : "#d97706",
                                          padding: "1px 6px",
                                          borderRadius: 4,
                                          fontWeight: 800,
                                        }}
                                      >
                                        {totalCdts}
                                      </span>
                                    </span>

                                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: "0.78rem", color: isLight ? "#059669" : "var(--gain)", fontWeight: 700 }}>
                                        {yieldData.activeCDTsList.length > 0 && `Activos: $${yieldData.activeCDTsCapital.toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP (+$${yieldData.activeCDTsAccruedInterest.toLocaleString("es-CO", { maximumFractionDigits: 0 })} rend.)`}
                                        {yieldData.activeCDTsList.length > 0 && yieldData.maturedCDTsList.length > 0 && " • "}
                                        {yieldData.maturedCDTsList.length > 0 && `📦 ${yieldData.maturedCDTsList.length} Cerrados (+$${yieldData.maturedCDTsTotalProfit.toLocaleString("es-CO", { maximumFractionDigits: 0 })} cobrados)`}
                                      </span>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleAccountCdts(acc.id);
                                        }}
                                        style={{
                                          background: isCdtsExpanded ? "rgba(245, 158, 11, 0.22)" : (isLight ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.05)"),
                                          border: `1px solid ${isCdtsExpanded ? (isLight ? "#92400e" : "#d97706") : (isLight ? "rgba(217, 119, 6, 0.4)" : "rgba(245, 158, 11, 0.3)")}`,
                                          borderRadius: 6,
                                          color: isLight ? "#92400e" : "#d97706",
                                          padding: "3px 8px",
                                          fontSize: "0.7rem",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 4,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        <span>{isCdtsExpanded ? "Ocultar ▲" : `Ver CDTs (${totalCdts}) ▼`}</span>
                                      </button>
                                    </div>
                                  </div>

                                  {isCdtsExpanded && (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, marginTop: 10 }}>
                                      {/* CDTs Activos */}
                                      {yieldData.activeCDTsList.map((c, cIdx) => (
                                        <div
                                          key={`act_cdt_${cIdx}`}
                                          style={{
                                            background: "var(--bg-card)",
                                            padding: "8px 10px",
                                            borderRadius: 6,
                                            border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
                                          }}
                                        >
                                          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-primary)", fontSize: "0.78rem", fontWeight: 600 }}>
                                            <span>⏳ {c.name || c.category}</span>
                                            <span style={{ color: isLight ? "#92400e" : "#d97706", fontWeight: 700 }}>{c.interestRateEA}% E.A.</span>
                                          </div>
                                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                                            <span>Capital: ${Number(c.capital || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
                                            <span>{c.daysElapsed} de {c.termDays}d</span>
                                          </div>
                                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.75rem" }}>
                                            <span style={{ color: "var(--text-muted)" }}>Rend. a hoy:</span>
                                            <span style={{ color: isLight ? "#059669" : "var(--gain)", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
                                              +${Number(c.accruedYield || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })} COP
                                            </span>
                                          </div>
                                        </div>
                                      ))}

                                      {/* CDTs Cerrados / Vencidos */}
                                      {yieldData.maturedCDTsList.map((c, cIdx) => (
                                        <div
                                          key={`mat_cdt_${cIdx}`}
                                          style={{
                                            background: "var(--bg-card)",
                                            padding: "8px 10px",
                                            borderRadius: 6,
                                            border: "1px solid var(--border)",
                                          }}
                                        >
                                          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.78rem", fontWeight: 600 }}>
                                            <span>📦 {c.name || c.category} (Cerrado)</span>
                                            <span style={{ color: "var(--text-muted)" }}>{c.interestRateEA}% E.A.</span>
                                          </div>
                                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.75rem" }}>
                                            <span style={{ color: "var(--text-muted)" }}>Ganancia cobrada:</span>
                                            <span style={{ color: isLight ? "#059669" : "var(--gain)", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
                                              +${Number(c.finalProfit || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })} {c.currency || acc.currency || "COP"}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Desglose por Períodos de Tasa Histórica (Acordeón Desplegable Espacioso y de Alto Contraste) */}
                            {yieldData.periodBreakdown.length > 0 && (() => {
                              const isRatesExpanded = expandedAccountRates.has(acc.id);

                              return (
                                <div
                                  style={{
                                    background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.85)",
                                    borderRadius: 12,
                                    padding: "14px 18px",
                                    marginBottom: 14,
                                    border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.22)" : "rgba(56, 189, 248, 0.3)"}`,
                                    boxShadow: isLight ? "0 4px 12px rgba(0, 0, 0, 0.04)" : "0 4px 16px rgba(0, 0, 0, 0.25)",
                                    transition: "all 0.2s ease",
                                  }}
                                >
                                  <div
                                    onClick={() => toggleAccountRates(acc.id)}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                      gap: 12,
                                      cursor: "pointer",
                                      userSelect: "none",
                                    }}
                                    title={isRatesExpanded ? "Click para ocultar períodos" : "Click para desplegar períodos"}
                                  >
                                    <span style={{ fontSize: "0.86rem", fontWeight: 800, color: isLight ? "#0284c7" : "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
                                      <span>📊 Rentabilidad Compuesta en Cuenta de Ahorros por Períodos de Tasa:</span>
                                      <span
                                        style={{
                                          fontSize: "0.72rem",
                                          background: isLight ? "rgba(2, 132, 199, 0.14)" : "rgba(56, 189, 248, 0.2)",
                                          color: isLight ? "#0369a1" : "#7dd3fc",
                                          padding: "2px 8px",
                                          borderRadius: 6,
                                          fontWeight: 800,
                                          border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(56, 189, 248, 0.35)"}`,
                                        }}
                                      >
                                        {yieldData.periodBreakdown.length}
                                      </span>
                                    </span>

                                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: "0.82rem", color: isLight ? "#047857" : "#34d399", fontWeight: 800 }}>
                                        Total Ganado en Cuenta: +${yieldData.liquidEarnedInterest.toLocaleString("es-CO", { maximumFractionDigits: 2 })} {acc.currency || "COP"}
                                      </span>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleAccountRates(acc.id);
                                        }}
                                        style={{
                                          background: isRatesExpanded
                                            ? (isLight ? "rgba(2, 132, 199, 0.14)" : "rgba(56, 189, 248, 0.2)")
                                            : (isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.08)"),
                                          border: `1px solid ${isRatesExpanded ? (isLight ? "rgba(2, 132, 199, 0.4)" : "rgba(56, 189, 248, 0.45)") : (isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.16)")}`,
                                          borderRadius: 8,
                                          color: isRatesExpanded ? (isLight ? "#0369a1" : "#7dd3fc") : (isLight ? "#334155" : "#e2e8f0"),
                                          padding: "4px 10px",
                                          fontSize: "0.73rem",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 5,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        <span>{isRatesExpanded ? "Ocultar ▲" : `Ver períodos (${yieldData.periodBreakdown.length}) ▼`}</span>
                                      </button>
                                    </div>
                                  </div>

                                  {isRatesExpanded && (
                                    <div
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(auto-fit, minmax(265px, 1fr))",
                                        gap: 12,
                                        marginTop: 14,
                                      }}
                                    >
                                      {yieldData.periodBreakdown.map((p, pIdx) => (
                                        <div
                                          key={pIdx}
                                          style={{
                                            background: isLight ? "#f8fafc" : "rgba(30, 41, 59, 0.85)",
                                            padding: "12px 16px",
                                            borderRadius: 10,
                                            border: `1px solid ${isLight ? "rgba(15, 23, 42, 0.12)" : "rgba(56, 189, 248, 0.25)"}`,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 8,
                                            boxShadow: isLight ? "0 1px 4px rgba(0, 0, 0, 0.03)" : "0 2px 8px rgba(0, 0, 0, 0.2)",
                                          }}
                                        >
                                          <div
                                            style={{
                                              display: "flex",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                              gap: 12,
                                            }}
                                          >
                                            <span
                                              style={{
                                                color: isLight ? "#0f172a" : "#f8fafc",
                                                fontSize: "0.78rem",
                                                fontWeight: 700,
                                                whiteSpace: "nowrap",
                                              }}
                                            >
                                              📅 {p.startDate} <span style={{ color: isLight ? "#64748b" : "#94a3b8", fontWeight: 500 }}>al</span> {p.endDate}
                                            </span>
                                            <span
                                              style={{
                                                color: isLight ? "#0369a1" : "#38bdf8",
                                                background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(56, 189, 248, 0.18)",
                                                border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.28)" : "rgba(56, 189, 248, 0.4)"}`,
                                                padding: "2px 8px",
                                                borderRadius: 6,
                                                fontSize: "0.75rem",
                                                fontWeight: 800,
                                                whiteSpace: "nowrap",
                                              }}
                                            >
                                              {p.rateEA}% E.A.
                                            </span>
                                          </div>
                                          <div
                                            style={{
                                              display: "flex",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                              gap: 12,
                                              paddingTop: 6,
                                              borderTop: isLight ? "1px dashed rgba(0, 0, 0, 0.08)" : "1px dashed rgba(255, 255, 255, 0.1)",
                                              fontSize: "0.78rem",
                                            }}
                                          >
                                            <span style={{ color: isLight ? "#475569" : "#cbd5e1", fontWeight: 600 }}>
                                              ⏱️ {p.days} días activos
                                            </span>
                                            <span
                                              style={{
                                                color: isLight ? "#047857" : "#34d399",
                                                fontWeight: 800,
                                                fontSize: "0.86rem",
                                                fontFamily: "JetBrains Mono, monospace",
                                                whiteSpace: "nowrap",
                                              }}
                                            >
                                              +${p.interestEarned.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {acc.currency || "COP"}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {/* Filter and Action Header */}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                marginBottom: 12,
                              }}
                            >
                              {/* Filter buttons (Tipo) */}
                              <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--bg-card)", padding: "3px 4px", borderRadius: 8, border: "1px solid var(--border)" }}>
                                {[
                                  { id: "all", label: "Todos" },
                                  { id: "credit", label: "+ Depósitos" },
                                  { id: "debit", label: "- Retiros" },
                                ].map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setMovementFilterType((prev) => ({ ...prev, [acc.id]: t.id }))}
                                    style={{
                                      background: currentType === t.id ? (t.id === "credit" ? "var(--gain)" : t.id === "debit" ? "var(--loss)" : "var(--accent-primary)") : "transparent",
                                      color: currentType === t.id ? "#ffffff" : "var(--text-secondary)",
                                      border: "none",
                                      borderRadius: 5,
                                      padding: "4px 10px",
                                      fontSize: "0.78rem",
                                      fontWeight: currentType === t.id ? 700 : 500,
                                      cursor: "pointer",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    {t.label}
                                  </button>
                                ))}
                              </div>

                              {/* Year Filter */}
                              <select
                                value={currentYear}
                                onChange={(e) => setMovementYear((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                                style={{
                                  background: "var(--bg-card)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 6,
                                  color: "var(--text-primary)",
                                  fontSize: "0.78rem",
                                  padding: "5px 8px",
                                  cursor: "pointer",
                                }}
                              >
                                <option value="all">📅 Todos los años</option>
                                {availableYears.map((y) => (
                                  <option key={y} value={y}>{y}</option>
                                ))}
                              </select>

                              {/* Search Box */}
                              <div style={{ flex: 1, minWidth: 160 }}>
                                <input
                                  type="text"
                                  placeholder="🔍 Buscar concepto o valor..."
                                  value={movementSearch[acc.id] || ""}
                                  onChange={(e) => setMovementSearch((prev) => ({ ...prev, [acc.id]: e.target.value }))}
                                  style={{
                                    width: "100%",
                                    background: "var(--bg-card)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    color: "var(--text-primary)",
                                    fontSize: "0.78rem",
                                    padding: "5px 10px",
                                    outline: "none",
                                  }}
                                />
                              </div>

                              {/* Add manual movement button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditItem({ accountId: acc.id, entityId: acc.entityId });
                                  setEditType(null);
                                  setModalTab("transaction");
                                  setModalOpen(true);
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  background: "rgba(56, 189, 248, 0.15)",
                                  border: "1px solid rgba(56, 189, 248, 0.3)",
                                  color: "#38bdf8",
                                  borderRadius: 6,
                                  padding: "5px 12px",
                                  fontSize: "0.78rem",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                                title="Agregar un nuevo depósito o retiro manual a esta cuenta"
                              >
                                <span>+ Movimiento Manual</span>
                              </button>
                            </div>

                            {/* Summary Metrics & Batch Action Bar */}
                            {(() => {
                              const selectedInAcc = filteredTx.filter((t) => selectedTxIds.has(t.id));
                              const hasSelected = selectedInAcc.length > 0;

                              return (
                                <>
                                  {hasSelected ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 8,
                                        background: "rgba(59, 130, 246, 0.15)",
                                        border: "1px solid rgba(59, 130, 246, 0.35)",
                                        padding: "8px 12px",
                                        borderRadius: 8,
                                        marginBottom: 10,
                                        fontSize: "0.78rem",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#60a5fa", fontWeight: 700 }}>
                                        <span>✓ {selectedInAcc.length} seleccionados</span>
                                      </div>

                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        {/* Year Change Batch */}
                                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          <select
                                            value={batchTargetYear}
                                            onChange={(e) => setBatchTargetYear(e.target.value)}
                                            style={{
                                              background: "#0f172a",
                                              border: "1px solid rgba(255,255,255,0.2)",
                                              borderRadius: 4,
                                              color: "#f8fafc",
                                              padding: "3px 8px",
                                              fontSize: "0.75rem",
                                            }}
                                          >
                                            <option value="2026">2026</option>
                                            <option value="2025">2025</option>
                                            <option value="2024">2024</option>
                                            <option value="2023">2023</option>
                                          </select>
                                          <button
                                            type="button"
                                            onClick={() => handleBatchChangeYear(selectedInAcc.map((t) => t.id), batchTargetYear)}
                                            style={{
                                              background: "#10b981",
                                              border: "none",
                                              borderRadius: 4,
                                              color: "#000",
                                              fontWeight: 700,
                                              padding: "4px 10px",
                                              fontSize: "0.75rem",
                                              cursor: "pointer",
                                            }}
                                            title="Cambiar el año de todos los movimientos seleccionados"
                                          >
                                            📅 Cambiar Año
                                          </button>
                                        </div>

                                        {/* Delete Batch */}
                                        <button
                                          type="button"
                                          onClick={() => handleBatchDelete(selectedInAcc.map((t) => t.id))}
                                          style={{
                                            background: "#f43f5e",
                                            border: "none",
                                            borderRadius: 4,
                                            color: "#fff",
                                            fontWeight: 700,
                                            padding: "4px 10px",
                                            fontSize: "0.75rem",
                                            cursor: "pointer",
                                          }}
                                          title="Eliminar todos los movimientos seleccionados"
                                        >
                                          🗑️ Eliminar ({selectedInAcc.length})
                                        </button>

                                        {/* Deselect */}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedTxIds((prev) => {
                                              const next = new Set(prev);
                                              selectedInAcc.forEach((t) => next.delete(t.id));
                                              return next;
                                            });
                                          }}
                                          style={{
                                            background: "var(--bg-card-hover)",
                                            border: "1px solid var(--border)",
                                            borderRadius: 4,
                                            color: "var(--text-secondary)",
                                            padding: "4px 8px",
                                            fontSize: "0.75rem",
                                            cursor: "pointer",
                                          }}
                                        >
                                          ✕ Desmarcar
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: "0.76rem", color: "var(--text-secondary)", marginBottom: 10 }}>
                                      <span>Mostrando: <strong style={{ color: "var(--text-primary)" }}>{filteredTx.length}</strong> de {accTx.length}</span>
                                      <span>•</span>
                                      <span>Total Entradas: <strong style={{ color: "var(--gain)" }}>+${totalCredits.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</strong></span>
                                      <span>•</span>
                                      <span>Total Salidas: <strong style={{ color: "var(--loss)" }}>-${totalDebits.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</strong></span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}

                            {/* Table Container with Scroll */}
                            <div style={{ maxHeight: "260px", overflowY: "auto" }}>
                              {filteredTx.length === 0 ? (
                                <div style={{ fontSize: "0.8rem", color: "#64748b", textAlign: "center", padding: "16px 0" }}>
                                  No se encontraron movimientos con los filtros aplicados.
                                </div>
                              ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", textAlign: "left", position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 1 }}>
                                      <th style={{ padding: "8px 6px", width: 28, textAlign: "center" }}>
                                        <input
                                          type="checkbox"
                                          checked={filteredTx.length > 0 && filteredTx.every((t) => selectedTxIds.has(t.id))}
                                          onChange={() => handleSelectAllInAccount(filteredTx)}
                                          title="Seleccionar / Deseleccionar todos"
                                          style={{ cursor: "pointer" }}
                                        />
                                      </th>
                                      <th style={{ padding: "8px 6px", fontWeight: 700, width: 100 }}>Fecha</th>
                                      <th style={{ padding: "8px 6px", fontWeight: 700 }}>Descripción / Concepto</th>
                                      <th style={{ padding: "8px 6px", fontWeight: 700, textAlign: "center", width: 90 }}>Tipo</th>
                                      <th style={{ padding: "8px 6px", fontWeight: 700, textAlign: "right", width: 130 }}>Monto</th>
                                      <th style={{ padding: "8px 6px", width: 55, textAlign: "right" }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredTx.map((tx, txIdx) => {
                                      const descLower = (tx.description || "").toLowerCase();
                                      const isDebit =
                                        tx.type === "debit" ||
                                        descLower.includes("retiraste") ||
                                        descLower.includes("retiro") ||
                                        descLower.includes("invertiste") ||
                                        Number(tx.amount) < 0;
                                      const isCredit = !isDebit;
                                      const isSelected = selectedTxIds.has(tx.id);

                                      return (
                                        <tr
                                          key={tx.id || `tx_${txIdx}`}
                                          style={{
                                            borderBottom: "1px solid var(--border)",
                                            background: isSelected ? "rgba(59, 130, 246, 0.12)" : "transparent",
                                            transition: "background 0.15s ease",
                                          }}
                                        >
                                          <td style={{ padding: "8px 6px", textAlign: "center" }}>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => handleToggleSelectTx(tx.id)}
                                              style={{ cursor: "pointer" }}
                                            />
                                          </td>
                                          <td style={{ padding: "8px 6px", color: "var(--text-secondary)", fontFamily: "JetBrains Mono", fontSize: "0.78rem" }}>{tx.date}</td>
                                          <td style={{ padding: "8px 6px", color: "var(--text-primary)", fontWeight: 500 }}>{tx.description || "Movimiento"}</td>
                                          <td style={{ padding: "8px 6px", textAlign: "center" }}>
                                            <span style={{
                                              padding: "3px 8px",
                                              borderRadius: 4,
                                              fontSize: "0.72rem",
                                              fontWeight: 700,
                                              background: isCredit ? "var(--gain-bg)" : "var(--loss-bg)",
                                              color: isCredit ? "var(--gain)" : "var(--loss)",
                                            }}>
                                              {isCredit ? "Depósito" : "Retiro"}
                                            </span>
                                          </td>
                                          <td style={{
                                            padding: "8px 6px",
                                            textAlign: "right",
                                            fontFamily: "JetBrains Mono",
                                            fontWeight: 700,
                                            fontSize: "0.85rem",
                                            color: isCredit ? "var(--gain)" : "var(--loss)",
                                          }}>
                                            {isCredit ? "+" : "-"}${Math.abs(Number(tx.amount || 0)).toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                                          </td>
                                          <td style={{ padding: "8px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditItem({
                                                  ...tx,
                                                  accountId: tx.accountId || acc.id,
                                                });
                                                setEditType("transaction");
                                                setModalTab("transaction");
                                                setModalOpen(true);
                                              }}
                                              style={{
                                                background: "var(--bg-card-hover)",
                                                border: "1px solid var(--border)",
                                                borderRadius: 4,
                                                color: "var(--text-secondary)",
                                                cursor: "pointer",
                                                fontSize: "0.82rem",
                                                padding: "3px 6px",
                                                marginRight: 4,
                                              }}
                                              title="Editar este movimiento"
                                            >
                                              ✏️
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteTransaction(tx)}
                                              style={{
                                                background: "var(--loss-bg)",
                                                border: "1px solid var(--loss)",
                                                borderRadius: 4,
                                                color: "var(--loss)",
                                                cursor: "pointer",
                                                fontSize: "0.78rem",
                                                padding: "3px 6px",
                                              }}
                                              title="Eliminar movimiento"
                                            >
                                              ✕
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}

                {/* Term Deposits / CDTs List */}
                {entityCDTs.filter((c) => c.status !== "matured").length > 0 && (
                  <div
                    style={{
                      background: "rgba(245, 158, 11, 0.02)",
                      borderRadius: 10,
                      padding: "12px 14px",
                      border: "1px solid rgba(245, 158, 11, 0.12)",
                      marginTop: 8,
                    }}
                  >
                    <h5
                      style={{
                        margin: "0 0 10px 0",
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: isLight ? "#92400e" : "#f59e0b",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>⏳ CDTs Activos (Abiertos / Sin Cierre)</span>
                    </h5>

                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "0.7rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              borderBottom: "1px solid var(--border)",
                              textAlign: "left",
                            }}
                          >
                            <th style={{ padding: "4px 2px", fontWeight: 600 }}>CDT / Bolsa</th>
                            <th
                              style={{ padding: "4px 2px", fontWeight: 600, textAlign: "center" }}
                            >
                              Plazo
                            </th>
                            <th
                              style={{ padding: "4px 2px", fontWeight: 600, textAlign: "center" }}
                            >
                              Tasa
                            </th>
                            <th
                              style={{ padding: "4px 2px", fontWeight: 600, textAlign: "center" }}
                            >
                              Estado / Vencimiento
                            </th>
                            <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                              Capital
                            </th>
                            <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                              Rendimiento a Hoy
                            </th>
                            <th style={{ padding: "4px 2px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {entityCDTs
                            .filter((c) => c.status !== "matured")
                            .map((cdt, idx) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const maturity = new Date(cdt.maturityDate || cdt.startDate);
                              maturity.setHours(0, 0, 0, 0);
                              const start = new Date(cdt.startDate);
                              start.setHours(0, 0, 0, 0);

                              const daysRemaining = Math.max(
                                0,
                                Math.ceil((maturity - today) / (1000 * 3600 * 24)),
                              );
                              const isPastMaturity = maturity < today;

                              return (
                                <tr
                                  key={`cdt_${cdt.id}_row_${idx}`}
                                  style={{ borderBottom: "1px solid var(--border)" }}
                                >
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      color: "var(--text-primary)",
                                      fontWeight: 500,
                                    }}
                                  >
                                    <div style={{ fontWeight: 600 }}>
                                      {cdt.category || cdt.name.replace(/\s*\$\s*[\d\.,]+/i, "")}
                                    </div>
                                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
                                      {cdt.startDate} ➔ {cdt.maturityDate || cdt.startDate}
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      textAlign: "center",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {cdt.termDays || 180}d
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      textAlign: "center",
                                      color: isLight ? "#92400e" : "#f59e0b",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {cdt.interestRateEA}%
                                  </td>
                                  <td style={{ padding: "6px 2px", textAlign: "center" }}>
                                    <span
                                      style={{
                                        fontSize: "0.65rem",
                                        fontWeight: 600,
                                        color: isPastMaturity
                                          ? "#f87171"
                                          : daysRemaining === 0
                                            ? "#10b981"
                                            : (isLight ? "#92400e" : "#f59e0b"),
                                      }}
                                    >
                                      {isPastMaturity
                                        ? `⚠️ Expirado el ${cdt.maturityDate}`
                                        : daysRemaining === 0
                                          ? "¡Vence Hoy / Disponible!"
                                          : `Falta(n) ${daysRemaining} días`}
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      textAlign: "right",
                                      fontFamily: "JetBrains Mono",
                                      color: "var(--text-primary)",
                                      fontWeight: 600,
                                    }}
                                  >
                                    $
                                    {cdt.capital.toLocaleString("es-CO", {
                                      maximumFractionDigits: 0,
                                    })}
                                  </td>
                                  <td
                                    style={{
                                      padding: "6px 2px",
                                      textAlign: "right",
                                      fontFamily: "JetBrains Mono",
                                      color: "#22c55e",
                                      fontWeight: 700,
                                      fontSize: "0.72rem",
                                    }}
                                  >
                                    {(() => {
                                      const gain = getCDTAccruedYield(cdt);
                                      return `+$${gain.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
                                    })()}
                                  </td>
                                  <td style={{ padding: "6px 2px", textAlign: "right" }}>
                                    <button
                                      onClick={() => handleEdit(cdt, "cdt")}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#475569",
                                        cursor: "pointer",
                                        fontSize: "0.7rem",
                                      }}
                                      title="Editar CDT"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCDT(cdt)}
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#475569",
                                        cursor: "pointer",
                                        fontSize: "0.7rem",
                                      }}
                                      title="Eliminar CDT"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Matured / Paired CDTs History List (Acordeón Desplegable) */}
                {entityCDTs.filter((c) => c.status === "matured").length > 0 && (() => {
                  const maturedCDTs = entityCDTs.filter((c) => c.status === "matured");
                  const isMaturedExpanded = expandedMaturedEntities.has(entity.id);

                  return (
                    <div
                      style={{
                        background: "rgba(16, 185, 129, 0.02)",
                        borderRadius: 10,
                        border: `1px solid ${isMaturedExpanded ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.12)"}`,
                        marginTop: 8,
                        overflow: "hidden",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div
                        onClick={() => toggleMaturedExpand(entity.id)}
                        style={{
                          padding: "10px 14px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <h5
                          style={{
                            margin: 0,
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            color: "#10b981",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>📜 Historial de CDTs Liquidados ({maturedCDTs.length})</span>
                        </h5>
                        <button
                          type="button"
                          style={{
                            background: isMaturedExpanded ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                            border: `1px solid ${isMaturedExpanded ? "#10b981" : "rgba(255, 255, 255, 0.1)"}`,
                            borderRadius: 6,
                            color: isMaturedExpanded ? "#10b981" : "#94a3b8",
                            padding: "3px 8px",
                            fontSize: "0.68rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span>{isMaturedExpanded ? "Ocultar ▲" : "Ver historial ▼"}</span>
                        </button>
                      </div>

                      {isMaturedExpanded && (
                        <div style={{ padding: "0 14px 12px 14px", maxHeight: "280px", overflowY: "auto" }}>
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: "0.7rem",
                              color: "#94a3b8",
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                                  textAlign: "left",
                                }}
                              >
                                <th style={{ padding: "4px 2px", fontWeight: 600 }}>CDT / Bolsa</th>
                                <th
                                  style={{ padding: "4px 2px", fontWeight: 600, textAlign: "center" }}
                                >
                                  Plazo
                                </th>
                                <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                                  Ingreso
                                </th>
                                <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                                  Salida
                                </th>
                                <th style={{ padding: "4px 2px", fontWeight: 600, textAlign: "right" }}>
                                  Ganancia
                                </th>
                                <th style={{ padding: "4px 2px" }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {maturedCDTs.map((cdt, idx) => {
                                const profit = cdt.netProfit || cdt.payoutAmount - cdt.capital || 0;

                                return (
                                  <tr
                                    key={`matured_${cdt.id}_${idx}`}
                                    style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}
                                  >
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        color: "#e2e8f0",
                                        fontWeight: 500,
                                      }}
                                    >
                                      <div style={{ fontWeight: 600 }}>
                                        {cdt.category ||
                                          cdt.name
                                            .replace(/CDT Nu\s*\(Vencid[^\)]*\)\s*Vencido/i, "")
                                            .trim()}
                                      </div>
                                      <div style={{ fontSize: "0.62rem", color: "#64748b" }}>
                                        {cdt.startDate} ➔ {cdt.payoutDate || cdt.maturityDate}
                                      </div>
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        textAlign: "center",
                                        color: "#e2e8f0",
                                      }}
                                    >
                                      {cdt.termDays || 180}d
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        textAlign: "right",
                                        fontFamily: "JetBrains Mono",
                                      }}
                                    >
                                      $
                                      {cdt.capital.toLocaleString("es-CO", {
                                        maximumFractionDigits: 0,
                                      })}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        textAlign: "right",
                                        fontFamily: "JetBrains Mono",
                                        color: "#f43f5e",
                                        fontWeight: 600,
                                      }}
                                    >
                                      $
                                      {(cdt.payoutAmount || cdt.capital).toLocaleString("es-CO", {
                                        maximumFractionDigits: 0,
                                      })}
                                    </td>
                                    <td
                                      style={{
                                        padding: "6px 2px",
                                        textAlign: "right",
                                        fontFamily: "JetBrains Mono",
                                        color: "#10b981",
                                        fontWeight: 700,
                                      }}
                                    >
                                      +${profit.toLocaleString("es-CO", { maximumFractionDigits: 0 })}
                                    </td>
                                    <td style={{ padding: "6px 2px", textAlign: "right" }}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEdit(cdt, "cdt");
                                        }}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#475569",
                                          cursor: "pointer",
                                          fontSize: "0.7rem",
                                          marginRight: 4,
                                        }}
                                        title="Editar CDT"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteCDT(cdt);
                                        }}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          color: "#475569",
                                          cursor: "pointer",
                                          fontSize: "0.7rem",
                                        }}
                                        title="Eliminar del Historial"
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {entityAccounts.length === 0 && entityCDTs.length === 0 && (
                  <div
                    style={{
                      padding: "24px 16px",
                      textAlign: "center",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                      background: "rgba(255, 255, 255, 0.02)",
                      borderRadius: 10,
                      border: "1px dashed rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                      Sin cuentas ni CDTs registrados aún en <strong style={{ color: "#f1f5f9" }}>{entity.name}</strong>.
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                      <button
                        onClick={() => {
                          setSelectedModalEntityId(entity.id);
                          setEditItem(null);
                          setEditType(null);
                          setModalTab("account");
                          setModalOpen(true);
                        }}
                        style={{
                          background: "#10b981",
                          color: "#000",
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 14px",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        + Crear Cuenta / Bolsillo
                      </button>
                      <button
                        onClick={() => {
                          setSelectedModalEntityId(entity.id);
                          setEditItem(null);
                          setEditType(null);
                          setModalTab("cdt");
                          setModalOpen(true);
                        }}
                        style={{
                          background: "#f59e0b",
                          color: "#000",
                          border: "none",
                          borderRadius: 8,
                          padding: "7px 14px",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        + Registrar CDT
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          );
        };

        return (
          <div
            className="fixed-income-master-detail-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(260px, 310px) minmax(0, 1fr)",
              gap: 18,
              alignItems: "start",
            }}
          >
            {/* ── Left Column: Master List of Entities (30%) ── */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: isLight ? "#ffffff" : "rgba(15, 23, 42, 0.4)",
                border: isLight ? "1px solid rgba(0,0,0,0.08)" : "1px solid var(--border)",
                borderRadius: 14,
                padding: "12px",
              }}
            >
              <div
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  padding: "4px 8px 6px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>🏦 Entidades ({activeEntities.length})</span>
                <span style={{ fontSize: "0.68rem", color: "#38bdf8" }}>Selecciona para ver</span>
              </div>

              {activeEntities.map((entity) => {
                const currentSelectedId = selectedDetailEntityId || activeEntities[0]?.id;
                const isSelected = currentSelectedId === entity.id;
                const entAccounts = accounts.filter((a) => a.entityId === entity.id);
                const entCdts = cdts.filter((c) => c.entityId === entity.id && c.status !== "matured");

                const isAccTrans = (acc) =>
                  acc.accountCategory === "payroll" ||
                  acc.accountCategory === "digital_wallet" ||
                  acc.type === "wallet" ||
                  Number(acc.interestRateEA || 0) === 0;

                const entInvestedAccounts = entAccounts.filter((a) => !isAccTrans(a));
                const entTransactionalAccounts = entAccounts.filter((a) => isAccTrans(a));

                const liquidInvested = entInvestedAccounts.reduce((sum, a) => {
                  const accTx = transactions.filter((t) =>
                    t.accountId ? t.accountId === a.id : (t.description || "").toLowerCase().includes(a.name.toLowerCase())
                  );
                  const yData = calculateAccountYield(a, accTx, historicalRates, cdts);
                  return sum + (yData.liquidTotalBalance ?? a.balance ?? 0);
                }, 0);

                const transactionalBal = entTransactionalAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

                const cdtTotalWithYield = entCdts.reduce((sum, cdt) => {
                  const gain = getCDTAccruedYield(cdt);
                  return sum + (Number(cdt.capital) || 0) + gain;
                }, 0);

                const totalEntityInvested = liquidInvested + cdtTotalWithYield;
                const entCurr = entAccounts[0]?.currency || entCdts[0]?.currency || "COP";

                return (
                  <div
                    key={entity.id}
                    onClick={() => setSelectedDetailEntityId(entity.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      border: isSelected ? "2px solid #38bdf8" : (isLight ? "1px solid rgba(0,0,0,0.06)" : "1px solid rgba(255,255,255,0.06)"),
                      background: isSelected
                        ? (isLight ? "rgba(56, 189, 248, 0.1)" : "rgba(56, 189, 248, 0.14)")
                        : (isLight ? "#f8fafc" : "rgba(30, 41, 59, 0.5)"),
                      boxShadow: isSelected ? (isLight ? "0 2px 10px rgba(56, 189, 248, 0.15)" : "0 2px 12px rgba(56, 189, 248, 0.25)") : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          overflow: "hidden",
                          background: `${entity.color || "#6366f1"}22`,
                          border: `1px solid ${entity.color || "#6366f1"}44`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={entity.logoUrl || svgToDataUri(getBankPreset(entity.name).logoSvg)}
                          alt={entity.name}
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            fontSize: "0.86rem",
                            color: isSelected ? (isLight ? "#0284c7" : "#38bdf8") : "var(--text-primary)",
                            display: "block",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {entity.name}
                        </strong>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          {entAccounts.length} cta(s) {entCdts.length > 0 ? `• ${entCdts.length} CDT(s)` : ""}
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      {totalEntityInvested > 0 ? (
                        <>
                          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.84rem", fontWeight: 800, color: isSelected ? "#10b981" : "var(--text-primary)" }}>
                            {formatMoney(totalEntityInvested, entCurr)}
                          </div>
                          {transactionalBal > 0 ? (
                            <span style={{ fontSize: "0.64rem", color: "#60a5fa", display: "block", fontWeight: 600 }}>
                              +{formatMoney(transactionalBal, entCurr)} Nómina
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.68rem", color: isSelected ? "#38bdf8" : "var(--text-muted)", fontWeight: 600 }}>
                              {isSelected ? "Activa ➔" : "Ver"}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.84rem", fontWeight: 800, color: isSelected ? "#38bdf8" : "var(--text-primary)" }}>
                            {formatMoney(transactionalBal, entCurr)}
                          </div>
                          <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", display: "block", fontWeight: 600 }}>
                            0% E.A. • Disponible
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Right Column: Detail View of Selected Entity (70%) ── */}
            <div style={{ minWidth: 0 }}>
              {(() => {
                const currentEntity = activeEntities.find((e) => e.id === (selectedDetailEntityId || activeEntities[0]?.id)) || activeEntities[0];
                return renderEntityCard(currentEntity, true);
              })()}
            </div>
          </div>
        );
      })()}
          </>
        )}
      </div>

      {/* ── Banner de Referidos Financieros al Fondo (Promos Destacadas) ── */}
      <div style={{ marginTop: 24 }}>
        <AffiliateBanner type="fixed_income" />
      </div>

      {/* ── MODAL DE CREACIÓN / EDICIÓN ──────────────────── */}
      <FixedIncomeModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditItem(null);
          setEditType(null);
          setSelectedModalEntityId(null);
        }}
        initialTab={modalTab}
        initialEntityId={selectedModalEntityId}
        editItem={editItem}
      />

      {/* ── MODAL DE IMPORTACIÓN INTELIGENTE DE EXTRACTOS (PDF) ── */}
      <StatementImporterModal isOpen={importerOpen} onClose={() => setImporterOpen(false)} />
    </div>
  );
}
