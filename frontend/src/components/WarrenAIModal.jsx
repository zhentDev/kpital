import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { fetchFxHistory, generateWarrenPromptApi } from "../api/client";
import { useTheme } from "../context/ThemeContext";
import { useAuthStore } from "../store/authStore";
import { useCashFlowStore } from "../store/cashFlowStore";
import { useFixedIncomeStore } from "../store/fixedIncomeStore";
import { usePortfolioStore } from "../store/portfolioStore";
import {
  AI_CONTEXT_SCOPES,
  buildCopyReadyPrompt,
  buildEconomicContextFromState,
} from "../utils/aiContextBuilder";
import {
  AI_PROVIDERS,
  askEconomicAI,
  clearStoredAIKeys,
  fetchAvailableProviderModels,
  fetchLocalOllamaModels,
  isRunningLocally,
  loadAIConfig,
  saveAIConfig,
} from "../utils/aiProviders";

const ECONOMIC_STARTERS = [
  "¿Cómo afecta el dólar (TRM) y las tasas actuales a mi mezcla entre CDTs en COP e inversiones en USD?",
  "Analiza mis deudas, tarjetas y presupuesto del ciclo: ¿qué conviene pagar o ajustar primero?",
  "Evalúa la diversificación, riesgos y exposición sectorial de mis acciones y ETFs",
  "¿Dónde tengo liquidez subutilizada frente a la inflación y qué rebalanceo sugieres?",
];

function formatCompactCOP(val) {
  const num = Number(val || 0);
  if (!Number.isFinite(num)) return "$0";
  return `$${Math.round(num).toLocaleString("es-CO")}`;
}

export default function WarrenAIModal({ isOpen, onClose }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const isLocal = isRunningLocally();

  // Zustand subscriptions for live reactive snapshot
  const authUser = useAuthStore((s) => s.user);
  const purchasePortfolios = usePortfolioStore((s) => s.purchasePortfolios);
  const individualPurchases = usePortfolioStore((s) => s.individualPurchases);
  const purchaseSales = usePortfolioStore((s) => s.purchaseSales);
  const customStrategies = usePortfolioStore((s) => s.customStrategies);
  const strategyRebalances = usePortfolioStore((s) => s.strategyRebalances);
  const lastStrategySummaries = usePortfolioStore((s) => s.lastStrategySummaries);
  const lastKnownQuotes = usePortfolioStore((s) => s.lastKnownQuotes);

  const fiEntities = useFixedIncomeStore((s) => s.entities);
  const fiAccounts = useFixedIncomeStore((s) => s.accounts);
  const fiCdts = useFixedIncomeStore((s) => s.cdts);
  const fiInitialized = useFixedIncomeStore((s) => s.isInitialized);
  const initFetchFixedIncome = useFixedIncomeStore((s) => s.initFetchFixedIncome);

  const cfActivePeriod = useCashFlowStore((s) => s.activePeriod);
  const cfInflows = useCashFlowStore((s) => s.inflows);
  const cfNeeds = useCashFlowStore((s) => s.needs);
  const cfWants = useCashFlowStore((s) => s.wants);
  const cfWealth = useCashFlowStore((s) => s.wealth);
  const cfExpensesLog = useCashFlowStore((s) => s.expensesLog);
  const cfDebts = useCashFlowStore((s) => s.debts);
  const cfCreditCards = useCashFlowStore((s) => s.creditCards);
  const cfInitialized = useCashFlowStore((s) => s.isInitialized);
  const initFetchCashFlow = useCashFlowStore((s) => s.initFetchCashFlow);

  // Modal UI state
  const [activeTab, setActiveTab] = useState("chat"); // "chat" | "prompt"
  const [fxRate, setFxRate] = useState(4150);
  const [scope, setScope] = useState("all");
  const [showContextPreview, setShowContextPreview] = useState(false);

  // BYOK Provider Configuration state
  const [aiConfig, setAiConfig] = useState(() => loadAIConfig());
  const [showConfig, setShowConfig] = useState(() => {
    const init = loadAIConfig();
    const prov = init.providerId || "gemini";
    return prov !== "ollama" && prov !== "prompt_only" && !init.apiKeysByProvider?.[prov];
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [ollamaInfo, setOllamaInfo] = useState({ available: false, models: [] });
  const [detectedModelsByProvider, setDetectedModelsByProvider] = useState({});
  const [loadingModels, setLoadingModels] = useState(false);
  const [testingConn, setTestingConn] = useState(false);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sendingChat, setSendingChat] = useState(false);
  const chatEndRef = useRef(null);

  // Prompt Builder (No-API / WarrenAI) state
  const [promptFocus, setPromptFocus] = useState(
    "análisis integral de fundamentales, renta fija, TRM y asignación de capital",
  );
  const [promptQuestion, setPromptQuestion] = useState("");
  const [refineWithLocalOllama, setRefineWithLocalOllama] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Persist config updates locally (localStorage or sessionStorage per toggle)
  const updateConfig = (updater) => {
    setAiConfig((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      saveAIConfig(next);
      return next;
    });
  };

  // Lazy-hydrate missing stores + live FX rate + local Ollama discovery on modal open
  useEffect(() => {
    if (!isOpen) return;

    if (!fiInitialized) {
      initFetchFixedIncome?.();
    }
    if (!cfInitialized) {
      initFetchCashFlow?.();
    }

    fetchFxHistory("USD", "COP")
      .then((res) => {
        if (res?.current && Number(res.current) > 500) {
          setFxRate(Number(res.current));
        }
      })
      .catch(() => {});

    if (isLocal) {
      fetchLocalOllamaModels()
        .then((info) => setOllamaInfo(info || { available: false, models: [] }))
        .catch(() => {});
    }
  }, [isOpen, fiInitialized, cfInitialized, initFetchFixedIncome, initFetchCashFlow, isLocal]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !sendingChat) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, sendingChat, onClose]);

  useEffect(() => {
    if (messages.length > 0 || sendingChat) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, sendingChat]);

  const currentProviderId = aiConfig.providerId || "gemini";
  const currentProviderMeta = AI_PROVIDERS[currentProviderId] || AI_PROVIDERS.gemini;
  const currentKey = aiConfig.apiKeysByProvider?.[currentProviderId] || "";
  const currentBaseUrl =
    aiConfig.baseUrlsByProvider?.[currentProviderId] ?? (currentProviderMeta.baseUrl || "");
  const alreadyHasDetected = (detectedModelsByProvider[currentProviderId] || []).length > 0;

  // Automatically fetch live models from the provider as soon as a key is present
  useEffect(() => {
    if (!isOpen || currentProviderId === "prompt_only" || alreadyHasDetected) return;
    if (currentProviderMeta.requiresKey && currentKey.trim().length < 12) return;
    if (
      !currentProviderMeta.requiresKey &&
      currentProviderId === "custom" &&
      !currentBaseUrl.trim()
    ) {
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingModels(true);
      try {
        const res = await fetchAvailableProviderModels({
          providerId: currentProviderId,
          apiKey: currentKey,
          baseUrl: currentBaseUrl,
        });
        if (cancelled || !res.available || res.models.length === 0) return;
        setDetectedModelsByProvider((prev) => ({
          ...prev,
          [currentProviderId]: res.models,
        }));
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isOpen,
    currentProviderId,
    currentProviderMeta.requiresKey,
    currentKey,
    currentBaseUrl,
    alreadyHasDetected,
  ]);

  const contextResult = useMemo(
    () =>
      buildEconomicContextFromState({
        authState: { user: authUser },
        portfolioState: {
          purchasePortfolios,
          individualPurchases,
          purchaseSales,
          customStrategies,
          strategyRebalances,
          lastStrategySummaries,
          lastKnownQuotes,
        },
        fixedIncomeState: {
          entities: fiEntities,
          accounts: fiAccounts,
          cdts: fiCdts,
        },
        cashFlowState: {
          activePeriod: cfActivePeriod,
          inflows: cfInflows,
          needs: cfNeeds,
          wants: cfWants,
          wealth: cfWealth,
          expensesLog: cfExpensesLog,
          debts: cfDebts,
          creditCards: cfCreditCards,
        },
        fxRate,
        scope,
        userQuestion: activeTab === "prompt" ? promptQuestion : chatInput,
      }),
    [
      authUser,
      purchasePortfolios,
      individualPurchases,
      purchaseSales,
      customStrategies,
      strategyRebalances,
      lastStrategySummaries,
      lastKnownQuotes,
      fiEntities,
      fiAccounts,
      fiCdts,
      cfActivePeriod,
      cfInflows,
      cfNeeds,
      cfWants,
      cfWealth,
      cfExpensesLog,
      cfDebts,
      cfCreditCards,
      fxRate,
      scope,
      activeTab,
      promptQuestion,
      chatInput,
    ],
  );

  if (!isOpen) return null;

  const providerId = aiConfig.providerId || "gemini";
  const providerMeta = AI_PROVIDERS[providerId] || AI_PROVIDERS.gemini;
  const activeKey = aiConfig.apiKeysByProvider?.[providerId] || "";
  const activeBaseUrl = aiConfig.baseUrlsByProvider?.[providerId] ?? (providerMeta.baseUrl || "");
  const liveDetected = detectedModelsByProvider[providerId] || [];
  const availableModels =
    liveDetected.length > 0
      ? liveDetected
      : providerId === "ollama" && ollamaInfo.models?.length > 0
        ? ollamaInfo.models
        : providerMeta.suggestedModels || [];
  const activeModel =
    aiConfig.modelsByProvider?.[providerId] ||
    (liveDetected.length > 0 ? liveDetected[0] : "") ||
    (providerId === "ollama" && ollamaInfo.default_model) ||
    providerMeta.defaultModel ||
    "";

  const handleDetectModels = async ({ silent = false } = {}) => {
    if (providerId === "prompt_only") return;
    if (providerMeta.requiresKey && !activeKey.trim()) {
      if (!silent) toast.error(`Ingresa primero tu API Key para ${providerMeta.name}`);
      return;
    }
    setLoadingModels(true);
    try {
      const res = await fetchAvailableProviderModels({
        providerId,
        apiKey: activeKey,
        baseUrl: activeBaseUrl,
      });
      if (!res.available || res.models.length === 0) {
        if (!silent) toast.error(res.error || "No se encontraron modelos disponibles.");
        return;
      }
      setDetectedModelsByProvider((prev) => ({ ...prev, [providerId]: res.models }));
      if (
        res.recommendedModel &&
        (!aiConfig.modelsByProvider?.[providerId] || !res.models.includes(activeModel))
      ) {
        updateConfig((prev) => ({
          ...prev,
          modelsByProvider: {
            ...prev.modelsByProvider,
            [providerId]: res.recommendedModel,
          },
        }));
      }
      if (!silent) {
        toast.success(`${res.models.length} modelos detectados en ${providerMeta.name}`);
      }
    } finally {
      setLoadingModels(false);
    }
  };

  const copyText = (text, id = "generic") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copiado al portapapeles");
    setTimeout(() => setCopiedId(null), 2200);
  };

  const handleSelectProvider = (nextId) => {
    updateConfig({ providerId: nextId });
    if (nextId === "prompt_only") {
      setActiveTab("prompt");
    } else if (activeTab === "prompt" && nextId !== "prompt_only") {
      setActiveTab("chat");
    }
  };

  const handleTestConnection = async () => {
    if (providerId === "prompt_only") {
      toast.success("El modo Solo Prompt no requiere conexión API.");
      return;
    }
    setTestingConn(true);
    try {
      const res = await askEconomicAI({
        providerId,
        model: activeModel,
        apiKey: activeKey,
        baseUrl: activeBaseUrl,
        contextText: `TRM actual: $${Math.round(fxRate)} COP/USD.`,
        history: [],
        question: "Responde únicamente 'OK conectado' y el nombre breve de tu modelo.",
        scope: "macro",
        useLocalProxy: aiConfig.useLocalProxy,
      });
      if (res.availableModels?.length > 0) {
        setDetectedModelsByProvider((prev) => ({ ...prev, [providerId]: res.availableModels }));
      }
      if (res.modelUsed && res.modelUsed !== activeModel) {
        updateConfig((prev) => ({
          ...prev,
          modelsByProvider: { ...prev.modelsByProvider, [providerId]: res.modelUsed },
        }));
      }
      toast.success(
        `Conexión exitosa con ${providerMeta.name} (${res.modelUsed})${res.fallbackUsed ? " — modelo ajustado automáticamente" : ""}`,
      );
      setShowConfig(false);
    } catch (err) {
      toast.error(err.message || "Error probando la conexión");
    } finally {
      setTestingConn(false);
    }
  };

  const handleSendChat = async (overrideQuestion) => {
    const q = (overrideQuestion ?? chatInput).trim();
    if (!q) {
      toast.error("Escribe tu pregunta económica primero.");
      return;
    }
    if (providerId === "prompt_only") {
      setPromptQuestion(q);
      setActiveTab("prompt");
      const built = buildCopyReadyPrompt({
        contextText: contextResult.contextText,
        userQuestion: q,
        focus: promptFocus,
        targetedTickers: contextResult.stats.targetedTickers,
      });
      setGeneratedPrompt(built);
      return;
    }
    if (providerMeta.requiresKey && !activeKey.trim()) {
      setShowConfig(true);
      toast.error(`Ingresa primero tu API Key para ${providerMeta.name}`);
      return;
    }

    const userMsg = { id: `u_${Date.now()}`, role: "user", content: q };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!overrideQuestion) setChatInput("");
    setSendingChat(true);

    try {
      const res = await askEconomicAI({
        providerId,
        model: activeModel,
        apiKey: activeKey,
        baseUrl: activeBaseUrl,
        contextText: contextResult.contextText,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        question: q,
        scope,
        useLocalProxy: aiConfig.useLocalProxy,
      });

      if (res.availableModels?.length > 0) {
        setDetectedModelsByProvider((prev) => ({ ...prev, [providerId]: res.availableModels }));
      }
      if (res.fallbackUsed && res.modelUsed) {
        updateConfig((prev) => ({
          ...prev,
          modelsByProvider: { ...prev.modelsByProvider, [providerId]: res.modelUsed },
        }));
        toast.success(`Modelo ajustado automáticamente a ${res.modelUsed}`);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: res.reply,
          meta: `${providerMeta.name} • ${res.modelUsed}${res.viaProxy ? " (proxy local)" : ""}`,
        },
      ]);
    } catch (err) {
      toast.error(err.message || "Error consultando la IA");
      setMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: "assistant",
          isError: true,
          content: `⚠️ ${err.message || "No se pudo obtener respuesta de la IA."}`,
        },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    try {
      if (isLocal && refineWithLocalOllama) {
        const res = await generateWarrenPromptApi({
          focus: promptFocus,
          userQuestion: promptQuestion.trim() || undefined,
          useOllama: true,
          model: ollamaInfo.default_model || "qwen2.5-coder:14b",
        });
        if (res?.prompt_for_warren) {
          setGeneratedPrompt(res.prompt_for_warren);
          toast.success("Prompt refinado con Ollama Local");
          return;
        }
      }

      const built = buildCopyReadyPrompt({
        contextText: contextResult.contextText,
        userQuestion: promptQuestion,
        focus: promptFocus,
        targetedTickers: contextResult.stats.targetedTickers,
      });
      setGeneratedPrompt(built);
      toast.success("Prompt económico generado con tus datos reales");
    } catch (err) {
      toast.error(err.message || "Error generando prompt");
    } finally {
      setGeneratingPrompt(false);
    }
  };

  // Dual Theme Palette (THEME_GUIDELINES.md compliant)
  const C = {
    overlay: isLight ? "rgba(15, 23, 42, 0.55)" : "rgba(5, 8, 20, 0.85)",
    modalBg: isLight ? "#ffffff" : "rgba(13, 18, 38, 0.98)",
    surfaceBg: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.035)",
    cardBg: isLight ? "#f1f5f9" : "rgba(255, 255, 255, 0.05)",
    inputBg: isLight ? "#ffffff" : "rgba(0, 0, 0, 0.35)",
    border: isLight ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.1)",
    text: isLight ? "#0f172a" : "#f8fafc",
    textSec: isLight ? "#334155" : "#cbd5e1",
    textMuted: isLight ? "#64748b" : "#94a3b8",
    accent: isLight ? "#059669" : "#34d399",
    accentSoft: isLight ? "rgba(5, 150, 105, 0.1)" : "rgba(16, 185, 129, 0.14)",
    accentBorder: isLight ? "rgba(5, 150, 105, 0.3)" : "rgba(16, 185, 129, 0.32)",
    indigo: isLight ? "#4f46e5" : "#818cf8",
    indigoSoft: isLight ? "rgba(79, 70, 229, 0.09)" : "rgba(99, 102, 241, 0.15)",
    userBubble: isLight ? "#e0f2fe" : "rgba(56, 189, 248, 0.14)",
    userBorder: isLight ? "rgba(2, 132, 199, 0.28)" : "rgba(56, 189, 248, 0.3)",
    aiBubble: isLight ? "#f8fafc" : "rgba(255, 255, 255, 0.04)",
    errorBubble: isLight ? "#fef2f2" : "rgba(239, 68, 68, 0.12)",
    errorText: isLight ? "#b91c1c" : "#fca5a5",
    codeBg: isLight ? "#f1f5f9" : "rgba(0, 0, 0, 0.45)",
  };

  return createPortal(
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !sendingChat) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.overlay,
        backdropFilter: "blur(8px)",
        padding: "16px",
      }}
    >
      <div
        aria-label="Asistente Económico IA y WarrenAI"
        style={{
          width: "100%",
          maxWidth: "880px",
          maxHeight: "92vh",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          borderRadius: "18px",
          background: C.modalBg,
          border: `1px solid ${C.border}`,
          boxShadow: isLight
            ? "0 20px 50px rgba(15, 23, 42, 0.18)"
            : "0 24px 64px rgba(0, 0, 0, 0.65)",
          color: C.text,
          overflow: "hidden",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            background: C.surfaceBg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "12px",
                background: C.accentSoft,
                border: `1px solid ${C.accentBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.35rem",
              }}
            >
              🤖
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.08rem", fontWeight: 700, color: C.text }}>
                Asistente Económico IA &amp; WarrenAI
              </h2>
              <p style={{ margin: 0, fontSize: "0.78rem", color: C.textMuted }}>
                Conecta cualquier API (Gemini, OpenAI, Claude, Groq, OpenRouter, Ollama) con todo tu
                contexto financiero real
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente IA"
            style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              color: C.textSec,
              borderRadius: "8px",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            ✕ Cerrar
          </button>
        </div>

        {/* ── Mode Tabs & Live Context KPIs ───────────────────────── */}
        <div
          style={{
            padding: "10px 22px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[
              { id: "chat", label: "💬 Preguntar con API IA" },
              { id: "prompt", label: "📋 Generar Prompt (Sin API / WarrenAI)" },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${active ? C.accentBorder : C.border}`,
                    background: active ? C.accentSoft : "transparent",
                    color: active ? C.accent : C.textSec,
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Context Scope Chips + Live Stats Summary */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span
              title="Patrimonio neto aproximado y tasa TRM en el contexto actual"
              style={{
                fontSize: "0.74rem",
                padding: "4px 9px",
                borderRadius: "6px",
                background: C.cardBg,
                border: `1px solid ${C.border}`,
                color: C.textSec,
                fontWeight: 600,
              }}
            >
              Patrimonio: {formatCompactCOP(contextResult.stats.netWorthCOP)} • TRM $
              {Math.round(fxRate).toLocaleString("es-CO")} • CDTs Activos:{" "}
              {contextResult.stats.activeCdtsCount}
            </span>
            <button
              type="button"
              onClick={() => setShowContextPreview((v) => !v)}
              style={{
                fontSize: "0.74rem",
                padding: "4px 9px",
                borderRadius: "6px",
                border: `1px solid ${C.border}`,
                background: showContextPreview ? C.indigoSoft : "transparent",
                color: showContextPreview ? C.indigo : C.textMuted,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {showContextPreview
                ? "Ocultar Datos"
                : `👁️ Ver Datos (~${contextResult.estimatedTokens} tok)`}
            </button>
          </div>
        </div>

        {/* ── Scrollable Body ──────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 22px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {/* Context Scope Picker */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <span
              style={{
                fontSize: "0.75rem",
                color: C.textMuted,
                fontWeight: 600,
                marginRight: "4px",
              }}
            >
              Contexto incluido:
            </span>
            {AI_CONTEXT_SCOPES.map((sc) => {
              const selected = scope === sc.id;
              return (
                <button
                  key={sc.id}
                  type="button"
                  title={sc.desc}
                  onClick={() => setScope(sc.id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: `1px solid ${selected ? C.accentBorder : C.border}`,
                    background: selected ? C.accentSoft : C.surfaceBg,
                    color: selected ? C.accent : C.textSec,
                    fontSize: "0.75rem",
                    fontWeight: selected ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {sc.icon} {sc.label}
                </button>
              );
            })}
          </div>

          {/* Expandable Context Inspector */}
          {showContextPreview && (
            <div
              style={{
                padding: "12px",
                borderRadius: "10px",
                background: C.codeBg,
                border: `1px solid ${C.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: C.textSec }}>
                  Resumen exacto enviado al modelo ({contextResult.contextText.length} caracteres):
                </span>
                <button
                  type="button"
                  onClick={() => copyText(contextResult.contextText, "ctx")}
                  style={{
                    fontSize: "0.73rem",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: `1px solid ${C.border}`,
                    background: C.surfaceBg,
                    color: C.textSec,
                    cursor: "pointer",
                  }}
                >
                  {copiedId === "ctx" ? "✓ Copiado" : "📋 Copiar datos"}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  maxHeight: "180px",
                  overflowY: "auto",
                  fontSize: "0.75rem",
                  lineHeight: 1.45,
                  color: C.textSec,
                  whiteSpace: "pre-wrap",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {contextResult.contextText}
              </pre>
            </div>
          )}

          {/* ── TAB 1: MULTI-AI CHAT ──────────────────────────────── */}
          {activeTab === "chat" && (
            <>
              {/* Active Provider Strip */}
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: C.surfaceBg,
                  border: `1px solid ${C.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}
                >
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: C.text }}>
                    🔌 Proveedor: {providerMeta.name}
                  </span>
                  {providerId !== "prompt_only" && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <select
                        aria-label="Modelo de IA activo"
                        value={activeModel}
                        onChange={(e) =>
                          updateConfig((prev) => ({
                            ...prev,
                            modelsByProvider: {
                              ...prev.modelsByProvider,
                              [providerId]: e.target.value,
                            },
                          }))
                        }
                        style={{
                          fontSize: "0.73rem",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background: C.indigoSoft,
                          border: `1px solid ${C.border}`,
                          color: C.indigo,
                          fontWeight: 600,
                          maxWidth: "230px",
                          cursor: "pointer",
                        }}
                      >
                        {(availableModels.includes(activeModel) || !activeModel
                          ? availableModels
                          : [activeModel, ...availableModels]
                        ).map((m) => (
                          <option
                            key={m}
                            value={m}
                            style={{
                              background: isLight ? "#ffffff" : "#0f172a",
                              color: isLight ? "#0f172a" : "#f8fafc",
                            }}
                          >
                            {m}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDetectModels({ silent: false })}
                        disabled={loadingModels}
                        title="Cargar modelos disponibles desde tu API Key"
                        style={{
                          fontSize: "0.72rem",
                          padding: "3px 7px",
                          borderRadius: "6px",
                          border: `1px solid ${C.border}`,
                          background: C.cardBg,
                          color: C.textSec,
                          cursor: loadingModels ? "wait" : "pointer",
                        }}
                      >
                        {loadingModels ? "⏳" : "🔄"}
                      </button>
                    </div>
                  )}
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: !providerMeta.requiresKey || activeKey.trim() ? C.accent : C.errorText,
                      fontWeight: 600,
                    }}
                  >
                    {!providerMeta.requiresKey
                      ? "• Sin API Key requerida"
                      : activeKey.trim()
                        ? liveDetected.length > 0
                          ? `• Key OK (${liveDetected.length} modelos)`
                          : "• API Key configurada ✓"
                        : "• Falta API Key"}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMessages([])}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "7px",
                        border: `1px solid ${C.border}`,
                        background: "transparent",
                        color: C.textMuted,
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      🗑️ Limpiar chat
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowConfig((v) => !v)}
                    style={{
                      padding: "5px 11px",
                      borderRadius: "7px",
                      border: `1px solid ${showConfig ? C.accentBorder : C.border}`,
                      background: showConfig ? C.accentSoft : C.cardBg,
                      color: showConfig ? C.accent : C.text,
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {showConfig ? "▲ Ocultar Configuración API" : "⚙️ Configurar API / Modelo"}
                  </button>
                </div>
              </div>

              {/* Provider BYOK Configurator Drawer */}
              {showConfig && (
                <div
                  style={{
                    padding: "14px",
                    borderRadius: "12px",
                    background: C.surfaceBg,
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <label
                        htmlFor="ai-provider-select"
                        style={{
                          display: "block",
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          color: C.textSec,
                          marginBottom: "4px",
                        }}
                      >
                        Proveedor de IA
                      </label>
                      <select
                        id="ai-provider-select"
                        value={providerId}
                        onChange={(e) => handleSelectProvider(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          background: C.inputBg,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          fontSize: "0.82rem",
                        }}
                      >
                        {Object.values(AI_PROVIDERS).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.badge})
                          </option>
                        ))}
                      </select>
                    </div>

                    {providerId !== "prompt_only" && (
                      <div>
                        <label
                          htmlFor="ai-model-input"
                          style={{
                            display: "block",
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            color: C.textSec,
                            marginBottom: "4px",
                          }}
                        >
                          Modelo (selecciona o escribe cualquiera)
                        </label>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <input
                            id="ai-model-input"
                            type="text"
                            list={`kpital-models-${providerId}`}
                            value={activeModel}
                            placeholder={providerMeta.defaultModel || "Ej: gpt-4o-mini"}
                            onChange={(e) =>
                              updateConfig((prev) => ({
                                ...prev,
                                modelsByProvider: {
                                  ...prev.modelsByProvider,
                                  [providerId]: e.target.value,
                                },
                              }))
                            }
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: "8px 10px",
                              borderRadius: "8px",
                              background: C.inputBg,
                              border: `1px solid ${C.border}`,
                              color: C.text,
                              fontSize: "0.82rem",
                              boxSizing: "border-box",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleDetectModels({ silent: false })}
                            disabled={loadingModels}
                            title="Consultar qué modelos activos permite tu API key"
                            style={{
                              padding: "6px 10px",
                              borderRadius: "8px",
                              border: `1px solid ${C.border}`,
                              background: C.cardBg,
                              color: C.textSec,
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: loadingModels ? "wait" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {loadingModels ? "..." : "🔄 Modelos"}
                          </button>
                        </div>
                        <datalist id={`kpital-models-${providerId}`}>
                          {availableModels.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                        {availableModels.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              gap: "5px",
                              flexWrap: "wrap",
                              marginTop: "6px",
                            }}
                          >
                            {availableModels.slice(0, 6).map((m) => {
                              const isSel = activeModel === m;
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() =>
                                    updateConfig((prev) => ({
                                      ...prev,
                                      modelsByProvider: {
                                        ...prev.modelsByProvider,
                                        [providerId]: m,
                                      },
                                    }))
                                  }
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "999px",
                                    border: `1px solid ${isSel ? C.accentBorder : C.border}`,
                                    background: isSel ? C.accentSoft : C.cardBg,
                                    color: isSel ? C.accent : C.textMuted,
                                    fontSize: "0.7rem",
                                    fontWeight: isSel ? 700 : 500,
                                    cursor: "pointer",
                                  }}
                                >
                                  {m}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {providerMeta.supportsBaseUrl && (
                    <div>
                      <label
                        htmlFor="ai-base-url-input"
                        style={{
                          display: "block",
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          color: C.textSec,
                          marginBottom: "4px",
                        }}
                      >
                        Base URL (endpoint compatible con OpenAI o Ollama)
                      </label>
                      <input
                        id="ai-base-url-input"
                        type="text"
                        value={activeBaseUrl}
                        placeholder="https://api.tuservidor.com/v1 o http://127.0.0.1:1234/v1"
                        onChange={(e) =>
                          updateConfig((prev) => ({
                            ...prev,
                            baseUrlsByProvider: {
                              ...prev.baseUrlsByProvider,
                              [providerId]: e.target.value,
                            },
                          }))
                        }
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          background: C.inputBg,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          fontSize: "0.82rem",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  )}

                  {providerId !== "prompt_only" && (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <label
                          htmlFor="ai-api-key-input"
                          style={{ fontSize: "0.76rem", fontWeight: 600, color: C.textSec }}
                        >
                          API Key {providerMeta.requiresKey ? "*" : "(Opcional)"}
                        </label>
                        {providerMeta.helpUrl && (
                          <a
                            href={providerMeta.helpUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: "0.74rem",
                              color: C.accent,
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            Obtener API Key ↗
                          </a>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          id="ai-api-key-input"
                          type={showApiKey ? "text" : "password"}
                          value={activeKey}
                          placeholder={providerMeta.keyPlaceholder || "Pega tu API Key aquí"}
                          onChange={(e) =>
                            updateConfig((prev) => ({
                              ...prev,
                              apiKeysByProvider: {
                                ...prev.apiKeysByProvider,
                                [providerId]: e.target.value,
                              },
                            }))
                          }
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: C.inputBg,
                            border: `1px solid ${C.border}`,
                            color: C.text,
                            fontSize: "0.82rem",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((v) => !v)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: "8px",
                            border: `1px solid ${C.border}`,
                            background: C.cardBg,
                            color: C.textSec,
                            fontSize: "0.76rem",
                            cursor: "pointer",
                          }}
                        >
                          {showApiKey ? "Ocultar" : "Ver"}
                        </button>
                        <button
                          type="button"
                          onClick={handleTestConnection}
                          disabled={testingConn}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            border: `1px solid ${C.accentBorder}`,
                            background: C.accentSoft,
                            color: C.accent,
                            fontSize: "0.76rem",
                            fontWeight: 700,
                            cursor: testingConn ? "wait" : "pointer",
                          }}
                        >
                          {testingConn ? "Probando..." : "🔌 Probar"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Privacy & Local Proxy Options */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px",
                      paddingTop: "4px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "14px",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "0.75rem",
                          color: C.textSec,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(aiConfig.persistKeysInBrowser)}
                          onChange={(e) => updateConfig({ persistKeysInBrowser: e.target.checked })}
                        />
                        Recordar Key en este navegador (si se desmarca, solo dura esta pestaña)
                      </label>

                      {isLocal && providerId !== "prompt_only" && providerId !== "ollama" && (
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "0.75rem",
                            color: C.textSec,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(aiConfig.useLocalProxy)}
                            onChange={(e) => updateConfig({ useLocalProxy: e.target.checked })}
                          />
                          Usar proxy FastAPI local (evita CORS)
                        </label>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        clearStoredAIKeys();
                        setAiConfig(loadAIConfig());
                        toast.success("Claves borradas del navegador");
                      }}
                      style={{
                        padding: "4px 9px",
                        borderRadius: "6px",
                        border: `1px solid ${C.border}`,
                        background: "transparent",
                        color: C.textMuted,
                        fontSize: "0.72rem",
                        cursor: "pointer",
                      }}
                    >
                      🧹 Borrar Claves
                    </button>
                  </div>

                  <p style={{ margin: 0, fontSize: "0.73rem", color: C.textMuted }}>
                    🔒 Privacidad: Tus claves API permanecen exclusivamente en tu navegador y nunca
                    se guardan en Supabase. {providerMeta.helpText}
                  </p>
                </div>
              )}

              {/* Quick Economic Starters */}
              {messages.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.76rem", fontWeight: 600, color: C.textMuted }}>
                    Preguntas rápidas de economía y finanzas con tus datos:
                  </span>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: "8px",
                    }}
                  >
                    {ECONOMIC_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => handleSendChat(starter)}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: "10px",
                          border: `1px solid ${C.border}`,
                          background: C.surfaceBg,
                          color: C.textSec,
                          fontSize: "0.79rem",
                          lineHeight: 1.4,
                          cursor: "pointer",
                        }}
                      >
                        💡 {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversation Thread */}
              {messages.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {messages.map((m) => {
                    const isUser = m.role === "user";
                    return (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: isUser ? "flex-end" : "stretch",
                          maxWidth: isUser ? "82%" : "100%",
                          padding: "11px 14px",
                          borderRadius: "12px",
                          background: m.isError
                            ? C.errorBubble
                            : isUser
                              ? C.userBubble
                              : C.aiBubble,
                          border: `1px solid ${isUser ? C.userBorder : C.border}`,
                          color: m.isError ? C.errorText : C.text,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "5px",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              color: isUser ? C.indigo : C.accent,
                            }}
                          >
                            {isUser ? "Tú" : m.meta || "Asistente IA"}
                          </span>
                          {!isUser && !m.isError && (
                            <button
                              type="button"
                              onClick={() => copyText(m.content, m.id)}
                              style={{
                                fontSize: "0.7rem",
                                padding: "2px 7px",
                                borderRadius: "5px",
                                border: `1px solid ${C.border}`,
                                background: C.cardBg,
                                color: C.textMuted,
                                cursor: "pointer",
                              }}
                            >
                              {copiedId === m.id ? "✓ Copiado" : "📋 Copiar"}
                            </button>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "0.85rem",
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {m.content}
                        </div>
                      </div>
                    );
                  })}
                  {sendingChat && (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        background: C.surfaceBg,
                        border: `1px solid ${C.border}`,
                        fontSize: "0.82rem",
                        color: C.textMuted,
                      }}
                    >
                      ⏳ Analizando tus finanzas y contexto económico con {providerMeta.name}...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Question Input Composer */}
              <div style={{ display: "flex", gap: "8px", marginTop: "auto", paddingTop: "6px" }}>
                <textarea
                  rows={2}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!sendingChat) handleSendChat();
                    }
                  }}
                  placeholder="Pregunta cualquier tema económico o financiero con tus datos reales (Enter envía, Shift+Enter salto)..."
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: "10px",
                    background: C.inputBg,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    fontSize: "0.85rem",
                    resize: "none",
                  }}
                />
                <button
                  type="button"
                  disabled={sendingChat}
                  onClick={() => handleSendChat()}
                  style={{
                    padding: "0 18px",
                    borderRadius: "10px",
                    border: `1px solid ${C.accentBorder}`,
                    background: isLight
                      ? "linear-gradient(135deg, #059669, #10b981)"
                      : "linear-gradient(135deg, #10b981, #059669)",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: sendingChat ? "wait" : "pointer",
                  }}
                >
                  {sendingChat ? "Enviando..." : "Preguntar ➤"}
                </button>
              </div>
            </>
          )}

          {/* ── TAB 2: PROMPT BUILDER (NO API KEY / WARRENAI) ────── */}
          {activeTab === "prompt" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label
                  htmlFor="ai-prompt-focus-input"
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: C.textSec,
                    marginBottom: "5px",
                  }}
                >
                  🎯 Enfoque del Prompt
                </label>
                <input
                  id="ai-prompt-focus-input"
                  type="text"
                  value={promptFocus}
                  onChange={(e) => setPromptFocus(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "9px",
                    background: C.inputBg,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    fontSize: "0.85rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="ai-prompt-question-input"
                  style={{
                    display: "block",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: C.textSec,
                    marginBottom: "5px",
                  }}
                >
                  ❓ Pregunta Específica (opcional — ej. Platino, CDTs vs Dólar, Deudas)
                </label>
                <textarea
                  id="ai-prompt-question-input"
                  rows={2}
                  value={promptQuestion}
                  onChange={(e) => setPromptQuestion(e.target.value)}
                  placeholder="Ej: ¿Conviene renovar mis CDTs al 13% EA en Colombia o pasar excedentes a ETFs en USD dada la TRM actual?"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "9px",
                    background: C.inputBg,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    fontSize: "0.85rem",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {isLocal && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "0.78rem",
                    color: C.textSec,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={refineWithLocalOllama}
                    onChange={(e) => setRefineWithLocalOllama(e.target.checked)}
                  />
                  Refinar redacción del prompt usando Ollama Local (
                  {ollamaInfo.default_model || "qwen2.5-coder:14b"})
                </label>
              )}

              <button
                type="button"
                disabled={generatingPrompt}
                onClick={handleGeneratePrompt}
                style={{
                  width: "100%",
                  padding: "11px",
                  borderRadius: "10px",
                  border: "none",
                  background: isLight
                    ? "linear-gradient(135deg, #059669, #10b981)"
                    : "linear-gradient(135deg, #10b981, #059669)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: generatingPrompt ? "wait" : "pointer",
                }}
              >
                {generatingPrompt
                  ? "Generando prompt con tu contexto..."
                  : "✨ Generar Prompt Listo para Copiar (Sin API Key)"}
              </button>

              {generatedPrompt && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: C.accent }}>
                      ✅ Prompt listo para pegar en WarrenAI (Investing.com), ChatGPT, Claude o
                      Gemini:
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText(generatedPrompt, "prompt")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "7px",
                        border: `1px solid ${C.accentBorder}`,
                        background: C.accentSoft,
                        color: C.accent,
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {copiedId === "prompt" ? "✓ Copiado" : "📋 Copiar Prompt"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    rows={10}
                    value={generatedPrompt}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "10px",
                      background: C.codeBg,
                      border: `1px solid ${C.border}`,
                      color: C.text,
                      fontSize: "0.82rem",
                      lineHeight: 1.5,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
