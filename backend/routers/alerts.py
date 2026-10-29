"""
Stock Alerts Router.
Handles CRUD and real-time evaluation for profit target / stop-loss sell notifications.
"""

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

