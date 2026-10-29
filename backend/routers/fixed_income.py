"""Fixed Income, Savings Accounts, and CDTs REST API Router.

Manages multi-currency banking entities, high-yield savings accounts,
term deposits (CDTs with ReteFuente tax deductions), crypto staking/USD yields,
and quantitative compound interest projections.
"""

import logging
import re
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


def clean_category(cat_str: str) -> str:
    if not cat_str:
        return ""
    s = cat_str.lower().strip()
    s = re.sub(r'^(?:venció|vencio|vencimiento|invertiste)\s+(?:el|en)\s+cdt\s+(?:en\s+)?', '', s)
    s = re.sub(r'\+[\d\.,\s]+', '', s)
    s = re.sub(r'[^a-z0-9áéíóúñ]', '', s)
    return s.strip()


from services.auth import get_current_user_id, get_optional_current_user
from services.db import (
    OWNER_ID,
    get_historical_rates_db,
    get_user_fixed_income_db,
    save_user_fixed_income_db,
)


def is_test_transaction(t: dict[str, Any]) -> bool:
    """Detect and permanently purge test transactions."""
    if not isinstance(t, dict):
        return False
    tid = str(t.get("id") or "")
    desc = str(t.get("description") or "").lower()
    test_ids = {
        "tx_rappi_in_70k_20261025",
        "cf_tx_rappi_in_70k_20261025",
        "tx_mb_1792779105825_b126cb",
        "tx_mb_1792779105705_02d984",
        "tx_mb_1792779066231_fe0b80",
        "tx_mb_1792779105584_9c8939",
        "tx_mb_1792779105486_13e341",
        "tx_mb_1792779066108_8b1857",
        "tx_mb_1792779066008_235589",
        "tx_mb_1792778966456_3dfb3e",
        "tx_mb_1792778966351_d93090",
    }
    if tid in test_ids:
        return True
    if any(k in desc for k in ["test abono", "test sobregiro", "reversión test", "reversion test"]):
        return True
    if "cascada: 100% completado $2,000" in desc or "cascada: $227,484" in desc:
        return True
    return False


def load_fixed_income_db(user_id: str | None = None) -> dict[str, Any]:
    """Load fixed income data 100% from normalized Supabase PostgreSQL tables."""
    uid = user_id or get_current_user_id() or OWNER_ID
    return get_user_fixed_income_db(uid)


def save_fixed_income_db(data: dict[str, Any], user_id: str | None = None) -> None:
    """Save fixed income data 100% to normalized Supabase PostgreSQL tables."""
    uid = user_id or get_current_user_id() or OWNER_ID
    try:
        save_user_fixed_income_db(uid, data)
    except Exception as e:
        logger.error(f"[FixedIncome Supabase] Error saving to PostgreSQL: {e}")
        raise HTTPException(status_code=500, detail=f"Database write failure: {e}")


# --- Pydantic Data Models ---

class EntityModel(BaseModel):
    id: str | None = None
    name: str
    country: str = "🇨🇴"
    color: str = "#10b981"
    icon: str = "🏦"
    createdAt: str | None = None


class AccountModel(BaseModel):
    id: str | None = None
    entityId: str
    name: str
    type: str = "savings"  # 'savings' | 'pocket' | 'wallet' | 'crypto'
    syncType: str | None = "api"  # 'api' | 'manual'
    accountCategory: str | None = "high_yield"  # 'high_yield' | 'digital_wallet' | 'payroll' | 'cash'
    fallbackAccountId: str | None = None
    currency: str = "COP"  # 'COP' | 'USD' | 'EUR' | 'USDC'
    balance: float = 0.0
    interestRateEA: float = 0.0
    isTaxExemptGMF: bool = True
    rateHistory: list[dict[str, Any]] | None = []
    createdAt: str | None = None


class CDTModel(BaseModel):
    id: str | None = None
    entityId: str
    name: str
    capital: float
    currency: str = "COP"
    interestRateEA: float
    termDays: int
    startDate: str
    maturityDate: str
    reteFuentePct: float = 4.0
    isAutoRenew: bool = False
    createdAt: str | None = None


class TransactionModel(BaseModel):
    id: str | None = None
    accountId: str
    type: str = "deposit"  # 'deposit' | 'withdrawal' | 'interest_adjustment'
    amount: float
    date: str
    note: str | None = ""


class SyncStateModel(BaseModel):
    entities: list[dict[str, Any]] | None = None
    accounts: list[dict[str, Any]] | None = None
    cdts: list[dict[str, Any]] | None = None
    transactions: list[dict[str, Any]] | None = None
    deletedTxIds: list[str] | None = None


# --- Endpoints ---

@router.get("/data")
def get_all_fixed_income_data(request: Request):
    """Retrieve full fixed income state."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return load_fixed_income_db(user_id)


@router.post("/entities")
def create_entity(entity: EntityModel, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    new_id = entity.id or f"ent_{int(datetime.now().timestamp() * 1000)}"
    item = {
        "id": new_id,
        "name": entity.name,
        "country": entity.country,
        "color": entity.color,
        "icon": entity.icon,
        "createdAt": entity.createdAt or datetime.now().isoformat()
    }
    db["entities"].append(item)
    save_fixed_income_db(db, user_id)
    return item


@router.put("/entities/{entity_id}")
def update_entity(entity_id: str, entity: EntityModel, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    for idx, e in enumerate(db["entities"]):
        if e["id"] == entity_id:
            db["entities"][idx] = {
                **e,
                "name": entity.name,
                "country": entity.country,
                "color": entity.color,
                "icon": entity.icon
            }
            save_fixed_income_db(db, user_id)
            return db["entities"][idx]
    raise HTTPException(status_code=404, detail="Entity not found")


@router.delete("/entities/{entity_id}")
def delete_entity(entity_id: str, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    db["entities"] = [e for e in db["entities"] if e["id"] != entity_id]
    db["accounts"] = [a for a in db["accounts"] if a["entityId"] != entity_id]
    db["cdts"] = [c for c in db["cdts"] if c["entityId"] != entity_id]
    save_fixed_income_db(db, user_id)
    return {"success": True, "deleted": entity_id}


@router.post("/accounts")
def create_account(account: AccountModel, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    new_id = account.id or f"acc_{int(datetime.now().timestamp() * 1000)}"
    item = {
        "id": new_id,
        "entityId": account.entityId,
        "name": account.name,
        "type": account.type,
        "syncType": account.syncType or "api",
        "accountCategory": account.accountCategory or ("digital_wallet" if account.type == "wallet" or account.interestRateEA == 0 else "high_yield"),
        "fallbackAccountId": account.fallbackAccountId,
        "currency": account.currency,
        "balance": float(account.balance),
        "interestRateEA": float(account.interestRateEA),
        "isTaxExemptGMF": account.isTaxExemptGMF,
        "rateHistory": account.rateHistory or [{"date": datetime.now().strftime("%Y-%m-%d"), "rateEA": float(account.interestRateEA)}],
        "createdAt": account.createdAt or datetime.now().isoformat()
    }
    db["accounts"].append(item)
    save_fixed_income_db(db, user_id)
    return item


@router.put("/accounts/{account_id}")
def update_account(account_id: str, account: AccountModel, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    for idx, a in enumerate(db["accounts"]):
        if a["id"] == account_id:
            db["accounts"][idx] = {
                **a,
                "name": account.name,
                "type": account.type,
                "syncType": account.syncType or a.get("syncType", "api"),
                "accountCategory": account.accountCategory or a.get("accountCategory", "high_yield"),
                "fallbackAccountId": account.fallbackAccountId if account.fallbackAccountId is not None else a.get("fallbackAccountId"),
                "currency": account.currency,
                "balance": float(account.balance),
                "interestRateEA": float(account.interestRateEA),
                "isTaxExemptGMF": account.isTaxExemptGMF,
                "rateHistory": account.rateHistory or a.get("rateHistory", [])
            }
            save_fixed_income_db(db, user_id)
            return db["accounts"][idx]
    raise HTTPException(status_code=404, detail="Account not found")


@router.delete("/accounts/{account_id}")
def delete_account(account_id: str, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    db["accounts"] = [a for a in db["accounts"] if a["id"] != account_id]
    db["transactions"] = [t for t in db["transactions"] if t.get("accountId") != account_id]
    save_fixed_income_db(db, user_id)
    return {"success": True, "deleted": account_id}


@router.post("/cdts")
def create_cdt(cdt: CDTModel, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    new_id = cdt.id or f"cdt_{int(datetime.now().timestamp() * 1000)}"
    item = {
        "id": new_id,
        "entityId": cdt.entityId,
        "name": cdt.name,
        "capital": float(cdt.capital),
        "currency": cdt.currency,
        "interestRateEA": float(cdt.interestRateEA),
        "termDays": int(cdt.termDays),
        "startDate": cdt.startDate,
        "maturityDate": cdt.maturityDate,
        "reteFuentePct": float(cdt.reteFuentePct),
        "isAutoRenew": cdt.isAutoRenew,
        "createdAt": cdt.createdAt or datetime.now().isoformat()
    }
    db["cdts"].append(item)
    save_fixed_income_db(db, user_id)
    return item


@router.put("/cdts/{cdt_id}")
def update_cdt(cdt_id: str, cdt: CDTModel, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    for idx, c in enumerate(db["cdts"]):
        if c["id"] == cdt_id:
            db["cdts"][idx] = {
                **c,
                "name": cdt.name,
                "capital": float(cdt.capital),
                "currency": cdt.currency,
                "interestRateEA": float(cdt.interestRateEA),
                "termDays": int(cdt.termDays),
                "startDate": cdt.startDate,
                "maturityDate": cdt.maturityDate,
                "reteFuentePct": float(cdt.reteFuentePct),
                "isAutoRenew": cdt.isAutoRenew
            }
            save_fixed_income_db(db, user_id)
            return db["cdts"][idx]
    raise HTTPException(status_code=404, detail="CDT not found")


@router.delete("/cdts/{cdt_id}")
def delete_cdt(cdt_id: str, request: Request):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    db["cdts"] = [c for c in db["cdts"] if c["id"] != cdt_id]
    save_fixed_income_db(db, user_id)
    return {"success": True, "deleted": cdt_id}


def load_historical_rates_db() -> dict[str, Any]:
    return get_historical_rates_db()


@router.get("/rates")
def get_all_historical_rates():
    """Return the entire historical rates database for the frontend to query dynamically."""
    return load_historical_rates_db()


@router.post("/rates/sync-mejorcdt")
def sync_mejorcdt_rates():
    """Trigger live sync of MejorCDT rates into historical_rates.json."""
    from scrapers.mejorcdt_scraper import sync_mejorcdt_to_database
    return sync_mejorcdt_to_database()


@router.get("/rates/suggest")
def suggest_rate(
    entity_id: str,
    product_type: str = "savings",
    term_days: int | None = None,
    date: str | None = None,
):
    """Suggest exact historical or term-based E.A. interest rate for an entity."""
    rates_db = load_historical_rates_db()
    lookup_id = entity_id.replace("preset_", "ent_") if entity_id.startswith("preset_") else entity_id
    entity_data = rates_db.get("entities", {}).get(lookup_id)

    if not entity_data:
        # Fallback: search by entity name in fixed_income database or direct key match
        fi_db = load_fixed_income_db()
        target_ent = next((e for e in fi_db.get("entities", []) if e.get("id") == entity_id), None)
        ent_name_clean = (target_ent.get("name", "") if target_ent else entity_id).lower().replace(" ", "").replace("banco", "").replace("preset_", "").replace("ent_", "")
        for k, ed in rates_db.get("entities", {}).items():
            k_clean = k.lower().replace("ent_", "").replace("_", "")
            ed_name_clean = ed.get("name", "").lower().replace(" ", "").replace("banco", "")
            if k_clean in ent_name_clean or ent_name_clean in k_clean or ed_name_clean in ent_name_clean or ent_name_clean in ed_name_clean:
                entity_data = ed
                break

    if not entity_data:
        if product_type == "cdt":
            return {"rateEA": 11.5, "label": "CDT Estándar", "tiers": []}
        return {"rateEA": 12.0, "label": "Cuenta Estándar", "tiers": []}

    target_date = date or datetime.now().strftime("%Y-%m-%d")

    # If CDT, check term tiers (Nu 60d, 90d, 180d, 360d, 540d, 720d, 1080d etc.)
    if product_type == "cdt":
        term = term_days or 180
        cdt_tiers = entity_data.get("cdt_term_rates", [])
        history = entity_data.get("cdt_term_rates_history", [])
        if date and history:
            for period in history:
                if period.get("from", "") <= target_date <= period.get("to", ""):
                    cdt_tiers = period.get("tiers", cdt_tiers)
                    break

        matched_tier = None
        for tier in cdt_tiers:
            if tier["termDaysMin"] <= term <= tier["termDaysMax"]:
                matched_tier = tier
                break
        if matched_tier:
            return {
                "rateEA": matched_tier["rateEA"],
                "label": matched_tier.get("label", f"CDT {term} Días"),
                "tiers": cdt_tiers,
                "notes": f"Tasa CDT {entity_data.get('name')} para {term} días ({matched_tier['rateEA']}%)",
            }
        return {
            "rateEA": cdt_tiers[-1]["rateEA"] if cdt_tiers else 12.0,
            "label": f"CDT {term} Días",
            "tiers": cdt_tiers,
            "notes": "Tasa referencial",
        }

    # For savings accounts / pockets, lookup date range
    savings_rates = entity_data.get("savings_rates", [])
    for interval in savings_rates:
        if interval["from"] <= target_date <= interval["to"]:
            return {
                "rateEA": interval["rateEA"],
                "label": f"{entity_data.get('name')} ({interval.get('notes', 'Vigente')})",
                "tiers": [],
                "notes": interval.get("notes", ""),
            }

    if savings_rates:
        latest = savings_rates[-1]
        return {
            "rateEA": latest["rateEA"],
            "label": f"{entity_data.get('name')} ({latest.get('notes', 'Última tasa')})",
            "tiers": [],
            "notes": latest.get("notes", ""),
        }

    return {"rateEA": 12.0, "label": "Tasa Referencial", "tiers": []}


class DepositItem(BaseModel):
    date: str
    amount: float
    note: str | None = ""


class CompoundHistoryRequest(BaseModel):
    entityId: str
    deposits: list[DepositItem]
    currentDate: str | None = None


@router.post("/calculate-compound-history")
def calculate_compound_history(payload: CompoundHistoryRequest):
    """Calculate multi-period step-wise daily compound growth across historical rate intervals."""
    rates_db = load_historical_rates_db()
    entity_data = rates_db.get("entities", {}).get(payload.entityId, {})
    savings_rates = entity_data.get("savings_rates", [])

    if not payload.deposits:
        return {
            "currentAccumulatedBalance": 0.0,
            "totalContributedCapital": 0.0,
            "totalInterestsEarned": 0.0,
            "timeline": [],
        }

    sorted_deposits = sorted(payload.deposits, key=lambda d: d.date)
    start_date_str = sorted_deposits[0].date
    end_date_str = payload.currentDate or datetime.now().strftime("%Y-%m-%d")

    start_dt = datetime.strptime(start_date_str, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date_str, "%Y-%m-%d")

    if end_dt < start_dt:
        end_dt = start_dt

    deposits_by_date = {}
    total_contributed = 0.0
    for d in sorted_deposits:
        deposits_by_date[d.date] = deposits_by_date.get(d.date, 0.0) + d.amount
        total_contributed += d.amount

    timeline = []
    current_balance = 0.0
    current_dt = start_dt

    while current_dt <= end_dt:
        date_str = current_dt.strftime("%Y-%m-%d")

        if date_str in deposits_by_date:
            current_balance += deposits_by_date[date_str]

        active_rate_ea = 12.0
        for interval in savings_rates:
            if interval["from"] <= date_str <= interval["to"]:
                active_rate_ea = interval["rateEA"]
                break

        daily_rate = ((1.0 + active_rate_ea / 100.0) ** (1.0 / 365.0)) - 1.0
        daily_interest = current_balance * daily_rate
        current_balance += daily_interest

        timeline.append({
            "date": date_str,
            "balance": round(current_balance, 2),
            "rateEA": active_rate_ea,
        })

        current_dt = datetime.fromtimestamp(current_dt.timestamp() + 86400)

    total_interests = max(0.0, current_balance - total_contributed)

    return {
        "currentAccumulatedBalance": round(current_balance, 2),
        "totalContributedCapital": round(total_contributed, 2),
        "totalInterestsEarned": round(total_interests, 2),
        "timeline": timeline,
    }


@router.post("/sync")
def sync_full_state(payload: SyncStateModel, request: Request):
    """Batch sync entire fixed income state from frontend store with lossless union merge."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)

    if payload.entities is not None:
        existing_ent = {e["id"]: e for e in db.get("entities", []) if isinstance(e, dict) and e.get("id")}
        for e in payload.entities:
            if isinstance(e, dict) and e.get("id"):
                existing_ent[e["id"]] = e
        db["entities"] = list(existing_ent.values())

    if payload.accounts is not None:
        existing_acc = {a["id"]: a for a in db.get("accounts", []) if isinstance(a, dict) and a.get("id")}
        for a in payload.accounts:
            if isinstance(a, dict) and a.get("id"):
                if a["id"] in existing_acc:
                    existing_acc[a["id"]].update(a)
                else:
                    existing_acc[a["id"]] = a
        db["accounts"] = list(existing_acc.values())

    if payload.cdts is not None:
        existing_cdts = {c["id"]: c for c in db.get("cdts", []) if isinstance(c, dict) and c.get("id")}
        for c in payload.cdts:
            if isinstance(c, dict) and c.get("id"):
                existing_cdts[c["id"]] = c
        db["cdts"] = list(existing_cdts.values())

    if payload.transactions is not None:
        del_set = set(payload.deletedTxIds or [])
        existing_tx = {
            t["id"]: t for t in db.get("transactions", [])
            if isinstance(t, dict) and t.get("id") and t["id"] not in del_set and not is_test_transaction(t)
        }
        # Merge incoming transactions
        for t in payload.transactions:
            if isinstance(t, dict) and t.get("id"):
                if t["id"] not in del_set and not is_test_transaction(t):
                    existing_tx[t["id"]] = t
        db["transactions"] = sorted(
            list(existing_tx.values()),
            key=lambda x: (x.get("date", ""), x.get("createdAt", "")),
            reverse=True
        )

    save_fixed_income_db(db, user_id)
    return {
        "success": True,
        "timestamp": datetime.now().isoformat(),
        "totalTransactions": len(db.get("transactions", [])),
    }


from fastapi import File, Form, UploadFile

from services.statement_parser import process_batch_statement_documents


@router.post("/upload-statement")
async def upload_statement(
    file: UploadFile | None = File(None),
    files: list[UploadFile] | None = File(None),
    password: str | None = Form(None),
    start_year: int | None = Form(2024)
):
    """
    Upload a batch of bank statements (PDFs or mobile screenshots) protected with password (e.g. Cedula/NIT).
    Decrypts, auto-identifies entity, and extracts accounts, Cajitas by name, CDTs, and movements.
    """
    files_to_process = files or ([file] if file else [])
    if not files_to_process:
        raise HTTPException(status_code=400, detail="No se enviaron archivos para procesar")

    contents = []
    for f in files_to_process:
        c = await f.read()
        if c:
            contents.append(c)

    res = process_batch_statement_documents(contents, password=password, start_year=start_year or 2024)
    return res


class ConfirmImportRequest(BaseModel):
    entityId: str
    accounts: list[dict[str, Any]] = []
    cdts: list[dict[str, Any]] = []
    transactions: list[dict[str, Any]] = []


@router.post("/confirm-import")
def confirm_statement_import(payload: ConfirmImportRequest, request: Request):
    """Batch import approved accounts, CDTs, and transactions extracted from PDF."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    
    # 1. Ensure entity exists
    existing_entities = {e["id"]: e for e in db.get("entities", [])}
    if payload.entityId not in existing_entities:
        # Create entity if missing
        db["entities"].append({
            "id": payload.entityId,
            "name": "Entidad Detectada",
            "country": "🇨🇴",
            "color": "#820ad1",
            "icon": "🏦",
            "createdAt": datetime.now().isoformat()
        })

    # 2. Append or update accounts
    created_accounts = 0
    existing_accounts_map = {
        a["name"].lower().strip(): a 
        for a in db.get("accounts", []) 
        if a["entityId"] == payload.entityId
    }

    for acc in payload.accounts:
        acc_name = acc.get("name", "Cuenta Detectada").strip()
        acc_name_lower = acc_name.lower()
        balance_val = float(acc.get("balance", 0.0))
        rate_val = float(acc.get("interestRateEA", 12.0))
        
        if acc_name_lower in existing_accounts_map:
            # Update existing account's balance and interest rate to avoid duplicates
            existing_acc = existing_accounts_map[acc_name_lower]
            existing_acc["balance"] = balance_val
            existing_acc["interestRateEA"] = rate_val
            
            if "rateHistory" not in existing_acc:
                existing_acc["rateHistory"] = []
                
            if not existing_acc["rateHistory"] or existing_acc["rateHistory"][-1]["rateEA"] != rate_val:
                existing_acc["rateHistory"].append({
                    "date": datetime.now().strftime("%Y-%m-%d"), 
                    "rateEA": rate_val
                })
        else:
            # Create new account if not present
            acc_id = acc.get("id") or f"acc_{uuid.uuid4().hex}"
            db["accounts"].append({
                "id": acc_id,
                "entityId": payload.entityId,
                "name": acc_name,
                "type": acc.get("type", "pocket"),
                "currency": acc.get("currency", "COP"),
                "balance": balance_val,
                "interestRateEA": rate_val,
                "isTaxExemptGMF": bool(acc.get("isTaxExemptGMF", True)),
                "rateHistory": [{"date": datetime.now().strftime("%Y-%m-%d"), "rateEA": rate_val}],
                "createdAt": datetime.now().isoformat()
            })
            created_accounts += 1

    # 3. Append or update CDTs
    created_cdts = 0
    for cdt in payload.cdts:
        cdt_id = cdt.get("id") or f"cdt_{uuid.uuid4().hex}"
        start_dt = cdt.get("startDate") or datetime.now().strftime("%Y-%m-%d")
        term_days = int(cdt.get("termDays", 180))
        category = cdt.get("category") or "General"
        status = cdt.get("status") or "active"
        capital_val = float(cdt.get("capital", 0.0))
        rate_val = float(cdt.get("interestRateEA", 12.0))
        
        # calculate maturity date if missing
        try:
            start_obj = datetime.strptime(start_dt, "%Y-%m-%d")
            maturity_obj = datetime.fromtimestamp(start_obj.timestamp() + term_days * 86400)
            maturity_dt = maturity_obj.strftime("%Y-%m-%d")
        except Exception:
            maturity_dt = start_dt

        # If it is active, check if we can update/deduplicate an existing active one of the same category AND approximate capital/date
        if status == "active":
            updated_existing = False
            for existing_cdt in db.get("cdts", []):
                if (
                    existing_cdt.get("entityId") == payload.entityId
                    and clean_category(existing_cdt.get("category", "")) == clean_category(category)
                    and existing_cdt.get("status", "active") == "active"
                ):
                    # To be a duplicate, the capital must be very close AND start date must be close (same month/year or within 30 days)
                    capital_close = abs(existing_cdt["capital"] - capital_val) / max(1.0, existing_cdt["capital"]) <= 0.05
                    try:
                        ex_start = datetime.strptime(existing_cdt["startDate"], "%Y-%m-%d")
                        im_start = datetime.strptime(start_dt, "%Y-%m-%d")
                        date_close = abs((ex_start - im_start).days) <= 30
                    except Exception:
                        date_close = True
                    
                    if capital_close and date_close:
                        # Update fields of the duplicate active CDT
                        existing_cdt["startDate"] = start_dt
                        existing_cdt["capital"] = capital_val
                        existing_cdt["interestRateEA"] = rate_val
                        existing_cdt["termDays"] = term_days
                        existing_cdt["maturityDate"] = maturity_dt
                        existing_cdt["name"] = cdt.get("name", existing_cdt.get("name"))
                        updated_existing = True
                        created_cdts += 1
                        logger.info("CDT Activo existente '%s' actualizado con nueva fecha/valores de importación", existing_cdt["name"])
                        break
            if updated_existing:
                continue

        # If the imported CDT is matured, check if we can pair it with an existing active one in the DB
        paired = False
        if status == "matured":
            payout_amount = float(cdt.get("payoutAmount", capital_val))
            payout_date = cdt.get("payoutDate") or start_dt
            
            # Pasada 1: Coincidencia exacta de categoría (limpia) y cronológica
            for existing_cdt in db.get("cdts", []):
                if (
                    existing_cdt.get("entityId") == payload.entityId
                    and clean_category(existing_cdt.get("category", "")) == clean_category(category)
                    and existing_cdt.get("status", "active") == "active"
                ):
                    # Enforce chronological date check (investment date must be strictly anterior to payout date)
                    is_chronological = False
                    try:
                        ex_start = datetime.strptime(existing_cdt["startDate"], "%Y-%m-%d")
                        pay_date = datetime.strptime(payout_date, "%Y-%m-%d")
                        is_chronological = ex_start < pay_date
                    except Exception:
                        is_chronological = True
                        
                    if is_chronological:
                        # Check if capital is within a reasonable range of payout
                        if existing_cdt["capital"] <= payout_amount <= existing_cdt["capital"] * 1.15:
                            existing_cdt["status"] = "matured"
                            existing_cdt["payoutAmount"] = payout_amount
                            existing_cdt["payoutDate"] = payout_date
                            existing_cdt["category"] = category  # Actualizar la categoría al nombre real limpio si tenía basura
                            existing_cdt["netProfit"] = payout_amount - existing_cdt["capital"]
                            
                            # Calcular el plazo real en días entre el inicio y el pago
                            try:
                                ex_start = datetime.strptime(existing_cdt["startDate"], "%Y-%m-%d")
                                pay_date = datetime.strptime(payout_date, "%Y-%m-%d")
                                diff_days = (pay_date - ex_start).days
                                if diff_days > 0:
                                    existing_cdt["termDays"] = diff_days
                                    existing_cdt["maturityDate"] = payout_date
                            except Exception:
                                pass
                                
                            paired = True
                            created_cdts += 1
                            logger.info("CDT Vencido '%s' enlazado (Exacto) en DB con ganancia %.2f y plazo de %d días", 
                                        existing_cdt["name"], existing_cdt["netProfit"], existing_cdt.get("termDays", 180))
                            break
            
            # Pasada 2 (Fallback): Si no se emparejó, buscar coincidencia por capital y fecha si es candidato único cronológico
            if not paired:
                candidates = []
                for existing_cdt in db.get("cdts", []):
                    if (
                        existing_cdt.get("entityId") == payload.entityId
                        and existing_cdt.get("status", "active") == "active"
                    ):
                        # Enforce chronological check
                        is_chronological = False
                        try:
                            ex_start = datetime.strptime(existing_cdt["startDate"], "%Y-%m-%d")
                            pay_date = datetime.strptime(payout_date, "%Y-%m-%d")
                            is_chronological = ex_start < pay_date
                        except Exception:
                            is_chronological = True
                            
                        if is_chronological:
                            # Verificar rango lógico de capital
                            if existing_cdt["capital"] <= payout_amount <= existing_cdt["capital"] * 1.15:
                                candidates.append(existing_cdt)
                
                if len(candidates) == 1:
                    # Candidato único! Pareja perfecta garantizada por matemática
                    matched_cdt = candidates[0]
                    matched_cdt["status"] = "matured"
                    matched_cdt["payoutAmount"] = payout_amount
                    matched_cdt["payoutDate"] = payout_date
                    matched_cdt["category"] = category  # Restaurar la categoría limpia correcta
                    matched_cdt["netProfit"] = payout_amount - matched_cdt["capital"]
                    
                    # Calcular el plazo real en días entre el inicio y el pago
                    try:
                        ex_start = datetime.strptime(matched_cdt["startDate"], "%Y-%m-%d")
                        pay_date = datetime.strptime(payout_date, "%Y-%m-%d")
                        diff_days = (pay_date - ex_start).days
                        if diff_days > 0:
                            matched_cdt["termDays"] = diff_days
                            matched_cdt["maturityDate"] = payout_date
                    except Exception:
                        pass
                        
                    paired = True
                    created_cdts += 1
                    logger.info("CDT Vencido enlazado por Heurística de Candidato Único (Monto: %.2f, Anterior categoría basura: '%s' -> Nueva: '%s', Plazo: %d días)", 
                                payout_amount, matched_cdt.get("category"), category, matched_cdt.get("termDays", 180))
        
        if not paired:
            # If not paired or not matured, create as a new CDT entry
            new_cdt = {
                "id": cdt_id,
                "entityId": payload.entityId,
                "name": cdt.get("name", "CDT Detectado"),
                "capital": capital_val,
                "currency": cdt.get("currency", "COP"),
                "interestRateEA": rate_val,
                "termDays": term_days,
                "startDate": start_dt,
                "maturityDate": cdt.get("maturityDate") or maturity_dt,
                "reteFuentePct": float(cdt.get("reteFuentePct", 4.0)),
                "isAutoRenew": bool(cdt.get("isAutoRenew", False)),
                "status": status,
                "category": category,
                "createdAt": datetime.now().isoformat()
            }
            if status == "matured":
                new_cdt["payoutAmount"] = float(cdt.get("payoutAmount", capital_val))
                new_cdt["payoutDate"] = cdt.get("payoutDate") or start_dt
                new_cdt["netProfit"] = new_cdt["payoutAmount"] - capital_val
                
            db["cdts"].append(new_cdt)
            created_cdts += 1

    # 4. Append transactions/movements safely with YYYY-MM-DD formatting and deduplication
    created_transactions = 0
    existing_transactions = db.get("transactions", [])
    existing_tx_keys = set()
    for tx in existing_transactions:
        tx_date = tx.get("date", "").split("T")[0]
        tx_desc = tx.get("description", "").lower().strip()
        tx_amount = float(tx.get("amount", 0.0))
        existing_tx_keys.add((tx_date, tx_desc, tx_amount))
        
    for tx in payload.transactions:
        tx_date = tx.get("date", "").split("T")[0]
        tx_desc = tx.get("description", "").lower().strip()
        tx_amount = float(tx.get("amount", 0.0))
        
        tx_key = (tx_date, tx_desc, tx_amount)
        if tx_key not in existing_tx_keys:
            new_tx = {
                "id": tx.get("id") or f"tx_pdf_{int(datetime.now().timestamp() * 1000)}_{created_transactions}_{uuid.uuid4().hex[:6]}",
                "entityId": payload.entityId,
                "date": tx_date,  # Format strictly as YYYY-MM-DD
                "description": tx.get("description", "").strip(),
                "amount": tx_amount,
                "type": tx.get("type", "credit"),
                "currency": tx.get("currency", "COP"),
                "createdAt": datetime.now().isoformat()
            }
            existing_transactions.append(new_tx)
            existing_tx_keys.add(tx_key)
            created_transactions += 1
            
    db["transactions"] = existing_transactions

    save_fixed_income_db(db, user_id)
    return {
        "success": True,
        "importedAccounts": created_accounts,
        "importedCDTs": created_cdts,
        "importedTransactions": created_transactions,
        "timestamp": datetime.now().isoformat()
    }


class ApplyRatePayload(BaseModel):
    accountId: str
    newRate: float
    effectiveDate: Optional[str] = None


@router.get("/rates/tracker")
async def get_rate_tracker(request: Request, simulate: bool = False):
    """Evaluates weekly market rates against active accounts across all financial institutions."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)
    from services.rate_tracker import evaluate_user_rates
    result = evaluate_user_rates(db.get("accounts", []), db.get("entities", []), simulate=simulate)
    return result


@router.post("/rates/tracker/apply")
async def apply_rate_tracker(payload: ApplyRatePayload, request: Request):
    """Applies a verified market rate update to a specific account, preserving historical yield integrity."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_fixed_income_db(user_id)

    target_acc = None
    for acc in db.get("accounts", []):
        if acc.get("id") == payload.accountId:
            target_acc = acc
            break

    if not target_acc:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    old_rate = float(target_acc.get("interestRateEA") or 0.0)
    effective_date = payload.effectiveDate or datetime.now().strftime("%Y-%m-%d")

    rate_history = target_acc.get("rateHistory", [])
    if not rate_history and old_rate > 0:
        rate_history.append({
            "rate": old_rate,
            "effectiveDate": target_acc.get("createdAt", "2026-01-01T00:00:00").split("T")[0]
        })

    rate_history.append({
        "rate": float(payload.newRate),
        "effectiveDate": effective_date,
        "updatedAt": datetime.now().isoformat()
    })

    target_acc["rateHistory"] = rate_history
    target_acc["interestRateEA"] = float(payload.newRate)
    target_acc["updatedAt"] = datetime.now().isoformat()

    save_fixed_income_db(db, user_id)
    logger.info("Tasa de cuenta %s actualizada de %.2f%% a %.2f%% con vigencia desde %s",
                target_acc.get("name"), old_rate, payload.newRate, effective_date)

    return {
        "success": True,
        "message": f"Tasa de {target_acc.get('name')} actualizada exitosamente a {payload.newRate:.2f}% E.A.",
        "updatedAccount": target_acc
    }

