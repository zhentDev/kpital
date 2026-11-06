"""
Stock Alerts Router.
Handles CRUD and real-time evaluation for profit target / stop-loss sell notifications.
"""

import os
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from services.auth import get_optional_current_user
from services.db import (
    get_stock_alerts_db,
    upsert_stock_alert_db,
    delete_stock_alert_db,
    trigger_stock_alert_db,
)
from services.email_notifier import send_sell_alert_email, send_test_email, get_smtp_config
from services.telegram_notifier import send_sell_alert_telegram, send_test_telegram, get_telegram_config
from services.market_data import get_live_quotes

router = APIRouter(prefix="/alerts", tags=["Stock Alerts"])



class StockAlertCreate(BaseModel):
    id: Optional[str] = None
    scope: str = "strategy"  # 'strategy' or 'purchase'
    target_id: str = "historical"
    ticker: str
    alert_type: str = "PROFIT_TARGET"  # 'PROFIT_TARGET' or 'STOP_LOSS'
    target_value: float = 10.0  # percentage, e.g. 15.0 for +15%, -10.0 for -10%
    is_active: bool = True
    notify_email: bool = True
    notify_app: bool = True
    notify_telegram: bool = True
    user_email: Optional[str] = None


class CheckAlertsRequest(BaseModel):
    scope: Optional[str] = None
    target_id: Optional[str] = None
    positions: List[dict]  # list of { ticker, entry_price, current_price, return_pct, name, scope_title }


@router.get("")
def list_user_alerts(request: Request, scope: Optional[str] = None, target_id: Optional[str] = None):
    """List stock alerts for the current user."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else "usr_9487dd2209d2"
    return get_stock_alerts_db(user_id=user_id, scope=scope, target_id=target_id)


@router.get("/live")
def get_live_alerts_status(request: Request, scope: Optional[str] = None, target_id: Optional[str] = None):
    """
    Returns user stock/ETF alerts enriched with:
    - Real-time market prices from Yahoo Finance.
    - Resolved cost basis / entry prices from user portfolios & rebalances.
    - Target prices, return percentages, and distance to target.
    - Real-time status ('ACTIVE', 'NEAR', 'TRIGGERED', 'PAUSED').
    - Dispatches notifications if an active alert triggers during evaluation.
    """
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else "usr_9487dd2209d2"
    user_email = user.get("email") if user else None

    alerts = get_stock_alerts_db(user_id=user_id, scope=scope, target_id=target_id)
    if not alerts:
        return {
            "count": 0,
            "active_count": 0,
            "triggered_count": 0,
            "near_count": 0,
            "newly_triggered": [],
            "alerts": []
        }

    # Fetch purchases to resolve lot-specific entry prices and consolidated WAP
    purchases = []
    try:
        from db.connection import pg_session
        with pg_session() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, ticker, purchase_price, shares, date FROM rv_purchases WHERE user_id = %s",
                    [user_id]
                )
                p_cols = [desc[0] for desc in cur.description]
                purchases = [dict(zip(p_cols, row)) for row in cur.fetchall()]
    except Exception:
        pass

    lots_map = {str(p["id"]).strip().lower(): p for p in purchases if p.get("id")}
    wap_agg = {}
    for p in purchases:
        t = str(p.get("ticker") or "").upper().strip()
        if t:
            if t not in wap_agg:
                wap_agg[t] = {"cost": 0.0, "shares": 0.0}
            sh = float(p.get("shares") or 0.0)
            wap_agg[t]["cost"] += float(p.get("purchase_price") or 0.0) * sh
            wap_agg[t]["shares"] += sh
    wap_map = {t: (v["cost"] / v["shares"]) if v["shares"] > 0 else 0.0 for t, v in wap_agg.items()}

    # Unique clean tickers for market quote batching
    clean_tickers = list(set([a.get("ticker", "").split("::")[0].strip().upper() for a in alerts if a.get("ticker")]))
    raw_quotes = get_live_quotes(clean_tickers) if clean_tickers else []
    live_quotes = {q["ticker"].upper(): q for q in raw_quotes}

    enriched = []
    newly_triggered = []

    for alert in alerts:
        raw_ticker = str(alert.get("ticker") or "").strip()
        if not raw_ticker:
            continue

        clean_ticker = raw_ticker.split("::")[0].strip().upper()
        lot_id = raw_ticker.split("::")[1].strip().lower() if "::" in raw_ticker else None

        # Resolve Entry Price (P0)
        entry_price = 0.0
        lot_label = None
        if lot_id and lot_id in lots_map:
            entry_price = float(lots_map[lot_id].get("purchase_price") or 0.0)
            lot_label = f"Lote {lots_map[lot_id].get('date', '')}"
        elif clean_ticker in wap_map and wap_map[clean_ticker] > 0:
            entry_price = float(wap_map[clean_ticker])
            lot_label = "Posición Consolidada (WAP)"
        elif alert.get("last_checked_price"):
            entry_price = float(alert.get("last_checked_price"))
            lot_label = "Precio de Referencia"

        # Resolve Current Market Price
        quote = live_quotes.get(clean_ticker, {})
        has_real_quote = bool(quote and float(quote.get("price") or 0.0) > 0.0)
        current_price = float(quote.get("price") or (entry_price if entry_price > 0 else 100.0))
        if entry_price <= 0:
            entry_price = current_price
            lot_label = "Precio Inicial"

        target_val = float(alert.get("target_value", 10.0))
        alert_type = str(alert.get("alert_type") or "PROFIT_TARGET").upper()
        is_active = bool(alert.get("is_active", True))
        triggered_at = alert.get("triggered_at")

        # Calculations
        current_return_pct = round(((current_price - entry_price) / entry_price * 100.0), 2) if (entry_price > 0 and has_real_quote) else 0.0
        target_price = round(entry_price * (1.0 + (target_val / 100.0)), 2)

        # Distance & trigger condition
        if alert_type == "PROFIT_TARGET":
            distance_pct = round(target_val - current_return_pct, 2)
        else: # STOP_LOSS
            distance_pct = round(current_return_pct - target_val, 2)

        is_condition_met = False
        if has_real_quote and is_active and not triggered_at:
            if alert_type == "PROFIT_TARGET":
                is_condition_met = (current_return_pct >= target_val)
            else: # STOP_LOSS
                is_condition_met = (current_return_pct <= target_val)

        is_triggered_now = False
        if not is_active:
            status = "PAUSED"
        elif triggered_at:
            status = "TRIGGERED"
        elif is_condition_met:
            status = "TRIGGERED"
            try:
                trigger_stock_alert_db(alert["id"], current_price)
                triggered_at = True
                is_triggered_now = True

                recipient = alert.get("user_email") or user_email
                if alert.get("notify_email") and recipient:
                    send_sell_alert_email(
                        to_email=recipient,
                        ticker=clean_ticker,
                        company_name=quote.get("name") or clean_ticker,
                        alert_type=alert_type,
                        target_value=target_val,
                        current_return_pct=current_return_pct,
                        current_price=current_price,
                        entry_price=entry_price,
                        scope_title=alert.get("scope", "Kpital")
                    )
                if alert.get("notify_telegram", True):
                    is_owner = str(recipient).strip().lower() == OWNER_EMAIL or str(user_email).strip().lower() == OWNER_EMAIL
                    if is_owner:
                        send_sell_alert_telegram(
                            ticker=clean_ticker,
                            company_name=quote.get("name") or clean_ticker,
                            alert_type=alert_type,
                            target_value=target_val,
                            current_return_pct=current_return_pct,
                            current_price=current_price,
                            entry_price=entry_price,
                            scope_title=alert.get("scope", "Kpital")
                        )
            except Exception:
                pass
        elif 0 < distance_pct <= 1.5:
            status = "NEAR"
        else:
            status = "ACTIVE"

        item = {
            "id": alert["id"],
            "ticker": clean_ticker,
            "raw_ticker": raw_ticker,
            "company_name": quote.get("name") or clean_ticker,
            "scope": alert.get("scope", "strategy"),
            "target_id": alert.get("target_id", "historical"),
            "lot_label": lot_label,
            "alert_type": alert_type,
            "target_value": target_val,
            "entry_price": round(entry_price, 2),
            "current_price": round(current_price, 2),
            "target_price": round(target_price, 2),
            "current_return_pct": current_return_pct,
            "distance_pct": distance_pct,
            "status": status,
            "is_active": is_active,
            "is_triggered_now": is_triggered_now,
            "triggered_at": str(triggered_at) if triggered_at else None,
            "change_24h": float(quote.get("change") or 0.0),
            "change_pct_24h": float(quote.get("change_pct") or 0.0),
        }

        if is_triggered_now:
            newly_triggered.append(item)

        enriched.append(item)

    # Sort: TRIGGERED first, then NEAR, then ACTIVE by distance
    def alert_order(x):
        st = x["status"]
        if st == "TRIGGERED":
            return (0, 0)
        if st == "NEAR":
            return (1, x["distance_pct"])
        if st == "ACTIVE":
            return (2, x["distance_pct"])
        return (3, x["distance_pct"])

    enriched.sort(key=alert_order)

    active_cnt = sum(1 for a in enriched if a["status"] in ("ACTIVE", "NEAR"))
    triggered_cnt = sum(1 for a in enriched if a["status"] == "TRIGGERED")
    near_cnt = sum(1 for a in enriched if a["status"] == "NEAR")

    return {
        "count": len(enriched),
        "active_count": active_cnt,
        "triggered_count": triggered_cnt,
        "near_count": near_cnt,
        "newly_triggered": newly_triggered,
        "alerts": enriched
    }


@router.post("")
def save_user_alert(alert: StockAlertCreate, request: Request):
    """Create or update a stock alert."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else "usr_9487dd2209d2"
    user_email = alert.user_email or (user["email"] if user and "email" in user else "usuario@kpital.com")

    payload = alert.dict()
    payload["user_id"] = user_id
    payload["user_email"] = user_email
    return upsert_stock_alert_db(payload)


@router.delete("/{alert_id}")
def delete_user_alert(alert_id: str, request: Request):
    """Delete a stock alert."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    success = delete_stock_alert_db(alert_id, user_id=user_id)
    return {"success": success, "id": alert_id}


@router.post("/check")
def check_and_evaluate_alerts(body: CheckAlertsRequest, request: Request):
    """
    Evaluates positions against active alerts.
    If an alert condition is met:
    1. Triggers the alert (marks it triggered in db).
    2. Sends email notification to user's registered email if notify_email is enabled.
    3. Returns the list of triggered alerts for in-app banner/toast notification.
    """
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else "usr_9487dd2209d2"
    user_email = user["email"] if user and "email" in user else None

    # Load active alerts
    alerts = get_stock_alerts_db(user_id=user_id, scope=body.scope, target_id=body.target_id)
    active_alerts = [a for a in alerts if a.get("is_active") and not a.get("triggered_at")]

    if not active_alerts or not body.positions:
        return {"triggered": []}

    triggered_list = []

    # Map positions by ticker
    pos_map = {}
    for pos in body.positions:
        t = pos.get("ticker", "").upper().strip()
        if t:
            pos_map[t] = pos

    for alert in active_alerts:
        ticker = alert.get("ticker", "").upper().strip()
        pos = pos_map.get(ticker)
        if not pos:
            continue

        ret_pct = float(pos.get("return_pct", 0.0))
        target_val = float(alert.get("target_value", 0.0))
        alert_type = alert.get("alert_type", "PROFIT_TARGET")
        current_p = float(pos.get("current_price", 0.0))
        entry_p = float(pos.get("entry_price", 0.0))
        name = pos.get("name") or ticker
        scope_title = pos.get("scope_title") or "Titanes Portfolio"
        recipient = alert.get("user_email") or user_email

        is_condition_met = False
        if alert_type == "PROFIT_TARGET" and ret_pct >= target_val:
            is_condition_met = True
        elif alert_type == "STOP_LOSS" and ret_pct <= target_val:
            is_condition_met = True

        if is_condition_met:
            # 1. Update DB
            trigger_stock_alert_db(alert["id"], current_p)

            clean_ticker = ticker.split("::")[0]

            # 2. Send email notification if configured
            email_sent = False
            if alert.get("notify_email") and recipient:
                email_sent = send_sell_alert_email(
                    to_email=recipient,
                    ticker=clean_ticker,
                    company_name=name,
                    alert_type=alert_type,
                    target_value=target_val,
                    current_return_pct=ret_pct,
                    current_price=current_p,
                    entry_price=entry_p,
                    scope_title=scope_title,
                )

            # 3. Send Telegram notification directly to phone (Strictly exclusive to owner)
            telegram_sent = False
            is_owner_target = str(recipient).strip().lower() == OWNER_EMAIL or str(user_email).strip().lower() == OWNER_EMAIL
            if alert.get("notify_telegram", True) and is_owner_target:
                telegram_sent = send_sell_alert_telegram(
                    ticker=clean_ticker,
                    company_name=name,
                    alert_type=alert_type,
                    target_value=target_val,
                    current_return_pct=ret_pct,
                    current_price=current_p,
                    entry_price=entry_p,
                    scope_title=scope_title,
                )

            triggered_item = {
                "alert_id": alert["id"],
                "ticker": clean_ticker,
                "alert_key": ticker,
                "company_name": name,
                "alert_type": alert_type,
                "target_value": target_val,
                "current_return_pct": ret_pct,
                "current_price": current_p,
                "entry_price": entry_p,
                "scope_title": scope_title,
                "email_sent": email_sent,
                "telegram_sent": telegram_sent,
                "recipient": recipient,
            }
            triggered_list.append(triggered_item)

    return {"triggered": triggered_list}


class TestEmailRequest(BaseModel):
    email: Optional[str] = None


@router.post("/test-email")
def test_user_email(body: TestEmailRequest, request: Request):
    """
    Sends a test email to verify SMTP credentials and settings.
    """
    user = get_optional_current_user(request)
    target_email = body.email or (user["email"] if user and "email" in user else None)
    result = send_test_email(to_email=target_email)
    return result


# Owner email with exclusive access to phone Telegram alerts
OWNER_EMAIL = "caballerojesus703@hotmail.com"


@router.post("/test-telegram")
def test_user_telegram(request: Request):
    """
    Sends a test Telegram alert message to verify Bot Token and Chat ID.
    Strictly exclusive to caballerojesus703@hotmail.com.
    """
    user = get_optional_current_user(request)
    user_email = (user.get("email") if user else "").strip().lower()

    # Allow webhook secret for local/simulator testing or owner email
    webhook_secret = request.headers.get("X-Webhook-Secret")
    expected_secret = os.getenv("WEBHOOK_SECRET_KEY", "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2")
    is_valid_secret = webhook_secret and webhook_secret.strip() == expected_secret.strip()

    if not is_valid_secret and user_email != OWNER_EMAIL:
        raise HTTPException(
            status_code=403,
            detail="Acceso restringido: Las alertas por Telegram son exclusivas del propietario de Titanes Portfolio."
        )

    result = send_test_telegram()
    return result

