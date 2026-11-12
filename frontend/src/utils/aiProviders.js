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
    defaultModel: "gemini-flash-latest",
    suggestedModels: [
      "gemini-flash-latest",
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
    ],
    keyPlaceholder: "AIzaSy...",
    helpUrl: "https://aistudio.google.com/apikey",
    helpText:
      "Obtén tu API key gratis en Google AI Studio. Funciona directo desde https://zhent.homes.",
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
  return `Error HTTP ${status} de ${providerId || "la IA"}${cleanDetail ? `: ${cleanDetail}` : ""}`;
}

function scoreGeminiModel(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (!id.startsWith("gemini-")) return -1;
  if (id === "gemini-flash-latest") return 10000;
  if (id === "gemini-pro-latest") return 6500;

  let score = 1000;
  const verMatch = id.match(/^gemini-(\d+(?:\.\d+)?)/);
  if (verMatch) {
    score += Number(verMatch[1]) * 500;
  }
  if (id.includes("flash") && !id.includes("lite")) score += 400;
  else if (id.includes("flash-lite")) score += 250;
  else if (id.includes("pro")) score += 150;

  if (id.includes("preview") || id.includes("exp")) score -= 60;
  // Penalize legacy deprecated 1.x / 2.x IDs when newer versions exist
  if (/^gemini-(1\.|2\.0|2\.5-flash$)/.test(id)) score -= 800;
  return score;
}

/**
 * Picks the strongest available Gemini text/chat model from a `v1beta/models` list.
 */
export function pickBestGeminiFallbackModel(modelsList = [], excludeModels = []) {
  const excluded = new Set(excludeModels.map((m) => String(m || "").toLowerCase()));
  const candidates = (modelsList || [])
    .map((m) =>
      String(m || "")
        .replace(/^models\//i, "")
        .trim(),
    )
    .filter((m) => m && !excluded.has(m.toLowerCase()));

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
            name?.startsWith("gemini-") &&
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
    const contents = messages.slice(1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const cleanModel = (resolvedModel || "gemini-flash-latest").replace(/^models\//i, "");
    const safeModel = encodeURIComponent(cleanModel);
    const safeKey = encodeURIComponent(apiKey.trim());
    return {
      kind: "gemini",
      url: `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${safeKey}`,
      headers: { "Content-Type": "application/json" },
      body: {
        systemInstruction: { parts: [{ text: systemMsg }] },
        contents,
        generationConfig: { temperature: 0.35, maxOutputTokens: 2048 },
      },
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
    // Auto-heal deprecated/404 Gemini models (e.g. legacy cached `gemini-2.5-flash`) via live `v1beta/models`
    if (providerId === "gemini" && err?.httpStatus === 404 && apiKey.trim()) {
      const catalog = await fetchAvailableProviderModels({ providerId: "gemini", apiKey });
      const fallbackModel = pickBestGeminiFallbackModel(catalog.models, [spec.modelUsed]);
      if (fallbackModel) {
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
      }
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
