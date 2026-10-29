"""Cash Flow & Budget Allocation REST API Router.

Manages monthly income inflows, 50/30/20 & dynamic rule allocations,
fixed essential expenses (Needs), variable lifestyle spending (Wants),
and wealth-building / emergency fund runway metrics.
"""

import logging
import uuid
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services.auth import get_optional_current_user
from services.db import (
    DEFAULT_CASH_FLOW_DATA,
    OWNER_ID,
    delete_movement_cascade_db,
    get_user_cash_flow_db,
    save_user_cash_flow_db,
)
from services.telegram_notifier import send_debt_reminder_telegram

logger = logging.getLogger(__name__)

router = APIRouter()


def load_cash_flow_db(user_id: Optional[str] = None) -> dict[str, Any]:
    """Load cash flow data 100% from normalized Supabase PostgreSQL tables."""
    effective_uid = user_id or OWNER_ID
    return get_user_cash_flow_db(effective_uid)


def save_cash_flow_db(data: dict[str, Any], user_id: Optional[str] = None) -> None:
    """Save cash flow data 100% to normalized Supabase PostgreSQL tables."""
    effective_uid = user_id or OWNER_ID
    try:
        save_user_cash_flow_db(effective_uid, data)
    except Exception as e:
        logger.error(f"[CashFlow Supabase] Error saving to PostgreSQL: {e}")
        raise HTTPException(status_code=500, detail=f"Database write failure: {e}")


# --- Pydantic Data Models ---

class InflowItem(BaseModel):
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str
    amount: float
    frequency: str = "monthly"
    isPassive: bool = False
    createdAt: str | None = None


class NeedExpenseItem(BaseModel):
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str
    amount: float
    category: str = "general"
    isEssential: bool = True
    dueDate: int | None = None
    createdAt: str | None = None


class WantExpenseItem(BaseModel):
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str
    budgetedAmount: float = 0.0
    actualSpent: float = 0.0
    category: str = "lifestyle"
    createdAt: str | None = None


class WealthItem(BaseModel):
    model_config = {"extra": "allow"}
    id: str | None = None
    name: str
    targetAmount: float = 0.0
    actualContributed: float = 0.0
    targetType: str = "investment"
    createdAt: str | None = None


class CustomRatiosModel(BaseModel):
    model_config = {"extra": "allow"}
    needs: float = 50.0
    wants: float = 30.0
    savings: float = 20.0


class CashFlowSyncPayload(BaseModel):
    model_config = {"extra": "allow"}
    startPeriod: str | None = None
    activePeriod: str | None = None
    currency: str | None = None
    allocationModel: str | None = None
    customRatios: dict | None = None
    emergencyFundTargetMonths: int | None = None
    inflows: list[dict] | None = None
    needs: list[dict] | None = None
    wants: list[dict] | None = None
    wealth: list[dict] | None = None
    payrollAccount: dict | None = None
    creditCards: list[dict] | None = None
    creditPurchases: list[dict] | None = None
    expensesLog: list[dict] | None = None
    deletedExpenseIds: list[str] | None = None
    deletedDebtIds: list[str] | None = None
    deletedCreditCardPaymentIds: list[str] | None = None
    creditCardPayments: list[dict] | None = None
    debts: list[dict] | None = None
    periodsData: dict | None = None


# --- REST API Endpoints ---

@router.get("/cash-flow")
def get_cash_flow_state(request: Request):
    """Retrieve full cash flow, income inflows, budget allocations, credit cards and wealth building targets."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    return load_cash_flow_db(user_id)


@router.post("/cash-flow/sync")
def sync_cash_flow_state(payload: CashFlowSyncPayload, request: Request):
    """Synchronize full cash flow state from client to backend DuckDB / JSON storage."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)

    def dump_val(v):
        if hasattr(v, "model_dump"):
            return v.model_dump()
        return v

    def merge_lists_by_id(existing_list, incoming_list):
        if incoming_list is None:
            return existing_list or []
        dumped = [dump_val(x) for x in incoming_list] if isinstance(incoming_list, list) else incoming_list
        if not dumped:
            return existing_list or []
        existing_map = {item.get("id"): item for item in (existing_list or []) if isinstance(item, dict) and item.get("id")}
        for item in dumped:
            if isinstance(item, dict) and item.get("id"):
                existing_map[item["id"]] = item
            else:
                existing_map[uuid.uuid4().hex[:8]] = item
        return list(existing_map.values())

    if payload.startPeriod is not None:
        db["startPeriod"] = payload.startPeriod
    if payload.activePeriod is not None:
        db["activePeriod"] = payload.activePeriod
    if payload.currency is not None:
        db["currency"] = payload.currency
    if payload.allocationModel is not None:
        db["allocationModel"] = payload.allocationModel
    if payload.customRatios is not None:
        ratios = dump_val(payload.customRatios)
        if isinstance(ratios, dict) and ratios.get("needs") is not None:
            current_ratios = db.get("customRatios") or {}
            # Safeguard: prevent accidental fallback 35/30/35 from downgrading 40/20/40
            if ratios.get("needs") == 35 and current_ratios.get("needs") == 40:
                pass
            else:
                db["customRatios"] = ratios
    if payload.emergencyFundTargetMonths is not None:
        db["emergencyFundTargetMonths"] = payload.emergencyFundTargetMonths
    if payload.inflows is not None:
        db["inflows"] = [dump_val(x) for x in payload.inflows]
    if payload.needs is not None:
        db["needs"] = [dump_val(x) for x in payload.needs]
    if payload.wants is not None:
        db["wants"] = [dump_val(x) for x in payload.wants]
    if payload.wealth is not None:
        db["wealth"] = [dump_val(x) for x in payload.wealth]
    if payload.payrollAccount is not None:
        db["payrollAccount"] = dump_val(payload.payrollAccount)
    if payload.creditCards is not None:
        db["creditCards"] = [dump_val(x) for x in payload.creditCards]
    if payload.creditPurchases is not None:
        db["creditPurchases"] = merge_lists_by_id(db.get("creditPurchases", []), payload.creditPurchases)
    # Persistent tombstone tracking for deleted transactions
    del_exp_set = set(db.get("deletedExpenseIds") or [])
    if payload.deletedExpenseIds:
        del_exp_set.update(payload.deletedExpenseIds)
    db["deletedExpenseIds"] = list(del_exp_set)

    if payload.expensesLog is not None:
        # Lossless union across browsers/devices: merge existing server movements with incoming client movements,
        # and only remove items explicitly recorded in deletedExpenseIds.
        merged_expenses = merge_lists_by_id(db.get("expensesLog", []), payload.expensesLog)
        seen_ids = set()
        clean_expenses = []
        for item in merged_expenses:
            if isinstance(item, dict):
                iid = item.get("id")
                if iid:
                    if iid in del_exp_set or iid in seen_ids:
                        continue
                    seen_ids.add(iid)
                clean_expenses.append(item)
        clean_expenses.sort(
            key=lambda x: (x.get("date") or "", x.get("time") or "", x.get("createdAt") or ""),
            reverse=True,
        )
        db["expensesLog"] = clean_expenses
    elif del_exp_set:
        db["expensesLog"] = [x for x in db.get("expensesLog", []) if x.get("id") not in del_exp_set]

    del_pay_set = set(db.get("deletedCreditCardPaymentIds") or [])
    if payload.deletedCreditCardPaymentIds:
        del_pay_set.update(payload.deletedCreditCardPaymentIds)
    db["deletedCreditCardPaymentIds"] = list(del_pay_set)

    if payload.creditCardPayments is not None:
        merged_pays = merge_lists_by_id(db.get("creditCardPayments", []), payload.creditCardPayments)
        seen_pay_ids = set()
        clean_pays = []
        for p in merged_pays:
            if isinstance(p, dict):
                pid = p.get("id")
                if pid:
                    if pid in del_pay_set or pid in seen_pay_ids:
                        continue
                    seen_pay_ids.add(pid)
                clean_pays.append(p)
        db["creditCardPayments"] = clean_pays
    elif del_pay_set:
        db["creditCardPayments"] = [x for x in db.get("creditCardPayments", []) if x.get("id") not in del_pay_set]

    # Persistent tombstone tracking for deleted debts
    del_debt_set = set(db.get("deletedDebtIds") or [])
    if payload.deletedDebtIds:
        del_debt_set.update(payload.deletedDebtIds)
    db["deletedDebtIds"] = list(del_debt_set)

    if payload.debts is not None:
        merged_debts = merge_lists_by_id(db.get("debts", []), payload.debts)
        db["debts"] = [x for x in merged_debts if isinstance(x, dict) and x.get("id") != "debt_mike_nu_2026" and x.get("id") not in del_debt_set]
    elif del_debt_set:
        db["debts"] = [x for x in db.get("debts", []) if x.get("id") not in del_debt_set]
    if payload.periodsData is not None:
        existing_periods = db.get("periodsData") or {}
        incoming_periods = dump_val(payload.periodsData) or {}
        db["periodsData"] = {**existing_periods, **incoming_periods}

    save_cash_flow_db(db, user_id)
    return {"status": "ok", "message": "Cash flow synchronized successfully", "data": db}


@router.delete("/cash-flow/expense/{expense_id}")
def delete_expense_item(expense_id: str, request: Request):
    """Directly delete an expense log entry from database with atomic RPC cascade and tombstone persistence."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    delete_movement_cascade_db(user_id, expense_id)
    db = load_cash_flow_db(user_id)
    del_exp_set = set(db.get("deletedExpenseIds") or [])
    del_exp_set.add(expense_id)
    db["deletedExpenseIds"] = list(del_exp_set)
    db["expensesLog"] = [x for x in db.get("expensesLog", []) if x.get("id") != expense_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": expense_id, "deletedExpenseIds": db["deletedExpenseIds"]}


@router.post("/cash-flow/debt")
def create_or_update_debt(item: dict, request: Request):
    """Create or update a personal debt or liability."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    if not item.get("id"):
        item["id"] = f"debt_{uuid.uuid4().hex[:8]}"
    if not item.get("createdAt"):
        item["createdAt"] = datetime.utcnow().isoformat() + "Z"
    existing_debts = db.get("debts", [])
    found = False
    for idx, d in enumerate(existing_debts):
        if d.get("id") == item["id"]:
            existing_debts[idx] = item
            found = True
            break
    if not found:
        existing_debts.append(item)
    db["debts"] = existing_debts
    save_cash_flow_db(db, user_id)
    return item


@router.delete("/cash-flow/debt/{debt_id}")
def delete_debt(debt_id: str, request: Request):
    """Delete a personal debt with permanent tombstone persistence."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    del_debt_set = set(db.get("deletedDebtIds") or [])
    del_debt_set.add(debt_id)
    db["deletedDebtIds"] = list(del_debt_set)
    db["debts"] = [x for x in db.get("debts", []) if x.get("id") != debt_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": debt_id, "deletedDebtIds": db["deletedDebtIds"]}


@router.post("/cash-flow/debt/{debt_id}/notify-telegram")
def notify_debt_telegram(debt_id: str, request: Request):
    """Send an instant Telegram alert for a specific debt due date or loan collection."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    debt = next((d for d in db.get("debts", []) if d.get("id") == debt_id), None)
    if not debt:
        raise HTTPException(status_code=404, detail="Deuda o préstamo no encontrado")

    concept = debt.get("concept", "Deuda")
    debt_type = debt.get("debtType", "payable")
    person = debt.get("debtor") if debt_type == "receivable" else debt.get("creditor")
    person_name = person or ("Deudor" if debt_type == "receivable" else "Acreedor")

    amount = float(debt.get("installmentAmount") or debt.get("remainingAmount") or debt.get("totalAmount") or 0)
    due_date = debt.get("dueDate") or debt.get("nextPaymentDate")
    payment_method = debt.get("paymentMethod")
    currency = db.get("currency", "COP")

    sent = send_debt_reminder_telegram(
        concept=concept,
        person_name=person_name,
        amount=amount,
        due_date=due_date,
        debt_type=debt_type,
        payment_method=payment_method,
        currency=currency,
    )
    return {"status": "ok", "sent": sent, "debtId": debt_id}


@router.post("/cash-flow/debts/check-reminders")
def check_all_debt_reminders(request: Request):
    """Check all active debts and receivables due within 3 days or today and notify via Telegram."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    debts = db.get("debts", [])

    from datetime import timedelta
    today = datetime.now().date()
    max_date = today + timedelta(days=3)

    notified = []
    for debt in debts:
        if debt.get("status") == "paid" or float(debt.get("remainingAmount") or debt.get("totalAmount") or 0) <= 0:
            continue
        due_str = debt.get("dueDate") or debt.get("nextPaymentDate")
        if not due_str:
            continue
        try:
            due_d = datetime.strptime(due_str[:10], "%Y-%m-%d").date()
        except Exception:
            continue

        if due_d <= max_date:
            debt_type = debt.get("debtType", "payable")
            person_name = (debt.get("debtor") if debt_type == "receivable" else debt.get("creditor")) or "Particular"
            amt = float(debt.get("installmentAmount") or debt.get("remainingAmount") or debt.get("totalAmount") or 0)
            ok = send_debt_reminder_telegram(
                concept=debt.get("concept", "Deuda"),
                person_name=person_name,
                amount=amt,
                due_date=due_str[:10],
                debt_type=debt_type,
                payment_method=debt.get("paymentMethod"),
                currency=db.get("currency", "COP"),
            )
            if ok:
                notified.append(debt.get("id"))

    return {"status": "ok", "notifiedCount": len(notified), "debtIds": notified}


@router.post("/cash-flow/inflow")
def create_inflow(item: InflowItem, request: Request):
    """Add a new income stream."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"in_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["inflows"].append(data_dict)
    save_cash_flow_db(db, user_id)
    return data_dict


@router.delete("/cash-flow/inflow/{inflow_id}")
def delete_inflow(inflow_id: str, request: Request):
    """Delete an income stream."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    db["inflows"] = [x for x in db.get("inflows", []) if x.get("id") != inflow_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": inflow_id}


@router.post("/cash-flow/need")
def create_need_expense(item: NeedExpenseItem, request: Request):
    """Add or update an essential fixed expense."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"need_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["needs"].append(data_dict)
    save_cash_flow_db(db, user_id)
    return data_dict


@router.delete("/cash-flow/need/{need_id}")
def delete_need_expense(need_id: str, request: Request):
    """Delete an essential fixed expense."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    db["needs"] = [x for x in db.get("needs", []) if x.get("id") != need_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": need_id}


@router.post("/cash-flow/want")
def create_want_expense(item: WantExpenseItem, request: Request):
    """Add or update a variable lifestyle expense."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"want_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["wants"].append(data_dict)
    save_cash_flow_db(db, user_id)
    return data_dict


@router.delete("/cash-flow/want/{want_id}")
def delete_want_expense(want_id: str, request: Request):
    """Delete a variable lifestyle expense."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    db["wants"] = [x for x in db.get("wants", []) if x.get("id") != want_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": want_id}


@router.post("/cash-flow/wealth")
def create_wealth_item(item: WealthItem, request: Request):
    """Add or update a wealth / savings / investment allocation."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    data_dict = item.model_dump()
    if not data_dict.get("id"):
        data_dict["id"] = f"wealth_{uuid.uuid4().hex[:8]}"
    if not data_dict.get("createdAt"):
        data_dict["createdAt"] = datetime.utcnow().isoformat() + "Z"

    db["wealth"].append(data_dict)
    save_cash_flow_db(db, user_id)
    return data_dict


@router.delete("/cash-flow/wealth/{wealth_id}")
def delete_wealth_item(wealth_id: str, request: Request):
    """Delete a wealth / savings / investment allocation."""
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    db = load_cash_flow_db(user_id)
    db["wealth"] = [x for x in db.get("wealth", []) if x.get("id") != wealth_id]
    save_cash_flow_db(db, user_id)
    return {"status": "ok", "deletedId": wealth_id}
