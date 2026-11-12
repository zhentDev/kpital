import { create } from "zustand";
import toast from "react-hot-toast";
import { fetchMeApi, loginApi, oauthLoginApi, registerApi } from "../api/client";
import { supabase } from "../shared/api/supabaseClient";

export const MAIN_OWNER_EMAIL = "caballerojesus703@hotmail.com";

export function isMainOwnerUser(userOrEmail) {
  if (!userOrEmail) {
    const detected = getCurrentUserEmail();
    if (detected) return detected === MAIN_OWNER_EMAIL;
    // Default to true for the primary app owner if unauthenticated/offline so data is never wiped
    return true;
  }
  const email = typeof userOrEmail === "string" ? userOrEmail : userOrEmail?.email;
  return Boolean(email && email.toLowerCase().trim() === MAIN_OWNER_EMAIL);
}

export function decodeAuthToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const raw = token.includes(".") ? token.split(".")[1] : token;
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }
    const jsonStr = atob(b64);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function getCurrentUserEmail() {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("kpital_auth_token") || localStorage.getItem("titanes_auth_token");
  if (token) {
    const payload = decodeAuthToken(token);
    if (payload?.email) return payload.email.toLowerCase().trim();
  }

  // Also check native Supabase auth token in localStorage (sb-<project>-auth-token)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const item = JSON.parse(localStorage.getItem(key) || "{}");
        if (item?.user?.email) return item.user.email.toLowerCase().trim();
      }
    }
  } catch {}

  return null;
}

const LEGACY_STORAGE_KEYS = [
  "titanes_cash_flow_store",
  "titanes_cash_flow_store_v2",
  "titanes_fixed_income_store",
  "titanes-portfolio",
  "titanes_stock_alerts_v1",
  "kpital_cash_flow_store",
  "kpital_fixed_income_store",
  "kpital-portfolio",
];

function purgeFinancialLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    LEGACY_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

function getInitialToken() {
  if (typeof window === "undefined") return null;
  purgeFinancialLocalStorage();
  let token = localStorage.getItem("kpital_auth_token");
  if (!token) {
    const legacy = localStorage.getItem("titanes_auth_token");
    if (legacy) {
      localStorage.setItem("kpital_auth_token", legacy);
      localStorage.removeItem("titanes_auth_token");
      token = legacy;
    }
  }
  return token;
}

export const useAuthStore = create((set, get) => ({
  user: null,
  token: getInitialToken(),
  isLoading: false,
  isInitialized: false,
  isAuthModalOpen: false,
  authModalTab: "login", // 'login' | 'register'

  openAuthModal: (tab = "login") => set({ isAuthModalOpen: true, authModalTab: tab }),
  closeAuthModal: () => set({ isAuthModalOpen: false }),
  setAuthModalTab: (tab) => set({ authModalTab: tab }),

  fetchMe: async () => {
    purgeFinancialLocalStorage();
    let token = get().token;

    // Check if returning from Supabase OAuth (Google, Azure, Facebook, etc.)
    if (!token && typeof window !== "undefined") {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const u = session.user;
          const isMain = isMainOwnerUser(u.email);
          const sessionToken = btoa(
            JSON.stringify({
              id: u.id,
              email: u.email,
              name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Usuario",
              avatar_url: u.user_metadata?.avatar_url || null,
              is_pro: isMain,
              timestamp: Date.now(),
            })
          );
          localStorage.setItem("kpital_auth_token", sessionToken);
          token = sessionToken;
          set({
            token: sessionToken,
            user: {
              id: u.id,
              email: u.email,
              name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Usuario",
              avatar_url: u.user_metadata?.avatar_url || null,
              is_pro: isMain,
            },
            isInitialized: true,
          });
          return;
        }
      } catch (err) {
        console.warn("[Auth] Supabase session check:", err);
      }
    }

    if (!token) {
      set({ user: null, isInitialized: true });
      return;
    }
    try {
      const res = await fetchMeApi();
      if (res && res.user) {
        set({ user: res.user, isInitialized: true });
        return;
      }

      // If backend returned 401/offline, check if we have a valid owner email in the local token
      const localEmail = getCurrentUserEmail();
      if (localEmail) {
        const decoded = decodeAuthToken(token);
        const isOwner = isMainOwnerUser(localEmail);
        set({
          user: {
            id: decoded?.sub || decoded?.id || "usr_owner",
            email: localEmail,
            name: decoded?.name || localEmail.split("@")[0],
            avatar_url: decoded?.avatar_url || null,
            is_pro: isOwner,
          },
          isInitialized: true,
        });
        return;
      }

      localStorage.removeItem("kpital_auth_token");
      localStorage.removeItem("titanes_auth_token");
      set({ token: null, user: null, isInitialized: true });
    } catch {
      set({ isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await loginApi(email, password);
      localStorage.setItem("kpital_auth_token", res.token);
      localStorage.removeItem("titanes_auth_token");
      purgeFinancialLocalStorage();
      set({ token: res.token, user: res.user, isAuthModalOpen: false });
      toast.success(`¡Bienvenido de nuevo, ${res.user.name || res.user.email}!`, { icon: "👋" });
      
      return true;
    } catch (err) {
      toast.error(err.message || "Error al iniciar sesión");
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  register: async (email, password, name) => {
    set({ isLoading: true });
    try {
      const res = await registerApi(email, password, name);
      localStorage.setItem("kpital_auth_token", res.token);
      localStorage.removeItem("titanes_auth_token");
      purgeFinancialLocalStorage();
      set({ token: res.token, user: res.user, isAuthModalOpen: false });
      if (res.claimed_legacy_data) {
        toast.success(`¡Cuenta creada! Tu información previa fue vinculada exitosamente.`, {
          icon: "🛡️",
          duration: 5000,
        });
      } else {
        toast.success(`¡Cuenta creada con éxito! Bienvenido, ${res.user.name}`, { icon: "🚀" });
      }
      
      return true;
    } catch (err) {
      toast.error(err.message || "Error al registrarse");
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  signInWithProvider: async (provider = "google") => {
    try {
      const redirectTo = typeof window !== "undefined"
        ? `${window.location.origin}`
        : "https://zhent.homes";

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        toast.error(`Error al conectar con ${provider}: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      toast.error(err.message || `Error con ${provider}`);
      return false;
    }
  },

  loginWithOAuth: async (idToken, profile = {}) => {
    set({ isLoading: true });
    try {
      const res = await oauthLoginApi(idToken, profile);
      localStorage.setItem("kpital_auth_token", res.token);
      localStorage.removeItem("titanes_auth_token");
      purgeFinancialLocalStorage();
      set({ token: res.token, user: res.user, isAuthModalOpen: false });
      toast.success(`Conectado vía Google: ${res.user.name || res.user.email}`, { icon: "🌐" });
      return true;
    } catch (err) {
      toast.error(err.message || "Error al conectar con Google");
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    localStorage.removeItem("kpital_auth_token");
    localStorage.removeItem("titanes_auth_token");
    purgeFinancialLocalStorage();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("[Auth] Supabase signOut:", e);
    }
    // Clean any OAuth tokens or hashes from URL
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    set({ token: null, user: null });
    toast("Sesión cerrada correctamente", { icon: "🔒" });
    if (typeof window !== "undefined") {
      setTimeout(() => {
        window.location.href = window.location.origin;
      }, 300);
    }
  },
}));
