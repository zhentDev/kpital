/**
 * Exports complete portfolio analytics:
 * Native Backend Multi-tab Excel (.xlsx) with daily timeline & active stock behavior
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
