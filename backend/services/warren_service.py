"""
WarrenAI Prompt Generator & Analysis Service.
Gathers cross-portfolio investment data (Titanes, Purchases, Fixed Income, Cash Flow),
uses Ollama to synthesize a specialized, high-context prompt tailored for WarrenAI (Investing.com ProPicks),
and provides copy-to-clipboard or direct CLI interaction.
"""

import json
import logging
import os
import urllib.request
from typing import Any, Dict, List, Optional
from datetime import datetime

from services.db import get_connection
from services.market_data import get_live_quotes

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
DEFAULT_OLLAMA_MODEL = os.getenv("WARREN_OLLAMA_MODEL", "qwen2.5-coder:14b")


def query_ollama(prompt: str, system: Optional[str] = None, model: str = DEFAULT_OLLAMA_MODEL) -> str:
    """Send request to local Ollama instance."""
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.4,
            "num_predict": 1500,
        }
    }
    if system:
        payload["system"] = system

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("response", "").strip()
    except Exception as e:
        logger.error(f"[WARREN_AI] Ollama query failed: {e}")
        return ""


def get_all_investments_summary(user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts all investment categories registered in the platform:
    1. Purchases portfolios and lots (active stocks, shares, cost basis, return)
    2. Titanes & Custom Strategies (current active allocations, slots)
    3. Fixed income accounts & CDTs
    """
    effective_user_id = user_id or "usr_9487dd2209d2"
    result: Dict[str, Any] = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "purchases_portfolios": [],
        "titanes_holdings": [],
        "custom_strategies": [],
        "fixed_income_summary": {},
    }

    with get_connection() as con:
        # 1. Individual Purchases Portfolios
        try:
            portfolios = con.execute(
                "SELECT id, name, asset_currency FROM purchase_portfolios WHERE user_id = ? OR user_id IS NULL",
                [effective_user_id]
            ).fetchall()

            lots = con.execute(
                "SELECT portfolio_id, ticker, purchase_price, shares, date FROM individual_purchases WHERE user_id = ? OR user_id IS NULL",
                [effective_user_id]
            ).fetchall()

            # Group lots by portfolio
            p_map: Dict[str, Dict[str, Any]] = {}
            all_tickers = set()
            for p in portfolios:
                p_map[p[0]] = {
                    "id": p[0],
                    "name": p[1],
                    "currency": p[2] or "USD",
                    "lots": [],
                }

            for lot in lots:
                pid, ticker, price, shares, pdate = lot
                all_tickers.add(ticker.upper())
                if pid in p_map:
                    p_map[pid]["lots"].append({
                        "ticker": ticker.upper(),
                        "shares": shares,
                        "buy_price": price,
                        "date": str(pdate),
                        "cost": round(shares * price, 2)
                    })

            # Fetch live quotes for US/liquid tickers if desired, else use buy_price as current_price baseline
            live_quotes = {}
            # Quick check for prices already in cache or fast info without blocking
            if all_tickers:
                try:
                    # Only attempt live quote for non-exotic tickers or already cached
                    us_tickers = [t for t in all_tickers if not t.endswith(".L") and not t.endswith(".F")]
                    if us_tickers:
                        q_list = get_live_quotes(us_tickers)
                        for q in q_list:
                            if q.get("ticker"):
                                live_quotes[q["ticker"].upper()] = q
                except Exception as q_err:
                    logger.warning(f"Live quotes fetch in warren service: {q_err}")

            # Calculate aggregated portfolio values
            summary_portfolios = []
            for p in p_map.values():
                total_invested = 0.0
                total_current = 0.0
                ticker_summary = {}

                for l in p["lots"]:
                    t = l["ticker"]
                    cur_p = live_quotes.get(t, {}).get("price") or l["buy_price"]
                    chg_pct_1d = live_quotes.get(t, {}).get("change_pct", 0.0)
                    cost = l["cost"]
                    cur_val = l["shares"] * cur_p

                    total_invested += cost
                    total_current += cur_val

                    if t not in ticker_summary:
                        ticker_summary[t] = {
                            "ticker": t,
                            "shares": 0.0,
                            "total_cost": 0.0,
                            "current_price": cur_p,
                            "change_pct_1d": chg_pct_1d,
                        }
                    ticker_summary[t]["shares"] += l["shares"]
                    ticker_summary[t]["total_cost"] += cost

                for t, info in ticker_summary.items():
                    avg_p = info["total_cost"] / info["shares"] if info["shares"] > 0 else 0
                    info["avg_price"] = round(avg_p, 2)
                    info["shares"] = round(info["shares"], 4)
                    info["current_value"] = round(info["shares"] * info["current_price"], 2)
                    ret_usd = info["current_value"] - info["total_cost"]
                    info["return_pct"] = round((ret_usd / info["total_cost"] * 100), 2) if info["total_cost"] > 0 else 0.0

                summary_portfolios.append({
                    "id": p["id"],
                    "name": p["name"],
                    "currency": p["currency"],
                    "total_invested": round(total_invested, 2),
                    "total_current_value": round(total_current, 2),
                    "total_return_pct": round(((total_current - total_invested) / total_invested * 100), 2) if total_invested > 0 else 0.0,
                    "positions": list(ticker_summary.values()),
                })

            result["purchases_portfolios"] = summary_portfolios
        except Exception as e:
            logger.error(f"[WARREN_AI] Error reading purchases: {e}")

        # 2. Rebalance Titanes & Custom Strategies
        try:
            strats = con.execute(
                "SELECT id, name, capital, num_slots, benchmark, is_real_money FROM custom_strategies WHERE user_id = ? OR user_id IS NULL",
                [effective_user_id]
            ).fetchall()
            for s in strats:
                result["custom_strategies"].append({
                    "id": s[0],
                    "name": s[1],
                    "capital": s[2],
                    "slots": s[3],
                    "benchmark": s[4],
                    "is_real_money": bool(s[5]),
                })
        except Exception:
            pass

    # 3. Fixed income summary directly from Supabase PostgreSQL
    try:
        from services.db import get_user_fixed_income_db
        fi_data = get_user_fixed_income_db(effective_user_id)
        cdts = fi_data.get("cdts", [])
        accounts = fi_data.get("accounts", [])
        total_cdt = sum(float(c.get("capital") or c.get("initialAmount") or 0) for c in cdts)
        total_savings = sum(float(a.get("balance") or 0) for a in accounts)
        result["fixed_income_summary"] = {
            "total_cdts_capital": total_cdt,
            "num_cdts": len(cdts),
            "total_savings_accounts": total_savings,
            "num_accounts": len(accounts),
        }
    except Exception:
        pass

    return result


def filter_relevant_context(data: Dict[str, Any], user_question: Optional[str] = None, focus: Optional[str] = None) -> tuple[str, list]:
    """
    Intelligently inspects the question and focus to filter ONLY relevant assets and portfolios.
    If the question mentions 'Platinum' or 'IPLT', only IPLT and related assets (e.g. materials/metals) are extracted.
    If the question is broad or unspecific, provides the full executive summary.
    """
    text_query = f"{user_question or ''} {focus or ''}".lower()
    
    # Extract mentioned tickers from all portfolio positions
    all_positions = []
    for p in data.get("purchases_portfolios", []):
        for pos in p.get("positions", []):
            pos_copy = dict(pos)
            pos_copy["portfolio_name"] = p["name"]
            pos_copy["currency"] = p["currency"]
            all_positions.append(pos_copy)

    # Keyword synonyms / common assets
    KEYWORD_TICKER_MAP = {
        "platinum": ["IPLT.L", "IPLT"],
        "platino": ["IPLT.L", "IPLT"],
        "oro": ["PAXG-USD", "GDX.L", "GDX"],
        "gold": ["PAXG-USD", "GDX.L", "GDX"],
        "nvidia": ["NVDA"],
        "semiconductor": ["NVDA", "SMH", "SMH.L"],
        "semiconductores": ["NVDA", "SMH", "SMH.L"],
        "spacex": ["SPCX"],
        "espacio": ["SPCX"],
        "china": ["CNYA.L", "KWEB.L", "3CP.F", "NNND.F", "EMIM.L"],
        "crypto": ["PAXG-USD"],
        "cripto": ["PAXG-USD"],
        "nasdaq": ["CNDX.L"],
        "s&p": ["CSPX.L"],
        "sp500": ["CSPX.L"],
    }

    matched_tickers = set()

    # 1. Match direct ticker codes (case-insensitive words)
    words = [w.strip(".,;:?!()[]'\"").upper() for w in text_query.split()]
    for p in all_positions:
        ticker = p["ticker"].upper()
        ticker_base = ticker.split(".")[0].split("-")[0]
        if ticker in words or ticker_base in words:
            matched_tickers.add(ticker)

    # 2. Match synonyms
    for kw, t_list in KEYWORD_TICKER_MAP.items():
        if kw in text_query:
            for t in t_list:
                for p in all_positions:
                    if p["ticker"].upper() == t or p["ticker"].upper().startswith(t):
                        matched_tickers.add(p["ticker"].upper())

    # If specific tickers are targeted by user question
    if matched_tickers:
        lines = []
        target_positions = [p for p in all_positions if p["ticker"].upper() in matched_tickers]
        lines.append(f"### ACTIVO(S) ESPECÍFICO(S) BAJO CONSULTA ({len(target_positions)} posición/es):")
        for pos in target_positions:
            lines.append(
                f"- **{pos['ticker']}** ({pos.get('name', pos['ticker'])}) en portafolio '{pos['portfolio_name']}':\n"
                f"  * Cantidad: {pos['shares']} unidades | Moneda: {pos['currency']}\n"
                f"  * Precio Medio de Compra: ${pos['avg_price']}\n"
                f"  * Precio Actual de Mercado: ${pos['current_price']}\n"
                f"  * Variación Hoy (24h): {pos.get('change_pct_1d', 0)}%\n"
                f"  * Retorno Total Acumulado: {pos['return_pct']}%\n"
                f"  * Capital Invertido: ${pos['total_cost']} | Valor Actual: ${pos['current_value']}"
            )
        lines.append("")

        # Contextual benchmarks or complementary portfolios only if relevant
        is_metal = any(t in matched_tickers for t in ["IPLT.L", "PAXG-USD", "GDX.L"])
        if is_metal:
            lines.append("### CONTEXTO DE MATERIAS PRIMAS / METALES EN CARTERA:")
            metal_positions = [p for p in all_positions if p["ticker"].upper() in ["PAXG-USD", "GDX.L", "IPLT.L"] and p["ticker"].upper() not in matched_tickers]
            for m in metal_positions:
                lines.append(f"- {m['ticker']} ({m['portfolio_name']}): Retorno {m['return_pct']}%, Precio Actual ${m['current_price']}")
            lines.append("")

        return "\n".join(lines), list(matched_tickers)

    # Broad query: Full structured context
    return build_raw_context_text(data), []


def build_raw_context_text(data: Dict[str, Any]) -> str:
    """Builds a concise markdown context of the investor's whole portfolio."""
    lines = []
    lines.append(f"### FECHA Y HORA: {data.get('date')}")
    lines.append("")
    lines.append("### 1. PORTAFOLIOS DE COMPRAS REALES:")
    for p in data.get("purchases_portfolios", []):
        lines.append(f"**Portafolio: {p['name']}** (Moneda: {p['currency']})")
        lines.append(f"- Capital Invertido: ${p['total_invested']} | Valor Actual: ${p['total_current_value']} | Rendimiento: {p['total_return_pct']}%")
        lines.append("  Posiciones:")
        for pos in p.get("positions", []):
            lines.append(
                f"  * {pos['ticker']}: {pos['shares']} acciones @ Precio Medio ${pos['avg_price']} | "
                f"Precio Actual: ${pos['current_price']} | Hoy (24h): {pos.get('change_pct_1d', 0)}% | Retorno Total: {pos['return_pct']}%"
            )
        lines.append("")

    if data.get("custom_strategies"):
        lines.append("### 2. ESTRATEGIAS CUANTITATIVAS (PROPICKS / TITANES):")
        for s in data["custom_strategies"]:
            lines.append(f"- {s['name']}: Capital ${s['capital']} ({s['slots']} slots) | Benchmark: {s['benchmark']} | Dinero Real: {'Sí' if s['is_real_money'] else 'Simulado'}")
        lines.append("")

    fi = data.get("fixed_income_summary", {})
    if fi:
        lines.append("### 3. RENTA FIJA Y LIQUIDEZ (COLOMBIA / CDTs):")
        lines.append(f"- En CDTs a Plazo Fijo: ${fi.get('total_cdts_capital', 0):,.0f} COP ({fi.get('num_cdts', 0)} depósitos)")
        lines.append(f"- En Cuentas de Ahorro de Alto Rendimiento: ${fi.get('total_savings_accounts', 0):,.0f} COP ({fi.get('num_accounts', 0)} cuentas)")

    return "\n".join(lines)


def generate_warren_prompt(
    focus: Optional[str] = None,
    user_question: Optional[str] = None,
    user_id: Optional[str] = None,
    use_ollama: bool = True,
    ollama_model: str = DEFAULT_OLLAMA_MODEL,
) -> Dict[str, Any]:
    """
    Intelligently discriminates the portfolio information to generate a focused,
    surgical prompt for WarrenAI without dumping unrelated noise.
    """
    portfolio_data = get_all_investments_summary(user_id=user_id)
    discriminative_context, matched_tickers = filter_relevant_context(
        portfolio_data, user_question=user_question, focus=focus
    )

    is_targeted = len(matched_tickers) > 0

    if not use_ollama:
        if is_targeted:
            prompt = (
                f"Hola WarrenAI. Como analista cuantitativo de InvestingPro y ProPicks AI, requiero un análisis específico y técnico "
                f"sobre la(s) siguiente(s) posición(es) de mi portafolio:\n\n"
                f"{discriminative_context}\n\n"
            )
            if user_question:
                prompt += f"**Mi consulta puntual:**\n{user_question}\n\n"
            prompt += (
                "Por favor analiza:\n"
                "1. Valor Razonable (Fair Value de InvestingPro) y margen de seguridad o sobrevaloración.\n"
                "2. Tendencia técnica, soportes, resistencias clave y zonas óptimas de salida/mitigación.\n"
                "3. Catalizadores de mercado fundamentales (oferta/demanda global) y proyección temporal estimada de recuperación."
            )
        else:
            prompt = (
                "Hola WarrenAI. Eres el analista cuantitativo de Investing.com y ProPicks AI. "
                "A continuación te presento un resumen consolidado de mis inversiones actuales:\n\n"
                f"{discriminative_context}\n\n"
            )
            if user_question:
                prompt += f"**Consulta del inversor:**\n{user_question}\n\n"
            prompt += "Por favor realiza un diagnóstico de rebalanceo, Fair Value de posiciones clave y recomendaciones tácticas."

        return {
            "status": "success",
            "model_used": "smart_filter_fallback",
            "prompt_for_warren": prompt,
            "raw_context": discriminative_context,
            "portfolio_summary": portfolio_data,
            "matched_tickers": matched_tickers,
        }

    # System instruction for Ollama: be discriminating, surgical and include the exact figures
    system_prompt = (
        "Eres un arquitecto de prompts financiero. Tu misión es redactar un prompt QUIRÚRGICO, "
        "conciso y altamente específico en ESPAÑOL que el usuario copiará y pegará en el chat de 'WarrenAI' (la IA de Investing.com y ProPicks). "
        "REGLAS CRÍTICAS DE DISCRIMINACIÓN:\n"
        "1. Si el usuario pregunta por un activo o sector específico (ej. Platino, IPLT, NVDA, etc.), "
        "ELIMINA COMPLETAMENTE toda información que no tenga nada que ver (cuentas bancarias, CDTs en Colombia, acciones no relacionadas). "
        "2. Incluye OBLIGATORIAMENTE en el texto del prompt los datos numéricos exactos del activo consultado que están en los datos: "
        "Ticker, precio medio de compra, precio actual de mercado y el porcentaje de pérdida/ganancia acumulada, para que WarrenAI tenga la base matemática real. "
        "3. Incorpora textualmente la duda del inversor (por ejemplo, si desea saber cuándo vender para minimizar pérdidas o proyecciones de recuperación). "
        "4. Pídele a WarrenAI que aplique sus herramientas nativas de InvestingPro (Fair Value, ProTips, soportes/resistencias y catalizadores). "
        "5. Devuelve ÚNICAMENTE el texto final que el usuario enviará a WarrenAI, empezando con un saludo profesional a WarrenAI."
    )

    user_instructions = (
        f"Datos filtrados del portafolio:\n{discriminative_context}\n\n"
        f"Pregunta del usuario: {user_question or 'Análisis de posición'}\n"
    )
    if focus:
        user_instructions += f"Enfoque: {focus}\n"

    ollama_output = query_ollama(user_instructions, system=system_prompt, model=ollama_model)

    if not ollama_output:
        return generate_warren_prompt(focus, user_question, user_id, use_ollama=False)

    return {
        "status": "success",
        "model_used": ollama_model,
        "prompt_for_warren": ollama_output,
        "raw_context": discriminative_context,
        "portfolio_summary": portfolio_data,
        "matched_tickers": matched_tickers,
    }
