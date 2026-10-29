import { useState } from "react";
import toast from "react-hot-toast";
import { generateWarrenPromptApi } from "../api/client";

export default function WarrenAIModal({ isOpen, onClose }) {
  const [focus, setFocus] = useState("análisis integral de fundamentales (Fair Value, Health Score), movimientos bruscos y rebalanceo");
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState("qwen2.5-coder:14b");
  const [useOllama, setUseOllama] = useState(true);
  const [loading, setLoading] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await generateWarrenPromptApi({
        focus,
        userQuestion: question.trim() || undefined,
        useOllama,
        model,
      });
      if (res && res.prompt_for_warren) {
        setGeneratedPrompt(res.prompt_for_warren);
        toast.success("¡Prompt generado con éxito!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error al generar el prompt. Verifica que el backend esté activo.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedPrompt) return;
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    toast.success("¡Copiado al portapapeles! Pégalo en WarrenAI (Investing.com)");
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        className="card fade-up"
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.8rem" }}>🤖</span>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)" }}>
                Conector WarrenAI (Investing.com ProPicks)
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Sintetiza todas tus inversiones (Kpital, Compras y Renta Fija) con Ollama para consultar en WarrenAI
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid var(--border)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Info Banner */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(0, 229, 255, 0.06)",
            border: "1px solid rgba(0, 229, 255, 0.2)",
            fontSize: "0.78rem",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
            marginBottom: 18,
          }}
        >
          💡 <strong>¿Cómo funciona?</strong> Este módulo lee tus 5 portafolios de compras, tus lotes, acciones activas,
          estrategias Kpital y saldos de renta fija. Ollama estructura la información con los criterios cuantitativos
          nativos de InvestingPro (Fair Value, ProTips y Health Score). Luego solo haces <strong>Ctrl + V</strong> en el chat
          de WarrenAI de Investing.com para recibir un diagnóstico profesional.
        </div>

        {/* Inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
              Enfoque del Análisis:
            </label>
            <input
              type="text"
              className="input"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Ej: Análisis de saltos bruscos recientes, toma de ganancias y rebalanceo"
              style={{ width: "100%", fontSize: "0.85rem" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
              Pregunta Específica (Opcional):
            </label>
            <textarea
              className="input"
              rows={5}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ej: ¿Qué opinas de ACN y NVDA tras los movimientos recientes? ¿Debo aumentar liquidez o comprar más?"
              style={{
                width: "100%",
                fontSize: "0.95rem",
                lineHeight: "1.5",
                minHeight: "120px",
                padding: "12px",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                Modelo Local (Ollama):
              </label>
              <select
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ width: "100%", fontSize: "0.82rem" }}
              >
                <option value="qwen2.5-coder:14b">qwen2.5-coder:14b (Recomendado)</option>
                <option value="deepseek-r1:14b">deepseek-r1:14b (Razonamiento Profundo)</option>
                <option value="llama3.1:8b">llama3.1:8b (Rápido)</option>
                <option value="gemma4:26b">gemma4:26b</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
              <input
                type="checkbox"
                id="useOllamaCheck"
                checked={useOllama}
                onChange={(e) => setUseOllama(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--accent-primary)", cursor: "pointer" }}
              />
              <label htmlFor="useOllamaCheck" style={{ fontSize: "0.8rem", color: "var(--text-secondary)", cursor: "pointer" }}>
                Usar Ollama local (desmarcar para plantilla directa instantánea)
              </label>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={loading}
            style={{
              padding: "10px 20px",
              fontSize: "0.88rem",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                <span>Ollama procesando portafolio...</span>
              </>
            ) : (
              <>
                <span>⚡ Generar Prompt Especializado</span>
              </>
            )}
          </button>

          {generatedPrompt && (
            <button
              type="button"
              onClick={handleCopy}
              style={{
                padding: "10px 18px",
                borderRadius: "8px",
                background: copied ? "#10b981" : "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                color: copied ? "#fff" : "#34d399",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{copied ? "✓ Copiado" : "📋 Copiar para WarrenAI"}</span>
            </button>
          )}
        </div>

        {/* Generated Text Area */}
        {generatedPrompt && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)" }}>
                PROMPT GENERADO (LISTO PARA PEGAR):
              </span>
              <a
                href="https://es.investing.com/pro"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "0.75rem", color: "var(--accent-primary)", textDecoration: "none" }}
              >
                Abrir InvestingPro / WarrenAI ↗
              </a>
            </div>
            <textarea
              readOnly
              value={generatedPrompt}
              rows={12}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                background: "rgba(0, 0, 0, 0.4)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.8rem",
                lineHeight: 1.5,
                resize: "vertical",
              }}
            />
          </div>
        )}

        {/* CLI Hint */}
        <div
          style={{
            marginTop: 18,
            padding: "10px 14px",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: 8,
            border: "1px dashed var(--border)",
            fontSize: "0.72rem",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            💻 <strong>También disponible por CLI en consola:</strong> Ejecuta <code>python warren-cli.py --copy</code>
          </span>
        </div>
      </div>
    </div>
  );
}
