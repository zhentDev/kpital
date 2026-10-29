"""Telegram Notification Service for Titanes Portfolio.

Sends instant push notifications directly to Telegram for:
- Profit Target / Stop Loss sell alerts.
- Bank expense & income transaction audit notifications.
- System warnings and portfolio rebalance notifications.
"""

import html
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Ensure .env is loaded
load_dotenv()

# Colombia Timezone (UTC-5)
COLOMBIA_TZ = timezone(timedelta(hours=-5))


def get_telegram_config() -> dict[str, Any]:
    """Retrieve current Telegram bot credentials from environment."""
    load_dotenv(override=True)
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip().strip('"').strip("'")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip().strip('"').strip("'")
    enabled = bool(token and chat_id)
    return {
        "token": token,
        "chat_id": chat_id,
        "enabled": enabled,
    }


def send_telegram_message(
    text: str,
    parse_mode: str = "HTML",
    disable_notification: bool = False,
) -> bool:
    """Send an arbitrary text message to the configured Telegram chat."""
    config = get_telegram_config()
    if not config["enabled"]:
        logger.debug("[TELEGRAM] Notifier disabled (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing).")
        return False

    url = f"https://api.telegram.org/bot{config['token']}/sendMessage"
    payload = {
        "chat_id": config["chat_id"],
        "text": text,
        "parse_mode": parse_mode,
        "disable_notification": disable_notification,
    }

    try:
        resp = requests.post(url, json=payload, timeout=8)
        if resp.status_code == 200:
            logger.info(f"[TELEGRAM] Notification sent successfully to chat {config['chat_id']}.")
            return True
        logger.error(f"[TELEGRAM] API error ({resp.status_code}): {resp.text}")
        return False
    except Exception as e:
        logger.error(f"[TELEGRAM] Failed to send message: {e}")
        return False


def send_sell_alert_telegram(
    ticker: str,
    company_name: str,
    alert_type: str,
    target_value: float,
    current_return_pct: float,
    current_price: float,
    entry_price: float,
    scope_title: str = "Titanes Portfolio",
) -> bool:
    """Format and dispatch a high-priority Stock Sell Alert to Telegram."""
    is_profit = alert_type == "PROFIT_TARGET" or current_return_pct >= 0
    now_str = datetime.now(COLOMBIA_TZ).strftime("%d/%m/%Y %I:%M %p")

    clean_ticker = html.escape(ticker.split("::")[0])
    clean_company = html.escape(company_name or clean_ticker)
    clean_scope = html.escape(scope_title)

    if is_profit:
        header = "🎯 <b>OBJETIVO DE GANANCIA ALCANZADO</b>"
        action = "💡 <i>Sugerencia:</i> Considera toma de beneficios (venta parcial o total)."
        badge = "🟢"
    else:
        header = "🛑 <b>LÍMITE STOP LOSS ACTIVADO</b>"
        action = "⚠️ <i>Sugerencia:</i> Control de riesgo preventivo (revisar posición)."
        badge = "🔴"

    return_sign = "+" if current_return_pct >= 0 else ""
    target_sign = "+" if target_value >= 0 else ""

    message = (
        f"{header}\n\n"
        f"📊 <b>Activo:</b> {clean_ticker} ({clean_company})\n"
        f"📁 <b>Estrategia:</b> {clean_scope}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"{badge} <b>Retorno Actual:</b> <code>{return_sign}{current_return_pct:.2f}%</code>\n"
        f"🎯 <b>Objetivo Configurado:</b> <code>{target_sign}{target_value:.2f}%</code>\n"
        f"💵 <b>Precio Actual:</b> <code>${current_price:,.2f} USD</code>\n"
        f"📥 <b>Precio de Entrada:</b> <code>${entry_price:,.2f} USD</code>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"{action}\n\n"
        f"🕒 <i>{now_str} (Colombia)</i>"
    )

    return send_telegram_message(message, parse_mode="HTML")


def send_debt_reminder_telegram(
    concept: str,
    person_name: str,
    amount: float,
    due_date: Optional[str],
    debt_type: str = "payable",
    payment_method: Optional[str] = None,
    currency: str = "COP",
) -> bool:
    """Send an instant Telegram alarm for debt due dates (both payables and receivables)."""
    now = datetime.now(COLOMBIA_TZ)
    now_str = now.strftime("%d/%m/%Y %I:%M %p")
    today_str = now.strftime("%Y-%m-%d")

    clean_concept = html.escape(concept or "Deuda")
    clean_person = html.escape(person_name or "Particular")
    clean_method = html.escape(payment_method or "Transferencia")
    formatted_amount = f"${amount:,.0f} {currency}".replace(",", ".")

    is_receivable = debt_type == "receivable"

    # Compute urgency badge and relative days
    urgency_badge = "🗓️"
    relative_time = ""
    if due_date:
        if due_date == today_str:
            urgency_badge = "⏰ <b>¡VENCE HOY!</b>"
            relative_time = "El pago debe realizarse hoy."
        elif due_date < today_str:
            urgency_badge = "⚠️ <b>¡VENCIDO!</b>"
            relative_time = f"La fecha acordada fue {due_date}."
        else:
            urgency_badge = f"🗓️ <b>Programado para: {due_date}</b>"
            relative_time = f"Fecha límite acordada: {due_date}."

    if is_receivable:
        header = "🤝 <b>RECORDATORIO: COBRO DE PRÉSTAMO A TU FAVOR</b>"
        role_label = "👤 <b>Quién te debe (Deudor):</b>"
        amount_label = "💰 <b>Monto Pendiente por Cobrar:</b>"
        action = "💡 <i>Recuerda contactar al deudor o verificar tu cuenta/cajita para registrar el cobro.</i>"
    else:
        header = "💳 <b>RECORDATORIO: PAGO DE DEUDA PENDIENTE</b>"
        role_label = "👤 <b>Acreedor (A quién debes):</b>"
        amount_label = "💵 <b>Cuota / Saldo a Pagar:</b>"
        action = f"💡 <i>Recuerda realizar el abono vía: <b>{clean_method}</b> y registrarlo en la app.</i>"

    message = (
        f"{header}\n\n"
        f"📋 <b>Concepto:</b> {clean_concept}\n"
        f"{role_label} {clean_person}\n"
        f"{amount_label} <code>{formatted_amount}</code>\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"{urgency_badge}\n"
        f"ℹ️ {relative_time}\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"{action}\n\n"
        f"🕒 <i>Titanes Portfolio • {now_str}</i>"
    )

    return send_telegram_message(message, parse_mode="HTML")


def send_test_telegram() -> dict[str, Any]:
    """Test function to verify bot token and chat ID connectivity."""
    config = get_telegram_config()
    if not config["enabled"]:
        return {
            "success": False,
            "error": "Faltan credenciales: define TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en tu archivo .env",
        }

    now_str = datetime.now(COLOMBIA_TZ).strftime("%d/%m/%Y %I:%M %p")
    test_msg = (
        "⚡ <b>Titanes Portfolio - Notificación de Prueba</b> ⚡\n\n"
        "✅ ¡Conexión con el bot de Telegram establecida con éxito!\n"
        f"📲 Recibirás aquí tus alarmas de Take-Profit y Stop-Loss.\n\n"
        f"🕒 <i>{now_str}</i>"
    )
    ok = send_telegram_message(test_msg, parse_mode="HTML")
    return {
        "success": ok,
        "chat_id": config["chat_id"],
        "message": "Mensaje de prueba enviado a Telegram" if ok else "Error al enviar mensaje. Revisa el Token o Chat ID.",
    }
