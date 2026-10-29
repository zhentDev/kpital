---
trigger: always_on
---

# Local LLM Routing Rules (LM Studio & Ollama)

You have access to a local MCP tool `query_local_model` (and `query_lm_studio`) that routes requests to either LM Studio or Ollama automatically.

## Available Aliases:
- `gemma`: Fast general tasks & summaries (LM Studio)
- `bonsai`: Deep reasoning and thinking (LM Studio)
- `coder` or `qwen`: Python / Code generation & refactoring (Ollama Qwen 2.5 Coder 14B)
- `deepseek-coder`: Advanced coding & architecture (Ollama DeepSeek Coder V2 16B)
- `r1` or `deepseek`: Mathematical and complex logical reasoning (Ollama DeepSeek R1 14B)
- `llama`: Versatile instructions and conversations (Ollama Llama 3.1 8B)

## Usage Instructions:
- When asked to use a local model, select the best model for the task using its alias.
- For coding tasks, default to `coder` (Qwen Coder 14B).
- For deep reasoning or step-by-step math/logic, use `r1` or `bonsai`.
- For quick text or general explanations, use `gemma` or `llama`.