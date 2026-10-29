/**
 * Kpital V2 — Supabase Direct Data & Auth Service
 * 100% Native Web Crypto API (Zero external Node/Buffer dependencies).
 */
import { supabase, OWNER_USER_ID } from "./supabaseClient";

/**
 * Native Browser PBKDF2 verification using window.crypto.subtle
 * Matches Python's hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
 */
async function verifyPasswordNative(plainPassword, saltStr, expectedHex) {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(plainPassword),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(saltStr),
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    256 // 32 bytes * 8 bits
  );

  const derivedArray = Array.from(new Uint8Array(derivedBits));
  const derivedHex = derivedArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return derivedHex.toLowerCase() === expectedHex.toLowerCase();
}

// ── 1. Direct Authentication with Supabase ──────────────────────────────────
export async function directSupabaseLogin(email, plainPassword) {
  const cleanEmail = (email || "").trim().toLowerCase();

  // Query users table directly in Supabase
  const { data: userRows, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", cleanEmail)
    .limit(1);

  if (error || !userRows || userRows.length === 0) {
    throw new Error("Usuario no encontrado en la base de datos");
  }

  const user = userRows[0];
  const hashParts = (user.password_hash || "").split("$");
  if (hashParts.length !== 3 || hashParts[0] !== "pbkdf2_sha256") {
    throw new Error("Formato de credenciales incompatible");
  }

  const salt = hashParts[1];
  const expectedHash = hashParts[2];

  const isValid = await verifyPasswordNative(plainPassword, salt, expectedHash);
  if (!isValid) {
    throw new Error("Contraseña incorrecta");
  }

  // Create lightweight client token payload
  const sessionToken = btoa(
    JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      is_pro: user.is_pro,
      timestamp: Date.now(),
    })
  );

  return {
    token: sessionToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      is_pro: user.is_pro,
      avatar_url: user.avatar_url,
    },
  };
}

export async function directSupabaseFetchMe(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token));
    if (!payload?.email) return null;

    const { data: userRows } = await supabase
      .from("users")
      .select("id, email, name, avatar_url, is_pro")
      .eq("email", payload.email)
      .limit(1);

    if (userRows && userRows.length > 0) {
      return { user: userRows[0] };
    }
    return { user: payload };
  } catch {
    return null;
  }
}

// ── 2. Direct Cash Flow Fetch from Supabase ─────────────────────────────────
export async function directFetchCashFlow() {
  const [configRes, envelopesRes, movementsRes, cardsRes, purchasesRes, paymentsRes, debtsRes] =
    await Promise.all([
      supabase.from("cf_periods_config").select("*").eq("user_id", OWNER_USER_ID),
      supabase.from("cf_budget_envelopes").select("*").eq("user_id", OWNER_USER_ID),
      supabase.from("cf_movements").select("*").eq("user_id", OWNER_USER_ID).order("date", { ascending: false }),
      supabase.from("cf_credit_cards").select("*").eq("user_id", OWNER_USER_ID),
      supabase.from("cf_credit_purchases").select("*").eq("user_id", OWNER_USER_ID),
      supabase.from("cf_credit_payments").select("*").eq("user_id", OWNER_USER_ID),
      supabase.from("cf_debts").select("*").eq("user_id", OWNER_USER_ID),
    ]);

  const baseConfig = (configRes.data || []).find((c) => c.period === "base") || {};
  const activePeriod = baseConfig.active_period || "2026-11";
  const startPeriod = baseConfig.start_period || "2026-11";

  // Organize envelopes by period and pillar
  const periodsData = {};
  const baseEnvelopes = { inflows: [], needs: [], wants: [], wealth: [] };

  (envelopesRes.data || []).forEach((row) => {
    const envelope = {
      id: row.id,
      name: row.name,
      amount: row.amount,
      category: row.category,
      subItems: row.sub_items_json || [],
      isExplicitBudgetIncome: row.is_explicit_sankey_income,
      ...(row.extra_json || {}),
    };

    if (row.period === "base") {
      if (baseEnvelopes[row.pillar]) baseEnvelopes[row.pillar].push(envelope);
    } else {
      if (!periodsData[row.period]) {
        periodsData[row.period] = { inflows: [], needs: [], wants: [], wealth: [] };
      }
      if (periodsData[row.period][row.pillar]) {
        periodsData[row.period][row.pillar].push(envelope);
      }
    }
  });

  // Hydrate movements
  const expensesLog = (movementsRes.data || []).map((m) => ({
    id: m.id,
    period: m.period,
    date: m.date,
    time: m.time,
    type: m.type,
    amount: m.amount,
    currency: m.currency,
    description: m.description,
    budgetItemId: m.budget_item_id,
    budgetItemName: m.budget_item_name,
    budgetItemType: m.budget_item_type,
    subItemId: m.sub_item_id,
    subItemName: m.sub_item_name,
    paymentSource: m.payment_source_json || {},
    destinationAccountId: m.destination_account_id,
    destinationAccountName: m.destination_account_name,
    isSplitChild: m.is_split_child,
    splitParentId: m.split_parent_id,
    creditCardPaymentId: m.credit_card_payment_id,
    cardId: m.card_id,
    debtId: m.debt_id,
    isLoan: m.is_loan,
    isSharedExpense: m.is_shared_expense,
    participants: m.participants_json || [],
    isExplicitBudgetIncome: m.is_explicit_sankey_income,
    ...(m.extra_json || {}),
  }));

  // Hydrate cards
  const creditCards = (cardsRes.data || []).map((c) => ({
    id: c.id,
    name: c.name,
    brand: c.brand,
    totalLimit: c.total_limit,
    usedLimit: c.used_limit,
    cutoffDay: c.cutoff_day,
    dueDay: c.due_day,
    ...(c.extra_json || {}),
  }));

  // Hydrate credit purchases
  const creditPurchases = (purchasesRes.data || []).map((cp) => ({
    id: cp.id,
    cardId: cp.card_id,
    movementId: cp.movement_id,
    description: cp.description,
    totalAmount: cp.total_amount,
    installmentsCount: cp.installments_count,
    monthlyInstallment: cp.monthly_installment,
    startPeriod: cp.start_period,
    date: cp.date,
    ...(cp.extra_json || {}),
  }));

  // Hydrate debts
  const debts = (debtsRes.data || []).map((d) => ({
    id: d.id,
    originMovementId: d.origin_movement_id,
    debtType: d.debt_type,
    concept: d.concept,
    debtor: d.debtor,
    creditor: d.creditor,
    totalAmount: d.total_amount,
    remainingAmount: d.remaining_amount,
    myShare: d.my_share,
    status: d.status,
    participants: d.participants_json || [],
    paymentsLog: d.payments_log_json || [],
    notes: d.notes,
    ...(d.extra_json || {}),
  }));

  return {
    startPeriod,
    activePeriod,
    currency: baseConfig.currency || "COP",
    allocationModel: baseConfig.allocation_model || "custom",
    customRatios: {
      needs: baseConfig.needs_ratio ?? 40.0,
      wants: baseConfig.wants_ratio ?? 20.0,
      savings: baseConfig.savings_ratio ?? 40.0,
    },
    emergencyFundTargetMonths: baseConfig.emergency_months ?? 6,
    payrollAccount: baseConfig.payroll_account_json || {},
    deletedExpenseIds: baseConfig.deleted_ids_json?.deletedExpenseIds || [],
    deletedDebtIds: baseConfig.deleted_ids_json?.deletedDebtIds || [],
    deletedCreditCardPaymentIds: baseConfig.deleted_ids_json?.deletedCreditCardPaymentIds || [],
    inflows: baseEnvelopes.inflows,
    needs: baseEnvelopes.needs,
    wants: baseEnvelopes.wants,
    wealth: baseEnvelopes.wealth,
    periodsData,
    expensesLog,
    creditCards,
    creditPurchases,
    debts,
  };
}

// ── 3. Direct Fixed Income Fetch from Supabase ───────────────────────────────
export async function directFetchFixedIncome() {
  const [entitiesRes, accountsRes, cdtsRes, txsRes] = await Promise.all([
    supabase.from("fi_entities").select("*").eq("user_id", OWNER_USER_ID),
    supabase.from("fi_accounts").select("*").eq("user_id", OWNER_USER_ID),
    supabase.from("fi_cdts").select("*").eq("user_id", OWNER_USER_ID),
    supabase.from("fi_transactions").select("*").eq("user_id", OWNER_USER_ID).order("date", { ascending: false }),
  ]);

  const entities = (entitiesRes.data || []).map((e) => ({
    id: e.id,
    name: e.name,
    country: e.country,
    color: e.color,
    icon: e.icon,
    ...(e.extra_json || {}),
  }));

  const accounts = (accountsRes.data || []).map((a) => ({
    id: a.id,
    entityId: a.entity_id,
    name: a.name,
    type: a.type,
    accountCategory: a.account_category,
    syncType: a.sync_type,
    currency: a.currency,
    balance: a.balance,
    interestRateEA: a.interest_rate_ea,
    isTaxExemptGMF: a.is_tax_exempt_gmf,
    rateHistory: a.rate_history_json || [],
    ...(a.extra_json || {}),
  }));

  const cdts = (cdtsRes.data || []).map((c) => ({
    id: c.id,
    entityId: c.entity_id,
    name: c.name,
    capital: c.capital,
    currency: c.currency,
    interestRateEA: c.interest_rate_ea,
    termDays: c.term_days,
    startDate: c.start_date,
    maturityDate: c.maturity_date,
    reteFuentePct: c.rete_fuente_pct,
    isAutoRenew: c.is_auto_renew,
    status: c.status,
    ...(c.extra_json || {}),
  }));

  const transactions = (txsRes.data || []).map((t) => ({
    id: t.id,
    accountId: t.account_id,
    entityId: t.entity_id,
    date: t.date,
    time: t.time,
    type: t.type,
    amount: t.amount,
    currency: t.currency,
    description: t.description,
    category: t.category,
    source: t.source,
    ...(t.extra_json || {}),
  }));

  return {
    entities,
    accounts,
    cdts,
    transactions,
  };
}

// ── 4. Direct Purchases & Portfolios Fetch from Supabase ──────────────────────
export async function directFetchPurchases() {
  const [portsRes, purchasesRes, salesRes] = await Promise.all([
    supabase.from("rv_portfolios").select("*"),
    supabase.from("rv_purchases").select("*").order("date", { ascending: false }),
    supabase.from("rv_sales").select("*").order("sale_date", { ascending: false }),
  ]);

  const purchasePortfolios = (portsRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    isPlan: p.is_plan,
    planConfig: p.plan_config ? JSON.parse(p.plan_config) : null,
    assetCurrency: p.asset_currency,
    localCurrency: p.local_currency,
    annualInflationRate: p.annual_inflation_rate,
    useAutoColInflation: p.use_auto_col_inflation,
  }));

  const individualPurchases = (purchasesRes.data || []).map((l) => ({
    id: l.id,
    portfolioId: l.portfolio_id,
    ticker: l.ticker,
    date: l.date,
    purchasePrice: l.purchase_price,
    shares: l.shares,
    manualCurrentPrice: l.manual_current_price,
    purchaseTime: l.purchase_time,
    commissionAmount: l.commission_amount,
    notes: l.notes,
  }));

  const purchaseSales = (salesRes.data || []).map((s) => ({
    id: s.id,
    lotId: s.lot_id,
    portfolioId: s.portfolio_id,
    ticker: s.ticker,
    saleDate: s.sale_date,
    saleTime: s.sale_time,
    salePrice: s.sale_price,
    shares: s.shares,
    saleCommission: s.sale_commission,
    realizedPnl: s.realized_pnl,
    notes: s.notes,
    purchaseDate: s.purchase_date,
    costBasis: s.cost_basis,
  }));

  return {
    purchasePortfolios,
    individualPurchases,
    purchaseSales,
  };
}

// ── 5. Direct Custom Strategies & Rebalances ────────────────────────────────
export async function directFetchCustomStrategies() {
  const { data, error } = await supabase.from("custom_strategies").select("*");
  if (error) throw error;
  return (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    country: s.country,
    numSlots: s.num_slots,
    capital: s.capital,
    activeInvested: s.active_invested,
    benchmark: s.benchmark,
    color: s.color,
    isSystem: s.is_system,
    isRealMoney: s.is_real_money,
  }));
}

export async function directFetchRebalances(strategyId = "historical") {
  const [rebRes, tickersRes] = await Promise.all([
    supabase
      .from("rebalances")
      .select("*")
      .eq("strategy_id", strategyId)
      .order("rebalance_date", { ascending: true }),
    supabase
      .from("rebalance_tickers")
      .select("*")
      .eq("strategy_id", strategyId),
  ]);

  const tickersByDate = {};
  (tickersRes.data || []).forEach((t) => {
    const d = t.rebalance_date;
    if (!tickersByDate[d]) tickersByDate[d] = [];
    if (t.ticker && !tickersByDate[d].includes(t.ticker)) {
      tickersByDate[d].push(t.ticker);
    }
  });

  return (rebRes.data || []).map((r) => ({
    date: r.rebalance_date,
    rebalance_date: r.rebalance_date,
    cash_added: r.cash_added || 0,
    strategy_id: r.strategy_id,
    tickers: tickersByDate[r.rebalance_date] || [],
  }));
}

export async function directFetchStockAlerts(scope = null, targetId = null) {
  let query = supabase.from("rv_stock_alerts").select("*").eq("user_id", OWNER_USER_ID);
  if (scope) query = query.eq("scope", scope);
  if (targetId) query = query.eq("target_id", targetId);

  const { data, error } = await query;
  if (error) return [];
  return (data || []).map((a) => ({
    id: a.id,
    scope: a.scope,
    target_id: a.target_id,
    targetId: a.target_id,
    ticker: a.ticker,
    alert_type: a.alert_type,
    alertType: a.alert_type,
    target_value: a.target_value,
    targetValue: a.target_value,
    is_active: a.is_active,
    isActive: a.is_active,
    notify_email: a.notify_email,
    notify_app: a.notify_app,
    user_email: a.user_email,
    triggered_at: a.triggered_at,
    last_checked_price: a.last_checked_price,
  }));
}

// ── 6. Direct FX & Inflation Fallbacks ───────────────────────────────────────
export async function directFetchFxRate(asset = "USD", local = "COP") {
  try {
    // Free open exchange API direct from browser (no Render backend needed)
    const res = await fetch(`https://open.er-api.com/v6/latest/${asset}`);
    if (res.ok) {
      const data = await res.json();
      const currentRate = data.rates?.[local] || 4150.0;
      return {
        current: currentRate,
        history: {},
      };
    }
  } catch {}
  return { current: 4150.0, history: {} };
}

export async function directFetchColInflation() {
  // Canonical historical inflation rates (DANE Colombia)
  return {
    history: {
      "2020": 1.61,
      "2021": 5.62,
      "2022": 13.12,
      "2023": 9.28,
      "2024": 5.24,
      "2025": 5.15,
      "2026": 4.85,
    },
    latest: { year: 2026, rate: 4.85 },
    monthly_rates: [],
  };
}
