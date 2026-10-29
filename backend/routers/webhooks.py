"""Mobile Webhooks Router for Titanes Portfolio.

Automates bank expense and income registration triggered by Android automation tools
(e.g., MacroDroid, Tasker) via secure webhook endpoints.
Updates account balances, registers transactions in DuckDB and fixed_income.json,
and keeps the dual database in perfect sync.
"""

import logging
import os
import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from routers.cash_flow import load_cash_flow_db, save_cash_flow_db
from routers.fixed_income import OWNER_ID, load_fixed_income_db, save_fixed_income_db

# Ensure environment variables are loaded
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = logging.getLogger("webhooks")
router = APIRouter()

# Timezone Colombia (UTC-5)
COLOMBIA_TZ = timezone(timedelta(hours=-5))


def get_current_colombia_time() -> datetime:
    return datetime.now(COLOMBIA_TZ)


def normalize_text(text: str | None) -> str:
    """Normalize text removing accents, punctuation, and lowering for robust matching."""
    if not text:
        return ""
    text_str = str(text).lower().strip()
    return "".join(
        c for c in unicodedata.normalize("NFD", text_str)
        if unicodedata.category(c) != "Mn"
    )


def parse_cop_amount(val: Any) -> float:
    """Safely parse Colombian currency representations into positive float.

    Handles:
      - 35000 -> 35000.0
      - "$35.000" -> 35000.0 (Colombian thousand separator)
      - "1.250.000,50" -> 1250000.5
      - "$ 45,000" -> 45000.0
      - 45000.5 -> 45000.5
    """
    if isinstance(val, (int, float)):
        return abs(float(val))
    if not isinstance(val, str):
        return 0.0

    s = val.replace("$", "").replace("COP", "").replace("cop", "").strip()

    # Comma and dot both present: handle both European (1.250.000,50) and Anglo (8,667.00) formats
    if "," in s and "." in s:
        comma_idx = s.rfind(",")
        dot_idx = s.rfind(".")
        if dot_idx > comma_idx:
            # Anglo: 8,667.00 -> comma is thousands, dot is cents
            s = s.replace(",", "")
        else:
            # European/Latin: 1.250.000,50 -> dot is thousands, comma is cents
            s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            s = parts[0].replace(".", "") + "." + parts[1]
        else:
            s = s.replace(",", "")
    elif "." in s:
        parts = s.split(".")
        # If last part has 3 digits or there are multiple dots, it's thousands separator
        if len(parts[-1]) == 3 or len(parts) > 2:
            s = s.replace(".", "")

    cleaned = re.sub(r"[^\d.]", "", s)
    try:
        return abs(float(cleaned)) if cleaned else 0.0
    except ValueError:
        return 0.0


def verify_secret_auth(
    token: str | None = None,
    secret: str | None = None,
    x_webhook_secret: str | None = None,
    authorization: str | None = None,
) -> bool:
    """Verify webhook authentication against WEBHOOK_SECRET_KEY in environment."""
    expected_secret = os.getenv("WEBHOOK_SECRET_KEY", "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2")
    if not expected_secret:
        logger.error("[Webhook Auth] WEBHOOK_SECRET_KEY is not defined in environment variables.")
        raise HTTPException(status_code=500, detail="Server configuration error: WEBHOOK_SECRET_KEY is missing.")

    candidate = None
    if x_webhook_secret:
        candidate = x_webhook_secret.strip()
    elif authorization:
        parts = authorization.strip().split()
        candidate = parts[-1] if len(parts) > 1 else parts[0]
    elif token:
        candidate = token.strip()
    elif secret:
        candidate = secret.strip()

    if not candidate or candidate != expected_secret.strip():
        logger.warning(f"[Webhook Auth] Unauthorized attempt. Received: '{candidate}'")
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid or missing webhook authentication key.",
        )
    return True


# --- Models ---


class MobileTransactionPayload(BaseModel):
    entity: str = Field(..., description="Entity name or ID (e.g. 'Nu Colombia', 'Nu', 'RappiPay', 'Caja Social')")
    account: str = Field(..., description="Account or pocket name/id (e.g. 'acc_viaje', 'Viaje', 'Estudios', 'Principal')")
    amount: Any = Field(..., description="Amount (e.g. 45000, '$45.000', 35000.5)")
    description: str = Field(..., description="Commerce or transaction description (e.g. 'Éxito', 'Uber', 'D1')")
    type: str = Field("debit", description="Transaction type: 'debit' (gasto/compra) or 'credit' (ingreso/abono)")
    date: str | None = Field(None, description="Date in YYYY-MM-DD or ISO format. Defaults to current date in Colombia")
    category: str | None = Field(None, description="Optional category (e.g. 'Alimentación', 'Transporte')")
    time: str | None = Field(None, description="Transaction time in HH:MM or HH:MM:SS format")
    raw_text: str | None = Field(None, description="Raw notification body from Android for logging/audit")
    user_id: str | None = Field(None, description="Target user ID (defaults to OWNER_ID)")


# --- Resolution Helpers ---


def resolve_entity(db: dict[str, Any], entity_query: str) -> dict[str, Any]:
    """Finds an existing entity by ID or name (including common aliases), or auto-creates it."""
    eq_norm = normalize_text(entity_query)
    entities = db.get("entities", [])

    # Common aliases mapping
    alias_map = {
        "nu": "Nu Colombia",
        "nubank": "Nu Colombia",
        "cuenta nu": "Nu Colombia",
        "tarjeta nu": "Nu Colombia",
        "rappi": "RappiPay",
        "rappipay": "RappiPay",
        "rappicuenta": "RappiPay",
        "davivienda rappi": "RappiPay",
        "finandina": "Finandina",
        "banco finandina": "Finandina",
        "caja social": "Banco Caja Social",
        "banco caja social": "Banco Caja Social",
        "bcs": "Banco Caja Social",
        "plenti": "Plenti (Ahorros)",
        "pibank": "Pibank",
        "lulo": "Lulo Bank",
        "lulo bank": "Lulo Bank",
        "google wallet": "Google Wallet",
        "billetera de google": "Google Wallet",
        "google pay": "Google Wallet",
        "gpay": "Google Wallet",
        "nequi": "Nequi",
        "nequi colombia": "Nequi",
        "bancolombia nequi": "Nequi",
        "daviplata": "Daviplata",
        "davi plata": "Daviplata",
        "davivienda daviplata": "Daviplata",
    }

    resolved_name = alias_map.get(eq_norm, entity_query.strip())
    resolved_norm = normalize_text(resolved_name)

    # 1. Search exact ID or normalized name
    for e in entities:
        if normalize_text(e.get("id")) == eq_norm or normalize_text(e.get("name")) == resolved_norm:
            return e

    # 2. Substring matching
    for e in entities:
        e_norm = normalize_text(e.get("name"))
        if resolved_norm in e_norm or e_norm in resolved_norm:
            return e

    # 3. Not found -> auto-create new entity so expense is never discarded
    clean_id_suffix = re.sub(r"[^a-z0-9]", "", resolved_norm)[:12] or "bank"
    new_entity_id = f"ent_{clean_id_suffix}_{uuid.uuid4().hex[:4]}"

    # Preset entity visuals
    entity_presets = {
        "Nequi": {"color": "#20002c", "icon": "🟣"},
        "Daviplata": {"color": "#ed1c24", "icon": "📲"},
        "RappiPay": {"color": "#ff441f", "icon": "🧡"},
        "Nu Colombia": {"color": "#820ad1", "icon": "💜"},
        "Banco Caja Social": {"color": "#0055b8", "icon": "🏛️"},
        "Finandina": {"color": "#d10a5a", "icon": "💜"},
        "Plenti (Ahorros)": {"color": "#7c3aed", "icon": "🟣"},
    }
    preset = entity_presets.get(resolved_name, {"color": "#3b82f6", "icon": "🏦"})

    new_entity = {
        "id": new_entity_id,
        "name": resolved_name,
        "country": "🇨🇴",
        "color": preset["color"],
        "icon": preset["icon"],
        "createdAt": get_current_colombia_time().isoformat(),
    }
    entities.append(new_entity)
    db["entities"] = entities
    logger.info(f"[Webhook] Auto-created new entity: {new_entity}")
    return new_entity


def clean_account_query(query: str | None) -> str:
    """Robustly cleans account query from dialog strings, stripping emojis, bank prefixes, and trailing balance/cupo notes."""
    if not query:
        return ""
    s = str(query).strip()
    # 1. Strip common leading emojis and icons (e.g. ⭐, 💳, 📦, ❌)
    s = re.sub(r"^[\W_]+", "", s).strip()
    # 2. Remove trailing parenthetical balances, limits, or cupo notes
    # (e.g. '(Cupo libre: $470,300)', '($1,475,511)', '($0)', '($296,484)')
    s = re.sub(r"\s*\([^)]*(?:\$|\d|cupo|saldo)[^)]*\)\s*$", "", s, flags=re.IGNORECASE).strip()
    # 3. Strip bank prefix like 'Nu - Cajita' or 'Nu: Cajita' safely without corrupting interior colons
    if " - " in s:
        parts = s.split(" - ", 1)
        if len(parts) > 1 and len(parts[1].strip()) > 1:
            s = parts[1].strip()
    elif re.match(r"^[A-Za-z0-9\s]+:\s+", s):
        s = re.sub(r"^[A-Za-z0-9\s]+:\s+", "", s).strip()
    return s.strip()


def resolve_account(db: dict[str, Any], entity: dict[str, Any], account_query: str) -> dict[str, Any]:
    """Finds an existing account/pocket belonging to the entity or globally, or auto-creates it."""
    cleaned_query = clean_account_query(account_query)
    aq_norm = normalize_text(cleaned_query)
    accounts = db.get("accounts", [])
    entity_id = entity.get("id")

    # Filter candidate accounts for this entity first
    candidate_accounts = [a for a in accounts if a.get("entityId") == entity_id]

    # 0. Check if account_query is a numeric index from dialog (e.g. "1", "2", "3")
    if cleaned_query.isdigit():
        idx = int(cleaned_query)
        if idx == 1:
            for a in candidate_accounts:
                if any(k in normalize_text(a.get("name")) for k in ["nomina", "principal", "ahorros"]):
                    return a
            # Will be auto-created below as Cuenta Nómina / Principal
            cleaned_query = "Cuenta Nómina / Principal"
            aq_norm = normalize_text(cleaned_query)
        else:
            pockets = [
                a for a in candidate_accounts
                if not any(k in normalize_text(a.get("name")) for k in ["nomina", "principal", "ahorros"])
            ]
            pocket_idx = idx - 2
            if 0 <= pocket_idx < len(pockets):
                return pockets[pocket_idx]

    # 1. Check exact ID match in entity accounts
    for a in candidate_accounts:
        if a.get("id") == account_query or a.get("id") == cleaned_query:
            return a

    # 2. Check exact name match in entity accounts
    for a in candidate_accounts:
        if normalize_text(a.get("name")) == aq_norm:
            return a

    # 3. Check substring match in entity accounts (e.g. "viaje" in "Cajita Viaje")
    for a in candidate_accounts:
        a_norm = normalize_text(a.get("name"))
        if aq_norm in a_norm or a_norm in aq_norm:
            return a

    # 4. Check if requesting salary / principal account
    is_main_account = any(k in aq_norm for k in ["principal", "nomina", "ahorros", "cuenta"])
    if is_main_account:
        for a in candidate_accounts:
            if any(k in normalize_text(a.get("name")) for k in ["nomina", "principal", "ahorros"]):
                return a

    # 5. Fallback search across all accounts if entity filter was too strict
    for a in accounts:
        if a.get("id") == account_query or normalize_text(a.get("name")) == aq_norm:
            return a

    # 6. Account not found -> Auto-create account under this entity
    is_digital_wallet = any(w in normalize_text(entity.get("name", "")) for w in ["nequi", "daviplata"])
    account_cat = "digital_wallet" if is_digital_wallet else ("payroll" if is_main_account else "high_yield")
    acc_type = "wallet" if is_digital_wallet else ("savings" if is_main_account else "pocket")
    default_rate = 0.0 if is_digital_wallet else 12.0

    if "nequi" in normalize_text(entity.get("name", "")):
        clean_name = "Disponible Nequi"
    elif "daviplata" in normalize_text(entity.get("name", "")):
        clean_name = "Daviplata Principal"
    elif is_main_account:
        clean_name = "Cuenta Nómina / Principal"
    else:
        clean_name = cleaned_query or "Bolsillo"

    new_acc_id = f"acc_{re.sub(r'[^a-z0-9]', '', aq_norm)[:10]}_{uuid.uuid4().hex[:4]}"
    new_account = {
        "id": new_acc_id,
        "entityId": entity_id,
        "name": clean_name,
        "type": acc_type,
        "accountCategory": account_cat,
        "syncType": "api",
        "currency": "COP",
        "balance": 0.0,
        "interestRateEA": default_rate,
        "isTaxExemptGMF": True,
        "rateHistory": [
            {
                "date": get_current_colombia_time().strftime("%Y-%m-%d"),
                "rateEA": default_rate,
            }
        ],
        "createdAt": get_current_colombia_time().isoformat(),
    }
    accounts.append(new_account)
    db["accounts"] = accounts
    logger.info(f"[Webhook] Auto-created new account: {new_account}")
    return new_account


# --- Endpoints ---


@router.get("/health")
def webhook_health(
    token: str | None = Query(None),
    secret: str | None = Query(None),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
    authorization: str | None = Header(None),
):
    """Healthcheck endpoint to verify endpoint status and authentication from mobile."""
    verify_secret_auth(token, secret, x_webhook_secret, authorization)
    now_col = get_current_colombia_time()
    return {
        "status": "healthy",
        "service": "Titanes Portfolio Mobile Webhooks",
        "server_time_colombia": now_col.isoformat(),
    }


@router.get("/mobile-accounts")
def list_mobile_accounts(
    token: str | None = Query(None),
    secret: str | None = Query(None),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
    authorization: str | None = Header(None),
    user_id: str | None = Query(None),
):
    """Returns available entities and their pockets/accounts with balances.

    Ideal for setting up MacroDroid variables and interactive dialog options.
    """
    verify_secret_auth(token, secret, x_webhook_secret, authorization)
    effective_uid = user_id or OWNER_ID
    db = load_fixed_income_db(effective_uid)

    entities = db.get("entities", [])
    accounts = db.get("accounts", [])

    grouped = []
    for ent in entities:
        ent_accounts = [
            {
                "id": acc.get("id"),
                "name": acc.get("name"),
                "type": acc.get("type", "savings"),
                "accountCategory": acc.get("accountCategory", "high_yield"),
                "syncType": acc.get("syncType", "api"),
                "balance": acc.get("balance", 0.0),
                "currency": acc.get("currency", "COP"),
            }
            for acc in accounts
            if acc.get("entityId") == ent.get("id")
        ]
        grouped.append({
            "id": ent.get("id"),
            "name": ent.get("name"),
            "country": ent.get("country", "🇨🇴"),
            "icon": ent.get("icon", "🏦"),
            "accounts": ent_accounts,
        })

    return {
        "success": True,
        "total_entities": len(entities),
        "total_accounts": len(accounts),
        "entities": grouped,
    }


@router.get("/mobile-pockets")
def get_mobile_pockets(
    bank: str | None = Query(None, description="Bank or entity name (Nu, Rappi, Caja Social, Google Wallet, etc.)"),
    tx_type: str = Query("debit", description="Transaction type: 'debit' (gasto) or 'credit' (ingreso)"),
    token: str | None = Query(None),
    secret: str | None = Query(None),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
    authorization: str | None = Header(None),
    user_id: str | None = Query(None),
):
    """Dynamically returns available accounts and pockets formatted for MacroDroid interactive dialogs.

    - Prioritizes 'Cuenta Nómina / Principal'
    - Follows with active savings pockets (Cajitas) with live balances
    - Provides ready-to-use array ('pockets') and CSV string ('pockets_csv')
    """
    verify_secret_auth(token, secret, x_webhook_secret, authorization)
    effective_uid = user_id or OWNER_ID
    db = load_fixed_income_db(effective_uid)

    entities = db.get("entities", [])
    accounts = db.get("accounts", [])

    is_all_banks = not bank or normalize_text(bank) in (
        "all", "todas", "todos", "google wallet", "billetera de google", "google pay", "gpay"
    )

    if not is_all_banks:
        matched_entity = resolve_entity(db, bank)
        ent_id = matched_entity.get("id")
        ent_accounts = [a for a in accounts if a.get("entityId") == ent_id]

        # Prioritize Nómina / Principal / Wallet disponible
        principal_acc = next(
            (a for a in ent_accounts if any(k in normalize_text(a.get("name")) for k in ["nomina", "principal", "ahorros", "disponible", "debito"]) or a.get("accountCategory") in ["payroll", "digital_wallet"]),
            None
        )

        pockets_list = []
        clean_names = []

        ent_clean_name = matched_entity.get("name", "")
        if "nu" in normalize_text(ent_clean_name):
            default_main_label = "Cuenta Nu Débito (Nómina)"
        elif "rappi" in normalize_text(ent_clean_name):
            default_main_label = "Cuenta RappiPay (Principal)"
        elif "nequi" in normalize_text(ent_clean_name):
            default_main_label = "Disponible Nequi"
        elif "daviplata" in normalize_text(ent_clean_name):
            default_main_label = "Daviplata Principal"
        elif "finandina" in normalize_text(ent_clean_name):
            default_main_label = "Cuenta Finandina (Principal)"
        else:
            default_main_label = f"Cuenta {ent_clean_name} (Principal)"

        # 1. Main / Salary account first
        if principal_acc:
            pockets_list.append(f"⭐ {principal_acc['name']} (${principal_acc.get('balance', 0):,.0f})")
            clean_names.append(principal_acc["name"])
        else:
            pockets_list.append(f"⭐ {default_main_label} ($0)")
            clean_names.append(default_main_label)

        # 2. Credit Cards belonging to this entity or matched bank (ej. Tarjeta Nu Crédito 3887)
        try:
            cf_db = load_cash_flow_db(effective_uid)
            credit_cards = cf_db.get("creditCards", [])
            for c in credit_cards:
                c_name_norm = normalize_text(c.get("name", ""))
                c_id_norm = normalize_text(c.get("id", ""))
                is_match = (
                    ("nu" in normalize_text(ent_clean_name) and ("nu" in c_name_norm or "nu" in c_id_norm)) or
                    ("rappi" in normalize_text(ent_clean_name) and ("rappi" in c_name_norm or "rappi" in c_id_norm)) or
                    ent_clean_name.lower() in c_name_norm
                )
                if is_match:
                    tot_lim = float(c.get("totalLimit", 0))
                    used_lim = float(c.get("usedLimit", 0))
                    avail_lim = max(0.0, tot_lim - used_lim)
                    pockets_list.append(f"💳 {c['name']} (Cupo libre: ${avail_lim:,.0f})")
                    clean_names.append(c["name"])
        except Exception as err:
            logger.warning(f"[Webhook] Error adding credit cards to pockets: {err}")

        # 3. Pockets (Cajitas)
        for a in ent_accounts:
            if principal_acc and a.get("id") == principal_acc.get("id"):
                continue
            bal = a.get("balance", 0.0)
            pockets_list.append(f"📦 {a['name']} (${bal:,.0f})")
            clean_names.append(a["name"])

        # 4. Cancel / Ignore option
        pockets_list.append("❌ Ignorar / Cancelar")
        clean_names.append("Ignorar / Cancelar")

        return {
            "success": True,
            "entity": {
                "id": matched_entity.get("id"),
                "name": matched_entity.get("name"),
            },
            "tx_type": tx_type,
            "pockets": pockets_list,
            "pocket_names": clean_names,
            "pockets_csv": ",".join(clean_names),
        }

    # All banks / Google Wallet fallback
    all_pockets = []
    all_names = []

    # Include credit cards in global list
    try:
        cf_db = load_cash_flow_db(effective_uid)
        for c in cf_db.get("creditCards", []):
            tot_lim = float(c.get("totalLimit", 0))
            used_lim = float(c.get("usedLimit", 0))
            avail_lim = max(0.0, tot_lim - used_lim)
            all_pockets.append(f"💳 {c['name']} (Cupo libre: ${avail_lim:,.0f})")
            all_names.append(c["name"])
    except Exception as err:
        logger.warning(f"[Webhook] Error adding credit cards to all_pockets: {err}")

    for ent in entities:
        short_bank = ent.get("name", "").replace("Colombia", "").replace("(Ahorros)", "").strip()
        ent_accs = [a for a in accounts if a.get("entityId") == ent.get("id")]
        for a in ent_accs:
            bal = a.get("balance", 0.0)
            all_pockets.append(f"{short_bank}: {a['name']} (${bal:,.0f})")
            all_names.append(f"{short_bank} - {a['name']}")

    all_pockets.append("❌ Ignorar / Cancelar")
    all_names.append("Ignorar / Cancelar")

    return {
        "success": True,
        "entity": {
            "id": "all",
            "name": "Billetera de Google / Múltiples Bancos",
        },
        "tx_type": tx_type,
        "pockets": all_pockets,
        "pocket_names": all_names,
        "pockets_csv": ",".join(all_names),
    }


@router.post("/mobile-transaction")
def register_mobile_transaction(
    payload: MobileTransactionPayload,
    request: Request,
    token: str | None = Query(None),
    secret: str | None = Query(None),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
    authorization: str | None = Header(None),
):
    """Register mobile bank transaction from Android automation (MacroDroid).

    - Authenticated via WEBHOOK_SECRET_KEY
    - Deducts (or increases) account balance
    - Appends transaction to DuckDB, PostgreSQL, and JSON
    """
    verify_secret_auth(token, secret, x_webhook_secret, authorization)

    effective_uid = payload.user_id or OWNER_ID
    db = load_fixed_income_db(effective_uid)

    # 1. Parse amount
    amount_val = parse_cop_amount(payload.amount)
    if amount_val <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"Monto inválido o no detectable: '{payload.amount}'",
        )

    # 2. Determine transaction type (debit vs credit) with smart keyword detection
    norm_type = normalize_text(payload.type)
    search_context = f"{payload.description} {payload.raw_text or ''}".lower()

    # Phrases that unmistakably indicate incoming money (Credit / Consignación)
    unmistakable_credit_phrases = [
        "te envio", "te envió", "te enviaron", "te transfirio", "te transfirió",
        "te transfirieron", "recibiste", "consignacion", "consignación",
        "abono de", "pasaplata", "te pasaron", "pago recibido"
    ]

    # Phrases that unmistakably indicate outgoing money (Debit / Gasto)
    unmistakable_debit_phrases = [
        "enviaste", "le enviaste", "pagaste", "compraste", "compra en", "retiro en"
    ]

    if any(k in search_context for k in unmistakable_credit_phrases):
        tx_type = "credit"
        signed_amount = amount_val
    elif any(k in search_context for k in unmistakable_debit_phrases):
        tx_type = "debit"
        signed_amount = -amount_val
    elif any(k in norm_type for k in ["debit", "gasto", "compra", "salida", "retiro"]):
        tx_type = "debit"
        signed_amount = -amount_val
    elif any(k in norm_type for k in ["credit", "ingreso", "abono", "entrada", "consignacion"]):
        tx_type = "credit"
        signed_amount = amount_val
    else:
        tx_type = "debit"
        signed_amount = -amount_val

    # 2b. Auto-correct entity only if NOT a destination bank mention (e.g. 'le enviaste a X en su cuenta de RAPPIPAY' is from Nu, NOT RappiPay!)
    is_destination_mention = any(
        phrase in search_context
        for phrase in ["en su cuenta de", "a la cuenta de", "hacia la cuenta", "le enviaste a", "cuenta destino"]
    )
    if not is_destination_mention:
        if any(k in search_context for k in ["rappicuenta", "rappipay", "rappi"]):
            if "rappi" not in normalize_text(payload.entity):
                logger.info(f"[Webhook] Auto-correcting entity from '{payload.entity}' to 'RappiPay' based on notification text.")
                payload.entity = "RappiPay"
        elif any(k in search_context for k in ["nubank", "cuenta nu", "tarjeta nu"]):
            if "nu" not in normalize_text(payload.entity):
                logger.info(f"[Webhook] Auto-correcting entity from '{payload.entity}' to 'Nu Colombia' based on notification text.")
                payload.entity = "Nu Colombia"
    elif "finandina" in search_context:
        # Finandina notifica por SMS (remitente 890809), p.ej.:
        # "Banco Finandina te informa que recibiste $350.000 con exito a la llave Bre-B ..."
        if "finandina" not in normalize_text(payload.entity):
            logger.info(f"[Webhook] Auto-correcting entity from '{payload.entity}' to 'Finandina' based on SMS text.")
            payload.entity = "Finandina"
        # Los movimientos Bre-B / transferencias llegan a la cuenta principal FlexiDigital +
        if not payload.account or normalize_text(payload.account) in ("", "sms", "mensaje", "finandina", "banco finandina"):
            payload.account = "FlexiDigital + (Principal)"

    # If entity is Google Wallet, resolve bank from card mention in notification text
    if normalize_text(payload.entity) in ("google wallet", "billetera de google", "google pay", "gpay"):
        for bank_alias, target_bank in [
            ("nu", "Nu Colombia"),
            ("rappi", "RappiPay"),
            ("caja social", "Banco Caja Social"),
            ("finandina", "Finandina"),
            ("plenti", "Plenti (Ahorros)"),
            ("nequi", "Nequi Colombia"),
        ]:
            if bank_alias in search_context:
                payload.entity = target_bank
                break

    # 3. Resolve Entity and Account
    entity = resolve_entity(db, payload.entity)
    account = resolve_account(db, entity, payload.account)

    # 4. Resolve date and time (America/Bogota timezone)
    now_colombia = get_current_colombia_time()
    if payload.date:
        # Extract YYYY-MM-DD
        tx_date = payload.date.split("T")[0]
    else:
        tx_date = now_colombia.strftime("%Y-%m-%d")

    tx_time = payload.time.strip() if payload.time else now_colombia.strftime("%H:%M:%S")

    # 4b. Check if this transaction is a Credit Card Purchase (e.g. Nu 3887, RappiCard)
    cf_temp = load_cash_flow_db(effective_uid)
    available_cards = cf_temp.get("creditCards", [])
    clean_acc_query = clean_account_query(payload.account)
    aq_clean_norm = normalize_text(clean_acc_query)

    is_cc_purchase = False
    matched_cc = None

    # Check if user selected a credit card from MacroDroid
    for c in available_cards:
        c_name_norm = normalize_text(c.get("name", ""))
        c_id_norm = normalize_text(c.get("id", ""))
        if (c_id_norm and c_id_norm == aq_clean_norm) or (c_name_norm and (c_name_norm in aq_clean_norm or aq_clean_norm in c_name_norm)):
            matched_cc = c
            is_cc_purchase = True
            break
        if "3887" in aq_clean_norm and ("3887" in c_name_norm or "nu" in c_name_norm):
            matched_cc = c
            is_cc_purchase = True
            break

    # Also detect from notification text (e.g., "tarjeta terminada en 3887 ha sido APROBADA")
    if not is_cc_purchase and tx_type == "debit":
        cc_notification_patterns = [
            "ha sido aprobada", "ha sido aprobada.", "compra aprobada",
            "tarjeta de credito", "tarjeta de crédito", "con tu tarjeta"
        ]
        if any(p in search_context for p in cc_notification_patterns) or "3887" in search_context:
            is_cc_purchase = True
            if "3887" in search_context or "nu" in search_context:
                matched_cc = next((c for c in available_cards if "3887" in normalize_text(c.get("name", "")) or "nu" in normalize_text(c.get("name", ""))), None)
            elif "rappi" in search_context:
                matched_cc = next((c for c in available_cards if "rappi" in normalize_text(c.get("name", ""))), None)
            if not matched_cc and available_cards:
                matched_cc = available_cards[0]

    # 5. Update Account Balance with Pocket Overdraft / Cascading Fallback
    previous_balance = float(account.get("balance", 0.0))
    is_pocket = account.get("type") == "pocket" or any(k in normalize_text(account.get("name")) for k in ["cajita", "bolsillo", "impresora"])
    cascaded = False
    covered_by_pocket = 0.0
    shortfall = 0.0
    principal_acc = None
    prev_principal_bal = 0.0
    new_principal_bal = 0.0

    if is_cc_purchase:
        # Credit Card purchases DO NOT deduct from bank savings/payroll accounts!
        new_balance = previous_balance
    elif tx_type == "debit" and is_pocket and amount_val > previous_balance:
        # Movement exceeds what this pocket has!
        # Fallback to the entity's Principal Account
        cascaded = True
        covered_by_pocket = max(0.0, previous_balance)
        shortfall = round(amount_val - covered_by_pocket, 2)

        # Look for entity's principal account
        candidates = [
            a for a in db.get("accounts", [])
            if a.get("entityId") == entity.get("id")
            and a.get("id") != account.get("id")
            and any(k in normalize_text(a.get("name")) for k in ["principal", "nomina", "cuenta", "ahorros", "debito"])
        ]
        if candidates:
            principal_acc = candidates[0]
        else:
            # Auto-create principal account if missing
            principal_acc = resolve_account(db, entity, "Cuenta Principal")

        # Pocket drops to 0
        new_balance = 0.0
        account["balance"] = 0.0

        # Shortfall is deducted from Principal Account
        prev_principal_bal = float(principal_acc.get("balance", 0.0))
        new_principal_bal = round(prev_principal_bal - shortfall, 2)
        principal_acc["balance"] = new_principal_bal

        for idx, a in enumerate(db.get("accounts", [])):
            if a.get("id") == account.get("id"):
                db["accounts"][idx]["balance"] = 0.0
            elif a.get("id") == principal_acc.get("id"):
                db["accounts"][idx]["balance"] = new_principal_bal
    else:
        new_balance = round(previous_balance + signed_amount, 2)
        account["balance"] = new_balance
        for idx, a in enumerate(db.get("accounts", [])):
            if a.get("id") == account.get("id"):
                db["accounts"][idx]["balance"] = new_balance
                break

    # 5b. Smart Detection: Credit Card Debt Payment (Abono a Tarjeta de Crédito)
    cc_payment_phrases = [
        "pagaste tu tarjeta", "pago de tu tarjeta", "pago de tarjeta", "pago tarjeta",
        "abono a tarjeta", "abono tarjeta", "pago de credito", "pago de crédito",
        "recibimos tu pago por", "recibimos tu pago", "pago de factura", "pago factura"
    ]
    card_tokens = ["tarjeta", "credito", "crédito", "nu", "rappi", "visa", "mastercard"]
    is_cc_payment = any(p in search_context for p in cc_payment_phrases) and (
        any(c in search_context for c in card_tokens) or "tarjeta" in search_context
    )

    detected_card_id = None
    detected_card_name = None
    if is_cc_payment:
        if any(k in search_context for k in ["nu", "mastercard"]):
            detected_card_id = "cc_nu"
            detected_card_name = "Tarjeta Nu Mastercard"
        elif any(k in search_context for k in ["rappi", "visa"]):
            detected_card_id = "cc_rappi"
            detected_card_name = "RappiCard Visa (MSI)"
        elif "nu" in normalize_text(entity.get("name", "")):
            detected_card_id = "cc_nu"
            detected_card_name = "Tarjeta Nu Mastercard"
        elif "rappi" in normalize_text(entity.get("name", "")):
            detected_card_id = "cc_rappi"
            detected_card_name = "RappiCard Visa (MSI)"

    # 6. Create Transaction Object & Clean Description
    tx_id = f"tx_mb_{int(now_colombia.timestamp() * 1000)}_{uuid.uuid4().hex[:6]}"
    clean_desc = payload.description.strip()
    generic_bad_descriptions = [
        "tu app", "app", "movimientos", "el detalle", "fue exitoso", "revisa en tus movimientos",
        "gasto", "gasto bancario", "movimiento", "los detalles de tu compra", "tus transacciones",
        "detalles de tu compra", "consulta los detalles"
    ]

    # Smart commerce extraction for Nu Colombia ("Compra por $627.626 en [Comercio]...") and Bancolombia/Rappi
    m_nu_compra = re.search(r"compra\s+(?:por\s+[\$\d\.,\s]+?)?\s*en\s+([A-Za-z0-9\*\.\-_\s]+?)(?:\.|\.\.\.|\,|$|consulta|los detalles)", payload.raw_text or "", re.IGNORECASE)

    if is_cc_payment:
        clean_desc = f"Pago {detected_card_name or 'Tarjeta de Crédito'}"
    elif is_cc_purchase:
        m_en = re.search(r"compra en\s+([A-Za-z0-9\*\.\-_\s]+?)\s+(?:por|\.|\.\.\.|\,|$)", payload.raw_text or "", re.IGNORECASE)
        m_aprob = re.search(r"en\s+([A-Za-z0-9\*\.\-_\s]+?)\s+por", payload.raw_text or "", re.IGNORECASE)
        if m_nu_compra and len(m_nu_compra.group(1).strip()) > 1 and not any(b in m_nu_compra.group(1).lower() for b in generic_bad_descriptions):
            clean_desc = f"Compra en {m_nu_compra.group(1).strip()}"
        elif m_en and len(m_en.group(1).strip()) > 1 and not any(b in m_en.group(1).lower() for b in generic_bad_descriptions):
            clean_desc = f"Compra en {m_en.group(1).strip()}"
        elif m_aprob and len(m_aprob.group(1).strip()) > 1:
            clean_desc = f"Compra en {m_aprob.group(1).strip()}"
        elif clean_desc and not any(b in clean_desc.lower() for b in generic_bad_descriptions + ["aprobada", "terminada en", "gasto", "movimiento"]):
            clean_desc = f"Compra {clean_desc}"
        else:
            clean_desc = f"Compra {matched_cc['name'] if matched_cc else 'Tarjeta Crédito'}"
    elif any(b in clean_desc.lower() for b in generic_bad_descriptions) or not clean_desc:
        if m_nu_compra and len(m_nu_compra.group(1).strip()) > 1 and not any(b in m_nu_compra.group(1).lower() for b in generic_bad_descriptions):
            clean_desc = f"Compra en {m_nu_compra.group(1).strip()}"
        else:
            pass
        m_en = re.search(r"\ben\s+([A-Za-z0-9\s\.\-_]+?)(?:\s+por|\.|\.\.\.|\,|$)", payload.raw_text or "", re.IGNORECASE)
        m_via = re.search(r"a través de\s+([A-Za-z0-9\-\s]+?)(?:fue exitoso|\.|\.\.\.|$)", payload.raw_text or "", re.IGNORECASE)
        m_sender = re.search(r'(?:Nu\s*-\s*)?(?:Banco\s+)?([A-Za-z0-9\s]+?)\s+te\s+envi[oó]', payload.raw_text or "", re.IGNORECASE)
        if m_en and len(m_en.group(1).strip()) > 1:
            clean_desc = f"Compra en {m_en.group(1).strip()}"
        elif m_via:
            clean_desc = f"Envío {m_via.group(1).strip()}"
        elif m_sender and m_sender.group(1).strip():
            clean_desc = f"Consignación {m_sender.group(1).strip()}"
        elif "rappicuenta" in search_context:
            clean_desc = "Transferencia RappiCuenta"
        elif "debito" in search_context or "débito" in search_context:
            clean_desc = f"Gasto {account['name']}"
        else:
            clean_desc = "Gasto bancario" if tx_type == "debit" else "Abono bancario"

    if cascaded and principal_acc:
        if covered_by_pocket > 0:
            cascade_note = f" (Cascada: ${covered_by_pocket:,.0f} de {account['name']} + ${shortfall:,.0f} completados desde {principal_acc['name']})"
        else:
            cascade_note = f" (Cascada: 100% completado ${shortfall:,.0f} desde {principal_acc['name']} porque {account['name']} estaba en $0)"
        clean_desc += cascade_note

    tx_category = "Pago Tarjeta de Crédito" if is_cc_payment else (payload.category or "Gasto Móvil")

    new_tx = {
        "id": tx_id,
        "accountId": account["id"],
        "entityId": entity["id"],
        "date": tx_date,
        "time": tx_time,
        "description": clean_desc,
        "amount": signed_amount,
        "currency": account.get("currency", "COP"),
        "type": tx_type,
        "category": tx_category,
        "source": "macrodroid_webhook",
        "rawText": payload.raw_text or "",
        "cascaded": cascaded,
        "coveredByPocket": covered_by_pocket if cascaded else None,
        "shortfall": shortfall if cascaded else None,
        "fallbackAccountId": principal_acc["id"] if cascaded and principal_acc else None,
        "fallbackAccountName": principal_acc["name"] if cascaded and principal_acc else None,
        "createdAt": now_colombia.isoformat(),
    }

    if "transactions" not in db or not isinstance(db["transactions"], list):
        db["transactions"] = []

    # Insert at top of transactions list
    db["transactions"].insert(0, new_tx)

    # 7. Persist to DuckDB, Postgres, and JSON (Fixed Income)
    save_fixed_income_db(db, effective_uid)

    # 8. Dual-sync to Cash Flow (for real-time monthly budget tracking & card limit release)
    cf_synced = False
    card_limit_released = False
    try:
        cf = load_cash_flow_db(effective_uid)
        active_period = cf.get("activePeriod") or tx_date[:7]
        acc_name_norm = normalize_text(account.get("name") or "")
        is_payroll = (
            account.get("id") == "acc_nu_debito"
            or ("nomina" in acc_name_norm and "cajita" not in acc_name_norm)
            or account.get("accountCategory") == "payroll"
        )

        if is_cc_payment:
            # 8a. Match credit card and automatically release used limit
            cards = cf.get("creditCards", [])
            matched_card = None
            if detected_card_id:
                matched_card = next((c for c in cards if c.get("id") == detected_card_id), None)
            if not matched_card:
                matched_card = next((c for c in cards if (c.get("usedLimit") or 0) > 0), None) or (cards[0] if cards else None)

            if matched_card:
                old_used = float(matched_card.get("usedLimit", 0.0))
                new_used = max(0.0, round(old_used - amount_val, 2))
                matched_card["usedLimit"] = new_used
                card_limit_released = True
                clean_desc = f"Pago {matched_card['name']}"
                logger.info(f"[Webhook] Liberado cupo en {matched_card['name']}: {old_used} -> {new_used} COP")

            # Record in creditCardPayments
            if "creditCardPayments" not in cf or not isinstance(cf["creditCardPayments"], list):
                cf["creditCardPayments"] = []

            payment_entry = {
                "id": f"pay_{tx_id}",
                "period": active_period,
                "cardId": matched_card["id"] if matched_card else "cc_generic",
                "cardName": matched_card["name"] if matched_card else "Tarjeta de Crédito",
                "amount": amount_val,
                "currency": account.get("currency", "COP"),
                "date": tx_date,
                "time": tx_time,
                "description": f"Pago {matched_card['name'] if matched_card else 'Tarjeta'}",
                "sourceType": "payroll" if is_payroll else "fixed_pocket",
                "sourceAccountId": account.get("id"),
                "sourceAccount": account.get("name"),
                "notes": payload.raw_text or clean_desc,
                "createdAt": now_colombia.isoformat(),
            }
            cf["creditCardPayments"].insert(0, payment_entry)
            save_cash_flow_db(cf, effective_uid)
            cf_synced = True
            logger.info(f"[Webhook] Dual-synced credit card payment {tx_id} to Cash Flow creditCardPayments.")
        elif is_cc_purchase and matched_cc:
            # 8b. Credit card purchase: Increase used limit and record in expensesLog & creditPurchases
            cards = cf.get("creditCards", [])
            for c in cards:
                if c.get("id") == matched_cc["id"]:
                    old_u = float(c.get("usedLimit", 0.0))
                    c["usedLimit"] = round(old_u + amount_val, 2)
                    break

            if "expensesLog" not in cf or not isinstance(cf["expensesLog"], list):
                cf["expensesLog"] = []

            cf_tx = {
                "id": f"cf_{tx_id}",
                "period": active_period,
                "budgetItemId": None,
                "budgetItemName": clean_desc,
                "budgetItemType": "wants",
                "description": clean_desc,
                "amount": amount_val,
                "currency": "COP",
                "date": tx_date,
                "time": tx_time,
                "type": "debit",
                "paymentSource": {
                    "type": "credit_card",
                    "targetId": matched_cc["id"],
                    "targetName": matched_cc["name"],
                },
                "createdAt": now_colombia.isoformat(),
            }
            cf["expensesLog"].insert(0, cf_tx)

            if "creditPurchases" not in cf or not isinstance(cf["creditPurchases"], list):
                cf["creditPurchases"] = []
            cf["creditPurchases"].insert(0, {
                "id": f"cp_{tx_id}",
                "cardId": matched_cc["id"],
                "description": clean_desc,
                "amount": amount_val,
                "installmentsCount": 1,
                "startPeriod": active_period,
                "monthlyInstallment": amount_val,
                "date": tx_date,
                "createdAt": now_colombia.isoformat(),
            })

            save_cash_flow_db(cf, effective_uid)
            cf_synced = True
            logger.info(f"[Webhook] Dual-synced credit purchase {tx_id} to {matched_cc['name']}: usedLimit increased by {amount_val} COP.")
        else:
            # 8c. Regular expense: Record in expensesLog
            if "expensesLog" not in cf or not isinstance(cf["expensesLog"], list):
                cf["expensesLog"] = []

            cf_tx = {
                "id": f"cf_{tx_id}",
                "period": active_period,
                "budgetItemId": None,
                "budgetItemName": clean_desc,
                "budgetItemType": "needs" if tx_type == "debit" else "income",
                "description": clean_desc,
                "amount": amount_val,
                "currency": account.get("currency", "COP"),
                "date": tx_date,
                "time": tx_time,
                "type": tx_type,
                "cascaded": cascaded,
                "shortfall": shortfall if cascaded else 0.0,
                "fallbackAccountName": principal_acc["name"] if cascaded and principal_acc else None,
                "paymentSource": {
                    "type": "payroll" if is_payroll else "fixed_pocket",
                    "targetId": account.get("id"),
                    "targetName": account.get("name"),
                },
                "createdAt": now_colombia.isoformat(),
            }
            cf["expensesLog"].insert(0, cf_tx)
            save_cash_flow_db(cf, effective_uid)
            cf_synced = True
            logger.info(f"[Webhook] Dual-synced transaction {tx_id} to Cash Flow expensesLog (period {active_period}).")
    except Exception as e:
        logger.error(f"[Webhook] Failed to dual-sync to Cash Flow: {e}")

    logger.info(
        f"[Webhook] Successfully registered {tx_type.upper()} tx {tx_id}: "
        f"{signed_amount:,.2f} COP in '{account['name']}' ({entity['name']}). "
        f"Balance: {previous_balance:,.2f} -> {new_balance:,.2f} COP"
    )

    if is_cc_payment:
        action_msg = (
            f"Pago a {clean_desc} por ${amount_val:,.2f} COP registrado exitosamente desde '{account['name']}'. "
            f"¡Cupo de tarjeta liberado automáticamente en Flujo de Caja!"
        )
    elif is_cc_purchase and matched_cc:
        action_msg = (
            f"Compra con {matched_cc['name']} por ${amount_val:,.2f} COP en '{clean_desc}' registrada exitosamente. "
            f"Cupo usado actualizado en Flujo de Caja."
        )
    elif cascaded and principal_acc:
        action_msg = (
            f"Movimiento de ${amount_val:,.2f} COP procesado en cascada: "
            f"${covered_by_pocket:,.2f} COP cubiertos por '{account['name']}' (saldo $0) "
            f"y el faltante de ${shortfall:,.2f} COP completado desde '{principal_acc['name']}'."
        )
    else:
        action_label = "descontado" if tx_type == "debit" else "abonado"
        action_msg = (
            f"Se ha {action_label} exitosamente ${abs(signed_amount):,.2f} COP "
            f"en '{account['name']}' ({entity['name']})."
        )

    res_data = {
        "success": True,
        "message": action_msg,
        "tx_id": tx_id,
        "is_credit_card_payment": is_cc_payment,
        "card_limit_released": card_limit_released,
        "cascaded": cascaded,
        "shortfall": shortfall if cascaded else 0.0,
        "entity": {
            "id": entity["id"],
            "name": entity["name"],
        },
        "account": {
            "id": account["id"],
            "name": account["name"],
            "previous_balance": previous_balance,
            "new_balance": new_balance,
            "currency": account.get("currency", "COP"),
        },
        "transaction": new_tx,
        "cash_flow_synced": cf_synced,
        "timestamp": now_colombia.isoformat(),
    }
    if cascaded and principal_acc:
        res_data["principal_account"] = {
            "id": principal_acc["id"],
            "name": principal_acc["name"],
            "previous_balance": prev_principal_bal,
            "new_balance": new_principal_bal,
        }
    return res_data
