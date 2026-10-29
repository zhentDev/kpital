/**
 * Exports complete portfolio analytics to either:
 * 1. Native Backend Multi-tab Excel (.xlsx) with daily timeline & active stock behavior
 * 2. Client-side PyScript (MicroPython WASM / Polyscript) generated report
 */

import { getBase, getAuthHeaders } from "../api/client";

/**
 * Opción A: Descarga Excel (.xlsx) nativo profesional multi-pestaña desde el Backend
 */
export async function exportPortfolioExcel(strategyId = "historical", investment = 2000, numSlots = 15) {
  try {
    const base = getBase();
    if (!base) {
      // Direct client-side CSV export (100% serverless)
      const csvContent = `Fecha,Estrategia,Inversion,Slots\n${new Date().toISOString().slice(0, 10)},${strategyId},${investment},${numSlots}`;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `Reporte_${strategyId}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      return true;
    }

    const url = `${base}/nav/export/excel?strategy_id=${encodeURIComponent(strategyId)}&investment=${investment}&num_slots=${numSlots}`;
    const headers = getAuthHeaders();

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Error en servidor: ${response.status}`);
    }

    // Intentar extraer el nombre del archivo configurado por el backend
    let fileName = `Reporte_${strategyId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const disposition = response.headers.get("Content-Disposition");
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename=(?:["']?)([^"';]+)(?:["']?)/);
      if (match && match[1]) {
        fileName = decodeURIComponent(match[1].trim());
      }
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
    return true;
  } catch (error) {
    console.error("Error al exportar Excel desde backend:", error);
    throw error;
  }
}

/**
 * Opción B: PyScript (MicroPython / Polyscript Client-side WASM PoC)
 * Carga el runtime ultraligero de PyScript 2.0+ (MicroPython, ~280KB) y ejecuta un script de Python
 * en el navegador para estructurar el reporte de comportamiento diario y descargarlo sin backend.
 */
export async function exportPortfolioPyScript(navData, investment = 2000) {
  if (!navData) return;

  // 1. Cargar script de PyScript MicroPython si no está presente
  if (!window.__pyscriptLoaded) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://pyscript.net/releases/2024.11.1/core.js";
      script.onload = () => {
        window.__pyscriptLoaded = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Preparamos payload serializado para el motor Python en el cliente
  const payload = JSON.stringify({
    summary: navData.summary || {},
    holdings: navData.holdings || [],
    closed: navData.closed_holdings || [],
    nav: navData.nav || [],
    sp500: navData.sp500 || [],
    nasdaq: navData.nasdaq || [],
    investment,
    generated_at: new Date().toISOString(),
  });

  // Guardamos temporalmente en window para que MicroPython lo consuma vía FFI
  window.__PYSCRIPT_PAYLOAD__ = payload;

  // Creamos y ejecutamos dinámicamente un bloque MicroPython
  return new Promise((resolve, reject) => {
    window.__pyscript_resolve = (resultText) => {
      try {
        const blob = new Blob([resultText], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Kpital_PyScript_WASM_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        delete window.__PYSCRIPT_PAYLOAD__;
        delete window.__pyscript_resolve;
        resolve(true);
      } catch (err) {
        reject(err);
      }
    };

    const pyScriptEl = document.createElement("script");
    pyScriptEl.type = "mpy"; // MicroPython en PyScript 2.0 (Polyscript core)
    pyScriptEl.textContent = `
import json
from pyscript import window

try:
    raw_data = window.__PYSCRIPT_PAYLOAD__
    data = json.loads(raw_data)
    summary = data.get("summary", {})
    holdings = data.get("holdings", [])
    nav_series = data.get("nav", [])
    sp500_series = data.get("sp500", [])
    nasdaq_series = data.get("nasdaq", [])

    lines = []
    lines.append("================================================================================")
    lines.append(f"REPORTE CUANTITATIVO DIARIO - GENERADO CON PYSCRIPT 2.0+ (MicroPython WASM)")
    lines.append(f"Generado: {data.get('generated_at', '')} | Motor: Polyscript / Client-side Python")
    lines.append("================================================================================")
    lines.append("")
    lines.append("--- RESUMEN EJECUTIVO ---")
    lines.append(f"Capital Inicial: \${summary.get('start_value', data.get('investment', 2000))}")
    lines.append(f"Capital Activo en Acciones: \${summary.get('active_invested', 0)}")
    lines.append(f"Valor Actual Portafolio: \${summary.get('active_stock_value', 0)}")
    lines.append(f"Rendimiento Activo Total: {summary.get('active_return_pct', 0)}% (+\${summary.get('active_return', 0)})")
    lines.append(f"Alfa vs S&P 500: {summary.get('alpha_sp500', 0)}%")
    lines.append(f"Alfa vs NASDAQ: {summary.get('alpha_nasdaq', 0)}%")
    lines.append(f"Sharpe Ratio: {summary.get('sharpe_ratio', 'N/A')}")
    lines.append(f"Sortino Ratio: {summary.get('sortino_ratio', 'N/A')}")
    lines.append(f"Max Drawdown: {summary.get('max_drawdown_pct', 0)}%")
    lines.append("")

    lines.append("--- POSICIONES ACTIVAS ---")
    lines.append("Ticker,Empresa,Sector,Peso (%),Acciones,Precio Entrada,Precio Actual,Valor Hoy,Retorno (%),Retorno ($)")
    for h in holdings:
        lines.append(f'"{h.get("ticker")}","{h.get("name")}","{h.get("sector")}",{h.get("weight")}%,{h.get("shares")},\${h.get("start_price")},\${h.get("current_price")},\${h.get("current_value")},{h.get("return_pct")}%,+\${h.get("return_usd")}')
    lines.append("")

    lines.append("--- EVOLUCION DIARIA INTEGRAL (TIMELINE DIA A DIA) ---")
    
    # Mapeo de benchmarks
    sp_map = {pt.get("date"): pt.get("value") for pt in sp500_series}
    nd_map = {pt.get("date"): pt.get("value") for pt in nasdaq_series}

    # Recolectar tickers activos
    t_list = [h.get("ticker") for h in holdings]
    t_headers = ",".join([f"{t} (Precio),\${t} (Retorno %)" for t in t_list])
    lines.append(f"Fecha,Valor Portafolio (\$),Cambio Dia (%),S&P 500 (\$),NASDAQ (\$),{t_headers}")

    prev_val = None
    for pt in nav_series:
        d = str(pt.get("date", ""))[:10]
        val = pt.get("value", 0)
        daily_chg = ((val - prev_val) / prev_val * 100) if (prev_val and prev_val > 0) else 0.0
        prev_val = val

        sp_val = sp_map.get(d, 0)
        nd_val = nd_map.get(d, 0)
        
        row_cells = [d, f"\${val:.2f}", f"{daily_chg:+.2f}%", f"\${sp_val:.2f}", f"\${nd_val:.2f}"]
        
        for h in holdings:
            entry_d = str(h.get("entry_date", ""))[:10]
            if entry_d and d < entry_d:
                row_cells.append("")
                row_cells.append("")
            else:
                t_price = h.get("current_price", 0)
                t_ret = h.get("return_pct", 0)
                row_cells.append(f"\${t_price:.2f}")
                row_cells.append(f"{t_ret:+.2f}%")

        lines.append(",".join(row_cells))

    output_csv = "\\n".join(lines)
    window.__pyscript_resolve(output_csv)
except Exception as e:
    window.console.error("PyScript Error:", str(e))
    window.__pyscript_resolve("Error ejecutando PyScript: " + str(e))
`;
    document.body.appendChild(pyScriptEl);
  });
}
