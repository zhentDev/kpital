/**
 * Synthesizes Kpital's live financial & economic state (Investments, Fixed Income,
 * Cash Flow, Debts, Credit Cards, and TRM) for Multi-AI Economic Q&A and WarrenAI prompts.
 * Works 100% client-side in production (GitHub Pages) and locally.
 */

import { isMainOwnerUser } from "../store/authStore";
import { useAuthStore } from "../store/authStore";
import { useCashFlowStore } from "../store/cashFlowStore";
import { useFixedIncomeStore } from "../store/fixedIncomeStore";
import { usePortfolioStore } from "../store/portfolioStore";

const MAX_CONTEXT_CHARS = 14000;

export const AI_CONTEXT_SCOPES = [
  {
    id: "all",
    label: "Patrimonio Completo",
    icon: "🌐",
    desc: "Acciones, CDTs, Bancos, Presupuesto, Deudas y TRM",
  },
  {
    id: "investments",
    label: "Inversiones & Bolsa",
    icon: "📈",
    desc: "Portafolios de compras, ventas realizadas y Estrategias",
  },
  {
    id: "fixed_income",
    label: "Renta Fija & CDTs",
    icon: "🏦",
    desc: "CDTs activos (COP/USD), tasas E.A. y cuentas de ahorro",
  },
  {
    id: "cash_flow",
    label: "Flujo, Presupuesto & Deudas",
    icon: "💸",
    desc: "Ingresos, gastos del ciclo, tarjetas y préstamos",
  },
  {
    id: "macro",
    label: "Economía & Macro",
    icon: "🌍",
    desc: "Enfoque macro: TRM, tasas, exposición cambiaria y liquidez",
  },
];

const toNum = (val, fallback = 0) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const fmtCOP = (val) => `$${Math.round(toNum(val)).toLocaleString("es-CO")} COP`;

const fmtUSD = (val) =>
  `$${toNum(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

const fmtPct = (val) => `${toNum(val) >= 0 ? "+" : ""}${toNum(val).toFixed(2)}%`;

function buildPurchasesSection(portfolioState, liveQuotesMap) {
  const portfolios = portfolioState?.purchasePortfolios || [];
  const lots = portfolioState?.individualPurchases || [];
  const sales = portfolioState?.purchaseSales || [];
  const cachedQuotes = portfolioState?.lastKnownQuotes || {};

  const getQuote = (ticker) => {
    const t = String(ticker || "").toUpperCase();
    return liveQuotesMap?.[t] || cachedQuotes?.[t] || null;
  };

  let totalPurchasesUSD = 0;
  let totalRealizedUSD = 0;
  const lines = ["### 1. PORTAFOLIOS DE COMPRAS REALES Y VENTAS CERRADAS:"];
  const positionIndex = [];

  if (portfolios.length === 0 && lots.length === 0) {
    lines.push("- Sin portafolios ni compras registradas en la sesión actual.");
    return { lines, totalPurchasesUSD, totalRealizedUSD, positionIndex };
  }

  for (const p of portfolios) {
    const pid = p.id;
    const currency = p.assetCurrency || "USD";
    const pLots = lots.filter(
      (l) => (l.portfolioId || l.portfolio_id) === pid && toNum(l.shares) > 1e-6,
    );
    const pSales = sales.filter((s) => (s.portfolioId || s.portfolio_id) === pid);

    let invested = 0;
    let current = 0;
    const byTicker = new Map();

    for (const l of pLots) {
      const ticker = String(l.ticker || "")
        .trim()
        .toUpperCase();
      if (!ticker) continue;
      const shares = toNum(l.shares);
      const buyPrice = toNum(l.purchasePrice ?? l.purchase_price);
      const comm = toNum(l.commissionAmount ?? l.commission_amount);
      const lotCost = toNum(l.investedAmount, shares * buyPrice) + comm;
      const q = getQuote(ticker);
      const manualP = toNum(l.manualCurrentPrice ?? l.manual_current_price, 0);
      const curPrice = toNum(q?.price, 0) || manualP || buyPrice;
      const chg1d = toNum(q?.change_pct ?? q?.changePct, 0);

      invested += lotCost;
      current += shares * curPrice;

      const prev = byTicker.get(ticker) || {
        ticker,
        portfolioName: p.name,
        currency,
        name: q?.name || ticker,
        shares: 0,
        totalCost: 0,
        curPrice,
        chg1d,
      };
      prev.shares += shares;
      prev.totalCost += lotCost;
      prev.curPrice = curPrice;
      prev.chg1d = chg1d;
      byTicker.set(ticker, prev);
    }

    const realizedPnl = pSales.reduce((acc, s) => acc + toNum(s.realizedPnl ?? s.realized_pnl), 0);
    if (currency === "USD") {
      totalPurchasesUSD += current;
      totalRealizedUSD += realizedPnl;
    }

    const retPct = invested > 0 ? ((current - invested) / invested) * 100 : 0;
    lines.push(
      `**${p.name}** (${currency}) — Invertido: $${invested.toFixed(2)} | Actual: $${current.toFixed(2)} (${fmtPct(retPct)}) | PnL Realizado (${pSales.length} ventas): $${realizedPnl.toFixed(2)}`,
    );

    for (const pos of byTicker.values()) {
      const avgPrice = pos.shares > 0 ? pos.totalCost / pos.shares : 0;
      const curVal = pos.shares * pos.curPrice;
      const posRetPct = pos.totalCost > 0 ? ((curVal - pos.totalCost) / pos.totalCost) * 100 : 0;
      positionIndex.push({
        ...pos,
        avgPrice,
        curVal,
        posRetPct,
      });
      lines.push(
        `  * ${pos.ticker}: ${pos.shares.toFixed(4)} uds @ $${avgPrice.toFixed(2)} -> Actual $${pos.curPrice.toFixed(4)} (Hoy: ${fmtPct(pos.chg1d)}, Retorno: ${fmtPct(posRetPct)})`,
      );
    }

    for (const s of pSales.slice(0, 3)) {
      const sDate = s.saleDate || s.sale_date || "N/A";
      const sTicker = String(s.ticker || "").toUpperCase();
      const sShares = toNum(s.shares);
      const sPrice = toNum(s.salePrice ?? s.sale_price);
      const sPnl = toNum(s.realizedPnl ?? s.realized_pnl);
      lines.push(
        `  * [Venta ${sDate}] ${sTicker}: ${sShares.toFixed(4)} uds @ $${sPrice.toFixed(2)} (PnL: $${sPnl.toFixed(2)})`,
      );
    }
    lines.push("");
  }

  return { lines, totalPurchasesUSD, totalRealizedUSD, positionIndex };
}

function buildStrategiesSection(portfolioState) {
  const strats = portfolioState?.customStrategies || [];
  const rebalMap = portfolioState?.strategyRebalances || {};
  const navSummaries = portfolioState?.lastStrategySummaries || {};
  const lines = [];
  let realStratsMarketUSD = 0;

  if (strats.length === 0) {
    return { lines, realStratsMarketUSD };
  }

  lines.push("### 2. ESTRATEGIAS CUANTITATIVAS (PROPICKS / TITANES):");
  for (const s of strats) {
    const sid = s.id;
    const rebs = (rebalMap[sid] || []).filter(
      (r) => r?.is_active !== false && r?.isActive !== false,
    );
    const latestReb = rebs.length > 0 ? rebs[rebs.length - 1] : null;
    const activeTickers = latestReb?.tickers || [];
    const subs = latestReb?.substitutes || {};
    const subsPairs = Object.entries(subs);
    const subsText =
      subsPairs.length > 0
        ? ` | Sustitutos: ${subsPairs.map(([k, v]) => `${k}→${v}`).join(", ")}`
        : "";

    const navSum = navSummaries[sid]?.summary;
    const navVal = toNum(navSum?.current_value ?? navSum?.final_value, 0);
    const navRet =
      navSum?.total_return_pct != null ? `, Rend: ${fmtPct(navSum.total_return_pct)}` : "";
    const capital = toNum(s.capital, 0);

    if (s.isRealMoney) {
      realStratsMarketUSD += navVal > 0 ? navVal : capital;
    }

    lines.push(
      `- ${s.name}: Capital $${capital.toFixed(2)} (${s.numSlots || 20} slots${navVal > 0 ? `, Valor Actual $${navVal.toFixed(2)}${navRet}` : ""}) | Benchmark: ${s.benchmark || "N/A"} | Real: ${s.isRealMoney ? "Sí" : "Simulado"}`,
    );
    lines.push(
      `  * Último Rebalanceo: ${latestReb?.rebalance_date || latestReb?.date || "N/A"} | Tickers (${activeTickers.length}): [${activeTickers.join(", ") || "N/A"}]${subsText}`,
    );
  }
  lines.push("");

  return { lines, realStratsMarketUSD };
}

function buildFixedIncomeSection(fixedIncomeState, fxRate) {
  const entities = fixedIncomeState?.entities || [];
  const accounts = fixedIncomeState?.accounts || [];
  const cdts = fixedIncomeState?.cdts || [];

  const entityMap = new Map(entities.map((e) => [e.id, e.name]));
  const activeCdts = cdts.filter((c) => String(c.status || "active").toLowerCase() !== "matured");
  const maturedCdtsCount = cdts.length - activeCdts.length;

  const cdtsCOP = activeCdts
    .filter((c) => (c.currency || "COP") === "COP")
    .reduce((acc, c) => acc + toNum(c.capital), 0);
  const cdtsUSD = activeCdts
    .filter((c) => c.currency === "USD")
    .reduce((acc, c) => acc + toNum(c.capital), 0);

  const savingsCOP = accounts
    .filter((a) => (a.currency || "COP") === "COP")
    .reduce((acc, a) => acc + toNum(a.balance), 0);
  const savingsUSD = accounts
    .filter((a) => a.currency === "USD")
    .reduce((acc, a) => acc + toNum(a.balance), 0);

  const totalCOP = cdtsCOP + savingsCOP;
  const totalUSD = cdtsUSD + savingsUSD;
  const totalCOPEquiv = totalCOP + totalUSD * fxRate;

  const lines = ["### 3. RENTA FIJA Y LIQUIDEZ BANCARIA (CDTs VENCIDOS EXCLUIDOS):"];
  lines.push(
    `- CDTs Activos (${activeCdts.length} vigentes; ${maturedCdtsCount} vencidos/cerrados excluidos): ${fmtCOP(cdtsCOP)}${cdtsUSD > 0 ? ` + ${fmtUSD(cdtsUSD)}` : ""}`,
  );
  lines.push(
    `- Cuentas de Ahorro y Bolsillos (${accounts.length} cuentas): ${fmtCOP(savingsCOP)}${savingsUSD > 0 ? ` + ${fmtUSD(savingsUSD)}` : ""}`,
  );

  for (const c of activeCdts) {
    const entName = entityMap.get(c.entityId) || "Entidad";
    const cur = c.currency || "COP";
    lines.push(
      `  * CDT ${entName} '${c.name}': ${cur === "USD" ? fmtUSD(c.capital) : fmtCOP(c.capital)} @ ${toNum(c.interestRateEA).toFixed(2)}% E.A. (Plazo: ${c.termDays || "N/A"}d, Vence: ${c.maturityDate || "N/A"})`,
    );
  }

  const fundedAccounts = [...accounts]
    .filter((a) => toNum(a.balance) > 0)
    .sort((a, b) => {
      const aVal = (a.currency === "USD" ? fxRate : 1) * toNum(a.balance);
      const bVal = (b.currency === "USD" ? fxRate : 1) * toNum(b.balance);
      return bVal - aVal;
    })
    .slice(0, 10);

  for (const a of fundedAccounts) {
    const entName = entityMap.get(a.entityId) || "Entidad";
    const cur = a.currency || "COP";
    lines.push(
      `  * Cuenta ${entName} '${a.name}': ${cur === "USD" ? fmtUSD(a.balance) : fmtCOP(a.balance)} @ ${toNum(a.interestRateEA).toFixed(2)}% E.A.`,
    );
  }
  lines.push("");

  return {
    lines,
    totalCOP,
    totalUSD,
    totalCOPEquiv,
    activeCdtsCount: activeCdts.length,
    maturedCdtsCount,
  };
}

function buildCashFlowSection(cashFlowState) {
  const period = cashFlowState?.activePeriod || new Date().toISOString().slice(0, 7);
  const inflows = cashFlowState?.inflows || [];
  const needs = cashFlowState?.needs || [];
  const wants = cashFlowState?.wants || [];
  const wealth = cashFlowState?.wealth || [];
  const movements = cashFlowState?.expensesLog || [];
  const debts = cashFlowState?.debts || [];
  const cards = cashFlowState?.creditCards || [];

  const sumArr = (arr) => arr.reduce((acc, item) => acc + toNum(item?.amount), 0);
  const inflowsPlan = sumArr(inflows);
  const needsPlan = sumArr(needs);
  const wantsPlan = sumArr(wants);
  const wealthPlan = sumArr(wealth);

  const periodMovs = movements.filter(
    (m) => (m?.period || String(m?.date || "").slice(0, 7)) === period,
  );
  let actualIncome = 0;
  let actualExpense = 0;
  for (const mov of periodMovs) {
    const t = String(mov?.type || "").toLowerCase();
    const bt = String(mov?.budgetItemType || "").toLowerCase();
    const amt = toNum(mov?.amount);
    if (t === "credit" || t === "income" || bt === "income") {
      actualIncome += amt;
    } else if (t === "debit" || t === "expense" || bt === "needs" || bt === "wants") {
      actualExpense += amt;
    }
  }

  const activeDebts = debts.filter(
    (d) => String(d?.status || "").toLowerCase() !== "paid" && toNum(d?.remainingAmount) > 0,
  );
  const receivables = activeDebts.filter((d) => d.debtType === "receivable");
  const payables = activeDebts.filter((d) => d.debtType !== "receivable");
  const receivableTotal = receivables.reduce((acc, d) => acc + toNum(d.remainingAmount), 0);
  const payableTotal = payables.reduce((acc, d) => acc + toNum(d.remainingAmount), 0);
  const cardDebtTotal = cards.reduce((acc, c) => acc + toNum(c.usedLimit), 0);

  const lines = [`### 4. FLUJO DE CAJA, PRESUPUESTO, DEUDAS Y TARJETAS (Ciclo ${period}):`];
  lines.push(
    `- Presupuesto Mensual Planificado: Ingresos ${fmtCOP(inflowsPlan)} | Necesidades ${fmtCOP(needsPlan)} | Deseos ${fmtCOP(wantsPlan)} | Ahorro/Inversión ${fmtCOP(wealthPlan)}`,
  );
  lines.push(
    `- Movimientos Reales Registrados en Ciclo (${periodMovs.length}): Entradas ${fmtCOP(actualIncome)} | Salidas ${fmtCOP(actualExpense)}`,
  );
  lines.push(
    `- Deudas Activas: Por Cobrar ${fmtCOP(receivableTotal)} (${receivables.length}) | Por Pagar ${fmtCOP(payableTotal)} (${payables.length}) | Saldo Tarjetas Crédito ${fmtCOP(cardDebtTotal)}`,
  );

  for (const d of activeDebts.slice(0, 6)) {
    const isRec = d.debtType === "receivable";
    const person = isRec ? d.debtor : d.creditor;
    lines.push(
      `  * ${isRec ? "Por Cobrar" : "Por Pagar"}: ${d.concept || "Sin concepto"} (${person || "N/A"}) — Saldo: ${fmtCOP(d.remainingAmount)}`,
    );
  }
  for (const c of cards) {
    const avail = Math.max(0, toNum(c.totalLimit) - toNum(c.usedLimit));
    lines.push(
      `  * Tarjeta ${c.name}: Usado ${fmtCOP(c.usedLimit)} / Cupo ${fmtCOP(c.totalLimit)} (Disponible: ${fmtCOP(avail)})`,
    );
  }
  lines.push("");

  return { lines, receivableTotal, payableTotal, cardDebtTotal };
}

function filterSpecificTickers(positionIndex, userQuestion) {
  const qLower = String(userQuestion || "").toLowerCase();
  if (!qLower || positionIndex.length === 0) return [];

  const broadEconomicTerms = [
    "cdt",
    "banco",
    "deuda",
    "tarjeta",
    "flujo",
    "presupuesto",
    "salario",
    "trm",
    "dolar",
    "dólar",
    "inflacion",
    "inflación",
    "patrimonio",
    "economia",
    "economía",
  ];
  if (broadEconomicTerms.some((term) => qLower.includes(term))) {
    return [];
  }

  const words = new Set(
    qLower
      .split(/[\s,.;:?!()[\]'"]+/)
      .map((w) => w.toUpperCase())
      .filter(Boolean),
  );

  const keywordAliases = {
    platino: ["IPLT.L", "IPLT"],
    platinum: ["IPLT.L", "IPLT"],
    oro: ["PAXG-USD", "GDX.L", "GDX"],
    gold: ["PAXG-USD", "GDX.L", "GDX"],
    nvidia: ["NVDA"],
    semiconductor: ["NVDA", "SMH", "SMH.L"],
    semiconductores: ["NVDA", "SMH", "SMH.L"],
    spacex: ["SPCX"],
    china: ["CNYA.L", "KWEB.L", "3CP.F", "NNND.F", "EMIM.L"],
    nasdaq: ["CNDX.L"],
    sp500: ["CSPX.L"],
  };

  const aliasMatches = new Set();
  for (const [kw, list] of Object.entries(keywordAliases)) {
    if (qLower.includes(kw)) {
      for (const t of list) {
        aliasMatches.add(t);
      }
    }
  }

  return positionIndex.filter((pos) => {
    const base = pos.ticker.split(".")[0].split("-")[0];
    return words.has(pos.ticker) || words.has(base) || aliasMatches.has(pos.ticker);
  });
}

/**
 * Pure builder suitable for runtime UI and automated tests.
 */
export function buildEconomicContextFromState({
  authState,
  portfolioState,
  fixedIncomeState,
  cashFlowState,
  fxRate = 4150,
  liveQuotesMap = {},
  scope = "all",
  userQuestion = "",
} = {}) {
  const safeFx = toNum(fxRate, 4150) > 500 ? toNum(fxRate, 4150) : 4150;
  const email = authState?.user?.email || null;
  const isOwner = isMainOwnerUser(email);

  const purchases = buildPurchasesSection(portfolioState, liveQuotesMap);
  const strategies = buildStrategiesSection(portfolioState);
  const fixedIncome = buildFixedIncomeSection(fixedIncomeState, safeFx);
  const cashFlow = buildCashFlowSection(cashFlowState);

  const totalEquitiesUSD = purchases.totalPurchasesUSD + strategies.realStratsMarketUSD;
  const totalAssetsCOP =
    fixedIncome.totalCOPEquiv + totalEquitiesUSD * safeFx + cashFlow.receivableTotal;
  const totalLiabilitiesCOP = cashFlow.payableTotal + cashFlow.cardDebtTotal;
  const netWorthCOP = totalAssetsCOP - totalLiabilitiesCOP;
  const netWorthUSD = safeFx > 0 ? netWorthCOP / safeFx : 0;

  // Check if user asked strictly about one or two specific tickers
  const targetedPositions =
    scope === "all" ? filterSpecificTickers(purchases.positionIndex, userQuestion) : [];
  if (targetedPositions.length > 0) {
    const lines = [
      `### FECHA: ${new Date().toISOString().slice(0, 16).replace("T", " ")} | TRM USD/COP: $${Math.round(safeFx).toLocaleString("es-CO")}`,
      `### ACTIVO(S) ESPECÍFICO(S) BAJO CONSULTA (${targetedPositions.length}):`,
    ];
    for (const pos of targetedPositions) {
      lines.push(
        `- **${pos.ticker}** (${pos.name}) en '${pos.portfolioName}': ${pos.shares.toFixed(4)} uds | ` +
          `Precio Medio: $${pos.avgPrice.toFixed(2)} | Actual: $${pos.curPrice.toFixed(4)} | ` +
          `Hoy: ${fmtPct(pos.chg1d)} | Retorno: ${fmtPct(pos.posRetPct)} | Costo: $${pos.totalCost.toFixed(2)} | Valor: $${pos.curVal.toFixed(2)}`,
      );
    }
    return {
      contextText: lines.join("\n"),
      stats: {
        fxRate: safeFx,
        netWorthCOP,
        netWorthUSD,
        totalEquitiesUSD,
        fixedIncomeCOPEquiv: fixedIncome.totalCOPEquiv,
        activeCdtsCount: fixedIncome.activeCdtsCount,
        maturedCdtsCount: fixedIncome.maturedCdtsCount,
        liabilitiesCOP: totalLiabilitiesCOP,
        receivablesCOP: cashFlow.receivableTotal,
        targetedTickers: targetedPositions.map((p) => p.ticker),
      },
      sectionsIncluded: ["targeted_positions"],
      estimatedTokens: Math.ceil(lines.join("\n").length / 4),
    };
  }

  const lines = [
    `### FECHA: ${new Date().toISOString().slice(0, 16).replace("T", " ")} | TRM USD/COP: $${Math.round(safeFx).toLocaleString("es-CO")}`,
  ];
  if (!isOwner) {
    lines.push(
      "*(Sesión no propietaria / demo: solo se muestran datos disponibles en la sesión actual)*",
    );
  }
  lines.push("");

  const sectionsIncluded = [];

  if (scope === "all" || scope === "macro") {
    sectionsIncluded.push("net_worth");
    lines.push("### 0. PATRIMONIO NETO CONSOLIDADO ESTIMADO:");
    lines.push(`- Patrimonio Neto Total: ${fmtCOP(netWorthCOP)} (≈ ${fmtUSD(netWorthUSD)})`);
    lines.push(
      `- Distribución: Renta Variable ${fmtUSD(totalEquitiesUSD)} (≈ ${fmtCOP(totalEquitiesUSD * safeFx)}) | ` +
        `Renta Fija & Bancos ${fmtCOP(fixedIncome.totalCOPEquiv)} | ` +
        `Por Cobrar ${fmtCOP(cashFlow.receivableTotal)} | Pasivos (Deudas + TC) ${fmtCOP(totalLiabilitiesCOP)}`,
    );
    lines.push("");
  }

  if (scope === "all" || scope === "investments" || scope === "macro") {
    sectionsIncluded.push("investments");
    lines.push(...purchases.lines, ...strategies.lines);
  }
  if (scope === "all" || scope === "fixed_income" || scope === "macro") {
    sectionsIncluded.push("fixed_income");
    lines.push(...fixedIncome.lines);
  }
  if (scope === "all" || scope === "cash_flow" || scope === "macro") {
    sectionsIncluded.push("cash_flow");
    lines.push(...cashFlow.lines);
  }

  let contextText = lines.join("\n").trim();
  if (contextText.length > MAX_CONTEXT_CHARS) {
    contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS)}\n\n...[Contexto recortado por límite de longitud]`;
  }

  return {
    contextText,
    stats: {
      fxRate: safeFx,
      netWorthCOP,
      netWorthUSD,
      totalEquitiesUSD,
      fixedIncomeCOPEquiv: fixedIncome.totalCOPEquiv,
      activeCdtsCount: fixedIncome.activeCdtsCount,
      maturedCdtsCount: fixedIncome.maturedCdtsCount,
      liabilitiesCOP: totalLiabilitiesCOP,
      receivablesCOP: cashFlow.receivableTotal,
      targetedTickers: [],
    },
    sectionsIncluded,
    estimatedTokens: Math.ceil(contextText.length / 4),
  };
}

/**
 * Convenience wrapper reading live Zustand stores inside the React app.
 */
export function buildLiveEconomicContext(options = {}) {
  return buildEconomicContextFromState({
    authState: useAuthStore.getState(),
    portfolioState: usePortfolioStore.getState(),
    fixedIncomeState: useFixedIncomeStore.getState(),
    cashFlowState: useCashFlowStore.getState(),
    ...options,
  });
}

/**
 * Generates a ready-to-copy prompt for external web chats (WarrenAI InvestingPro, ChatGPT, Claude, Gemini)
 * without requiring any API key.
 */
export function buildCopyReadyPrompt({ contextText, userQuestion, focus, targetedTickers = [] }) {
  const questionBlock = userQuestion?.trim()
    ? `**Mi consulta específica:**\n${userQuestion.trim()}\n\n`
    : "";
  const focusBlock = focus?.trim() ? `**Enfoque deseado:** ${focus.trim()}\n\n` : "";

  if (targetedTickers.length > 0) {
    return `Hola WarrenAI. Como analista cuantitativo de InvestingPro y ProPicks AI, necesito un diagnóstico técnico y fundamental sobre estas posiciones reales de mi cartera:\n\n${contextText}\n\n${questionBlock}${focusBlock}Por favor evalúa:\n1. Fair Value de InvestingPro, múltiplos y margen de seguridad.\n2. Soportes/resistencias clave y gestión de riesgo.\n3. Catalizadores macroeconómicos o sectoriales.`;
  }

  return `Hola. Actúa como asesor económico integral (macroeconomía, finanzas personales en Colombia COP/TRM, renta fija/CDTs, flujo de caja y mercado bursátil). Este es mi resumen financiero real actualizado desde Kpital:\n\n${contextText}\n\n${questionBlock}${focusBlock}Por favor responde con cifras exactas, escenarios y pasos concretos considerando tasas de interés, riesgo cambiario USD/COP, liquidez y costo de oportunidad.`;
}
