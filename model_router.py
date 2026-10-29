"""Unified MCP Server Router for LM Studio and Ollama.

Connects Antigravity to local LLMs with friendly aliases,
auto-routing between LM Studio (port 1234) and Ollama (port 11434).
"""

from typing import Any
import httpx

try:
    from fastmcp import FastMCP
except ImportError:
    from mcp.server.fastmcp import FastMCP

mcp = FastMCP("model-router")

LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
LM_STUDIO_MODELS_URL = "http://localhost:1234/v1/models"
OLLAMA_URL = "http://localhost:11434/v1/chat/completions"
OLLAMA_TAGS_URL = "http://localhost:11434/api/tags"

DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant."
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 2048

# Friendly Aliases -> (Provider, Full Model Identifier)
ALIASES = {
    # LM Studio Models
    "gemma": ("lmstudio", "google/gemma-4-e4b"),
    "gemma4": ("lmstudio", "google/gemma-4-e4b"),
    "bonsai": ("lmstudio", "prism-ml/bonsai-27b"),
    "bonsai2": ("lmstudio", "prism-ml/bonsai-27b:2"),

    # Ollama Models
    "r1": ("ollama", "deepseek-r1:14b"),
    "deepseek": ("ollama", "deepseek-r1:14b"),
    "deepseek-r1": ("ollama", "deepseek-r1:14b"),
    "coder": ("ollama", "qwen2.5-coder:14b"),
    "qwen": ("ollama", "qwen2.5-coder:14b"),
    "qwen14": ("ollama", "qwen2.5-coder:14b"),
    "qwen7": ("ollama", "qwen2.5-coder:7b"),
    "qwen1.5": ("ollama", "qwen2.5-coder:1.5b"),
    "deepseek-coder": ("ollama", "deepseek-coder-v2:16b"),
    "llama": ("ollama", "llama3.1:8b"),
    "llama3": ("ollama", "llama3.1:8b"),

    # Roles / Shortcuts
    "reasoning": ("lmstudio", "prism-ml/bonsai-27b"),
    "fast": ("lmstudio", "google/gemma-4-e4b"),
}


def _resolve_model(model_name: str) -> tuple[str, str]:
    """Resolve friendly alias to (provider, model_id)."""
    clean_name = model_name.strip().lower()
    if clean_name in ALIASES:
        return ALIASES[clean_name]

    # Check if direct Ollama name or contains ollama indicator
    if clean_name.startswith("ollama:"):
        return "ollama", clean_name.replace("ollama:", "").strip()
    if clean_name.startswith("lmstudio:"):
        return "lmstudio", clean_name.replace("lmstudio:", "").strip()

    # Known Ollama patterns
    if any(k in clean_name for k in ["qwen", "deepseek-r1", "deepseek-coder", "llama3", ":14b", ":8b", ":7b"]):
        return "ollama", model_name

    # Default to LM Studio
    return "lmstudio", model_name


@mcp.tool()
def query_local_model(
    prompt: str,
    model: str = "gemma",
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> dict[str, Any]:
    """Send a prompt to local LLMs (LM Studio or Ollama) using short aliases or full model names.

    Aliases available:
      - 'gemma' (LM Studio - Fast general)
      - 'bonsai' (LM Studio - Deep Reasoning)
      - 'r1' or 'deepseek' (Ollama - DeepSeek R1 14B Reasoning)
      - 'coder' or 'qwen' (Ollama - Qwen 2.5 Coder 14B)
      - 'deepseek-coder' (Ollama - DeepSeek Coder V2 16B)
      - 'llama' or 'llama3' (Ollama - Llama 3.1 8B)
      - 'qwen7' (Ollama - Qwen 2.5 Coder 7B)

    Args:
        prompt: The user prompt or instruction to process.
        model: Friendly alias (e.g. 'gemma', 'bonsai', 'coder', 'r1', 'llama') or full model ID.
        system_prompt: Optional system instruction.
        temperature: Creativity sampling (0.0 to 1.0).
        max_tokens: Maximum response tokens to generate.

    Returns:
        Dictionary with status, model used, and response text.
    """
    provider, resolved_model = _resolve_model(model)
    target_url = OLLAMA_URL if provider == "ollama" else LM_STUDIO_URL

    payload = {
        "model": resolved_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    try:
        with httpx.Client(timeout=240.0) as client:
            response = client.post(target_url, json=payload)
            response.raise_for_status()
            data = response.json()

        content = ""
        reasoning = ""
        choices = data.get("choices", [])
        if choices:
            message = choices[0].get("message", {})
            content = message.get("content", "")
            reasoning = message.get("reasoning_content", "")

        display_reply = content if content else reasoning

        return {
            "success": True,
            "provider": provider,
            "model": resolved_model,
            "reply": display_reply,
            "thought": reasoning if content else "",
            "raw": data,
        }
    except httpx.ConnectError:
        return {
            "success": False,
            "error": f"Could not connect to {provider.upper()} at {target_url}. Is the service running?",
            "provider": provider,
            "url": target_url,
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"Error querying {provider.upper()} ({resolved_model}): {exc}",
            "provider": provider,
            "url": target_url,
        }


# Legacy tool name alias for backwards compatibility
@mcp.tool()
def query_lm_studio(
    prompt: str,
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    model: str = "gemma",
) -> dict[str, Any]:
    """Compatibility wrapper for query_local_model."""
    return query_local_model(
        prompt=prompt,
        model=model,
        system_prompt=system_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
    )


@mcp.tool()
def list_local_models() -> dict[str, Any]:
    """List all available models and their friendly aliases across LM Studio and Ollama."""
    available_lmstudio = []
    available_ollama = []

    with httpx.Client(timeout=3.0) as client:
        try:
            r = client.get(LM_STUDIO_MODELS_URL)
            if r.status_code == 200:
                available_lmstudio = [m.get("id") for m in r.json().get("data", [])]
        except Exception:
            available_lmstudio = ["Offline / Not reachable"]

        try:
            r = client.get(OLLAMA_TAGS_URL)
            if r.status_code == 200:
                available_ollama = [m.get("name") for m in r.json().get("models", [])]
        except Exception:
            available_ollama = ["Offline / Not reachable"]

    return {
        "aliases": ALIASES,
        "active_lm_studio_models": available_lmstudio,
        "active_ollama_models": available_ollama,
    }


if __name__ == "__main__":
    mcp.run()

