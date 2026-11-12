"""
WarrenAI & Multi-AI Economic Assistant Service.
Gathers cross-platform financial context (Purchases, Realized Sales, Quantitative Strategies
with active rebalances & substitutes, Fixed Income COP/USD excluding matured CDTs,
and Cash Flow / Budgets / Debts / Credit Cards), synthesizes WarrenAI prompts,
and proxies multi-turn economic Q&A for Ollama and BYOK external providers.
"""

from datetime import datetime
import json
import logging
import os
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request

from services.db import (
    OWNER_ID,
    get_all_rebalances,
    get_connection,
    get_custom_strategies,
    get_user_cash_flow_db,
    get_user_fixed_income_db,
)
from services.market_data import get_fx_data, get_live_quotes

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
DEFAULT_OLLAMA_MODEL = os.getenv("WARREN_OLLAMA_MODEL", "qwen2.5-coder:14b")

ECONOMIC_SYSTEM_PROMPT = (
    "Eres el Asistente Económico y Financiero Integral de Kpital (experto en macroeconomía, "
    "finanzas personales en Colombia COP/TRM, renta fija/CDTs, flujo de caja, deuda y renta "
    "variable/ETFs).\n"
    "REGLAS ESTRICTAS:\n"
    "1. Basa tus análisis en los datos reales del usuario incluidos en el contexto. No inventes cifras.\n"
    "2. Separa claramente COP y USD (usa la TRM del contexto cuando consolides patrimonio).\n"
    "3. Nunca incluyas CDTs marcados como vencidos/matured dentro del capital activo de renta fija.\n"
    "4. Responde en español claro, directo y accionable, usando viñetas y cifras exactas.\n"
    "5. Aclara brevemente cuando una recomendación dependa de supuestos macroeconómicos (tasas BanRep/Fed, inflación, TRM) y recuerda que no constituye asesoría financiera regulada."
)


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        num = float(value)
        return num if num == num else default
    except (TypeError, ValueError):
        return default


def _post_json(url: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None, timeout: int = 60) -> Dict[str, Any]:
    req_headers = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=req_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as http_err:
        body = ""
        try:
            body = http_err.read().decode("utf-8", errors="ignore")[:300]
        except Exception:
            pass
        raise RuntimeError(f"HTTP {http_err.code}: {body or http_err.reason}") from http_err
    except urllib.error.URLError as url_err:
        raise RuntimeError(f"Error de conexión con {url}: {url_err.reason}") from url_err


def list_ollama_models() -> Dict[str, Any]:
    """Discover locally running Ollama models from /api/tags."""
    url = f"{OLLAMA_BASE_URL}/api/tags"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = [m.get("name") for m in data.get("models", []) if m.get("name")]
            return {
                "available": True,
                "host": OLLAMA_BASE_URL,
                "models": models,
                "default_model": DEFAULT_OLLAMA_MODEL if DEFAULT_OLLAMA_MODEL in models else (models[0] if models else DEFAULT_OLLAMA_MODEL),
            }
    except Exception as err:
        return {
            "available": False,
            "host": OLLAMA_BASE_URL,
            "models": [],
            "default_model": DEFAULT_OLLAMA_MODEL,
            "error": str(err),
        }


def query_ollama(prompt: str, system: Optional[str] = None, model: str = DEFAULT_OLLAMA_MODEL) -> str:
    """Send single-turn generation request to local Ollama instance."""
    url = f"{OLLAMA_BASE_URL}/api/generate"
    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.4,
            "num_predict": 1600,
        },
    }
    if system:
        payload["system"] = system

    try:
        data = _post_json(url, payload, timeout=60)
        return str(data.get("response", "")).strip()
    except Exception as err:
        logger.error("[WARREN_AI] Ollama query failed: %s", err)
        return ""


def _resolve_fx_usd_cop() -> float:
    try:
        fx = get_fx_data("USD-COP")
        val = _safe_float(fx.get("current"), 0.0)
        if val > 500:
            return round(val, 2)
    except Exception as err:
        logger.warning("[WARREN_AI] FX USD-COP lookup fallback: %s", err)
    return 4150.0


def _collect_purchases_and_sales(con: Any, effective_user_id: str) -> Dict[str, Any]:
    portfolios = con.execute(
        "SELECT id, name, asset_currency FROM purchase_portfolios WHERE user_id = ? OR user_id IS NULL",
        [effective_user_id],
    ).fetchall()
    lots = con.execute(
        """
        SELECT portfolio_id, ticker, purchase_price, shares, date, manual_current_price, commission_amount
        FROM individual_purchases
        WHERE user_id = ? OR user_id IS NULL
        """,
        [effective_user_id],
    ).fetchall()
    sales = con.execute(
        """
        SELECT portfolio_id, ticker, sale_date, sale_price, shares, realized_pnl, sale_commission
        FROM purchase_sales
        WHERE user_id = ? OR user_id IS NULL
        ORDER BY sale_date DESC NULLS LAST
        """,
        [effective_user_id],
    ).fetchall()

    p_map: Dict[str, Dict[str, Any]] = {
        p[0]: {
            "id": p[0],
            "name": p[1],
            "currency": p[2] or "USD",
            "lots": [],
            "sales": [],
        }
        for p in portfolios
    }

    all_tickers = set()
    for pid, ticker, price, shares, pdate, manual_p, comm in lots:
        t_up = str(ticker or "").strip().upper()
        if not t_up:
            continue
        sh = _safe_float(shares)
        bp = _safe_float(price)
        fee = _safe_float(comm)
        all_tickers.add(t_up)
        if pid in p_map:
            p_map[pid]["lots"].append({
                "ticker": t_up,
                "shares": sh,
                "buy_price": bp,
                "manual_current_price": _safe_float(manual_p) if manual_p is not None else None,
                "commission": fee,
                "date": str(pdate),
                "cost": round(sh * bp + fee, 2),
            })

    for pid, ticker, sdate, sprice, shares, rpnl, scomm in sales:
        if pid in p_map:
            p_map[pid]["sales"].append({
                "ticker": str(ticker or "").upper(),
                "sale_date": str(sdate),
                "sale_price": round(_safe_float(sprice), 4),
                "shares": round(_safe_float(shares), 6),
                "realized_pnl": round(_safe_float(rpnl), 2),
                "commission": round(_safe_float(scomm), 2),
            })

    live_quotes: Dict[str, Dict[str, Any]] = {}
    if all_tickers:
        try:
            for q in get_live_quotes(sorted(all_tickers)):
                if q.get("ticker"):
                    live_quotes[q["ticker"].upper()] = q
        except Exception as q_err:
            logger.warning("[WARREN_AI] Live quotes fetch failed: %s", q_err)

    summary_portfolios: List[Dict[str, Any]] = []
    total_purchases_usd = 0.0
    for p in p_map.values():
        total_invested = 0.0
        total_current = 0.0
        ticker_summary: Dict[str, Dict[str, Any]] = {}

        for lot in p["lots"]:
            t = lot["ticker"]
            q_info = live_quotes.get(t, {})
            cur_p = _safe_float(q_info.get("price"), 0.0) or _safe_float(lot.get("manual_current_price"), 0.0) or lot["buy_price"]
            chg_pct_1d = _safe_float(q_info.get("change_pct"), 0.0)
            cost = lot["cost"]
            cur_val = lot["shares"] * cur_p

            total_invested += cost
            total_current += cur_val

            if t not in ticker_summary:
                ticker_summary[t] = {
                    "ticker": t,
                    "name": q_info.get("name") or t,
                    "shares": 0.0,
                    "total_cost": 0.0,
                    "current_price": round(cur_p, 4),
                    "change_pct_1d": round(chg_pct_1d, 2),
                }
            ticker_summary[t]["shares"] += lot["shares"]
            ticker_summary[t]["total_cost"] += cost

        for info in ticker_summary.values():
            avg_p = info["total_cost"] / info["shares"] if info["shares"] > 0 else 0.0
            info["avg_price"] = round(avg_p, 2)
            info["shares"] = round(info["shares"], 4)
            info["total_cost"] = round(info["total_cost"], 2)
            info["current_value"] = round(info["shares"] * info["current_price"], 2)
            ret_usd = info["current_value"] - info["total_cost"]
            info["return_pct"] = round((ret_usd / info["total_cost"] * 100), 2) if info["total_cost"] > 0 else 0.0

        realized_pnl_total = round(sum(s["realized_pnl"] for s in p["sales"]), 2)
        if p["currency"] == "USD":
            total_purchases_usd += total_current

        summary_portfolios.append({
            "id": p["id"],
            "name": p["name"],
            "currency": p["currency"],
            "total_invested": round(total_invested, 2),
            "total_current_value": round(total_current, 2),
            "total_return_pct": round(((total_current - total_invested) / total_invested * 100), 2) if total_invested > 0 else 0.0,
            "realized_sales_count": len(p["sales"]),
            "realized_pnl_total": realized_pnl_total,
            "recent_sales": p["sales"][:5],
            "positions": list(ticker_summary.values()),
        })

    return {
        "purchases_portfolios": summary_portfolios,
        "total_purchases_usd": round(total_purchases_usd, 2),
    }


def _collect_strategies_summary(effective_user_id: str) -> List[Dict[str, Any]]:
    strategies_out: List[Dict[str, Any]] = []
    try:
        strats = get_custom_strategies(effective_user_id)
    except Exception as err:
        logger.warning("[WARREN_AI] get_custom_strategies failed: %s", err)
        return strategies_out

    for s in strats:
        sid = s.get("id")
        active_tickers: List[str] = []
        substitutes: Dict[str, str] = {}
        latest_rebalance_date: Optional[str] = None
        total_rebalances = 0
        try:
            rebs = get_all_rebalances(sid, effective_user_id)
            active_rebs = [r for r in rebs if r.get("is_active", True)]
            total_rebalances = len(active_rebs)
            if active_rebs:
                latest = active_rebs[-1]
                latest_rebalance_date = latest.get("rebalance_date") or latest.get("date")
                active_tickers = list(latest.get("tickers") or [])
                substitutes = dict(latest.get("substitutes") or {})
        except Exception as reb_err:
            logger.warning("[WARREN_AI] Failed loading rebalances for %s: %s", sid, reb_err)

        strategies_out.append({
            "id": sid,
            "name": s.get("name"),
            "capital": _safe_float(s.get("capital")),
            "active_invested": _safe_float(s.get("activeInvested")),
            "slots": s.get("numSlots"),
            "benchmark": s.get("benchmark"),
            "is_real_money": bool(s.get("isRealMoney")),
            "total_rebalances": total_rebalances,
            "latest_rebalance_date": latest_rebalance_date,
            "active_tickers": active_tickers,
            "substitutes": substitutes,
        })
    return strategies_out


def _collect_fixed_income_summary(effective_user_id: str, fx_rate: float) -> Dict[str, Any]:
    try:
        fi_data = get_user_fixed_income_db(effective_user_id)
    except Exception as err:
        logger.warning("[WARREN_AI] Fixed income fetch failed: %s", err)
        return {}

    entities = {e.get("id"): e.get("name") for e in fi_data.get("entities", []) if e.get("id")}
    cdts = fi_data.get("cdts", [])
    accounts = fi_data.get("accounts", [])

    active_cdts = [c for c in cdts if str(c.get("status") or "active").lower() != "matured"]
    matured_cdts_count = len(cdts) - len(active_cdts)

    cdts_cop = sum(_safe_float(c.get("capital")) for c in active_cdts if (c.get("currency") or "COP") == "COP")
    cdts_usd = sum(_safe_float(c.get("capital")) for c in active_cdts if c.get("currency") == "USD")

    savings_cop = sum(_safe_float(a.get("balance")) for a in accounts if (a.get("currency") or "COP") == "COP")
    savings_usd = sum(_safe_float(a.get("balance")) for a in accounts if a.get("currency") == "USD")

    active_cdt_details = [
        {
            "name": c.get("name"),
            "entity": entities.get(c.get("entityId"), "Entidad"),
            "capital": round(_safe_float(c.get("capital")), 2),
            "currency": c.get("currency") or "COP",
            "interest_rate_ea": round(_safe_float(c.get("interestRateEA")), 2),
            "term_days": c.get("termDays"),
            "maturity_date": c.get("maturityDate"),
        }
        for c in active_cdts
    ]

    active_accounts_details = [
        {
            "name": a.get("name"),
            "entity": entities.get(a.get("entityId"), "Entidad"),
            "balance": round(_safe_float(a.get("balance")), 2),
            "currency": a.get("currency") or "COP",
            "interest_rate_ea": round(_safe_float(a.get("interestRateEA")), 2),
            "category": a.get("accountCategory"),
        }
        for a in accounts
        if _safe_float(a.get("balance")) > 0
    ]

    total_fi_cop_equiv = round(cdts_cop + savings_cop + (cdts_usd + savings_usd) * fx_rate, 0)
    return {
        "total_cdts_capital": round(cdts_cop, 0),
        "total_cdts_capital_cop": round(cdts_cop, 0),
        "total_cdts_capital_usd": round(cdts_usd, 2),
        "num_cdts": len(active_cdts),
        "matured_cdts_count": matured_cdts_count,
        "total_savings_accounts": round(savings_cop, 0),
        "total_savings_cop": round(savings_cop, 0),
        "total_savings_usd": round(savings_usd, 2),
        "num_accounts": len(accounts),
        "total_fixed_income_cop_equiv": total_fi_cop_equiv,
        "active_cdts": active_cdt_details,
        "active_accounts": sorted(active_accounts_details, key=lambda x: x["balance"], reverse=True)[:12],
    }


def _collect_cash_flow_summary(effective_user_id: str) -> Dict[str, Any]:
    try:
        cf = get_user_cash_flow_db(effective_user_id)
    except Exception as err:
        logger.warning("[WARREN_AI] Cash flow fetch failed: %s", err)
        return {}

    active_period = cf.get("activePeriod") or datetime.now().strftime("%Y-%m")
    inflows_planned = sum(_safe_float(i.get("amount")) for i in cf.get("inflows", []))
    needs_planned = sum(_safe_float(n.get("amount")) for n in cf.get("needs", []))
    wants_planned = sum(_safe_float(w.get("amount")) for w in cf.get("wants", []))
    wealth_planned = sum(_safe_float(w.get("amount")) for w in cf.get("wealth", []))

    period_movements = [m for m in cf.get("expensesLog", []) if (m.get("period") or str(m.get("date") or "")[:7]) == active_period]
    income_actual = 0.0
    expense_actual = 0.0
    for mov in period_movements:
        mtype = str(mov.get("type") or "").lower()
        btype = str(mov.get("budgetItemType") or "").lower()
        amt = _safe_float(mov.get("amount"))
        if mtype in ("credit", "income") or btype == "income":
            income_actual += amt
        elif mtype in ("debit", "expense") or btype in ("needs", "wants"):
            expense_actual += amt

    active_debts = [d for d in cf.get("debts", []) if str(d.get("status") or "").lower() != "paid" and _safe_float(d.get("remainingAmount")) > 0]
    receivable_total = sum(_safe_float(d.get("remainingAmount")) for d in active_debts if d.get("debtType") == "receivable")
    payable_total = sum(_safe_float(d.get("remainingAmount")) for d in active_debts if d.get("debtType") != "receivable")

    cards = [
        {
            "name": c.get("name"),
            "total_limit": round(_safe_float(c.get("totalLimit")), 0),
            "used_limit": round(_safe_float(c.get("usedLimit")), 0),
            "available_limit": round(max(0.0, _safe_float(c.get("totalLimit")) - _safe_float(c.get("usedLimit"))), 0),
        }
        for c in cf.get("creditCards", [])
    ]

    return {
        "active_period": active_period,
        "currency": cf.get("currency", "COP"),
        "ratios": cf.get("customRatios", {}),
        "inflows_planned": round(inflows_planned, 0),
        "needs_planned": round(needs_planned, 0),
        "wants_planned": round(wants_planned, 0),
        "wealth_planned": round(wealth_planned, 0),
        "period_movements_count": len(period_movements),
        "period_income_actual": round(income_actual, 0),
        "period_expense_actual": round(expense_actual, 0),
        "debts_receivable_total": round(receivable_total, 0),
        "debts_payable_total": round(payable_total, 0),
        "active_debts": [
            {
                "type": "Por cobrar" if d.get("debtType") == "receivable" else "Por pagar",
                "concept": d.get("concept"),
                "counterparty": d.get("debtor") if d.get("debtType") == "receivable" else d.get("creditor"),
                "remaining": round(_safe_float(d.get("remainingAmount")), 0),
            }
            for d in active_debts[:10]
        ],
        "credit_cards": cards,
    }


def get_all_investments_summary(user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts complete financial & economic state registered across Kpital:
    1. Equity Purchases & Realized Sales (including .L/.F live quotes & commissions)
    2. Quantitative Strategies + active rebalance tickers & substitutes
    3. Fixed Income COP & USD (active CDTs excluding matured + savings accounts)
    4. Cash Flow, Budgets, Active Debts, Credit Cards & live USD/COP TRM
    """
    effective_user_id = user_id or OWNER_ID
    fx_rate = _resolve_fx_usd_cop()

    result: Dict[str, Any] = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "fx_usd_cop": fx_rate,
        "purchases_portfolios": [],
        "custom_strategies": [],
        "fixed_income_summary": {},
        "cash_flow_summary": {},
        "consolidated_net_worth": {},
    }

    total_purchases_usd = 0.0
    with get_connection() as con:
        try:
            p_res = _collect_purchases_and_sales(con, effective_user_id)
            result["purchases_portfolios"] = p_res["purchases_portfolios"]
            total_purchases_usd = p_res["total_purchases_usd"]
        except Exception as err:
            logger.error("[WARREN_AI] Error reading purchases: %s", err)

    result["custom_strategies"] = _collect_strategies_summary(effective_user_id)
    fi_summary = _collect_fixed_income_summary(effective_user_id, fx_rate)
    result["fixed_income_summary"] = fi_summary
    cf_summary = _collect_cash_flow_summary(effective_user_id)
    result["cash_flow_summary"] = cf_summary

    real_strats_usd = sum(
        _safe_float(s.get("capital")) for s in result["custom_strategies"] if s.get("is_real_money")
    )
    total_equities_usd = round(total_purchases_usd + real_strats_usd, 2)
    fi_cop_equiv = _safe_float(fi_summary.get("total_fixed_income_cop_equiv"))
    payable_cop = _safe_float(cf_summary.get("debts_payable_total"))
    receivable_cop = _safe_float(cf_summary.get("debts_receivable_total"))
    cards_debt_cop = sum(_safe_float(c.get("used_limit")) for c in cf_summary.get("credit_cards", []))

    gross_cop = round(fi_cop_equiv + total_equities_usd * fx_rate + receivable_cop, 0)
    liabilities_cop = round(payable_cop + cards_debt_cop, 0)
    net_cop = round(gross_cop - liabilities_cop, 0)

    result["consolidated_net_worth"] = {
        "fx_usd_cop": fx_rate,
        "equities_usd_approx": total_equities_usd,
        "fixed_income_cop_equiv": round(fi_cop_equiv, 0),
        "receivables_cop": round(receivable_cop, 0),
        "liabilities_cop": liabilities_cop,
        "net_worth_cop_approx": net_cop,
        "net_worth_usd_approx": round(net_cop / fx_rate, 2) if fx_rate > 0 else 0.0,
    }

    return result


def filter_relevant_context(data: Dict[str, Any], user_question: Optional[str] = None, focus: Optional[str] = None) -> tuple[str, list]:
    """
    Inspects query and focus scope:
    - Explicit ticker/asset queries extract targeted equity positions cleanly.
    - Explicit domain scopes ('investments', 'fixed_income', 'cash_flow', 'macro') filter to that scope.
    - Broad economic/financial questions receive the full structured executive context.
    """
    text_query = f"{user_question or ''} {focus or ''}".lower()
    scope_norm = (focus or "").strip().lower()

    if scope_norm in ("investments", "inversiones", "fixed_income", "renta_fija", "cash_flow", "flujo_caja"):
        normalized = (
            "investments"
            if scope_norm in ("investments", "inversiones")
            else ("fixed_income" if scope_norm in ("fixed_income", "renta_fija") else "cash_flow")
        )
        return build_raw_context_text(data, scope=normalized), []

    all_positions = []
    for p in data.get("purchases_portfolios", []):
        for pos in p.get("positions", []):
            pos_copy = dict(pos)
            pos_copy["portfolio_name"] = p["name"]
            pos_copy["currency"] = p["currency"]
            all_positions.append(pos_copy)

    keyword_ticker_map = {
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
    words = [w.strip(".,;:?!()[]'\"").upper() for w in text_query.split()]
    for pos in all_positions:
        ticker = pos["ticker"].upper()
        ticker_base = ticker.split(".")[0].split("-")[0]
        if ticker in words or ticker_base in words:
            matched_tickers.add(ticker)

    for kw, t_list in keyword_ticker_map.items():
        if kw in text_query:
            for t in t_list:
                for pos in all_positions:
                    if pos["ticker"].upper() == t or pos["ticker"].upper().startswith(t):
                        matched_tickers.add(pos["ticker"].upper())

    is_broad_macro = any(
        w in text_query
        for w in ("cdt", "banco", "deuda", "tarjeta", "flujo", "presupuesto", "salario", "trm", "dolar", "dólar", "inflacion", "inflación", "patrimonio", "economia", "economía")
    )

    if matched_tickers and not is_broad_macro:
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
        return "\n".join(lines), list(matched_tickers)

    return build_raw_context_text(data, scope="all"), []


def build_raw_context_text(data: Dict[str, Any], scope: str = "all") -> str:
    """Builds a structured, currency-accurate markdown snapshot across Kpital modules."""
    lines: List[str] = [
        f"### FECHA Y HORA: {data.get('date')} | TRM USD/COP: ${data.get('fx_usd_cop', 4150):,.0f}",
        "",
    ]

    nw = data.get("consolidated_net_worth", {})
    if nw and scope == "all":
        lines.append("### 0. PATRIMONIO CONSOLIDADO ESTIMADO:")
        lines.append(
            f"- Patrimonio Neto Aprox: ${nw.get('net_worth_cop_approx', 0):,.0f} COP "
            f"(≈ ${nw.get('net_worth_usd_approx', 0):,.2f} USD)"
        )
        lines.append(
            f"- Renta Variable USD: ${nw.get('equities_usd_approx', 0):,.2f} | "
            f"Renta Fija COP equiv: ${nw.get('fixed_income_cop_equiv', 0):,.0f} | "
            f"Por Cobrar: ${nw.get('receivables_cop', 0):,.0f} | Pasivos/Deudas+TC: ${nw.get('liabilities_cop', 0):,.0f}"
        )
        lines.append("")

    if scope in ("all", "investments"):
        lines.append("### 1. PORTAFOLIOS DE COMPRAS REALES Y VENTAS CERRADAS:")
        for p in data.get("purchases_portfolios", []):
            lines.append(
                f"**{p['name']}** ({p['currency']}) — Invertido: ${p['total_invested']} | "
                f"Actual: ${p['total_current_value']} ({p['total_return_pct']}%) | "
                f"PnL Realizado ({p.get('realized_sales_count', 0)} ventas): ${p.get('realized_pnl_total', 0)}"
            )
            for pos in p.get("positions", []):
                lines.append(
                    f"  * {pos['ticker']}: {pos['shares']} uds @ ${pos['avg_price']} -> Actual ${pos['current_price']} "
                    f"(24h: {pos.get('change_pct_1d', 0)}%, Retorno: {pos['return_pct']}%)"
                )
            for sale in p.get("recent_sales", [])[:3]:
                lines.append(
                    f"  * [Venta {sale['sale_date']}] {sale['ticker']}: {sale['shares']} uds @ ${sale['sale_price']} "
                    f"(PnL: ${sale['realized_pnl']})"
                )
            lines.append("")

        if data.get("custom_strategies"):
            lines.append("### 2. ESTRATEGIAS CUANTITATIVAS (PROPICKS / TITANES):")
            for s in data["custom_strategies"]:
                tickers_str = ", ".join(s.get("active_tickers") or []) or "Sin rebalanceo activo"
                subs = s.get("substitutes") or {}
                subs_str = (
                    f" | Sustitutos: {', '.join(f'{k}→{v}' for k, v in subs.items())}"
                    if subs
                    else ""
                )
                lines.append(
                    f"- {s['name']}: Capital ${s['capital']} ({s['slots']} slots) | "
                    f"Real: {'Sí' if s['is_real_money'] else 'Simulado'} | "
                    f"Último Reb: {s.get('latest_rebalance_date') or 'N/A'} | Tickers: [{tickers_str}]{subs_str}"
                )
            lines.append("")

    fi = data.get("fixed_income_summary", {})
    if fi and scope in ("all", "fixed_income"):
        lines.append("### 3. RENTA FIJA Y LIQUIDEZ BANCARIA (SOLO CDTs ACTIVOS):")
        lines.append(
            f"- CDTs Activos ({fi.get('num_cdts', 0)} vigentes; {fi.get('matured_cdts_count', 0)} vencidos excluidos): "
            f"${fi.get('total_cdts_capital_cop', 0):,.0f} COP + ${fi.get('total_cdts_capital_usd', 0):,.2f} USD"
        )
        lines.append(
            f"- Cuentas de Ahorro/Bolsillos ({fi.get('num_accounts', 0)} cuentas): "
            f"${fi.get('total_savings_cop', 0):,.0f} COP + ${fi.get('total_savings_usd', 0):,.2f} USD"
        )
        for c in fi.get("active_cdts", []):
            lines.append(
                f"  * CDT {c['entity']} '{c['name']}': ${c['capital']:,.0f} {c['currency']} @ {c['interest_rate_ea']}% E.A. (Vence: {c['maturity_date']})"
            )
        for a in fi.get("active_accounts", [])[:8]:
            lines.append(
                f"  * Cuenta {a['entity']} '{a['name']}': ${a['balance']:,.2f} {a['currency']} @ {a['interest_rate_ea']}% E.A."
            )
        lines.append("")

    cf = data.get("cash_flow_summary", {})
    if cf and scope in ("all", "cash_flow"):
        lines.append(f"### 4. FLUJO DE CAJA, PRESUPUESTO Y DEUDAS (Ciclo {cf.get('active_period')}):")
        lines.append(
            f"- Presupuesto Mensual Planificado: Ingresos ${cf.get('inflows_planned', 0):,.0f} | "
            f"Necesidades ${cf.get('needs_planned', 0):,.0f} | Deseos ${cf.get('wants_planned', 0):,.0f} | Ahorro/Inv ${cf.get('wealth_planned', 0):,.0f}"
        )
        lines.append(
            f"- Movimientos Reales Ciclo ({cf.get('period_movements_count', 0)}): "
            f"Entradas ${cf.get('period_income_actual', 0):,.0f} | Salidas ${cf.get('period_expense_actual', 0):,.0f}"
        )
        lines.append(
            f"- Deudas Activas: Por Cobrar ${cf.get('debts_receivable_total', 0):,.0f} | Por Pagar ${cf.get('debts_payable_total', 0):,.0f}"
        )
        for d in cf.get("active_debts", [])[:6]:
            lines.append(f"  * {d['type']}: {d['concept']} ({d['counterparty']}) — Saldo ${d['remaining']:,.0f}")
        for card in cf.get("credit_cards", []):
            lines.append(
                f"  * TC {card['name']}: Usado ${card['used_limit']:,.0f} / Cupo ${card['total_limit']:,.0f} (Disponible ${card['available_limit']:,.0f})"
            )

    return "\n".join(lines).strip()


def generate_warren_prompt(
    focus: Optional[str] = None,
    user_question: Optional[str] = None,
    user_id: Optional[str] = None,
    use_ollama: bool = True,
    ollama_model: str = DEFAULT_OLLAMA_MODEL,
) -> Dict[str, Any]:
    """Generates a targeted prompt for WarrenAI (InvestingPro) or any external chat."""
    portfolio_data = get_all_investments_summary(user_id=user_id)
    discriminative_context, matched_tickers = filter_relevant_context(
        portfolio_data, user_question=user_question, focus=focus
    )
    is_targeted = len(matched_tickers) > 0

    if not use_ollama:
        if is_targeted:
            prompt = (
                "Hola WarrenAI. Como analista cuantitativo de InvestingPro y ProPicks AI, requiero un análisis "
                "técnico y fundamental sobre la(s) siguiente(s) posición(es):\n\n"
                f"{discriminative_context}\n\n"
            )
            if user_question:
                prompt += f"**Mi consulta puntual:**\n{user_question}\n\n"
            prompt += (
                "Por favor analiza:\n"
                "1. Fair Value (InvestingPro), múltiplos clave y margen de seguridad.\n"
                "2. Tendencia técnica, soportes/resistencias y gestión de riesgo.\n"
                "3. Catalizadores macro y sectoriales."
            )
        else:
            prompt = (
                "Hola. Actúa como asesor económico y analista financiero cuantitativo. "
                "Aquí tienes mi contexto financiero real consolidado en Kpital:\n\n"
                f"{discriminative_context}\n\n"
            )
            if user_question:
                prompt += f"**Consulta:**\n{user_question}\n\n"
            if focus:
                prompt += f"**Enfoque:** {focus}\n\n"
            prompt += "Por favor dame un diagnóstico claro con recomendaciones concretas, cifras y riesgos macro/personales."

        return {
            "status": "success",
            "model_used": "smart_filter_fallback",
            "prompt_for_warren": prompt,
            "raw_context": discriminative_context,
            "portfolio_summary": portfolio_data,
            "matched_tickers": matched_tickers,
        }

    system_prompt = (
        "Eres un arquitecto de prompts financiero. Redacta un prompt QUIRÚRGICO en ESPAÑOL para copiar y pegar "
        "en WarrenAI / ChatGPT / Claude / Gemini.\n"
        "Conserva las cifras exactas del contexto (precios, rentabilidades, tasas E.A. de CDTs, TRM o deudas según aplique) "
        "y devuelve ÚNICAMENTE el texto final listo para pegar."
    )
    user_instructions = (
        f"Contexto filtrado:\n{discriminative_context}\n\n"
        f"Pregunta del usuario: {user_question or 'Análisis integral de situación financiera y cartera'}\n"
        f"Enfoque: {focus or 'general'}\n"
    )
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


def _build_chat_messages(
    question: str,
    context_text: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, str]]:
    system_with_context = (
        f"{ECONOMIC_SYSTEM_PROMPT}\n\n"
        f"--- CONTEXTO FINANCIERO REAL DEL USUARIO ---\n"
        f"{context_text}\n"
        f"--- FIN DEL CONTEXTO ---"
    )
    msgs: List[Dict[str, str]] = [{"role": "system", "content": system_with_context}]
    for item in (history or [])[-8:]:
        role = item.get("role")
        content = str(item.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": question.strip()})
    return msgs


def _call_ollama_chat(messages: List[Dict[str, str]], model: str) -> str:
    payload = {
        "model": model or DEFAULT_OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.35},
    }
    data = _post_json(f"{OLLAMA_BASE_URL}/api/chat", payload, timeout=90)
    reply = (data.get("message") or {}).get("content", "").strip()
    if not reply:
        raise RuntimeError("Ollama devolvió una respuesta vacía.")
    return reply


def _call_openai_compatible_chat(
    messages: List[Dict[str, str]],
    base_url: str,
    api_key: str,
    model: str,
) -> str:
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/chat/completions"):
        endpoint = f"{endpoint}/chat/completions"
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.35,
    }
    data = _post_json(endpoint, payload, headers=headers, timeout=90)
    choices = data.get("choices") or []
    reply = (((choices[0] or {}).get("message") or {}).get("content") or "").strip() if choices else ""
    if not reply:
        raise RuntimeError("El proveedor OpenAI-compatible no devolvió contenido.")
    return reply


def _call_gemini_chat(messages: List[Dict[str, str]], api_key: str, model: str) -> str:
    if not api_key:
        raise ValueError("Falta la API Key de Gemini.")
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), ECONOMIC_SYSTEM_PROMPT)
    contents = [
        {
            "role": "model" if m["role"] == "assistant" else "user",
            "parts": [{"text": m["content"]}],
        }
        for m in messages
        if m["role"] != "system"
    ]
    model_id = (model or "gemini-flash-latest").strip().removeprefix("models/")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_id}:generateContent?key={api_key}"
    payload = {
        "systemInstruction": {"parts": [{"text": system_msg}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.35, "maxOutputTokens": 2048},
    }
    data = _post_json(url, payload, timeout=90)
    cands = data.get("candidates") or []
    parts = (((cands[0] or {}).get("content") or {}).get("parts") or []) if cands else []
    reply = "".join(str(p.get("text") or "") for p in parts).strip()
    if not reply:
        raise RuntimeError("Gemini devolvió una respuesta vacía.")
    return reply


def _call_anthropic_chat(messages: List[Dict[str, str]], api_key: str, model: str) -> str:
    if not api_key:
        raise ValueError("Falta la API Key de Anthropic.")
    system_msg = next((m["content"] for m in messages if m["role"] == "system"), ECONOMIC_SYSTEM_PROMPT)
    chat_msgs = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m["role"] in ("user", "assistant")
    ]
    payload = {
        "model": model or "claude-3-5-haiku-latest",
        "max_tokens": 2048,
        "system": system_msg,
        "messages": chat_msgs,
    }
    data = _post_json(
        "https://api.anthropic.com/v1/messages",
        payload,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        timeout=90,
    )
    blocks = data.get("content") or []
    reply = "".join(str(b.get("text") or "") for b in blocks if b.get("type") == "text").strip()
    if not reply:
        raise RuntimeError("Anthropic devolvió una respuesta vacía.")
    return reply


def chat_with_economic_ai(
    question: str,
    user_id: Optional[str] = None,
    provider: str = "ollama",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    scope: str = "all",
    history: Optional[List[Dict[str, str]]] = None,
    context_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes multi-turn economic Q&A against Ollama or an external BYOK provider
    using either live frontend context (`context_override`) or fresh DB summary.
    API keys are strictly ephemeral (never stored or logged).
    """
    clean_q = (question or "").strip()
    if not clean_q:
        raise ValueError("La pregunta no puede estar vacía.")

    if context_override and context_override.strip():
        context_text = context_override.strip()[:15000]
    else:
        summary = get_all_investments_summary(user_id=user_id)
        context_text, _ = filter_relevant_context(summary, user_question=clean_q, focus=scope)

    messages = _build_chat_messages(clean_q, context_text, history=history)
    prov = (provider or "ollama").strip().lower()

    if prov == "ollama":
        used_model = model or DEFAULT_OLLAMA_MODEL
        reply = _call_ollama_chat(messages, used_model)
    elif prov == "gemini":
        used_model = model or "gemini-flash-latest"
        reply = _call_gemini_chat(messages, api_key or "", used_model)
    elif prov == "anthropic":
        used_model = model or "claude-3-5-haiku-latest"
        reply = _call_anthropic_chat(messages, api_key or "", used_model)
    else:
        default_urls = {
            "openai": "https://api.openai.com/v1",
            "groq": "https://api.groq.com/openai/v1",
            "openrouter": "https://openrouter.ai/api/v1",
            "deepseek": "https://api.deepseek.com",
        }
        resolved_url = (base_url or default_urls.get(prov, "")).strip()
        if not resolved_url:
            raise ValueError(f"Falta Base URL para el proveedor '{prov}'.")
        used_model = model or "gpt-4o-mini"
        reply = _call_openai_compatible_chat(messages, resolved_url, api_key or "", used_model)

    return {
        "status": "success",
        "provider": prov,
        "model_used": used_model,
        "reply": reply,
        "context_used": context_text,
    }
