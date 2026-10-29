"""
Web Worker independiente para ejecutar cálculos de simulación en segundo plano.
Escucha mensajes con datos del portafolio y ejecuta el algoritmo en WebAssembly/Python.
"""
self.onmessage = async function(e) {
  const { id, type, payload } = e.data;
  if (type === "SIMULATE") {
    const t0 = performance.now();
    try {
      // Si MicroPython/WASM está cargado, se ejecuta aquí;
      // Mientras tanto, se resuelve con medición de alta precisión en Worker thread.
      const res = calculateSimulation(payload);
      const t1 = performance.now();
      self.postMessage({
        id,
        success: true,
        data: res,
        durationMs: (t1 - t0).toFixed(2),
        thread: "Web Worker (Isolated Background Thread)"
      });
    } catch (err) {
      self.postMessage({
        id,
        success: false,
        error: err.message
      });
    }
  }
};

function calculateSimulation(data) {
  const investment = parseFloat(data.investment || 2000.0);
  const numSlots = parseInt(data.num_slots || 15, 10);
  const selectedTickers = new Set(data.selected_tickers || []);
  const tickerSeries = data.ticker_series || {};

  const activeTickers = Array.from(selectedTickers).filter(
    (t) => tickerSeries[t] && tickerSeries[t].length > 0
  );

  if (activeTickers.length === 0) {
    return {
      nav: [],
      metrics: {
        initial_value: investment,
        final_value: investment,
        total_return_pct: 0.0,
        max_drawdown_pct: 0.0,
        active_slots: 0,
        points_calculated: 0
      }
    };
  }

  const slotCapital = investment / Math.max(1, numSlots);
  const activeInvested = activeTickers.length * slotCapital;
  const unallocatedCash = Math.max(0.0, investment - activeInvested);

  const dateMap = {};
  const allDates = [];

  for (const ticker of activeTickers) {
    const series = tickerSeries[ticker];
    for (const pt of series) {
      const d = pt.date;
      if (!d) continue;
      const factor = pt.factor != null ? pt.factor : (pt.value || 1.0);
      if (!dateMap[d]) {
        dateMap[d] = {};
        allDates.push(d);
      }
      dateMap[d][ticker] = Number(factor);
    }
  }

  allDates.sort();

  const navCurve = [];
  let peakVal = -1.0;
  let maxDrawdown = 0.0;

  for (const d of allDates) {
    const factors = dateMap[d];
    let stockValue = 0.0;
    for (const ticker of activeTickers) {
      const factor = factors[ticker] != null ? factors[ticker] : 1.0;
      stockValue += slotCapital * factor;
    }

    const totalVal = stockValue + unallocatedCash;

    if (totalVal > peakVal) {
      peakVal = totalVal;
    } else if (peakVal > 0) {
      const dd = ((peakVal - totalVal) / peakVal) * 100.0;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    }

    navCurve.push({
      time: d,
      value: Math.round(totalVal * 100) / 100,
      stock_value: Math.round(stockValue * 100) / 100,
      cash: Math.round(unallocatedCash * 100) / 100
    });
  }

  const initialVal = navCurve.length > 0 ? navCurve[0].value : investment;
  const finalVal = navCurve.length > 0 ? navCurve[navCurve.length - 1].value : investment;
  const totalReturnPct = initialVal > 0 ? Math.round(((finalVal - initialVal) / initialVal) * 10000) / 100 : 0.0;

  return {
    nav: navCurve,
    metrics: {
      initial_value: Math.round(initialVal * 100) / 100,
      final_value: Math.round(finalVal * 100) / 100,
      total_return_pct: totalReturnPct,
      max_drawdown_pct: Math.round(maxDrawdown * 100) / 100,
      active_slots: activeTickers.length,
      points_calculated: navCurve.length
    }
  };
}
