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
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return false;
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
  } catch (err) {
    console.warn("[verifyPasswordNative] PBKDF2 check failed:", err);
    return false;
  }
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
    const raw = token.includes(".") ? token.split(".")[1] : token;
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }
    const payload = JSON.parse(atob(b64));
    if (!payload?.email) return null;

    const { data: userRows } = await supabase
      .from("users")
      .select("id, email, name, avatar_url, is_pro")
      .eq("email", payload.email)
      .limit(1);

    if (userRows && userRows.length > 0) {
      return { user: userRows[0] };
    }
    return {
      user: {
        id: payload.sub || payload.id || "usr_owner",
        email: payload.email,
        name: payload.name || payload.email.split("@")[0],
        avatar_url: payload.avatar_url || null,
        is_pro: true,
      },
    };
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

  // Hydrate movements: database columns take strict precedence over extra_json cache
  const expensesLog = (movementsRes.data || []).map((m) => {
    const extra = m.extra_json || {};
    return {
      ...extra,
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
      paymentSource: m.payment_source_json || extra.paymentSource || {},
      destinationAccountId: m.destination_account_id,
      destinationAccountName: m.destination_account_name,
      isSplitChild: m.is_split_child,
      splitParentId: m.split_parent_id,
      creditCardPaymentId: m.credit_card_payment_id,
      cardId: m.card_id,
      debtId: m.debt_id,
      isLoan: m.is_loan != null ? m.is_loan : extra.isLoan,
      isSharedExpense: m.is_shared_expense != null ? m.is_shared_expense : extra.isSharedExpense,
      participants: Array.isArray(m.participants_json) && m.participants_json.length > 0 ? m.participants_json : (extra.participants || []),
      settlements: Array.isArray(extra.settlements) ? extra.settlements : [],
      isExplicitBudgetIncome: m.is_explicit_sankey_income,
    };
  });

  // Hydrate cards: database columns take strict precedence over extra_json cache
  const creditCards = (cardsRes.data || []).map((c) => {
    const extra = c.extra_json || {};
    return {
      ...extra,
      id: c.id,
      name: c.name || extra.name,
      brand: c.brand || extra.brand || extra.cardType,
      cardType: c.brand || extra.cardType || "Gold / Platinum",
      totalLimit: Number(c.total_limit != null ? c.total_limit : (extra.totalLimit || 0)),
      usedLimit: Number(c.used_limit != null ? c.used_limit : (extra.usedLimit || 0)),
      closingDay: Number(c.cutoff_day != null ? c.cutoff_day : (extra.closingDay || extra.cutoffDay || 15)),
      cutoffDay: Number(c.cutoff_day != null ? c.cutoff_day : (extra.cutoffDay || 15)),
      paymentDay: Number(c.due_day != null ? c.due_day : (extra.paymentDay || extra.dueDay || 2)),
      dueDay: Number(c.due_day != null ? c.due_day : (extra.dueDay || 2)),
    };
  });

  // Hydrate credit purchases
  const creditPurchases = (purchasesRes.data || []).map((cp) => {
    const extra = cp.extra_json || {};
    return {
      ...extra,
      id: cp.id,
      cardId: cp.card_id || extra.cardId,
      movementId: cp.movement_id || extra.movementId,
      description: cp.description || extra.description,
      totalAmount: Number(cp.total_amount != null ? cp.total_amount : (extra.totalAmount || 0)),
      installmentsCount: Number(cp.installments_count != null ? cp.installments_count : (extra.installmentsCount || 1)),
      monthlyInstallment: Number(cp.monthly_installment != null ? cp.monthly_installment : (extra.monthlyInstallment || 0)),
      startPeriod: cp.start_period || extra.startPeriod,
      date: cp.date || extra.date,
    };
  });

  // Hydrate credit card payments: database columns take strict precedence over extra_json cache
  const creditCardPayments = (paymentsRes.data || []).map((p) => {
    const extra = p.extra_json || {};
    return {
      ...extra,
      id: p.id,
      cardId: p.card_id || extra.cardId,
      cardName: p.card_name || extra.cardName,
      period: p.period || extra.period,
      amount: Number(p.amount != null ? p.amount : (extra.amount || 0)),
      date: p.date || extra.date,
      time: p.time != null ? p.time : extra.time,
      sourceType: p.source_type || extra.sourceType || "payroll",
      sourceAccountId: p.source_account_id || extra.sourceAccountId || null,
      sourceAccount: p.source_account_name || extra.sourceAccount || null,
      sourceAccountName: p.source_account_name || extra.sourceAccountName || null,
      budgetDeductions: Array.isArray(p.budget_deductions_json) && p.budget_deductions_json.length > 0
        ? p.budget_deductions_json
        : (extra.budgetDeductions || []),
      notes: p.notes != null ? p.notes : extra.notes,
      description: extra.description || `Pago ${p.card_name || "Tarjeta"}`,
      createdAt: p.created_at || extra.createdAt,
    };
  });

  // Hydrate debts: database columns take strict precedence over extra_json cache
  const debts = (debtsRes.data || []).map((d) => {
    const extra = d.extra_json || {};
    return {
      ...extra,
      id: d.id,
      originMovementId: d.origin_movement_id || extra.originMovementId,
      debtType: d.debt_type || extra.debtType,
      concept: d.concept || extra.concept,
      debtor: d.debtor || extra.debtor,
      creditor: d.creditor || extra.creditor,
      totalAmount: Number(d.total_amount != null ? d.total_amount : (extra.totalAmount || 0)),
      remainingAmount: Number(d.remaining_amount != null ? d.remaining_amount : (extra.remainingAmount || 0)),
      myShare: Number(d.my_share != null ? d.my_share : (extra.myShare || 0)),
      status: d.status || extra.status,
      participants: Array.isArray(d.participants_json) ? d.participants_json : (extra.participants || []),
      paymentsLog: Array.isArray(d.payments_log_json) ? d.payments_log_json : (extra.paymentsLog || []),
      notes: d.notes != null ? d.notes : extra.notes,
    };
  });

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
    deletedCreditPurchaseIds: baseConfig.deleted_ids_json?.deletedCreditPurchaseIds || [],
    inflows: baseEnvelopes.inflows,
    needs: baseEnvelopes.needs,
    wants: baseEnvelopes.wants,
    wealth: baseEnvelopes.wealth,
    periodsData,
    expensesLog,
    creditCards,
    creditPurchases,
    creditCardPayments,
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

  const entities = (entitiesRes.data || []).map((e) => {
    const extra = e.extra_json || {};
    return {
      ...extra,
      id: e.id,
      name: e.name || extra.name,
      country: e.country || extra.country,
      color: e.color || extra.color,
      icon: e.icon || extra.icon,
    };
  });

  const accounts = (accountsRes.data || []).map((a) => {
    const extra = a.extra_json || {};
    return {
      ...extra,
      id: a.id,
      entityId: a.entity_id || extra.entityId,
      name: a.name || extra.name,
      type: a.type || extra.type,
      accountCategory: a.account_category || extra.accountCategory,
      syncType: a.sync_type || extra.syncType,
      currency: a.currency || extra.currency,
      balance: Number(a.balance != null ? a.balance : (extra.balance || 0)),
      interestRateEA: Number(a.interest_rate_ea != null ? a.interest_rate_ea : (extra.interestRateEA || 0)),
      isTaxExemptGMF: a.is_tax_exempt_gmf != null ? a.is_tax_exempt_gmf : extra.isTaxExemptGMF,
      rateHistory: a.rate_history_json || extra.rateHistory || [],
    };
  });

  const cdts = (cdtsRes.data || []).map((c) => {
    const extra = c.extra_json || {};
    return {
      ...extra,
      id: c.id,
      entityId: c.entity_id || extra.entityId,
      name: c.name || extra.name,
      capital: Number(c.capital != null ? c.capital : (extra.capital || 0)),
      currency: c.currency || extra.currency || "COP",
      interestRateEA: Number(c.interest_rate_ea != null ? c.interest_rate_ea : (extra.interestRateEA || 0)),
      termDays: Number(c.term_days != null ? c.term_days : (extra.termDays || 90)),
      startDate: c.start_date || extra.startDate,
      maturityDate: c.maturity_date || extra.maturityDate,
      reteFuentePct: Number(c.rete_fuente_pct != null ? c.rete_fuente_pct : (extra.reteFuentePct || 4)),
      isAutoRenew: c.is_auto_renew != null ? c.is_auto_renew : extra.isAutoRenew,
      status: c.status || extra.status || "active",
    };
  });

  const transactions = (txsRes.data || []).map((t) => {
    const extra = t.extra_json || {};
    return {
      ...extra,
      id: t.id,
      accountId: t.account_id || extra.accountId,
      entityId: t.entity_id || extra.entityId,
      date: t.date || extra.date,
      time: t.time || extra.time,
      type: t.type || extra.type || "credit",
      amount: Number(t.amount != null ? t.amount : (extra.amount || 0)),
      currency: t.currency || extra.currency || "COP",
      description: t.description || extra.description || "",
      category: t.category || extra.category || null,
      source: t.source || extra.source || "manual",
    };
  });

  return {
    entities,
    accounts,
    cdts,
    transactions,
  };
}

export async function directSaveFixedIncome(state = {}) {
  const { entities, accounts, cdts, transactions, deletedTxIds } = state;
  const uid = OWNER_USER_ID;

  // 1. Delete requested transactions
  if (Array.isArray(deletedTxIds) && deletedTxIds.length > 0) {
    try {
      await supabase.from("fi_transactions").delete().in("id", deletedTxIds);
    } catch (e) {
      console.warn("[directSaveFixedIncome] Error deleting txs:", e);
    }
  }

  // 2. Upsert entities
  if (Array.isArray(entities) && entities.length > 0) {
    const entRows = entities.map((e) => ({
      id: e.id,
      user_id: uid,
      name: e.name,
      country: e.country || "Colombia",
      color: e.color || "#0284c7",
      icon: e.icon || "bank",
      extra_json: e,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from("fi_entities").upsert(entRows);
  }

  // 3. Upsert accounts
  if (Array.isArray(accounts) && accounts.length > 0) {
    const accRows = accounts.map((a) => ({
      id: a.id,
      user_id: uid,
      entity_id: a.entityId || a.entity_id,
      name: a.name,
      type: a.type || "savings",
      account_category: a.accountCategory || a.account_category || "savings",
      sync_type: a.syncType || a.sync_type || "manual",
      currency: a.currency || "COP",
      balance: Number(a.balance) || 0,
      interest_rate_ea: Number(a.interestRateEA ?? a.interest_rate_ea ?? 0),
      is_tax_exempt_gmf: Boolean(a.isTaxExemptGMF ?? a.is_tax_exempt_gmf),
      rate_history_json: a.rateHistory || a.rate_history_json || [],
      extra_json: a,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from("fi_accounts").upsert(accRows);
  }

  // 4. Upsert cdts
  if (Array.isArray(cdts) && cdts.length > 0) {
    const cdtRows = cdts.map((c) => ({
      id: c.id,
      user_id: uid,
      entity_id: c.entityId || c.entity_id,
      name: c.name,
      capital: Number(c.capital) || 0,
      currency: c.currency || "COP",
      interest_rate_ea: Number(c.interestRateEA ?? c.interest_rate_ea ?? 0),
      term_days: Number(c.termDays ?? c.term_days ?? 90),
      start_date: c.startDate || c.start_date || new Date().toISOString().split("T")[0],
      maturity_date: c.maturityDate || c.maturity_date || new Date().toISOString().split("T")[0],
      rete_fuente_pct: Number(c.reteFuentePct ?? c.rete_fuente_pct ?? 4),
      is_auto_renew: Boolean(c.isAutoRenew ?? c.is_auto_renew),
      status: c.status || "active",
      extra_json: c,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from("fi_cdts").upsert(cdtRows);
  }

  // 5. Upsert transactions
  if (Array.isArray(transactions) && transactions.length > 0) {
    const delSet = new Set(deletedTxIds || []);
    const validTxs = transactions.filter((t) => t && t.id && !delSet.has(t.id));
    if (validTxs.length > 0) {
      const txRows = validTxs.map((t) => ({
        id: t.id,
        user_id: uid,
        account_id: t.accountId || t.account_id,
        entity_id: t.entityId || t.entity_id || null,
        date: t.date,
        time: t.time || null,
        type: t.type || "credit",
        amount: Number(t.amount) || 0,
        currency: t.currency || "COP",
        description: t.description || "",
        category: t.category || null,
        source: t.source || "manual",
        extra_json: t,
        updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < txRows.length; i += 50) {
        const chunk = txRows.slice(i, i + 50);
        await supabase.from("fi_transactions").upsert(chunk);
      }
    }
  }

  return { success: true, timestamp: new Date().toISOString(), directSupabase: true };
}

export async function directDeleteCreditPurchase(purchaseId) {
  if (!purchaseId) return;
  const cleanId = purchaseId.startsWith("cp_") ? purchaseId.replace("cp_", "") : purchaseId;
  const cpId = purchaseId.startsWith("cp_") ? purchaseId : `cp_${purchaseId}`;
  try {
    await supabase
      .from("cf_credit_purchases")
      .delete()
      .in("id", [purchaseId, cleanId, cpId]);
  } catch (err) {
    console.warn("[directDeleteCreditPurchase] Error deleting purchase directly:", err);
  }
}

export async function directSaveCashFlow(payload = {}) {
  const uid = OWNER_USER_ID;
  const {
    startPeriod,
    activePeriod,
    currency,
    allocationModel,
    customRatios,
    emergencyFundTargetMonths,
    defaultFundingAccountId,
    payrollAccount,
    creditCards,
    creditPurchases,
    deletedCreditPurchaseIds,
    creditCardPayments,
    deletedCreditCardPaymentIds,
    expensesLog,
    deletedExpenseIds,
    debts,
    deletedDebtIds,
  } = payload;

  const promises = [];

  // 1. Credit Cards
  if (Array.isArray(creditCards) && creditCards.length > 0) {
    const cardRows = creditCards.map((c) => ({
      id: c.id,
      user_id: uid,
      name: c.name || "",
      brand: c.cardType || c.brand || "",
      total_limit: Number(c.totalLimit) || 0,
      used_limit: Number(c.usedLimit) || 0,
      cutoff_day: Number(c.closingDay ?? c.cutoffDay ?? 15),
      due_day: Number(c.paymentDay ?? c.dueDay ?? 2),
      extra_json: c,
      updated_at: new Date().toISOString(),
    }));
    promises.push(supabase.from("cf_credit_cards").upsert(cardRows));
  }

  // 2. Debts (delete + upsert)
  if (Array.isArray(deletedDebtIds) && deletedDebtIds.length > 0) {
    promises.push(supabase.from("cf_debts").delete().eq("user_id", uid).in("id", deletedDebtIds));
  }
  if (Array.isArray(debts) && debts.length > 0) {
    const delDebtSet = new Set(deletedDebtIds || []);
    const validDebts = debts.filter((d) => d && d.id && !delDebtSet.has(d.id));
    if (validDebts.length > 0) {
      const debtRows = validDebts.map((d) => ({
        id: d.id,
        user_id: uid,
        origin_movement_id: d.originMovementId || null,
        debt_type: d.debtType || "payable",
        concept: d.concept || "",
        debtor: d.debtor || "",
        creditor: d.creditor || "",
        total_amount: Number(d.totalAmount || 0),
        remaining_amount: Number(d.remainingAmount || 0),
        my_share: Number(d.myShare || 0),
        status: d.status || "pending",
        participants_json: d.participants || [],
        payments_log_json: d.paymentsLog || [],
        notes: d.notes || "",
        extra_json: d,
        created_at: d.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      promises.push(supabase.from("cf_debts").upsert(debtRows));
    }
  }

  // 3. Credit Purchases (delete + upsert)
  if (Array.isArray(deletedCreditPurchaseIds) && deletedCreditPurchaseIds.length > 0) {
    promises.push(supabase.from("cf_credit_purchases").delete().eq("user_id", uid).in("id", deletedCreditPurchaseIds));
  }
  if (Array.isArray(creditPurchases) && creditPurchases.length > 0) {
    const delCpSet = new Set(deletedCreditPurchaseIds || []);
    const validPurchases = creditPurchases.filter((p) => p && p.id && !delCpSet.has(p.id));
    if (validPurchases.length > 0) {
      const cpRows = validPurchases.map((p) => ({
        id: p.id,
        user_id: uid,
        card_id: p.cardId,
        movement_id: p.movementId || null,
        description: p.description || "",
        total_amount: Number(p.totalAmount ?? p.amount ?? 0),
        installments_count: Number(p.installmentsCount || 1),
        monthly_installment: Number(p.monthlyInstallment || 0),
        start_period: p.startPeriod || activePeriod || "2026-11",
        date: p.date || new Date().toISOString().split("T")[0],
        extra_json: p,
        created_at: p.createdAt || new Date().toISOString(),
      }));
      promises.push(supabase.from("cf_credit_purchases").upsert(cpRows));
    }
  }

  // 4. Credit Payments (delete + upsert)
  if (Array.isArray(deletedCreditCardPaymentIds) && deletedCreditCardPaymentIds.length > 0) {
    promises.push(supabase.from("cf_credit_payments").delete().eq("user_id", uid).in("id", deletedCreditCardPaymentIds));
  }
  if (Array.isArray(creditCardPayments) && creditCardPayments.length > 0) {
    const delPaySet = new Set(deletedCreditCardPaymentIds || []);
    const validPayments = creditCardPayments.filter((p) => p && p.id && !delPaySet.has(p.id));
    if (validPayments.length > 0) {
      const payRows = validPayments.map((p) => ({
        id: p.id,
        user_id: uid,
        card_id: p.cardId,
        card_name: p.cardName || "",
        period: p.period || activePeriod || "2026-11",
        amount: Number(p.amount) || 0,
        date: p.date || new Date().toISOString().split("T")[0],
        time: p.time || null,
        source_type: p.sourceType || "payroll",
        source_account_id: p.sourceAccountId || null,
        source_account_name: p.sourceAccountName || null,
        budget_deductions_json: p.budgetDeductions || [],
        notes: p.notes || "",
        extra_json: p,
        created_at: p.createdAt || new Date().toISOString(),
      }));
      promises.push(supabase.from("cf_credit_payments").upsert(payRows));
    }
  }

  // 5. Movements / Expenses (delete + upsert)
  if (Array.isArray(deletedExpenseIds) && deletedExpenseIds.length > 0) {
    promises.push(supabase.from("cf_movements").delete().eq("user_id", uid).in("id", deletedExpenseIds));
  }
  if (Array.isArray(expensesLog) && expensesLog.length > 0) {
    const delExpSet = new Set(deletedExpenseIds || []);
    const validMovements = expensesLog.filter((m) => m && m.id && !delExpSet.has(m.id));
    if (validMovements.length > 0) {
      const movRows = validMovements.map((m) => ({
        id: m.id,
        user_id: uid,
        period: m.period || activePeriod || "2026-11",
        date: m.date,
        time: m.time || null,
        type: m.type || "debit",
        amount: Number(m.amount) || 0,
        currency: m.currency || "COP",
        description: m.description || "",
        budget_item_id: m.budgetItemId || null,
        budget_item_name: m.budgetItemName || null,
        budget_item_type: m.budgetItemType || null,
        sub_item_id: m.subItemId || null,
        sub_item_name: m.subItemName || null,
        payment_source_json: m.paymentSource || {},
        destination_account_id: m.destinationAccountId || null,
        destination_account_name: m.destinationAccountName || null,
        is_split_child: Boolean(m.isSplitChild),
        split_parent_id: m.splitParentId || null,
        credit_card_payment_id: m.creditCardPaymentId || null,
        card_id: m.cardId || null,
        debt_id: m.debtId || null,
        is_loan: Boolean(m.isLoan),
        is_shared_expense: Boolean(m.isSharedExpense || m.isSplit),
        participants_json: m.participants || [],
        is_explicit_sankey_income: Boolean(m.isExplicitBudgetIncome || m.isExplicitSankeyIncome),
        extra_json: m,
        created_at: m.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < movRows.length; i += 50) {
        promises.push(supabase.from("cf_movements").upsert(movRows.slice(i, i + 50)));
      }
    }
  }

  // 6. Base Periods Config (ratios, emergencyFundTargetMonths, currency, payrollAccount, defaultFundingAccountId)
  if (customRatios || emergencyFundTargetMonths != null || payrollAccount || defaultFundingAccountId) {
    const configRow = {
      period: "base",
      user_id: uid,
      active_period: activePeriod || "2026-11",
      start_period: startPeriod || "2026-11",
      currency: currency || "COP",
      allocation_model: allocationModel || "custom",
      needs_ratio: customRatios?.needs ?? 40.0,
      wants_ratio: customRatios?.wants ?? 20.0,
      savings_ratio: customRatios?.savings ?? 40.0,
      emergency_months: emergencyFundTargetMonths ?? 6,
      payroll_account_json: {
        defaultFundingAccountId,
        payrollAccount,
      },
      deleted_ids_json: {
        deletedExpenseIds: deletedExpenseIds || [],
        deletedDebtIds: deletedDebtIds || [],
        deletedCreditCardPaymentIds: deletedCreditCardPaymentIds || [],
        deletedCreditPurchaseIds: deletedCreditPurchaseIds || [],
      },
      updated_at: new Date().toISOString(),
    };
    promises.push(supabase.from("cf_periods_config").upsert([configRow]));
  }

  await Promise.all(promises);
  return { success: true, timestamp: new Date().toISOString(), directSupabase: true };
}

// ── 4. Direct Purchases & Portfolios Fetch & CRUD (Supabase SSOT) ───────────────
function assertSupabaseOk(error, action) {
  if (error) {
    throw new Error(`[Supabase Purchases] ${action}: ${error.message || String(error)}`);
  }
}

function parsePlanConfig(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapLotToRow(lot) {
  return {
    id: String(lot.id),
    portfolio_id: lot.portfolioId || "hist_default",
    ticker: String(lot.ticker || "").trim().toUpperCase(),
    date: lot.date || new Date().toISOString().slice(0, 10),
    purchase_price: Number(lot.purchasePrice ?? lot.purchase_price ?? 0),
    shares: Number(lot.shares ?? 0),
    manual_current_price:
      lot.manualCurrentPrice != null ? Number(lot.manualCurrentPrice) : null,
    purchase_time: lot.purchaseTime || null,
    commission_amount: Number(lot.commissionAmount ?? 0),
    notes: lot.notes ?? null,
    user_id: OWNER_USER_ID,
  };
}

function mapSaleToRow(sale) {
  return {
    id: String(sale.id),
    lot_id: sale.lotId ? String(sale.lotId) : null,
    portfolio_id: sale.portfolioId || "hist_default",
    ticker: String(sale.ticker || "").trim().toUpperCase(),
    sale_date: sale.saleDate || new Date().toISOString().slice(0, 10),
    sale_time: sale.saleTime || null,
    sale_price: Number(sale.salePrice ?? 0),
    shares: Number(sale.shares ?? 0),
    sale_commission: Number(sale.saleCommission ?? 0),
    realized_pnl: Number(sale.realizedPnl ?? 0),
    notes: sale.notes ?? null,
    user_id: OWNER_USER_ID,
    purchase_date: sale.purchaseDate || null,
    cost_basis: sale.costBasis != null ? Number(sale.costBasis) : null,
  };
}

export async function directFetchPurchases() {
  const userFilter = `user_id.eq.${OWNER_USER_ID},user_id.is.null`;
  const [portsRes, purchasesRes, salesRes] = await Promise.all([
    supabase.from("rv_portfolios").select("*").or(userFilter),
    supabase.from("rv_purchases").select("*").or(userFilter).order("date", { ascending: false }),
    supabase.from("rv_sales").select("*").or(userFilter).order("sale_date", { ascending: false }),
  ]);

  assertSupabaseOk(portsRes.error, "fetch portfolios");
  assertSupabaseOk(purchasesRes.error, "fetch purchases");
  assertSupabaseOk(salesRes.error, "fetch sales");

  const purchasePortfolios = (portsRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    isPlan: Boolean(p.is_plan),
    planConfig: parsePlanConfig(p.plan_config),
    assetCurrency: p.asset_currency || "USD",
    localCurrency: p.local_currency || "COP",
    annualInflationRate: Number(p.annual_inflation_rate ?? 0),
    inflationRate: Number(p.annual_inflation_rate ?? 0),
    useAutoColInflation: p.use_auto_col_inflation !== false,
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
    individualPurchases: (individualPurchases || []).filter(
      (p) => Number(p.shares || 0) > 1e-6
    ),
    purchaseSales,
  };
}

export async function directCreatePurchasePortfolio(id, name, isPlan = false) {
  const { error } = await supabase.from("rv_portfolios").upsert(
    [
      {
        id: String(id),
        name: String(name),
        is_plan: Boolean(isPlan),
        plan_config: null,
        asset_currency: "USD",
        local_currency: "COP",
        annual_inflation_rate: 0.0,
        use_auto_col_inflation: true,
        user_id: OWNER_USER_ID,
      },
    ],
    { onConflict: "id" }
  );
  assertSupabaseOk(error, "create portfolio");
  return { success: true, id };
}

export async function directRenamePurchasePortfolio(id, newName) {
  const { error } = await supabase
    .from("rv_portfolios")
    .update({ name: String(newName) })
    .eq("id", String(id));
  assertSupabaseOk(error, "rename portfolio");
  return { success: true, id, name: newName };
}

export async function directDeletePurchasePortfolio(id) {
  const pid = String(id);
  const { error: salesErr } = await supabase.from("rv_sales").delete().eq("portfolio_id", pid);
  assertSupabaseOk(salesErr, "delete portfolio sales");
  const { error: lotsErr } = await supabase.from("rv_purchases").delete().eq("portfolio_id", pid);
  assertSupabaseOk(lotsErr, "delete portfolio lots");
  const { error: portErr } = await supabase.from("rv_portfolios").delete().eq("id", pid);
  assertSupabaseOk(portErr, "delete portfolio");
  return { success: true, id: pid };
}

export async function directTogglePortfolioPlan(id, isPlan, planConfig = null) {
  const serializedConfig =
    planConfig == null
      ? null
      : typeof planConfig === "string"
        ? planConfig
        : JSON.stringify(planConfig);
  const { error } = await supabase
    .from("rv_portfolios")
    .update({
      is_plan: Boolean(isPlan),
      plan_config: serializedConfig,
    })
    .eq("id", String(id));
  assertSupabaseOk(error, "toggle portfolio plan");
  return { success: true, id, isPlan, planConfig };
}

export async function directUpdatePortfolioSettings(
  id,
  assetCurrency,
  localCurrency,
  inflationRate,
  useAutoColInflation
) {
  const { error } = await supabase
    .from("rv_portfolios")
    .update({
      asset_currency: assetCurrency || "USD",
      local_currency: localCurrency || "COP",
      annual_inflation_rate: Number(inflationRate ?? 0),
      use_auto_col_inflation: Boolean(useAutoColInflation),
    })
    .eq("id", String(id));
  assertSupabaseOk(error, "update portfolio settings");
  return { success: true, id };
}

export async function directCreatePurchaseLot(lot) {
  const row = mapLotToRow(lot);
  if (row.shares <= 1e-6) {
    return directDeletePurchaseLot(row.id);
  }
  const { error } = await supabase
    .from("rv_purchases")
    .upsert([row], { onConflict: "id" });
  assertSupabaseOk(error, "create purchase lot");
  return { success: true, id: row.id };
}

export async function directUpdatePurchaseLots(lots) {
  if (!Array.isArray(lots) || lots.length === 0) {
    return { success: true, updated: 0 };
  }
  const rows = lots.map(mapLotToRow);
  const zeroIds = rows.filter((r) => r.shares <= 1e-6).map((r) => r.id);
  const activeRows = rows.filter((r) => r.shares > 1e-6);

  if (zeroIds.length > 0) {
    const { error: delErr } = await supabase
      .from("rv_purchases")
      .delete()
      .in("id", zeroIds);
    assertSupabaseOk(delErr, "delete zero-share lots");
  }
  if (activeRows.length > 0) {
    const { error: upErr } = await supabase
      .from("rv_purchases")
      .upsert(activeRows, { onConflict: "id" });
    assertSupabaseOk(upErr, "update purchase lots");
  }
  return { success: true, updated: lots.length };
}

export async function directDeletePurchaseLot(id) {
  const { error } = await supabase
    .from("rv_purchases")
    .delete()
    .eq("id", String(id));
  assertSupabaseOk(error, "delete purchase lot");
  return { success: true, id };
}

export async function directCreatePurchaseSale(sale) {
  const row = mapSaleToRow(sale);
  const { error } = await supabase
    .from("rv_sales")
    .upsert([row], { onConflict: "id" });
  assertSupabaseOk(error, "create purchase sale");
  return { success: true, id: row.id };
}

export async function directDeletePurchaseSale(id) {
  const { error } = await supabase
    .from("rv_sales")
    .delete()
    .eq("id", String(id));
  assertSupabaseOk(error, "delete purchase sale");
  return { success: true, id };
}

// ── 5. Direct Custom Strategies & Rebalances ────────────────────────────────
export async function directFetchCustomStrategies() {
  const { data, error } = await supabase
    .from("custom_strategies")
    .select("*")
    .order("created_at", { ascending: true });
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
    createdAt: s.created_at,
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
  const substitutesByDate = {};
  const detailByDate = {};

  (tickersRes.data || []).forEach((t) => {
    const d = t.rebalance_date;
    if (!tickersByDate[d]) tickersByDate[d] = [];
    if (!substitutesByDate[d]) substitutesByDate[d] = {};
    if (!detailByDate[d]) detailByDate[d] = [];

    if (t.ticker && !tickersByDate[d].includes(t.ticker)) {
      tickersByDate[d].push(t.ticker);
      if (t.substitute_for) {
        substitutesByDate[d][t.ticker] = t.substitute_for;
      }
      detailByDate[d].push({
        ticker: t.ticker,
        substitute_for: t.substitute_for || null,
        substituteFor: t.substitute_for || null,
      });
    }
  });

  return (rebRes.data || []).map((r) => ({
    date: r.rebalance_date,
    rebalance_date: r.rebalance_date,
    cash_added: r.cash_added || 0,
    strategy_id: r.strategy_id,
    is_active: r.is_active ?? true,
    isActive: r.is_active ?? true,
    tickers: tickersByDate[r.rebalance_date] || [],
    substitutes: substitutesByDate[r.rebalance_date] || {},
    tickers_detail: detailByDate[r.rebalance_date] || [],
  }));
}

export async function directCreateRebalance({
  rebalance_date,
  cash_added = 0,
  tickers = [],
  strategy_id = "historical",
  is_active = true,
  substitutes = {},
}) {
  const uid = OWNER_USER_ID;
  // 1. Delete previous rebalance and tickers for this date & strategy
  await supabase
    .from("rebalance_tickers")
    .delete()
    .eq("rebalance_date", rebalance_date)
    .eq("strategy_id", strategy_id);

  await supabase
    .from("rebalances")
    .delete()
    .eq("rebalance_date", rebalance_date)
    .eq("strategy_id", strategy_id);

  // 2. Insert into rebalances
  const { error: rebErr } = await supabase
    .from("rebalances")
    .insert({
      rebalance_date,
      cash_added: Number(cash_added) || 0,
      strategy_id,
      user_id: uid,
      is_active: Boolean(is_active),
    });

  if (rebErr) throw rebErr;

  // 3. Insert into rebalance_tickers
  const subsMap = substitutes || {};
  const rows = (tickers || []).map((item) => {
    let t, sub;
    if (typeof item === "object" && item !== null) {
      t = item.ticker;
      sub = item.substitute_for || item.substituteFor || subsMap[t] || null;
    } else {
      t = String(item).trim().toUpperCase();
      sub = subsMap[t] || null;
    }
    return {
      rebalance_date,
      ticker: t,
      strategy_id,
      user_id: uid,
      substitute_for: sub,
    };
  });

  if (rows.length > 0) {
    const { error: tickErr } = await supabase
      .from("rebalance_tickers")
      .insert(rows);
    if (tickErr) throw tickErr;
  }

  return { status: "ok", strategy_id };
}

export async function directToggleRebalanceActive({
  rebalance_date,
  is_active,
  strategy_id = "historical",
}) {
  const { error } = await supabase
    .from("rebalances")
    .update({ is_active: Boolean(is_active) })
    .eq("rebalance_date", rebalance_date)
    .eq("strategy_id", strategy_id);

  if (error) throw error;
  return { status: "ok" };
}

export async function directDeleteRebalance(date, strategyId = "historical") {
  await supabase
    .from("rebalance_tickers")
    .delete()
    .eq("rebalance_date", date)
    .eq("strategy_id", strategyId);

  const { error } = await supabase
    .from("rebalances")
    .delete()
    .eq("rebalance_date", date)
    .eq("strategy_id", strategyId);

  if (error) throw error;
  return { status: "ok" };
}

export async function directUpdateRebalanceDate(oldDate, newDate, strategyId = "historical") {
  // Update in rebalances
  const { error: rErr } = await supabase
    .from("rebalances")
    .update({ rebalance_date: newDate })
    .eq("rebalance_date", oldDate)
    .eq("strategy_id", strategyId);

  if (rErr) throw rErr;

  // Update in rebalance_tickers
  const { error: tErr } = await supabase
    .from("rebalance_tickers")
    .update({ rebalance_date: newDate })
    .eq("rebalance_date", oldDate)
    .eq("strategy_id", strategyId);

  if (tErr) throw tErr;
  return { status: "ok" };
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

// ── 7. Direct Market Indices History from Supabase ─────────────────────────
export async function directFetchIndicesHistory(startDate = "2020-01-01") {
  const { data, error } = await supabase
    .from("market_indices_history")
    .select("date_str, values_json")
    .gte("date_str", startDate)
    .order("date_str", { ascending: true });

  if (error || !data) return {};
  const result = {};
  data.forEach((row) => {
    if (row.date_str && row.values_json) {
      result[row.date_str] = row.values_json;
    }
  });
  return result;
}
