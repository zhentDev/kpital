"""
Email Notification Service for Titanes Portfolio.
Sends beautiful HTML alert emails when stock positions hit profit targets or stop loss limits.
Supports standard SMTP (e.g. Gmail, Outlook, Amazon SES, Brevo, Sendgrid, Resend).
"""

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, Tuple
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Ensure .env is loaded
load_dotenv()


def get_smtp_config() -> dict:
    load_dotenv(override=True)
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "").strip()
    raw_password = os.environ.get("SMTP_PASSWORD", "").strip()
    # Strip quotes if user wrote SMTP_PASSWORD="..." in .env
    password = raw_password.strip('"').strip("'")
    from_email = os.environ.get("SMTP_FROM", "").strip()
    # If SMTP_FROM is the placeholder or empty, fallback to user
    if not from_email or from_email == "tu_correo@gmail.com":
        from_email = user or "alerts@titanes-portfolio.com"

    enabled = bool(user and password)
    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_email": from_email,
        "enabled": enabled,
    }



def send_sell_alert_email(
    to_email: str,
    ticker: str,
    company_name: str,
    alert_type: str,
    target_value: float,
    current_return_pct: float,
    current_price: float,
    entry_price: float,
    scope_title: str = "Titanes Tecnológicos",
) -> bool:
    """
    Sends an aesthetic HTML email notifying the user that a position reached its profit/stop-loss sell condition.
    """
    if not to_email:
        logger.warning("[EMAIL] Cannot send alert: recipient email is missing.")
        return False

    is_profit = alert_type == "PROFIT_TARGET" or current_return_pct >= 0
    badge_color = "#10b981" if is_profit else "#ef4444"
    badge_label = "🎯 OBJETIVO DE GANANCIA ALCANZADO" if is_profit else "🛑 LÍMITE STOP LOSS ACTIVADO"
    action_text = "sugerencia de toma de beneficio (Venta parcial o total)" if is_profit else "sugerencia de control de riesgo (Venta preventiva)"

    subject = f"{'🟢' if is_profit else '🔴'} Alerta de Venta: {ticker} ({'+' if current_return_pct >= 0 else ''}{current_return_pct:.2f}%) en {scope_title}"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #0b0f19;
          color: #f1f5f9;
          margin: 0;
          padding: 24px;
        }}
        .container {{
          max-width: 580px;
          margin: 0 auto;
          background: #111827;
          border: 1px solid #1f2937;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }}
        .header {{
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          padding: 24px 28px;
          border-bottom: 1px solid #1e293b;
        }}
        .logo {{
          font-size: 1.1rem;
          font-weight: 800;
          color: #00e5ff;
          letter-spacing: -0.02em;
        }}
        .content {{
          padding: 28px;
        }}
        .badge {{
          display: inline-block;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #ffffff;
          background-color: {badge_color};
          margin-bottom: 16px;
        }}
        .ticker-row {{
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 6px;
        }}
        .ticker-title {{
          font-size: 1.8rem;
          font-weight: 900;
          color: #ffffff;
          margin: 0;
        }}
        .company {{
          font-size: 0.95rem;
          color: #94a3b8;
          margin-bottom: 24px;
        }}
        .metrics-card {{
          background: #1a2234;
          border: 1px solid #283548;
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 24px;
        }}
        .metric-row {{
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #222f42;
          font-size: 0.88rem;
        }}
        .metric-row:last-child {{
          border-bottom: none;
        }}
        .metric-label {{
          color: #94a3b8;
        }}
        .metric-val {{
          font-family: 'JetBrains Mono', monospace, Courier;
          font-weight: 700;
          color: #ffffff;
        }}
        .metric-highlight {{
          color: {badge_color};
          font-size: 1.15rem;
          font-weight: 800;
        }}
        .footer {{
          padding: 20px 28px;
          background: #0d121f;
          border-top: 1px solid #1a2234;
          font-size: 0.75rem;
          color: #64748b;
          text-align: center;
        }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">⚡ Kpital Zhent • Alerta Automatizada</div>
        </div>
        <div class="content">
          <div class="badge">{badge_label}</div>
          <h1 class="ticker-title">{ticker}</h1>
          <div class="company">{company_name} ({scope_title})</div>

          <p style="font-size: 0.92rem; color: #cbd5e1; line-height: 1.5; margin-bottom: 20px;">
            Tu posición ha alcanzado el umbral objetivo configurado (<b>{target_value:+.1f}%</b>), generando una {action_text}.
          </p>

          <div class="metrics-card">
            <div class="metric-row">
              <span class="metric-label">Rentabilidad Actual:</span>
              <span class="metric-val metric-highlight">{'+' if current_return_pct >= 0 else ''}{current_return_pct:.2f}%</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Precio Actual de Mercado:</span>
              <span class="metric-val">${current_price:.2f} USD</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Precio de Compra / Entrada:</span>
              <span class="metric-val">${entry_price:.2f} USD</span>
            </div>
            <div class="metric-row">
              <span class="metric-label">Umbral de Alerta Establecido:</span>
              <span class="metric-val">{target_value:+.1f}%</span>
            </div>
          </div>

          <p style="font-size: 0.8rem; color: #94a3b8; margin: 0;">
            Ingresa a tu terminal para ejecutar la orden de venta o ajustar tus parámetros de salida.
          </p>
        </div>
        <div class="footer">
          Kpital Zhent Terminal • Notificación generada automáticamente para {to_email}
        </div>
      </div>
    </body>
    </html>
    """

    cfg = get_smtp_config()
    if not cfg["enabled"]:
        logger.info(
            f"[EMAIL SIMULATION] SMTP not configured. Notification simulated for {to_email}: "
            f"{ticker} reached {current_return_pct:.2f}% (Target: {target_value}%)"
        )
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = cfg["from_email"]
        msg["To"] = to_email

        part = MIMEText(html_body, "html")
        msg.attach(part)

        if cfg["port"] == 465:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=12) as server:
                server.login(cfg["user"], cfg["password"])
                server.sendmail(cfg["from_email"], [to_email], msg.as_string())
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=12) as server:
                server.starttls()
                server.login(cfg["user"], cfg["password"])
                server.sendmail(cfg["from_email"], [to_email], msg.as_string())

        logger.info(f"[EMAIL] Alert email successfully sent to {to_email} for {ticker}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Failed to send email to {to_email}: {e}")
        return False


def send_test_email(to_email: str) -> dict:
    """
    Sends a test verification email and returns detailed status and diagnosis if it fails.
    """
    cfg = get_smtp_config()
    if not cfg["user"] or not cfg["password"]:
        return {
            "success": False,
            "error": "Faltan credenciales SMTP. Por favor verifica SMTP_USER y SMTP_PASSWORD en el archivo .env",
            "config": {
                "host": cfg["host"],
                "port": cfg["port"],
                "user": cfg["user"],
                "from": cfg["from_email"],
            },
        }

    target_email = to_email or cfg["user"]
    try:
        subject = "🧪 Verificación Exitosa: Alertas Kpital Zhent Portfolio"
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 24px;">
          <div style="max-width: 520px; margin: 0 auto; background: #131b2e; border: 1px solid #10b981; border-radius: 12px; padding: 24px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="font-size: 2.5rem;">🎉</span>
              <h2 style="color: #10b981; margin: 8px 0 0 0;">¡Servicio de Alertas Conectado!</h2>
              <p style="color: #94a3b8; font-size: 0.9rem;">Prueba de verificación SMTP completada con éxito</p>
            </div>
            <p style="font-size: 0.9rem; line-height: 1.5; color: #e2e8f0;">
              Tu terminal <strong>Kpital Zhent</strong> está configurada correctamente. A partir de ahora, cuando cualquiera de tus acciones o lotes alcance el objetivo de ganancia o límite de stop loss configurado, recibirás la notificación al instante aquí.
            </p>
            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px 16px; margin: 18px 0; font-size: 0.8rem; color: #cbd5e1;">
              <div><strong>Servidor SMTP:</strong> {cfg['host']}:{cfg['port']}</div>
              <div><strong>Remitente:</strong> {cfg['from_email']}</div>
              <div><strong>Destinatario:</strong> {target_email}</div>
            </div>
            <p style="font-size: 0.75rem; color: #64748b; text-align: center; margin: 0;">
              Kpital Zhent Terminal • Sistema Inteligente de Notificaciones
            </p>
          </div>
        </body>
        </html>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = cfg["from_email"]
        msg["To"] = target_email
        msg.attach(MIMEText(html_body, "html"))

        if cfg["port"] == 465:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=12) as server:
                server.login(cfg["user"], cfg["password"])
                server.sendmail(cfg["from_email"], [target_email], msg.as_string())
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=12) as server:
                server.starttls()
                server.login(cfg["user"], cfg["password"])
                server.sendmail(cfg["from_email"], [target_email], msg.as_string())

        return {
            "success": True,
            "message": f"Correo de prueba enviado con éxito a {target_email}",
            "config": {
                "host": cfg["host"],
                "port": cfg["port"],
                "user": cfg["user"],
                "from": cfg["from_email"],
            },
        }
    except (smtplib.SMTPAuthenticationError, smtplib.SMTPServerDisconnected) as e:
        return {
            "success": False,
            "error": "Error de autenticación SMTP con Gmail (BadCredentials). Google no permite usar tu contraseña personal habitual para aplicaciones externas; requiere una 'Contraseña de Aplicación' de 16 letras.",
            "raw_error": str(e),
            "instructions": "Pasos para habilitarlo en 1 minuto:\n1. Ve a https://myaccount.google.com/apppasswords\n2. Si te lo pide, activa 'Verificación en dos pasos'.\n3. Crea un nombre (ej: 'Titanes') y pulsa 'Crear'.\n4. Copia el código de 16 caracteres generado (ej: 'xxxx xxxx xxxx xxxx').\n5. En tu archivo .env, coloca: SMTP_PASSWORD=tu_codigo_de_16_letras (sin espacios).\n6. Asegúrate de tener SMTP_FROM=zhendev@gmail.com.",
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Error conectando con el servidor SMTP: {str(e)}",
            "raw_error": str(e),
        }


