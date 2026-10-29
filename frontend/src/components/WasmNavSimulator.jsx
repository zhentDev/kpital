import { ColorType, createChart } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";

export default function WasmNavSimulator({ isOpen, onClose }) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const seriesInstanceRef = useRef(null);
  const workerRef = useRef(null);

  const [loadingDataset, setLoadingDataset] = useState(true);
  const [tickerSeries, setTickerSeries] = useState({});
  const [availableTickers, setAvailableTickers] = useState([]);
  const [selectedTickers, setSelectedTickers] = useState([]);
  const [investment, setInvestment] = useState(2000);
  const [numSlots, setNumSlots] = useState(15);
  
  // Métricas del experimento
  const [metrics, setMetrics] = useState(null);
  const [benchmarkTime, setBenchmarkTime] = useState(null);
  const [engineType, setEngineType] = useState("worker"); // 'worker' | 'python_mpy'
  const [mpyLoaded, setMpyLoaded] = useState(false);

  // Inicializar Web Worker
  useEffect(() => {
    if (!isOpen) return;
    workerRef.current = new Worker("/wasm/simulator_worker.js");
    workerRef.current.onmessage = (e) => {
      const { success, data, durationMs, thread } = e.data;
      if (success && data) {
        setMetrics(data.metrics);
        setBenchmarkTime({
          durationMs,
          thread,
        });
        if (seriesInstanceRef.current && data.nav) {
          seriesInstanceRef.current.setData(data.nav);
          chartInstanceRef.current?.timeScale().fitContent();
        }
      }
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [isOpen]);

  // Cargar dataset de prueba (1Y)
  useEffect(() => {
    if (!isOpen) return;
    setLoadingDataset(true);
    fetch("/data/nav_1Y.json")
      .then((res) => res.json())
      .then((json) => {
        const series = json.ticker_series || {};
        const tickers = Object.keys(series);
        setTickerSeries(series);
        setAvailableTickers(tickers);
        // Seleccionamos los primeros 5 por defecto
        const initialSel = tickers.slice(0, 5);
        setSelectedTickers(initialSel);
        setLoadingDataset(false);
      })
      .catch((err) => {
        console.error("Error al cargar dataset:", err);
        setLoadingDataset(false);
      });
  }, [isOpen]);

  // Inicializar Lightweight Chart
  useEffect(() => {
    if (!isOpen || !chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 600,
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: isLight ? "#ffffff" : "#0d1117" },
        textColor: isLight ? "#333333" : "#c9d1d9",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)" },
        horzLines: { color: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: {
        borderColor: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
      },
      timeScale: {
        borderColor: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
      },
    });

    const series = chart.addLineSeries({
      color: "#00e5ff",
      lineWidth: 2,
      priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
      },
    });

    chartInstanceRef.current = chart;
    seriesInstanceRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartInstanceRef.current = null;
      seriesInstanceRef.current = null;
    };
  }, [isOpen, isLight]);

  // Disparar cálculo cada vez que cambie una variable
  useEffect(() => {
    if (!isOpen || loadingDataset || !workerRef.current) return;

    workerRef.current.postMessage({
      type: "SIMULATE",
      payload: {
        investment,
        num_slots: numSlots,
        selected_tickers: selectedTickers,
        ticker_series: tickerSeries,
      },
    });
  }, [isOpen, loadingDataset, selectedTickers, investment, numSlots, tickerSeries]);

  const toggleTicker = (ticker) => {
    setSelectedTickers((prev) =>
      prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker]
    );
  };

  const selectAll = () => setSelectedTickers([...availableTickers]);
  const clearAll = () => setSelectedTickers([]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div
        className={`w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border shadow-2xl transition-all ${
          isLight ? "bg-white border-slate-200 text-slate-800" : "bg-[#111827] border-slate-800 text-slate-100"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 font-mono text-lg border border-cyan-500/20">
              ⚡
            </span>
            <div>
              <h2 className="text-base font-bold font-mono tracking-tight flex items-center gap-2">
                Simulador WASM / Web Worker
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  PoC Lab
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Cálculo instantáneo de series temporales en hilo secundario (cero lag en UI).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Métricas de Rendimiento del Experimento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`p-3 rounded-xl border ${isLight ? "bg-slate-50 border-slate-200" : "bg-slate-900/60 border-slate-800"}`}>
              <div className="text-[11px] text-slate-400 uppercase font-mono">Tiempo de Cómputo</div>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                {benchmarkTime ? `${benchmarkTime.durationMs} ms` : "..."}
              </div>
              <div className="text-[10px] text-emerald-400 font-mono">
                {benchmarkTime ? benchmarkTime.thread.split(" ")[0] + " Thread" : ""}
              </div>
            </div>

            <div className={`p-3 rounded-xl border ${isLight ? "bg-slate-50 border-slate-200" : "bg-slate-900/60 border-slate-800"}`}>
              <div className="text-[11px] text-slate-400 uppercase font-mono">Retorno Total</div>
              <div className={`text-lg font-bold font-mono mt-0.5 ${metrics?.total_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {metrics ? `${metrics.total_return_pct >= 0 ? "+" : ""}${metrics.total_return_pct}%` : "..."}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                Valor: ${metrics ? metrics.final_value.toLocaleString() : "..."}
              </div>
            </div>

            <div className={`p-3 rounded-xl border ${isLight ? "bg-slate-50 border-slate-200" : "bg-slate-900/60 border-slate-800"}`}>
              <div className="text-[11px] text-slate-400 uppercase font-mono">Max Drawdown</div>
              <div className="text-lg font-bold font-mono text-rose-400 mt-0.5">
                {metrics ? `-${metrics.max_drawdown_pct}%` : "..."}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">Caída máx.</div>
            </div>

            <div className={`p-3 rounded-xl border ${isLight ? "bg-slate-50 border-slate-200" : "bg-slate-900/60 border-slate-800"}`}>
              <div className="text-[11px] text-slate-400 uppercase font-mono">Puntos Procesados</div>
              <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">
                {metrics ? metrics.points_calculated : "..."}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                Slots: {metrics ? `${metrics.active_slots}/${numSlots}` : "..."}
              </div>
            </div>
          </div>

          {/* Gráfico Canvas */}
          <div className="rounded-xl border border-slate-800 p-2 bg-[#090d16] relative overflow-hidden">
            {loadingDataset && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 text-cyan-400 text-xs font-mono">
                Cargando serie histórica de 1 año...
              </div>
            )}
            <div ref={chartContainerRef} className="w-full" />
          </div>

          {/* Controles interactivos inmediatos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Parámetros */}
            <div className={`p-4 rounded-xl border space-y-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-slate-900/40 border-slate-800"}`}>
              <h3 className="text-xs font-bold uppercase font-mono text-slate-400">Parámetros de Simulación</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span>Capital Inicial</span>
                    <span className="text-cyan-400 font-bold">${investment.toLocaleString()} USD</span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="10000"
                    step="100"
                    value={investment}
                    onChange={(e) => setInvestment(Number(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1">
                    <span>Número de Slots</span>
                    <span className="text-purple-400 font-bold">{numSlots} slots</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="1"
                    value={numSlots}
                    onChange={(e) => setNumSlots(Number(e.target.value))}
                    className="w-full accent-purple-400 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Selector de Tickers con feedback instantáneo */}
            <div className={`p-4 rounded-xl border space-y-3 ${isLight ? "bg-slate-50 border-slate-200" : "bg-slate-900/40 border-slate-800"}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase font-mono text-slate-400">
                  Tickers Dinámicos ({selectedTickers.length}/{availableTickers.length})
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-[10px] font-mono text-cyan-400 hover:underline"
                  >
                    Todos
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={clearAll}
                    className="text-[10px] font-mono text-rose-400 hover:underline"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {availableTickers.map((ticker) => {
                  const isSelected = selectedTickers.includes(ticker);
                  return (
                    <button
                      key={ticker}
                      onClick={() => toggleTicker(ticker)}
                      className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all border ${
                        isSelected
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm"
                          : "bg-slate-800/40 text-slate-500 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      {ticker}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 text-xs text-slate-500 font-mono">
          <span>Arquitectura: WebAssembly / Web Worker Offloading</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-medium"
          >
            Cerrar Laboratorio
          </button>
        </div>
      </div>
    </div>
  );
}
