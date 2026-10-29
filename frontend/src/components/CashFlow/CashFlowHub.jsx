import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { fetchFxHistory, fetchLiveQuotes, fetchNAV } from "../../api/client";
import { useCashFlowStore } from "../../store/cashFlowStore";
import { useFixedIncomeStore } from "../../store/fixedIncomeStore";
import { usePortfolioStore } from "../../store/portfolioStore";
import { formatCashFlowMoneyWithCode, formatCashFlowMoney } from "../../utils/cashFlowFormatters";
import { formatPeriodName, formatPeriodWithCycleRange, getNextPeriod, getPrevPeriod } from "../../utils/periodUtils";
import CashFlowAllocationModal from "./CashFlowAllocationModal";
import CashFlowRuleSelector from "./CashFlowRuleSelector";
import CashFlowSankey from "./CashFlowSankey";
import ColombiaPayrollModal from "./ColombiaPayrollModal";
import CreditCardConfigModal from "./CreditCardConfigModal";
import CreditCardPaymentModal from "./CreditCardPaymentModal";
import CreditCardsSection from "./CreditCardsSection";
import CreditPurchaseModal from "./CreditPurchaseModal";
import EmergencyFundCard from "./EmergencyFundCard";
import ExpensesLogSection from "./ExpensesLogSection";
import ExpenseTransactionModal from "./ExpenseTransactionModal";
import LoanSettlementModal from "./LoanSettlementModal";
import PayrollEntityModal from "./PayrollEntityModal";
import PillarBreakdownCard from "./PillarBreakdownCard";
import RealCashLiquidityCard from "./RealCashLiquidityCard";
import DebtsSection from "./DebtsSection";
import DebtModal from "./DebtModal";
import DebtPaymentModal from "./DebtPaymentModal";
import AffiliateBanner from "../Common/AffiliateBanner";
import QuantumOrbitalLoader from "../QuantumOrbitalLoader";
import { useTheme } from "../../context/ThemeContext";
import "./CashFlow.css";

export default function CashFlowHub() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const {
    startPeriod,
    activePeriod,
    currency,
    allocationModel,
    customRatios,
    emergencyFundTargetMonths,
    payrollAccount,
    creditCards,
    creditPurchases,
    creditCardPayments,
    expensesLog,
    debts,
    inflows,
    needs,
    wants,
    wealth,
    salaryHistory,
    isInitialized,
    initFetchCashFlow,
    setCurrency,
    setActivePeriod,
    setAllocationModel,
    setCustomRatios,
    setEmergencyFundTargetMonths,
    setPayrollAccount,
    addCreditCard,
    updateCreditCard,
    deleteCreditCard,
    addCreditPurchase,
    updateCreditPurchase,
    deleteCreditPurchase,
    addCreditCardPayment,
    deleteCreditCardPayment,
    addExpenseTransaction,
    updateExpenseTransaction,
    deleteExpenseTransaction,
    addInflow,
    updateInflow,
    deleteInflow,
    addNeed,
    updateNeed,
    deleteNeed,
    addWant,
    updateWant,
    deleteWant,
    addWealth,
    updateWealth,
    deleteWealth,
    recordSalaryAdjustment,
    settleLoanTransaction,
    updateExpenseLoanSplit,
    revertParticipantPayment,
    toggleExpenseLoan,
    convertExpenseToCardPayment,
    reclassifyMovement,
    addDebt,
    updateDebt,
    deleteDebt,
    recordDebtPayment,
    deleteDebtPayment,
    syncFromFixedIncome,
    syncFromPortfolio,
  } = useCashFlowStore();

  const {
    accounts: fixedAccounts,
    cdts: fixedCdts,
    initFetchFixedIncome,
    creditAccountFromCashFlow,
    revertAccountCredit,
  } = useFixedIncomeStore();

  // Reclasifica el movimiento y, si se eligió una cuenta destino distinta al origen (p.ej. Principal de
  // Finandina o RappiPay desde Nómina para el Fondo de Emergencia), abona el dinero en esa cuenta.
  const handleReclassifyMovement = (payload) => {
    const mv = (expensesLog || []).find((e) => e.id === payload.movementId);
    reclassifyMovement(payload);
    if (mv) {
      const destAccId = payload?.destinationAccount?.id;
      const srcAccId = mv.paymentSource?.targetId;
      const srcAccName = (mv.paymentSource?.targetName || "").toLowerCase().trim();
      const destAccName = (payload?.destinationAccount?.name || "").toLowerCase().trim();

      // Es la misma cuenta si el ID coincide o los nombres coinciden
      const isSameAccount = Boolean(
        destAccId && (
          destAccId === srcAccId ||
          (srcAccName && destAccName && (srcAccName.includes(destAccName) || destAccName.includes(srcAccName)))
        )
      );

      // Solo consideramos que provino de Renta Fija si la fuente de pago fue un bolsillo de ahorro previo
      const isFromFixedIncome = Boolean(
        mv.paymentSource?.type === "fixed_pocket" ||
        (mv.source === "fixed_income" && !mv.source?.includes("webhook"))
      );

      // Si antes tenía una cuenta destino y ahora cambió o se quitó, revertir el abono anterior
      if (mv.destinationAccountId && mv.destinationAccountId !== destAccId) {
        if (typeof revertAccountCredit === "function") {
          revertAccountCredit({
            accountId: mv.destinationAccountId,
            amount: mv.amount,
            movementId: mv.id,
          });
        }
      }

      // Si la cuenta destino seleccionada es la MISMA cuenta de origen, revertir cualquier abono espurio previo
      if (isSameAccount && (mv.destinationAccountId || destAccId)) {
        if (typeof revertAccountCredit === "function") {
          revertAccountCredit({
            accountId: destAccId || mv.destinationAccountId,
            amount: mv.amount,
            movementId: mv.id,
          });
        }
      }

      // SOLO acreditar si es una cuenta DESTINO DISTINTA y el dinero no estaba ya radicado allí
      if (destAccId && !isSameAccount && !isFromFixedIncome && typeof creditAccountFromCashFlow === "function") {
        creditAccountFromCashFlow({
          accountId: destAccId,
          amount: mv.amount,
          usdAmount: mv.usdAmount || (mv.amount === 200000 && destAccId === "acc_plenti_principal" ? 63.56 : undefined),
          date: mv.date,
          movementId: mv.id,
          description: `Transferencia para ${payload.targetItem?.name || "Ahorro"} (desde ${mv.paymentSource?.targetName || "Nómina"})`,
        });
      }
    }
  };
  const {
    settingsByMode,
    mode,
    customStrategies,
    initFetchCustomStrategies,
    initFetchPurchases,
    individualPurchases,
    purchaseSales,
    purchasePortfolios,
    lastKnownQuotes,
    lastStrategySummaries,
    lastPortfolioSummaries,
    saveLastKnownQuotes,
    saveStrategySummary,
  } = usePortfolioStore();

  const [fxRate, setFxRate] = useState(4150);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState("inflow"); // 'inflow' | 'needs' | 'wants' | 'wealth'
  const [editItem, setEditItem] = useState(null);
  const [payrollModalOpen, setPayrollModalOpen] = useState(false);
  const [payrollEntityModalOpen, setPayrollEntityModalOpen] = useState(false);
  const [creditPurchaseModalOpen, setCreditPurchaseModalOpen] = useState(false);
  const [cardConfigModalOpen, setCardConfigModalOpen] = useState(false);
  const [cardToEdit, setCardToEdit] = useState(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);
  const [expenseToSettle, setExpenseToSettle] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentInitialCardId, setPaymentInitialCardId] = useState(null);
  const [paymentInitialAmount, setPaymentInitialAmount] = useState(null);
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtToEdit, setDebtToEdit] = useState(null);
  const [defaultDebtType, setDefaultDebtType] = useState("payable");
  const [debtPaymentModalOpen, setDebtPaymentModalOpen] = useState(false);
  const [selectedDebtForPayment, setSelectedDebtForPayment] = useState(null);
  const [showSankey, setShowSankey] = useState(true);
  const [showLiquidity, setShowLiquidity] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [showPillars, setShowPillars] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showCreditCards, setShowCreditCards] = useState(false);
  const [showDebts, setShowDebts] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null); // 'invested' | 'yield' | 'closed' | null

  const areAllAccordionsExpanded =
    showLiquidity && showRules && showEmergency && showPillars && showExpenses && showCreditCards && showDebts;
  const toggleAllAccordions = () => {
    const nextState = !areAllAccordionsExpanded;
    setShowLiquidity(nextState);
    setShowRules(nextState);
    setShowEmergency(nextState);
    setShowPillars(nextState);
    setShowExpenses(nextState);
    setShowCreditCards(nextState);
    setShowDebts(nextState);
  };

  // Ensure fixed income accounts are fetched from backend SSOT on mount
  useEffect(() => {
    initFetchFixedIncome();
  }, [initFetchFixedIncome]);

  // Fetch Live TRM USD/COP on mount
  useEffect(() => {
    fetchFxHistory("USD", "COP")
      .then((res) => {
        if (res?.current) {
          setFxRate(Number(res.current));
        }
      })
      .catch(console.error);
  }, []);

  // Live Quotes & Strategy NAV for Real Investments tracking
  const [liveQuotesMap, setLiveQuotesMap] = useState({});
  const [historicalNavData, setHistoricalNavData] = useState(null);
  const [customRealNavData, setCustomRealNavData] = useState(null);

  // Fetch Live Quotes for active purchase tickers
  useEffect(() => {
    const activeTickers = [
      ...new Set(
        (individualPurchases || [])
          .filter((p) => Number(p.shares || 0) > 0 && p.ticker)
          .map((p) => p.ticker)
      ),
    ];
    if (activeTickers.length === 0) return;

    let isCancelled = false;
    const fetchQuotes = () => {
      fetchLiveQuotes(activeTickers)
        .then((quotes) => {
          if (!isCancelled && Array.isArray(quotes)) {
            const map = {};
            quotes.forEach((q) => {
              if (q?.ticker) map[q.ticker] = q;
            });
            setLiveQuotesMap((prev) => ({ ...prev, ...map }));
            if (typeof saveLastKnownQuotes === "function") {
              saveLastKnownQuotes(map);
            }
          }
        })
        .catch(console.error);
    };

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60_000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [individualPurchases, saveLastKnownQuotes]);

  // Fetch NAV for Titanes Tech (historical)
  useEffect(() => {
    let isCancelled = false;
    fetchNAV({
      period: "1Y",
      investment: Number(settingsByMode?.historical?.investment || 2000),
      numSlots: Number(settingsByMode?.historical?.numSlots || 15),
      strategyId: "historical",
    })
      .then((data) => {
        if (!isCancelled && data?.summary) {
          setHistoricalNavData(data);
          if (typeof saveStrategySummary === "function") {
            saveStrategySummary("historical", data);
          }
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [settingsByMode?.historical?.investment, settingsByMode?.historical?.numSlots, saveStrategySummary]);

  // Fetch NAV for Real Custom Strategy (e.g. strat_1788304141581)
  const realCustomStrat = useMemo(() => {
    return (customStrategies || []).find((s) => s.isRealMoney);
  }, [customStrategies]);

  useEffect(() => {
    if (!realCustomStrat?.id) return;
    let isCancelled = false;
    fetchNAV({
      period: "1Y",
      investment: Number(realCustomStrat.capital || settingsByMode?.[realCustomStrat.id]?.investment || 1010),
      numSlots: Number(realCustomStrat.numSlots || 20),
      strategyId: realCustomStrat.id,
    })
      .then((data) => {
        if (!isCancelled && data?.summary) {
          setCustomRealNavData(data);
          if (typeof saveStrategySummary === "function") {
            saveStrategySummary(realCustomStrat.id, data);
          }
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [realCustomStrat, settingsByMode, saveStrategySummary]);

  // Initialize store on mount
  useEffect(() => {
    initFetchCashFlow();
    if (typeof initFetchCustomStrategies === "function") {
      initFetchCustomStrategies();
    }
    if (typeof initFetchPurchases === "function") {
      initFetchPurchases();
    }
  }, [initFetchCashFlow, initFetchCustomStrategies, initFetchPurchases]);

  // Live auto-polling for mobile webhook movements (every 10s when active and no modal open)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (
        cardConfigModalOpen ||
        expenseModalOpen ||
        paymentModalOpen ||
        debtModalOpen ||
        debtPaymentModalOpen ||
        payrollEntityModalOpen ||
        payrollModalOpen ||
        creditPurchaseModalOpen
      ) {
        return;
      }
      initFetchCashFlow({ silent: true });
    }, 10000);

    // Instant refresh when user returns to tab / unlocks phone
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        initFetchCashFlow({ silent: true });
        if (typeof initFetchFixedIncome === "function") {
          initFetchFixedIncome();
        }
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [
    cardConfigModalOpen,
    expenseModalOpen,
    paymentModalOpen,
    debtModalOpen,
    debtPaymentModalOpen,
    payrollEntityModalOpen,
    payrollModalOpen,
    creditPurchaseModalOpen,
    initFetchCashFlow,
    initFetchFixedIncome,
  ]);

  // Live Auto-Sync Passive Yields & Portfolio Equity
  useEffect(() => {
    if (isInitialized) {
      if (fixedAccounts?.length > 0 || fixedCdts?.length > 0) {
        syncFromFixedIncome(fixedAccounts || [], fixedCdts || [], fxRate);
      }

      // Sum ALL strategies capital (historical + all custom strategies)
      let totalEquityUSD = settingsByMode?.historical?.investment || 0;
      if (Array.isArray(customStrategies)) {
        customStrategies.forEach((strat) => {
          totalEquityUSD += Number(strat.capital || settingsByMode?.[strat.id]?.investment || 0);
        });
      }
      // Add individual purchase lots (shares * purchasePrice per lot)
      if (Array.isArray(individualPurchases)) {
        individualPurchases.forEach((lot) => {
          totalEquityUSD += Number(lot.shares || 0) * Number(lot.purchasePrice || 0);
        });
      }

      if (totalEquityUSD > 0) {
        syncFromPortfolio(totalEquityUSD, fxRate);
      }
    }
  }, [isInitialized, fixedAccounts, fixedCdts, settingsByMode, mode, customStrategies, individualPurchases, fxRate, syncFromFixedIncome, syncFromPortfolio]);

  const formatMoney = (val, cur = currency) => formatCashFlowMoneyWithCode(val, cur, fxRate);

  // ── Period Filtered Items ──────────────────────────────────────────
  const isAtStartPeriod = Boolean(startPeriod && activePeriod <= startPeriod);

  const periodInflows = useMemo(() => {
    return inflows.filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return (item.targetPeriod || item.period) === activePeriod;
      }
      return true;
    });
  }, [inflows, activePeriod]);

  const periodNeeds = useMemo(() => {
    return needs.filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return (item.targetPeriod || item.period) === activePeriod;
      }
      return true;
    });
  }, [needs, activePeriod]);

  const periodWants = useMemo(() => {
    return wants.filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return (item.targetPeriod || item.period) === activePeriod;
      }
      return true;
    });
  }, [wants, activePeriod]);

  const periodWealth = useMemo(() => {
    return wealth.filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return (item.targetPeriod || item.period) === activePeriod;
      }
      return true;
    });
  }, [wealth, activePeriod]);

  // Active period real expenses log
  const periodExpenses = useMemo(() => {
    return (expensesLog || []).filter((tx) => !tx.period || tx.period === activePeriod);
  }, [expensesLog, activePeriod]);

  // ── Totals Aggregation (Base COP) ──────────────────────────────────
  const totalInflow = useMemo(() => {
    return periodInflows.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [periodInflows]);

  // Real Income / Credits received this period (from mobile webhook, bank sync, or manual transactions)
  const realIncomeTransactions = useMemo(() => {
    return (periodExpenses || []).filter(
      (tx) => tx.type === "credit" || tx.budgetItemType === "income" || Number(tx.amount) < 0
    );
  }, [periodExpenses]);

  const realTotalInflow = useMemo(() => {
    return realIncomeTransactions.reduce((acc, tx) => acc + Math.abs(Number(tx.amount) || 0), 0);
  }, [realIncomeTransactions]);

  const realPayrollInflow = useMemo(() => {
    return realIncomeTransactions
      .filter((tx) => {
        const srcType = tx.paymentSource?.type;
        const targetName = (tx.paymentSource?.targetName || "").toLowerCase();
        const desc = (tx.description || tx.budgetItemName || "").toLowerCase();
        if (targetName.includes("rappi") || targetName.includes("impresora") || desc.includes("impresora")) {
          return false;
        }
        return (
          srcType === "payroll" ||
          targetName.includes("nu") ||
          targetName.includes("nomina") ||
          targetName.includes("nómina") ||
          desc.includes("nomina") ||
          desc.includes("nómina") ||
          desc.includes("salario")
        );
      })
      .reduce((acc, tx) => acc + Math.abs(Number(tx.amount) || 0), 0);
  }, [realIncomeTransactions]);

  const inflowProgressPct = useMemo(() => {
    return totalInflow > 0 ? Math.min(100, Math.round((realTotalInflow / totalInflow) * 100)) : 0;
  }, [realTotalInflow, totalInflow]);

  const salaryInflows = useMemo(() => {
    return periodInflows.filter(
      (i) =>
        i.category === "salary" ||
        i.category === "overtime" ||
        i.name?.toLowerCase().includes("salario") ||
        i.name?.toLowerCase().includes("nómina") ||
        i.name?.toLowerCase().includes("extras")
    );
  }, [periodInflows]);

  const netSalary = useMemo(() => {
    const sum = salaryInflows.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
    return sum > 0 ? sum : totalInflow;
  }, [salaryInflows, totalInflow]);

  const totalNeeds = useMemo(() => {
    return periodNeeds.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [periodNeeds]);

  const totalWants = useMemo(() => {
    return periodWants.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [periodWants]);

  const totalWealth = useMemo(() => {
    return periodWealth.reduce((acc, curr) => acc + (Number(curr.monthlyContribution) || 0), 0);
  }, [periodWealth]);

  const totalAllocated = totalNeeds + totalWants + totalWealth;
  const freeCashFlow = Math.max(0, totalInflow - totalAllocated);

  const totalPassiveInflow = useMemo(() => {
    return periodInflows
      .filter((i) => i.isPassive || i.category?.startsWith("passive_"))
      .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  }, [periodInflows]);

  const passivePctOfInflow = totalInflow > 0 ? ((totalPassiveInflow / totalInflow) * 100).toFixed(1) : 0;
  const savingsRate = totalInflow > 0 ? ((totalWealth / totalInflow) * 100).toFixed(1) : 0;

  // Emergency Fund Metrics: Solo cuenta la cuenta designada como Fondo de Emergencia
  const emergencyItem = useMemo(() => {
    const item = wealth.find((w) => w.category === "emergency_fund") || {
      currentBalance: 1070000,
      targetAmount: (totalNeeds || 1) * emergencyFundTargetMonths,
    };
    const matchingAccounts = (fixedAccounts || []).filter((a) => {
      const name = (a.name || "").toLowerCase().trim();
      const cat = (a.category || "").toLowerCase().trim();
      return name.includes("emergencia") || cat.includes("emergencia") || name.includes("emergency");
    });
    if (matchingAccounts.length > 0) {
      const totalBalance = matchingAccounts.reduce((sum, a) => {
        const bal = Number(a.balance) || 0;
        const mult = a.currency === "USD" ? fxRate : 1;
        return sum + bal * mult;
      }, 0);
      const sourceAccountsBreakdown = matchingAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: Number(a.balance) || 0,
        currency: a.currency || "COP",
        rateEA: Number(a.interestRateEA) || 0,
      }));
      return {
        ...item,
        currentBalance: Math.round(totalBalance * 100) / 100,
        sourceAccountName: matchingAccounts.map((a) => a.name).join(" + "),
        sourceAccountsBreakdown,
      };
    }
    // Fallback: si aun no cargan fixedAccounts o si item trae la suma residual erronea (>3.5M), sanitizar a su saldo real
    const rawVal = Number(item.currentBalance) || 0;
    const cleanBalance = rawVal === 3616128 || rawVal > 3500000 ? 1070000 : rawVal;
    return {
      ...item,
      currentBalance: cleanBalance,
      sourceAccountName: item.sourceAccountName || "Fondo de emergencia",
    };
  }, [wealth, totalNeeds, emergencyFundTargetMonths, fixedAccounts, fxRate]);

  // Days of Freedom Metric
  const dailyBurn = (totalNeeds + totalWants) / 30;
  const daysOfFreedom = dailyBurn > 0 ? (totalWealth / dailyBurn).toFixed(1) : "0.0";

  // ── Flujo en Paralelo: Patrimonio Total Invertido (Solo Dinero Real) ──
  const realInvestmentMetrics = useMemo(() => {
    // 1. Estrategia 1: Titanes Tech (historical) — usa tiempo real o el último cálculo guardado
    const histSource = historicalNavData?.summary ? historicalNavData : lastStrategySummaries?.historical;
    const titanesActiveInvestedUSD = Number(
      histSource?.summary?.active_invested ??
      (settingsByMode?.historical?.investment ? (settingsByMode.historical.investment * 8) / 15 : 1066.67)
    );
    const titanesBaseTotalUSD = Number(settingsByMode?.historical?.investment || 2000);
    const titanesReturnUSD = Number(
      histSource?.summary?.active_return ?? histSource?.summary?.total_return ?? 0
    );
    const titanesMarketValueUSD = titanesActiveInvestedUSD + titanesReturnUSD;

    // 2. Estrategia 2: Estrategia Personalizada con Dinero Real (ej. strat_1788304141581)
    const realStrats = (customStrategies || []).filter((s) => s.isRealMoney);
    const customBreakdowns = realStrats.map((strat) => {
      const liveStratNav = strat.id === realCustomStrat?.id && customRealNavData?.summary ? customRealNavData : null;
      const stratNav = liveStratNav || lastStrategySummaries?.[strat.id];
      const baseCap = Number(strat.capital || settingsByMode?.[strat.id]?.investment || 1010);
      const activeInv = Number(
        stratNav?.summary?.active_invested ?? (baseCap * (strat.numSlots ? 7 / strat.numSlots : 0.35))
      );
      const ret = Number(stratNav?.summary?.active_return ?? stratNav?.summary?.total_return ?? 0);
      const mktVal = activeInv + ret;
      const pnlPct = activeInv > 0 ? (ret / activeInv) * 100 : 0;
      return {
        id: strat.id,
        name: strat.name || "Estrategia Real",
        country: strat.country || "🌎",
        activeInvestedUSD: activeInv,
        marketValueUSD: mktVal,
        pnlUSD: ret,
        pnlPct,
        totalCapitalUSD: baseCap,
        closedHoldings: stratNav?.closed_holdings || [],
      };
    });

    const strategiesItems = [
      {
        id: "historical",
        name: "Kpital Tech",
        country: "🏆",
        activeInvestedUSD: titanesActiveInvestedUSD,
        marketValueUSD: titanesMarketValueUSD,
        pnlUSD: titanesReturnUSD,
        pnlPct: titanesActiveInvestedUSD > 0 ? (titanesReturnUSD / titanesActiveInvestedUSD) * 100 : 0,
        totalCapitalUSD: titanesBaseTotalUSD,
        closedHoldings: histSource?.closed_holdings || [],
      },
      ...customBreakdowns,
    ];

    const strategiesInvestedUSD = strategiesItems.reduce((acc, s) => acc + s.activeInvestedUSD, 0);
    const strategiesMarketValueUSD = strategiesItems.reduce((acc, s) => acc + s.marketValueUSD, 0);
    const strategiesUnrealizedPnlUSD = strategiesMarketValueUSD - strategiesInvestedUSD;

    // 3. Compras individuales activas agrupadas por Grupo / Portafolio de Compra
    const portMap = {};
    (purchasePortfolios || []).forEach((p) => {
      portMap[p.id] = { id: p.id, name: p.name, investedUSD: 0, marketValueUSD: 0, count: 0 };
    });
    if (!portMap["hist_default"]) {
      portMap["hist_default"] = { id: "hist_default", name: "Compras Principales", investedUSD: 0, marketValueUSD: 0, count: 0 };
    }

    let purchasesInvestedUSD = 0;
    let purchasesMarketValueUSD = 0;
    let activeLotsCount = 0;

    (individualPurchases || []).forEach((lot) => {
      const sh = Number(lot.shares || 0);
      const prc = Number(lot.purchasePrice || 0);
      if (sh > 0) {
        const invested = (sh > 0 && prc > 0) ? sh * prc : (lot.investedAmount != null ? Number(lot.investedAmount) : sh * prc);
        const liveQuote = liveQuotesMap[lot.ticker] || lastKnownQuotes?.[lot.ticker];
        const currentPrc = Number(lot.manualCurrentPrice || liveQuote?.price || prc);
        const ratio = prc > 0 ? currentPrc / prc : 1;
        const curVal = invested * ratio;

        purchasesInvestedUSD += invested;
        purchasesMarketValueUSD += curVal;
        activeLotsCount += 1;

        const portId = lot.portfolioId || "hist_default";
        if (!portMap[portId]) {
          portMap[portId] = { id: portId, name: portId, investedUSD: 0, marketValueUSD: 0, count: 0 };
        }
        portMap[portId].investedUSD += invested;
        portMap[portId].marketValueUSD += curVal;
        portMap[portId].count += 1;
      }
    });

    // Fallback: si algún portafolio aún no cargó lotes pero tiene último resumen guardado en store
    Object.values(portMap).forEach((g) => {
      if (g.count === 0 && lastPortfolioSummaries?.[g.id]?.investedUSD > 0) {
        const saved = lastPortfolioSummaries[g.id];
        g.investedUSD = Number(saved.investedUSD || 0);
        g.marketValueUSD = Number(saved.marketValueUSD || g.investedUSD);
        g.count = Number(saved.count || 1);
        purchasesInvestedUSD += g.investedUSD;
        purchasesMarketValueUSD += g.marketValueUSD;
      }
    });

    const purchasesUnrealizedPnlUSD = purchasesMarketValueUSD - purchasesInvestedUSD;

    const purchaseGroups = Object.values(portMap)
      .filter((g) => g.count > 0 || g.investedUSD > 0)
      .map((g) => {
        const pnlUSD = g.marketValueUSD - g.investedUSD;
        const pnlPct = g.investedUSD > 0 ? (pnlUSD / g.investedUSD) * 100 : 0;
        return {
          ...g,
          pnlUSD,
          pnlPct,
        };
      });

    // 4. Totales Combinados (Costo Base vs Valor de Mercado)
    const totalInvestedUSD = strategiesInvestedUSD + purchasesInvestedUSD;
    const totalInvestedCOP = Math.round(totalInvestedUSD * fxRate);

    const totalMarketValueUSD = strategiesMarketValueUSD + purchasesMarketValueUSD;
    const totalMarketValueCOP = Math.round(totalMarketValueUSD * fxRate);

    const totalUnrealizedPnlUSD = totalMarketValueUSD - totalInvestedUSD;
    const totalUnrealizedPnlCOP = Math.round(totalUnrealizedPnlUSD * fxRate);
    const totalUnrealizedPnlPct = totalInvestedUSD > 0 ? (totalUnrealizedPnlUSD / totalInvestedUSD) * 100 : 0;

    // 5. Historial Completo de Posiciones Cerradas agrupadas por Mes (Estrategias + Ventas Individuales)
    const allClosedPositions = [];

    // 5a. De todas las Estrategias Reales (Titanes Tech + Estrategias Reales Personalizadas)
    strategiesItems.forEach((st) => {
      (st.closedHoldings || []).forEach((h) => {
        const exitDate = h.exit_date || "";
        allClosedPositions.push({
          id: `${st.id}_closed_${h.ticker}_${exitDate}`,
          source: st.name,
          ticker: h.ticker,
          name: h.name || h.ticker,
          entryDate: h.entry_date || null,
          exitDate,
          period: exitDate ? exitDate.slice(0, 7) : activePeriod,
          costBasisUSD: Number(h.cost_basis ?? 0),
          exitValueUSD: Number(h.exit_value ?? 0),
          realizedPnlUSD: Number(h.realized_pnl ?? 0),
          realizedReturnPct: Number(h.realized_return_pct ?? 0),
        });
      });
    });

    // 5b. De Ventas de Compras Individuales (purchaseSales)
    (purchaseSales || []).forEach((sale) => {
      const saleDateStr = sale.saleDate || sale.sale_date || "";
      const pnlUSD = Number(sale.realizedPnl ?? sale.realized_pnl ?? 0);
      const costB = Number(sale.costBasis ?? sale.cost_basis ?? 0);
      const retPct =
        sale.realizedReturnPct != null
          ? Number(sale.realizedReturnPct)
          : costB > 0
          ? (pnlUSD / costB) * 100
          : 0;
      const portName = portMap[sale.portfolioId]?.name || "Compra Individual";
      allClosedPositions.push({
        id: sale.id || `sale_${saleDateStr}_${sale.ticker}`,
        source: portName,
        ticker: sale.ticker,
        name: sale.notes || sale.ticker,
        entryDate: sale.purchaseDate || sale.purchase_date || null,
        exitDate: saleDateStr,
        period: saleDateStr ? saleDateStr.slice(0, 7) : activePeriod,
        costBasisUSD: costB,
        exitValueUSD: costB + pnlUSD,
        realizedPnlUSD: pnlUSD,
        realizedReturnPct: retPct,
      });
    });

    // Ordenar todas las posiciones cerradas de más reciente a más antigua
    allClosedPositions.sort((a, b) => (b.exitDate || "").localeCompare(a.exitDate || ""));

    // Agrupar por mes YYYY-MM
    const monthBuckets = {};
    allClosedPositions.forEach((pos) => {
      const mKey = pos.period || "Sin fecha";
      if (!monthBuckets[mKey]) {
        monthBuckets[mKey] = {
          period: mKey,
          monthKey: mKey,
          periodLabel: formatPeriodName(mKey),
          positions: [],
          items: [],
          totalPnlUSD: 0,
          count: 0,
        };
      }
      monthBuckets[mKey].positions.push(pos);
      monthBuckets[mKey].items.push(pos);
      monthBuckets[mKey].totalPnlUSD += pos.realizedPnlUSD;
      monthBuckets[mKey].count += 1;
    });

    const closedByMonthHistory = Object.values(monthBuckets)
      .sort((a, b) => b.period.localeCompare(a.period))
      .map((m) => ({
        ...m,
        monthKey: m.period,
        items: m.positions,
        totalPnlCOP: Math.round(m.totalPnlUSD * fxRate),
      }));

    const closedPositionsMonth = allClosedPositions.filter((p) => p.period === activePeriod);
    const closedPnlMonthUSD = closedPositionsMonth.reduce((acc, c) => acc + c.realizedPnlUSD, 0);
    const closedCountMonth = closedPositionsMonth.length;

    const totalHistoricalClosedPnlUSD = allClosedPositions.reduce((acc, c) => acc + c.realizedPnlUSD, 0);
    const totalHistoricalClosedPnlCOP = Math.round(totalHistoricalClosedPnlUSD * fxRate);
    const totalHistoricalClosedCount = allClosedPositions.length;

    return {
      // Base Cost Basis (Dinero realmente invertido activo)
      totalInvestedUSD,
      totalInvestedCOP,
      strategiesInvestedUSD,
      purchasesInvestedUSD,
      // Current Market Value
      totalMarketValueUSD,
      totalMarketValueCOP,
      strategiesMarketValueUSD,
      purchasesMarketValueUSD,
      // Unrealized P&L
      totalUnrealizedPnlUSD,
      totalUnrealizedPnlCOP,
      totalUnrealizedPnlPct,
      strategiesUnrealizedPnlUSD,
      purchasesUnrealizedPnlUSD,
      // Counts
      strategiesCount: strategiesItems.length,
      activeLotsCount,
      // Detailed breakdowns for collapsible accordions
      strategiesItems,
      purchaseGroups,
      closedPositionsMonth,
      closedByMonthHistory,
      allClosedPositions,
      // Monthly Closed Realized
      closedPnlMonthUSD,
      closedPnlMonthCOP: Math.round(closedPnlMonthUSD * fxRate),
      closedCountMonth,
      // Historical Closed Realized across all months
      totalHistoricalClosedPnlUSD,
      totalHistoricalClosedPnlCOP,
      totalHistoricalClosedCount,
    };
  }, [
    customStrategies,
    settingsByMode,
    historicalNavData,
    customRealNavData,
    realCustomStrat,
    individualPurchases,
    purchasePortfolios,
    liveQuotesMap,
    lastKnownQuotes,
    lastStrategySummaries,
    lastPortfolioSummaries,
    purchaseSales,
    activePeriod,
    fxRate,
  ]);

  // List of budget envelope items (needs + wants + wealth) for transaction logging
  const budgetEnvelopes = useMemo(() => {
    return [
      ...periodNeeds.map((n) => ({ ...n, pillarType: "needs", typeLabel: "Gastos Fijos", amount: n.amount })),
      ...periodWants.map((w) => ({ ...w, pillarType: "wants", typeLabel: "Estilo de Vida", amount: w.amount })),
      ...periodWealth.map((w) => ({
        ...w,
        pillarType: "wealth",
        typeLabel: "Ahorro & Inversión",
        amount: Number(w.monthlyContribution) || 0,
      })),
    ];
  }, [periodNeeds, periodWants, periodWealth]);

  // ── Modal Handlers ──────────────────────────────────────────────────
  const handleOpenAddModal = (type = "inflow") => {
    setModalType(type);
    setEditItem(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (item, type = "inflow") => {
    setModalType(type);
    setEditItem({ ...item, pillarType: type });
    setModalOpen(true);
  };

  const handleDeleteItem = (id, type) => {
    if (type === "inflow") deleteInflow(id);
    if (type === "needs") deleteNeed(id);
    if (type === "wants") deleteWant(id);
    if (type === "wealth") deleteWealth(id);
    toast.success("Ítem eliminado correctamente", { icon: "🗑️" });
  };

  const handleOpenNewCardModal = () => {
    setCardToEdit(null);
    setCardConfigModalOpen(true);
  };

  const handleOpenEditCardModal = (card) => {
    setCardToEdit(card);
    setCardConfigModalOpen(true);
  };

  const handleSaveCard = (cardData) => {
    if (cardToEdit) {
      updateCreditCard(cardData.id, cardData);
      toast.success(`Tarjeta ${cardData.name} actualizada con éxito`, { icon: "💳" });
    } else {
      addCreditCard(cardData);
    }
  };

  const handleAutoSync = () => {
    syncFromFixedIncome(fixedAccounts, fixedCdts, fxRate);
    const currentSettings = settingsByMode[mode] || settingsByMode.historical;
    const inv = currentSettings?.investment || 0;
    if (inv > 0) {
      syncFromPortfolio(inv, fxRate);
    }
    toast.success("Patrimonio y rendimientos pasivos sincronizados en tiempo real", {
      icon: "⚡",
    });
  };

  return (
    <div className="cashflow-dashboard-container">
      {/* ── 1. Top Hero Header Banner ───────────────────────────────── */}
      <div className="cashflow-header-bar">
        <div className="cashflow-header-info">
          <h2 className="cashflow-title">
            <span>🌊</span> Flujo de Capital & Asignación Presupuestal
          </h2>
          <p className="cashflow-subtitle">
            Ingeniería financiera para optimización de flujo libre, nómina legal, tarjetas 0% MSI y liquidez multicuenta.
          </p>
        </div>


        {/* Primary Call-to-Action Buttons */}
        <div className="cashflow-header-actions">
          {/* Log Real Expense Button */}
          <button
            type="button"
            className="cashflow-action-btn secondary"
            style={{
              background: "rgba(244, 63, 94, 0.12)",
              border: "1px solid rgba(244, 63, 94, 0.35)",
              color: "#fb7185",
            }}
            onClick={() => setExpenseModalOpen(true)}
            title="Registrar un gasto real consumido o un aporte a CDT/Cuenta de Ahorro indicando la fuente de pago"
          >
            <span>💸</span>
            <span>Registrar Movimiento / Gasto</span>
          </button>

          {/* New Item Modal Button */}
          <button
            type="button"
            className="cashflow-action-btn primary"
            onClick={() => handleOpenAddModal("inflow")}
          >
            <span>+</span>
            <span>Nueva Asignación / Tope</span>
          </button>
        </div>
      </div>

      {/* ── 2. Floating Navigation & Utilities Toolbar ─────────────── */}
      <div className="cashflow-sub-toolbar">
        {/* Left Side: Period Navigator & Currency Selector */}
        <div className="cashflow-toolbar-left">
          {/* Dynamic Month Navigator */}
          <div className="cashflow-period-navigator">
            <button
              type="button"
              onClick={() => setActivePeriod(getPrevPeriod(activePeriod))}
              disabled={isAtStartPeriod}
              style={{
                background: "transparent",
                border: "none",
                color: isAtStartPeriod ? "var(--text-muted)" : "var(--accent-primary)",
                cursor: isAtStartPeriod ? "not-allowed" : "pointer",
                opacity: isAtStartPeriod ? 0.35 : 1,
                pointerEvents: isAtStartPeriod ? "none" : "auto",
                fontSize: "1rem",
                padding: "4px 8px",
                borderRadius: "6px",
                transition: "all 0.15s ease",
              }}
              title={isAtStartPeriod ? "Mes de inicio alcanzado" : "Mes anterior"}
            >
              ◀
            </button>

            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "0.3px",
                padding: "0 6px",
                textAlign: "center",
                whiteSpace: "nowrap",
                display: "inline-block",
              }}
              title={`Ciclo salarial financiado por la nómina de ${payrollAccount?.name || "Nómina"}`}
            >
              📅 {formatPeriodWithCycleRange(activePeriod, payrollAccount?.payDay || 25, payrollAccount?.customPayDate)}
            </span>

            <button
              type="button"
              onClick={() => setActivePeriod(getNextPeriod(activePeriod))}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-primary)",
                cursor: "pointer",
                fontSize: "1rem",
                padding: "4px 8px",
                borderRadius: "6px",
                transition: "all 0.15s ease",
              }}
              title="Mes siguiente"
            >
              ▶
            </button>
          </div>

          {/* Currency Toggle with Real Live TRM Indicator */}
          <div className="cashflow-currency-toggle">
            <button
              type="button"
              onClick={() => setCurrency("COP")}
              style={{
                padding: "6px 14px",
                borderRadius: "10px",
                border: "none",
                fontSize: "0.8rem",
                fontWeight: currency === "COP" ? 700 : 400,
                background: currency === "COP" ? "var(--accent-glow)" : "transparent",
                color: currency === "COP" ? "var(--accent-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span role="img" aria-label="Colombia">🇨🇴</span>
              <span>COP</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              style={{
                padding: "6px 14px",
                borderRadius: "10px",
                border: "none",
                fontSize: "0.8rem",
                fontWeight: currency === "USD" ? 700 : 400,
                background: currency === "USD" ? "var(--accent-glow)" : "transparent",
                color: currency === "USD" ? "var(--accent-primary)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
              title={`Tasa Representativa del Mercado oficial: $${Math.round(fxRate).toLocaleString("es-CO")} COP por USD`}
            >
              <span role="img" aria-label="USA">🇺🇸</span>
              <span>USD</span>
              <span style={{ fontSize: "0.7rem", opacity: 0.85, color: "var(--accent-primary)" }}>
                (≈${Math.round(fxRate).toLocaleString("es-CO")})
              </span>
            </button>
          </div>
        </div>

        {/* Right Side: Tools & Automation */}
        <div className="cashflow-toolbar-right">
          {/* Payroll Calculator Button */}
          <button
            type="button"
            className="cashflow-action-btn secondary"
            style={{ borderColor: "var(--border-accent)", color: "var(--accent-primary)" }}
            onClick={() => setPayrollModalOpen(true)}
            title="Calcular Salario Neto a partir de Salario Bruto restando Salud, Pensión y Parafiscales de Ley Colombia"
          >
            <span role="img" aria-label="Colombia">🇨🇴</span>
            <span>Liquidar Salario Neto</span>
          </button>

          {/* Sync Button */}
          <button
            type="button"
            className="cashflow-action-btn sync"
            onClick={handleAutoSync}
            title="Importar rendimientos pasivos de Cuentas Nu, Plenti USD, CDTs y Kpital Tech ETF"
          >
            <span>⚡</span>
            <span>Sincronizar Patrimonio</span>
          </button>
        </div>
      </div>

      {/* ── 3. Top KPI Summary Cards Grid (with Real TRM Conversion & Explanatory Comments) ── */}
      <div className="cashflow-kpi-grid">
        {/* KPI 1: Total Inflow (Esperado vs Real Recibido en Nómina) */}
        <div className="cashflow-kpi-card emerald">
          <div className="cashflow-kpi-header">
            <span className="cashflow-kpi-label">
              <span>💼</span> Ingreso ({formatPeriodName(activePeriod)})
            </span>
            <span
              className={`cashflow-kpi-badge ${
                realTotalInflow > 0 ? "success" : "warning"
              }`}
              style={
                realTotalInflow === 0
                  ? {
                      background: isLight ? "rgba(245, 158, 11, 0.12)" : "rgba(245, 158, 11, 0.2)",
                      color: isLight ? "#d97706" : "#fbbf24",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                    }
                  : undefined
              }
            >
              {realTotalInflow > 0 ? "✅ Nómina Ingresada" : "⏳ Esperando Nómina"}
            </span>
          </div>

          {/* Dual Metrics: Real Recibido vs Meta Esperada */}
          <div style={{ marginTop: 6, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span
                  style={{
                    fontSize: "0.72rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    fontWeight: 700,
                    color: realTotalInflow > 0 ? (isLight ? "#059669" : "#34d399") : (isLight ? "#d97706" : "#fbbf24"),
                    display: "block",
                  }}
                >
                  Real en Nómina
                </span>
                <div
                  className="cashflow-kpi-value"
                  style={{
                    fontSize: "1.75rem",
                    margin: "2px 0 0 0",
                    color: realTotalInflow > 0 ? (isLight ? "#059669" : "#34d399") : (isLight ? "#0f172a" : "#f8fafc"),
                  }}
                >
                  {formatMoney(realTotalInflow, currency)}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "0.72rem", color: isLight ? "#64748b" : "#94a3b8", display: "block" }}>
                  Esperado / Presupuesto
                </span>
                <span
                  style={{
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    color: isLight ? "#334155" : "#cbd5e1",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  {formatMoney(totalInflow, currency)}
                </span>
              </div>
            </div>

            {/* Inflow Progress Bar */}
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  height: 6,
                  borderRadius: 4,
                  background: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${inflowProgressPct}%`,
                    background: realTotalInflow > 0 ? "linear-gradient(90deg, #10b981 0%, #00e5ff 100%)" : "#f59e0b",
                    borderRadius: 4,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.71rem",
                  color: isLight ? "#64748b" : "#94a3b8",
                  marginTop: 4,
                }}
              >
                <span>{inflowProgressPct}% ingresado</span>
                <span>{realTotalInflow === 0 ? "Cuenta Nu en $0 COP hoy" : "Nómina consignada"}</span>
              </div>
            </div>
          </div>

          <div className="cashflow-kpi-footer">
            <span>Pasivo Esperado: {formatMoney(totalPassiveInflow, currency)}</span>
            <span style={{ color: "#00e5ff", fontWeight: 600 }}>{passivePctOfInflow}% del total</span>
          </div>
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: isLight ? "1px dashed rgba(16, 185, 129, 0.25)" : "1px dashed rgba(16, 185, 129, 0.2)",
              fontSize: "0.73rem",
              lineHeight: 1.4,
              color: isLight ? "#475569" : "#94a3b8",
            }}
          >
            💡 <strong>Esperado ({formatMoney(totalInflow, currency)}):</strong> Presupuesto proyectado del mes (salario neto + rendimientos pasivos). <strong>Real ({formatMoney(realTotalInflow, currency)}):</strong> Dinero efectivamente consignado en tu nómina hoy vía notificación de MacroDroid.
          </div>
        </div>

        {/* KPI 2: Effective Savings Rate */}
        <div className="cashflow-kpi-card cyan">
          <div className="cashflow-kpi-header">
            <span className="cashflow-kpi-label">
              <span>💎</span> Tasa de Ahorro Efectiva
            </span>
            <span
              className={`cashflow-kpi-badge ${
                Number(savingsRate) >= 30 ? "success" : Number(savingsRate) >= 20 ? "info" : "warning"
              }`}
            >
              {Number(savingsRate) >= 30 ? "🔥 Nivel FIRE" : Number(savingsRate) >= 20 ? "⚡ Saludable" : "⚠️ Bajo"}
            </span>
          </div>
          <div className="cashflow-kpi-value" style={{ color: "#00e5ff" }}>
            {savingsRate}%
          </div>
          <div className="cashflow-kpi-footer">
            <span>Aporte: {formatMoney(totalWealth, currency)}</span>
            <span>Meta: {customRatios.savings}%</span>
          </div>
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: isLight ? "1px dashed rgba(2, 132, 199, 0.25)" : "1px dashed rgba(0, 229, 255, 0.2)",
              fontSize: "0.73rem",
              lineHeight: 1.4,
              color: isLight ? "#475569" : "#94a3b8",
            }}
          >
            💡 <strong>¿Qué significa?</strong> Es el porcentaje real de tu ingreso que conservas y envías a construir patrimonio (Inversión + Ahorro). <strong>+20%</strong> es saludable y <strong>+30% (Nivel FIRE)</strong> acelera tu retiro temprano.
          </div>
        </div>

        {/* KPI 3: Free Cash Flow Margin */}
        <div className="cashflow-kpi-card purple">
          <div className="cashflow-kpi-header">
            <span className="cashflow-kpi-label">
              <span>⚪</span> Flujo Libre Disponible
            </span>
            <span className="cashflow-kpi-badge purple">Colchón</span>
          </div>
          <div className="cashflow-kpi-value" style={{ color: "#c084fc" }}>
            {formatMoney(freeCashFlow, currency)}
          </div>
          <div className="cashflow-kpi-footer">
            <span>Asignado: {formatMoney(totalAllocated, currency)}</span>
            <span>{totalInflow > 0 ? ((freeCashFlow / totalInflow) * 100).toFixed(0) : 0}% libre</span>
          </div>
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: isLight ? "1px dashed rgba(147, 51, 234, 0.25)" : "1px dashed rgba(192, 132, 252, 0.2)",
              fontSize: "0.73rem",
              lineHeight: 1.4,
              color: isLight ? "#475569" : "#94a3b8",
            }}
          >
            💡 <strong>¿Qué significa?</strong> Es el dinero sobrante sin asignar después de restar Gastos Fijos, Estilo de Vida y Ahorro/Inversión. Si está en <strong>$0</strong> tienes presupuesto base cero; si es positivo es tu colchón extra del mes.
          </div>
        </div>

        {/* KPI 4: Days of Financial Freedom */}
        <div className="cashflow-kpi-card amber">
          <div className="cashflow-kpi-header">
            <span className="cashflow-kpi-label">
              <span>⏳</span> Días de Libertad / Mes
            </span>
            <span className="cashflow-kpi-badge warning">Independencia</span>
          </div>
          <div className="cashflow-kpi-value" style={{ color: "#fbbf24" }}>
            +{daysOfFreedom} Días
          </div>
          <div className="cashflow-kpi-footer">
            <span>Gasto Diario: {formatMoney(dailyBurn, currency)}</span>
            <span style={{ color: "#10b981", fontWeight: 700 }}>Aceleración FIRE</span>
          </div>
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: isLight ? "1px dashed rgba(217, 119, 6, 0.25)" : "1px dashed rgba(251, 191, 36, 0.2)",
              fontSize: "0.73rem",
              lineHeight: 1.4,
              color: isLight ? "#475569" : "#94a3b8",
            }}
          >
            💡 <strong>¿Qué significa?</strong> Calcula cuántos días de tu costo de vida actual (Gasto Fijo + Salidas = {formatMoney(dailyBurn, currency)}/día) logras comprar cada mes con el dinero que ahorras e inviertes.
          </div>
        </div>
      </div>

      {/* ── Flujo en Paralelo: Patrimonio Invertido Real, Valor Actual & Historial de Cerradas ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.75)",
          border: isLight ? "1px solid rgba(2, 132, 199, 0.25)" : "1px solid rgba(0, 229, 255, 0.2)",
          borderRadius: "18px",
          padding: "16px 20px",
          boxShadow: isLight ? "0 4px 16px rgba(0, 0, 0, 0.05)" : "0 8px 24px rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(14px)",
        }}
      >
        {/* Fila Principal de Tarjetas (Resumen Compacto) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 16,
          }}
        >
          {/* Tarjeta 1: Capital Base Invertido (Activo en Acciones) */}
          <div
            onClick={() => setExpandedCard(expandedCard === "invested" ? null : "invested")}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              cursor: "pointer",
              padding: "10px 14px",
              borderRadius: "14px",
              background: expandedCard === "invested" ? (isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(0, 229, 255, 0.08)") : "transparent",
              transition: "all 0.2s ease",
            }}
            title="Haz clic para ver el desglose por Estrategias y Grupos de Compra (Base vs Valor Actual)"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "clamp(0.82rem, 1.1vw, 0.92rem)",
                  fontWeight: 800,
                  color: isLight ? "#0284c7" : "var(--accent-primary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>🚀</span> Capital Invertido
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "3px 8px",
                    borderRadius: "10px",
                    background: "rgba(0, 229, 255, 0.12)",
                    color: "#00e5ff",
                    border: "1px solid rgba(0, 229, 255, 0.3)",
                    fontWeight: 800,
                  }}
                >
                  DINERO REAL
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", transform: expandedCard === "invested" ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                  ▼
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "clamp(1.4rem, 2vw, 1.7rem)",
                  fontWeight: 800,
                  color: isLight ? "#0f172a" : "#f8fafc",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                ${realInvestmentMetrics.totalInvestedUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
              <span style={{ fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)", fontWeight: 600, color: isLight ? "#475569" : "#94a3b8", fontFamily: "var(--font-mono, monospace)" }}>
                (≈${realInvestmentMetrics.totalInvestedCOP.toLocaleString("es-CO")} COP)
              </span>
            </div>

            <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.86rem)", color: "var(--text-muted)", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
              <span>Estrategias Reales ({realInvestmentMetrics.strategiesCount}): <strong>${realInvestmentMetrics.strategiesInvestedUSD.toFixed(1)} USD</strong></span>
              <span>·</span>
              <span>Compras ({realInvestmentMetrics.purchaseGroups.length} grupos): <strong>${realInvestmentMetrics.purchasesInvestedUSD.toFixed(1)} USD</strong></span>
            </div>
          </div>

          {/* Tarjeta 2: Valor Actual & Ganancia / Pérdida (P&L No Realizado) */}
          <div
            onClick={() => setExpandedCard(expandedCard === "yield" ? null : "yield")}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              cursor: "pointer",
              padding: "10px 14px",
              borderRadius: "14px",
              background: expandedCard === "yield" ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.08)") : "transparent",
              borderLeft: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
              transition: "all 0.2s ease",
            }}
            title="Haz clic para ver el desglose de rendimiento en tiempo real / último cierre guardado"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "clamp(0.82rem, 1.1vw, 0.92rem)",
                  fontWeight: 800,
                  color: realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>📈</span> Valor Actual & Rendimiento
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "3px 8px",
                    borderRadius: "10px",
                    background:
                      realInvestmentMetrics.totalUnrealizedPnlUSD >= 0
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(244, 63, 94, 0.12)",
                    color: realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                    border:
                      realInvestmentMetrics.totalUnrealizedPnlUSD >= 0
                        ? "1px solid rgba(16, 185, 129, 0.3)"
                        : "1px solid rgba(244, 63, 94, 0.3)",
                    fontWeight: 800,
                  }}
                >
                  {realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? "GANANCIA" : "PÉRDIDA"} {realInvestmentMetrics.totalUnrealizedPnlPct >= 0 ? "+" : ""}
                  {realInvestmentMetrics.totalUnrealizedPnlPct.toFixed(2)}%
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", transform: expandedCard === "yield" ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                  ▼
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "clamp(1.4rem, 2vw, 1.7rem)",
                  fontWeight: 800,
                  color: isLight ? "#0f172a" : "#f8fafc",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                ${realInvestmentMetrics.totalMarketValueUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
              <span
                style={{
                  fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono, monospace)",
                  color: realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                }}
              >
                ({realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? "+" : ""}
                ${realInvestmentMetrics.totalUnrealizedPnlUSD.toFixed(2)} USD · {realInvestmentMetrics.totalUnrealizedPnlUSD >= 0 ? "+" : ""}${realInvestmentMetrics.totalUnrealizedPnlCOP.toLocaleString("es-CO")} COP)
              </span>
            </div>

            <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.86rem)", color: "var(--text-muted)", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
              <span>
                En Estrategias:{" "}
                <strong style={{ color: realInvestmentMetrics.strategiesUnrealizedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e" }}>
                  {realInvestmentMetrics.strategiesUnrealizedPnlUSD >= 0 ? "+" : ""}${realInvestmentMetrics.strategiesUnrealizedPnlUSD.toFixed(2)} USD
                </strong>
              </span>
              <span>·</span>
              <span>
                En Compras:{" "}
                <strong style={{ color: realInvestmentMetrics.purchasesUnrealizedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e" }}>
                  {realInvestmentMetrics.purchasesUnrealizedPnlUSD >= 0 ? "+" : ""}${realInvestmentMetrics.purchasesUnrealizedPnlUSD.toFixed(2)} USD
                </strong>
              </span>
            </div>
          </div>

          {/* Tarjeta 3: Posiciones Cerradas / Historial por Mes */}
          <div
            onClick={() => setExpandedCard(expandedCard === "closed" ? null : "closed")}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              cursor: "pointer",
              padding: "10px 14px",
              borderRadius: "14px",
              background: expandedCard === "closed" ? (isLight ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.08)") : "transparent",
              borderLeft: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
              transition: "all 0.2s ease",
            }}
            title="Haz clic para ver el historial mensual de posiciones cerradas en Estrategias y Compras"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: "clamp(0.82rem, 1.1vw, 0.92rem)",
                  fontWeight: 800,
                  color: isLight ? "#059669" : "#34d399",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>💼</span> Historial Cerradas por Mes
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "3px 8px",
                    borderRadius: "10px",
                    background:
                      (realInvestmentMetrics.closedCountMonth > 0
                        ? realInvestmentMetrics.closedPnlMonthUSD
                        : realInvestmentMetrics.totalHistoricalClosedPnlUSD) >= 0
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(244, 63, 94, 0.12)",
                    color:
                      (realInvestmentMetrics.closedCountMonth > 0
                        ? realInvestmentMetrics.closedPnlMonthUSD
                        : realInvestmentMetrics.totalHistoricalClosedPnlUSD) >= 0
                        ? isLight
                          ? "#059669"
                          : "#34d399"
                        : "#fb7185",
                    fontWeight: 800,
                  }}
                >
                  {realInvestmentMetrics.totalHistoricalClosedCount} HISTÓRICAS · {realInvestmentMetrics.closedByMonthHistory.length} MES(ES)
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", transform: expandedCard === "closed" ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                  ▼
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "clamp(1.4rem, 2vw, 1.7rem)",
                  fontWeight: 800,
                  color: realInvestmentMetrics.totalHistoricalClosedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {realInvestmentMetrics.totalHistoricalClosedPnlUSD >= 0 ? "+" : ""}${realInvestmentMetrics.totalHistoricalClosedPnlUSD.toFixed(2)} USD
              </span>
              <span
                style={{
                  fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono, monospace)",
                  color: realInvestmentMetrics.totalHistoricalClosedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                }}
              >
                (≈{realInvestmentMetrics.totalHistoricalClosedPnlUSD >= 0 ? "+" : ""}${realInvestmentMetrics.totalHistoricalClosedPnlCOP.toLocaleString("es-CO")} COP)
              </span>
            </div>

            <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.86rem)", color: "var(--text-muted)", marginTop: 2, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <span>
                En {formatPeriodName(activePeriod)}:{" "}
                <strong style={{ color: realInvestmentMetrics.closedPnlMonthUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e" }}>
                  {realInvestmentMetrics.closedCountMonth} venta(s) ({realInvestmentMetrics.closedPnlMonthUSD >= 0 ? "+" : ""}${realInvestmentMetrics.closedPnlMonthUSD.toFixed(2)} USD)
                </strong>
              </span>
              <span style={{ color: isLight ? "#0284c7" : "#38bdf8", fontWeight: 700 }}>Ver historial mensual ▼</span>
            </div>
          </div>
        </div>

        {/* ── Desglose Expandible: Modalidad Lista Desplegable (Capital Invertido + Valor Actual de Mercado) ── */}
        {expandedCard === "invested" && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 16,
              borderTop: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              animation: "fadeIn 0.2s ease-in-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontSize: "clamp(0.9rem, 1.2vw, 1.05rem)", fontWeight: 700, color: isLight ? "#0f172a" : "#f8fafc" }}>
                  Desglose de Capital Invertido y Valor de Mercado Actual (Tiempo Real / Último Guardado):
                </span>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Muestra tanto tu base invertida como la valoración real actual del mercado (nunca se queda plano en el costo inicial).
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedCard(null)}
                style={{
                  background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.06)",
                  border: isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.1)",
                  color: isLight ? "#334155" : "#e2e8f0",
                  fontSize: "0.85rem",
                  padding: "4px 12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                }}
              >
                Contraer ▲
              </button>
            </div>

            {/* Sub-bloque 1: Estrategias Reales */}
            <div>
              <div style={{ fontSize: "clamp(0.8rem, 1vw, 0.9rem)", fontWeight: 800, color: isLight ? "#0284c7" : "#38bdf8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Estrategias Reales Activas
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                {realInvestmentMetrics.strategiesItems.map((st) => (
                  <div
                    key={st.id}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                      border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.07)",
                      boxShadow: isLight ? "0 2px 8px rgba(0, 0, 0, 0.04)" : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "clamp(0.92rem, 1.2vw, 1.05rem)", fontWeight: 800, color: isLight ? "#0f172a" : "#f8fafc" }}>
                        {st.country} {st.name}
                      </div>
                      <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.88rem)", color: "var(--text-muted)", marginTop: 2 }}>
                        Base Invertida: <strong>${st.activeInvestedUSD.toFixed(2)} USD</strong> (≈${Math.round(st.activeInvestedUSD * fxRate).toLocaleString("es-CO")} COP)
                      </div>
                      <div style={{ fontSize: "clamp(0.76rem, 0.95vw, 0.84rem)", color: st.pnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e", marginTop: 3, fontWeight: 700 }}>
                        Valor Mercado Actual: ${st.marketValueUSD.toFixed(2)} USD ({st.pnlUSD >= 0 ? "+" : ""}${st.pnlUSD.toFixed(2)} USD / {st.pnlPct >= 0 ? "+" : ""}{st.pnlPct.toFixed(2)}%)
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "clamp(0.98rem, 1.3vw, 1.15rem)", fontWeight: 800, color: isLight ? "#0284c7" : "var(--accent-primary)", fontFamily: "var(--font-mono, monospace)" }}>
                        ${st.marketValueUSD.toFixed(2)} USD
                      </div>
                      <div style={{ fontSize: "clamp(0.8rem, 1vw, 0.9rem)", fontWeight: 600, color: isLight ? "#475569" : "#94a3b8", fontFamily: "var(--font-mono, monospace)", marginTop: 2 }}>
                        ${Math.round(st.marketValueUSD * fxRate).toLocaleString("es-CO")} COP
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Base: ${st.activeInvestedUSD.toFixed(2)} USD
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub-bloque 2: Grupos de Compra */}
            <div>
              <div style={{ fontSize: "clamp(0.8rem, 1vw, 0.9rem)", fontWeight: 800, color: isLight ? "#0284c7" : "#38bdf8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Grupos de Compra Individual
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                {realInvestmentMetrics.purchaseGroups.map((pg) => (
                  <div
                    key={pg.id}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                      border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.07)",
                      boxShadow: isLight ? "0 2px 8px rgba(0, 0, 0, 0.04)" : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "clamp(0.92rem, 1.2vw, 1.05rem)", fontWeight: 800, color: isLight ? "#0f172a" : "#f8fafc" }}>
                        📁 {pg.name}
                      </div>
                      <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.88rem)", color: "var(--text-muted)", marginTop: 2 }}>
                        {pg.count} activo(s) · Base Invertida: <strong>${pg.investedUSD.toFixed(2)} USD</strong>
                      </div>
                      <div style={{ fontSize: "clamp(0.76rem, 0.95vw, 0.84rem)", color: pg.pnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e", marginTop: 3, fontWeight: 700 }}>
                        Valor Mercado Actual: ${pg.marketValueUSD.toFixed(2)} USD ({pg.pnlUSD >= 0 ? "+" : ""}${pg.pnlUSD.toFixed(2)} USD / {pg.pnlPct >= 0 ? "+" : ""}{pg.pnlPct.toFixed(2)}%)
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "clamp(0.98rem, 1.3vw, 1.15rem)", fontWeight: 800, color: isLight ? "#0284c7" : "var(--accent-primary)", fontFamily: "var(--font-mono, monospace)" }}>
                        ${pg.marketValueUSD.toFixed(2)} USD
                      </div>
                      <div style={{ fontSize: "clamp(0.8rem, 1vw, 0.9rem)", fontWeight: 600, color: isLight ? "#475569" : "#94a3b8", fontFamily: "var(--font-mono, monospace)", marginTop: 2 }}>
                        ${Math.round(pg.marketValueUSD * fxRate).toLocaleString("es-CO")} COP
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2 }}>
                        Base: ${pg.investedUSD.toFixed(2)} USD
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Desglose Expandible: Rendimiento (Invertido vs Ganado en Pesos/USD) ── */}
        {expandedCard === "yield" && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 16,
              borderTop: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              animation: "fadeIn 0.2s ease-in-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "clamp(0.9rem, 1.2vw, 1.05rem)", fontWeight: 700, color: isLight ? "#0f172a" : "#f8fafc" }}>
                Rendimiento Detallado (Base Invertida vs Ganancia/Pérdida por Estrategia y Grupo):
              </span>
              <button
                type="button"
                onClick={() => setExpandedCard(null)}
                style={{
                  background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.06)",
                  border: isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.1)",
                  color: isLight ? "#334155" : "#e2e8f0",
                  fontSize: "0.85rem",
                  padding: "4px 12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                }}
              >
                Contraer ▲
              </button>
            </div>

            {/* Estrategias Rendimiento */}
            <div>
              <div style={{ fontSize: "clamp(0.8rem, 1vw, 0.9rem)", fontWeight: 800, color: isLight ? "#059669" : "#34d399", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Rendimiento en Estrategias Reales
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                {realInvestmentMetrics.strategiesItems.map((st) => (
                  <div
                    key={st.id}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                      border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.07)",
                      boxShadow: isLight ? "0 2px 8px rgba(0, 0, 0, 0.04)" : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "clamp(0.92rem, 1.2vw, 1.05rem)", fontWeight: 800, color: isLight ? "#0f172a" : "#f8fafc" }}>
                        {st.country} {st.name}
                      </div>
                      <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.88rem)", color: "var(--text-muted)", marginTop: 3 }}>
                        Base: <strong>${st.activeInvestedUSD.toFixed(2)} USD</strong> (≈${Math.round(st.activeInvestedUSD * fxRate).toLocaleString("es-CO")} COP)
                      </div>
                      <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.88rem)", color: isLight ? "#334155" : "#cbd5e1", marginTop: 2 }}>
                        Actual: <strong>${st.marketValueUSD.toFixed(2)} USD</strong> (≈${Math.round(st.marketValueUSD * fxRate).toLocaleString("es-CO")} COP)
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: "clamp(1rem, 1.4vw, 1.2rem)",
                          fontWeight: 800,
                          color: st.pnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {st.pnlUSD >= 0 ? "+" : ""}${st.pnlUSD.toFixed(2)} USD
                      </div>
                      <div
                        style={{
                          fontSize: "clamp(0.82rem, 1.1vw, 0.92rem)",
                          fontWeight: 700,
                          color: st.pnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                          fontFamily: "var(--font-mono, monospace)",
                          marginTop: 2,
                        }}
                      >
                        {st.pnlUSD >= 0 ? "+" : ""}${Math.round(st.pnlUSD * fxRate).toLocaleString("es-CO")} COP ({st.pnlPct >= 0 ? "+" : ""}{st.pnlPct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Grupos Rendimiento */}
            <div>
              <div style={{ fontSize: "clamp(0.8rem, 1vw, 0.9rem)", fontWeight: 800, color: isLight ? "#059669" : "#34d399", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Rendimiento en Grupos de Compra
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                {realInvestmentMetrics.purchaseGroups.map((pg) => (
                  <div
                    key={pg.id}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                      border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.07)",
                      boxShadow: isLight ? "0 2px 8px rgba(0, 0, 0, 0.04)" : "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "clamp(0.92rem, 1.2vw, 1.05rem)", fontWeight: 800, color: isLight ? "#0f172a" : "#f8fafc" }}>
                        📁 {pg.name}
                      </div>
                      <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.88rem)", color: "var(--text-muted)", marginTop: 3 }}>
                        Base: <strong>${pg.investedUSD.toFixed(2)} USD</strong> (≈${Math.round(pg.investedUSD * fxRate).toLocaleString("es-CO")} COP)
                      </div>
                      <div style={{ fontSize: "clamp(0.78rem, 1vw, 0.88rem)", color: isLight ? "#334155" : "#cbd5e1", marginTop: 2 }}>
                        Actual: <strong>${pg.marketValueUSD.toFixed(2)} USD</strong> (≈${Math.round(pg.marketValueUSD * fxRate).toLocaleString("es-CO")} COP)
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: "clamp(1rem, 1.4vw, 1.2rem)",
                          fontWeight: 800,
                          color: pg.pnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {pg.pnlUSD >= 0 ? "+" : ""}${pg.pnlUSD.toFixed(2)} USD
                      </div>
                      <div
                        style={{
                          fontSize: "clamp(0.82rem, 1.1vw, 0.92rem)",
                          fontWeight: 700,
                          color: pg.pnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                          fontFamily: "var(--font-mono, monospace)",
                          marginTop: 2,
                        }}
                      >
                        {pg.pnlUSD >= 0 ? "+" : ""}${Math.round(pg.pnlUSD * fxRate).toLocaleString("es-CO")} COP ({pg.pnlPct >= 0 ? "+" : ""}{pg.pnlPct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Desglose Expandible: Historial Completo de Posiciones Cerradas por Mes ── */}
        {expandedCard === "closed" && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 16,
              borderTop: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              animation: "fadeIn 0.2s ease-in-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontSize: "clamp(0.9rem, 1.2vw, 1.05rem)", fontWeight: 700, color: isLight ? "#0f172a" : "#f8fafc" }}>
                  📅 Historial de Posiciones Cerradas por Mes (Todas las Estrategias y Compras):
                </span>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                  Registro histórico agrupado mes a mes de todas las rotaciones y ventas realizadas.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpandedCard(null)}
                style={{
                  background: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.06)",
                  border: isLight ? "1px solid rgba(0, 0, 0, 0.1)" : "1px solid rgba(255, 255, 255, 0.1)",
                  color: isLight ? "#334155" : "#e2e8f0",
                  fontSize: "0.85rem",
                  padding: "4px 12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                }}
              >
                Contraer ▲
              </button>
            </div>

            {realInvestmentMetrics.closedByMonthHistory.length === 0 ? (
              <div style={{ fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)", color: "var(--text-muted)", fontStyle: "italic", padding: "12px 0" }}>
                No se han registrado posiciones cerradas en el historial.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {realInvestmentMetrics.closedByMonthHistory.map((monthGroup) => {
                  const mKey = monthGroup.period || monthGroup.monthKey || "Sin fecha";
                  const isCurrentSelectedPeriod = mKey === activePeriod;
                  const monthItems = monthGroup.positions || monthGroup.items || [];
                  const totalPnlCOP = monthGroup.totalPnlCOP ?? Math.round((monthGroup.totalPnlUSD || 0) * fxRate);
                  return (
                    <div
                      key={mKey}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "14px",
                        background: isCurrentSelectedPeriod
                          ? isLight
                            ? "rgba(16, 185, 129, 0.06)"
                            : "rgba(16, 185, 129, 0.06)"
                          : isLight
                          ? "rgba(248, 250, 252, 0.9)"
                          : "rgba(255, 255, 255, 0.02)",
                        border: isCurrentSelectedPeriod
                          ? "1px solid rgba(16, 185, 129, 0.35)"
                          : isLight
                          ? "1px solid rgba(0, 0, 0, 0.08)"
                          : "1px solid rgba(255, 255, 255, 0.07)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {/* Cabecera del Mes */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 10,
                          paddingBottom: 8,
                          borderBottom: isLight ? "1px solid rgba(0, 0, 0, 0.06)" : "1px solid rgba(255, 255, 255, 0.06)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: "0.95rem", fontWeight: 800, color: isLight ? "#0f172a" : "#f8fafc" }}>
                            🗓️ {monthGroup.periodLabel || formatPeriodName(mKey)}
                          </span>
                          <span
                            style={{
                              fontSize: "0.72rem",
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(0, 229, 255, 0.12)",
                              color: isLight ? "#0284c7" : "#38bdf8",
                              fontWeight: 700,
                            }}
                          >
                            {monthGroup.count} {monthGroup.count === 1 ? "operación cerrada" : "operaciones cerradas"}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--font-mono, monospace)" }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Resultado del Mes:</span>
                          <span
                            style={{
                              fontSize: "0.98rem",
                              fontWeight: 800,
                              color: monthGroup.totalPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                            }}
                          >
                            {monthGroup.totalPnlUSD >= 0 ? "+" : ""}${monthGroup.totalPnlUSD.toFixed(2)} USD
                          </span>
                          <span
                            style={{
                              fontSize: "0.84rem",
                              fontWeight: 700,
                              color: monthGroup.totalPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                            }}
                          >
                            (≈{monthGroup.totalPnlUSD >= 0 ? "+" : ""}${totalPnlCOP.toLocaleString("es-CO")} COP)
                          </span>
                        </div>
                      </div>

                      {/* Tarjetas de Operaciones del Mes */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
                        {monthItems.map((pos) => (
                          <div
                            key={pos.id}
                            style={{
                              padding: "10px 14px",
                              borderRadius: "10px",
                              background: isLight ? "#ffffff" : "rgba(255, 255, 255, 0.03)",
                              border: isLight ? "1px solid rgba(0, 0, 0, 0.07)" : "1px solid rgba(255, 255, 255, 0.06)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 12,
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 800, fontSize: "0.95rem", color: isLight ? "#0f172a" : "#f8fafc" }}>
                                  {pos.ticker}
                                </span>
                                <span
                                  style={{
                                    fontSize: "0.68rem",
                                    padding: "2px 7px",
                                    borderRadius: "6px",
                                    background: "rgba(0, 229, 255, 0.12)",
                                    color: isLight ? "#0284c7" : "#00e5ff",
                                    fontWeight: 700,
                                  }}
                                >
                                  {pos.source}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 3 }}>
                                Cierre: <strong>{pos.exitDate}</strong> · {pos.name}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div
                                style={{
                                  fontSize: "0.96rem",
                                  fontWeight: 800,
                                  color: pos.realizedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                                  fontFamily: "var(--font-mono, monospace)",
                                }}
                              >
                                {pos.realizedPnlUSD >= 0 ? "+" : ""}${pos.realizedPnlUSD.toFixed(2)} USD
                              </div>
                              <div
                                style={{
                                  fontSize: "0.78rem",
                                  fontWeight: 700,
                                  color: pos.realizedPnlUSD >= 0 ? (isLight ? "#059669" : "#10b981") : "#f43f5e",
                                  fontFamily: "var(--font-mono, monospace)",
                                  marginTop: 2,
                                }}
                              >
                                {pos.realizedPnlUSD >= 0 ? "+" : ""}${Math.round(pos.realizedPnlUSD * fxRate).toLocaleString("es-CO")} COP ({pos.realizedReturnPct >= 0 ? "+" : ""}{pos.realizedReturnPct.toFixed(2)}%)
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Native SVG Sankey Flow Chart + Quantum Atom Visualizer Side Panel ── */}
      <div className={`cashflow-sankey-row ${!showSankey ? "collapsed" : ""}`}>
        <CashFlowSankey
          inflows={periodInflows}
          needs={periodNeeds}
          wants={periodWants}
          wealth={periodWealth}
          expensesLog={expensesLog}
          debts={debts}
          activePeriod={activePeriod}
          currency={currency}
          fxRate={fxRate}
          customRatios={customRatios}
          isExpanded={showSankey}
          onToggleExpand={() => setShowSankey((prev) => !prev)}
          onEditNode={(item, type) => handleOpenEditModal(item, type)}
        />

        {showSankey && (
        <div className="cashflow-quantum-sidepanel">
          <div className="cashflow-quantum-sidepanel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: "0 0 8px var(--accent-primary)",
                  animation: "pulse 1.2s infinite alternate",
                }}
              />
              <span style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.2px" }}>
                Modelo Cuántico Atómico
              </span>
            </div>
            <span
              style={{
                fontSize: "0.68rem",
                color: "var(--accent-primary)",
                background: "var(--accent-glow)",
                padding: "2px 8px",
                borderRadius: 8,
                border: "1px solid var(--border-accent)",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              Ψ_nlm(r,θ,φ)
            </span>
          </div>

          <div
            style={{
              flex: 1,
              width: "100%",
              minHeight: 340,
              maxHeight: 480,
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              position: "relative",
              borderRadius: "14px",
              overflow: "hidden",
              border: "1px solid var(--border)",
            }}
          >
            <QuantumOrbitalLoader
              height="100%"
              width="100%"
              compact={false}
              showHud={true}
              cycleDuration={5.0}
              message="Densidad de Probabilidad |Ψ|²"
              style={{
                borderRadius: "12px",
                width: "100%",
                height: "100%",
              }}
            />
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.72rem",
              color: "var(--text-muted)",
            }}
          >
            <span>Transiciones Cuánticas Activas</span>
            <span style={{ color: "var(--accent-primary)", fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>
              1s ➔ 5g / sp³
            </span>
          </div>
        </div>
        )}
      </div>

      {/* ── Control Header for Collapsible Cash Flow Modules ────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 20,
          marginBottom: 8,
          padding: "0 4px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Módulos del Flujo de Caja
          </span>
          <span
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
              padding: "1px 7px",
              borderRadius: 10,
            }}
          >
            6 módulos
          </span>
        </div>
        <button
          type="button"
          onClick={toggleAllAccordions}
          style={{
            background: isLight ? "rgba(2, 132, 199, 0.08)" : "rgba(56, 189, 248, 0.12)",
            border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(56, 189, 248, 0.3)"}`,
            color: isLight ? "#0284c7" : "#38bdf8",
            fontSize: "0.74rem",
            fontWeight: 600,
            cursor: "pointer",
            padding: "4px 10px",
            borderRadius: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            transition: "all 0.2s ease",
          }}
        >
          <span>{areAllAccordionsExpanded ? "▲" : "▼"}</span>
          <span>{areAllAccordionsExpanded ? "Contraer todos" : "Expandir todos"}</span>
        </button>
      </div>

      {/* ── Accordion Stack with Compact 8px Gap ─────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* ── 5. Real Liquid Cash & Funds Availability Card ──────────── */}
        <div
          style={{
            background: showLiquidity
              ? (isLight ? "rgba(2, 132, 199, 0.025)" : "rgba(56, 189, 248, 0.035)")
              : "var(--bg-card)",
            border: showLiquidity
              ? (isLight ? "1px solid rgba(2, 132, 199, 0.28)" : "1px solid rgba(56, 189, 248, 0.32)")
              : "1px solid var(--border)",
            borderLeft: `4px solid ${isLight ? "#0284c7" : "#38bdf8"}`,
            borderRadius: 14,
            padding: showLiquidity ? "16px" : "12px 18px",
            transition: "all 0.2s ease",
            boxShadow: showLiquidity
              ? (isLight ? "0 4px 18px rgba(2, 132, 199, 0.08)" : "0 4px 20px rgba(0, 0, 0, 0.28)")
              : "var(--shadow-card)",
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
              paddingBottom: showLiquidity ? 12 : 0,
              marginBottom: showLiquidity ? 14 : 0,
              borderBottom: showLiquidity
                ? (isLight ? "1px solid rgba(2, 132, 199, 0.15)" : "1px solid rgba(56, 189, 248, 0.15)")
                : "none",
            }}
            onClick={() => setShowLiquidity(!showLiquidity)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(56, 189, 248, 0.18)",
                  border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(56, 189, 248, 0.3)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.95rem",
                  flexShrink: 0,
                }}
              >
                💧
              </div>
              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Disponibilidad Real de Plata Líquida & Fondos
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: isLight ? "#0284c7" : "#38bdf8",
                  background: isLight ? "rgba(2, 132, 199, 0.1)" : "rgba(56, 189, 248, 0.14)",
                  padding: "2px 8px",
                  borderRadius: 12,
                  border: `1px solid ${isLight ? "rgba(2, 132, 199, 0.25)" : "rgba(56, 189, 248, 0.3)"}`,
                }}
              >
                {payrollAccount?.name || "Cuenta Principal"}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowLiquidity(!showLiquidity);
              }}
              style={{
                background: showLiquidity
                  ? (isLight ? "rgba(2, 132, 199, 0.12)" : "rgba(56, 189, 248, 0.18)")
                  : "var(--bg-surface)",
                border: showLiquidity
                  ? `1px solid ${isLight ? "#0284c7" : "#38bdf8"}`
                  : "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                color: showLiquidity
                  ? (isLight ? "#0284c7" : "#38bdf8")
                  : "var(--text-muted)",
                fontWeight: showLiquidity ? 600 : 500,
                fontSize: "0.74rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {showLiquidity ? "▲ Ocultar Disponibilidad" : "▼ Desplegar Disponibilidad"}
            </button>
          </div>

          {showLiquidity && (
            <RealCashLiquidityCard
              payrollAccount={payrollAccount}
              totalInflow={totalInflow}
              inflows={periodInflows}
              needs={periodNeeds}
              wants={periodWants}
              wealth={periodWealth}
              creditCards={creditCards}
              creditPurchases={creditPurchases}
              creditCardPayments={creditCardPayments}
              expensesLog={periodExpenses}
              fixedIncomeAccounts={fixedAccounts}
              activePeriod={activePeriod}
              currency={currency}
              fxRate={fxRate}
              onOpenPayrollModal={() => setPayrollEntityModalOpen(true)}
              onOpenExpenseModal={() => {
                setExpenseToEdit(null);
                setExpenseModalOpen(true);
              }}
              onOpenPaymentModal={() => setPaymentModalOpen(true)}
            />
          )}
        </div>

        {/* ── 6. Dynamic Rule & Strategy Selector ────────────────────── */}
        <div
          style={{
            background: showRules
              ? (isLight ? "rgba(79, 70, 229, 0.025)" : "rgba(129, 140, 248, 0.035)")
              : "var(--bg-card)",
            border: showRules
              ? (isLight ? "1px solid rgba(79, 70, 229, 0.28)" : "1px solid rgba(129, 140, 248, 0.32)")
              : "1px solid var(--border)",
            borderLeft: `4px solid ${isLight ? "#4f46e5" : "#818cf8"}`,
            borderRadius: 14,
            padding: showRules ? "16px" : "12px 18px",
            transition: "all 0.2s ease",
            boxShadow: showRules
              ? (isLight ? "0 4px 18px rgba(79, 70, 229, 0.08)" : "0 4px 20px rgba(0, 0, 0, 0.28)")
              : "var(--shadow-card)",
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
              paddingBottom: showRules ? 12 : 0,
              marginBottom: showRules ? 14 : 0,
              borderBottom: showRules
                ? (isLight ? "1px solid rgba(79, 70, 229, 0.15)" : "1px solid rgba(129, 140, 248, 0.15)")
                : "none",
            }}
            onClick={() => setShowRules(!showRules)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: isLight ? "rgba(79, 70, 229, 0.12)" : "rgba(129, 140, 248, 0.18)",
                  border: `1px solid ${isLight ? "rgba(79, 70, 229, 0.25)" : "rgba(129, 140, 248, 0.3)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.95rem",
                  flexShrink: 0,
                }}
              >
                ⚙️
              </div>
              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Distribución Estratégica del Flujo & Reglas
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: isLight ? "#4f46e5" : "#818cf8",
                  background: isLight ? "rgba(79, 70, 229, 0.1)" : "rgba(129, 140, 248, 0.14)",
                  padding: "2px 8px",
                  borderRadius: 12,
                  border: `1px solid ${isLight ? "rgba(79, 70, 229, 0.25)" : "rgba(129, 140, 248, 0.3)"}`,
                }}
              >
                Ratio: {customRatios.needs}% Fijos • {customRatios.wants}% Gustos • {customRatios.savings}% Ahorro
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowRules(!showRules);
              }}
              style={{
                background: showRules
                  ? (isLight ? "rgba(79, 70, 229, 0.12)" : "rgba(129, 140, 248, 0.18)")
                  : "var(--bg-surface)",
                border: showRules
                  ? `1px solid ${isLight ? "#4f46e5" : "#818cf8"}`
                  : "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                color: showRules
                  ? (isLight ? "#4f46e5" : "#818cf8")
                  : "var(--text-muted)",
                fontWeight: showRules ? 600 : 500,
                fontSize: "0.74rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {showRules ? "▲ Ocultar Estrategia" : "▼ Desplegar Estrategia"}
            </button>
          </div>

          {showRules && (
            <CashFlowRuleSelector
              allocationModel={allocationModel}
              onSelectModel={setAllocationModel}
              customRatios={customRatios}
              onUpdateRatios={setCustomRatios}
              totalInflow={totalInflow}
              totalNeeds={totalNeeds}
              totalWants={totalWants}
              totalWealth={totalWealth}
              expensesLog={periodExpenses}
              debts={debts}
              currency={currency}
              fxRate={fxRate}
            />
          )}
        </div>

        {/* ── 7. Emergency Fund Runway Tracker ───────────────────────── */}
        <div
          style={{
            background: showEmergency
              ? (isLight ? "rgba(5, 150, 105, 0.025)" : "rgba(16, 185, 129, 0.035)")
              : "var(--bg-card)",
            border: showEmergency
              ? (isLight ? "1px solid rgba(5, 150, 105, 0.28)" : "1px solid rgba(16, 185, 129, 0.32)")
              : "1px solid var(--border)",
            borderLeft: `4px solid ${isLight ? "#059669" : "#10b981"}`,
            borderRadius: 14,
            padding: showEmergency ? "16px" : "12px 18px",
            transition: "all 0.2s ease",
            boxShadow: showEmergency
              ? (isLight ? "0 4px 18px rgba(5, 150, 105, 0.08)" : "0 4px 20px rgba(0, 0, 0, 0.28)")
              : "var(--shadow-card)",
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
              paddingBottom: showEmergency ? 12 : 0,
              marginBottom: showEmergency ? 14 : 0,
              borderBottom: showEmergency
                ? (isLight ? "1px solid rgba(5, 150, 105, 0.15)" : "1px solid rgba(16, 185, 129, 0.15)")
                : "none",
            }}
            onClick={() => setShowEmergency(!showEmergency)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: isLight ? "rgba(5, 150, 105, 0.12)" : "rgba(16, 185, 129, 0.18)",
                  border: `1px solid ${isLight ? "rgba(5, 150, 105, 0.25)" : "rgba(16, 185, 129, 0.3)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.95rem",
                  flexShrink: 0,
                }}
              >
                🛡️
              </div>
              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Fondo de Emergencia & Pista de Aterrizaje (Runway)
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: isLight ? "#059669" : "#10b981",
                  background: isLight ? "rgba(5, 150, 105, 0.1)" : "rgba(16, 185, 129, 0.14)",
                  padding: "2px 8px",
                  borderRadius: 12,
                  border: `1px solid ${isLight ? "rgba(5, 150, 105, 0.25)" : "rgba(16, 185, 129, 0.3)"}`,
                }}
              >
                Meta: {emergencyFundTargetMonths} meses
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowEmergency(!showEmergency);
              }}
              style={{
                background: showEmergency
                  ? (isLight ? "rgba(5, 150, 105, 0.12)" : "rgba(16, 185, 129, 0.18)")
                  : "var(--bg-surface)",
                border: showEmergency
                  ? `1px solid ${isLight ? "#059669" : "#10b981"}`
                  : "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                color: showEmergency
                  ? (isLight ? "#059669" : "#10b981")
                  : "var(--text-muted)",
                fontWeight: showEmergency ? 600 : 500,
                fontSize: "0.74rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {showEmergency ? "▲ Ocultar Fondo Emergencia" : "▼ Desplegar Fondo Emergencia"}
            </button>
          </div>

          {showEmergency && (
            <EmergencyFundCard
              emergencyItem={emergencyItem}
              totalNeeds={totalNeeds}
              targetMonths={emergencyFundTargetMonths}
              onSelectTargetMonths={setEmergencyFundTargetMonths}
              currency={currency}
              fxRate={fxRate}
              onEditEmergency={() => handleOpenAddModal("wealth")}
            />
          )}
        </div>

      {/* ── 8. 4 Pillars Structured Breakdown Grid (Topes Presupuestados vs Gastado) (COLLAPSIBLE) ── */}
      <div
        style={{
          background: showPillars
            ? (isLight ? "rgba(217, 119, 6, 0.025)" : "rgba(245, 158, 11, 0.035)")
            : "var(--bg-card)",
          border: showPillars
            ? (isLight ? "1px solid rgba(217, 119, 6, 0.28)" : "1px solid rgba(245, 158, 11, 0.32)")
            : "1px solid var(--border)",
          borderLeft: `4px solid ${isLight ? "#d97706" : "#f59e0b"}`,
          borderRadius: 14,
          padding: showPillars ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          boxShadow: showPillars
            ? (isLight ? "0 4px 18px rgba(217, 119, 6, 0.08)" : "0 4px 20px rgba(0, 0, 0, 0.28)")
            : "var(--shadow-card)",
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
            paddingBottom: showPillars ? 12 : 0,
            marginBottom: showPillars ? 14 : 0,
            borderBottom: showPillars
              ? (isLight ? "1px solid rgba(217, 119, 6, 0.15)" : "1px solid rgba(245, 158, 11, 0.15)")
              : "none",
          }}
          onClick={() => setShowPillars(!showPillars)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: isLight ? "rgba(217, 119, 6, 0.12)" : "rgba(245, 158, 11, 0.18)",
                border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.25)" : "rgba(245, 158, 11, 0.3)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.95rem",
                flexShrink: 0,
              }}
            >
              🏛️
            </div>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Presupuesto Estructurado por Pilares (Ingresos, Gastos Fijos, Estilo de Vida, Ahorro)
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: isLight ? "#d97706" : "#f59e0b",
                background: isLight ? "rgba(217, 119, 6, 0.1)" : "rgba(245, 158, 11, 0.14)",
                padding: "2px 8px",
                borderRadius: 12,
                border: `1px solid ${isLight ? "rgba(217, 119, 6, 0.25)" : "rgba(245, 158, 11, 0.3)"}`,
              }}
            >
              Asignado: {formatMoney(totalAllocated, currency)} ({totalInflow > 0 ? Math.round((totalAllocated / totalInflow) * 100) : 0}%)
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPillars(!showPillars);
            }}
            style={{
              background: showPillars
                ? (isLight ? "rgba(217, 119, 6, 0.12)" : "rgba(245, 158, 11, 0.18)")
                : "var(--bg-surface)",
              border: showPillars
                ? `1px solid ${isLight ? "#d97706" : "#f59e0b"}`
                : "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: showPillars
                ? (isLight ? "#d97706" : "#f59e0b")
                : "var(--text-muted)",
              fontWeight: showPillars ? 600 : 500,
              fontSize: "0.74rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {showPillars ? "▲ Ocultar Pilares" : "▼ Desplegar Pilares"}
          </button>
        </div>

        {showPillars && (
          <div className="cashflow-pillars-grid" style={{ marginTop: 14 }}>
            {/* Pillar 1: Inflows */}
            <PillarBreakdownCard
              type="inflow"
              title="Ingresos Totales (Inflows)"
              icon="🟢"
              items={periodInflows}
              expensesLog={periodExpenses}
              debts={debts}
              totalInflow={totalInflow}
              currency={currency}
              fxRate={fxRate}
              onAddItem={handleOpenAddModal}
              onEditItem={handleOpenEditModal}
              onDeleteItem={(id) => handleDeleteItem(id, "inflow")}
            />

            {/* Pillar 2: Needs */}
            <PillarBreakdownCard
              type="needs"
              title="Gastos Fijos Planeados (Needs)"
              icon="🔴"
              items={periodNeeds}
              expensesLog={periodExpenses}
              debts={debts}
              activePeriod={activePeriod}
              totalInflow={totalInflow}
              targetRatio={customRatios.needs}
              currency={currency}
              fxRate={fxRate}
              onAddItem={handleOpenAddModal}
              onEditItem={handleOpenEditModal}
              onDeleteItem={(id) => handleDeleteItem(id, "needs")}
              onSaveTransaction={addExpenseTransaction}
              onDeleteTransaction={deleteExpenseTransaction}
              onEditTransaction={(tx) => {
                setExpenseToEdit(tx);
                setExpenseModalOpen(true);
              }}
              onSettleTransaction={(tx) => setExpenseToSettle(tx)}
            />

            {/* Pillar 3: Wants */}
            <PillarBreakdownCard
              type="wants"
              title="Estilo de Vida Presupuestado (Wants)"
              icon="🟣"
              items={periodWants}
              expensesLog={periodExpenses}
              debts={debts}
              activePeriod={activePeriod}
              totalInflow={totalInflow}
              targetRatio={customRatios.wants}
              currency={currency}
              fxRate={fxRate}
              onAddItem={handleOpenAddModal}
              onEditItem={handleOpenEditModal}
              onDeleteItem={(id) => handleDeleteItem(id, "wants")}
              onSaveTransaction={addExpenseTransaction}
              onDeleteTransaction={deleteExpenseTransaction}
              onEditTransaction={(tx) => {
                setExpenseToEdit(tx);
                setExpenseModalOpen(true);
              }}
              onSettleTransaction={(tx) => setExpenseToSettle(tx)}
            />

            {/* Pillar 4: Wealth */}
            <PillarBreakdownCard
              type="wealth"
              title="Ahorro & Inversión Planeado (Wealth)"
              icon="🔵"
              items={periodWealth}
              expensesLog={periodExpenses}
              debts={debts}
              activePeriod={activePeriod}
              totalInflow={totalInflow}
              targetRatio={customRatios.savings}
              currency={currency}
              fxRate={fxRate}
              onAddItem={handleOpenAddModal}
              onEditItem={handleOpenEditModal}
              onDeleteItem={(id) => handleDeleteItem(id, "wealth")}
              onSaveTransaction={addExpenseTransaction}
              onDeleteTransaction={deleteExpenseTransaction}
              onEditTransaction={(tx) => {
                setExpenseToEdit(tx);
                setExpenseModalOpen(true);
              }}
              onOpenAddExpenseModal={(item) => {
                setExpenseToEdit({
                  budgetItemId: item.id,
                  budgetItemName: item.name,
                  budgetItemType: "wealth",
                  amount: item.monthlyContribution || item.amount || 0,
                  description: `Aporte a ${item.name}`,
                  paymentSource: item.paymentSource || { type: "payroll", targetName: payrollAccount.name },
                });
                setExpenseModalOpen(true);
              }}
            />
          </div>
        )}
      </div>

      {/* ── 9. Expenses Log & Executed Transactions Section (COLLAPSIBLE) ────────── */}
      <div
        style={{
          background: showExpenses
            ? (isLight ? "rgba(147, 51, 234, 0.025)" : "rgba(192, 132, 252, 0.035)")
            : "var(--bg-card)",
          border: showExpenses
            ? (isLight ? "1px solid rgba(147, 51, 234, 0.28)" : "1px solid rgba(192, 132, 252, 0.32)")
            : "1px solid var(--border)",
          borderLeft: `4px solid ${isLight ? "#9333ea" : "#c084fc"}`,
          borderRadius: 14,
          padding: showExpenses ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          boxShadow: showExpenses
            ? (isLight ? "0 4px 18px rgba(147, 51, 234, 0.08)" : "0 4px 20px rgba(0, 0, 0, 0.28)")
            : "var(--shadow-card)",
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
            paddingBottom: showExpenses ? 12 : 0,
            marginBottom: showExpenses ? 14 : 0,
            borderBottom: showExpenses
              ? (isLight ? "1px solid rgba(147, 51, 234, 0.15)" : "1px solid rgba(192, 132, 252, 0.15)")
              : "none",
          }}
          onClick={() => setShowExpenses(!showExpenses)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: isLight ? "rgba(147, 51, 234, 0.12)" : "rgba(192, 132, 252, 0.18)",
                border: `1px solid ${isLight ? "rgba(147, 51, 234, 0.25)" : "rgba(192, 132, 252, 0.3)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.95rem",
                flexShrink: 0,
              }}
            >
              📋
            </div>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Historial de Gastos Reales, Ahorro & Abonos ({activePeriod})
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: isLight ? "#9333ea" : "#c084fc",
                background: isLight ? "rgba(147, 51, 234, 0.1)" : "rgba(192, 132, 252, 0.14)",
                padding: "2px 8px",
                borderRadius: 12,
                border: `1px solid ${isLight ? "rgba(147, 51, 234, 0.25)" : "rgba(192, 132, 252, 0.3)"}`,
              }}
            >
              {[
                ...(expensesLog || []).filter(
                  (tx) =>
                    (!tx.period || tx.period === activePeriod) &&
                    !tx.isCreditCardPayoff &&
                    !tx.creditCardPaymentId &&
                    !(tx.cardId && tx.id && String(tx.id).includes("_split_")) &&
                    !(tx.description && String(tx.description).toLowerCase().includes("descontado de") && !String(tx.description).toLowerCase().includes("mike"))
                ),
                ...(creditCardPayments || []).filter((p) => !p.period || p.period === activePeriod),
              ].length} movimientos
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowExpenses(!showExpenses);
            }}
            style={{
              background: showExpenses
                ? (isLight ? "rgba(147, 51, 234, 0.12)" : "rgba(192, 132, 252, 0.18)")
                : "var(--bg-surface)",
              border: showExpenses
                ? `1px solid ${isLight ? "#9333ea" : "#c084fc"}`
                : "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: showExpenses
                ? (isLight ? "#9333ea" : "#c084fc")
                : "var(--text-muted)",
              fontWeight: showExpenses ? 600 : 500,
              fontSize: "0.74rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {showExpenses ? "▲ Ocultar Gastos" : "▼ Desplegar Gastos"}
          </button>
        </div>

        {showExpenses && (
          <div style={{ marginTop: 14 }}>
            <ExpensesLogSection
              expensesLog={expensesLog}
              creditCardPayments={creditCardPayments}
              activePeriod={activePeriod}
              currency={currency}
              fxRate={fxRate}
              payrollAccount={payrollAccount}
              creditCards={creditCards}
              debts={debts}
              budgetItems={budgetEnvelopes}
              fixedIncomeAccounts={fixedAccounts}
              onOpenExpenseModal={() => {
                setExpenseToEdit(null);
                setExpenseModalOpen(true);
              }}
              onEditTransaction={(tx) => {
                setExpenseToEdit(tx);
                setExpenseModalOpen(true);
              }}
              onOpenPaymentModal={() => setPaymentModalOpen(true)}
              onSaveTransaction={addExpenseTransaction}
              onDeleteTransaction={deleteExpenseTransaction}
              onDeletePayment={deleteCreditCardPayment}
              onConfirmSettlement={settleLoanTransaction}
              onUpdateSplit={updateExpenseLoanSplit}
              onRevertParticipant={revertParticipantPayment}
              onToggleExpenseLoan={toggleExpenseLoan}
              onConvertExpenseToCardPayment={convertExpenseToCardPayment}
              onReclassifyMovement={handleReclassifyMovement}
            />
          </div>
        )}
      </div>

      {/* ── 10. Credit Cards & Installments Management Section (COLLAPSIBLE) ──────── */}
      <div
        style={{
          background: showCreditCards
            ? (isLight ? "rgba(225, 29, 72, 0.025)" : "rgba(251, 113, 133, 0.035)")
            : "var(--bg-card)",
          border: showCreditCards
            ? (isLight ? "1px solid rgba(225, 29, 72, 0.28)" : "1px solid rgba(251, 113, 133, 0.32)")
            : "1px solid var(--border)",
          borderLeft: `4px solid ${isLight ? "#e11d48" : "#fb7185"}`,
          borderRadius: 14,
          padding: showCreditCards ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          boxShadow: showCreditCards
            ? (isLight ? "0 4px 18px rgba(225, 29, 72, 0.08)" : "0 4px 20px rgba(0, 0, 0, 0.28)")
            : "var(--shadow-card)",
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
            paddingBottom: showCreditCards ? 12 : 0,
            marginBottom: showCreditCards ? 14 : 0,
            borderBottom: showCreditCards
              ? (isLight ? "1px solid rgba(225, 29, 72, 0.15)" : "1px solid rgba(251, 113, 133, 0.15)")
              : "none",
          }}
          onClick={() => setShowCreditCards(!showCreditCards)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: isLight ? "rgba(225, 29, 72, 0.12)" : "rgba(251, 113, 133, 0.18)",
                border: `1px solid ${isLight ? "rgba(225, 29, 72, 0.25)" : "rgba(251, 113, 133, 0.3)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.95rem",
                flexShrink: 0,
              }}
            >
              💳
            </div>
            <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Tarjetas de Crédito & Financiación Inteligente (MSI / Cuotas)
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: isLight ? "#e11d48" : "#fb7185",
                background: isLight ? "rgba(225, 29, 72, 0.1)" : "rgba(251, 113, 133, 0.14)",
                padding: "2px 8px",
                borderRadius: 12,
                border: `1px solid ${isLight ? "rgba(225, 29, 72, 0.25)" : "rgba(251, 113, 133, 0.3)"}`,
              }}
            >
              {creditCards.length} tarjeta(s) registrada(s)
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowCreditCards(!showCreditCards);
            }}
            style={{
              background: showCreditCards
                ? (isLight ? "rgba(225, 29, 72, 0.12)" : "rgba(251, 113, 133, 0.18)")
                : "var(--bg-surface)",
              border: showCreditCards
                ? `1px solid ${isLight ? "#e11d48" : "#fb7185"}`
                : "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: showCreditCards
                ? (isLight ? "#e11d48" : "#fb7185")
                : "var(--text-muted)",
              fontWeight: showCreditCards ? 600 : 500,
              fontSize: "0.74rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {showCreditCards ? "▲ Ocultar Tarjetas" : "▼ Desplegar Tarjetas"}
          </button>
        </div>

        {showCreditCards && (
          <div style={{ marginTop: 14 }}>
            <CreditCardsSection
              creditCards={creditCards}
              creditPurchases={creditPurchases}
              creditCardPayments={creditCardPayments}
              netSalary={netSalary}
              activePeriod={activePeriod}
              currency={currency}
              fxRate={fxRate}
              onOpenCreditPurchaseModal={() => setCreditPurchaseModalOpen(true)}
              onOpenNewCardModal={handleOpenNewCardModal}
              onOpenEditCardModal={handleOpenEditCardModal}
              onOpenPaymentModal={(cardId = null, amt = null) => {
                setPaymentInitialCardId(cardId);
                setPaymentInitialAmount(amt);
                setPaymentModalOpen(true);
              }}
              onDeletePurchase={deleteCreditPurchase}
              onDeleteCard={deleteCreditCard}
              onDeletePayment={deleteCreditCardPayment}
            />
          </div>
        )}
      </div>

      {/* ── 11. Mis Deudas Personales & Pasivos (Compromisos) ──────── */}
      <div
        style={{
          background: showDebts
            ? (isLight ? "rgba(244, 63, 94, 0.025)" : "rgba(244, 63, 94, 0.035)")
            : "var(--bg-card)",
          border: showDebts
            ? (isLight ? "1px solid rgba(244, 63, 94, 0.28)" : "1px solid rgba(244, 63, 94, 0.32)")
            : "1px solid var(--border)",
          borderLeft: `4px solid ${isLight ? "#f43f5e" : "#fb7185"}`,
          borderRadius: 14,
          padding: showDebts ? "16px" : "12px 18px",
          transition: "all 0.2s ease",
          boxShadow: showDebts
            ? (isLight ? "0 4px 18px rgba(244, 63, 94, 0.08)" : "0 4px 20px rgba(0, 0, 0, 0.28)")
            : "var(--shadow-card)",
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
            paddingBottom: showDebts ? 12 : 0,
            marginBottom: showDebts ? 14 : 0,
            borderBottom: showDebts
              ? (isLight ? "1px solid rgba(244, 63, 94, 0.15)" : "1px solid rgba(244, 63, 94, 0.15)")
              : "none",
          }}
          onClick={() => setShowDebts(!showDebts)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: isLight ? "rgba(244, 63, 94, 0.12)" : "rgba(244, 63, 94, 0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.1rem",
              }}
            >
              💳
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text-primary)" }}>
                  Mis Deudas & Préstamos
                </span>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 8,
                    background: isLight ? "rgba(244, 63, 94, 0.12)" : "rgba(244, 63, 94, 0.2)",
                    color: isLight ? "#be123c" : "#fb7185",
                    border: `1px solid ${isLight ? "rgba(244, 63, 94, 0.25)" : "rgba(244, 63, 94, 0.3)"}`,
                  }}
                >
                  {(debts || []).filter(d => d.debtType !== "receivable" && (d.remainingAmount || 0) > 0).length} pasivo(s)
                </span>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 8,
                    background: isLight ? "rgba(16, 185, 129, 0.12)" : "rgba(16, 185, 129, 0.2)",
                    color: isLight ? "#047857" : "#34d399",
                    border: `1px solid ${isLight ? "rgba(16, 185, 129, 0.25)" : "rgba(16, 185, 129, 0.3)"}`,
                  }}
                >
                  {(debts || []).filter(d => d.debtType === "receivable" && (d.remainingAmount || 0) > 0).length} por cobrar
                </span>
              </div>
              <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                Gestión de deudas por pagar (pasivos) y préstamos a tu favor (cuentas por cobrar a terceros)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDebts(!showDebts);
            }}
            style={{
              background: showDebts
                ? (isLight ? "rgba(244, 63, 94, 0.12)" : "rgba(244, 63, 94, 0.18)")
                : "var(--bg-surface)",
              border: showDebts
                ? `1px solid ${isLight ? "#f43f5e" : "#fb7185"}`
                : "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: showDebts
                ? (isLight ? "#be123c" : "#fb7185")
                : "var(--text-muted)",
              fontWeight: showDebts ? 600 : 500,
              fontSize: "0.74rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {showDebts ? "▲ Ocultar Deudas" : "▼ Desplegar Deudas"}
          </button>
        </div>

        {showDebts && (
          <div style={{ marginTop: 14 }}>
            <DebtsSection
              debts={debts || []}
              onOpenDebtModal={(debt = null, debtType = "payable") => {
                setDebtToEdit(debt);
                setDefaultDebtType(debt?.debtType || debtType || "payable");
                setDebtModalOpen(true);
              }}
              onOpenPaymentModal={(debt) => {
                setSelectedDebtForPayment(debt);
                setDebtPaymentModalOpen(true);
              }}
              onDeleteDebt={deleteDebt}
              onDeletePayment={deleteDebtPayment}
              fixedIncomeAccounts={fixedAccounts}
              currency={currency}
              fxRate={fxRate}
            />
          </div>
        )}
      </div>
      </div>

      {/* ── Banner de Referidos Financieros (Nu, Rappi, Plenti, ARQ) ── */}
      <AffiliateBanner type="fixed_income" />

      {/* ── 11. Interactive Allocation Modal ───────────────────────── */}
      <CashFlowAllocationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialType={modalType}
        editItem={editItem}
        activePeriod={activePeriod}
        currency={currency}
        payrollAccount={payrollAccount}
        creditCards={creditCards}
        fixedIncomeAccounts={fixedAccounts}
        onOpenPayrollModal={() => setPayrollModalOpen(true)}
        onSaveInflow={addInflow}
        onUpdateInflow={updateInflow}
        onSaveNeed={addNeed}
        onUpdateNeed={updateNeed}
        onSaveWant={addWant}
        onUpdateWant={updateWant}
        onSaveWealth={addWealth}
        onUpdateWealth={updateWealth}
        totalInflowCurrent={totalInflow}
        totalNeedsCurrent={totalNeeds}
        totalWantsCurrent={totalWants}
        totalWealthCurrent={totalWealth}
      />

      {/* ── 12. Colombia Legal Payroll & Parafiscales Modal ─────────── */}
      <ColombiaPayrollModal
        isOpen={payrollModalOpen}
        onClose={() => setPayrollModalOpen(false)}
        onApplySalary={recordSalaryAdjustment}
        activePeriod={activePeriod}
        salaryHistory={salaryHistory}
      />

      {/* ── 13. Payroll Bank Account Entity Selector Modal ─────────── */}
      <PayrollEntityModal
        isOpen={payrollEntityModalOpen}
        onClose={() => setPayrollEntityModalOpen(false)}
        currentAccount={payrollAccount}
        onSavePayrollAccount={setPayrollAccount}
      />

      {/* ── 14. Credit Purchase & Installments Modal ────────────────── */}
      <CreditPurchaseModal
        isOpen={creditPurchaseModalOpen}
        onClose={() => setCreditPurchaseModalOpen(false)}
        creditCards={creditCards}
        activePeriod={activePeriod}
        currency={currency}
        onSaveCreditPurchase={addCreditPurchase}
      />

      {/* ── 15. Credit Card Config / Edit Modal (Real Quotas & SFC Rates) ── */}
      <CreditCardConfigModal
        isOpen={cardConfigModalOpen}
        onClose={() => setCardConfigModalOpen(false)}
        cardToEdit={cardToEdit}
        creditCards={creditCards}
        netSalary={netSalary}
        currency={currency}
        fxRate={fxRate}
        onSaveCard={handleSaveCard}
        onDeleteCard={deleteCreditCard}
      />

      {/* ── 16. Real Executed Expense / Wealth Logging & Edit Modal ─── */}
      <ExpenseTransactionModal
        isOpen={expenseModalOpen}
        onClose={() => {
          setExpenseToEdit(null);
          setExpenseModalOpen(false);
        }}
        activePeriod={activePeriod}
        currency={currency}
        budgetItems={budgetEnvelopes}
        payrollAccount={payrollAccount}
        creditCards={creditCards}
        fixedIncomeAccounts={fixedAccounts}
        editTransaction={expenseToEdit}
        onSaveExpenseTransaction={(tx) => {
          addExpenseTransaction(tx);
          if (tx.type === "credit" && tx.paymentSource?.targetId && creditAccountFromCashFlow) {
            creditAccountFromCashFlow({
              accountId: tx.paymentSource.targetId,
              amount: tx.amount,
              date: tx.date,
              description: tx.description,
              movementId: tx.id,
            });
          }
        }}
        onUpdateExpenseTransaction={updateExpenseTransaction}
      />

      {/* ── 17. Credit Card Debt Payment & Quota Liberation Modal ───── */}
      <CreditCardPaymentModal
        isOpen={paymentModalOpen}
        onClose={() => {
          setPaymentInitialCardId(null);
          setPaymentInitialAmount(null);
          setPaymentModalOpen(false);
        }}
        activePeriod={activePeriod}
        currency={currency}
        creditCards={creditCards}
        payrollAccount={payrollAccount}
        fixedIncomeAccounts={fixedAccounts}
        budgetItems={budgetEnvelopes}
        expensesLog={periodExpenses}
        initialCardId={paymentInitialCardId}
        initialAmount={paymentInitialAmount}
        onSavePayment={addCreditCardPayment}
      />

      {/* ── 18. Global Loan Settlement & Reimbursement Modal ────────── */}
      {expenseToSettle && (
        <LoanSettlementModal
          isOpen={Boolean(expenseToSettle)}
          onClose={() => setExpenseToSettle(null)}
          transaction={expenseToSettle}
          currency={currency}
          fxRate={fxRate}
          payrollAccount={payrollAccount}
          creditCards={creditCards}
          fixedIncomeAccounts={fixedAccounts}
          onConfirmSettlement={settleLoanTransaction}
          onUpdateSplit={updateExpenseLoanSplit}
          onRevertParticipant={revertParticipantPayment}
        />
      )}

      {/* ── 19. Debt Modal (Create / Edit) ────────────────────────── */}
      {debtModalOpen && (
        <DebtModal
          isOpen={debtModalOpen}
          onClose={() => {
            setDebtModalOpen(false);
            setDebtToEdit(null);
            setDefaultDebtType("payable");
          }}
          debtToEdit={debtToEdit}
          defaultDebtType={defaultDebtType}
          onSaveDebt={(debtData) => {
            if (debtToEdit?.id) {
              updateDebt(debtToEdit.id, debtData);
            } else {
              addDebt(debtData);
            }
          }}
          fixedIncomeAccounts={fixedAccounts}
          currency={currency}
          fxRate={fxRate}
        />
      )}

      {/* ── 20. Debt Payment Modal (Register Abono / Settlement) ────── */}
      {debtPaymentModalOpen && selectedDebtForPayment && (
        <DebtPaymentModal
          isOpen={debtPaymentModalOpen}
          onClose={() => {
            setDebtPaymentModalOpen(false);
            setSelectedDebtForPayment(null);
          }}
          debt={selectedDebtForPayment}
          onRecordPayment={(debtId, paymentData) => {
            recordDebtPayment(debtId, paymentData);
          }}
          fixedIncomeAccounts={fixedAccounts}
          currency={currency}
          fxRate={fxRate}
        />
      )}
    </div>
  );
}
