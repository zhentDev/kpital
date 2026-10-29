"""Cash Flow Relational SQL Repository (100% Supabase PostgreSQL, Zero JSON files)."""

from typing import Any, Optional
from psycopg2.extras import Json
from db.connection import pg_session, OWNER_ID

DEFAULT_CASH_FLOW_DATA = {
    "activePeriod": "2026-11",
    "startPeriod": "2026-11",
    "currency": "COP",
    "allocationModel": "custom",
    "customRatios": {"needs": 40.0, "wants": 20.0, "savings": 40.0},
    "emergencyFundTargetMonths": 6,
    "inflows": [],
    "needs": [],
    "wants": [],
    "wealth": [],
    "expensesLog": [],
    "creditCards": [],
    "creditPurchases": [],
    "creditCardPayments": [],
    "debts": [],
    "periodsData": {},
    "payrollAccount": {},
    "deletedExpenseIds": [],
    "deletedDebtIds": [],
    "deletedCreditCardPaymentIds": [],
}


def get_user_cash_flow_db(user_id: Optional[str] = None) -> dict[str, Any]:
    """Reconstructs the complete Cash Flow state directly from normalized Supabase SQL tables."""
    uid = user_id or OWNER_ID
    result = {k: (v.copy() if isinstance(v, (dict, list)) else v) for k, v in DEFAULT_CASH_FLOW_DATA.items()}

    with pg_session() as conn:
        with conn.cursor() as cur:
            # 1. Periods Config
            cur.execute("""
                SELECT period, start_period, active_period, currency, allocation_model,
                       needs_ratio, wants_ratio, savings_ratio, emergency_months,
                       payroll_account_json, deleted_ids_json
                FROM cf_periods_config
                WHERE user_id = %s
            """, [uid])
            cfg_rows = cur.fetchall()

            periods_data: dict[str, Any] = {}
            for r in cfg_rows:
                per, start_p, active_p, curr, alloc_m, n_rat, w_rat, s_rat, em_m, pay_json, del_json = r
                if per == "base":
                    result["startPeriod"] = start_p or "2026-11"
                    result["activePeriod"] = active_p or "2026-11"
                    result["currency"] = curr or "COP"
                    result["allocationModel"] = alloc_m or "custom"
                    result["customRatios"] = {
                        "needs": float(n_rat if n_rat is not None else 40.0),
                        "wants": float(w_rat if w_rat is not None else 20.0),
                        "savings": float(s_rat if s_rat is not None else 40.0),
                    }
                    result["emergencyFundTargetMonths"] = int(em_m if em_m is not None else 6)
                    result["payrollAccount"] = pay_json if isinstance(pay_json, dict) else {}
                    if isinstance(del_json, dict):
                        result["deletedExpenseIds"] = del_json.get("deletedExpenseIds") or []
                        result["deletedDebtIds"] = del_json.get("deletedDebtIds") or []
                        result["deletedCreditCardPaymentIds"] = del_json.get("deletedCreditCardPaymentIds") or []
                else:
                    periods_data[per] = {
                        "allocationModel": alloc_m or "custom",
                        "customRatios": {
                            "needs": float(n_rat if n_rat is not None else 40.0),
                            "wants": float(w_rat if w_rat is not None else 20.0),
                            "savings": float(s_rat if s_rat is not None else 40.0),
                        },
                    }

            # 2. Budget Envelopes
            cur.execute("""
                SELECT period, pillar, id, name, amount, category, sub_items_json, is_explicit_sankey_income, extra_json
                FROM cf_budget_envelopes
                WHERE user_id = %s
                ORDER BY updated_at ASC
            """, [uid])
            for per, pillar, eid, name, amt, cat, sub_j, is_sankey, extra_j in cur.fetchall():
                item = dict(extra_j) if isinstance(extra_j, dict) else {}
                item["id"] = eid
                item["name"] = name
                if "amount" in item or pillar in ("inflows", "needs", "wants"):
                    item["amount"] = float(amt or 0.0)
                item["category"] = cat or item.get("category", "general")
                if sub_j:
                    item["subItems"] = sub_j
                if is_sankey:
                    item["isExplicitBudgetIncome"] = True

                if per == "base":
                    if pillar in result and isinstance(result[pillar], list):
                        result[pillar].append(item)
                else:
                    if per not in periods_data:
                        periods_data[per] = {}
                    if pillar not in periods_data[per]:
                        periods_data[per][pillar] = []
                    periods_data[per][pillar].append(item)

            result["periodsData"] = periods_data

            # 3. Movements (cf_movements)
            cur.execute("""
                SELECT id, period, date, time, type, amount, currency, description,
                       budget_item_id, budget_item_name, budget_item_type, sub_item_id, sub_item_name,
                       payment_source_json, destination_account_id, destination_account_name,
                       is_split_child, split_parent_id, credit_card_payment_id, card_id, debt_id,
                       is_loan, is_shared_expense, participants_json, is_explicit_sankey_income,
                       extra_json, created_at
                FROM cf_movements
                WHERE user_id = %s
                ORDER BY date DESC NULLS LAST, time DESC NULLS LAST, created_at DESC NULLS LAST
            """, [uid])
            movements = []
            for r in cur.fetchall():
                (
                    mid, per, dt, tm, mtype, amt, curr, desc,
                    bid, bname, btype, sid, sname,
                    psrc, dacc_id, dacc_name,
                    is_sc, sp_id, ccp_id, cid, did,
                    is_ln, is_sh, part_j, is_sk,
                    extra_j, c_at
                ) = r
                m = dict(extra_j) if isinstance(extra_j, dict) else {}
                m.update({
                    "id": mid,
                    "period": per,
                    "date": dt,
                    "time": tm,
                    "type": mtype,
                    "amount": float(amt or 0.0),
                    "currency": curr or "COP",
                    "description": desc,
                    "budgetItemId": bid,
                    "budgetItemName": bname,
                    "budgetItemType": btype,
                    "subItemId": sid,
                    "subItemName": sname,
                    "paymentSource": psrc if isinstance(psrc, dict) else {},
                })
                if dacc_id:
                    m["destinationAccountId"] = dacc_id
                if dacc_name:
                    m["destinationAccountName"] = dacc_name
                if is_sc:
                    m["isSplitChild"] = True
                if sp_id:
                    m["splitParentId"] = sp_id
                if ccp_id:
                    m["creditCardPaymentId"] = ccp_id
                if cid:
                    m["cardId"] = cid
                if did:
                    m["debtId"] = did
                if is_ln:
                    m["isLoan"] = True
                if is_sh:
                    m["isSplit"] = True
                if part_j:
                    m["participants"] = part_j
                if is_sk:
                    m["isExplicitBudgetIncome"] = True
                if c_at:
                    m["createdAt"] = c_at
                movements.append(m)
            result["expensesLog"] = movements

            # 4. Credit Cards
            cur.execute("""
                SELECT id, name, brand, total_limit, used_limit, cutoff_day, due_day, extra_json
                FROM cf_credit_cards
                WHERE user_id = %s
            """, [uid])
            cards = []
            for cid, name, brand, tot_l, used_l, cut_d, due_d, extra_j in cur.fetchall():
                c = dict(extra_j) if isinstance(extra_j, dict) else {}
                c.update({
                    "id": cid,
                    "name": name,
                    "cardType": brand or c.get("cardType", "mastercard"),
                    "totalLimit": float(tot_l or 0.0),
                    "usedLimit": float(used_l or 0.0),
                    "closingDay": cut_d,
                    "paymentDay": due_d,
                })
                cards.append(c)
            result["creditCards"] = cards

            # 5. Credit Purchases
            cur.execute("""
                SELECT id, card_id, movement_id, description, total_amount, installments_count,
                       monthly_installment, start_period, date, extra_json, created_at
                FROM cf_credit_purchases
                WHERE user_id = %s
                ORDER BY date DESC NULLS LAST, created_at DESC NULLS LAST
            """, [uid])
            purchases = []
            for cpid, cid, mov_id, desc, tot_a, inst_c, m_inst, s_per, dt, extra_j, c_at in cur.fetchall():
                cp = dict(extra_j) if isinstance(extra_j, dict) else {}
                cp.update({
                    "id": cpid,
                    "cardId": cid,
                    "description": desc,
                    "amount": float(tot_a or 0.0),
                    "totalAmount": float(tot_a or 0.0),
                    "installmentsCount": int(inst_c or 1),
                    "monthlyInstallment": float(m_inst or tot_a or 0.0),
                    "startPeriod": s_per,
                    "date": dt,
                    "createdAt": c_at,
                })
                if mov_id:
                    cp["movementId"] = mov_id
                purchases.append(cp)
            result["creditPurchases"] = purchases

            # 6. Credit Card Payments
            cur.execute("""
                SELECT id, card_id, card_name, period, amount, date, time,
                       source_type, source_account_id, source_account_name,
                       budget_deductions_json, notes, extra_json, created_at
                FROM cf_credit_payments
                WHERE user_id = %s
                ORDER BY date DESC NULLS LAST, time DESC NULLS LAST
            """, [uid])
            payments = []
            for pid, cid, cname, per, amt, dt, tm, stype, sacc_id, sacc_name, bded_j, notes, extra_j, c_at in cur.fetchall():
                p = dict(extra_j) if isinstance(extra_j, dict) else {}
                p.update({
                    "id": pid,
                    "cardId": cid,
                    "cardName": cname,
                    "period": per,
                    "amount": float(amt or 0.0),
                    "date": dt,
                    "time": tm,
                    "sourceType": stype,
                    "sourceAccountId": sacc_id,
                    "sourceAccount": sacc_name,
                    "budgetDeductions": bded_j if isinstance(bded_j, list) else [],
                    "notes": notes,
                    "createdAt": c_at,
                })
                payments.append(p)
            result["creditCardPayments"] = payments

            # 7. Debts & Loans
            cur.execute("""
                SELECT id, origin_movement_id, debt_type, concept, debtor, creditor,
                       total_amount, remaining_amount, my_share, status,
                       participants_json, payments_log_json, notes, extra_json, created_at
                FROM cf_debts
                WHERE user_id = %s
                ORDER BY created_at DESC NULLS LAST
            """, [uid])
            debts = []
            for did, orig_id, dtype, concept, debtor, creditor, tot_a, rem_a, my_s, status, part_j, plog_j, notes, extra_j, c_at in cur.fetchall():
                d = dict(extra_j) if isinstance(extra_j, dict) else {}
                d.update({
                    "id": did,
                    "debtType": dtype or "payable",
                    "concept": concept,
                    "debtor": debtor,
                    "creditor": creditor,
                    "totalAmount": float(tot_a or 0.0),
                    "remainingAmount": float(rem_a or 0.0),
                    "status": status or "pending",
                    "participants": part_j if isinstance(part_j, list) else [],
                    "paymentsLog": plog_j if isinstance(plog_j, list) else [],
                    "notes": notes,
                    "createdAt": c_at,
                })
                if orig_id:
                    d["linkedExpenseId"] = orig_id
                if my_s:
                    d["myShare"] = float(my_s)
                debts.append(d)
            result["debts"] = debts

    return result


def save_user_cash_flow_db(user_id: Optional[str], cf_data: dict[str, Any]) -> None:
    """Atomically synchronizes Cash Flow state into normalized Supabase PostgreSQL tables."""
    uid = user_id or OWNER_ID
    active_period = cf_data.get("activePeriod", "2026-11")
    start_period = cf_data.get("startPeriod", "2026-11")
    currency = cf_data.get("currency", "COP")
    alloc_model = cf_data.get("allocationModel", "custom")
    ratios = cf_data.get("customRatios") or {"needs": 40.0, "wants": 20.0, "savings": 40.0}
    emerg_months = int(cf_data.get("emergencyFundTargetMonths") or 6)
    payroll_acc = cf_data.get("payrollAccount") or {}
    del_exp_ids = set(cf_data.get("deletedExpenseIds") or [])
    del_debt_ids = set(cf_data.get("deletedDebtIds") or [])
    del_pay_ids = set(cf_data.get("deletedCreditCardPaymentIds") or [])
    deleted_ids = {
        "deletedExpenseIds": list(del_exp_ids),
        "deletedDebtIds": list(del_debt_ids),
        "deletedCreditCardPaymentIds": list(del_pay_ids),
    }

    with pg_session() as conn:
        with conn.cursor() as cur:
            # 1. Upsert base config
            cur.execute("""
                INSERT INTO cf_periods_config (
                    user_id, period, start_period, active_period, currency, allocation_model,
                    needs_ratio, wants_ratio, savings_ratio, emergency_months, payroll_account_json, deleted_ids_json
                ) VALUES (%s, 'base', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, period) DO UPDATE SET
                    start_period = EXCLUDED.start_period,
                    active_period = EXCLUDED.active_period,
                    currency = EXCLUDED.currency,
                    allocation_model = EXCLUDED.allocation_model,
                    needs_ratio = EXCLUDED.needs_ratio,
                    wants_ratio = EXCLUDED.wants_ratio,
                    savings_ratio = EXCLUDED.savings_ratio,
                    emergency_months = EXCLUDED.emergency_months,
                    payroll_account_json = EXCLUDED.payroll_account_json,
                    deleted_ids_json = EXCLUDED.deleted_ids_json,
                    updated_at = CURRENT_TIMESTAMP
            """, [
                uid, start_period, active_period, currency, alloc_model,
                float(ratios.get("needs", 40.0)), float(ratios.get("wants", 20.0)), float(ratios.get("savings", 40.0)),
                emerg_months, Json(payroll_acc), Json(deleted_ids)
            ])

            # 2. Replace base envelopes cleanly
            cur.execute("DELETE FROM cf_budget_envelopes WHERE user_id = %s AND period = 'base'", [uid])
            for pillar in ["inflows", "needs", "wants", "wealth"]:
                for idx, item in enumerate(cf_data.get(pillar) or []):
                    if not isinstance(item, dict):
                        continue
                    item_id = item.get("id") or f"{pillar}_{idx}"
                    amt = float(item.get("amount") or item.get("budgetedAmount") or item.get("monthlyContribution") or item.get("targetAmount") or 0.0)
                    cur.execute("""
                        INSERT INTO cf_budget_envelopes (
                            id, user_id, period, pillar, name, amount, category,
                            sub_items_json, is_explicit_sankey_income, extra_json
                        ) VALUES (%s, %s, 'base', %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (user_id, period, pillar, id) DO UPDATE SET
                            name = EXCLUDED.name,
                            amount = EXCLUDED.amount,
                            category = EXCLUDED.category,
                            sub_items_json = EXCLUDED.sub_items_json,
                            is_explicit_sankey_income = EXCLUDED.is_explicit_sankey_income,
                            extra_json = EXCLUDED.extra_json,
                            updated_at = CURRENT_TIMESTAMP
                    """, [
                        item_id, uid, pillar, item.get("name", ""),
                        amt, item.get("category", "general"),
                        Json(item.get("subItems") or []),
                        bool(item.get("isExplicitBudgetIncome") or item.get("isExplicitSankeyIncome")),
                        Json(item)
                    ])

            # Period-specific envelopes
            for per_key, pdata in (cf_data.get("periodsData") or {}).items():
                if not isinstance(pdata, dict):
                    continue
                p_ratios = pdata.get("customRatios") or ratios
                p_alloc = pdata.get("allocationModel") or alloc_model
                cur.execute("""
                    INSERT INTO cf_periods_config (
                        user_id, period, start_period, active_period, currency, allocation_model,
                        needs_ratio, wants_ratio, savings_ratio, emergency_months, payroll_account_json, deleted_ids_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '{}'::jsonb)
                    ON CONFLICT (user_id, period) DO UPDATE SET
                        allocation_model = EXCLUDED.allocation_model,
                        needs_ratio = EXCLUDED.needs_ratio,
                        wants_ratio = EXCLUDED.wants_ratio,
                        savings_ratio = EXCLUDED.savings_ratio,
                        updated_at = CURRENT_TIMESTAMP
                """, [
                    uid, per_key, start_period, active_period, currency, p_alloc,
                    float(p_ratios.get("needs", 40.0)), float(p_ratios.get("wants", 20.0)), float(p_ratios.get("savings", 40.0)),
                    emerg_months, Json(payroll_acc)
                ])
                cur.execute("DELETE FROM cf_budget_envelopes WHERE user_id = %s AND period = %s", [uid, per_key])
                for pillar in ["inflows", "needs", "wants", "wealth"]:
                    if pillar in pdata and isinstance(pdata[pillar], list):
                        for idx, item in enumerate(pdata[pillar]):
                            if not isinstance(item, dict):
                                continue
                            item_id = item.get("id") or f"{pillar}_{idx}"
                            amt = float(item.get("amount") or item.get("budgetedAmount") or item.get("monthlyContribution") or item.get("targetAmount") or 0.0)
                            cur.execute("""
                                INSERT INTO cf_budget_envelopes (
                                    id, user_id, period, pillar, name, amount, category,
                                    sub_items_json, is_explicit_sankey_income, extra_json
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                ON CONFLICT (user_id, period, pillar, id) DO UPDATE SET
                                    name = EXCLUDED.name,
                                    amount = EXCLUDED.amount,
                                    extra_json = EXCLUDED.extra_json
                            """, [
                                item_id, uid, per_key, pillar, item.get("name", ""),
                                amt, item.get("category", "general"),
                                Json(item.get("subItems") or []),
                                bool(item.get("isExplicitBudgetIncome") or item.get("isExplicitSankeyIncome")),
                                Json(item)
                            ])

            # 3. Movements (delete explicitly deleted IDs & upsert current)
            if del_exp_ids:
                cur.execute("DELETE FROM cf_movements WHERE user_id = %s AND id = ANY(%s)", [uid, list(del_exp_ids)])

            incoming_mov_ids = []
            for m in cf_data.get("expensesLog") or []:
                if not isinstance(m, dict) or not m.get("id") or m["id"] in del_exp_ids:
                    continue
                incoming_mov_ids.append(m["id"])
                cur.execute("""
                    INSERT INTO cf_movements (
                        id, user_id, period, date, time, type, amount, currency, description,
                        budget_item_id, budget_item_name, budget_item_type, sub_item_id, sub_item_name,
                        payment_source_json, destination_account_id, destination_account_name,
                        is_split_child, split_parent_id, credit_card_payment_id, card_id, debt_id,
                        is_loan, is_shared_expense, participants_json, is_explicit_sankey_income,
                        extra_json, created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s
                    )
                    ON CONFLICT (user_id, id) DO UPDATE SET
                        period = EXCLUDED.period,
                        date = EXCLUDED.date,
                        time = EXCLUDED.time,
                        type = EXCLUDED.type,
                        amount = EXCLUDED.amount,
                        description = EXCLUDED.description,
                        budget_item_id = EXCLUDED.budget_item_id,
                        budget_item_name = EXCLUDED.budget_item_name,
                        budget_item_type = EXCLUDED.budget_item_type,
                        sub_item_id = EXCLUDED.sub_item_id,
                        sub_item_name = EXCLUDED.sub_item_name,
                        payment_source_json = EXCLUDED.payment_source_json,
                        destination_account_id = EXCLUDED.destination_account_id,
                        destination_account_name = EXCLUDED.destination_account_name,
                        is_split_child = EXCLUDED.is_split_child,
                        split_parent_id = EXCLUDED.split_parent_id,
                        credit_card_payment_id = EXCLUDED.credit_card_payment_id,
                        card_id = EXCLUDED.card_id,
                        debt_id = EXCLUDED.debt_id,
                        is_loan = EXCLUDED.is_loan,
                        is_shared_expense = EXCLUDED.is_shared_expense,
                        participants_json = EXCLUDED.participants_json,
                        is_explicit_sankey_income = EXCLUDED.is_explicit_sankey_income,
                        extra_json = EXCLUDED.extra_json,
                        updated_at = CURRENT_TIMESTAMP
                """, [
                    m["id"], uid, m.get("period", active_period), m.get("date"), m.get("time"),
                    m.get("type", "debit"), float(m.get("amount") or 0.0), m.get("currency", "COP"),
                    m.get("description"), m.get("budgetItemId"), m.get("budgetItemName"), m.get("budgetItemType"),
                    m.get("subItemId"), m.get("subItemName"), Json(m.get("paymentSource") or {}),
                    m.get("destinationAccountId"), m.get("destinationAccountName"),
                    bool(m.get("isSplitChild") or m.get("isSplitDeductionChild")),
                    m.get("splitParentId"), m.get("creditCardPaymentId"), m.get("cardId"), m.get("debtId"),
                    bool(m.get("isLoan")), bool(m.get("isSplit") or m.get("isSharedExpense")),
                    Json(m.get("participants") or []),
                    bool(m.get("isExplicitBudgetIncome") or m.get("isExplicitSankeyIncome")),
                    Json(m), m.get("createdAt")
                ])

            # 4. Credit Cards
            cur.execute("DELETE FROM cf_credit_cards WHERE user_id = %s", [uid])
            for c in cf_data.get("creditCards") or []:
                if not isinstance(c, dict) or not c.get("id"):
                    continue
                cur.execute("""
                    INSERT INTO cf_credit_cards (
                        id, user_id, name, brand, total_limit, used_limit, cutoff_day, due_day, extra_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, [
                    c["id"], uid, c.get("name", ""), c.get("cardType") or c.get("brand"),
                    float(c.get("totalLimit") or 0.0), float(c.get("usedLimit") or 0.0),
                    c.get("closingDay") or c.get("cutoffDay"), c.get("paymentDay") or c.get("dueDay"),
                    Json(c)
                ])

            # 5. Credit Purchases
            for cp in cf_data.get("creditPurchases") or []:
                if not isinstance(cp, dict) or not cp.get("id"):
                    continue
                tot_amt = float(cp.get("totalAmount") or cp.get("amount") or 0.0)
                cur.execute("""
                    INSERT INTO cf_credit_purchases (
                        id, user_id, card_id, movement_id, description, total_amount,
                        installments_count, monthly_installment, start_period, date, extra_json, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, id) DO UPDATE SET
                        card_id = EXCLUDED.card_id,
                        description = EXCLUDED.description,
                        total_amount = EXCLUDED.total_amount,
                        installments_count = EXCLUDED.installments_count,
                        monthly_installment = EXCLUDED.monthly_installment,
                        start_period = EXCLUDED.start_period,
                        date = EXCLUDED.date,
                        extra_json = EXCLUDED.extra_json
                """, [
                    cp["id"], uid, cp.get("cardId", ""), cp.get("movementId"),
                    cp.get("description"), tot_amt, int(cp.get("installmentsCount") or 1),
                    float(cp.get("monthlyInstallment") or tot_amt), cp.get("startPeriod"),
                    cp.get("date"), Json(cp), cp.get("createdAt")
                ])

            # 6. Credit Card Payments
            if del_pay_ids:
                cur.execute("DELETE FROM cf_credit_payments WHERE user_id = %s AND id = ANY(%s)", [uid, list(del_pay_ids)])
            for pay in cf_data.get("creditCardPayments") or []:
                if not isinstance(pay, dict) or not pay.get("id") or pay["id"] in del_pay_ids:
                    continue
                cur.execute("""
                    INSERT INTO cf_credit_payments (
                        id, user_id, card_id, card_name, period, amount, date, time,
                        source_type, source_account_id, source_account_name,
                        budget_deductions_json, notes, extra_json, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, id) DO UPDATE SET
                        card_id = EXCLUDED.card_id,
                        card_name = EXCLUDED.card_name,
                        period = EXCLUDED.period,
                        amount = EXCLUDED.amount,
                        date = EXCLUDED.date,
                        time = EXCLUDED.time,
                        source_type = EXCLUDED.source_type,
                        source_account_id = EXCLUDED.source_account_id,
                        source_account_name = EXCLUDED.source_account_name,
                        budget_deductions_json = EXCLUDED.budget_deductions_json,
                        notes = EXCLUDED.notes,
                        extra_json = EXCLUDED.extra_json
                """, [
                    pay["id"], uid, pay.get("cardId", ""), pay.get("cardName"),
                    pay.get("period"), float(pay.get("amount") or 0.0), pay.get("date"), pay.get("time"),
                    pay.get("sourceType"), pay.get("sourceAccountId"), pay.get("sourceAccount") or pay.get("sourceAccountName"),
                    Json(pay.get("budgetDeductions") or []), pay.get("notes"), Json(pay), pay.get("createdAt")
                ])

            # 7. Debts & Loans
            if del_debt_ids:
                cur.execute("DELETE FROM cf_debts WHERE user_id = %s AND id = ANY(%s)", [uid, list(del_debt_ids)])
            for d in cf_data.get("debts") or []:
                if not isinstance(d, dict) or not d.get("id") or d["id"] in del_debt_ids:
                    continue
                cur.execute("""
                    INSERT INTO cf_debts (
                        id, user_id, origin_movement_id, debt_type, concept, debtor, creditor,
                        total_amount, remaining_amount, my_share, status, participants_json,
                        payments_log_json, notes, extra_json, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, id) DO UPDATE SET
                        origin_movement_id = EXCLUDED.origin_movement_id,
                        debt_type = EXCLUDED.debt_type,
                        concept = EXCLUDED.concept,
                        debtor = EXCLUDED.debtor,
                        creditor = EXCLUDED.creditor,
                        total_amount = EXCLUDED.total_amount,
                        remaining_amount = EXCLUDED.remaining_amount,
                        my_share = EXCLUDED.my_share,
                        status = EXCLUDED.status,
                        participants_json = EXCLUDED.participants_json,
                        payments_log_json = EXCLUDED.payments_log_json,
                        notes = EXCLUDED.notes,
                        extra_json = EXCLUDED.extra_json,
                        updated_at = CURRENT_TIMESTAMP
                """, [
                    d["id"], uid, d.get("linkedExpenseId") or d.get("originMovementId"),
                    d.get("debtType", "payable"), d.get("concept"), d.get("debtor"), d.get("creditor"),
                    float(d.get("totalAmount") or 0.0), float(d.get("remainingAmount") or 0.0),
                    float(d.get("myShare") or d.get("userShare") or 0.0), d.get("status", "pending"),
                    Json(d.get("participants") or []), Json(d.get("paymentsLog") or []),
                    d.get("notes"), Json(d), d.get("createdAt")
                ])


def delete_movement_cascade_db(user_id: Optional[str], movement_id: str) -> dict[str, Any]:
    """Executes atomic PostgreSQL RPC function `rpc_delete_movement_cascade`."""
    uid = user_id or OWNER_ID
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT rpc_delete_movement_cascade(%s, %s)", [uid, movement_id])
            row = cur.fetchone()
            return row[0] if row and row[0] else {"status": "ok"}
