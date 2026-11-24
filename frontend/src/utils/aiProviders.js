/**
 * Unified Multi-AI Provider Client (BYOK + Prompt-Only Fallback).
 * Works directly from static production browser (https://zhent.homes)
 * AND integrates with local FastAPI/Ollama when running locally.
 * API keys are kept strictly client-side (localStorage or sessionStorage) and never persisted to Supabase.
 */

import { getBase } from "../api/client";

const STORAGE_KEY = "kpital_ai_provider_config_v1";

export const ECONOMIC_SYSTEM_PROMPT = [
  "Eres el Asistente Económico y Financiero Integral de Kpital (experto en macroeconomía,",
  "finanzas personales en Colombia COP/TRM, renta fija/CDTs, flujo de caja, deuda y mercado bursátil).",
  "REGLAS ESTRICTAS:",
  "1. Responde basándote en los datos reales del usuario incluidos en el contexto. No inventes cifras.",
  "2. Separa claramente montos en COP y USD (usa la TRM del contexto al consolidar patrimonio).",
  "3. Excluye siempre los CDTs marcados como vencidos/matured del capital activo.",
  "4. Responde en español claro, estructurado con viñetas y cifras exactas.",
  "5. Indica supuestos macroeconómicos (tasas BanRep/Fed, inflación, TRM) y recuerda que es apoyo analítico, no asesoría financiera regulada.",
].join("\n");

export const AI_PROVIDERS = {
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    badge: "Gratis / CORS OK",
    requiresKey: true,
    supportsBaseUrl: false,
    defaultModel: "gemini-2.5-flash",
    suggestedModels: [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemma-3-27b-it",
      "gemma-3-12b-it",
      "gemini-2.5-pro",
      "gemini-1.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
    ],
    keyPlaceholder: "AIzaSy...",
    helpUrl: "https://aistudio.google.com/apikey",
    helpText:
      "Obtén tu API key gratis en Google AI Studio. Incluye rotación anti-429/503 entre Gemini 2.5, 1.5 y Gemma 3.",
  },
  groq: {
    id: "groq",
    name: "Groq Cloud",
    badge: "Ultra rápido / Gratis",
    requiresKey: true,
    supportsBaseUrl: false,
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    suggestedModels: ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "qwen-qwq-32b"],
    keyPlaceholder: "gsk_...",
    helpUrl: "https://console.groq.com/keys",
    helpText:
      "Tier gratuito rápido con modelos Llama 3.3 y DeepSeek R1 directo desde el navegador.",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter (Todas las IAs)",
    badge: "Multi-Modelo",
    requiresKey: true,
    supportsBaseUrl: false,
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.5-flash",
    suggestedModels: [
      "google/gemini-2.5-flash",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "deepseek/deepseek-chat-v3-0324:free",
    ],
    keyPlaceholder: "sk-or-v1-...",
    helpUrl: "https://openrouter.ai/keys",
    helpText:
      "Una sola API Key para usar GPT-4o, Claude, Gemini o DeepSeek desde cualquier navegador.",
  },
  openai: {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    badge: "BYOK",
    requiresKey: true,
    supportsBaseUrl: false,
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
    keyPlaceholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpText: "Conecta directamente con OpenAI usando tu propia clave.",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    badge: "Direct Browser",
    requiresKey: true,
    supportsBaseUrl: false,
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-haiku-latest",
    suggestedModels: ["claude-3-5-haiku-latest", "claude-sonnet-4-20250514"],
    keyPlaceholder: "sk-ant-...",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpText:
      "Usa Claude directo desde el navegador con cabecera oficial anthropic-dangerous-direct-browser-access.",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek API",
    badge: "Económico",
    requiresKey: true,
    supportsBaseUrl: false,
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    keyPlaceholder: "sk-...",
    helpUrl: "https://platform.deepseek.com/api_keys",
    helpText:
      "Nota: si el navegador bloquea CORS en DeepSeek directo, usa OpenRouter o corre Kpital en local.",
  },
  ollama: {
    id: "ollama",
    name: "Ollama Local",
    badge: "100% Privado",
    requiresKey: false,
    supportsBaseUrl: true,
    baseUrl: "http://127.0.0.1:11434",
    defaultModel: "qwen2.5-coder:14b",
    suggestedModels: ["qwen2.5-coder:14b", "deepseek-r1:14b", "gemma4:26b", "llama3.1:8b"],
    keyPlaceholder: "(Opcional / Sin Key)",
    helpUrl: "https://ollama.com",
    helpText: "Modelos locales en tu PC. Ideal cuando ejecutas Kpital en localhost.",
  },
  custom: {
    id: "custom",
    name: "API Personalizada (OpenAI-Compatible)",
    badge: "Custom URL",
    requiresKey: false,
    supportsBaseUrl: true,
    baseUrl: "",
    defaultModel: "",
    suggestedModels: [],
    keyPlaceholder: "Bearer token (si aplica)",
    helpUrl: "",
    helpText:
      "Conecta LM Studio, vLLM, Groq-compatible, Azure, o cualquier endpoint /v1/chat/completions.",
  },
  prompt_only: {
    id: "prompt_only",
    name: "Solo Prompt (Sin API Key / WarrenAI)",
    badge: "Gratis sin Key",
    requiresKey: false,
    supportsBaseUrl: false,
    defaultModel: "prompt-builder",
    suggestedModels: [],
    keyPlaceholder: "",
    helpUrl: "",
    helpText:
      "Genera el prompt estructurado con tus datos reales para pegarlo en WarrenAI, ChatGPT o Gemini web.",
  },
};

export function isRunningLocally() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

const DEFAULT_CONFIG = {
  providerId: "gemini",
  modelsByProvider: {},
  baseUrlsByProvider: {},
  apiKeysByProvider: {},
  persistKeysInBrowser: false,
  useLocalProxy: false,
};

export function loadAIConfig() {
  if (typeof window === "undefined") return { ...DEFAULT_CONFIG };
  try {
    const sessRaw = window.sessionStorage?.getItem(STORAGE_KEY);
    const localRaw = window.localStorage?.getItem(STORAGE_KEY);
    const parsedLocal = localRaw ? JSON.parse(localRaw) : {};
    const parsedSess = sessRaw ? JSON.parse(sessRaw) : {};
    const base = { ...DEFAULT_CONFIG, ...parsedLocal, ...parsedSess };
    return {
      ...base,
      apiKeysByProvider: {
        ...(parsedLocal.apiKeysByProvider || {}),
        ...(parsedSess.apiKeysByProvider || {}),
      },
      modelsByProvider: {
        ...(parsedLocal.modelsByProvider || {}),
        ...(parsedSess.modelsByProvider || {}),
      },
      baseUrlsByProvider: {
        ...(parsedLocal.baseUrlsByProvider || {}),
        ...(parsedSess.baseUrlsByProvider || {}),
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveAIConfig(config) {
  if (typeof window === "undefined") return;
  try {
    const clean = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    const metaOnly = {
      ...clean,
      apiKeysByProvider: {},
    };
    if (clean.persistKeysInBrowser) {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(clean));
      window.sessionStorage?.removeItem(STORAGE_KEY);
    } else {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(metaOnly));
      window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(clean));
    }
  } catch (err) {
    console.warn("[AI Config] No se pudo guardar en storage:", err);
  }
}

export function clearStoredAIKeys() {
  if (typeof window === "undefined") return;
  try {
    const current = loadAIConfig();
    const cleared = { ...current, apiKeysByProvider: {}, persistKeysInBrowser: false };
    window.sessionStorage?.removeItem(STORAGE_KEY);
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cleared));
  } catch {
    // ignore storage errors
  }
}

function buildMessagesPayload(contextText, history, question) {
  const sys = `${ECONOMIC_SYSTEM_PROMPT}\n\n--- CONTEXTO FINANCIERO REAL DEL USUARIO ---\n${contextText}\n--- FIN DEL CONTEXTO ---`;
  const msgs = [{ role: "system", content: sys }];
  for (const item of (history || []).slice(-8)) {
    if ((item?.role === "user" || item?.role === "assistant") && item?.content?.trim()) {
      msgs.push({ role: item.role, content: item.content.trim() });
    }
  }
  msgs.push({ role: "user", content: question.trim() });
  return msgs;
}

function mapHttpError(status, detail = "", providerId = "") {
  const cleanDetail = String(detail || "").slice(0, 220);
  if (status === 401 || status === 403) {
    return `Autenticación rechazada (${status}) por ${providerId || "el proveedor"}. Verifica que tu API Key sea válida y tenga permisos activos.`;
  }
  if (status === 404) {
    return `Endpoint o modelo no encontrado (404) en ${providerId}${cleanDetail ? `: ${cleanDetail}` : ""}. Revisa el nombre exacto del modelo o pulsa "Detectar modelos".`;
  }
  if (status === 429) {
    return `Límite de cuota o peticiones excedido (429) en ${providerId}. Espera unos segundos o cambia a otro proveedor/modelo.`;
  }
  if (status === 503) {
    return `Alta demanda temporal (503) en ${providerId}${cleanDetail ? `: ${cleanDetail}` : ""}. Cambia a otro modelo (ej. flash-lite) o intenta en unos segundos.`;
  }
  return `Error HTTP ${status} de ${providerId || "la IA"}${cleanDetail ? `: ${cleanDetail}` : ""}`;
}

function scoreGeminiModel(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (!id.startsWith("gemini-") && !id.startsWith("gemma-")) return -1;
  if (id === "gemini-2.5-flash") return 16000;
  if (id === "gemini-2.5-flash-lite") return 15500;
  if (id === "gemini-flash-latest") return 15000;
  if (id === "gemini-flash-lite-latest") return 14500;
  if (id === "gemini-1.5-flash") return 14000;
  if (id === "gemini-1.5-flash-8b") return 13500;
  if (id === "gemma-3-27b-it") return 13000;
  if (id === "gemma-3-12b-it") return 12500;
  if (id === "gemini-2.5-pro") return 12000;
  if (id === "gemini-1.5-pro") return 11500;
  if (id === "gemini-pro-latest") return 11000;
  if (id === "gemini-2.0-flash") return 9000;
  if (id === "gemini-2.0-flash-lite") return 8500;

  let score = 1000;
  const verMatch = id.match(/^gemini-(\d+(?:\.\d+)?)/);
  if (verMatch) {
    score += Number(verMatch[1]) * 500;
  }
  if (id.includes("flash") && !id.includes("lite")) score += 400;
  else if (id.includes("flash-lite")) score += 350;
  else if (id.includes("pro")) score += 200;
  else if (id.startsWith("gemma-3-")) score += 300;

  if (id.includes("preview") || id.includes("exp")) score -= 60;
  return score;
}

/**
 * Picks the strongest available Gemini/Gemma text/chat model from a `v1beta/models` list.
 */
export function pickBestGeminiFallbackModel(modelsList = [], excludeModels = []) {
  const excluded = new Set(excludeModels.map((m) => String(m || "").toLowerCase()));
  const defaultFallbacks = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemma-3-27b-it",
    "gemma-3-12b-it",
    "gemini-2.5-pro",
    "gemini-1.5-pro",
    "gemini-pro-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ];
  const combined = [...(modelsList || []), ...defaultFallbacks];
  const seen = new Set();
  const candidates = [];
  for (const raw of combined) {
    const clean = String(raw || "")
      .replace(/^models\//i, "")
      .trim();
    const lower = clean.toLowerCase();
    if (!clean || excluded.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    candidates.push(clean);
  }

  candidates.sort((a, b) => scoreGeminiModel(b) - scoreGeminiModel(a));
  return candidates[0] || null;
}

const EXCLUDED_GEMINI_KEYWORDS = [
  "embedding",
  "imagen",
  "veo",
  "aqa",
  "tts",
  "audio",
  "robotics",
  "computer-use",
  "bisect",
  "learnlm",
];

/**
 * Queries the provider's live model catalog using the user's API key.
 */
export async function fetchAvailableProviderModels({ providerId, apiKey = "", baseUrl = "" } = {}) {
  try {
    if (providerId === "prompt_only") {
      return { available: false, models: [], recommendedModel: null, error: null };
    }
    if (providerId === "ollama") {
      const info = await fetchLocalOllamaModels();
      return {
        available: Boolean(info?.available),
        models: info?.models || [],
        recommendedModel: info?.default_model || info?.models?.[0] || null,
        error: info?.available ? null : "Ollama no está accesible en este equipo.",
      };
    }

    if (providerId === "gemini") {
      const key = String(apiKey || "").trim();
      if (!key) {
        return {
          available: false,
          models: [],
          recommendedModel: null,
          error: "Ingresa tu API Key de Google Gemini para listar modelos.",
        };
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=100`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status} al consultar modelos Gemini`);
      }
      const models = (data?.models || [])
        .filter((m) => (m?.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) =>
          String(m?.name || "")
            .replace(/^models\//i, "")
            .trim(),
        )
        .filter(
          (name) =>
            (name?.startsWith("gemini-") || name?.startsWith("gemma-3-")) &&
            !EXCLUDED_GEMINI_KEYWORDS.some((kw) => name.toLowerCase().includes(kw)),
        );

      models.sort((a, b) => scoreGeminiModel(b) - scoreGeminiModel(a));
      return {
        available: models.length > 0,
        models,
        recommendedModel: pickBestGeminiFallbackModel(models),
        error: models.length > 0 ? null : "No se encontraron modelos Gemini compatibles.",
      };
    }

    const providerMeta = AI_PROVIDERS[providerId] || AI_PROVIDERS.custom;
    const rawBase = (baseUrl || providerMeta.baseUrl || "").trim().replace(/\/+$/, "");
    if (!rawBase) {
      return { available: false, models: [], recommendedModel: null, error: "Falta Base URL." };
    }
    const endpoint = `${rawBase.replace(/\/chat\/completions$/i, "")}/models`;
    const headers = {};
    if (String(apiKey || "").trim()) {
      headers.Authorization = `Bearer ${String(apiKey).trim()}`;
    }
    const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `HTTP ${res.status} al consultar modelos`);
    }
    const models = (data?.data || [])
      .map((m) => m?.id)
      .filter(Boolean)
      .slice(0, 60);
    return {
      available: models.length > 0,
      models,
      recommendedModel: models[0] || null,
      error: null,
    };
  } catch (err) {
    return {
      available: false,
      models: [],
      recommendedModel: null,
      error: err?.message || "No se pudieron listar los modelos.",
    };
  }
}

/**
 * Pure request builder (useful both at runtime and in unit tests).
 */
export function buildProviderRequestSpec({
  providerId,
  model,
  apiKey = "",
  baseUrl = "",
  contextText,
  history = [],
  question,
}) {
  const providerMeta = AI_PROVIDERS[providerId] || AI_PROVIDERS.custom;
  const resolvedModel = (model || providerMeta.defaultModel || "").trim();
  const messages = buildMessagesPayload(contextText, history, question);

  if (providerId === "gemini") {
    if (!apiKey.trim()) throw new Error("Ingresa tu API Key de Google Gemini.");
    const systemMsg = messages[0].content;
    const cleanModel = (resolvedModel || "gemini-2.5-flash").replace(/^models\//i, "");
    const isGemmaModel = cleanModel.toLowerCase().startsWith("gemma-");
    const rawTurns = messages.slice(1);
    const contents = rawTurns.map((m, idx) => {
      const role = m.role === "assistant" ? "model" : "user";
      const text =
        isGemmaModel && idx === 0 && role === "user"
          ? `${systemMsg}\n\n---\n\n${m.content}`
          : m.content;
      return {
        role,
        parts: [{ text }],
      };
    });
    const safeModel = encodeURIComponent(cleanModel);
    const safeKey = encodeURIComponent(apiKey.trim());
    const body = {
      contents,
      generationConfig: { temperature: 0.35, maxOutputTokens: 2048 },
    };
    if (!isGemmaModel) {
      body.systemInstruction = { parts: [{ text: systemMsg }] };
    }
    return {
      kind: "gemini",
      url: `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${safeKey}`,
      headers: { "Content-Type": "application/json" },
      body,
      modelUsed: cleanModel,
    };
  }

  if (providerId === "anthropic") {
    if (!apiKey.trim()) throw new Error("Ingresa tu API Key de Anthropic Claude.");
    const systemMsg = messages[0].content;
    const chatMsgs = messages.slice(1).map((m) => ({ role: m.role, content: m.content }));
    return {
      kind: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: {
        model: resolvedModel || "claude-3-5-haiku-latest",
        max_tokens: 2048,
        system: systemMsg,
        messages: chatMsgs,
      },
      modelUsed: resolvedModel || "claude-3-5-haiku-latest",
    };
  }

  if (providerId === "ollama") {
    const host = (baseUrl || providerMeta.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    return {
      kind: "ollama",
      url: `${host}/api/chat`,
      headers: { "Content-Type": "application/json" },
      body: {
        model: resolvedModel || "qwen2.5-coder:14b",
        messages,
        stream: false,
        options: { temperature: 0.35 },
      },
      modelUsed: resolvedModel || "qwen2.5-coder:14b",
    };
  }

  const rawBase = (baseUrl || providerMeta.baseUrl || "").trim().replace(/\/+$/, "");
  if (!rawBase) {
    throw new Error(
      "Ingresa la Base URL del proveedor (ej: https://api.openai.com/v1 o http://127.0.0.1:1234/v1).",
    );
  }
  if (providerMeta.requiresKey && !apiKey.trim()) {
    throw new Error(`Ingresa tu API Key para ${providerMeta.name}.`);
  }
  if (!resolvedModel) {
    throw new Error("Especifica el nombre del modelo a consultar.");
  }

  const endpoint = rawBase.endsWith("/chat/completions") ? rawBase : `${rawBase}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  if (providerId === "openrouter" && typeof window !== "undefined") {
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "Kpital Economic AI";
  }

  return {
    kind: "openai_compatible",
    url: endpoint,
    headers,
    body: {
      model: resolvedModel,
      messages,
      temperature: 0.35,
    },
    modelUsed: resolvedModel,
  };
}

function extractReplyFromJson(kind, data) {
  if (kind === "gemini") {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts
      .map((p) => p?.text || "")
      .join("")
      .trim();
  }
  if (kind === "anthropic") {
    const blocks = data?.content || [];
    return blocks
      .filter((b) => b?.type === "text")
      .map((b) => b?.text || "")
      .join("")
      .trim();
  }
  if (kind === "ollama") {
    return String(data?.message?.content || data?.response || "").trim();
  }
  return String(data?.choices?.[0]?.message?.content || "").trim();
}

/**
 * Fetches installed Ollama models when backend is running locally.
 */
export async function fetchLocalOllamaModels() {
  if (!isRunningLocally()) {
    return { available: false, models: [] };
  }
  try {
    const res = await fetch(`${getBase()}/warren/ollama/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { available: false, models: [] };
    return await res.json();
  } catch {
    return { available: false, models: [] };
  }
}

async function callViaLocalBackendProxy({
  providerId,
  model,
  apiKey,
  baseUrl,
  scope,
  history,
  question,
  contextText,
}) {
  const res = await fetch(`${getBase()}/warren/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      provider: providerId,
      model,
      api_key: apiKey || undefined,
      base_url: baseUrl || undefined,
      scope,
      history,
      context_override: contextText,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || mapHttpError(res.status, "", providerId));
  }
  return {
    reply: data.reply,
    modelUsed: data.model_used || model,
    providerId,
    viaProxy: true,
  };
}

async function executeProviderFetch(spec, providerId) {
  const res = await fetch(spec.url, {
    method: "POST",
    headers: spec.headers,
    body: JSON.stringify(spec.body),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    const errMsg =
      errJson?.error?.message ||
      errJson?.message ||
      errJson?.detail ||
      (await res.text().catch(() => ""));
    const err = new Error(
      mapHttpError(res.status, errMsg, AI_PROVIDERS[providerId]?.name || providerId),
    );
    err.httpStatus = res.status;
    throw err;
  }

  const data = await res.json();
  const reply = extractReplyFromJson(spec.kind, data);
  if (!reply) {
    throw new Error(
      "El modelo respondió vacío. Intenta reformular tu pregunta o elegir otro modelo.",
    );
  }
  return reply;
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deterministic quantitative analyst fallback when all external cloud API buckets
 * return 429 (quota exhausted) or 503 (high demand). Synthesizes real figures
 * directly from the user's Kpital contextText so the user always gets a complete answer.
 */
export function buildLocalQuantitativeFallbackReply(question = "", contextText = "") {
  const qLower = String(question || "").toLowerCase();
  const ctx = String(contextText || "");
  const lines = ctx.split("\n").map((l) => l.trim()).filter(Boolean);

  // Parse portfolios and individual stock/ETF holdings from contextText
  const portfolios = [];
  let currentPortfolio = null;
  const allPositions = [];
  const strategies = [];

  for (const line of lines) {
    // Match portfolio header: **Name** (USD) — Invertido: $X | Actual: $Y (+Z%) | PnL Realizado ...
    const portMatch = line.match(
      /^\*\*(.+?)\*\*\s*\((USD|COP)\)\s*—\s*Invertido:\s*\$([\d.,]+)\s*\|\s*Actual:\s*\$([\d.,]+)\s*\(([+-]?[\d.,]+)%\)/i,
    );
    if (portMatch) {
      currentPortfolio = {
        name: portMatch[1].trim(),
        currency: portMatch[2],
        invested: Number(portMatch[3].replace(/,/g, "")) || 0,
        current: Number(portMatch[4].replace(/,/g, "")) || 0,
        retPct: Number(portMatch[5].replace(/,/g, "")) || 0,
        positions: [],
      };
      portfolios.push(currentPortfolio);
      continue;
    }

    // Match position line: * TICKER: X uds @ $Avg -> Actual $Cur (Hoy: +A%, Retorno: +B%)
    const posMatch = line.match(
      /^\*\s*([A-Z0-9.-]+):\s*([\d.]+)\s*uds\s*@\s*\$([\d.]+)\s*->\s*Actual\s*\$([\d.]+)\s*\(Hoy:\s*([+-]?[\d.]+)%,\s*Retorno:\s*([+-]?[\d.]+)%\)/i,
    );
    if (posMatch) {
      const pos = {
        ticker: posMatch[1],
        shares: Number(posMatch[2]) || 0,
        avgPrice: Number(posMatch[3]) || 0,
        curPrice: Number(posMatch[4]) || 0,
        chg1d: Number(posMatch[5]) || 0,
        retPct: Number(posMatch[6]) || 0,
        portfolioName: currentPortfolio?.name || "Portafolio",
      };
      pos.invested = pos.shares * pos.avgPrice;
      pos.currentValue = pos.shares * pos.curPrice;
      allPositions.push(pos);
      if (currentPortfolio) currentPortfolio.positions.push(pos);
      continue;
    }

    // Match targeted position format: - **TICKER** (Name) en 'Portfolio': X uds | Precio Medio: $A | Actual: $B | Hoy: +C% | Retorno: +D%
    const targetMatch = line.match(
      /^-\s*\*\*([A-Z0-9.-]+)\*\*\s*\((.+?)\)\s*en\s*'(.+?)':\s*([\d.]+)\s*uds\s*\|\s*Precio Medio:\s*\$([\d.]+)\s*\|\s*Actual:\s*\$([\d.]+)\s*\|\s*Hoy:\s*([+-]?[\d.]+)%\s*\|\s*Retorno:\s*([+-]?[\d.]+)%/i,
    );
    if (targetMatch) {
      const pos = {
        ticker: targetMatch[1],
        name: targetMatch[2],
        portfolioName: targetMatch[3],
        shares: Number(targetMatch[4]) || 0,
        avgPrice: Number(targetMatch[5]) || 0,
        curPrice: Number(targetMatch[6]) || 0,
        chg1d: Number(targetMatch[7]) || 0,
        retPct: Number(targetMatch[8]) || 0,
      };
      pos.invested = pos.shares * pos.avgPrice;
      pos.currentValue = pos.shares * pos.curPrice;
      allPositions.push(pos);
      continue;
    }

    // Match quantitative strategy line: - Name: Capital $X ...
    if (line.startsWith("- ") && line.includes("Capital $") && line.includes("Benchmark:")) {
      strategies.push(line.replace(/^-\s*/, ""));
    } else if (line.startsWith("* Último Rebalanceo:") && strategies.length > 0) {
      strategies[strategies.length - 1] += `\n  ${line}`;
    }
  }

  // Filter positions if user asks about a specific strategy/region (e.g. China)
  const isChinaQuery =
    qLower.includes("china") ||
    qLower.includes("asi") ||
    qLower.includes("cnya") ||
    qLower.includes("kweb") ||
    qLower.includes("3cp") ||
    qLower.includes("nnnd");

  const chinaTickersSet = new Set([
    "CNYA.L",
    "CNYA",
    "KWEB.L",
    "KWEB",
    "3CP.F",
    "NNND.F",
    "BABA",
    "JD",
    "PDD",
    "TCEHY",
    "BYDDY",
    "NIO",
    "FXI",
    "MCHI",
    "EMIM.L",
  ]);

  let focusPositions = allPositions;
  let focusTitle = "Todas tus posiciones activas en Renta Variable";

  if (isChinaQuery) {
    const byPortOrTicker = allPositions.filter(
      (p) =>
        p.portfolioName.toLowerCase().includes("china") ||
        chinaTickersSet.has(p.ticker.toUpperCase()),
    );
    if (byPortOrTicker.length > 0) {
      focusPositions = byPortOrTicker;
      focusTitle = `Posiciones de tu Estrategia / Portafolio China (${byPortOrTicker.length} activos)`;
    }
  } else {
    // Check if user mentioned a specific portfolio name
    const matchedPort = portfolios.find((p) => qLower.includes(p.name.toLowerCase()));
    if (matchedPort && matchedPort.positions.length > 0) {
      focusPositions = matchedPort.positions;
      focusTitle = `Portafolio '${matchedPort.name}' (${matchedPort.positions.length} activos)`;
    }
  }

  const out = [
    "⚡ **Análisis Cuantitativo Kpital (Modo Respaldo Activo — Cuota Google Gemini 429/503 Saturada)**",
    "",
  ];

  if (focusPositions.length > 0) {
    const sortedByReturn = [...focusPositions].sort((a, b) => b.retPct - a.retPct);
    const sortedByValue = [...focusPositions].sort((a, b) => b.currentValue - a.currentValue);
    const totalInv = focusPositions.reduce((s, p) => s + p.invested, 0);
    const totalCur = focusPositions.reduce((s, p) => s + p.currentValue, 0);
    const totalRetPct = totalInv > 0 ? ((totalCur - totalInv) / totalInv) * 100 : 0;

    out.push(`### 📊 1. Diagnóstico de ${focusTitle}`);
    out.push(
      `- **Capital Invertido:** $${totalInv.toFixed(2)} USD | **Valor Actual:** $${totalCur.toFixed(2)} USD (**${totalRetPct >= 0 ? "+" : ""}${totalRetPct.toFixed(2)}%**)`,
    );
    out.push("");
    out.push("**Desglose por activo (ordenado por rendimiento acumulado):**");
    for (const p of sortedByReturn) {
      const weight = totalCur > 0 ? (p.currentValue / totalCur) * 100 : 0;
      const badge = p.retPct >= 5 ? "🟢 Líder" : p.retPct >= 0 ? "🔵 Positivo" : "🟠 En descuento / DCA";
      out.push(
        `- **${p.ticker}** (*${p.portfolioName}*): ${p.shares.toFixed(4)} uds | Costo medio **$${p.avgPrice.toFixed(2)}** ➔ Actual **$${p.curPrice.toFixed(4)}** | Retorno: **${p.retPct >= 0 ? "+" : ""}${p.retPct.toFixed(2)}%** (Hoy: ${p.chg1d >= 0 ? "+" : ""}${p.chg1d.toFixed(2)}%) | Peso en estrategia: **${weight.toFixed(1)}%** [${badge}]`,
      );
    }

    const bestMomentum = sortedByReturn[0];
    const bestValueDca = [...focusPositions].sort((a, b) => a.retPct - b.retPct)[0];
    const underweight = [...focusPositions].sort((a, b) => a.currentValue - b.currentValue)[0];

    out.push("");
    out.push("### 🎯 2. Recomendación Cuantitativa de Asignación (¿En cuál seguir invirtiendo?)");
    if (focusPositions.length === 1) {
      const only = focusPositions[0];
      out.push(
        `- Actualmente cuentas con **${only.ticker}** en este segmento (precio medio $${only.avgPrice.toFixed(2)}, actual $${only.curPrice.toFixed(4)}, retorno ${only.retPct >= 0 ? "+" : ""}${only.retPct.toFixed(2)}%).`,
      );
      out.push(
        `- **Acción sugerida:** Si buscas acumular exposición de forma escalonada (DCA), prioriza aportes cuando cotice cerca o por debajo de tu costo medio ($${only.avgPrice.toFixed(2)}) o complementa con un segundo ETF/activo descorrelacionado para reducir riesgo específico.`,
      );
    } else {
      out.push(
        `1. **Por Fortaleza Relativa / Momentum (${bestMomentum.ticker}):** Es el activo con mejor desempeño acumulado (**${bestMomentum.retPct >= 0 ? "+" : ""}${bestMomentum.retPct.toFixed(2)}%**, cotizando a $${bestMomentum.curPrice.toFixed(4)} vs. compra en $${bestMomentum.avgPrice.toFixed(2)}). Ideal si priorizas seguir la tendencia ganadora.`,
      );
      if (bestValueDca && bestValueDca.ticker !== bestMomentum.ticker) {
        out.push(
          `2. **Por Precio de Descuento / Promedio a la Baja - DCA (${bestValueDca.ticker}):** Registra un retorno de **${bestValueDca.retPct >= 0 ? "+" : ""}${bestValueDca.retPct.toFixed(2)}%** ($${bestValueDca.curPrice.toFixed(4)} vs. costo medio $${bestValueDca.avgPrice.toFixed(2)}). Si los fundamentales de largo plazo se mantienen intactos, aportar aquí reduce tu precio promedio de entrada de forma más eficiente.`,
        );
      }
      if (
        underweight &&
        underweight.ticker !== bestMomentum.ticker &&
        underweight.ticker !== bestValueDca?.ticker
      ) {
        const uwPct = totalCur > 0 ? (underweight.currentValue / totalCur) * 100 : 0;
        out.push(
          `3. **Por Rebalanceo de Peso (${underweight.ticker}):** Representa solo el **${uwPct.toFixed(1)}%** del bloque ($${underweight.currentValue.toFixed(2)} USD), por lo que un nuevo aporte equilibra la concentración frente a **${sortedByValue[0].ticker}**.`,
        );
      }
      out.push(
        `- **Regla práctica de ejecución:** Si deseas balancear momentum y valor, divide tu próximo aporte **60% en ${bestValueDca ? bestValueDca.ticker : bestMomentum.ticker}** (mejora de precio medio / reequilibrio) y **40% en ${bestMomentum.ticker}** (continuidad de tendencia).`,
      );
    }
  } else {
    out.push("### 📋 Resumen de tu Contexto Financiero Actual:");
    for (const l of lines.slice(0, 18)) {
      out.push(l);
    }
  }

  if (strategies.length > 0 && (qLower.includes("estrategia") || qLower.includes("propicks") || qLower.includes("titanes"))) {
    out.push("");
    out.push("### 🤖 3. Estrategias Cuantitativas Registradas");
    for (const st of strategies) {
      out.push(`- ${st}`);
    }
  }

  out.push("");
  out.push(
    "💡 *Nota técnica: La API gratuita de Google Gemini devolvió saturación temporal (503/429) en sus servidores. Puedes cambiar el proveedor a **Groq Cloud (Gratis)** u **OpenRouter** en el botón `⚙️ Configurar API / Modelo`, o usar la pestaña `📋 Generar Prompt`.*",
  );

  return out.join("\n");
}

/**
 * Sends a multi-turn economic question to the configured provider.
 */
export async function askEconomicAI({
  providerId,
  model,
  apiKey = "",
  baseUrl = "",
  contextText,
  history = [],
  question,
  scope = "all",
  useLocalProxy = false,
}) {
  const cleanQ = String(question || "").trim();
  if (!cleanQ) {
    throw new Error("Escribe una pregunta económica o financiera.");
  }

  const localHost = isRunningLocally();

  // Ollama or explicit local proxy on localhost -> prefer local FastAPI backend proxy (avoids CORS issues)
  if (localHost && (providerId === "ollama" || useLocalProxy)) {
    return await callViaLocalBackendProxy({
      providerId,
      model,
      apiKey,
      baseUrl,
      scope,
      history,
      question: cleanQ,
      contextText,
    });
  }

  const spec = buildProviderRequestSpec({
    providerId,
    model,
    apiKey,
    baseUrl,
    contextText,
    history,
    question: cleanQ,
  });

  try {
    const reply = await executeProviderFetch(spec, providerId);
    return {
      reply,
      modelUsed: spec.modelUsed,
      providerId,
      viaProxy: false,
      fallbackUsed: false,
    };
  } catch (err) {
    // Auto-heal deprecated (404), overloaded (503), rate-limited (429) or capability-rejected (400) Gemini models
    const retryableGemini =
      providerId === "gemini" &&
      apiKey.trim() &&
      (err?.httpStatus === 404 ||
        err?.httpStatus === 503 ||
        err?.httpStatus === 429 ||
        err?.httpStatus === 500 ||
        err?.httpStatus === 400);

    if (retryableGemini) {
      const catalog = await fetchAvailableProviderModels({ providerId: "gemini", apiKey });
      const tried = new Set([String(spec.modelUsed || "").toLowerCase()]);
      let lastErr = err;

      // Try up to 8 diverse models across Gemini 2.5, 1.5, Flash-Latest and Gemma 3 quota buckets
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const fallbackModel = pickBestGeminiFallbackModel(catalog.models, [...tried]);
        if (!fallbackModel) break;
        tried.add(fallbackModel.toLowerCase());

        if (lastErr?.httpStatus === 429 || lastErr?.httpStatus === 503) {
          await sleepMs(300 * Math.min(attempt + 1, 3));
        }

        try {
          const retrySpec = buildProviderRequestSpec({
            providerId,
            model: fallbackModel,
            apiKey,
            baseUrl,
            contextText,
            history,
            question: cleanQ,
          });
          const retryReply = await executeProviderFetch(retrySpec, providerId);
          return {
            reply: retryReply,
            modelUsed: retrySpec.modelUsed,
            providerId,
            viaProxy: false,
            fallbackUsed: true,
            availableModels: catalog.models,
          };
        } catch (retryErr) {
          lastErr = retryErr;
          if (
            retryErr?.httpStatus !== 404 &&
            retryErr?.httpStatus !== 503 &&
            retryErr?.httpStatus !== 429 &&
            retryErr?.httpStatus !== 500 &&
            retryErr?.httpStatus !== 400
          ) {
            break;
          }
        }
      }

      // Check if user has another provider key configured (e.g., Groq, OpenRouter, OpenAI, DeepSeek)
      try {
        const savedCfg = loadAIConfig();
        const altProviders = ["groq", "openrouter", "openai", "deepseek", "anthropic"];
        for (const altId of altProviders) {
          const altKey = String(savedCfg?.apiKeysByProvider?.[altId] || "").trim();
          if (!altKey) continue;
          const altModel =
            savedCfg?.modelsByProvider?.[altId] || AI_PROVIDERS[altId]?.defaultModel || "";
          const altSpec = buildProviderRequestSpec({
            providerId: altId,
            model: altModel,
            apiKey: altKey,
            baseUrl: savedCfg?.baseUrlsByProvider?.[altId] || AI_PROVIDERS[altId]?.baseUrl || "",
            contextText,
            history,
            question: cleanQ,
          });
          const altReply = await executeProviderFetch(altSpec, altId);
          return {
            reply: altReply,
            modelUsed: `${AI_PROVIDERS[altId]?.name || altId} (${altSpec.modelUsed})`,
            providerId: altId,
            viaProxy: false,
            fallbackUsed: true,
            availableModels: catalog.models,
          };
        }
      } catch {
        // Proceed to local quantitative fallback
      }

      // If running on localhost, try local backend proxy / Ollama before falling back to deterministic engine
      if (localHost) {
        try {
          return await callViaLocalBackendProxy({
            providerId,
            model,
            apiKey,
            baseUrl,
            scope,
            history,
            question: cleanQ,
            contextText,
          });
        } catch {
          // Proceed to local quantitative fallback
        }
      }

      // Never leave the user blocked by Google Free Tier 429/503: synthesize quantitative response from their real contextText
      if (
        !cleanQ.toLowerCase().includes("ok conectado") &&
        (lastErr?.httpStatus === 429 || lastErr?.httpStatus === 503)
      ) {
        return {
          reply: buildLocalQuantitativeFallbackReply(cleanQ, contextText),
          modelUsed: "Motor Cuantitativo Kpital (Respaldo Local Anti-429/503)",
          providerId,
          viaProxy: false,
          fallbackUsed: false,
          availableModels: catalog.models,
        };
      }

      throw lastErr;
    }

    // For non-Gemini providers hitting 429/503, also provide quantitative fallback on real questions
    if (
      (err?.httpStatus === 429 || err?.httpStatus === 503) &&
      !cleanQ.toLowerCase().includes("ok conectado")
    ) {
      return {
        reply: buildLocalQuantitativeFallbackReply(cleanQ, contextText),
        modelUsed: "Motor Cuantitativo Kpital (Respaldo Local Anti-429/503)",
        providerId,
        viaProxy: false,
        fallbackUsed: false,
      };
    }

    // Network / CORS / Mixed-content error handling
    const msg = String(err?.message || err);
    const isNetworkOrCors =
      err?.name === "TypeError" ||
      msg.toLowerCase().includes("failed to fetch") ||
      msg.toLowerCase().includes("networkerror");

    if (isNetworkOrCors && localHost && providerId !== "prompt_only") {
      // Seamless automatic fallback through local FastAPI proxy on localhost!
      return await callViaLocalBackendProxy({
        providerId,
        model,
        apiKey,
        baseUrl,
        scope,
        history,
        question: cleanQ,
        contextText,
      });
    }

    if (isNetworkOrCors) {
      if (providerId === "ollama") {
        throw new Error(
          'No se pudo conectar con Ollama desde el navegador (bloqueo HTTPS/CORS). Ejecuta Kpital localmente o configura OLLAMA_ORIGINS="*". También puedes usar Gemini, Groq u OpenRouter directo desde https://zhent.homes.',
        );
      }
      throw new Error(
        `Bloqueo de red o CORS al conectar con '${AI_PROVIDERS[providerId]?.name || providerId}'. En https://zhent.homes usa proveedores con soporte directo en navegador (Google Gemini, Groq, OpenRouter, OpenAI o Claude), o ejecuta Kpital en local.`,
      );
    }

    throw err;
  }
}
