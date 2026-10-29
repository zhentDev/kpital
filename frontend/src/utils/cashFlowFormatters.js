/**
 * Unified Cash Flow Currency Formatter with Live TRM Exchange Rate Support.
 * Converts base COP financial amounts to USD when USD currency is active.
 * Standardized across project for European/Latin American style:
 * - Thousands separator: '.' (dot)
 * - Decimal separator: ',' (comma)
 * e.g., $13.010,48 COP
 */

/**
 * Universal number parser supporting comma decimals and dot thousands.
 * e.g.:
 * "13010,48" -> 13010.48
 * "13.010,48" -> 13010.48
 * "592.550" -> 592550
 * "13010.48" -> 13010.48
 */
export function parseLocalNumber(val) {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!str) return 0;

  // Case 1: Both . and , are present (e.g., "13.010,48" or "13,010.48")
  if (str.includes(".") && str.includes(",")) {
    const lastDot = str.lastIndexOf(".");
    const lastComma = str.lastIndexOf(",");
    if (lastComma > lastDot) {
      // 13.010,48 -> dot is thousand, comma is decimal
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // 13,010.48 -> comma is thousand, dot is decimal
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // Only comma present: in Colombia/user preference, comma is decimal separator (e.g. "13010,48")
    str = str.replace(",", ".");
  } else if (str.includes(".")) {
    // Only dot present:
    // If it has a dot followed by exactly 3 digits and no other dot (e.g. "592.550"), it's thousands separator
    const parts = str.split(".");
    if (parts.length === 2 && parts[1].length === 3) {
      str = parts.join("");
    } else if (parts.length > 2) {
      str = parts.join("");
    }
    // Otherwise "13010.48" remains "13010.48"
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatCashFlowMoney(val, currency = "COP", fxRate = 4150, options = {}) {
  const num = Number(val);
  const safeNum = isNaN(num) ? 0 : num;
  const rate = Number(fxRate) > 0 ? Number(fxRate) : 4150;
  const showSuffix = options.showSuffix !== undefined ? options.showSuffix : false;

  if (currency === "USD") {
    const usdVal = safeNum / rate;
    const fractionDigits = options.fractionDigits !== undefined ? options.fractionDigits : 2;
    const formatted = usdVal.toLocaleString("es-CO", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return `$${formatted}${showSuffix ? " USD" : ""}`;
  }

  // COP: detect if there are cents/decimals
  const hasDecimals = options.fractionDigits !== undefined
    ? options.fractionDigits > 0
    : Math.abs(safeNum % 1) > 0.0001;

  const fractionDigits = options.fractionDigits !== undefined
    ? options.fractionDigits
    : (hasDecimals ? 2 : 0);

  const formatted = safeNum.toLocaleString("es-CO", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  return `$${formatted}${showSuffix ? " COP" : ""}`;
}

export function formatCashFlowMoneyWithCode(val, currency = "COP", fxRate = 4150) {
  return formatCashFlowMoney(val, currency, fxRate, { showSuffix: true });
}

export function formatCashFlowMoneyShort(val, currency = "COP", fxRate = 4150) {
  return formatCashFlowMoney(val, currency, fxRate, { showSuffix: false, fractionDigits: currency === "USD" ? 2 : 0 });
}

export function formatCurrencyLocal(val, currency = "COP", options = {}) {
  return formatCashFlowMoney(val, currency, 4150, options);
}

/**
 * Calculates the effective spending of a transaction towards a budget envelope,
 * liberating the envelope budget as loans or shared expenses are repaid (cobros / abonos).
 *
 * @param {Object} tx - Expense transaction from expensesLog
 * @param {Array} debts - Optional debts array to cross-reference repayments
 * @returns {{ grossAmount: number, repaidAmount: number, effectiveSpent: number, pendingLoan: number, purePersonalSpent: number, isLoanExpense: boolean }}
 */
export function calculateEffectiveExpense(tx, debts = []) {
  const grossAmount = Number(tx?.amount) || 0;
  if (!tx) {
    return { grossAmount: 0, repaidAmount: 0, effectiveSpent: 0, pendingLoan: 0, purePersonalSpent: 0, isLoanExpense: false };
  }

  const isLoan = Boolean(
    tx.isLoan ||
    Number(tx.loanAmount) > 0 ||
    (Array.isArray(tx.participants) && tx.participants.length > 0) ||
    (Array.isArray(tx.settlements) && tx.settlements.length > 0)
  );

  const linkedDebt = Array.isArray(debts)
    ? debts.find((d) => d.linkedExpenseId === tx.id || d.id === tx.debtId || d.id === `debt_tx_${tx.id}`)
    : null;

  if (!isLoan && !linkedDebt) {
    return {
      grossAmount,
      repaidAmount: 0,
      effectiveSpent: grossAmount,
      pendingLoan: 0,
      purePersonalSpent: grossAmount,
      isLoanExpense: false,
    };
  }

  // 1. Repayments from tx.settlements
  const settlements = Array.isArray(tx.settlements) ? tx.settlements : [];
  const settlementsRepaid = settlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  // 2. Repayments from linked debt payments
  let debtRepaid = 0;
  if (linkedDebt) {
    const debtPayments = Array.isArray(linkedDebt.paymentsLog) ? linkedDebt.paymentsLog : [];
    const paymentsSum = debtPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const tot = Number(linkedDebt.totalAmount) || 0;
    const rem = linkedDebt.remainingAmount !== undefined ? Number(linkedDebt.remainingAmount) : tot;
    debtRepaid = Math.max(paymentsSum, Math.max(0, tot - rem));
  }

  // Best knowledge of total repaid to date
  const repaidAmount = Math.max(settlementsRepaid, debtRepaid);

  // Effective expense currently tied up in the envelope = gross - repaid
  const effectiveSpent = Math.max(0, grossAmount - repaidAmount);

  // Total amount loaned out
  const totalLoaned = Number(tx.loanAmount) > 0
    ? Number(tx.loanAmount)
    : (linkedDebt ? Number(linkedDebt.totalAmount) || grossAmount : grossAmount);

  const pendingLoan = Math.max(0, totalLoaned - repaidAmount);
  const purePersonalSpent = Math.max(0, grossAmount - totalLoaned);

  return {
    grossAmount,
    repaidAmount,
    effectiveSpent,
    pendingLoan,
    purePersonalSpent,
    isLoanExpense: true,
  };
}

/**
 * Universal movement / expense sorter by Date and Time (from most recent to oldest).
 * Prioritizes actual movement date (YYYY-MM-DD) and time (HH:MM:SS).
 * Falls back cleanly to createdAt if same-day or as tie-breaker.
 */
export function sortMovementsByDateTimeDesc(items = []) {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    // 1. Primary: Movement Date (YYYY-MM-DD)
    const dateA = a.date || (a.createdAt ? a.createdAt.slice(0, 10) : "");
    const dateB = b.date || (b.createdAt ? b.createdAt.slice(0, 10) : "");
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA); // Newest date first
    }

    // 2. Secondary: Movement Time (HH:MM:SS)
    const getTimeNorm = (item, baseDate) => {
      let t = item.time || "";
      // If no explicit time property, but createdAt belongs to the exact same date, borrow the time
      if (!t && item.createdAt && baseDate && item.createdAt.slice(0, 10) === baseDate) {
        const tMatch = item.createdAt.match(/T(\d{2}:\d{2}(?::\d{2})?)/);
        if (tMatch) t = tMatch[1];
      }
      if (!t) return "00:00:00";
      const parts = t.split(":");
      const h = (parts[0] || "00").padStart(2, "0");
      const m = (parts[1] || "00").padStart(2, "0");
      const s = (parts[2] || "00").slice(0, 2).padStart(2, "0");
      return `${h}:${m}:${s}`;
    };

    const timeA = getTimeNorm(a, dateA);
    const timeB = getTimeNorm(b, dateB);
    if (timeA !== timeB) {
      return timeB.localeCompare(timeA); // Newest time first
    }

    // 3. Tertiary tie-breaker: Record creation timestamp
    const createdA = a.createdAt || "";
    const createdB = b.createdAt || "";
    if (createdA !== createdB) {
      return createdB.localeCompare(createdA);
    }

    // 4. Final tie-breaker: ID
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

