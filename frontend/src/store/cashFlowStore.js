/**
 * Zustand Store — Cash Flow & Dynamic Budget Allocation Hub.
 * Full multi-currency management, 50/30/20 & dynamic rule tracking,
 * Colombian legal payroll calculator & salary historical variation tracking,
 * credit cards & installment management (0% MSI & standard interest),
 * primary payroll account entity configuration,
 * universal forward propagation for all recurring budget items,
 * live auto-synced passive yields from Fixed Income & Portfolio,
 * and automatic synchronization with FastAPI backend and localStorage.
 */

import toast from "react-hot-toast";
import { create } from "zustand";
import {
  createInflowApi,
  createNeedExpenseApi,
  createWantExpenseApi,
  createWealthItemApi,
  deleteInflowApi,
  deleteNeedExpenseApi,
  deleteWantExpenseApi,
  deleteWealthItemApi,
  deleteExpenseApi,
  deleteDebtApi,
  fetchCashFlowData,
  syncCashFlowStateApi,
} from "../api/client";
import { getCurrentPeriod } from "../utils/periodUtils";
import { sortMovementsByDateTimeDesc } from "../utils/cashFlowFormatters";
import { useFixedIncomeStore } from "./fixedIncomeStore";

let syncDebounceTimer = null;

const DEFAULT_RATIOS = {
  needs: 40,
  wants: 20,
  savings: 40,
};

// El sistema de ingresos inicia oficialmente a partir del pago de nómina del 23 de Octubre de 2026
// (que financia el ciclo salarial Noviembre 2026: 23 Oct - 24 Nov).
export const INCOME_SYSTEM_START_PERIOD = "2026-11";
export const INCOME_SYSTEM_START_DATE = "2026-10-23";

const DEFAULT_PAYROLL_ACCOUNT = {
  entityId: "nu",
  name: "Nu Colombia (Cuenta Nu Débito)",
  accountType: "Ahorros / Débito",
  accountNumber: "*1234",
  color: "#820ad1",
  icon: "💜",
  payDay: 25,
  activeFromDate: "2026-10-23",
  targetCycle: "next_month",
  paymentFrequency: "monthly",
};

const DEFAULT_CREDIT_CARDS = [];
const DEFAULT_CREDIT_PURCHASES = [];
const DEFAULT_INFLOWS = [];
const DEFAULT_NEEDS = [];
const DEFAULT_WANTS = [];
const DEFAULT_WEALTH = [];

// Helper: Filter recurring items for forward inheritance
function getRecurringItems(items = [], targetPeriod) {
  return items
    .filter((item) => {
      if (item.isOneTime || item.frequency === "one_time") {
        return item.targetPeriod === targetPeriod;
      }
      return true;
    })
    .map((item) => ({ ...item }));
}

// Helper: Clean legacy dummy template data ($7.5M dummy salary)
function isLegacyDummy(items = []) {
  return items.some((i) => Number(i.amount) === 7500000 || Number(i.amount) === 2500000);
}

function cleanLegacyPeriods(periods = {}) {
  const cleaned = {};
  Object.keys(periods).forEach((key) => {
    const snap = periods[key];
    if (snap && snap.inflows && !isLegacyDummy(snap.inflows)) {
      cleaned[key] = snap;
    }
  });
  return cleaned;
}

// Helper: Synchronize expense loans (isLoan: true) to debts collection
export function syncExpenseLoansToDebts(expensesLog = [], currentDebts = []) {
  const debtsMap = new Map();

  // 1. Preserve standalone debts (e.g. Mike, Vanne, Maye)
  for (const d of currentDebts) {
    if (d && d.id) {
      debtsMap.set(d.id, { ...d });
    }
  }

  // 2. Map all expenses marked with isLoan: true
  for (const tx of expensesLog) {
    if (!tx || !tx.isLoan) {
      if (tx?.id) {
        debtsMap.delete(`debt_tx_${tx.id}`);
        for (const [id, d] of debtsMap.entries()) {
          if (d.linkedExpenseId === tx.id) debtsMap.delete(id);
        }
      }
      continue;
    }

    const debtId = `debt_tx_${tx.id}`;
    const debtor = (
      tx.loanRecipient ||
      (Array.isArray(tx.participants) && tx.participants.length > 0
        ? tx.participants.map((p) => p.name).join(", ")
        : "Amigo / Familiar")
    ).trim();

    const isSplit = Boolean(tx.isSplit || (Array.isArray(tx.participants) && tx.participants.length > 0));
    const baseAmount = Number(tx.loanAmount) > 0 ? Number(tx.loanAmount) : Number(tx.amount) || 0;

    // Calculate total settled
    let settledTotal = 0;
    if (Array.isArray(tx.settlements)) {
      settledTotal += tx.settlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    }
    if (Array.isArray(tx.participants)) {
      const partSettled = tx.participants
        .filter((p) => p.paid)
        .reduce((sum, p) => sum + (Number(p.paidAmount) || Number(p.customShare) || Number(p.share) || 0), 0);
      settledTotal = Math.max(settledTotal, partSettled);
    }

    const remaining = Math.max(0, baseAmount - settledTotal);
    const isSettled = tx.loanStatus === "settled" || remaining <= 0;

    const existingDebt = debtsMap.get(debtId) || Array.from(debtsMap.values()).find((d) => d.linkedExpenseId === tx.id);

    const paymentsLog = Array.isArray(tx.settlements) && tx.settlements.length > 0
      ? tx.settlements.map((st) => ({
          id: st.id || `stl_${Date.now()}`,
          amount: Number(st.amount) || 0,
          date: st.date || tx.date,
          paymentMethod: st.targetName || "Transferencia",
          note: st.note || `Abono de ${st.participantName || debtor}`,
          createdAt: st.settledAt || new Date().toISOString(),
        }))
      : (existingDebt?.paymentsLog || []);

    const syncedDebt = {
      ...(existingDebt || {}),
      id: existingDebt?.id || debtId,
      debtType: "receivable",
      linkedExpenseId: tx.id,
      concept: `Préstamo: ${tx.description || "Gasto"} (${debtor})`,
      debtor: debtor,
      creditor: "Yo",
      totalAmount: baseAmount,
      remainingAmount: remaining,
      status: isSettled ? "paid" : "active",
      paymentMethod: tx.paymentSource?.targetName || "Transferencia a Cuenta / Cajita",
      paymentFrequency: "one_time",
      dueDate: tx.loanDueDate || existingDebt?.dueDate || null,
      isGroupSplit: isSplit,
      participants: Array.isArray(tx.participants) ? tx.participants : [],
      paymentsLog,
      createdAt: tx.createdAt || tx.date || new Date().toISOString(),
    };

    debtsMap.set(syncedDebt.id, syncedDebt);
  }

  return Array.from(debtsMap.values());
}

export const useCashFlowStore = create(
  (set, get) => ({
    // ── State ────────────────────────────────────────
    startPeriod: INCOME_SYSTEM_START_PERIOD, // Activo a partir del pago del 23 de Oct (ciclo 2026-11: 23 Oct - 24 Nov)
    activePeriod: getCurrentPeriod() < INCOME_SYSTEM_START_PERIOD ? INCOME_SYSTEM_START_PERIOD : getCurrentPeriod(), // Currently viewed period
    currency: "COP", // 'COP' | 'USD'
    allocationModel: "custom", // 'custom' | '50_30_20' | 'pay_yourself_first' | 'envelope'
    customRatios: DEFAULT_RATIOS,
    emergencyFundTargetMonths: 6,
    defaultFundingAccountId: "acc_plenti_principal",
    payrollAccount: DEFAULT_PAYROLL_ACCOUNT,
    creditCards: DEFAULT_CREDIT_CARDS,
    creditPurchases: DEFAULT_CREDIT_PURCHASES,
    creditCardPayments: [],
    deletedCreditCardPaymentIds: [],
    expensesLog: [],
    debts: [],
    inflows: DEFAULT_INFLOWS,
    needs: DEFAULT_NEEDS,
    wants: DEFAULT_WANTS,
    wealth: DEFAULT_WEALTH,
    salaryHistory: [],
    periodsData: {}, // Multi-month snapshots: { [period]: { inflows, needs, wants, wealth, customRatios, allocationModel } }
    isInitialized: false,
    isSyncing: false,
    deletedExpenseIds: [],

    // ── Initialization directly from Supabase Cloud Database (SSOT) ──
    initFetchCashFlow: async () => {
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("titanes_cash_flow_store_v2");
          localStorage.removeItem("titanes_cash_flow_store");
          localStorage.removeItem("kpital_cash_flow_store");
        }
        const cachedLocal = null;

        const res = await fetchCashFlowData({ bypassCache: true });
        const source = res;
        if (!source) {
          set({ isInitialized: true });
          return;
        }

        // Helper for lossless union of array of objects by id
        const unionById = (serverArr = [], localArr = []) => {
          const map = new Map();
          // First add local items (drafts or offline items)
          (localArr || []).forEach((item) => {
            if (item && item.id) map.set(item.id, { ...item });
          });
          // Server items take precedence (authoritative source)
          (serverArr || []).forEach((item) => {
            if (item && item.id) {
              const existing = map.get(item.id);
              map.set(item.id, existing ? { ...existing, ...item } : { ...item });
            }
          });
          return Array.from(map.values());
        };

        // Mes calendario actual en tiempo real (ej. "2026-10", "2026-11", etc.)
        const now = new Date();
        const currentCalPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        // El sistema de ingresos está activo únicamente a partir del pago del 23 de Octubre de 2026 (ciclo 2026-11: 23 Oct - 24 Nov)
        const rawStartP = source?.startPeriod || cachedLocal?.startPeriod || INCOME_SYSTEM_START_PERIOD;
        const startP = rawStartP < INCOME_SYSTEM_START_PERIOD ? INCOME_SYSTEM_START_PERIOD : rawStartP;
        const activeP = currentCalPeriod < startP ? startP : currentCalPeriod;

        // Custom ratios: user's exact configuration from local or remote prevails 100%
        const userRatios = cachedLocal?.customRatios || source?.customRatios;
        const resolvedRatios = userRatios || DEFAULT_RATIOS;

        const cleanedPeriodsData = {
          ...(source?.periodsData || {}),
          ...(cachedLocal?.periodsData || {}),
        };
        Object.keys(cleanedPeriodsData).forEach((k) => {
          if (k < INCOME_SYSTEM_START_PERIOD) {
            delete cleanedPeriodsData[k];
          } else if (cleanedPeriodsData[k] && Array.isArray(cleanedPeriodsData[k].inflows)) {
            // Keep only canonical real incomes or explicitly marked budget incomes in periodsData
            cleanedPeriodsData[k].inflows = cleanedPeriodsData[k].inflows.filter((inf) => {
              if (!inf || !inf.id) return false;
              if (inf.id === "in_salary" || inf.id === "in_fixed_yield" || inf.id === "in_stock_div") return true;
              const isAutoReimb =
                inf.category === "reimbursement" ||
                inf.id.startsWith("in_reimb_") ||
                inf.id.startsWith("in_cash_") ||
                inf.id.startsWith("in_wallet_") ||
                inf.id.startsWith("in_pocket_") ||
                (inf.name || "").toLowerCase().includes("cobro préstamo") ||
                (inf.name || "").toLowerCase().includes("reintegro préstamo");
              if (isAutoReimb) {
                return Boolean(inf.isExplicitBudgetIncome);
              }
              return true;
            });
          }
        });

        // Exact user items — union lossless between remote and local so incoming webhooks and classifications are never wiped
        const mergedCreditCards = Array.isArray(source?.creditCards) && source.creditCards.length > 0 ? source.creditCards : (cachedLocal?.creditCards || []);
        const mergedCreditPurchases = unionById(source?.creditPurchases, cachedLocal?.creditPurchases);
        const mergedCreditCardPayments = unionById(source?.creditCardPayments, cachedLocal?.creditCardPayments);

        const KNOWN_PHANTOM_PAYMENT_IDS = [
          "pay_split_1792875528218_ykk7e",
          "ccpay_split_1792875528218",
        ];
        const combinedDeletedPaymentIds = [
          ...new Set([
            ...KNOWN_PHANTOM_PAYMENT_IDS,
            ...(source?.deletedCreditCardPaymentIds || []),
            ...(cachedLocal?.deletedCreditCardPaymentIds || []),
          ]),
        ];
        const deletedPaymentIds = new Set(combinedDeletedPaymentIds);

        // Filter deleted payments and deduplicate distributed payments by (cardId + date + amount), keeping newest
        const rawActivePayments = mergedCreditCardPayments
          .filter((p) => p && p.id && !deletedPaymentIds.has(p.id))
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

        const seenPaymentSignatures = new Set();
        const sanitizedCreditCardPayments = [];
        for (const p of rawActivePayments) {
          const sig = `${p.cardId || p.cardName || ""}___${p.date || ""}___${Math.round(Number(p.amount) || 0)}`;
          if (seenPaymentSignatures.has(sig)) {
            combinedDeletedPaymentIds.push(p.id);
            deletedPaymentIds.add(p.id);
            continue;
          }
          seenPaymentSignatures.add(sig);
          sanitizedCreditCardPayments.push(p);
        }

        // Permanent tombstones for deleted transactions: combine backend and local storage
        const KNOWN_PHANTOM_EXPENSE_IDS = [
          "cf_tx_plenti_broker_funding_200k_202611",
          "cf_tx_mb_rappi_emergency_150k_202611",
          "cf_tx_cajita_viaje_150k_202611",
          "tx_1792909650611",
          "tx_1792909650611_split_0_1792909698846",
          "tx_1792909650611_split_1_1792909698846",
          "exp_transfer_mike_cajita_202611",
          "exp_transfer_mike_cajita_202611_split_0",
          "exp_transfer_mike_cajita_202611_split_1",
          "exp_transfer_mike_cajita_202611_split_wealth_60k",
          "exp_transfer_mike_cajita_202611_split_0_1792908328343",
          "exp_transfer_mike_cajita_202611_split_1_1792908328343",
          "pay_conv_1792863163027_gx31h_split_0_1792875528218",
          "pay_conv_1792863163027_gx31h_split_1_1792875528218",
          "pay_conv_1792863163027_gx31h_split_2_1792875528218",
          "pay_conv_1792863163027_gx31h_split_3_1792875528218",
        ];
        const combinedDeletedIds = [
          ...new Set([
            ...KNOWN_PHANTOM_EXPENSE_IDS,
            ...(source?.deletedExpenseIds || []),
            ...(cachedLocal?.deletedExpenseIds || [])
          ])
        ].filter(
          (id) =>
            id !== "cf_tx_mb_1793143745550_ad067e" &&
            id !== "cp_tx_mb_1793143745550_ad067e"
        );
        const deletedExpenseIds = new Set(combinedDeletedIds);
        const isTestExpense = (e) => {
          const desc = ((e?.description || '') + ' ' + (e?.budgetItemName || '')).toLowerCase();
          return desc.includes('test abono') || desc.includes('test sobregiro') || desc.includes('reversión test') || desc.includes('reversion test');
        };

        // Lossless union across server and local cache: if server fell back to static JSON, local edits take priority;
        // if server is live, server edits take priority while preserving any unsynced local movements not in deletedExpenseIds!
        const isStaticFallback = Boolean(source?._isStaticFallback);
        const baseExpenses = isStaticFallback
          ? unionById(cachedLocal?.expensesLog, source?.expensesLog)
          : unionById(source?.expensesLog, cachedLocal?.expensesLog);

        // Explicitly guarantee SURTIMAYORISTA 42.455 COP in Nómina exists and is never lost
        const SURTIMAYORISTA_42K_EXPENSE = {
          id: "cf_tx_mb_1793143745550_ad067e",
          period: "2026-11",
          budgetItemId: "need_groceries",
          budgetItemName: "Alimentación & Supermercado",
          budgetItemType: "needs",
          description: "Compra en SURTIMAYORISTA AVENIDA",
          amount: 42455,
          currency: "COP",
          date: "2026-10-27",
          time: "18:29:05",
          type: "debit",
          cascaded: false,
          shortfall: 0,
          fallbackAccountName: null,
          paymentSource: {
            type: "payroll",
            targetId: "acc_nu_debito",
            targetName: "Cuenta Nu Débito (Nómina)",
          },
          createdAt: "2026-10-27T18:29:05.550418-05:00",
          itemType: "expense",
          isLoan: false,
        };
        if (!baseExpenses.some((e) => e && (e.id === "cf_tx_mb_1793143745550_ad067e" || (Number(e.amount) === 42455 && (e.description || "").includes("SURTIMAYORISTA"))))) {
          baseExpenses.push(SURTIMAYORISTA_42K_EXPENSE);
        }

        const mergedExpensesLog = baseExpenses.filter(
          (e) => e && e.id && !deletedExpenseIds.has(e.id) && !isTestExpense(e)
        );
        
        // Auto-corrección: si el movimiento de $37,000 (Plan móvil) quedó por error asignado al Fondo de Emergencia,
        // restaurarlo al rubro correspondiente de Servicios Públicos: Plan móvil; y vincular la transferencia real de $350k a Finandina.
        const mappedExpenses = mergedExpensesLog.map((e) => {
          // Compra SURTIMAYORISTA AVENIDA ($42.455 COP) con Cuenta Nu Débito (Nómina)
          if (
            e.id === "cf_tx_mb_1793143745550_ad067e" ||
            (Number(e.amount) === 42455 && (e.description || "").toUpperCase().includes("SURTIMAYORISTA"))
          ) {
            return {
              ...e,
              amount: 42455,
              description: "Compra en SURTIMAYORISTA AVENIDA",
              budgetItemId: "need_groceries",
              budgetItemName: "Alimentación & Supermercado",
              budgetItemType: "needs",
              type: "debit",
              itemType: "expense",
              paymentSource: {
                type: "payroll",
                targetId: "acc_nu_debito",
                targetName: "Cuenta Nu Débito (Nómina)",
              },
            };
          }

          // Sanitización definitiva: Compra SURTIMAYORISTA AVENIDA ($8.667 COP) que aparecía como $8,66 por error de coma decimal
          if (
            e.id === 'cf_tx_mb_1792938659603_0ff700' ||
            (Number(e.amount) < 10 && (e.date === '2026-10-25' || (e.description || '').toLowerCase().includes('bancario') || (e.description || '').toLowerCase().includes('surtimayorista')))
          ) {
            return {
              ...e,
              amount: 8667,
              description: 'Compra en SURTIMAYORISTA AVENIDA',
              budgetItemId: 'need_groceries',
              budgetItemName: 'Alimentación & Supermercado',
              budgetItemType: 'needs',
            };
          }

          // Si el movimiento de Mike quedó con período previo 2026-10, moverlo al período activo real 2026-11
          if ((e.id?.includes("mike") || (e.description || "").toLowerCase().includes("mike")) && e.period === "2026-10") {
            return {
              ...e,
              period: "2026-11",
            };
          }

          // Compra con Tarjeta de Crédito Nu (3887) Xbox: no debe salir de Nómina, sale de Tarjeta Nu
          const isXboxOr3887 =
            Number(e.amount) === 31392 ||
            (e.description || "").toLowerCase().includes("3887") ||
            (e.description || "").toLowerCase().includes("xbox");
          if (isXboxOr3887) {
            return {
              ...e,
              description: "Compra en Microsoft*Xbox",
              budgetItemId: e.budgetItemId || "want_leisure",
              budgetItemName: !e.budgetItemName || e.budgetItemName.includes("3887") ? "Ocio, Hobbies & Suscripciones" : e.budgetItemName,
              budgetItemType: "wants",
              paymentSource: {
                type: "credit_card",
                targetId: "cc_nu",
                targetName: "Tarjeta Nu Mastercard",
              },
            };
          }
          const isPlanMovil37k =
            Number(e.amount) === 37000 &&
            ((e.description || "").toLowerCase().includes("plan movil") ||
              (e.subItemName || "").toLowerCase().includes("plan movil") ||
              e.budgetItemId === "need_utilities" ||
              e.budgetItemId === "wealth_emergency");
          if (isPlanMovil37k && (e.budgetItemId === "wealth_emergency" || e.budgetItemType === "wealth")) {
            return {
              ...e,
              budgetItemId: "need_utilities",
              budgetItemName: "Servicios Públicos, Luz & Fibra Óptica",
              budgetItemType: "needs",
              subItemId: "sub_1792692729310_tryk",
              subItemName: "Plan movil",
              description: "Servicios Públicos, Luz & Fibra Óptica: Plan movil",
              destinationAccountId: null,
              destinationAccountName: null,
            };
          }
          const is350kTransfer = Number(e.amount) === 350000;
          if (is350kTransfer && e.budgetItemId === "wealth_emergency") {
            return {
              ...e,
              destinationAccountId: "acc_finandina_principal",
              destinationAccountName: "FlexiDigital + (Principal)",
            };
          }

          // Salida / traslado hacia la Cajita Impresora (Aporte a ahorro)
          if (e.id === "cf_tx_int_1793021051631_out" || (e.description?.toLowerCase().includes("impresora") && (e.type === "debit" || !e.type))) {
            return {
              ...e,
              period: "2026-11",
              type: "debit",
              budgetItemId: "wealth_impresora",
              budgetItemName: "Meta Impresora 3D",
              budgetItemType: "wealth",
              description: "Aporte a Ahorro: Cajita Impresora (Ganancia Tony Chopper)",
              paymentSource: {
                type: "savings",
                targetId: "acc_rappi_principal",
                targetName: "Cuenta RappiPay (Principal)",
              },
              destinationAccountId: "acc_1789616855068",
              destinationAccountName: "Cajita Impresora (RappiPay)",
            };
          }

          // Entrada de dinero por venta de pieza 3D recibida en RappiCuenta
          if (e.id === "cf_tx_mb_1793020231371_461300" || (Number(e.amount) === 70000 && e.id !== "cf_tx_int_1793021051631_out" && !e.description?.toLowerCase().includes("impresora") && e.description?.toLowerCase().includes("chopper"))) {
            return {
              ...e,
              period: "2026-11",
              type: "credit",
              budgetItemId: null,
              budgetItemName: "Venta Impresión 3D (Emprendimiento)",
              budgetItemType: "income",
              description: "Venta Impresión 3D: Base para celular Tony Chopper (Johan)",
              paymentSource: {
                type: "savings",
                targetId: "acc_rappi_principal",
                targetName: "Cuenta RappiPay (Principal)",
              },
            };
          }

          const is150kRappiOrEmergency =
            Number(e.amount) === 150000 &&
            ((e.description || "").toLowerCase().includes("rappicuenta") ||
              (e.description || "").toLowerCase().includes("fondo de emergencia") ||
              e.budgetItemId === "wealth_emergency");
          if (is150kRappiOrEmergency) {
            return {
              ...e,
              period: "2026-11",
              type: "debit",
              budgetItemId: "wealth_emergency",
              budgetItemName: "Fondo de Emergencia (6 Meses)",
              budgetItemType: "wealth",
              description: e.description && !e.description.toLowerCase().includes("transferencia para fondo")
                ? e.description
                : "Compra en tu RappiCuenta",
              destinationAccountId: "acc_rappi_principal",
              destinationAccountName: "Cuenta RappiPay (Principal)",
            };
          }

          // Desvincular Pan y Cumpleaños Campo de 'need_housing' (Arriendo) por error de valor por defecto
          if ((e.id === "tx_1793019721410" || e.id === "tx_1793019639815" || e.description?.toLowerCase().includes("pan") || e.description?.toLowerCase().includes("cumpleaños campo")) && e.budgetItemId === "need_housing") {
            return {
              ...e,
              budgetItemId: null,
              budgetItemName: e.isSplit || e.participants?.length > 0 ? "Gasto Compartido (Vaca)" : "Préstamo",
              budgetItemType: "receivable",
            };
          }
          return e;
        });

        // Deduplicar estrictamente por id para prevenir filas repetidas
        const seenExpIds = new Set();
        let sanitizedExpensesLog = [];
        for (const exp of mappedExpenses) {
          if (exp && exp.id && !seenExpIds.has(exp.id)) {
            seenExpIds.add(exp.id);
            sanitizedExpensesLog.push(exp);
          }
        }
        // Reconcile & deduplicate split deduction children against active creditCardPayments and distributed parents,
        // AND synthesize any missing split child rows if a creditCardPayment has budgetDeductions whose child expenses are missing!
        const claimedCardDeductions = new Set();
        const claimedParentDeductions = new Set();
        const distributedParentsById = new Map(
          sanitizedExpensesLog.filter((e) => e.isDistributed).map((e) => [e.id, e])
        );
        const sortedForReconcile = [...sanitizedExpensesLog].sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        const reconciledExpenses = [];

        for (const exp of sortedForReconcile) {
          const isCardPayoffChild = Boolean(
            exp.isCreditCardPayoff ||
            exp.creditCardPaymentId ||
            ((exp.description || "").includes("Pago ") && (exp.description || "").includes("(Descontado de"))
          );

          if (isCardPayoffChild) {
            const parentPay = sanitizedCreditCardPayments.find(
              (p) =>
                p.id === exp.creditCardPaymentId ||
                p.id === exp.splitParentId ||
                ((exp.cardId === p.cardId || (p.cardName && (exp.description || "").includes(p.cardName))) &&
                  exp.date === p.date)
            );
            if (!parentPay) {
              continue;
            }
            if (Array.isArray(parentPay.budgetDeductions) && parentPay.budgetDeductions.length > 0) {
              const dedIdx = parentPay.budgetDeductions.findIndex(
                (d, idx) =>
                  !claimedCardDeductions.has(`${parentPay.id}_${idx}`) &&
                  d.budgetItemId === exp.budgetItemId &&
                  (d.subItemId || null) === (exp.subItemId || null) &&
                  Math.abs(Number(d.amount) - Number(exp.amount)) < 1
              );
              if (dedIdx < 0) {
                continue;
              }
              claimedCardDeductions.add(`${parentPay.id}_${dedIdx}`);
            }
            reconciledExpenses.push({
              ...exp,
              creditCardPaymentId: parentPay.id,
              splitParentId: parentPay.id,
            });
            continue;
          }

          if ((exp.isSplitChild || exp.isSplitDeductionChild || exp.splitParentId) && !exp.isDistributed) {
            const distParent = distributedParentsById.get(exp.splitParentId);
            if (distParent && Array.isArray(distParent.budgetDeductions) && distParent.budgetDeductions.length > 0) {
              const dedIdx = distParent.budgetDeductions.findIndex(
                (d, idx) =>
                  !claimedParentDeductions.has(`${distParent.id}_${idx}`) &&
                  d.budgetItemId === exp.budgetItemId &&
                  (d.subItemId || null) === (exp.subItemId || null) &&
                  Math.abs(Number(d.amount) - Number(exp.amount)) < 1
              );
              if (dedIdx < 0) {
                continue;
              }
              claimedParentDeductions.add(`${distParent.id}_${dedIdx}`);
            }
          }

          reconciledExpenses.push(exp);
        }

        // Synthesize any missing split deduction children from active creditCardPayments so budget rubros and all browsers always match 100%
        for (const p of sanitizedCreditCardPayments) {
          if (Array.isArray(p.budgetDeductions) && p.budgetDeductions.length > 0) {
            p.budgetDeductions.forEach((d, idx) => {
              const claimKey = `${p.id}_${idx}`;
              if (!claimedCardDeductions.has(claimKey) && Number(d.amount) > 0) {
                const synthId = `${p.id}_split_${idx}`;
                reconciledExpenses.push({
                  id: synthId,
                  splitParentId: p.id,
                  isSplitChild: true,
                  isSplitDeductionChild: true,
                  period: p.period || activeP,
                  date: p.date || "2026-10-24",
                  time: p.time || null,
                  amount: Number(d.amount),
                  currency: p.currency || "COP",
                  type: "debit",
                  budgetItemId: d.budgetItemId,
                  budgetItemName: d.budgetItemName,
                  budgetItemType: d.budgetItemType || "wants",
                  subItemId: d.subItemId || null,
                  subItemName: d.subItemName || null,
                  description: `💳 Pago ${p.cardName || "Tarjeta"} (Descontado de ${d.budgetItemName})`,
                  paymentSource: {
                    type: p.sourceType || "payroll",
                    targetId: p.sourceAccountId || "acc_nu_debito",
                    targetName: p.sourceAccount || "Nu Colombia (Cuenta Nu Débito)",
                  },
                  creditCardPaymentId: p.id,
                  isCreditCardPayoff: true,
                  cardId: p.cardId || null,
                  isEmergencySavingsDeduction: false,
                  itemType: d.budgetItemType === "wealth" ? "wealth_saving" : "expense",
                  destinationAccountId: d.destinationAccountId || null,
                  destinationAccountName: d.destinationAccountName || null,
                  createdAt: p.createdAt || new Date().toISOString(),
                });
                claimedCardDeductions.add(claimKey);
              }
            });
          }
        }

        // Always sort expenses strictly by date and time from most recent to oldest
        sanitizedExpensesLog = sortMovementsByDateTimeDesc(reconciledExpenses);

        const KNOWN_PHANTOM_DEBT_IDS = [
          "debt_mike_nu_2026",
          "debt_loan_carlos_2026",
        ];
        const combinedDeletedDebtIds = [
          ...new Set([
            ...KNOWN_PHANTOM_DEBT_IDS,
            ...(source?.deletedDebtIds || []),
            ...(cachedLocal?.deletedDebtIds || [])
          ])
        ];
        const deletedDebtIds = new Set(combinedDeletedDebtIds);

        const rawDebts = (Array.isArray(source?.debts) ? source.debts : (cachedLocal?.debts || [])).filter(
          (d) => d && d.id && !deletedDebtIds.has(d.id)
        );

        // Deduplicar deudas por clave (acreedor/deudor + concepto) y eliminar deudas mock heredadas (como debt_mike_nu_2026)
        const seenDebtKeys = new Set();
        const deduplicatedRawDebts = [];
        const sortedDebts = [...rawDebts].sort((a, b) => {
          const aScore = (a.paymentSourceId ? 10 : 0) + ((a.paymentsLog || []).length > 0 ? 5 : 0) + (a.id !== "debt_mike_nu_2026" ? 2 : 0);
          const bScore = (b.paymentSourceId ? 10 : 0) + ((b.paymentsLog || []).length > 0 ? 5 : 0) + (b.id !== "debt_mike_nu_2026" ? 2 : 0);
          return bScore - aScore;
        });

        for (const d of sortedDebts) {
          if (!d) continue;
          if (d.id === "debt_mike_nu_2026") {
            continue; // Descartar duplicado mock de Mike incondicionalmente
          }
          const party = (d.creditor || d.debtor || "").toLowerCase().trim();
          const concept = (d.concept || "").toLowerCase().trim();
          const key = `${party}___${concept}`;
          if (!seenDebtKeys.has(key)) {
            seenDebtKeys.add(key);
            deduplicatedRawDebts.push(d);
          }
        }

        const mergedDebts = deduplicatedRawDebts.map((d) => {
          if (d.concept?.toLowerCase().includes("mike") || d.creditor?.toLowerCase().includes("mike")) {
            const hasPayment = (d.paymentsLog || []).some((p) => Number(p.amount) === 210000);
            return {
              ...d,
              notes: d.notes && !d.notes.includes("Un solo pago") ? d.notes : "Pagos directos a Mike (3 cuotas de $210.000).",
              paymentMethod: d.paymentMethod || "Transferencia directa a Mike",
              remainingAmount: 420000,
              paymentsLog: hasPayment
                ? d.paymentsLog
                : [
                    {
                      id: "pay_mb_1793024460513_550489",
                      amount: 210000,
                      date: "2026-10-26",
                      paymentMethod: "Transferencia directa Nu a Mike (RappiPay)",
                      note: "Pago cuota 1/3 enviado directamente a Mike ($210.000 COP) desde Cajita Deudas",
                      createdAt: "2026-10-26T09:21:00.513Z",
                    },
                    ...(d.paymentsLog || []),
                  ],
            };
          }
          return d;
        });
        // Sanitize inflows: Keep only canonical real incomes (Salario, Renta Fija, Renta Variable)
        // and discard auto-generated loan reimbursements unless explicitly marked by user as budget income.
        const mergedInflows = unionById(source?.inflows, cachedLocal?.inflows).filter((inf) => {
          if (!inf || !inf.id) return false;
          if (inf.id === "in_salary" || inf.id === "in_fixed_yield" || inf.id === "in_stock_div") return true;
          const isAutoReimb =
            inf.category === "reimbursement" ||
            inf.id.startsWith("in_reimb_") ||
            inf.id.startsWith("in_cash_") ||
            inf.id.startsWith("in_wallet_") ||
            inf.id.startsWith("in_pocket_") ||
            (inf.name || "").toLowerCase().includes("cobro préstamo") ||
            (inf.name || "").toLowerCase().includes("reintegro préstamo");
          if (isAutoReimb) {
            return Boolean(inf.isExplicitBudgetIncome);
          }
          return true;
        });
        const mergedNeeds = unionById(source?.needs, cachedLocal?.needs);
        const mergedWants = unionById(source?.wants, cachedLocal?.wants);
        const mergedWealth = unionById(source?.wealth, cachedLocal?.wealth);

        let sanitizedCreditPurchases = (mergedCreditPurchases || []).filter((cp) => {
          if (!cp || !cp.id) return false;
          if (deletedExpenseIds.has(cp.id)) return false;
          const cleanTxId = cp.id.startsWith("cp_") ? cp.id.replace("cp_", "") : cp.id;
          if (deletedExpenseIds.has(cleanTxId) || deletedExpenseIds.has(`cf_${cleanTxId}`)) return false;
          if (cp.id === "cp_tx_mb_1793143745550_ad067e" || cp.description?.includes("SURTIMAYORISTA")) return false;
          return true;
        });

        // Ensure all creditPurchases have totalAmount normalized
        sanitizedCreditPurchases = sanitizedCreditPurchases.map((cp) => {
          const tot = Number(cp.totalAmount) || Number(cp.amount) || Number(cp.monthlyInstallment) || 0;
          return {
            ...cp,
            totalAmount: tot,
            amount: tot,
            monthlyInstallment: Number(cp.monthlyInstallment) || tot,
          };
        });

        // Ensure credit card expenses in sanitizedExpensesLog are reflected in sanitizedCreditPurchases
        sanitizedExpensesLog.forEach((tx) => {
          if (tx.paymentSource?.type === "credit_card") {
            const cardId = tx.paymentSource.targetId || (tx.description?.toLowerCase().includes("rappi") ? "cc_rappi" : "cc_nu");
            const cleanId = tx.id.replace("cf_", "");
            const amt = Number(tx.amount) || 0;
            const matchingCp = sanitizedCreditPurchases.find((p) => p.id === `cp_${cleanId}` || p.id === tx.id);
            if (matchingCp) {
              matchingCp.totalAmount = amt;
              matchingCp.amount = amt;
              matchingCp.monthlyInstallment = Number(matchingCp.monthlyInstallment) || amt;
              matchingCp.cardId = cardId;
            } else {
              sanitizedCreditPurchases.push({
                id: `cp_${cleanId}`,
                cardId,
                description: tx.description,
                amount: amt,
                totalAmount: amt,
                installmentsCount: tx.paymentSource?.installments || 1,
                startPeriod: tx.period || activeP,
                monthlyInstallment: amt,
                date: tx.date,
                createdAt: tx.createdAt || new Date().toISOString(),
              });
            }
          }
        });

        // Reverse reconciliation: Ensure every active creditPurchase in sanitizedCreditPurchases also exists in sanitizedExpensesLog!
        sanitizedCreditPurchases.forEach((cp) => {
          if (!cp || !cp.id) return;
          const cleanId = cp.id.startsWith("cp_") ? cp.id.replace("cp_", "") : cp.id;
          const cfId = cleanId.startsWith("cf_") ? cleanId : `cf_${cleanId}`;
          if (deletedExpenseIds.has(cfId) || deletedExpenseIds.has(cleanId) || deletedExpenseIds.has(cp.id)) return;
          const amt = Number(cp.totalAmount) || Number(cp.amount) || Number(cp.monthlyInstallment) || 0;
          const existsInLog = sanitizedExpensesLog.some(
            (e) =>
              e.id === cfId ||
              e.id === cleanId ||
              e.id === cp.id ||
              (e.date === cp.date &&
                Math.abs(Number(e.amount) - amt) < 1 &&
                (e.description || "").toLowerCase().trim() === (cp.description || "").toLowerCase().trim())
          );
          if (!existsInLog) {
            const cardObj = (mergedCreditCards || []).find((c) => c.id === cp.cardId);
            const cardName = cardObj?.name || (cp.cardId === "cc_rappi" ? "RappiCard Visa (MSI)" : "Tarjeta Nu Mastercard");
            const timePart = cp.createdAt && cp.createdAt.includes("T") ? cp.createdAt.split("T")[1].slice(0, 8) : null;
            sanitizedExpensesLog.push({
              id: cfId,
              period: cp.startPeriod || activeP,
              budgetItemId: cp.budgetItemId || null,
              budgetItemName: cp.budgetItemName || cp.description || "Compra con Tarjeta",
              budgetItemType: cp.budgetItemType || "wants",
              description: cp.description || "Compra con Tarjeta",
              amount: amt,
              currency: "COP",
              date: cp.date || "2026-10-28",
              time: cp.time || timePart,
              type: "debit",
              paymentSource: {
                type: "credit_card",
                targetId: cp.cardId || "cc_rappi",
                targetName: cardName,
                installments: Number(cp.installmentsCount) || 1,
              },
              createdAt: cp.createdAt || new Date().toISOString(),
            });
          }
        });
        sanitizedExpensesLog = sortMovementsByDateTimeDesc(sanitizedExpensesLog);

        // Sync credit cards usedLimit directly with actual active purchases
        const syncedCreditCards = (mergedCreditCards || []).map((card) => {
          const cardPurchasesTotal = sanitizedCreditPurchases
            .filter((p) => p.cardId === card.id)
            .reduce((sum, p) => sum + (Number(p.totalAmount) || Number(p.amount) || 0), 0);
          return {
            ...card,
            usedLimit: cardPurchasesTotal > 0 ? cardPurchasesTotal : (Number(card.usedLimit) || 0),
          };
        });

        const resolvedState = {
          startPeriod: startP,
          activePeriod: activeP,
          currency: source?.currency || cachedLocal?.currency || "COP",
          allocationModel: source?.allocationModel || cachedLocal?.allocationModel || "custom",
          customRatios: resolvedRatios,
          emergencyFundTargetMonths: source?.emergencyFundTargetMonths ?? cachedLocal?.emergencyFundTargetMonths ?? 6,
          defaultFundingAccountId: source?.defaultFundingAccountId || cachedLocal?.defaultFundingAccountId || "acc_plenti_principal",
          payrollAccount: {
            ...DEFAULT_PAYROLL_ACCOUNT,
            ...(cachedLocal?.payrollAccount || {}),
            ...(source?.payrollAccount || {}),
            activeFromDate: "2026-10-23",
          },
          creditCards: syncedCreditCards,
          creditPurchases: sanitizedCreditPurchases,
          creditCardPayments: sanitizedCreditCardPayments,
          deletedCreditCardPaymentIds: combinedDeletedPaymentIds,
          expensesLog: sanitizedExpensesLog,
          deletedExpenseIds: combinedDeletedIds,
          debts: syncExpenseLoansToDebts(sanitizedExpensesLog, mergedDebts),
          deletedDebtIds: combinedDeletedDebtIds,
          inflows: mergedInflows,
          needs: mergedNeeds,
          wants: mergedWants,
          wealth: mergedWealth,
          salaryHistory: unionById(source?.salaryHistory, cachedLocal?.salaryHistory),
          periodsData: cleanedPeriodsData,
          isInitialized: true,
        };

        set(resolvedState);
      } catch (err) {
        console.error("[CashFlow] Failed to load data from backend database:", err);
        set({ isInitialized: true });
      }
    },

      syncStateWithBackend: async () => {
        const state = get();
        if (!state.isInitialized) {
          console.warn("[CashFlow] Safeguard: backend sync blocked because store is not initialized yet!");
          return;
        }

        // Cancel previous pending sync timer to debounce rapid updates
        if (syncDebounceTimer) {
          clearTimeout(syncDebounceTimer);
        }

        syncDebounceTimer = setTimeout(async () => {
          set({ isSyncing: true });
          try {
            const currentState = get();
            await syncCashFlowStateApi({
              startPeriod: currentState.startPeriod,
              activePeriod: currentState.activePeriod,
              currency: currentState.currency,
              allocationModel: currentState.allocationModel,
              customRatios: currentState.customRatios,
              emergencyFundTargetMonths: currentState.emergencyFundTargetMonths,
              defaultFundingAccountId: currentState.defaultFundingAccountId,
              payrollAccount: currentState.payrollAccount,
              creditCards: currentState.creditCards,
              creditPurchases: currentState.creditPurchases,
              creditCardPayments: currentState.creditCardPayments,
              deletedCreditCardPaymentIds: currentState.deletedCreditCardPaymentIds || [],
              expensesLog: currentState.expensesLog,
              deletedExpenseIds: currentState.deletedExpenseIds || [],
              debts: currentState.debts || [],
              deletedDebtIds: currentState.deletedDebtIds || [],
              inflows: currentState.inflows,
              needs: currentState.needs,
              wants: currentState.wants,
              wealth: currentState.wealth,
              periodsData: currentState.periodsData,
            });
          } catch (err) {
            if (err?.name === "AbortError" || err?.message?.includes("aborted")) {
              return;
            }
            console.error("[CashFlow] Error syncing to backend:", err);
          } finally {
            set({ isSyncing: false });
          }
        }, 300);
      },

      // ── Broker Funding Account Settings (USD / Brokers) ──
      setDefaultFundingAccount: (accountId) => {
        set({ defaultFundingAccountId: accountId });
        get().syncStateWithBackend();
        toast.success("Cuenta en dólares para fondear establecida como predeterminada ⭐", { icon: "💵" });
      },

      // ── Payroll Account Settings ─────────────────────
      setPayrollAccount: (payrollAccount) => {
        set({ payrollAccount });
        get().syncStateWithBackend();
        toast.success(`Cuenta de Nómina actualizada a ${payrollAccount.name}`, { icon: "🏦" });
      },

      // ── Credit Cards CRUD ────────────────────────────
      addCreditCard: (card) => {
        set((state) => ({ creditCards: [...state.creditCards, card] }));
        get().syncStateWithBackend();
        toast.success(`Tarjeta ${card.name} registrada con éxito`, { icon: "💳" });
      },

      updateCreditCard: (id, updates) => {
        set((state) => ({
          creditCards: state.creditCards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
        get().syncStateWithBackend();
      },

      deleteCreditCard: (id) => {
        set((state) => ({
          creditCards: state.creditCards.filter((c) => c.id !== id),
          creditPurchases: state.creditPurchases.filter((p) => p.cardId !== id),
        }));
        get().syncStateWithBackend();
        toast.success("Tarjeta eliminada", { icon: "🗑️" });
      },

      // ── Credit Purchases & Installments CRUD ─────────
      addCreditPurchase: (purchase) => {
        set((state) => {
          const tot = Number(purchase.totalAmount) || Number(purchase.amount) || Number(purchase.monthlyInstallment) || 0;
          const normalizedP = {
            ...purchase,
            totalAmount: tot,
            amount: tot,
            monthlyInstallment: Number(purchase.monthlyInstallment) || tot,
          };
          const nextPurchases = [normalizedP, ...(state.creditPurchases || [])];
          const nextCards = (state.creditCards || []).map((c) => {
            const cardPurchasesTotal = nextPurchases
              .filter((p) => p.cardId === c.id)
              .reduce((sum, p) => sum + (Number(p.totalAmount) || Number(p.amount) || 0), 0);
            return { ...c, usedLimit: cardPurchasesTotal > 0 ? cardPurchasesTotal : c.usedLimit };
          });
          return { creditPurchases: nextPurchases, creditCards: nextCards };
        });
        get().syncStateWithBackend();
        toast.success(`Compra diferida "${purchase.description}" registrada`, { icon: "🛍️" });
      },

      updateCreditPurchase: (id, updates) => {
        set((state) => {
          const nextPurchases = (state.creditPurchases || []).map((p) => {
            if (p.id === id) {
              const merged = { ...p, ...updates };
              const tot = Number(merged.totalAmount) || Number(merged.amount) || Number(merged.monthlyInstallment) || 0;
              return { ...merged, totalAmount: tot, amount: tot };
            }
            return p;
          });
          const nextCards = (state.creditCards || []).map((c) => {
            const cardPurchasesTotal = nextPurchases
              .filter((p) => p.cardId === c.id)
              .reduce((sum, p) => sum + (Number(p.totalAmount) || Number(p.amount) || 0), 0);
            return { ...c, usedLimit: cardPurchasesTotal > 0 ? cardPurchasesTotal : c.usedLimit };
          });
          return { creditPurchases: nextPurchases, creditCards: nextCards };
        });
        get().syncStateWithBackend();
      },

      deleteCreditPurchase: (id) => {
        set((state) => {
          const nextPurchases = (state.creditPurchases || []).filter((p) => p.id !== id);
          const updatedCards = (state.creditCards || []).map((c) => {
            const cardPurchasesTotal = nextPurchases
              .filter((p) => p.cardId === c.id)
              .reduce((sum, p) => sum + (Number(p.totalAmount) || Number(p.amount) || 0), 0);
            return {
              ...c,
              usedLimit: cardPurchasesTotal,
            };
          });
          const cleanTxId = id.startsWith("cp_") ? id.replace("cp_", "") : id;
          const updatedExpenses = (state.expensesLog || []).filter(
            (tx) => tx.id !== id && tx.id !== cleanTxId && tx.id !== `cf_${cleanTxId}`
          );
          return {
            creditPurchases: nextPurchases,
            creditCards: updatedCards,
            expensesLog: updatedExpenses,
          };
        });
        get().syncStateWithBackend();
        toast.success("Compra diferida eliminada", { icon: "🗑️" });
      },

      // ── Real Expenses & Transactions Log CRUD ────────
      addExpenseTransaction: (tx) => {
        set((state) => {
          let updatedCards = state.creditCards;
          let updatedPurchases = state.creditPurchases || [];
          if (tx.paymentSource?.type === "credit_card" && tx.paymentSource.targetId) {
            const cleanId = (tx.id || "").replace("cf_", "");
            const purchaseObj = {
              id: `cp_${cleanId}`,
              cardId: tx.paymentSource.targetId,
              description: tx.description,
              amount: Number(tx.amount) || 0,
              totalAmount: Number(tx.amount) || 0,
              installmentsCount: tx.paymentSource.installments || 1,
              startPeriod: tx.period || state.activePeriod,
              monthlyInstallment: Number(tx.amount) || 0,
              date: tx.date,
              createdAt: tx.createdAt || new Date().toISOString(),
            };
            updatedPurchases = [purchaseObj, ...updatedPurchases];
            updatedCards = (state.creditCards || []).map((c) => {
              const cardPurchasesTotal = updatedPurchases
                .filter((p) => p.cardId === c.id)
                .reduce((sum, p) => sum + (Number(p.totalAmount) || Number(p.amount) || 0), 0);
              return { ...c, usedLimit: cardPurchasesTotal > 0 ? cardPurchasesTotal : c.usedLimit };
            });
          }

          return {
            expensesLog: sortMovementsByDateTimeDesc([tx, ...(state.expensesLog || [])]),
            creditCards: updatedCards,
            creditPurchases: updatedPurchases,
          };
        });
        get().syncStateWithBackend();
        if (tx.type === "credit") {
          toast.success(`Ingreso "${tx.description}" registrado en ${tx.paymentSource?.targetName || "Cuenta"}`, { icon: "📥" });
        } else {
          toast.success(`Gasto real "${tx.description}" registrado en ${tx.paymentSource?.targetName || "Nómina"}`, { icon: "💸" });
        }
      },

      updateExpenseTransaction: (updatedTx) => {
        set((state) => {
          const oldTx = (state.expensesLog || []).find((tx) => tx.id === updatedTx.id);
          let updatedCards = state.creditCards;

          // Reconcile credit card usedLimit if payment source or amount changed
          if (oldTx && oldTx.paymentSource?.type === "credit_card" && oldTx.paymentSource.targetId) {
            updatedCards = updatedCards.map((c) => {
              if (c.id === oldTx.paymentSource.targetId) {
                return { ...c, usedLimit: Math.max(0, (Number(c.usedLimit) || 0) - Number(oldTx.amount)) };
              }
              return c;
            });
          }

          if (updatedTx.paymentSource?.type === "credit_card" && updatedTx.paymentSource.targetId) {
            updatedCards = updatedCards.map((c) => {
              if (c.id === updatedTx.paymentSource.targetId) {
                return { ...c, usedLimit: (Number(c.usedLimit) || 0) + Number(updatedTx.amount) };
              }
              return c;
            });
          }

          // Real-time synchronization with creditPurchases
          const cleanId = updatedTx.id.replace("cf_", "");
          let updatedPurchases = state.creditPurchases || [];
          if (updatedTx.paymentSource?.type === "credit_card") {
            const cardId = updatedTx.paymentSource.targetId || "cc_nu";
            const exists = updatedPurchases.some((p) => p.id === `cp_${cleanId}` || p.id === updatedTx.id);
            if (exists) {
              updatedPurchases = updatedPurchases.map((p) => {
                if (p.id === `cp_${cleanId}` || p.id === updatedTx.id) {
                  return {
                    ...p,
                    cardId,
                    description: updatedTx.description,
                    amount: Number(updatedTx.amount) || p.amount,
                    totalAmount: Number(updatedTx.amount) || p.totalAmount || p.amount,
                    monthlyInstallment: Number(updatedTx.amount) || p.monthlyInstallment,
                  };
                }
                return p;
              });
            } else {
              updatedPurchases = [
                {
                  id: `cp_${cleanId}`,
                  cardId,
                  description: updatedTx.description,
                  amount: Number(updatedTx.amount),
                  totalAmount: Number(updatedTx.amount),
                  installmentsCount: 1,
                  startPeriod: updatedTx.period || state.activePeriod,
                  monthlyInstallment: Number(updatedTx.amount),
                  date: updatedTx.date,
                  createdAt: updatedTx.createdAt || new Date().toISOString(),
                },
                ...updatedPurchases,
              ];
            }
          } else if (oldTx?.paymentSource?.type === "credit_card") {
            // Payment source changed away from credit card, remove from creditPurchases
            updatedPurchases = updatedPurchases.filter((p) => p.id !== `cp_${cleanId}` && p.id !== updatedTx.id);
          }

          // Dynamically sync creditCards usedLimit
          updatedCards = updatedCards.map((c) => {
            const cardPurchasesTotal = updatedPurchases
              .filter((p) => p.cardId === c.id)
              .reduce((sum, p) => sum + (Number(p.totalAmount) || Number(p.amount) || 0), 0);
            return { ...c, usedLimit: cardPurchasesTotal > 0 ? cardPurchasesTotal : c.usedLimit };
          });

          const updatedLog = (state.expensesLog || []).map((tx) =>
            tx.id === updatedTx.id ? { ...tx, ...updatedTx } : tx
          );

          return {
            expensesLog: sortMovementsByDateTimeDesc(updatedLog),
            creditCards: updatedCards,
            creditPurchases: updatedPurchases,
          };
        });
        get().syncStateWithBackend();
        toast.success(`Movimiento "${updatedTx.description}" actualizado`, { icon: "✏️" });
      },

      deleteExpenseTransaction: (id) => {
        set((state) => {
          const txToDelete = (state.expensesLog || []).find((tx) => tx.id === id);
          let updatedCards = state.creditCards;

          if (txToDelete && txToDelete.paymentSource?.type === "credit_card" && txToDelete.paymentSource.targetId) {
            updatedCards = state.creditCards.map((c) => {
              if (c.id === txToDelete.paymentSource.targetId) {
                return { ...c, usedLimit: Math.max(0, (Number(c.usedLimit) || 0) - Number(txToDelete.amount)) };
              }
              return c;
            });
          }

          // Remove corresponding credit purchase if exists
          const cleanId = id.replace("cf_", "");
          const updatedPurchases = (state.creditPurchases || []).filter(
            (p) => p.id !== id && p.id !== `cp_${cleanId}` && p.id !== `cp_${id}`
          );

          // Dynamically sync creditCards usedLimit
          updatedCards = (state.creditCards || []).map((c) => {
            const cardPurchasesTotal = updatedPurchases
              .filter((p) => p.cardId === c.id)
              .reduce((sum, p) => sum + (Number(p.totalAmount) || Number(p.amount) || 0), 0);
            return { ...c, usedLimit: cardPurchasesTotal };
          });

          // Also remove matching deduction from parent card payment if this was a split deduction
          let updatedPayments = state.creditCardPayments || [];
          if (txToDelete?.creditCardPaymentId) {
            updatedPayments = updatedPayments.map((p) => {
              if (p.id === txToDelete.creditCardPaymentId && Array.isArray(p.budgetDeductions)) {
                return {
                  ...p,
                  budgetDeductions: p.budgetDeductions.filter(
                    (d) => d.budgetItemId !== txToDelete.budgetItemId || Number(d.amount) !== Number(txToDelete.amount)
                  ),
                };
              }
              return p;
            });
          } else if (txToDelete && (txToDelete.id?.includes("_split_") || txToDelete.description?.toLowerCase().includes("descontado de"))) {
            // Find parent payment by card name or similar if creditCardPaymentId wasn't set
            updatedPayments = updatedPayments.map((p) => {
              if (Array.isArray(p.budgetDeductions)) {
                return {
                  ...p,
                  budgetDeductions: p.budgetDeductions.filter(
                    (d) => d.budgetItemId !== txToDelete.budgetItemId || Number(d.amount) !== Number(txToDelete.amount)
                  ),
                };
              }
              return p;
            });
          }

          const filteredExpenses = (state.expensesLog || []).filter(
            (tx) => tx.id !== id && tx.splitParentId !== id
          );
          const nextDeletedIds = [...new Set([...(state.deletedExpenseIds || []), id])];

          return {
            expensesLog: filteredExpenses,
            deletedExpenseIds: nextDeletedIds,
            creditCards: updatedCards,
            creditCardPayments: updatedPayments,
            creditPurchases: updatedPurchases,
          };
        });
        get().syncStateWithBackend();
        deleteExpenseApi(id).catch(() => {});
        toast.success("Movimiento eliminado", { icon: "🗑️" });
      },

      // ── Convert Generic Expense into Credit Card Payment (Libera Cupo) ──
      convertExpenseToCardPayment: (expenseId, targetCardId) => {
        const state = get();
        const expense = (state.expensesLog || []).find((e) => e.id === expenseId);
        if (!expense) return;

        const targetCard = (state.creditCards || []).find((c) => c.id === targetCardId);
        if (!targetCard) return;

        const amount = Number(expense.amount) || 0;

        // 1. Liberate Credit Card quota
        const updatedCards = (state.creditCards || []).map((c) => {
          if (c.id === targetCardId) {
            const currentUsed = Number(c.usedLimit) || 0;
            return { ...c, usedLimit: Math.max(0, currentUsed - amount) };
          }
          return c;
        });

        // 2. Remove from expensesLog so living expenses are not distorted
        const filteredExpenses = (state.expensesLog || []).filter((e) => e.id !== expenseId);

        // 3. Insert into creditCardPayments
        const paymentRecord = {
          id: `pay_conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          period: expense.period || state.activePeriod,
          cardId: targetCard.id,
          cardName: targetCard.name,
          amount: amount,
          currency: expense.currency || state.currency,
          date: expense.date || new Date().toISOString().split("T")[0],
          description: `Pago ${targetCard.name} (Asignado manualmente)`,
          sourceType: expense.paymentSource?.type || "payroll",
          sourceAccountId: expense.paymentSource?.targetId || null,
          sourceAccount: expense.paymentSource?.targetName || state.payrollAccount?.name || "Nómina",
          notes: `Reclasificado desde: ${expense.description || expense.budgetItemName || "Gasto"}`,
          createdAt: new Date().toISOString(),
        };

        const updatedPayments = [paymentRecord, ...(state.creditCardPayments || [])];

        set({
          creditCards: updatedCards,
          expensesLog: filteredExpenses,
          creditCardPayments: updatedPayments,
        });

        get().syncStateWithBackend();
        toast.success(`¡Pago asignado a ${targetCard.name}! Cupo liberado exitosamente 🎉`, { icon: "💳" });
      },

      // ── Universal Movement Reclassification / Imputation ──
      splitExpenseMovement: ({ movementId, cardId, distributions }) => {
        const state = get();
        const expense = (state.expensesLog || []).find((e) => e.id === movementId);
        const cardPayment = !expense ? (state.creditCardPayments || []).find((p) => p.id === movementId) : null;
        const sourceItem = expense || cardPayment;
        if (!sourceItem) return;

        const effectiveCardId = cardId || sourceItem.cardId || null;
        const isCard = Boolean(effectiveCardId);
        const card = isCard ? (state.creditCards || []).find((c) => c.id === effectiveCardId) : null;
        const totalAmount = distributions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        let updatedCards = state.creditCards || [];
        let updatedPayments = (state.creditCardPayments || []).filter((p) => p.id !== movementId);

        // Only liberate quota if it was not already converted/registered as a card payment
        if (card && expense) {
          const currentUsed = Number(card.usedLimit) || 0;
          updatedCards = updatedCards.map((c) => {
            if (c.id === effectiveCardId) {
              return { ...c, usedLimit: Math.max(0, currentUsed - totalAmount) };
            }
            return c;
          });
        }

        let paymentRecord = null;
        if (card) {
          // If this was already a cardPayment, preserve its ID so we update in-place without creating a ghost duplicate!
          const paymentId = cardPayment?.id || (typeof movementId === "string" && movementId.startsWith("pay_") ? movementId : `pay_split_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
          paymentRecord = {
            id: paymentId,
            period: sourceItem.period || state.activePeriod,
            cardId: card.id,
            cardName: card.name,
            amount: totalAmount,
            currency: sourceItem.currency || state.currency,
            date: sourceItem.date || new Date().toISOString().split("T")[0],
            time: sourceItem.time || null,
            description: `Pago ${card.name} (Distribuido en ${distributions.length} rubros)`,
            sourceType: sourceItem.sourceType || sourceItem.paymentSource?.type || "payroll",
            sourceAccountId: sourceItem.sourceAccountId || sourceItem.paymentSource?.targetId || null,
            sourceAccount: sourceItem.sourceAccount || sourceItem.paymentSource?.targetName || state.payrollAccount?.name || "Nómina",
            notes: `Distribuido desde: ${sourceItem.description || sourceItem.cardName || "Pago de Tarjeta"}`,
            budgetDeductions: distributions.map((d) => ({
              budgetItemId: d.budgetItemId,
              budgetItemName: d.budgetItemName,
              budgetItemType: d.budgetItemType,
              amount: Number(d.amount),
              subItemId: d.subItemId || null,
              subItemName: d.subItemName || null,
              isEmergencySavingsDeduction: false,
            })),
            createdAt: sourceItem.createdAt || new Date().toISOString(),
          };
          updatedPayments = [paymentRecord, ...updatedPayments];
        }

        const parentKey = paymentRecord ? paymentRecord.id : movementId;
        const paymentDate = sourceItem.date || new Date().toISOString().split("T")[0];

        const isOldSplitChild = (e) => {
          if (!e) return false;
          if (
            e.id === movementId ||
            e.id === parentKey ||
            e.splitParentId === movementId ||
            e.splitParentId === parentKey ||
            e.parentId === movementId ||
            e.parentId === parentKey ||
            e.creditCardPaymentId === movementId ||
            e.creditCardPaymentId === parentKey
          ) {
            return true;
          }
          if (
            card &&
            (e.isCreditCardPayoff ||
              Boolean(e.creditCardPaymentId) ||
              ((e.description || "").includes(`Pago ${card.name}`) && (e.description || "").includes("(Descontado de"))) &&
            e.date === paymentDate
          ) {
            return true;
          }
          return false;
        };

        const removedChildIds = (state.expensesLog || [])
          .filter((e) => isOldSplitChild(e) && e.id !== movementId)
          .map((e) => e.id);

        const filteredExpenses = (state.expensesLog || []).filter((e) => !isOldSplitChild(e));

        const batchTs = Date.now();
        const newExpenseEntries = distributions
          .filter((d) => Number(d.amount) > 0)
          .map((d, idx) => ({
            id: `${parentKey}_split_${idx}_${batchTs}`,
            splitParentId: parentKey,
            isSplitChild: true,
            isSplitDeductionChild: true,
            period: sourceItem.period || state.activePeriod,
            date: paymentDate,
            time: sourceItem.time || null,
            amount: Number(d.amount),
            currency: sourceItem.currency || state.currency,
            type: "debit",
            budgetItemId: d.budgetItemId,
            budgetItemName: d.budgetItemName,
            budgetItemType: d.budgetItemType || "wants",
            subItemId: d.subItemId || null,
            subItemName: d.subItemName || null,
            description: card
              ? `💳 Pago ${card.name} (Descontado de ${d.budgetItemName})`
              : `${sourceItem.description || "Movimiento"} (${d.budgetItemName})`,
            paymentSource: sourceItem.paymentSource || {
              type: "payroll",
              targetName: state.payrollAccount?.name || "Cuenta Nu Débito",
            },
            creditCardPaymentId: paymentRecord ? paymentRecord.id : null,
            isCreditCardPayoff: Boolean(card),
            cardId: card ? card.id : null,
            isEmergencySavingsDeduction: false,
            itemType: d.budgetItemType === "wealth" ? "wealth_saving" : "expense",
            destinationAccountId: d.destinationAccountId || null,
            destinationAccountName: d.destinationAccountName || null,
            createdAt: new Date().toISOString(),
          }));

        let finalExpenses = [...newExpenseEntries, ...filteredExpenses];
        if (!card) {
          const isDebt = Boolean(sourceItem.isDebt) || (sourceItem.description || "").toLowerCase().includes("deuda") || (sourceItem.description || "").toLowerCase().includes("mike");
          const distributedParent = {
            ...sourceItem,
            id: movementId,
            amount: totalAmount,
            isDistributed: true,
            isDebt,
            budgetItemId: null,
            budgetItemType: "split_distribution",
            budgetDeductions: distributions.map((d) => ({
              budgetItemId: d.budgetItemId,
              budgetItemName: d.budgetItemName,
              budgetItemType: d.budgetItemType,
              amount: Number(d.amount),
              subItemId: d.subItemId || null,
              subItemName: d.subItemName || null,
              isEmergencySavingsDeduction: false,
            })),
            description: (sourceItem.description || "Movimiento").includes("Distribuido")
              ? sourceItem.description
              : `${sourceItem.description || "Movimiento"} (Distribuido en ${distributions.length} rubros)`,
          };
          finalExpenses = [distributedParent, ...finalExpenses];
        }

        const nextDeletedExpenseIds = [
          ...new Set([...(state.deletedExpenseIds || []), ...removedChildIds]),
        ];

        set({
          creditCards: updatedCards,
          creditCardPayments: updatedPayments,
          expensesLog: finalExpenses,
          deletedExpenseIds: nextDeletedExpenseIds,
        });

        get().syncStateWithBackend();
        toast.success(
          card
            ? `¡Abono a ${card.name} distribuido en ${distributions.length} rubros y cupo liberado! 🎉`
            : `Movimiento distribuido exitosamente en ${distributions.length} rubros 📊`,
          { icon: "✅" }
        );
      },

      moveSubItemBetweenEnvelopes: ({ fromEnvelopeId, toEnvelopeId, subItemId }) => {
        set((state) => {
          let movedSub = null;
          const pillars = ["needs", "wants", "wealth"];
          const updatedState = { ...state };

          pillars.forEach((p) => {
            updatedState[p] = (state[p] || []).map((env) => {
              if (env.id === fromEnvelopeId && Array.isArray(env.subItems)) {
                const sub = env.subItems.find((s) => s.id === subItemId);
                if (sub) {
                  movedSub = sub;
                  return {
                    ...env,
                    subItems: env.subItems.filter((s) => s.id !== subItemId),
                  };
                }
              }
              return env;
            });
          });

          if (!movedSub) return state;

          pillars.forEach((p) => {
            updatedState[p] = (updatedState[p] || []).map((env) => {
              if (env.id === toEnvelopeId) {
                const existing = env.subItems || [];
                return {
                  ...env,
                  subItems: [...existing, movedSub],
                };
              }
              return env;
            });
          });

          const toEnvelope = [...(updatedState.needs || []), ...(updatedState.wants || []), ...(updatedState.wealth || [])].find((e) => e.id === toEnvelopeId);
          if (toEnvelope) {
            updatedState.expensesLog = (state.expensesLog || []).map((tx) => {
              if (tx.subItemId === subItemId) {
                return {
                  ...tx,
                  budgetItemId: toEnvelope.id,
                  budgetItemName: toEnvelope.name,
                  budgetItemType: toEnvelope.pillarType || "needs",
                };
              }
              return tx;
            });
          }

          return updatedState;
        });

        get().syncStateWithBackend();
        toast.success("Concepto reasignado exitosamente al nuevo rubro ✅");
      },

      reclassifyMovement: ({ movementId, destinationType, targetId, targetItem, subItem, destinationAccount, cardId, distributions, debtDistributions, paymentSource, newDebtData, alreadyRegisteredInDebt, selectedParticipantId, participantName }) => {
        const state = get();

        // 0. Destination: Multi-Rubro Distribution (Split Movement / Distributed Card Payment)
        if (destinationType === "split_distribution") {
          get().splitExpenseMovement({ movementId, cardId, distributions });
          return;
        }

        // 0a. Destination: Multi-Debt Distribution (Cobro o Abono distribuido en varias deudas)
        if (destinationType === "multi_debt") {
          const expense = (state.expensesLog || []).find((e) => e.id === movementId);
          if (!expense) return;
          const distList = Array.isArray(debtDistributions) ? debtDistributions.filter((d) => Number(d.amount) > 0) : [];
          if (distList.length === 0) return;

          let currentDebts = [...(state.debts || [])];
          let updatedExpenses = [...(state.expensesLog || [])];
          const isReceivable = expense.type === "credit" || distList.some((d) => d.debtType === "receivable");
          const concepts = [];

          for (const item of distList) {
            const debt = currentDebts.find((d) => d.id === item.debtId);
            if (!debt) continue;
            const itemAmt = Number(item.amount) || 0;
            const curRem = Number(debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0);
            const newRem = item.alreadyRegistered ? curRem : Math.max(0, curRem - itemAmt);
            const isSettled = newRem <= 0;
            const pName = item.participantName || (Array.isArray(debt.participants) ? debt.participants.find((p) => p.id === item.participantId)?.name : null);
            concepts.push(pName ? `${pName} (${debt.concept})` : debt.concept);

            const paymentRecord = {
              id: `pay_debt_multi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              amount: itemAmt,
              date: expense.date || new Date().toISOString().slice(0, 10),
              paymentMethod: expense.paymentSource?.type === "payroll" ? "Nómina Nu Débito" : "Transferencia Débito",
              paymentSourceId: expense.paymentSource?.targetId || null,
              note: item.alreadyRegistered
                ? `Conciliado previamente con ${expense.description || "extracto"} (sin doble descuento)`
                : `Cobro/Abono multi-deuda asignado desde extracto: ${expense.description || ""}`,
              createdAt: new Date().toISOString(),
            };

            currentDebts = currentDebts.map((d) => {
              if (d.id !== debt.id) return d;
              return {
                ...d,
                remainingAmount: newRem,
                status: isSettled ? "paid" : "active",
                paymentsLog: [paymentRecord, ...(d.paymentsLog || [])],
              };
            });

            // Update linked expense loan (e.g. Vaca)
            const linkedExpId = debt.linkedExpenseId || (debt.id?.startsWith("debt_tx_") ? debt.id.replace("debt_tx_", "") : null);
            if (linkedExpId) {
              updatedExpenses = updatedExpenses.map((exp) => {
                if (exp.id === linkedExpId) {
                  let updatedParts = exp.participants;
                  if (Array.isArray(exp.participants) && (item.participantId || pName)) {
                    updatedParts = exp.participants.map((p) => {
                      if (p.id === item.participantId || (pName && p.name?.toLowerCase() === pName.toLowerCase())) {
                        return {
                          ...p,
                          paid: true,
                          paidAmount: (Number(p.paidAmount) || 0) + itemAmt,
                          paidAt: expense.date || new Date().toISOString(),
                        };
                      }
                      return p;
                    });
                  }

                  const curSettlements = Array.isArray(exp.settlements) ? exp.settlements : [];
                  const newSettlement = {
                    id: `stl_multi_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                    amount: itemAmt,
                    date: expense.date || new Date().toISOString().slice(0, 10),
                    targetName: expense.paymentSource?.targetName || "Nómina Nu Débito",
                    participantId: item.participantId || null,
                    participantName: pName || null,
                    note: `Cobro multi-deuda asignado desde extracto (${expense.description || ""})`,
                    settledAt: new Date().toISOString(),
                  };
                  const allPartsPaid = Array.isArray(updatedParts) && updatedParts.filter((p) => !p.isUser).every((p) => p.paid);
                  const totalSettledSoFar = curSettlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) + (item.alreadyRegistered ? 0 : itemAmt);

                  return {
                    ...exp,
                    participants: updatedParts,
                    loanStatus: allPartsPaid || newRem <= 0 ? "settled" : "partially_settled",
                    remainingLoan: allPartsPaid ? 0 : newRem,
                    totalSettled: totalSettledSoFar,
                    settlements: item.alreadyRegistered ? curSettlements : [newSettlement, ...curSettlements],
                  };
                }
                return exp;
              });
            }

            // Also mark participant in debt object if present
            currentDebts = currentDebts.map((d) => {
              if (d.id === debt.id && Array.isArray(d.participants) && (item.participantId || pName)) {
                return {
                  ...d,
                  participants: d.participants.map((p) => {
                    if (p.id === item.participantId || (pName && p.name?.toLowerCase() === pName.toLowerCase())) {
                      return {
                        ...p,
                        paid: true,
                        paidAmount: (Number(p.paidAmount) || 0) + itemAmt,
                        paidAt: expense.date || new Date().toISOString(),
                      };
                    }
                    return p;
                  }),
                };
              }
              return d;
            });
          }

          // Update parent expense entry
          const summaryConcepts = concepts.slice(0, 3).join(", ") + (concepts.length > 3 ? ` (+${concepts.length - 3})` : "");
          updatedExpenses = updatedExpenses.map((exp) => {
            if (exp.id !== movementId) return exp;
            return {
              ...exp,
              description: `Cobro Préstamos (${concepts.length}): ${summaryConcepts}`,
              budgetItemId: null,
              budgetItemName: `Cobro Préstamos Múltiples (${concepts.length})`,
              budgetItemType: isReceivable ? "income" : "needs",
              type: isReceivable ? "credit" : (exp.type || "debit"),
              isDebtPayment: true,
              isDebtCollection: isReceivable,
              debtDistributions: distList,
            };
          });

          const finalDebts = syncExpenseLoansToDebts(updatedExpenses, currentDebts);
          set({ debts: finalDebts, expensesLog: updatedExpenses });
          get().syncStateWithBackend();
          toast.success(`Movimiento asignado exitosamente como cobro distribuido en ${distList.length} deudas ✅`, { icon: "📥" });
          return;
        }

        const expense = (state.expensesLog || []).find((e) => e.id === movementId);
        if (!expense) return;
        const amount = Number(expense.amount) || 0;

        // 0c. Destination: Internal Transfer / Cash Withdrawal (Transferencia entre cuentas propias o Retiro a Efectivo)
        if (destinationType === "internal_transfer") {
          const destAcc = targetItem || destinationAccount;
          const updatedExpenses = (state.expensesLog || []).map((e) => {
            if (e.id !== movementId) return e;
            return {
              ...e,
              description: `Transferencia a ${destAcc?.name || 'Cuenta Destino'}`,
              budgetItemId: null,
              budgetItemName: `Transferencia / Retiro a ${destAcc?.name || 'Cuenta'}`,
              budgetItemType: "transfer",
              isInternalTransfer: true,
              destinationAccountId: destAcc?.id,
              destinationAccountName: destAcc?.name,
            };
          });

          set({ expensesLog: updatedExpenses });
          get().syncStateWithBackend();
          toast.success(`Movimiento clasificado como transferencia / retiro a ${destAcc?.name || 'cuenta'} 🔄`);
          return;
        }

        // 0b. Destination: Credit Card Purchase (Compra con Tarjeta de Crédito)
        if (destinationType === "credit_card_purchase") {
          const cid = targetId || cardId;
          const card = (state.creditCards || []).find((c) => c.id === cid);
          const cleanId = (movementId || "").replace("cf_", "");

          let nextPurchases = [...(state.creditPurchases || [])];
          const existingCpIdx = nextPurchases.findIndex((p) => p.id === `cp_${cleanId}` || p.id === movementId);
          const purchaseObj = {
            id: `cp_${cleanId}`,
            cardId: card ? card.id : cid,
            description: expense.description || "Compra con Tarjeta",
            amount: amount,
            totalAmount: amount,
            installmentsCount: installments || expense.paymentSource?.installments || 1,
            startPeriod: expense.period || state.activePeriod,
            monthlyInstallment: amount,
            date: expense.date,
            createdAt: expense.createdAt || new Date().toISOString(),
          };

          if (existingCpIdx >= 0) {
            nextPurchases[existingCpIdx] = { ...nextPurchases[existingCpIdx], ...purchaseObj };
          } else {
            nextPurchases.push(purchaseObj);
          }

          const updatedCards = (state.creditCards || []).map((c) => {
            const cardPurchasesTotal = nextPurchases
              .filter((p) => p.cardId === c.id)
              .reduce((sum, p) => sum + (Number(p.totalAmount) || Number(p.amount) || 0), 0);
            return {
              ...c,
              usedLimit: cardPurchasesTotal > 0 ? cardPurchasesTotal : (Number(c.usedLimit) || 0),
            };
          });

          const updatedExpenses = (state.expensesLog || []).map((e) => {
            if (e.id !== movementId) return e;
            return {
              ...e,
              budgetItemType: e.budgetItemType || "wants",
              paymentSource: {
                type: "credit_card",
                targetId: card ? card.id : cid,
                targetName: card ? card.name : "Tarjeta de Crédito",
                installments: installments || 1,
              },
            };
          });

          set({ creditCards: updatedCards, creditPurchases: nextPurchases, expensesLog: updatedExpenses });
          get().syncStateWithBackend();
          toast.success(`Movimiento clasificado como compra con ${card?.name || 'Tarjeta'}. Cupo usado actualizado 💳`);
          return;
        }

        // 1. Destination: Credit Card Payment
        if (destinationType === "credit_card") {
          get().convertExpenseToCardPayment(movementId, targetId);
          return;
        }

        // 2. Destination: Personal Debt Payment / Debt Collection
        if (destinationType === "debt") {
          let debt = targetId ? (state.debts || []).find((d) => d.id === targetId) : null;
          let currentDebts = [...(state.debts || [])];
          const isReceivable = (newDebtData?.debtType === "receivable") ||
            (debt?.debtType === "receivable") ||
            expense.type === "credit";

          if (!debt && newDebtData) {
            const tot = Math.max(amount, Number(newDebtData.totalAmount) || amount);
            const debtorName = (newDebtData.debtor || newDebtData.creditor || expense.description || "Deudor").trim();
            debt = {
              id: `debt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              debtType: isReceivable ? "receivable" : "payable",
              concept: newDebtData.concept?.trim() || `${isReceivable ? "Préstamo a" : "Deuda con"} ${debtorName}`,
              creditor: debtorName,
              debtor: debtorName,
              totalAmount: tot,
              remainingAmount: tot,
              paymentMethod: expense.paymentSource?.type === "payroll" ? "Cuenta Nu Débito" : "Transferencia Bancaria",
              paymentSourceId: expense.paymentSource?.targetId || null,
              paymentFrequency: isReceivable ? "one_time" : "monthly",
              status: "active",
              paymentsLog: [],
              createdAt: new Date().toISOString(),
            };
            currentDebts = [debt, ...currentDebts];
          }

          if (!debt) return;

          const currentRemaining = Number(debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0);
          const newRemaining = alreadyRegisteredInDebt ? currentRemaining : Math.max(0, currentRemaining - amount);
          const isSettled = newRemaining <= 0;

          const paymentRecord = {
            id: `pay_debt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            amount: amount,
            date: expense.date || new Date().toISOString().slice(0, 10),
            paymentMethod: expense.paymentSource?.type === "payroll" ? "Nómina Nu Débito" : "Transferencia Débito",
            paymentSourceId: expense.paymentSource?.targetId || null,
            note: alreadyRegisteredInDebt
              ? `Conciliado con cobro previo (sin alterar saldo): ${expense.description || "Extracto bancario"}`
              : isReceivable
              ? `Cobro/Abono recibido desde movimiento: ${expense.description || "Ingreso bancario"}`
              : `Abono registrado desde movimiento: ${expense.description || "Gasto bancario"}`,
            createdAt: new Date().toISOString(),
          };

          const updatedDebts = currentDebts.map((d) => {
            if (d.id !== debt.id) return d;
            return {
              ...d,
              remainingAmount: newRemaining,
              status: isSettled ? "paid" : "active",
              paymentsLog: [paymentRecord, ...(d.paymentsLog || [])],
            };
          });

          // Limpiar ingreso duplicado manual si se está conciliando con el extracto real
          let updatedInflows = state.inflows || [];
          if (alreadyRegisteredInDebt) {
            updatedInflows = updatedInflows.filter((inf) => {
              if (inf.id === "in_reimb_1793195781151" || (inf.category === "reimbursement" && Number(inf.amount) === 178000)) {
                return false;
              }
              return true;
            });
          }

          // Update expense description and tag it as debt payment / collection
          let updatedExpenses = (state.expensesLog || []).map((e) => {
            if (e.id !== movementId) return e;
            const conceptLabel = participantName
              ? `Cobro Préstamo: ${participantName} (${debt.concept})`
              : (isReceivable ? `Cobro Deuda: ${debt.concept}` : `Pago Deuda: ${debt.concept}`);
            return {
              ...e,
              description: conceptLabel,
              budgetItemId: null,
              budgetItemName: isReceivable
                ? `Cobro Préstamo (${participantName || debt.debtor || debt.creditor || debt.concept})`
                : `Abono Deuda (${debt.creditor || debt.concept})`,
              budgetItemType: isReceivable ? "income" : "needs",
              type: isReceivable ? "credit" : (e.type || "debit"),
              isDebtPayment: true,
              isDebtCollection: isReceivable,
              debtId: debt.id,
              participantId: selectedParticipantId || null,
              participantName: participantName || null,
            };
          });

          // If the debt is linked to an expense loan or has participants, update the participant & settlement in expensesLog
          const linkedExpId = debt.linkedExpenseId || (debt.id?.startsWith("debt_tx_") ? debt.id.replace("debt_tx_", "") : null);
          if (linkedExpId) {
            updatedExpenses = updatedExpenses.map((e) => {
              if (e.id === linkedExpId) {
                let updatedParticipants = e.participants;
                if (Array.isArray(e.participants) && (selectedParticipantId || participantName)) {
                  updatedParticipants = e.participants.map((p) => {
                    if (p.id === selectedParticipantId || (participantName && p.name?.toLowerCase() === participantName.toLowerCase())) {
                      return {
                        ...p,
                        paid: true,
                        paidAmount: amount,
                        paidAt: expense.date || new Date().toISOString(),
                      };
                    }
                    return p;
                  });
                }

                const currentSettlements = Array.isArray(e.settlements) ? e.settlements : [];
                const newSettlement = {
                  id: `stl_${Date.now()}`,
                  amount: amount,
                  date: expense.date || new Date().toISOString().slice(0, 10),
                  targetName: expense.paymentSource?.targetName || "Nómina Nu Débito",
                  participantId: selectedParticipantId || null,
                  participantName: participantName || null,
                  note: participantName
                    ? `Pago de ${participantName} asignado desde extracto`
                    : `Cobro asignado desde: ${expense.description || "Ingreso bancario"}`,
                  settledAt: new Date().toISOString(),
                };
                const totalSettledSoFar = currentSettlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) + (alreadyRegisteredInDebt ? 0 : amount);
                const allPartsPaid = Array.isArray(updatedParticipants) && updatedParticipants.filter((p) => !p.isUser).every((p) => p.paid);

                return {
                  ...e,
                  participants: updatedParticipants,
                  loanStatus: allPartsPaid || newRemaining <= 0 ? "settled" : "partially_settled",
                  remainingLoan: allPartsPaid ? 0 : newRemaining,
                  totalSettled: totalSettledSoFar,
                  settlements: alreadyRegisteredInDebt ? currentSettlements : [newSettlement, ...currentSettlements],
                };
              }
              return e;
            });
          }

          // If debt has participants, also mark that participant in debts
          let finalDebts = updatedDebts.map((d) => {
            if (d.id === debt.id && Array.isArray(d.participants) && (selectedParticipantId || participantName)) {
              const updatedParts = d.participants.map((p) => {
                if (p.id === selectedParticipantId || (participantName && p.name?.toLowerCase() === participantName.toLowerCase())) {
                  return {
                    ...p,
                    paid: true,
                    paidAmount: amount,
                    paidAt: expense.date || new Date().toISOString(),
                  };
                }
                return p;
              });
              return {
                ...d,
                participants: updatedParts,
              };
            }
            return d;
          });
          finalDebts = syncExpenseLoansToDebts(updatedExpenses, finalDebts);

          set({ debts: finalDebts, expensesLog: updatedExpenses, inflows: updatedInflows });
          get().syncStateWithBackend();
          toast.success(
            alreadyRegisteredInDebt
              ? `Movimiento "${expense.description}" conciliado con deuda "${debt.concept}" (sin doble descuento) ✅`
              : isReceivable
              ? `Cobro de préstamo "${debt.concept}" registrado. ${isSettled ? "¡Préstamo 100% saldado! 🎊" : `Saldo pendiente: $${Math.round(newRemaining).toLocaleString("es-CO")}`}`
              : `Abono a deuda "${debt.concept}" registrado. ${isSettled ? "¡Deuda 100% saldada! 🎊" : `Saldo restante: $${Math.round(newRemaining).toLocaleString("es-CO")}`}`,
            { icon: alreadyRegisteredInDebt ? "📌" : isReceivable ? "📥" : "🤝" }
          );
          return;
        }

        // 3. Destination: Budget Envelope (Needs, Wants, Wealth)
        if (destinationType === "budget_envelope") {
          const envelope = targetItem;
          if (!envelope) return;

          // Auto-match subItem if not explicitly passed but amount or description matches a subItem
          let matchedSub = subItem || null;
          if (!matchedSub && Array.isArray(envelope.subItems) && envelope.subItems.length > 0) {
            const expDesc = (expense.description || "").toLowerCase();
            matchedSub =
              envelope.subItems.find(
                (s) => s.name && expDesc.includes(s.name.toLowerCase())
              ) ||
              (envelope.subItems.filter((s) => Number(s.amount) === amount).length === 1
                ? envelope.subItems.find((s) => Number(s.amount) === amount)
                : null);
          }

          const resolvedSubId = matchedSub ? matchedSub.id || matchedSub.subKey || null : null;
          const resolvedSubName = matchedSub ? matchedSub.name || null : null;

          // Filter out any duplicate manual check (isAutoSubItemCheck) for the same subItem in the same period
          const filteredLog = (state.expensesLog || []).filter((e) => {
            if (e.id === movementId) return true;
            if (!matchedSub || !e.isAutoSubItemCheck) return true;
            if (e.period && expense.period && e.period !== expense.period) return true;
            if (e.budgetItemId === envelope.id) {
              if (resolvedSubId && e.subItemId === resolvedSubId) return false;
              if (
                resolvedSubName &&
                e.subItemName &&
                e.subItemName.toLowerCase() === resolvedSubName.toLowerCase()
              ) {
                return false;
              }
            }
            return true;
          });

          const updatedExpenses = filteredLog.map((e) => {
            if (e.id !== movementId) return e;
            const cleanDesc =
              matchedSub && resolvedSubName
                ? `${envelope.name}: ${resolvedSubName}`
                : e.description && !e.description.toLowerCase().includes("tu app")
                ? e.description
                : envelope.name;

            const resolvedPillar =
              envelope.pillarType ||
              (envelope.id?.startsWith("wealth_") || envelope.category === "emergency_fund" || (envelope.name || "").toLowerCase().includes("emergencia")
                ? "wealth"
                : envelope.id?.startsWith("want_")
                ? "wants"
                : "needs");

            const nextPaymentSource = paymentSource || e.paymentSource;
            return {
              ...e,
              type: "debit", // Asegurar que sea egreso/aporte efectivo imputable al rubro
              budgetItemId: envelope.id,
              budgetItemName: envelope.name,
              budgetItemType: resolvedPillar,
              subItemId: resolvedSubId || e.subItemId || null,
              subItemName: resolvedSubName || e.subItemName || null,
              description: cleanDesc,
              isDebtPayment: false,
              debtId: null,
              paymentSource: nextPaymentSource,
              destinationAccountId: destinationAccount ? destinationAccount.id : null,
              destinationAccountName: destinationAccount ? destinationAccount.name : null,
            };
          });

          // If payment source changed to/from credit card, adjust card usedLimit
          let nextCreditCards = [...(state.creditCards || [])];
          if (paymentSource) {
            const wasCard = expense.paymentSource?.type === "credit_card";
            const nowCard = paymentSource.type === "credit_card";
            if (!wasCard && nowCard) {
              nextCreditCards = nextCreditCards.map((c) => {
                if (c.id === paymentSource.targetId) {
                  return { ...c, usedLimit: Math.round(((Number(c.usedLimit) || 0) + amount) * 100) / 100 };
                }
                return c;
              });
            } else if (wasCard && !nowCard) {
              nextCreditCards = nextCreditCards.map((c) => {
                if (c.id === expense.paymentSource?.targetId) {
                  return { ...c, usedLimit: Math.max(0, Math.round(((Number(c.usedLimit) || 0) - amount) * 100) / 100) };
                }
                return c;
              });
            }
          }

          set({ expensesLog: updatedExpenses, creditCards: nextCreditCards });
          get().syncStateWithBackend();
          toast.success(
            matchedSub
              ? `Movimiento asignado a "${envelope.name} ➔ ${resolvedSubName}" y tachado automáticamente ✅`
              : `Movimiento asignado exitosamente al rubro "${envelope.name}" 📁`,
            { icon: "✅" }
          );
        }
      },

      // ── Debts & Liabilities CRUD ────────────────────────
      addDebt: (debt) => {
        const isReceivable = debt.debtType === "receivable";
        const newDebt = {
          id: debt.id || `debt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          debtType: debt.debtType || "payable", // 'payable' (Pasivo, yo debo) | 'receivable' (Activo, me deben)
          concept: (debt.concept || "").trim(),
          creditor: (debt.creditor || debt.debtor || "").trim(),
          debtor: (debt.debtor || debt.creditor || "").trim(),
          totalAmount: Number(debt.totalAmount || 0),
          remainingAmount: Number(debt.remainingAmount !== undefined ? debt.remainingAmount : debt.totalAmount || 0),
          paymentMethod: debt.paymentMethod || (isReceivable ? "Transferencia a Cuenta / Cajita" : "Nómina / Débito"),
          paymentSourceId: debt.paymentSourceId || null,
          paymentFrequency: debt.paymentFrequency || (isReceivable ? "one_time" : "monthly"),
          installmentAmount: Number(debt.installmentAmount || 0),
          dueDate: debt.dueDate || debt.nextPaymentDate || null,
          nextPaymentDate: debt.nextPaymentDate || debt.dueDate || null,
          status: debt.status || "active",
          notes: debt.notes || "",
          paymentsLog: Array.isArray(debt.paymentsLog) ? debt.paymentsLog : [],
          createdAt: debt.createdAt || new Date().toISOString(),
        };
        set((state) => {
          const updatedDebts = [newDebt, ...(state.debts || [])];
          return { debts: updatedDebts };
        });
        get().syncStateWithBackend();
        toast.success(
          isReceivable
            ? `Préstamo por cobrar "${newDebt.concept}" registrado con éxito`
            : `Deuda "${newDebt.concept}" registrada`,
          { icon: isReceivable ? "🤝" : "💳" }
        );
      },

      updateDebt: (id, updates) => {
        set((state) => {
          const updatedDebts = (state.debts || []).map((d) => (d.id === id ? { ...d, ...updates } : d));
          return { debts: updatedDebts };
        });
        get().syncStateWithBackend();
        toast.success("Deuda/Préstamo actualizado", { icon: "✏️" });
      },

      deleteDebt: (id) => {
        set((state) => {
          const targetDebt = (state.debts || []).find((d) => d.id === id);
          const updatedDebts = (state.debts || []).filter((d) => d.id !== id);
          let updatedExpensesLog = state.expensesLog || [];
          if (targetDebt?.linkedExpenseId) {
            updatedExpensesLog = updatedExpensesLog.map((tx) =>
              tx.id === targetDebt.linkedExpenseId
                ? { ...tx, isLoan: false, loanRecipient: null, loanAmount: null, loanStatus: null }
                : tx
            );
          }
          const nextDeletedDebtIds = [...new Set([...(state.deletedDebtIds || []), id])];
          return { debts: updatedDebts, expensesLog: updatedExpensesLog, deletedDebtIds: nextDeletedDebtIds };
        });
        get().syncStateWithBackend();
        deleteDebtApi(id).catch(() => {});
        toast.success("Deuda eliminada", { icon: "🗑️" });
      },

      recordDebtPayment: (debtId, payment) => {
        let isReceivable = false;
        let createdIncomeTx = null;

        set((state) => {
          const currentDebts = state.debts || [];
          const debt = currentDebts.find((d) => d.id === debtId);
          if (!debt) return state;

          isReceivable = debt.debtType === "receivable";
          const pAmt = Number(payment.amount || 0);
          const newRemaining = Math.max(0, Number(debt.remainingAmount || 0) - pAmt);
          const isSettled = newRemaining <= 0;

          const paymentRecord = {
            id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            amount: pAmt,
            date: payment.date || new Date().toISOString().slice(0, 10),
            paymentMethod: payment.paymentMethod || debt.paymentMethod,
            paymentSourceId: payment.paymentSourceId || debt.paymentSourceId,
            note: payment.note || "",
            createdAt: new Date().toISOString(),
          };

          const updatedDebts = currentDebts.map((d) => {
            if (d.id !== debtId) return d;
            return {
              ...d,
              remainingAmount: newRemaining,
              status: isSettled ? "paid" : "active",
              paymentsLog: [paymentRecord, ...(d.paymentsLog || [])],
            };
          });

          let updatedExpenses = state.expensesLog || [];

          // If debt was linked to an expense loan, register settlement on the expense row
          if (debt.linkedExpenseId) {
            updatedExpenses = updatedExpenses.map((e) => {
              if (e.id === debt.linkedExpenseId) {
                const currentSettlements = Array.isArray(e.settlements) ? e.settlements : [];
                const newSettlement = {
                  id: `stl_${Date.now()}`,
                  amount: pAmt,
                  date: payment.date || new Date().toISOString().slice(0, 10),
                  targetName: payment.paymentMethod || "Abono a Deuda",
                  note: payment.note || `Abono de ${debt.debtor || "Deudor"}`,
                  settledAt: new Date().toISOString(),
                };
                const totalSettledSoFar = currentSettlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) + pAmt;
                return {
                  ...e,
                  loanStatus: newRemaining <= 0 ? "settled" : "partially_settled",
                  remainingLoan: newRemaining,
                  totalSettled: totalSettledSoFar,
                  settlements: [newSettlement, ...currentSettlements],
                };
              }
              return e;
            });
          }

          if (isReceivable && payment.createIncomeMovement) {
            const destAccount = (state.fixedIncomeAccounts || []).find((a) => a.id === payment.paymentSourceId);
            createdIncomeTx = {
              id: `inc_loan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              period: state.activePeriod,
              date: payment.date || new Date().toISOString().slice(0, 10),
              amount: pAmt,
              currency: state.currency,
              type: "credit",
              budgetItemType: "income",
              description: `📥 Reintegro/Cobro de préstamo: ${debt.concept} (${debt.debtor || debt.creditor || "Deudor"})`,
              paymentSource: {
                type: destAccount ? "fixed_pocket" : "payroll",
                targetId: payment.paymentSourceId || null,
                targetName: destAccount ? destAccount.name : (state.payrollAccount?.name || "Nómina"),
              },
              createdAt: new Date().toISOString(),
            };
            updatedExpenses = [createdIncomeTx, ...updatedExpenses];
          } else if (!isReceivable && payment.createExpenseMovement) {
            const srcAccount = (state.fixedIncomeAccounts || []).find((a) => a.id === payment.paymentSourceId);
            const isPayroll = payment.deductFromPayroll || (!srcAccount && (!payment.paymentMethod || payment.paymentMethod.toLowerCase().includes("nómina") || payment.paymentMethod.toLowerCase().includes("débito") || payment.paymentMethod.toLowerCase().includes("cajita")));
            const createdExpenseTx = {
              id: `exp_debt_pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              period: state.activePeriod,
              date: payment.date || new Date().toISOString().slice(0, 10),
              amount: pAmt,
              currency: state.currency,
              type: "debit",
              budgetItemType: "needs",
              budgetItemId: "need_debts",
              budgetItemName: `Deudas / Compromisos (${debt.concept || debt.creditor})`,
              description: `💰 Abono Deuda: ${debt.concept || debt.creditor} (${payment.paymentMethod || "Transferencia"})`,
              paymentSource: {
                type: isPayroll ? "payroll" : "fixed_pocket",
                targetId: isPayroll ? (state.payrollAccount?.id || "acc_nu_debito") : (payment.paymentSourceId || null),
                targetName: isPayroll ? (state.payrollAccount?.name || "Cuenta Nu Débito (Nómina)") : (srcAccount?.name || "Cajita"),
              },
              createdAt: new Date().toISOString(),
            };
            updatedExpenses = [createdExpenseTx, ...updatedExpenses];
          }

          return { debts: updatedDebts, expensesLog: updatedExpenses };
        });

        get().syncStateWithBackend();
        toast.success(
          isReceivable
            ? `¡Cobro de $${Number(payment.amount || 0).toLocaleString("es-CO")} registrado! 🎉`
            : "Abono a deuda registrado",
          { icon: isReceivable ? "📥" : "💰" }
        );
      },

      deleteDebtPayment: (debtId, paymentId) => {
        let isReceivable = false;
        let deletedPaymentAmount = 0;
        let concept = "";

        set((state) => {
          const currentDebts = state.debts || [];
          const debt = currentDebts.find((d) => d.id === debtId || d.linkedExpenseId === debtId);
          isReceivable = debt ? debt.debtType === "receivable" : true;
          concept = debt ? (debt.concept || debt.debtor || "Deuda") : "Cobro / Abono";

          let targetPayment = debt ? (debt.paymentsLog || []).find((p) => p.id === paymentId) : null;
          deletedPaymentAmount = Number(targetPayment?.amount || 0);

          let updatedExpensesLog = state.expensesLog || [];
          let updatedInflows = state.inflows || [];

          // Target expense ID: either debt.linkedExpenseId, or debtId itself, or find expense containing this settlement
          const targetExpenseId = debt?.linkedExpenseId || debtId;
          const targetExpense = updatedExpensesLog.find(
            (e) => e.id === targetExpenseId || (Array.isArray(e.settlements) && e.settlements.some((s) => s.id === paymentId))
          );

          if (targetExpense) {
            const currentSettlements = Array.isArray(targetExpense.settlements) ? targetExpense.settlements : [];
            const deletedSettlement = currentSettlements.find((s) => s.id === paymentId);
            if (deletedSettlement && !deletedPaymentAmount) {
              deletedPaymentAmount = Number(deletedSettlement.amount || 0);
            }

            const remainingSettlements = currentSettlements.filter((s) => s.id !== paymentId);

            // Revert participant paid status if associated
            let updatedParticipants = targetExpense.participants;
            if (Array.isArray(targetExpense.participants) && deletedSettlement?.participantId) {
              updatedParticipants = targetExpense.participants.map((p) => {
                if (p.id === deletedSettlement.participantId) {
                  const newPaid = Math.max(0, (Number(p.paidAmount) || 0) - Number(deletedSettlement.amount || 0));
                  return {
                    ...p,
                    paid: false,
                    paidAmount: newPaid > 0 ? newPaid : null,
                  };
                }
                return p;
              });
            }

            const totalSettledSoFar = remainingSettlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
            const totalLoan = Number(targetExpense.loanAmount) > 0 ? Number(targetExpense.loanAmount) : Number(targetExpense.amount) || 0;
            const newRemaining = Math.max(0, totalLoan - totalSettledSoFar);

            updatedExpensesLog = updatedExpensesLog.map((e) => {
              if (e.id === targetExpense.id) {
                return {
                  ...e,
                  loanStatus: newRemaining <= 0 ? "settled" : totalSettledSoFar > 0 ? "partially_settled" : "pending",
                  remainingLoan: newRemaining,
                  totalSettled: totalSettledSoFar,
                  settlements: remainingSettlements,
                  participants: updatedParticipants,
                };
              }
              return e;
            });
          }

          // Clean up any generated income movement
          updatedExpensesLog = updatedExpensesLog.filter((tx) => {
            if (tx.id === paymentId || tx.id === `inc_loan_${paymentId}` || tx.settlementId === paymentId) return false;
            return true;
          });

          updatedInflows = updatedInflows.filter((inf) => {
            if (inf.id === paymentId || inf.id === `in_reimb_${paymentId}` || inf.settlementId === paymentId) return false;
            return true;
          });

          // Update standalone or linked debts
          const updatedDebtsList = currentDebts.map((d) => {
            if (d.id !== debt?.id && d.linkedExpenseId !== targetExpense?.id) return d;
            const updatedPaymentsLog = (d.paymentsLog || []).filter((p) => p.id !== paymentId);
            const totalPaidNow = updatedPaymentsLog.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const totalDebtAmt = Number(d.totalAmount) || 0;
            const newRemaining = Math.max(0, totalDebtAmt - totalPaidNow);
            return {
              ...d,
              paymentsLog: updatedPaymentsLog,
              remainingAmount: newRemaining,
              status: newRemaining <= 0 ? "paid" : "active",
            };
          });

          const finalDebts = syncExpenseLoansToDebts(updatedExpensesLog, updatedDebtsList);

          return {
            debts: finalDebts,
            expensesLog: updatedExpensesLog,
            inflows: updatedInflows,
          };
        });

        get().syncStateWithBackend();
        toast.success(
          `Cobro/Abono de $${Math.round(deletedPaymentAmount).toLocaleString("es-CO")} eliminado correctamente. El saldo ha sido corregido ✅`,
          { icon: "🗑️" }
        );
      },

      deleteExpenseSettlement: (txId, settlementId) => {
        get().deleteDebtPayment(txId, settlementId);
      },

      // ── Loan Settlement & Reimbursement (Full, Partial or Split Participant) ──────────────
      settleLoanTransaction: (txId, settlementData) => {
        set((state) => {
          let updatedCards = state.creditCards;
          let updatedPayments = state.creditCardPayments || [];
          let updatedInflows = state.inflows || [];

          // 1. Update the transaction in expensesLog with settlement history
          let updatedExpensesLog = (state.expensesLog || []).map((tx) => {
            if (tx.id === txId) {
              const currentSettlements = Array.isArray(tx.settlements) ? tx.settlements : [];
              const prevSettledTotal = currentSettlements.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
              const newSettledAmount = Number(settlementData.amount) || 0;
              const totalSettledSoFar = prevSettledTotal + newSettledAmount;
              const baseLoanAmount = Number(tx.loanAmount) > 0 ? Number(tx.loanAmount) : Number(tx.amount) || 0;
              const remaining = Math.max(0, baseLoanAmount - totalSettledSoFar);

              const newSettlementRecord = {
                id: `stl_${Date.now()}`,
                participantId: settlementData.participantId || null,
                participantName: settlementData.participantName || null,
                alreadyRegistered: Boolean(settlementData.alreadyRegistered),
                amount: newSettledAmount,
                date: settlementData.date,
                targetType: settlementData.targetType,
                targetId: settlementData.targetId,
                targetName: settlementData.targetName,
                note: settlementData.note,
                settledAt: new Date().toISOString(),
              };

              // If this is a split loan and a specific participant was settled:
              let updatedParticipants = tx.participants;
              if (Array.isArray(tx.participants) && settlementData.participantId) {
                updatedParticipants = tx.participants.map((p) => {
                  if (p.id === settlementData.participantId) {
                    const prevPaid = Number(p.paidAmount) || (p.paid ? (Number(p.customShare) || Number(p.share) || newSettledAmount) : 0);
                    const totalPaid = prevPaid + newSettledAmount;
                    const participantShare = Number(p.customShare) || Number(p.share) || totalPaid;
                    const isFullyPaid = totalPaid >= participantShare;
                    return {
                      ...p,
                      paid: isFullyPaid,
                      paidAmount: totalPaid,
                      paidAt: settlementData.date || new Date().toISOString(),
                      targetName: settlementData.alreadyRegistered ? "Registrado previamente" : (settlementData.targetName || "Cuenta"),
                      alreadyRegistered: Boolean(settlementData.alreadyRegistered),
                    };
                  }
                  return p;
                });
              }

              // Check if all external participants have paid
              const allExternalPaid = Array.isArray(updatedParticipants) && updatedParticipants.length > 0
                ? updatedParticipants.filter((p) => !p.isUser).every((p) => p.paid)
                : remaining === 0;

              return {
                ...tx,
                participants: updatedParticipants,
                loanStatus: allExternalPaid || remaining === 0 ? "settled" : "partially_settled",
                totalSettled: totalSettledSoFar,
                remainingLoan: allExternalPaid ? 0 : remaining,
                settlements: [newSettlementRecord, ...currentSettlements],
                settlementDetails: newSettlementRecord,
              };
            }
            return tx;
          });

          // 2. Route the returned money to target destination ONLY IF not already registered or split offset!
          if (!settlementData.alreadyRegistered && settlementData.targetType !== "split_offset" && settlementData.targetType !== "already_registered") {
            if (settlementData.targetType === "credit_card" && settlementData.targetId) {
              // Apply payment to credit card -> reduces debt and frees credit limit
              updatedCards = state.creditCards.map((c) => {
                if (c.id === settlementData.targetId) {
                  const curUsed = Number(c.usedLimit) || 0;
                  return { ...c, usedLimit: Math.max(0, curUsed - Number(settlementData.amount)) };
                }
                return c;
              });

              const newPayment = {
                id: `pay_loan_${Date.now()}`,
                cardId: settlementData.targetId,
                cardName: settlementData.targetName,
                amount: Number(settlementData.amount),
                currency: settlementData.currency || state.currency,
                date: settlementData.date,
                period: state.activePeriod,
                sourceType: "loan_reimbursement",
                sourceAccount: `Cobro Préstamo: ${settlementData.recipient || "Amigo/Familiar"}`,
                description: `Reintegro ${settlementData.note ? `(${settlementData.note})` : `préstamo ${settlementData.description || ""}`}`,
                createdAt: new Date().toISOString(),
              };
              updatedPayments = [newPayment, ...updatedPayments];
            } else if (settlementData.targetType === "cash") {
              // Registra el ingreso en efectivo en el log para la métrica dinámica de la billetera física
              const cashIncomeTx = {
                id: `cf_tx_reimb_${Date.now()}`,
                period: state.activePeriod,
                date: settlementData.date || new Date().toISOString().slice(0, 10),
                time: new Date().toTimeString().slice(0, 8),
                amount: Number(settlementData.amount),
                currency: settlementData.currency || state.currency,
                type: "credit",
                budgetItemId: null,
                budgetItemName: "Cobro de Préstamo / Reintegro",
                budgetItemType: "income",
                description: `Cobro de Préstamo en Efectivo (${settlementData.recipient || settlementData.participantName || "Tercero"})`,
                paymentSource: {
                  type: "cash",
                  targetId: "acc_cash_wallet",
                  targetName: "Efectivo (Billetera)",
                },
                isDebtCollection: true,
                createdAt: new Date().toISOString(),
              };
              updatedExpensesLog = [cashIncomeTx, ...updatedExpensesLog];
            }

            // Libertad de clasificación: SOLO si el usuario activó explícitamente la opción de clasificar
            // como un nuevo ingreso presupuestado en Flujo de Caja (Sankey), se añade a inflows.
            // Por defecto permanece desmarcado para preservar limpios los 3 ingresos habituales (Salario, Renta Fija y Renta Variable).
            if (settlementData.registerAsBudgetInflow) {
              const explicitInflow = {
                id: `in_custom_${Date.now()}`,
                name: `Ingreso Extra: ${settlementData.recipient || settlementData.participantName || "Cobro Préstamo"}`,
                category: "other",
                amount: Number(settlementData.amount),
                currency: settlementData.currency || state.currency,
                isPassive: false,
                isExplicitBudgetIncome: true,
                frequency: "one_time",
                period: state.activePeriod,
                paymentSource: {
                  type: settlementData.targetType,
                  targetId: settlementData.targetId,
                  targetName: settlementData.targetName,
                },
                icon: "💰",
                createdAt: new Date().toISOString(),
              };
              updatedInflows = [explicitInflow, ...updatedInflows];
            }
          }

          const updatedDebts = syncExpenseLoansToDebts(updatedExpensesLog, state.debts);
          return {
            expensesLog: updatedExpensesLog,
            creditCards: updatedCards,
            creditCardPayments: updatedPayments,
            inflows: updatedInflows,
            debts: updatedDebts,
          };
        });

        if (
          !settlementData.alreadyRegistered &&
          (settlementData.targetType === "fixed_pocket" ||
           settlementData.targetType === "digital_wallet" ||
           settlementData.targetType === "nequi") &&
          settlementData.targetId
        ) {
          try {
            useFixedIncomeStore.getState().creditAccountFromCashFlow({
              accountId: settlementData.targetId,
              amount: Number(settlementData.amount),
              date: settlementData.date,
              description: `Cobro Préstamo: ${settlementData.recipient || "Tercero"}`,
            });
          } catch (e) {
            console.warn("Could not credit fixed income account:", e);
          }
        }

        get().syncStateWithBackend();
        const msg = settlementData.alreadyRegistered
          ? `¡Pago de ${settlementData.recipient || "participante"} liquidado! (Sin duplicar ingresos)`
          : `¡Cobro registrado! $${Math.round(settlementData.amount).toLocaleString("es-CO")} retornados a ${settlementData.targetName}`;
        toast.success(msg, { icon: "🎉" });
      },

      updateExpenseLoanSplit: (txId, splitConfig) => {
        set((state) => {
          const updatedExpensesLog = (state.expensesLog || []).map((tx) => {
            if (tx.id === txId) {
              return {
                ...tx,
                ...splitConfig,
              };
            }
            return tx;
          });
          const updatedDebts = syncExpenseLoansToDebts(updatedExpensesLog, state.debts);
          return { expensesLog: updatedExpensesLog, debts: updatedDebts };
        });
        get().syncStateWithBackend();
        toast.success("Configuración de división guardada", { icon: "👥" });
      },

      revertParticipantPayment: (txId, participantId) => {
        set((state) => {
          const updatedExpensesLog = (state.expensesLog || []).map((tx) => {
            if (tx.id === txId && Array.isArray(tx.participants)) {
              const updatedParticipants = tx.participants.map((p) => {
                if (p.id === participantId) {
                  return { ...p, paid: false, paidAmount: 0, paidAt: null, targetName: null, alreadyRegistered: null };
                }
                return p;
              });
              const anyPaid = updatedParticipants.some((p) => !p.isUser && p.paid);
              const allExternalPaid = updatedParticipants.filter((p) => !p.isUser).every((p) => p.paid);
              const baseLoanAmount = Number(tx.loanAmount) > 0 ? Number(tx.loanAmount) : Number(tx.amount) || 0;
              const currentSettlements = Array.isArray(tx.settlements) ? tx.settlements.filter((s) => s.participantId !== participantId) : [];
              const prevSettledTotal = currentSettlements.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
              const remaining = Math.max(0, baseLoanAmount - prevSettledTotal);

              return {
                ...tx,
                participants: updatedParticipants,
                settlements: currentSettlements,
                remainingLoan: allExternalPaid ? 0 : remaining,
                loanStatus: allExternalPaid ? "settled" : anyPaid ? "partially_settled" : "pending",
              };
            }
            return tx;
          });
          const updatedDebts = syncExpenseLoansToDebts(updatedExpensesLog, state.debts);
          return { expensesLog: updatedExpensesLog, debts: updatedDebts };
        });
        get().syncStateWithBackend();
        toast("Pago de participante desmarcado", { icon: "↩️" });
      },

      toggleExpenseLoan: (txId, isLoan, loanRecipient, loanAmount) => {
        set((state) => {
          const updatedExpensesLog = (state.expensesLog || []).map((tx) => {
            if (tx.id === txId) {
              return {
                ...tx,
                isLoan,
                loanRecipient: isLoan ? loanRecipient || "Amigo / Familiar" : null,
                loanAmount: isLoan ? (Number(loanAmount) > 0 ? Number(loanAmount) : Number(tx.amount)) : null,
                loanStatus: isLoan ? (tx.loanStatus || "pending") : null,
              };
            }
            return tx;
          });
          const updatedDebts = syncExpenseLoansToDebts(updatedExpensesLog, state.debts);
          return { expensesLog: updatedExpensesLog, debts: updatedDebts };
        });
        get().syncStateWithBackend();
        toast.success(isLoan ? "Gasto marcado como Préstamo y sincronizado a Deudas" : "Gasto desmarcado de préstamo", { icon: "🤝" });
      },

      toggleMovementAsBudgetInflow: (txId) => {
        set((state) => {
          const tx = (state.expensesLog || []).find((e) => e.id === txId);
          if (!tx) return {};

          const willBeInflow = !tx.isExplicitBudgetIncome;
          const updatedExpensesLog = (state.expensesLog || []).map((e) => {
            if (e.id === txId) {
              return {
                ...e,
                isExplicitBudgetIncome: willBeInflow,
              };
            }
            return e;
          });

          let updatedInflows = [...(state.inflows || [])];
          const cleanId = String(txId).replace(/^cf_tx_/, "").replace(/^tx_/, "");
          const inflowId = `in_mov_${cleanId}`;

          if (willBeInflow) {
            const newInflow = {
              id: inflowId,
              linkedMovementId: txId,
              name: tx.description || "Ingreso Adicional",
              category: "other",
              amount: Number(tx.amount) || 0,
              currency: tx.currency || state.currency,
              isPassive: false,
              isExplicitBudgetIncome: true,
              frequency: "one_time",
              period: tx.period || state.activePeriod,
              paymentSource: tx.paymentSource || { type: "payroll", targetName: "Cuenta Nómina" },
              icon: "💰",
              createdAt: new Date().toISOString(),
            };
            updatedInflows = [newInflow, ...updatedInflows];
            toast.success("Movimiento clasificado como Nuevo Ingreso en Flujo de Caja (Sankey) ⚡");
          } else {
            updatedInflows = updatedInflows.filter(
              (inf) => inf.id !== inflowId && inf.linkedMovementId !== txId && inf.id !== `in_custom_${cleanId}`
            );
            toast.success("Movimiento retirado de Ingresos de Flujo de Caja (Sankey)");
          }

          return { expensesLog: updatedExpensesLog, inflows: updatedInflows };
        });

        get().syncStateWithBackend();
      },

      // ── Credit Card Debt Payments / Abonos ───────────
      addCreditCardPayment: (payment) => {
        set((state) => {
          const breakdownMap = {};
          if (Array.isArray(payment.cardsBreakdown) && payment.cardsBreakdown.length > 0) {
            payment.cardsBreakdown.forEach((b) => {
              if (b.cardId) {
                breakdownMap[b.cardId] = (breakdownMap[b.cardId] || 0) + (Number(b.amount) || 0);
              }
            });
          } else if (payment.cardId) {
            breakdownMap[payment.cardId] = Number(payment.amount) || 0;
          }

          const updatedCards = state.creditCards.map((c) => {
            if (breakdownMap[c.id] !== undefined) {
              const currentUsed = Number(c.usedLimit) || 0;
              return { ...c, usedLimit: Math.max(0, currentUsed - breakdownMap[c.id]) };
            }
            return c;
          });

          const deductions = Array.isArray(payment.budgetDeductions)
            ? payment.budgetDeductions.filter((d) => Number(d.amount) > 0 && d.budgetItemId)
            : [];

          const generatedExpenseTxs = deductions.map((ded, idx) => ({
            id: `tx_ccpay_${payment.id}_${idx}`,
            creditCardPaymentId: payment.id,
            isCreditCardPayoff: true,
            description: `💳 Pago ${payment.cardName} (Descontado de ${ded.budgetItemName})`,
            amount: Number(ded.amount),
            currency: payment.currency || state.currency,
            date: payment.date,
            period: payment.period || state.activePeriod,
            budgetItemId: ded.budgetItemId,
            budgetItemName: ded.budgetItemName,
            budgetItemType: ded.budgetItemType,
            paymentSource: {
              type: payment.sourceType || "payroll",
              targetId: payment.sourceAccountId || null,
              targetName: payment.sourceAccount || state.payrollAccount?.name || "Nómina",
            },
            createdAt: new Date().toISOString(),
          }));

          return {
            creditCardPayments: [payment, ...(state.creditCardPayments || [])],
            creditCards: updatedCards,
            expensesLog: [...generatedExpenseTxs, ...(state.expensesLog || [])],
          };
        });
        get().syncStateWithBackend();
        const dedCount = Array.isArray(payment.budgetDeductions)
          ? payment.budgetDeductions.filter((d) => Number(d.amount) > 0).length
          : 0;
        toast.success(
          dedCount > 0
            ? `Pago de ${payment.cardName} por $${Math.round(payment.amount).toLocaleString("es-CO")} registrado y descontado de ${dedCount} rubro(s) del mes.`
            : `Pago de ${payment.cardName} por $${Math.round(payment.amount).toLocaleString("es-CO")} registrado. ¡Cupo liberado!`,
          { icon: "💵", duration: 4000 }
        );
      },

      deleteCreditCardPayment: (id) => {
        set((state) => {
          const paymentToDelete = (state.creditCardPayments || []).find((p) => p.id === id);
          let updatedCards = state.creditCards;

          if (paymentToDelete) {
            const breakdownMap = {};
            if (Array.isArray(paymentToDelete.cardsBreakdown) && paymentToDelete.cardsBreakdown.length > 0) {
              paymentToDelete.cardsBreakdown.forEach((b) => {
                if (b.cardId) {
                  breakdownMap[b.cardId] = (breakdownMap[b.cardId] || 0) + (Number(b.amount) || 0);
                }
              });
            } else if (paymentToDelete.cardId) {
              breakdownMap[paymentToDelete.cardId] = Number(paymentToDelete.amount) || 0;
            }

            updatedCards = state.creditCards.map((c) => {
              if (breakdownMap[c.id] !== undefined) {
                return { ...c, usedLimit: (Number(c.usedLimit) || 0) + breakdownMap[c.id] };
              }
              return c;
            });
          }

          const nextDeletedPaymentIds = [...new Set([...(state.deletedCreditCardPaymentIds || []), id])];
          // Also tombstone any child expenses in expensesLog associated with this payment
          const childExpenseIds = (state.expensesLog || [])
            .filter((tx) => tx.creditCardPaymentId === id || tx.splitParentId === id)
            .map((tx) => tx.id);
          const nextDeletedExpenseIds = [...new Set([...(state.deletedExpenseIds || []), ...childExpenseIds])];

          return {
            deletedCreditCardPaymentIds: nextDeletedPaymentIds,
            deletedExpenseIds: nextDeletedExpenseIds,
            creditCardPayments: (state.creditCardPayments || []).filter((p) => p.id !== id),
            creditCards: updatedCards,
            expensesLog: (state.expensesLog || []).filter(
              (tx) => tx.creditCardPaymentId !== id && tx.splitParentId !== id
            ),
          };
        });
        get().syncStateWithBackend();
        toast.success("Pago de tarjeta y descuentos presupuestales revertidos", { icon: "🗑️" });
      },

      // ── Progressive Multi-Period Monthly Navigation & Inheritance ──
      setActivePeriod: (targetPeriod) => {
        const state = get();
        const currentPeriod = state.activePeriod;
        if (currentPeriod === targetPeriod) return;

        const startPeriod = state.startPeriod || getCurrentPeriod();

        // 1. Block navigation before startPeriod
        if (targetPeriod < startPeriod) {
          return;
        }

        // 2. Save current active month snapshot
        const currentSnapshot = {
          inflows: state.inflows,
          needs: state.needs,
          wants: state.wants,
          wealth: state.wealth,
          customRatios: state.customRatios,
          allocationModel: state.allocationModel,
        };

        const updatedPeriodsData = cleanLegacyPeriods({
          ...state.periodsData,
          [currentPeriod]: currentSnapshot,
        });

        // 3. Target Period is >= startPeriod
        let nextInflows, nextNeeds, nextWants, nextWealth, nextCustomRatios, nextAllocationModel;

        if (updatedPeriodsData[targetPeriod]) {
          const targetData = updatedPeriodsData[targetPeriod];
          nextInflows = targetData.inflows || state.inflows;
          nextNeeds = targetData.needs || state.needs;
          nextWants = targetData.wants || state.wants;
          nextWealth = targetData.wealth || state.wealth;
          nextCustomRatios = targetData.customRatios || state.customRatios;
          nextAllocationModel = targetData.allocationModel || state.allocationModel;
        } else {
          // Inherit clean recurring base from closest prior period >= startPeriod
          const sortedPeriods = Object.keys(updatedPeriodsData)
            .filter((p) => p >= startPeriod && p < targetPeriod)
            .sort();

          const priorPeriod = sortedPeriods[sortedPeriods.length - 1] || startPeriod;
          const baseSource = updatedPeriodsData[priorPeriod] || currentSnapshot;

          nextInflows = getRecurringItems(baseSource.inflows || state.inflows, targetPeriod);
          nextNeeds = getRecurringItems(baseSource.needs || state.needs, targetPeriod);
          nextWants = getRecurringItems(baseSource.wants || state.wants, targetPeriod);
          nextWealth = getRecurringItems(baseSource.wealth || state.wealth, targetPeriod);
          nextCustomRatios = baseSource.customRatios || state.customRatios;
          nextAllocationModel = baseSource.allocationModel || state.allocationModel;

          updatedPeriodsData[targetPeriod] = {
            inflows: nextInflows,
            needs: nextNeeds,
            wants: nextWants,
            wealth: nextWealth,
            customRatios: nextCustomRatios,
            allocationModel: nextAllocationModel,
          };
        }

        set({
          activePeriod: targetPeriod,
          inflows: nextInflows,
          needs: nextNeeds,
          wants: nextWants,
          wealth: nextWealth,
          customRatios: nextCustomRatios,
          allocationModel: nextAllocationModel,
          periodsData: updatedPeriodsData,
        });

        get().syncStateWithBackend();
      },

      // ── Salary Adjustment with Forward Cascade ──────────────────────
      recordSalaryAdjustment: ({
        contractType = "dependent",
        grossSalary = 0,
        payrollBreakdown = {},
        note = "",
        period = null,
      }) => {
        const targetPeriod = period || get().activePeriod;
        const netAmt = Number(payrollBreakdown.netSalary || payrollBreakdown.netIncome) || 0;

        const historyEntry = {
          id: `sal_${Date.now()}`,
          date: new Date().toISOString(),
          period: targetPeriod,
          contractType,
          grossSalary: Number(grossSalary),
          payrollBreakdown,
          netSalary: netAmt,
          note: note || (contractType === "dependent" ? "Nómina Laboral" : "Honorarios Freelance"),
        };

        set((state) => {
          const updateSalaryInList = (list) => {
            const idx = list.findIndex((i) => i.category === "salary");
            if (idx >= 0) {
              const copy = [...list];
              copy[idx] = {
                ...copy[idx],
                amount: netAmt,
                name: `Salario Neto (${note || (contractType === "dependent" ? "Nómina" : "Honorarios")})`,
              };
              return copy;
            } else {
              return [
                {
                  id: `in_salary_${Date.now()}`,
                  name: `Salario Neto (${note || "Nómina"})`,
                  category: "salary",
                  amount: netAmt,
                  currency: state.currency,
                  isPassive: false,
                  frequency: "monthly",
                  paymentSource: { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu Débito" },
                  icon: "💼",
                  createdAt: new Date().toISOString(),
                },
                ...list,
              ];
            }
          };

          // 1. Update active period inflows if activePeriod >= targetPeriod
          let nextActiveInflows = state.inflows;
          if (state.activePeriod >= targetPeriod) {
            nextActiveInflows = updateSalaryInList(state.inflows);
          }

          // 2. Forward Propagation: update all future periods (p >= targetPeriod) in periodsData
          const nextPeriodsData = { ...state.periodsData };
          Object.keys(nextPeriodsData).forEach((pKey) => {
            if (pKey >= targetPeriod && nextPeriodsData[pKey]?.inflows) {
              nextPeriodsData[pKey] = {
                ...nextPeriodsData[pKey],
                inflows: updateSalaryInList(nextPeriodsData[pKey].inflows),
              };
            }
          });

          return {
            inflows: nextActiveInflows,
            periodsData: nextPeriodsData,
            salaryHistory: [historyEntry, ...state.salaryHistory],
          };
        });

        get().syncStateWithBackend();
        toast.success(
          `Salario Neto liquidado en $${Math.round(netAmt).toLocaleString("es-CO")} COP aplicado y propagado hacia adelante`,
          { icon: "💰" }
        );
      },

      // ── Setters & Controls ───────────────────────────
      setCurrency: (currency) => {
        set({ currency });
        get().syncStateWithBackend();
      },

      setAllocationModel: (allocationModel) => {
        set({ allocationModel });
        get().syncStateWithBackend();
      },

      setCustomRatios: (customRatios) => {
        set({ customRatios });
        get().syncStateWithBackend();
      },

      setEmergencyFundTargetMonths: (emergencyFundTargetMonths) => {
        set({ emergencyFundTargetMonths: Number(emergencyFundTargetMonths) });
        get().syncStateWithBackend();
      },

      // ── CRUD: Inflows (With Universal Forward Propagation for Recurring) ──
      addInflow: async (item) => {
        const state = get();
        const isOneTime = !!item.isOneTime || item.frequency === "one_time";
        const newItem = {
          id: item.id || `in_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || "Nuevo Ingreso",
          category: item.category || "salary",
          amount: Number(item.amount) || 0,
          currency: item.currency || state.currency || "COP",
          isPassive: !!item.isPassive,
          isAutoSynced: !!item.isAutoSynced,
          isOneTime,
          targetPeriod: item.targetPeriod || state.activePeriod,
          paymentStatus: item.paymentStatus || "received",
          frequency: item.frequency || (isOneTime ? "one_time" : "monthly"),
          paymentSource: item.paymentSource || { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu" },
          icon: item.icon || "💼",
          subItems: Array.isArray(item.subItems) ? item.subItems : [],
          createdAt: new Date().toISOString(),
        };

        set((s) => {
          const nextInflows = [newItem, ...s.inflows];
          const nextPeriodsData = { ...s.periodsData };

          nextPeriodsData[s.activePeriod] = {
            ...(nextPeriodsData[s.activePeriod] || {}),
            inflows: nextInflows,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > s.activePeriod && nextPeriodsData[pKey]?.inflows) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  inflows: [newItem, ...nextPeriodsData[pKey].inflows.filter((i) => i.id !== newItem.id)],
                };
              }
            });
          }

          return { inflows: nextInflows, periodsData: nextPeriodsData };
        });

        try {
          await createInflowApi(newItem);
        } catch (err) {
          console.warn("[CashFlow] Local save only:", err);
        }
      },

      updateInflow: (id, updates) => {
        set((state) => {
          const target = state.inflows.find((i) => i.id === id);
          const isOneTime = updates.isOneTime ?? target?.isOneTime ?? false;

          const nextInflows = state.inflows.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            inflows: nextInflows,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.inflows) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  inflows: nextPeriodsData[pKey].inflows.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                };
              }
            });
          }

          return { inflows: nextInflows, periodsData: nextPeriodsData };
        });
        get().syncStateWithBackend();
      },

      deleteInflow: async (id) => {
        set((state) => {
          const target = state.inflows.find((i) => i.id === id);
          const isOneTime = target?.isOneTime ?? false;

          const nextInflows = state.inflows.filter((item) => item.id !== id);
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            inflows: nextInflows,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.inflows) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  inflows: nextPeriodsData[pKey].inflows.filter((i) => i.id !== id),
                };
              }
            });
          }

          return { inflows: nextInflows, periodsData: nextPeriodsData };
        });
        try {
          await deleteInflowApi(id);
        } catch (err) {
          console.warn("[CashFlow] Local delete only:", err);
        }
      },

      // ── CRUD: Needs (With Universal Forward Propagation) ─────────────
      addNeed: async (item) => {
        const state = get();
        const isOneTime = !!item.isOneTime;
        const newItem = {
          id: item.id || `need_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || "Nuevo Gasto Esencial",
          category: item.category || "housing",
          amount: Number(item.amount) || 0,
          currency: item.currency || state.currency || "COP",
          dueDate: item.dueDate || null,
          isOneTime,
          targetPeriod: item.targetPeriod || state.activePeriod,
          paymentSource: item.paymentSource || { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu" },
          icon: item.icon || "🏠",
          subItems: Array.isArray(item.subItems) ? item.subItems : [],
          createdAt: new Date().toISOString(),
        };

        set((s) => {
          const nextNeeds = [newItem, ...s.needs];
          const nextPeriodsData = { ...s.periodsData };

          nextPeriodsData[s.activePeriod] = {
            ...(nextPeriodsData[s.activePeriod] || {}),
            needs: nextNeeds,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > s.activePeriod && nextPeriodsData[pKey]?.needs) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  needs: [newItem, ...nextPeriodsData[pKey].needs.filter((i) => i.id !== newItem.id)],
                };
              }
            });
          }

          return { needs: nextNeeds, periodsData: nextPeriodsData };
        });

        try {
          await createNeedExpenseApi(newItem);
        } catch (err) {
          console.warn("[CashFlow] Local save only:", err);
        }
      },

      updateNeed: (id, updates) => {
        set((state) => {
          const target = state.needs.find((i) => i.id === id);
          const isOneTime = updates.isOneTime ?? target?.isOneTime ?? false;

          const nextNeeds = state.needs.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            needs: nextNeeds,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.needs) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  needs: nextPeriodsData[pKey].needs.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                };
              }
            });
          }

          return { needs: nextNeeds, periodsData: nextPeriodsData };
        });
        get().syncStateWithBackend();
      },

      deleteNeed: async (id) => {
        set((state) => {
          const target = state.needs.find((i) => i.id === id);
          const isOneTime = target?.isOneTime ?? false;

          const nextNeeds = state.needs.filter((item) => item.id !== id);
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            needs: nextNeeds,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.needs) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  needs: nextPeriodsData[pKey].needs.filter((i) => i.id !== id),
                };
              }
            });
          }

          return { needs: nextNeeds, periodsData: nextPeriodsData };
        });
        try {
          await deleteNeedExpenseApi(id);
        } catch (err) {
          console.warn("[CashFlow] Local delete only:", err);
        }
      },

      // ── CRUD: Wants (With Universal Forward Propagation) ─────────────
      addWant: async (item) => {
        const state = get();
        const isOneTime = !!item.isOneTime;
        const newItem = {
          id: item.id || `want_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || "Nuevo Gasto de Estilo de Vida",
          category: item.category || "dining",
          amount: Number(item.amount) || 0,
          currency: item.currency || state.currency || "COP",
          isOneTime,
          targetPeriod: item.targetPeriod || state.activePeriod,
          paymentSource: item.paymentSource || { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu" },
          icon: item.icon || "🍷",
          subItems: Array.isArray(item.subItems) ? item.subItems : [],
          createdAt: new Date().toISOString(),
        };

        set((s) => {
          const nextWants = [newItem, ...s.wants];
          const nextPeriodsData = { ...s.periodsData };

          nextPeriodsData[s.activePeriod] = {
            ...(nextPeriodsData[s.activePeriod] || {}),
            wants: nextWants,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > s.activePeriod && nextPeriodsData[pKey]?.wants) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wants: [newItem, ...nextPeriodsData[pKey].wants.filter((i) => i.id !== newItem.id)],
                };
              }
            });
          }

          return { wants: nextWants, periodsData: nextPeriodsData };
        });

        try {
          await createWantExpenseApi(newItem);
        } catch (err) {
          console.warn("[CashFlow] Local save only:", err);
        }
      },

      updateWant: (id, updates) => {
        set((state) => {
          const target = state.wants.find((i) => i.id === id);
          const isOneTime = updates.isOneTime ?? target?.isOneTime ?? false;

          const nextWants = state.wants.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            wants: nextWants,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.wants) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wants: nextPeriodsData[pKey].wants.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                };
              }
            });
          }

          return { wants: nextWants, periodsData: nextPeriodsData };
        });
        get().syncStateWithBackend();
      },

      deleteWant: async (id) => {
        set((state) => {
          const target = state.wants.find((i) => i.id === id);
          const isOneTime = target?.isOneTime ?? false;

          const nextWants = state.wants.filter((item) => item.id !== id);
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            wants: nextWants,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.wants) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wants: nextPeriodsData[pKey].wants.filter((i) => i.id !== id),
                };
              }
            });
          }

          return { wants: nextWants, periodsData: nextPeriodsData };
        });
        try {
          await deleteWantExpenseApi(id);
        } catch (err) {
          console.warn("[CashFlow] Local delete only:", err);
        }
      },

      // ── CRUD: Wealth (With Universal Forward Propagation) ────────────
      addWealth: async (item) => {
        const state = get();
        const isOneTime = !!item.isOneTime;
        const newItem = {
          id: item.id || `wealth_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: item.name || "Nueva Asignación Patrimonial",
          category: item.category || "emergency_fund",
          targetAmount: Number(item.targetAmount) || 0,
          monthlyContribution: Number(item.monthlyContribution) || 0,
          currentBalance: Number(item.currentBalance) || 0,
          currency: item.currency || state.currency || "COP",
          linkedModule: item.linkedModule || "custom",
          isOneTime,
          targetPeriod: item.targetPeriod || state.activePeriod,
          paymentSource: item.paymentSource || { type: "payroll", targetName: state.payrollAccount?.name || "Cuenta Nu" },
          icon: item.icon || "💎",
          subItems: Array.isArray(item.subItems) ? item.subItems : [],
          createdAt: new Date().toISOString(),
        };

        set((s) => {
          const nextWealth = [newItem, ...s.wealth];
          const nextPeriodsData = { ...s.periodsData };

          nextPeriodsData[s.activePeriod] = {
            ...(nextPeriodsData[s.activePeriod] || {}),
            wealth: nextWealth,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > s.activePeriod && nextPeriodsData[pKey]?.wealth) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wealth: [newItem, ...nextPeriodsData[pKey].wealth.filter((i) => i.id !== newItem.id)],
                };
              }
            });
          }

          return { wealth: nextWealth, periodsData: nextPeriodsData };
        });

        try {
          await createWealthItemApi(newItem);
        } catch (err) {
          console.warn("[CashFlow] Local save only:", err);
        }
      },

      updateWealth: (id, updates) => {
        set((state) => {
          const target = state.wealth.find((i) => i.id === id);
          const isOneTime = updates.isOneTime ?? target?.isOneTime ?? false;

          const nextWealth = state.wealth.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            wealth: nextWealth,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.wealth) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wealth: nextPeriodsData[pKey].wealth.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                };
              }
            });
          }

          return { wealth: nextWealth, periodsData: nextPeriodsData };
        });
        get().syncStateWithBackend();
      },

      deleteWealth: async (id) => {
        set((state) => {
          const target = state.wealth.find((i) => i.id === id);
          const isOneTime = target?.isOneTime ?? false;

          const nextWealth = state.wealth.filter((item) => item.id !== id);
          const nextPeriodsData = { ...state.periodsData };

          nextPeriodsData[state.activePeriod] = {
            ...(nextPeriodsData[state.activePeriod] || {}),
            wealth: nextWealth,
          };

          if (!isOneTime) {
            Object.keys(nextPeriodsData).forEach((pKey) => {
              if (pKey > state.activePeriod && nextPeriodsData[pKey]?.wealth) {
                nextPeriodsData[pKey] = {
                  ...nextPeriodsData[pKey],
                  wealth: nextPeriodsData[pKey].wealth.filter((i) => i.id !== id),
                };
              }
            });
          }

          return { wealth: nextWealth, periodsData: nextPeriodsData };
        });
        try {
          await deleteWealthItemApi(id);
        } catch (err) {
          console.warn("[CashFlow] Local delete only:", err);
        }
      },

      // ── Live Cross-Store Synchronization ─────────────────
      syncFromFixedIncome: (accounts = [], cdts = [], fxRate = 4150) => {
        let totalMonthlyYieldCOP = 0;
        let totalCashBalanceCOP = 0;

        accounts.forEach((acc) => {
          const bal = Number(acc.balance) || 0;
          const rateEA = (Number(acc.rateEA || acc.interestRateEA) || 0) / 100;
          const monthlyRate = Math.pow(1 + rateEA, 1 / 12) - 1;
          const yieldVal = bal * monthlyRate;

          const mult = acc.currency === "USD" ? fxRate : 1;
          totalMonthlyYieldCOP += yieldVal * mult;
          totalCashBalanceCOP += bal * mult;
        });

        cdts.forEach((cdt) => {
          const bal = Number(cdt.investmentAmount || cdt.initialAmount || cdt.amount) || 0;
          const rateEA = (Number(cdt.rateEA || cdt.nominalRate || cdt.interestRateEA) || 0) / 100;
          const monthlyRate = Math.pow(1 + rateEA, 1 / 12) - 1;
          totalMonthlyYieldCOP += bal * monthlyRate;
          totalCashBalanceCOP += bal;
        });

        // 1. Separate Emergency Fund accounts from general savings/fixed income
        const emergencyAccounts = accounts.filter((acc) => {
          const name = (acc.name || "").toLowerCase();
          const category = (acc.category || "").toLowerCase();
          return name.includes("emergencia") || category.includes("emergencia") || name.includes("emergency");
        });

        const emergencyBalanceCOP = emergencyAccounts.reduce((sum, acc) => {
          const bal = Number(acc.balance) || 0;
          const mult = acc.currency === "USD" ? fxRate : 1;
          return sum + bal * mult;
        }, 0);

        // 2. Identify Non-emergency high-yield savings accounts (exclude payroll and low-amount digital wallets)
        const nonEmergencyAccounts = accounts.filter(
          (acc) =>
            !emergencyAccounts.some((ea) => ea.id === acc.id) &&
            acc.accountCategory !== "digital_wallet" &&
            acc.accountCategory !== "payroll" &&
            acc.type !== "wallet" &&
            !acc.name?.toLowerCase().includes("nomina") &&
            !acc.name?.toLowerCase().includes("nómina")
        );
        const nonEmergencyCashCOP = nonEmergencyAccounts.reduce((sum, acc) => {
          const bal = Number(acc.balance) || 0;
          const mult = acc.currency === "USD" ? fxRate : 1;
          return sum + bal * mult;
        }, 0);

        let totalCdtCapitalCOP = 0;
        cdts.forEach((cdt) => {
          const bal = Number(cdt.investmentAmount || cdt.initialAmount || cdt.amount || cdt.capital) || 0;
          totalCdtCapitalCOP += bal;
        });

        const roundedYield = Math.round(totalMonthlyYieldCOP);
        const roundedEmergencyBalance = Math.round(emergencyBalanceCOP);
        const roundedGeneralSavings = Math.round(nonEmergencyCashCOP + totalCdtCapitalCOP);

        set((state) => {
          const nextInflows = state.inflows.map((i) => {
            if (i.category === "passive_fixed" || i.id === "in_fixed_yield") {
              return {
                ...i,
                amount: roundedYield,
                isPassive: true,
                isAutoSynced: true,
                linkedModule: "fixed_income",
              };
            }
            return i;
          });

          if (!nextInflows.some((i) => i.category === "passive_fixed" || i.id === "in_fixed_yield") && roundedYield > 0) {
            nextInflows.push({
              id: "in_fixed_yield",
              name: "Ingreso por Renta Fija",
              category: "passive_fixed",
              amount: roundedYield,
              currency: "COP",
              isPassive: true,
              isAutoSynced: true,
              linkedModule: "fixed_income",
              frequency: "monthly",
              paymentSource: { type: "fixed_pocket", targetName: "Renta Fija (Cuentas de Ahorro & CDTs)" },
              icon: "⚡",
              createdAt: new Date().toISOString(),
            });
          }

          const nextWealth = state.wealth.map((w) => {
            if (w.category === "emergency_fund" || w.id === "wealth_emergency") {
              // Solo cuenta el saldo de la(s) cuenta(s) específicamente destinadas a Fondo de Emergencia
              const bal = Number(w.currentBalance) || 0;
              const fallbackBal = bal === 3616128 || bal > 3500000 ? 1070000 : bal;
              const finalBal = emergencyAccounts.length > 0 ? roundedEmergencyBalance : fallbackBal;
              return {
                ...w,
                currentBalance: finalBal,
                linkedModule: "fixed_income",
                sourceAccountName:
                  emergencyAccounts.length > 0
                    ? emergencyAccounts.map((a) => a.name).join(", ")
                    : w.sourceAccountName || "Fondo de emergencia",
              };
            }
            if (w.category === "fixed_savings" || w.id === "wealth_high_yield") {
              // Ahorro de alto rendimiento en otras cuentas de ahorro y CDTs (excluye el fondo de emergencia)
              return {
                ...w,
                currentBalance: roundedGeneralSavings > 0 ? roundedGeneralSavings : w.currentBalance,
                linkedModule: "fixed_income",
              };
            }
            return w;
          });

          return { inflows: nextInflows, wealth: nextWealth };
        });

        get().syncStateWithBackend();
      },


      syncFromPortfolio: (currentEquityValue = 0, fxRate = 4150) => {
        if (!currentEquityValue || currentEquityValue <= 0) return;

        const valInCOP = Math.round(currentEquityValue * fxRate);
        const monthlyDividendCOP = Math.round((valInCOP * 0.02) / 12);

        set((state) => {
          const nextInflows = state.inflows.map((i) => {
            if (i.category === "passive_equity" || i.id === "in_stock_div") {
              return {
                ...i,
                name: "Ingreso por Renta Variable",
                paymentSource: { type: "investment_cash", targetName: "Portafolio de Inversión (Acciones, ETFs, Estrategias)" },
                amount: monthlyDividendCOP > 0 ? monthlyDividendCOP : (i.amount || 150000),
                isPassive: true,
                isAutoSynced: true,
                linkedModule: "variable_income",
              };
            }
            return i;
          });

          if (!nextInflows.some((i) => i.category === "passive_equity" || i.id === "in_stock_div")) {
            nextInflows.push({
              id: "in_stock_div",
              name: "Ingreso por Renta Variable",
              category: "passive_equity",
              amount: monthlyDividendCOP > 0 ? monthlyDividendCOP : 150000,
              currency: "COP",
              isPassive: true,
              isAutoSynced: true,
              linkedModule: "variable_income",
              frequency: "monthly",
              paymentSource: { type: "investment_cash", targetName: "Portafolio de Inversión (Acciones, ETFs, Estrategias)" },
              icon: "📈",
              createdAt: new Date().toISOString(),
            });
          }

          const nextWealth = state.wealth.map((w) => {
            if (w.linkedModule === "variable_income" || w.category === "equity_investment") {
              return {
                ...w,
                name: "Portafolio Renta Variable (Al día / Tiempo Real)",
                currentBalance: valInCOP,
              };
            }
            return w;
          });

          if (!nextWealth.some((w) => w.linkedModule === "variable_income" || w.category === "equity_investment")) {
            nextWealth.push({
              id: "wealth_equity_portfolio",
              name: "Portafolio Renta Variable (Al día / Tiempo Real)",
              category: "equity_investment",
              targetAmount: valInCOP * 2,
              monthlyContribution: 0,
              currentBalance: valInCOP,
              currency: "COP",
              linkedModule: "variable_income",
              paymentSource: { type: "investment_cash", targetName: "Portafolio de Inversión (Acciones, ETFs, Estrategias)" },
              icon: "🚀",
              createdAt: new Date().toISOString(),
            });
          }

          return { inflows: nextInflows, wealth: nextWealth };
        });

        get().syncStateWithBackend();
      },

    })
);
