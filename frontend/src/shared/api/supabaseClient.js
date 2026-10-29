/**
 * Kpital V2 — Supabase Cloud Direct Client (SSOT)
 * Target Cloud Project: ixnidzllqwbkexsrmgwz (https://ixnidzllqwbkexsrmgwz.supabase.co)
 *
 * Direct browser-to-database architecture:
 * Eliminates Render cold starts and proxy dependencies completely.
 */
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://ixnidzllqwbkexsrmgwz.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_4Gbn-hZLX764m-gz-LAhRg_914uGNIR";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const OWNER_USER_ID = "usr_9487dd2209d2";

/**
 * Subscribe to cross-tab / cloud sync events and visibility changes
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
