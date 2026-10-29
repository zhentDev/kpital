/**
 * Period and Multi-Month Utility Functions
 * Dynamic rolling period generation for present and any future year.
 */

export const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * Calculate effective payment date in Colombia:
 * If the scheduled day falls on a Saturday or Sunday, payment moves to Friday (or prior business day).
 * @param {number} year 
 * @param {number} month (1-12)
 * @param {number} scheduledDay (e.g. 25)
 * @returns {Date} effective payment Date object
 */
export function getEffectivePayDate(year, month, scheduledDay = 25) {
  // Clamp day to last day of the month if month has fewer days
  const maxDays = new Date(year, month, 0).getDate();
  const day = Math.min(scheduledDay, maxDays);
  const payDate = new Date(year, month - 1, day);

  const dayOfWeek = payDate.getDay(); // 0: Sunday, 6: Saturday
  if (dayOfWeek === 6) {
    // Saturday -> pay Friday (1 day before)
    payDate.setDate(payDate.getDate() - 1);
  } else if (dayOfWeek === 0) {
    // Sunday -> pay Friday (2 days before)
    payDate.setDate(payDate.getDate() - 2);
  }
  return payDate;
}

/**
 * Returns current period in "YYYY-MM" format.
 * If payDay is provided (e.g. 25), the financial month begins on the effective pay date:
 * If today >= effective pay date of current month, the period is the funding cycle for the upcoming month (YYYY-MM).
 */
export function getCurrentPeriod(payDay = null) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  if (payDay) {
    const effPayDate = getEffectivePayDate(y, m, payDay);
    // Compare YYYY-MM-DD
    const todayStr = `${y}-${String(m).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const effStr = `${effPayDate.getFullYear()}-${String(effPayDate.getMonth() + 1).padStart(2, "0")}-${String(effPayDate.getDate()).padStart(2, "0")}`;

    if (todayStr >= effStr) {
      // We have reached the payday, funding the next calendar month!
      const nextMonthDate = new Date(y, m, 1);
      return `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;
    } else {
      // Still in current month cycle
      return `${y}-${String(m).padStart(2, "0")}`;
    }
  }

  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Formats "YYYY-MM" to readable Spanish name (e.g. "Agosto 2026")
 */
export function formatPeriodName(periodStr) {
  if (!periodStr || typeof periodStr !== "string" || !periodStr.includes("-")) {
    return periodStr || "";
  }
  const [y, m] = periodStr.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodStr;
  const monthName = MONTH_NAMES_ES[m - 1] || "";
  return `${monthName} ${y}`;
}

/**
 * Formats period with exact salary cycle date range (e.g. "Octubre 2026 (23 Oct - 24 Nov)")
 */
export function formatPeriodWithCycleRange(periodStr, payDay = 25, customPayDate = null) {
  if (!periodStr || typeof periodStr !== "string" || !periodStr.includes("-")) {
    return periodStr || "";
  }
  const [y, m] = periodStr.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodStr;

  const monthName = MONTH_NAMES_ES[m - 1] || "";

  // The cycle funding this month starts on the effective payday of the PREVIOUS month
  const prevDate = new Date(y, m - 2, 1);
  const startEffPayDate = customPayDate
    ? new Date(customPayDate)
    : getEffectivePayDate(prevDate.getFullYear(), prevDate.getMonth() + 1, payDay);

  // Cycle ends the day before the NEXT effective payday
  const endEffPayDate = getEffectivePayDate(y, m, payDay);
  const cycleEndDate = new Date(endEffPayDate);
  cycleEndDate.setDate(cycleEndDate.getDate() - 1);

  const startDay = startEffPayDate.getDate();
  const startMonthShort = MONTH_NAMES_ES[startEffPayDate.getMonth()]?.slice(0, 3) || "";
  const endDay = cycleEndDate.getDate();
  const endMonthShort = MONTH_NAMES_ES[cycleEndDate.getMonth()]?.slice(0, 3) || "";

  return `${monthName} ${y} (${startDay} ${startMonthShort} - ${endDay} ${endMonthShort})`;
}

/**
 * Calculate previous month in "YYYY-MM" format
 */
export function getPrevPeriod(periodStr) {
  const current = periodStr || getCurrentPeriod();
  const [y, m] = current.split("-").map(Number);
  const prevDate = new Date(y, m - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calculate next month in "YYYY-MM" format
 */
export function getNextPeriod(periodStr) {
  const current = periodStr || getCurrentPeriod();
  const [y, m] = current.split("-").map(Number);
  const nextDate = new Date(y, m, 1);
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Generates rolling list of monthly periods dynamically starting from base period forward.
 */
export function generateRollingMonthOptions(basePeriodStr, pastMonths = 0, futureMonths = 36) {
  const base = basePeriodStr && basePeriodStr.includes("-") ? basePeriodStr : getCurrentPeriod();
  const [baseY, baseM] = base.split("-").map(Number);
  const baseDate = new Date(baseY, baseM - 1, 1);

  const options = [];

  for (let i = -pastMonths; i <= futureMonths; i++) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const val = `${y}-${String(m).padStart(2, "0")}`;
    const monthName = MONTH_NAMES_ES[m - 1] || "";
    options.push({
      value: val,
      label: `📅 ${monthName} ${y}`,
    });
  }

  return options;
}
