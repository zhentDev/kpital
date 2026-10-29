/**
 * API client — wraps fetch calls to the FastAPI backend & Supabase PostgreSQL (SSOT).
 * Zero static JSON file fallbacks — 100% cloud relational database.
 */
import { getBankPreset } from "../utils/bankPresets";
import {
  directSupabaseLogin,
  directSupabaseFetchMe,
  directFetchCashFlow,
  directFetchFixedIncome,
  directFetchPurchases,
  directFetchCustomStrategies,
  directFetchRebalances,
  directFetchStockAlerts,
  directFetchFxRate,
  directFetchColInflation,
} from "../shared/api/directSupabase";

const RENDER_BACKEND_BASE = "https://titanes-portfolio-backend.onrender.com/api";
const LOCAL_BACKEND_BASE = "http://127.0.0.1:8000/api";

const IS_LOCAL_HOST =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

let ACTIVE_BASE = IS_LOCAL_HOST ? LOCAL_BACKEND_BASE : RENDER_BACKEND_BASE;
export const getBase = () => ACTIVE_BASE;
const BASE = ACTIVE_BASE;
const TIMEOUT_MS = 4000;

export function getAuthHeaders() {
  if (typeof window === "undefined") return {};
  let token = localStorage.getItem("kpital_auth_token");
  if (!token) {
    const legacyToken = localStorage.getItem("titanes_auth_token");
    if (legacyToken) {
      localStorage.setItem("kpital_auth_token", legacyToken);
      localStorage.removeItem("titanes_auth_token");
      token = legacyToken;
    }
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Resilient fetch helper with automatic retry for server cold starts
async function safeFetch(url, options = {}, retries = 3, delayMs = 1500) {
  const { timeoutMs, signal: externalSignal, ...restOptions } = options;
  const mergedHeaders = {
    ...getAuthHeaders(),
    ...(restOptions.headers || {}),
  };

  let lastResponse = null;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const perAttemptTimeout = timeoutMs || 15000;
    const timer = setTimeout(() => controller.abort(), perAttemptTimeout);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        throw new Error("Request aborted");
      }
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const res = await fetch(url, {
        ...restOptions,
        headers: mergedHeaders,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);

      if (res.ok) return res;

      lastResponse = res;
      if (res.status >= 500 && i < retries) {
        const waitTime = delayMs * (i + 1);
        console.warn(`[API] Servidor respondiendo ${res.status}. Reintentando en ${waitTime}ms (${i + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);

      if (
        err.name === "AbortError" ||
        externalSignal?.aborted ||
        (err.message && err.message.toLowerCase().includes("abort"))
      ) {
        throw err;
      }

      if (i < retries) {
        const waitTime = delayMs * (i + 1);
        console.warn(`[API] Fallo de conexión (${err.message}). Reintentando en ${waitTime}ms (${i + 1}/${retries})...`);
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }
      throw err;
    }
  }

  return lastResponse;
}

// ── Client-Side In-Memory Cache (0ms latency on tab switching) ──
const API_CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

export function invalidateApiCache(prefix = "") {
  if (!prefix) {
    API_CACHE.clear();
    return;
  }
  for (const key of API_CACHE.keys()) {
    if (key.includes(prefix)) {
      API_CACHE.delete(key);
    }
  }
}

async function fetchFromBackend(endpoint, options = {}) {
  const cacheKey = endpoint;
  const now = Date.now();

  if (!options.bypassCache && API_CACHE.has(cacheKey)) {
    const cached = API_CACHE.get(cacheKey);
    const ttl = isWeekend() ? 48 * 60 * 60 * 1000 : CACHE_TTL_MS;
    if (now - cached.timestamp < ttl) {
      return cached.data;
    }
    API_CACHE.delete(cacheKey);
  }

  const tryFetchBase = async (baseUrl, timeoutMs, retries = 0) => {
    try {
      const res = await safeFetch(
        `${baseUrl}${endpoint}`,
        { ...options, timeoutMs },
        retries,
        1500,
      );
      if (res && res.ok) {
        return await res.json();
      }
    } catch {
      // fall through
    }
    return null;
  };

  const isRenderPrimary = ACTIVE_BASE === RENDER_BACKEND_BASE;
  const timeout = options.timeoutMs || (isRenderPrimary ? 22000 : (IS_LOCAL_HOST ? 15000 : TIMEOUT_MS));
  let resultData = await tryFetchBase(ACTIVE_BASE, timeout, isRenderPrimary ? 3 : 0);

  if (!resultData && ACTIVE_BASE === LOCAL_BACKEND_BASE) {
    resultData = await tryFetchBase(RENDER_BACKEND_BASE, 22000, 3);
    if (resultData) {
      ACTIVE_BASE = RENDER_BACKEND_BASE;
    }
  }

  if (resultData != null) {
    API_CACHE.set(cacheKey, { timestamp: now, data: resultData });
    return resultData;
  }

  return null;
}

/** GET /api/nav */
export async function fetchNAV({
  period = "1Y",
  investment = 2000,
  numSlots = 15,
  selectedTickers,
  strategyId = "historical",
}) {
  const params = new URLSearchParams({
    period,
    investment: String(investment),
    num_slots: String(numSlots),
    strategy_id: strategyId || "historical",
  });
  if (selectedTickers && selectedTickers.length > 0) {
    params.set("selected_tickers", selectedTickers.join(","));
  }

  let data;
  try {
    data = await fetchFromBackend(`/nav?${params}`, { timeoutMs: 15000 });
  } catch (err) {
    console.warn(`fetchNAV could not fetch data for strategy ${strategyId}:`, err);
    return null;
  }

  if (selectedTickers && data?.holdings) {
    const validTickers = selectedTickers.map((t) => t.toUpperCase());
    const filteredHoldings = data.holdings.map((h) => ({
      ...h,
      selected: validTickers.includes(h.ticker.toUpperCase()),
    }));

    const activeSelected = filteredHoldings.filter((h) => h.selected);
    const activeCount = activeSelected.length;
    const activeInvested = Number(((investment * activeCount) / numSlots).toFixed(2));
    const activeStockValue = activeSelected.reduce((sum, h) => sum + (h.current_value || 0), 0);
    const activeReturn = activeStockValue - activeInvested;
    const activeReturnPct = activeInvested > 0 ? (activeReturn / activeInvested) * 100 : 0;

    data = {
      ...data,
      holdings: filteredHoldings,
      summary: {
        ...data.summary,
        num_holdings: activeCount,
        active_invested: activeInvested,
        active_stock_value: Number(activeStockValue.toFixed(2)),
        active_return: Number(activeReturn.toFixed(2)),
        active_return_pct: Number(activeReturnPct.toFixed(2)),
      },
    };
  }

  return data;
}

/** GET /api/prices/live */
export async function fetchLiveQuotes(tickers) {
  const params = new URLSearchParams({ tickers: tickers.join(",") });
  return fetchFromBackend(`/prices/live?${params}`);
}

/** GET /api/prices/intraday/:ticker */
export async function fetchIntraday(ticker, date = null) {
  const url = date
    ? `/prices/intraday/${ticker}?date=${encodeURIComponent(date)}&v=2`
    : `/prices/intraday/${ticker}?v=2`;
  return fetchFromBackend(url);
}

/** GET /api/nav/holding-chart */
export async function fetchHoldingChart({ ticker, startDate, exitDate, shares, costBasis, entryPrice }) {
  const params = new URLSearchParams({
    ticker,
    start_date: startDate || "2026-08-03",
  });
  if (exitDate) params.set("exit_date", exitDate);
  if (shares != null) params.set("shares", String(shares));
  if (costBasis != null) params.set("cost_basis", String(costBasis));
  if (entryPrice != null) params.set("entry_price", String(entryPrice));

  return fetchFromBackend(`/nav/holding-chart?${params}`, { timeoutMs: 15000 });
}

/** GET /api/prices/indices_history?start_date=YYYY-MM-DD */
export async function fetchIndicesHistory(startDate) {
  try {
    const data = await fetchFromBackend(
      `/prices/indices_history?start_date=${encodeURIComponent(startDate || "2020-01-01")}`,
      { timeoutMs: 15000 },
    );
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** GET /api/prices/historical/:ticker?date=YYYY-MM-DD&time=HH:MM */
export async function fetchHistoricalPrice(ticker, date, time = null) {
  try {
    const timeParam = time ? `&time=${encodeURIComponent(time)}` : "";
    const res = await safeFetch(
      `${getBase()}/prices/historical/${encodeURIComponent(ticker)}?date=${date}${timeParam}`,
      { timeoutMs: 12000 },
      2,
      1000,
    );
    if (res && res.ok) {
      return await res.json();
    }
  } catch {
    // ignore
  }
  return { price: null, error: "Backend offline" };
}

/** GET /api/tickers/search?q=... */
export async function searchTicker(q) {
  const res = await safeFetch(`${getBase()}/tickers/search?q=${encodeURIComponent(q)}`);
  return res.json();
}

export async function searchTickersMultiple(q) {
  const res = await safeFetch(`${getBase()}/tickers/search_multiple?q=${encodeURIComponent(q)}`);
  return res.json();
}

/** GET /api/rebalances */
export async function fetchRebalances(strategyId = "historical", options = {}) {
  try {
    return await directFetchRebalances(strategyId);
  } catch (err) {
    console.warn("Direct Supabase rebalances fetch failed, falling back to backend:", err);
    const query = strategyId ? `?strategy_id=${encodeURIComponent(strategyId)}` : "";
    const res = await fetchFromBackend(`/rebalances${query}`, options);
    return Array.isArray(res) ? res : [];
  }
}

/** POST /api/rebalances */
export async function createRebalance({ rebalance_date, cash_added, tickers, strategy_id = "historical" }) {
  const res = await safeFetch(`${getBase()}/rebalances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rebalance_date, cash_added, tickers, strategy_id }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Error al registrar rebalanceo");
  }
  invalidateApiCache("/nav");
  invalidateApiCache("/rebalances");
  return res.json();
}

/** DELETE /api/rebalances/:date */
export async function deleteRebalance(date, strategyId = "historical") {
  const query = strategyId ? `?strategy_id=${encodeURIComponent(strategyId)}` : "";
  const res = await safeFetch(`${getBase()}/rebalances/${date}${query}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Error al eliminar rebalanceo");
  }
  invalidateApiCache("/nav");
  invalidateApiCache("/rebalances");
  return res.json();
}

/** PUT /api/rebalances/date */
export async function updateRebalanceDateApi(oldDate, newDate, strategyId = "historical") {
  const res = await safeFetch(`${getBase()}/rebalances/date`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old_date: oldDate, new_date: newDate, strategy_id: strategyId }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Error al actualizar fecha de rebalanceo");
  }
  invalidateApiCache("/nav");
  invalidateApiCache("/rebalances");
  return res.json();
}

/** CUSTOM STRATEGIES API */
export async function fetchCustomStrategiesApi() {
  try {
    return await directFetchCustomStrategies();
  } catch (err) {
    console.warn("Direct Supabase custom strategies fetch failed, falling back to backend:", err);
    return await fetchFromBackend("/custom-strategies");
  }
}

export async function saveCustomStrategyApi(strat) {
  const res = await safeFetch(`${getBase()}/custom-strategies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(strat),
  });
  if (!res.ok) throw new Error("Error al guardar estrategia en backend");
  invalidateApiCache("/custom-strategies");
  invalidateApiCache("/nav");
  return res.json();
}

export async function deleteCustomStrategyApi(strategyId) {
  const res = await safeFetch(`${getBase()}/custom-strategies/${strategyId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar estrategia en backend");
  invalidateApiCache("/custom-strategies");
  invalidateApiCache("/nav");
  return res.json();
}

/** PURCHASES API */
export async function fetchPurchasesData() {
  try {
    return await directFetchPurchases();
  } catch (err) {
    console.warn("Direct Supabase purchases fetch failed, falling back to backend:", err);
    const data = await fetchFromBackend("/purchases/portfolios");
    if (!data || (!data.purchasePortfolios && !data.individualPurchases)) {
      throw new Error("Error fetching purchases data");
    }
    return data;
  }
}

export async function createPurchasePortfolio(id, name, isPlan = false) {
  const res = await safeFetch(`${getBase()}/purchases/portfolios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, isPlan }),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function deletePurchasePortfolioApi(id) {
  const res = await safeFetch(`${getBase()}/purchases/portfolios/${id}`, { method: "DELETE" });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function togglePortfolioPlanApi(id, isPlan, planConfig = null) {
  const res = await safeFetch(`${getBase()}/purchases/portfolios/${id}/plan`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isPlan, planConfig }),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function updatePortfolioSettingsApi(
  id,
  assetCurrency,
  localCurrency,
  inflationRate,
  useAutoColInflation,
) {
  const res = await safeFetch(`${getBase()}/purchases/portfolios/${id}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetCurrency, localCurrency, inflationRate, useAutoColInflation }),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function fetchFxHistory(assetCurrency, localCurrency) {
  if (assetCurrency === localCurrency) return { current: 1.0, history: {} };
  try {
    return await directFetchFxRate(assetCurrency, localCurrency);
  } catch {
    return { current: 4150.0, history: {} };
  }
}

export async function fetchColInflationHistory() {
  try {
    return await directFetchColInflation();
  } catch {
    return { history: {}, latest: { year: 2026, rate: 4.85 }, monthly_rates: [] };
  }
}

/** ── Stock Sell Alerts (Profit Target / Stop Loss) — 100% Supabase SQL ── **/
export async function fetchStockAlerts(scope = null, targetId = null) {
  try {
    return await directFetchStockAlerts(scope, targetId);
  } catch (err) {
    console.warn("Direct Supabase stock alerts fetch fallback:", err);
    try {
      const params = new URLSearchParams();
      if (scope) params.set("scope", scope);
      if (targetId) params.set("target_id", targetId);
      const q = params.toString() ? `?${params.toString()}` : "";
      const res = await safeFetch(`${getBase()}/alerts${q}`, {}, 1, 1000);
      if (res && res.ok) {
        const serverData = await res.json();
        if (Array.isArray(serverData)) return serverData;
      }
    } catch (e) {
      console.warn("[Alerts] Error fetching from server:", e);
    }
    return [];
  }
}

export async function saveStockAlert(alertData) {
  const alertId = alertData.id || `alt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cleanAlert = {
    ...alertData,
    id: alertId,
    target_id: alertData.target_id || "historical",
    scope: alertData.scope || "strategy",
    created_at: alertData.created_at || new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("stockAlertsUpdated", { detail: cleanAlert }));
  }

  const res = await safeFetch(`${getBase()}/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cleanAlert),
  });
  if (res && res.ok) {
    const serverSaved = await res.json();
    return serverSaved && serverSaved.id ? serverSaved : cleanAlert;
  }
  return cleanAlert;
}

export async function deleteStockAlert(alertId) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("stockAlertsUpdated", { detail: { alertId } }));
  }
  const res = await safeFetch(`${getBase()}/alerts/${alertId}`, {
    method: "DELETE",
  });
  if (res && res.ok) {
    return await res.json();
  }
  return { success: true, id: alertId };
}

export async function evaluateStockAlerts({ scope, targetId, positions }) {
  const res = await safeFetch(`${getBase()}/alerts/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, target_id: targetId, positions }),
  });
  if (!res.ok) return { triggered: [] };
  return res.json();
}

export async function testStockAlertEmail(email = null) {
  const res = await safeFetch(`${getBase()}/alerts/test-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Error en el servidor al enviar correo de prueba");
  }
  return res.json();
}

export async function testStockAlertTelegram() {
  const res = await safeFetch(`${getBase()}/alerts/test-telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Error en el servidor al enviar alerta de prueba por Telegram");
  }
  return res.json();
}

export async function createPurchaseLot(lot) {
  const res = await safeFetch(`${getBase()}/purchases/lots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lot),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function updatePurchaseLots(lots) {
  const res = await safeFetch(`${getBase()}/purchases/lots`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lots),
  });
  if (!res.ok) throw new Error("Failed to update purchase lots");
  invalidateApiCache("/purchases");
  return res.json();
}

export async function deletePurchaseLot(id) {
  const res = await safeFetch(`${getBase()}/purchases/lots/${id}`, { method: "DELETE" });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function createPurchaseSale(sale) {
  const res = await safeFetch(`${getBase()}/purchases/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sale),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function deletePurchaseSale(id) {
  const res = await safeFetch(`${getBase()}/purchases/sales/${id}`, { method: "DELETE" });
  invalidateApiCache("/purchases");
  return res.json();
}

export async function syncPurchasesMigration(purchasePortfolios, individualPurchases, purchaseSales = []) {
  const res = await safeFetch(`${getBase()}/purchases/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purchasePortfolios, individualPurchases, purchaseSales }),
  });
  invalidateApiCache("/purchases");
  return res.json();
}

/** ── FIXED INCOME & SAVINGS ACCOUNTS API ── */

export async function fetchFixedIncomeData(options = {}) {
  try {
    return await directFetchFixedIncome();
  } catch (err) {
    console.warn("Direct Supabase fixed income fetch failed, falling back to backend:", err);
    return await fetchFromBackend("/fixed-income/data", options);
  }
}

export async function createFixedIncomeEntity(entity) {
  const res = await safeFetch(`${getBase()}/fixed-income/entities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entity),
  });
  return res.json();
}

export async function updateFixedIncomeEntityApi(id, entity) {
  const res = await safeFetch(`${getBase()}/fixed-income/entities/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entity),
  });
  return res.json();
}

export async function deleteFixedIncomeEntityApi(id) {
  const res = await safeFetch(`${getBase()}/fixed-income/entities/${id}`, { method: "DELETE" });
  return res.json();
}

export async function createFixedIncomeAccount(account) {
  const res = await safeFetch(`${getBase()}/fixed-income/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  return res.json();
}

export async function updateFixedIncomeAccountApi(id, account) {
  const res = await safeFetch(`${getBase()}/fixed-income/accounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  return res.json();
}

export async function deleteFixedIncomeAccountApi(id) {
  const res = await safeFetch(`${getBase()}/fixed-income/accounts/${id}`, { method: "DELETE" });
  return res.json();
}

export async function createFixedIncomeCDT(cdt) {
  const res = await safeFetch(`${getBase()}/fixed-income/cdts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cdt),
  });
  return res.json();
}

export async function updateFixedIncomeCDTApi(id, cdt) {
  const res = await safeFetch(`${getBase()}/fixed-income/cdts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cdt),
  });
  return res.json();
}

export async function deleteFixedIncomeCDTApi(id) {
  const res = await safeFetch(`${getBase()}/fixed-income/cdts/${id}`, { method: "DELETE" });
  return res.json();
}

export async function syncFixedIncomeStateApi(state) {
  const res = await safeFetch(`${getBase()}/fixed-income/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  return res.json();
}

export async function suggestFixedIncomeRate(
  entityId,
  productType = "savings",
  termDays = null,
  date = null,
) {
  const params = new URLSearchParams({
    entity_id: entityId,
    product_type: productType,
  });
  if (termDays) params.set("term_days", String(termDays));
  if (date) params.set("date", date);

  try {
    const res = await safeFetch(`${getBase()}/fixed-income/rates/suggest?${params}`);
    if (res.ok) return await res.json();
  } catch {
    // Fallback defaults below
  }

  const cleanId = String(entityId || "").replace("preset_", "").replace("ent_", "");
  const bp = getBankPreset(cleanId);
  const baseRate = bp?.defaultRateEA || (productType === "cdt" ? 10.5 : 9.0);

  return {
    rateEA: baseRate,
    label: bp ? `Tasa Sugerida ${bp.name}` : "Tasa Estándar",
    tiers: productType === "cdt" ? [
      { termDaysMin: 1, termDaysMax: 120, rateEA: Number((baseRate + 0.5).toFixed(2)), label: "90 Días" },
      { termDaysMin: 121, termDaysMax: 220, rateEA: Number((baseRate + 1.2).toFixed(2)), label: "180 Días" },
      { termDaysMin: 221, termDaysMax: 999, rateEA: Number((baseRate + 1.5).toFixed(2)), label: "360 Días" },
    ] : [],
  };
}

export async function fetchHistoricalRates() {
  try {
    const res = await safeFetch(`${getBase()}/fixed-income/rates`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Error fetching historical rates from Supabase backend:", e);
  }
  return { entities: {} };
}

export async function calculateCompoundHistory(entityId, deposits, currentDate = null) {
  const res = await safeFetch(`${getBase()}/fixed-income/calculate-compound-history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityId, deposits, currentDate }),
  });
  if (!res.ok) throw new Error("Error calculating compound history");
  return res.json();
}

export async function uploadStatementApi(filesInput, password = "", startYear = 2024) {
  const formData = new FormData();
  const fileArray = Array.isArray(filesInput) ? filesInput : [filesInput];

  fileArray.forEach((f) => {
    formData.append("files", f);
  });

  if (password) formData.append("password", password);
  if (startYear) formData.append("start_year", String(startYear));

  const res = await safeFetch(`${getBase()}/fixed-income/upload-statement`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Error al procesar el lote de extractos PDF o imágenes");
  return res.json();
}

export async function confirmStatementImportApi(
  entityId,
  accounts = [],
  cdts = [],
  transactions = [],
) {
  const res = await safeFetch(`${getBase()}/fixed-income/confirm-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityId, accounts, cdts, transactions }),
  });
  if (!res.ok) throw new Error("Error al importar la información del extracto");
  return res.json();
}

export async function fetchRateTrackerAlerts(simulate = false) {
  const query = simulate ? "?simulate=true" : "";
  const res = await safeFetch(`${getBase()}/fixed-income/rates/tracker${query}`);
  if (!res.ok) throw new Error("Error al obtener seguimiento de tasas");
  return res.json();
}

export async function applyUpdatedAccountRate({ accountId, newRate, effectiveDate }) {
  const res = await safeFetch(`${getBase()}/fixed-income/rates/tracker/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, newRate, effectiveDate }),
  });
  if (!res.ok) throw new Error("Error al actualizar la tasa de la cuenta");
  return res.json();
}

// ── Cash Flow & Budget Allocation API ────────────────────────────

export async function fetchCashFlowData(options = {}) {
  try {
    return await directFetchCashFlow();
  } catch (err) {
    console.warn("Direct Supabase cash flow fetch failed, falling back to backend:", err);
    return await fetchFromBackend("/cash-flow", options);
  }
}

export async function syncCashFlowStateApi(payload) {
  const res = await safeFetch(`${getBase()}/cash-flow/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 22000,
  }, 3, 1500);
  if (!res.ok) throw new Error("Error al sincronizar el estado de Flujo de Caja");
  return res.json();
}

export async function createInflowApi(item) {
  const res = await safeFetch(`${getBase()}/cash-flow/inflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error("Error al registrar ingreso");
  return res.json();
}

export async function deleteInflowApi(id) {
  const res = await safeFetch(`${getBase()}/cash-flow/inflow/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar ingreso");
  return res.json();
}

export async function createNeedExpenseApi(item) {
  const res = await safeFetch(`${getBase()}/cash-flow/need`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error("Error al registrar gasto esencial");
  return res.json();
}

export async function deleteNeedExpenseApi(id) {
  const res = await safeFetch(`${getBase()}/cash-flow/need/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar gasto esencial");
  return res.json();
}

export async function createWantExpenseApi(item) {
  const res = await safeFetch(`${getBase()}/cash-flow/want`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error("Error al registrar gasto de estilo de vida");
  return res.json();
}

export async function deleteWantExpenseApi(id) {
  const res = await safeFetch(`${getBase()}/cash-flow/want/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar gasto de estilo de vida");
  return res.json();
}

export async function createWealthItemApi(item) {
  const res = await safeFetch(`${getBase()}/cash-flow/wealth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error("Error al registrar aporte de ahorro/inversión");
  return res.json();
}

export async function deleteWealthItemApi(id) {
  const res = await safeFetch(`${getBase()}/cash-flow/wealth/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar asignación de ahorro/inversión");
  return res.json();
}

export async function deleteExpenseApi(id) {
  const res = await safeFetch(`${getBase()}/cash-flow/expense/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar gasto");
  return res.json();
}

export async function deleteDebtApi(id) {
  const res = await safeFetch(`${getBase()}/cash-flow/debt/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Error al eliminar deuda");
  return res.json();
}

export async function notifyDebtTelegramApi(id) {
  const res = await safeFetch(`${getBase()}/cash-flow/debt/${id}/notify-telegram`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Error al enviar recordatorio a Telegram");
  return res.json();
}

export async function checkDebtRemindersApi() {
  const res = await safeFetch(`${getBase()}/cash-flow/debts/check-reminders`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Error al verificar alarmas de deudas");
  return res.json();
}

// ── AUTH API ENDPOINTS ─────────────────────────────────────────────────────────

export async function loginApi(email, password) {
  try {
    // 100% Direct Supabase authentication (Zero Render / Zero cold start)
    return await directSupabaseLogin(email, password);
  } catch (err) {
    console.warn("Direct Supabase login fallback:", err);
    const res = await safeFetch(
      `${getBase()}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      2,
      1500,
    );
    if (!res) throw err || new Error("Servidor no disponible");
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Error al iniciar sesión");
    return data;
  }
}

export async function registerApi(email, password, name) {
  const res = await safeFetch(
    `${getBase()}/auth/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    },
    2,
    1500,
  );
  if (!res) throw new Error("Servidor no disponible");
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error al registrarse");
  return data;
}

export async function oauthLoginApi(idToken, profile = {}) {
  const res = await safeFetch(
    `${getBase()}/auth/oauth`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, ...profile }),
    },
    2,
    1500,
  );
  if (!res) throw new Error("Servidor no disponible");
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error en autenticación OAuth");
  return data;
}

export async function fetchMeApi() {
  try {
    const token = localStorage.getItem("kpital_auth_token");
    const directUser = await directSupabaseFetchMe(token);
    if (directUser) return directUser;

    const res = await safeFetch(`${getBase()}/auth/me`);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── WARREN AI PROMPT GENERATOR API ──────────────────────────────────────────

export async function generateWarrenPromptApi({
  focus,
  userQuestion,
  useOllama = true,
  model = "qwen2.5-coder:14b",
} = {}) {
  const res = await safeFetch(`${getBase()}/warren/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      focus,
      user_question: userQuestion,
      use_ollama: useOllama,
      model,
    }),
  });
  if (!res || !res.ok) throw new Error("Error generando prompt para WarrenAI");
  return res.json();
}

export async function fetchWarrenSummaryApi() {
  const res = await safeFetch(`${getBase()}/warren/summary`);
  if (!res || !res.ok) throw new Error("Error obteniendo resumen de inversiones");
  return res.json();
}
