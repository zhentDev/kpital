/**
 * Kpital V2 — Supabase Cloud & Realtime Sync Client
 * Target Cloud Project: ixnidzllqwbkexsrmgwz (https://ixnidzllqwbkexsrmgwz.supabase.co)
 *
 * Provides direct cloud synchronization helpers and multi-device event
 * dispatching so Kpital Zustand stores stay synchronized in real time
 * without persisting any financial data in localStorage.
 */

export const SUPABASE_PROJECT_ID = "ixnidzllqwbkexsrmgwz";
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT_ID}.supabase.co`;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

/**
 * Subscribe to cross-tab / cloud sync events and visibility changes
 * so when the user switches devices or tabs, Kpital re-fetches authoritative
 * state directly from Supabase PostgreSQL via the API layer.
 */
export function subscribeToCloudSync({
  onCashFlowRefresh,
  onFixedIncomeRefresh,
  onPortfolioRefresh,
  intervalMs = 60000,
} = {}) {
  if (typeof window === "undefined") return () => {};

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      onCashFlowRefresh?.();
      onFixedIncomeRefresh?.();
      onPortfolioRefresh?.();
    }
  };

  window.addEventListener("visibilitychange", handleVisibilityChange);

  const timer = setInterval(() => {
    if (document.visibilityState === "visible") {
      onCashFlowRefresh?.();
      onFixedIncomeRefresh?.();
    }
  }, intervalMs);

  return () => {
    window.removeEventListener("visibilitychange", handleVisibilityChange);
    clearInterval(timer);
  };
}
