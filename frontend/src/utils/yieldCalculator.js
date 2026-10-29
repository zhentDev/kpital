/**
 * Compound Interest & Historical Yield Engine for Savings Accounts & CDTs.
 * Computes exact daily compound interest across historical interest rate brackets (base 360),
 * and models the full lifecycle integration between liquid Cajitas and Term Deposits (CDTs).
 */

export function calculateAccountYield(account, transactions = [], historicalRates = null, allCDTs = [], asOfDate = null) {
  if (!account) {
    return {
      netCapital: 0,
      liquidNetCapital: 0,
      liquidEarnedInterest: 0,
      liquidTotalBalance: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalEarnedInterest: 0,
      totalCalculatedBalance: 0,
      activeCDTsCount: 0,
      activeCDTsCapital: 0,
      activeCDTsAccruedInterest: 0,
      activeCDTsList: [],
      maturedCDTsCount: 0,
      maturedCDTsTotalCapital: 0,
      maturedCDTsTotalProfit: 0,
      maturedCDTsList: [],
      consolidatedTotal: 0,
      consolidatedNetCapital: 0,
      consolidatedTotalYield: 0,
      periodBreakdown: [],
      isMonthlyDisbursement: false,
      creditedYield: 0,
      pendingMonthlyYield: 0,
    };
  }

  // 0. Zero-yield safeguard for transactional checking/payroll and digital wallets (0.0% E.A.)
  const isZeroYield =
    account.accountCategory === "digital_wallet" ||
    account.accountCategory === "payroll" ||
    account.type === "wallet" ||
    Number(account.interestRateEA || 0) === 0;

  if (isZeroYield) {
    const bal = Number(account.balance || 0);
    return {
      netCapital: bal,
      liquidNetCapital: bal,
      liquidEarnedInterest: 0,
      liquidTotalBalance: bal,
      liquidAvailableBalance: bal,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalEarnedInterest: 0,
      totalCalculatedBalance: bal,
      activeCDTsCount: 0,
      activeCDTsCapital: 0,
      activeCDTsAccruedInterest: 0,
      activeCDTsList: [],
      maturedCDTsCount: 0,
      maturedCDTsTotalCapital: 0,
      maturedCDTsTotalProfit: 0,
      maturedCDTsList: [],
      consolidatedTotal: bal,
      consolidatedNetCapital: bal,
      consolidatedTotalYield: 0,
      periodBreakdown: [],
      isMonthlyDisbursement: false,
      creditedYield: 0,
      pendingMonthlyYield: 0,
    };
  }

  // 1. Resolve rates for entity
  const entityId = account.entityId || "ent_nu";
  let entityRates = historicalRates?.entities?.[entityId]?.savings_rates;
  
  if (!entityRates && historicalRates?.entities) {
    const entName = (account.entityName || "").toLowerCase();
    for (const [k, v] of Object.entries(historicalRates.entities)) {
      const kClean = k.toLowerCase().replace("ent_", "");
      const vClean = (v.name || "").toLowerCase();
      if ((entName && (kClean.includes(entName) || vClean.includes(entName))) || (entityId && entityId.includes(kClean))) {
        entityRates = v.savings_rates;
        break;
      }
    }
  }

  // Nu default fallback only if entity is Nu
  if (!entityRates && (entityId === "ent_nu" || entityId.includes("nu"))) {
    entityRates = [
      { from: "2023-06-01", to: "2024-10-07", rateEA: 13.0, notes: "13% E.A." },
      { from: "2024-10-08", to: "2024-12-09", rateEA: 12.0, notes: "12% E.A." },
      { from: "2024-12-10", to: "2025-03-09", rateEA: 11.0, notes: "11% E.A." },
      { from: "2025-03-10", to: "2025-05-08", rateEA: 9.5, notes: "9.5% E.A." },
      { from: "2025-05-09", to: "2025-08-11", rateEA: 9.25, notes: "9.25% E.A." },
      { from: "2025-08-12", to: "2026-02-05", rateEA: 8.25, notes: "8.25% E.A." },
      { from: "2026-02-06", to: "2026-10-05", rateEA: 9.25, notes: "9.25% E.A." },
      { from: "2026-10-06", to: "2099-12-31", rateEA: 9.35, notes: "9.35% E.A." },
    ];
  }

  const tieredRates = account.tieredRates || [];
  const rateHistory = Array.isArray(account.rateHistory)
    ? [...account.rateHistory].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [];

  const getRateForDateAndBalance = (dateStr, balance = 0) => {
    // 1. If account is crypto / commodity, prioritize explicit rateEA
    if (account.type === "crypto") {
      return Number(account.interestRateEA || 8.0);
    }

    // 2. Account-level chronological rateHistory (e.g., Plenti rate increase to 4.0% E.A.)
    if (rateHistory.length > 0) {
      let activeHistRate = null;
      for (const rh of rateHistory) {
        if (rh.date && dateStr >= rh.date) {
          activeHistRate = Number(rh.rateEA);
        }
      }
      if (activeHistRate && activeHistRate > 0) {
        return activeHistRate;
      }
    }

    // 3. Dynamic balance tiers if configured
    if (tieredRates.length > 0 && account.type !== "crypto") {
      for (const tier of tieredRates) {
        if (balance <= (tier.maxBalance || Infinity)) {
          return Number(tier.rateEA || account.interestRateEA || 4.0);
        }
      }
      return Number(tieredRates[tieredRates.length - 1].rateEA || account.interestRateEA || 4.0);
    }

    // 4. Historical date brackets for entity (e.g. Nu Colombia)
    if (entityRates && entityRates.length > 0 && account.type !== "crypto") {
      for (const r of entityRates) {
        if (dateStr >= r.from && dateStr <= r.to) {
          return Number(r.rateEA || account.interestRateEA || (account.currency === "USD" ? 4.0 : 9.30));
        }
      }
    }

    return Number(account.interestRateEA || (account.currency === "USD" ? 4.0 : 9.30));
  };

  // 2. Resolve CDTs linked to this account
  const accNameLower = (account.name || "").toLowerCase().replace("cajita", "").trim();
  const linkedCDTs = (allCDTs || []).filter((c) => {
    if (c.entityId !== account.entityId) return false;
    const catLower = (c.category || "").toLowerCase();
    const nameLower = (c.name || "").toLowerCase();
    return (
      (accNameLower && (catLower.includes(accNameLower) || nameLower.includes(accNameLower))) ||
      c.accountId === account.id
    );
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let activeCDTsCapital = 0;
  let activeCDTsAccruedInterest = 0;
  const activeCDTsList = [];

  let maturedCDTsTotalCapital = 0;
  let maturedCDTsTotalProfit = 0;
  const maturedCDTsList = [];

  linkedCDTs.forEach((cdt) => {
    const startD = new Date(cdt.startDate || new Date().toISOString().slice(0, 10));
    startD.setHours(0, 0, 0, 0);
    const maturityD = new Date(cdt.maturityDate || cdt.startDate);
    maturityD.setHours(0, 0, 0, 0);

    const termDays = Number(cdt.termDays || 180);
    const rateDecimal = Number(cdt.interestRateEA || 0) / 100;
    const reteMul = 1 - Number(cdt.reteFuentePct || 4) / 100;
    const capital = Number(cdt.capital || 0);

    const isMatured = cdt.status === "matured" || maturityD < today;
    const daysElapsed = Math.max(0, Math.min(termDays, Math.floor((today - startD) / (1000 * 60 * 60 * 24))));

    // Base 365 exact calendar day convention for Nu Colombia & modern fintech CDTs, base 360 for traditional commercial
    const dayBase = cdt.dayBase || (cdt.entityId === "ent_nu" || (cdt.name || "").toLowerCase().includes("nu") ? 365 : 360);
    const calculatedAccrued = capital * (Math.pow(1 + rateDecimal, daysElapsed / dayBase) - 1) * reteMul;
    const accruedYield = (cdt.accruedYield !== undefined && cdt.accruedYield !== null)
      ? Number(cdt.accruedYield)
      : (cdt.currentBalance !== undefined && cdt.currentBalance !== null)
        ? Math.max(0, Number(cdt.currentBalance) - capital)
        : calculatedAccrued;
    const finalProfit = capital * (Math.pow(1 + rateDecimal, termDays / dayBase) - 1) * reteMul;

    if (isMatured) {
      maturedCDTsTotalCapital += capital;
      maturedCDTsTotalProfit += finalProfit;
      maturedCDTsList.push({
        ...cdt,
        finalProfit,
        termDays,
        isMatured: true,
      });
    } else {
      activeCDTsCapital += capital;
      activeCDTsAccruedInterest += accruedYield;
      activeCDTsList.push({
        ...cdt,
        accruedYield,
        finalProfit,
        daysElapsed,
        termDays,
        isMatured: false,
      });
    }
  });

  // 3. Filter & Sort Transactions for Liquid Pocket
  const sortedTx = [...transactions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let explicitInterestTotal = 0;
  const txByDate = {};
  const interestByDate = {};

  for (const t of sortedTx) {
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
      explicitInterestTotal += amt;
      interestByDate[d] = (interestByDate[d] || 0) + amt;
    } else if (isDebit) {
      totalWithdrawals += amt;
      txByDate[d] = (txByDate[d] || 0) - amt;
    } else {
      totalDeposits += amt;
      txByDate[d] = (txByDate[d] || 0) + amt;
    }
  }

  const netCapital = totalDeposits - totalWithdrawals;

  const isMonthlyDisbursement = Boolean(
    account.payoutSchedule === "monthly_1st" ||
      (account.entityId && (account.entityId === "ent_1789616750396" || account.entityId.toLowerCase().includes("rappi"))) ||
      (account.name &&
        (account.name.toLowerCase().includes("rappi") ||
          account.name.toLowerCase().includes("impresora") ||
          (account.name.toLowerCase().includes("fondo de emergencia") &&
            (account.entityId === "ent_1789616750396" || (account.entityId || "").toLowerCase().includes("rappi"))))) ||
      (account.type && account.type.toLowerCase().includes("rappi"))
  );

  const asOfDateStr = asOfDate || new Date().toISOString().slice(0, 10);
  const currentMonthStartStr = asOfDateStr.slice(0, 7) + "-01";

  // Label for next monthly disbursement date (1st of next month)
  const asOfDt = new Date(asOfDateStr + "T00:00:00");
  const nextPayoutMonth = asOfDt.getMonth() === 11 ? 0 : asOfDt.getMonth() + 1;
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const nextPayoutDateLabel = `1º de ${monthNames[nextPayoutMonth]}`;

  if (sortedTx.length === 0) {
    const baseBal = Number(account.balance || 0);
    const liquidBase = Math.max(0, baseBal - activeCDTsCapital);
    return {
      netCapital: baseBal,
      liquidNetCapital: liquidBase,
      liquidEarnedInterest: 0,
      liquidTotalBalance: liquidBase,
      liquidAvailableBalance: liquidBase,
      isMonthlyDisbursement,
      creditedYield: 0,
      pendingMonthlyYield: 0,
      nextPayoutDateLabel,
      totalDeposits: baseBal,
      totalWithdrawals: 0,
      totalEarnedInterest: 0,
      totalCalculatedBalance: liquidBase,
      activeCDTsCount: activeCDTsList.length,
      activeCDTsCapital,
      activeCDTsAccruedInterest,
      activeCDTsList,
      maturedCDTsCount: maturedCDTsList.length,
      maturedCDTsTotalCapital,
      maturedCDTsTotalProfit,
      maturedCDTsList,
      consolidatedTotal: liquidBase + activeCDTsCapital + activeCDTsAccruedInterest,
      consolidatedNetCapital: liquidBase + activeCDTsCapital,
      consolidatedTotalYield: activeCDTsAccruedInterest + maturedCDTsTotalProfit,
      periodBreakdown: [],
    };
  }

  // 4. Daily Compound Interest Simulation for Liquid Balance
  const startDateStr = sortedTx[0].date || new Date().toISOString().slice(0, 10);
  const endDateStr = asOfDate || new Date().toISOString().slice(0, 10);

  const startDate = new Date(startDateStr + "T00:00:00");
  const endDate = new Date(endDateStr + "T00:00:00");

  let currBalance = 0;
  let simulatedInterest = 0;
  let creditedYield = 0;
  let pendingMonthlyYield = 0;

  // Track matured CDT injections by maturity date
  const maturedCdtByDate = {};
  maturedCDTsList.forEach((m) => {
    const matD = m.maturityDate || m.startDate;
    maturedCdtByDate[matD] = (maturedCdtByDate[matD] || 0) + Number(m.capital || 0) + Number(m.finalProfit || 0);
  });

  // Period tracking
  const periodMap = new Map();

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dStr = d.toISOString().slice(0, 10);

    // Apply manual capital movements of the day
    if (txByDate[dStr]) {
      currBalance = Math.max(0, currBalance + txByDate[dStr]);
    }

    // Apply explicit recorded interest payouts
    if (interestByDate[dStr]) {
      currBalance = Math.max(0, currBalance + interestByDate[dStr]);
    }

    // Apply closed CDT returns if matured on this day
    if (maturedCdtByDate[dStr]) {
      currBalance = Math.max(0, currBalance + maturedCdtByDate[dStr]);
    }

    const rateEA = getRateForDateAndBalance(dStr, currBalance);
    const periodKey = `rate_${rateEA}`;
    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, {
        rateEA,
        startDate: dStr,
        endDate: dStr,
        days: 0,
        interestEarned: 0,
        startBalance: currBalance,
        endBalance: currBalance,
      });
    }
    const pInfo = periodMap.get(periodKey);
    pInfo.days += 1;
    pInfo.endDate = dStr;

    // If account has explicit recorded interest transactions (e.g. Finandina monthly payouts),
    // we do not synthesize daily compound interest on top of recorded payouts.
    if (explicitInterestTotal === 0) {
      // Colombian banking standard (SFC) for high-yield savings: base 360 days
      const dailyRate = Math.pow(1 + rateEA / 100, 1 / 360) - 1;
      const dailyInterest = currBalance * dailyRate;

      simulatedInterest += dailyInterest;

      // Classify whether this day's yield is already credited or pending monthly payout
      if (isMonthlyDisbursement) {
        if (dStr < currentMonthStartStr) {
          creditedYield += dailyInterest;
        } else {
          pendingMonthlyYield += dailyInterest;
        }
      }

      currBalance += dailyInterest;
      pInfo.interestEarned += dailyInterest;
      pInfo.endBalance = currBalance;
    } else if (interestByDate[dStr]) {
      pInfo.interestEarned += interestByDate[dStr];
      pInfo.endBalance = currBalance;
    }
  }

  const finalEarnedInterest = explicitInterestTotal > 0 ? explicitInterestTotal : simulatedInterest;
  const grossPocketBalance = Math.max(0, netCapital + finalEarnedInterest);

  // If the account has an explicit, authoritative balance (e.g. from app sync or account configuration)
  const hasAuthoritativeBalance =
    account.balance !== undefined &&
    account.balance !== null &&
    !isNaN(Number(account.balance)) &&
    Number(account.balance) >= 0;

  // Liquid available balance: account.balance represents the liquid available balance (Disponible siempre) in the pocket.
  const liquidTotal = hasAuthoritativeBalance
    ? Number(account.balance)
    : Math.max(0, grossPocketBalance - activeCDTsCapital);

  // Available cash in hand: if monthly disbursement, current in-progress month's yields are not yet in hand
  const liquidAvail = isMonthlyDisbursement
    ? (hasAuthoritativeBalance
        ? liquidTotal
        : Math.max(0, netCapital + creditedYield + explicitInterestTotal - activeCDTsCapital))
    : liquidTotal;

  const liquidNetCap = hasAuthoritativeBalance
    ? Math.max(0, liquidTotal - Math.min(liquidTotal, finalEarnedInterest))
    : Math.max(0, netCapital - activeCDTsCapital);

  const periodBreakdown = Array.from(periodMap.values());

  return {
    // Líquido Cajita (Descontando lo congelado en CDTs activos)
    netCapital: Math.max(0, netCapital),
    liquidNetCapital: liquidNetCap,
    liquidEarnedInterest: Math.max(0, finalEarnedInterest),
    liquidTotalBalance: liquidTotal,
    liquidAvailableBalance: liquidAvail,

    // Monthly disbursement schedule specific fields
    isMonthlyDisbursement,
    creditedYield: isMonthlyDisbursement ? creditedYield : finalEarnedInterest,
    pendingMonthlyYield: isMonthlyDisbursement ? pendingMonthlyYield : 0,
    nextPayoutDateLabel,

    totalDeposits,
    totalWithdrawals,
    totalEarnedInterest: Math.max(0, finalEarnedInterest),
    totalCalculatedBalance: liquidTotal,

    // CDTs Activos
    activeCDTsCount: activeCDTsList.length,
    activeCDTsCapital,
    activeCDTsAccruedInterest,
    activeCDTsList,

    // CDTs Cerrados / Vencidos
    maturedCDTsCount: maturedCDTsList.length,
    maturedCDTsTotalCapital,
    maturedCDTsTotalProfit,
    maturedCDTsList,

    // Totales Consolidados (Cajita Líquido + CDTs Activos)
    consolidatedTotal: liquidTotal + activeCDTsCapital + activeCDTsAccruedInterest,
    consolidatedNetCapital: liquidNetCap + activeCDTsCapital,
    consolidatedTotalYield: Math.max(0, finalEarnedInterest) + activeCDTsAccruedInterest + maturedCDTsTotalProfit,

    periodBreakdown,
  };
}

export function getCDTAccruedYield(cdt, asOfDate = new Date()) {
  if (!cdt) return 0;
  if (cdt.accruedYield !== undefined && cdt.accruedYield !== null) {
    return Number(cdt.accruedYield);
  }
  const capital = Number(cdt.capital || 0);
  if (cdt.currentBalance !== undefined && cdt.currentBalance !== null) {
    return Math.max(0, Number(cdt.currentBalance) - capital);
  }
  const rateDecimal = Number(cdt.interestRateEA || 0) / 100;
  const reteMul = 1 - Number(cdt.reteFuentePct || 4) / 100;
  const startD = new Date(cdt.startDate || new Date().toISOString().slice(0, 10));
  startD.setHours(0, 0, 0, 0);
  const refDate = new Date(asOfDate);
  refDate.setHours(0, 0, 0, 0);
  const termDays = Number(cdt.termDays || 180);
  const daysElapsed = Math.max(0, Math.min(termDays, Math.floor((refDate - startD) / (1000 * 60 * 60 * 24))));
  const dayBase = cdt.dayBase || (cdt.entityId === "ent_nu" || (cdt.name || "").toLowerCase().includes("nu") ? 365 : 360);
  return capital * (Math.pow(1 + rateDecimal, daysElapsed / dayBase) - 1) * reteMul;
}
