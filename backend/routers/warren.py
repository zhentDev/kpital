"""
WarrenAI & Multi-AI Economic Assistant Router.
Endpoints:
- POST /api/warren/prompt: Generates an optimized prompt for WarrenAI via Ollama or rule-based builder.
- GET /api/warren/summary: Returns structured investment, fixed income & cash flow context.
- GET /api/warren/ollama/models: Lists locally installed Ollama models.
- POST /api/warren/chat: Multi-turn economic Q&A via Ollama or proxied BYOK external API.
"""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services.auth import get_optional_current_user
from services.warren_service import (
    chat_with_economic_ai,
    generate_warren_prompt,
    get_all_investments_summary,
    list_ollama_models,
)

router = APIRouter()


class WarrenPromptRequest(BaseModel):
    focus: Optional[str] = "análisis integral de fundamentales, movimientos bruscos y rebalanceo"
    user_question: Optional[str] = None
    use_ollama: Optional[bool] = True
    model: Optional[str] = "qwen2.5-coder:14b"


class EconomicChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    provider: str = "ollama"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    scope: str = "all"
    history: List[Dict[str, str]] = Field(default_factory=list)
    context_override: Optional[str] = None


@router.post("/warren/prompt")
def create_warren_prompt(req: WarrenPromptRequest, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return generate_warren_prompt(
        focus=req.focus,
        user_question=req.user_question,
        user_id=user_id,
        use_ollama=bool(req.use_ollama),
        ollama_model=req.model or "qwen2.5-coder:14b",
    )


@router.get("/warren/summary")
def get_warren_summary(request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return get_all_investments_summary(user_id=user_id)


@router.get("/warren/ollama/models")
def get_ollama_models():
    return list_ollama_models()


@router.post("/warren/chat")
def post_economic_chat(req: EconomicChatRequest, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    try:
        return chat_with_economic_ai(
            question=req.question,
            user_id=user_id,
            provider=req.provider,
            model=req.model,
            api_key=req.api_key,
            base_url=req.base_url,
            scope=req.scope,
            history=req.history,
            context_override=req.context_override,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except RuntimeError as err:
        raise HTTPException(status_code=502, detail=str(err)) from err
