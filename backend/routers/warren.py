"""
WarrenAI Prompt Generator & Analysis Router.
Endpoints:
- POST /api/warren/prompt: Generates an optimized prompt for WarrenAI via Ollama with full platform context.
- GET /api/warren/summary: Returns raw structured investment context across all platforms.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any

from services.auth import get_optional_current_user
from services.warren_service import generate_warren_prompt, get_all_investments_summary

router = APIRouter()


class WarrenPromptRequest(BaseModel):
    focus: Optional[str] = "análisis integral de fundamentales, movimientos bruscos y rebalanceo"
    user_question: Optional[str] = None
    use_ollama: Optional[bool] = True
    model: Optional[str] = "qwen2.5-coder:14b"


@router.post("/warren/prompt")
def create_warren_prompt(req: WarrenPromptRequest, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return generate_warren_prompt(
        focus=req.focus,
        user_question=req.user_question,
        user_id=user_id,
        use_ollama=req.use_ollama,
        ollama_model=req.model or "qwen2.5-coder:14b",
    )


@router.get("/warren/summary")
def get_warren_summary(request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return get_all_investments_summary(user_id=user_id)
