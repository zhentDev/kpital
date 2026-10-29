/**
 * chartTheme.js
 * High-contrast color tokens and dynamic in-place updater for lightweight-charts.
 */
export function getChartColors(theme) {
  if (theme === "light") {
    return {
      textColor: "#334155",
      gridColor: "rgba(0, 0, 0, 0.06)",
      borderColor: "rgba(0, 0, 0, 0.12)",
      crosshairColor: "rgba(2, 132, 199, 0.6)",
      // Primary series curves (high contrast on white)
      nav: "#0284c7",
      navAreaTop: "rgba(2, 132, 199, 0.20)",
      navAreaBottom: "rgba(2, 132, 199, 0.00)",
      sp500: "#b45309",
      nasdaq: "#7c3aed",
      // Fixed income curves
      balance: "#059669",
      balanceAreaTop: "rgba(5, 150, 105, 0.22)",
      balanceAreaBottom: "rgba(5, 150, 105, 0.00)",
      capital: "#d97706",
      earnings: "#0284c7",
      rate: "#7c3aed",
      // Scale axis labels
      leftScaleText: "#059669",
      rightScaleText: "#0284c7",
      purpleScaleText: "#7c3aed",
      // Base investment reference line
      base: "#64748b",
    };
  }

  // Dark (default)
  return {
    textColor: "#94a3b8",
    gridColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    crosshairColor: "rgba(0, 229, 255, 0.4)",
    nav: "#00e5ff",
    navAreaTop: "rgba(0, 229, 255, 0.22)",
    navAreaBottom: "rgba(0, 229, 255, 0.00)",
    sp500: "#f59e0b",
    nasdaq: "#a855f7",
    balance: "#10b981",
    balanceAreaTop: "rgba(16, 185, 129, 0.25)",
    balanceAreaBottom: "rgba(16, 185, 129, 0.00)",
    capital: "#f59e0b",
    earnings: "#00e5ff",
    rate: "#c084fc",
    leftScaleText: "#10b981",
    rightScaleText: "#00e5ff",
    purpleScaleText: "#c084fc",
    // Base investment reference line (clear, visible silver-slate dashed line)
    base: "#94a3b8",
  };
}

export function applyChartTheme(chart, theme, seriesMap = {}) {
  if (!chart) return;
  const c = getChartColors(theme);

  chart.applyOptions({
    layout: { textColor: c.textColor },
    grid: {
      vertLines: { color: c.gridColor },
      horzLines: { color: c.gridColor },
    },
    crosshair: {
      vertLine: { color: c.crosshairColor },
      horzLine: { color: c.crosshairColor },
    },
    leftPriceScale: { borderColor: c.borderColor, textColor: c.leftScaleText },
    rightPriceScale: { borderColor: c.borderColor, textColor: c.rightScaleText },
    timeScale: { borderColor: c.borderColor },
  });

  // Dynamically update curve line colors in-place without removing series
  if (seriesMap.nav?.applyOptions) {
    seriesMap.nav.applyOptions({
      lineColor: c.nav,
      topColor: c.navAreaTop,
      bottomColor: c.navAreaBottom,
    });
  }
  if (seriesMap.sp500?.applyOptions) {
    seriesMap.sp500.applyOptions({ color: c.sp500 });
  }
  if (seriesMap.nasdaq?.applyOptions) {
    seriesMap.nasdaq.applyOptions({ color: c.nasdaq });
  }
  if (seriesMap.balance?.applyOptions) {
    seriesMap.balance.applyOptions({
      lineColor: c.balance,
      topColor: c.balanceAreaTop,
      bottomColor: c.balanceAreaBottom,
    });
  }
  if (seriesMap.capital?.applyOptions) {
    seriesMap.capital.applyOptions({ color: c.capital });
  }
  if (seriesMap.earnings?.applyOptions) {
    seriesMap.earnings.applyOptions({ color: c.earnings });
  }
  if (seriesMap.rate?.applyOptions) {
    seriesMap.rate.applyOptions({ color: c.rate });
  }
  if (seriesMap.base?.applyOptions) {
    seriesMap.base.applyOptions({ color: c.base });
  }
  if (seriesMap.baseLine?.applyOptions) {
    seriesMap.baseLine.applyOptions({ color: c.base });
  }
}
