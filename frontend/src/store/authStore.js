import { create } from "zustand";
import toast from "react-hot-toast";
import { fetchMeApi, loginApi, oauthLoginApi, registerApi } from "../api/client";

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
    const token = get().token;
    if (!token) {
      set({ user: null, isInitialized: true });
      return;
    }
    try {
      const res = await fetchMeApi();
      if (res && res.user) {
        set({ user: res.user, isInitialized: true });
      } else {
        localStorage.removeItem("kpital_auth_token");
        localStorage.removeItem("titanes_auth_token");
        set({ token: null, user: null, isInitialized: true });
      }
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
      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
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
      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.location.reload();
        }, 600);
      }
      return true;
    } catch (err) {
      toast.error(err.message || "Error al registrarse");
      return false;
    } finally {
      set({ isLoading: false });
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

  logout: () => {
    localStorage.removeItem("kpital_auth_token");
    localStorage.removeItem("titanes_auth_token");
    purgeFinancialLocalStorage();
    set({ token: null, user: null });
    toast("Sesión cerrada correctamente", { icon: "🔒" });
    if (typeof window !== "undefined") {
      setTimeout(() => {
        window.location.reload();
      }, 400);
    }
  },
}));
