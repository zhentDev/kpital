"""
Kpital — FastAPI backend entry point (100% Supabase SQL).
Run with:  uvicorn main:app --reload --port 8000
"""

import logging

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")

import os
import traceback
import warnings
from dotenv import load_dotenv

load_dotenv()

warnings.filterwarnings("ignore")
warnings.simplefilter("ignore")

import certifi

os.environ["CURL_CA_BUNDLE"] = certifi.where()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers.auth import router as auth_router
from routers.cash_flow import router as cash_flow_router
from routers.fixed_income import router as fixed_income_router
from routers.nav import router as nav_router
from routers.prices import router as prices_router
from routers.purchases import router as purchases_router
from routers.rebalance import router as rebalance_router
from routers.warren import router as warren_router
from routers.alerts import router as alerts_router
from routers.webhooks import router as webhooks_router

app = FastAPI(
    title="Kpital API",
    description="Kpital | Intelligent Wealth & Cash Flow OS (100% Supabase SQL)",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://zhent.homes",
        "https://www.zhent.homes",
        "https://zhentdev.github.io",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from services.auth import current_user_id_var, get_optional_current_user


@app.middleware("http")
async def cors_headers_middleware(request: Request, call_next):
    # Respond to preflight OPTIONS requests directly with 200 and permissive headers
    if request.method == "OPTIONS":
        return JSONResponse(
            status_code=200,
            content={"status": "ok"},
            headers={
                "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Origin, User-Agent, Cache-Control",
                "Access-Control-Allow-Credentials": "true",
            },
        )
    
    response = await call_next(request)
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, Origin, User-Agent, Cache-Control"
    return response


@app.middleware("http")
async def auth_context_middleware(request: Request, call_next):
    user = get_optional_current_user(request)
    token = current_user_id_var.set(user["sub"] if user else None)
    try:
        response = await call_next(request)
        return response
    finally:
        current_user_id_var.reset(token)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb_list = traceback.extract_tb(exc.__traceback__)
    project_frames = [
        frame
        for frame in tb_list
        if not any(
            pkg in frame.filename
            for pkg in [
                "site-packages",
                "uvicorn",
                "starlette",
                "fastapi",
                "anyio",
                "asyncio",
                "Lib",
            ]
        )
    ]

    target_frame = project_frames[-1] if project_frames else (tb_list[-1] if tb_list else None)

    file_rel = os.path.relpath(target_frame.filename) if target_frame else "unknown"
    line_no = target_frame.lineno if target_frame else 0
    code_line = target_frame.line if target_frame else ""
    func_name = target_frame.name if target_frame else ""

    error_payload = {
        "error": True,
        "error_type": type(exc).__name__,
        "message": str(exc),
        "file": file_rel.replace("\\", "/"),
        "line": line_no,
        "code": code_line,
        "function": func_name,
    }

    return JSONResponse(
        status_code=500,
        content=error_payload,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Credentials": "true",
        },
    )


app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(nav_router, prefix="/api")
app.include_router(prices_router, prefix="/api")
app.include_router(rebalance_router, prefix="/api")
app.include_router(purchases_router, prefix="/api")
app.include_router(fixed_income_router, prefix="/api/fixed-income", tags=["fixed-income"])
app.include_router(cash_flow_router, prefix="/api", tags=["cash-flow"])
app.include_router(warren_router, prefix="/api", tags=["warren"])
app.include_router(alerts_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api/webhooks", tags=["webhooks"])


@app.get("/")
def root():
    return {
        "name": "Kpital API",
        "version": "2.0.0",
        "status": "healthy",
        "docs": "/docs",
        "endpoints": [
            "/api/nav",
            "/api/prices/live",
            "/api/prices/intraday/{ticker}",
            "/api/tickers/search",
            "/api/rebalances",
            "/api/cash-flow",
            "/api/fixed-income/data",
        ],
    }


@app.get("/health")
@app.get("/api/health")
def health_check():
    """Ultra-lightweight health check endpoint for keep-alive cron jobs."""
    return {"status": "ok", "service": "kpital-backend", "always_on": True}
