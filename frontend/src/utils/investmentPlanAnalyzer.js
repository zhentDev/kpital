export function analyzeInvestmentPlan(purchases) {
  if (!purchases || purchases.length === 0) return null;

  // Group by date
  const byDate = {};
  purchases.forEach((p) => {
    if (!p.date) return;
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push(p);
  });

  const dates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));

  if (dates.length === 0) return null;

  if (dates.length < 2) {
    // If only one purchase date exists, we can still calculate amount and distribution, but no frequency
    let singleTotal = 0;
    const singleDist = {};
    byDate[dates[0]].forEach((p) => {
      const invested = (p.investedAmount ?? p.shares * p.purchasePrice) || 0;
      singleTotal += invested;
      singleDist[p.ticker] = (singleDist[p.ticker] || 0) + invested;
    });

    Object.keys(singleDist).forEach((t) => (singleDist[t] = (singleDist[t] / singleTotal) * 100));

    return {
      frequencyDays: null,
      avgAmount: singleTotal,
      distribution: singleDist,
      nextDate: null,
    };
  }

  // Calculate intervals
  const intervals = [];
  for (let i = 1; i < dates.length; i++) {
    const d1 = new Date(dates[i - 1]);
    const d2 = new Date(dates[i]);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      intervals.push(diffDays);
    }
  }

  // Median frequency
  let medianInterval = null;
  if (intervals.length > 0) {
    intervals.sort((a, b) => a - b);
    medianInterval = intervals[Math.floor(intervals.length / 2)];
  }

  // Calculate avg amount & distribution across all dates
  let totalAmountAcrossAll = 0;
  const tickerTotals = {};

  dates.forEach((d) => {
    let dayTotal = 0;
    byDate[d].forEach((p) => {
      const invested = (p.investedAmount ?? p.shares * p.purchasePrice) || 0;
      dayTotal += invested;
      tickerTotals[p.ticker] = (tickerTotals[p.ticker] || 0) + invested;
    });
    totalAmountAcrossAll += dayTotal;
  });

  const avgAmount = totalAmountAcrossAll / dates.length;

  const distribution = {};
  Object.keys(tickerTotals).forEach((ticker) => {
    distribution[ticker] = (tickerTotals[ticker] / totalAmountAcrossAll) * 100;
  });

  // Next date
  let nextDateStr = null;
  if (medianInterval) {
    const lastDate = new Date(dates[dates.length - 1]);
    // Adjust for local timezone offset when doing setDate to avoid off-by-one errors
    lastDate.setMinutes(lastDate.getMinutes() + lastDate.getTimezoneOffset());
    lastDate.setDate(lastDate.getDate() + medianInterval);
    nextDateStr = lastDate.toISOString().split("T")[0];
  }

  return {
    frequencyDays: medianInterval,
    avgAmount: avgAmount,
    distribution: distribution,
    nextDate: nextDateStr,
  };
}
