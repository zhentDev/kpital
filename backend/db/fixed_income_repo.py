"""Fixed Income Relational SQL Repository (100% Supabase PostgreSQL, Zero JSON files)."""

from typing import Any, Optional
from psycopg2.extras import Json
from db.connection import pg_session, OWNER_ID


def get_user_fixed_income_db(user_id: Optional[str] = None) -> dict[str, Any]:
    """Reconstructs Fixed Income state directly from normalized Supabase SQL tables (`fi_*`)."""
    uid = user_id or OWNER_ID
    entities = []
    accounts = []
    cdts = []
    transactions = []

    with pg_session() as conn:
        with conn.cursor() as cur:
            # 1. Entities
            cur.execute("""
                SELECT id, name, country, color, icon, extra_json, created_at
                FROM fi_entities
                WHERE user_id = %s
                ORDER BY created_at ASC NULLS LAST
            """, [uid])
            for eid, name, country, color, icon, extra_j, c_at in cur.fetchall():
                e = dict(extra_j) if isinstance(extra_j, dict) else {}
                e.update({
                    "id": eid,
                    "name": name,
                    "country": country or "🇨🇴",
                    "color": color or "#10b981",
                    "icon": icon or "🏦",
                    "createdAt": c_at,
                })
                entities.append(e)

            # 2. Accounts
            cur.execute("""
                SELECT id, entity_id, name, type, account_category, sync_type,
                       currency, balance, interest_rate_ea, is_tax_exempt_gmf,
                       rate_history_json, extra_json, created_at
                FROM fi_accounts
                WHERE user_id = %s
                ORDER BY created_at ASC NULLS LAST
            """, [uid])
            for (
                aid, ent_id, name, atype, acat, stype,
                curr, bal, rate_ea, tax_ex, rhist_j, extra_j, c_at
            ) in cur.fetchall():
                a = dict(extra_j) if isinstance(extra_j, dict) else {}
                a.update({
                    "id": aid,
                    "entityId": ent_id,
                    "name": name,
                    "type": atype or "savings",
                    "accountCategory": acat or "high_yield",
                    "syncType": stype or "api",
                    "currency": curr or "COP",
                    "balance": float(bal or 0.0),
                    "interestRateEA": float(rate_ea or 0.0),
                    "isTaxExemptGMF": bool(tax_ex),
                    "rateHistory": rhist_j if isinstance(rhist_j, list) else [],
                    "createdAt": c_at,
                })
                accounts.append(a)

            # 3. CDTs
            cur.execute("""
                SELECT id, entity_id, name, capital, currency, interest_rate_ea,
                       term_days, start_date, maturity_date, rete_fuente_pct,
                       is_auto_renew, status, extra_json, created_at
                FROM fi_cdts
                WHERE user_id = %s
                ORDER BY start_date DESC NULLS LAST
            """, [uid])
            for (
                cid, ent_id, name, cap, curr, rate_ea,
                tdays, s_dt, m_dt, rete_p, auto_r, status, extra_j, c_at
            ) in cur.fetchall():
                c = dict(extra_j) if isinstance(extra_j, dict) else {}
                c.update({
                    "id": cid,
                    "entityId": ent_id,
                    "name": name,
                    "capital": float(cap or 0.0),
                    "currency": curr or "COP",
                    "interestRateEA": float(rate_ea or 0.0),
                    "termDays": int(tdays or 180),
                    "startDate": s_dt,
                    "maturityDate": m_dt,
                    "reteFuentePct": float(rete_p or 4.0),
                    "isAutoRenew": bool(auto_r),
                    "status": status or "active",
                    "createdAt": c_at,
                })
                cdts.append(c)

            # 4. Transactions
            cur.execute("""
                SELECT id, account_id, entity_id, date, time, type, amount,
                       currency, description, category, source, extra_json, created_at
                FROM fi_transactions
                WHERE user_id = %s
                ORDER BY date DESC NULLS LAST, time DESC NULLS LAST, created_at DESC NULLS LAST
            """, [uid])
            for (
                tid, acc_id, ent_id, dt, tm, ttype, amt,
                curr, desc, cat, src, extra_j, c_at
            ) in cur.fetchall():
                t = dict(extra_j) if isinstance(extra_j, dict) else {}
                t.update({
                    "id": tid,
                    "accountId": acc_id,
                    "entityId": ent_id,
                    "date": dt,
                    "time": tm,
                    "type": ttype or "deposit",
                    "amount": float(amt or 0.0),
                    "currency": curr or "COP",
                    "description": desc,
                    "category": cat,
                    "source": src,
                    "createdAt": c_at,
                })
                transactions.append(t)

    return {
        "entities": entities,
        "accounts": accounts,
        "cdts": cdts,
        "transactions": transactions,
    }


def save_user_fixed_income_db(user_id: Optional[str], fi_data: dict[str, Any]) -> None:
    """Atomically synchronizes Fixed Income state into normalized Supabase SQL tables (`fi_*`)."""
    uid = user_id or OWNER_ID

    with pg_session() as conn:
        with conn.cursor() as cur:
            # 1. Entities
            cur.execute("DELETE FROM fi_entities WHERE user_id = %s", [uid])
            for e in fi_data.get("entities") or []:
                if not isinstance(e, dict) or not e.get("id"):
                    continue
                cur.execute("""
                    INSERT INTO fi_entities (
                        id, user_id, name, country, color, icon, extra_json, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, id) DO UPDATE SET
                        name = EXCLUDED.name,
                        country = EXCLUDED.country,
                        color = EXCLUDED.color,
                        icon = EXCLUDED.icon,
                        extra_json = EXCLUDED.extra_json,
                        updated_at = CURRENT_TIMESTAMP
                """, [
                    e["id"], uid, e.get("name", ""), e.get("country", "🇨🇴"),
                    e.get("color", "#10b981"), e.get("icon", "🏦"), Json(e), e.get("createdAt")
                ])

            # 2. Accounts
            cur.execute("DELETE FROM fi_accounts WHERE user_id = %s", [uid])
            for a in fi_data.get("accounts") or []:
                if not isinstance(a, dict) or not a.get("id"):
                    continue
                cur.execute("""
                    INSERT INTO fi_accounts (
                        id, user_id, entity_id, name, type, account_category, sync_type,
                        currency, balance, interest_rate_ea, is_tax_exempt_gmf,
                        rate_history_json, extra_json, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, id) DO UPDATE SET
                        entity_id = EXCLUDED.entity_id,
                        name = EXCLUDED.name,
                        type = EXCLUDED.type,
                        account_category = EXCLUDED.account_category,
                        sync_type = EXCLUDED.sync_type,
                        currency = EXCLUDED.currency,
                        balance = EXCLUDED.balance,
                        interest_rate_ea = EXCLUDED.interest_rate_ea,
                        is_tax_exempt_gmf = EXCLUDED.is_tax_exempt_gmf,
                        rate_history_json = EXCLUDED.rate_history_json,
                        extra_json = EXCLUDED.extra_json,
                        updated_at = CURRENT_TIMESTAMP
                """, [
                    a["id"], uid, a.get("entityId", ""), a.get("name", ""),
                    a.get("type", "savings"), a.get("accountCategory", "high_yield"),
                    a.get("syncType", "api"), a.get("currency", "COP"),
                    float(a.get("balance") or 0.0), float(a.get("interestRateEA") or 0.0),
                    bool(a.get("isTaxExemptGMF", True)), Json(a.get("rateHistory") or []),
                    Json(a), a.get("createdAt")
                ])

            # 3. CDTs
            cur.execute("DELETE FROM fi_cdts WHERE user_id = %s", [uid])
            for c in fi_data.get("cdts") or []:
                if not isinstance(c, dict) or not c.get("id"):
                    continue
                cur.execute("""
                    INSERT INTO fi_cdts (
                        id, user_id, entity_id, name, capital, currency, interest_rate_ea,
                        term_days, start_date, maturity_date, rete_fuente_pct, is_auto_renew,
                        status, extra_json, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, id) DO UPDATE SET
                        entity_id = EXCLUDED.entity_id,
                        name = EXCLUDED.name,
                        capital = EXCLUDED.capital,
                        currency = EXCLUDED.currency,
                        interest_rate_ea = EXCLUDED.interest_rate_ea,
                        term_days = EXCLUDED.term_days,
                        start_date = EXCLUDED.start_date,
                        maturity_date = EXCLUDED.maturity_date,
                        rete_fuente_pct = EXCLUDED.rete_fuente_pct,
                        is_auto_renew = EXCLUDED.is_auto_renew,
                        status = EXCLUDED.status,
                        extra_json = EXCLUDED.extra_json,
                        updated_at = CURRENT_TIMESTAMP
                """, [
                    c["id"], uid, c.get("entityId", ""), c.get("name", ""),
                    float(c.get("capital") or 0.0), c.get("currency", "COP"),
                    float(c.get("interestRateEA") or 0.0), int(c.get("termDays") or 180),
                    c.get("startDate"), c.get("maturityDate"),
                    float(c.get("reteFuentePct") or 4.0), bool(c.get("isAutoRenew", False)),
                    c.get("status", "active"), Json(c), c.get("createdAt")
                ])

            # 4. Transactions
            cur.execute("DELETE FROM fi_transactions WHERE user_id = %s", [uid])
            for t in fi_data.get("transactions") or []:
                if not isinstance(t, dict) or not t.get("id"):
                    continue
                cur.execute("""
                    INSERT INTO fi_transactions (
                        id, user_id, account_id, entity_id, date, time, type, amount,
                        currency, description, category, source, extra_json, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, id) DO UPDATE SET
                        account_id = EXCLUDED.account_id,
                        entity_id = EXCLUDED.entity_id,
                        date = EXCLUDED.date,
                        time = EXCLUDED.time,
                        type = EXCLUDED.type,
                        amount = EXCLUDED.amount,
                        currency = EXCLUDED.currency,
                        description = EXCLUDED.description,
                        category = EXCLUDED.category,
                        source = EXCLUDED.source,
                        extra_json = EXCLUDED.extra_json,
                        updated_at = CURRENT_TIMESTAMP
                """, [
                    t["id"], uid, t.get("accountId"), t.get("entityId"),
                    t.get("date"), t.get("time"), t.get("type", "deposit"),
                    float(t.get("amount") or 0.0), t.get("currency", "COP"),
                    t.get("description") or t.get("note"), t.get("category"),
                    t.get("source"), Json(t), t.get("createdAt")
                ])


def get_historical_rates_db() -> dict[str, Any]:
    """Reads all historical interest rates from `fi_historical_rates` in Supabase."""
    entities = {}
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT entity_id, entity_data_json FROM fi_historical_rates")
            for eid, edata in cur.fetchall():
                if isinstance(edata, dict):
                    entities[eid] = edata
    return {"entities": entities}


def upsert_historical_rate_entity_db(entity_id: str, entity_data: dict[str, Any]) -> None:
    """Upserts an entity's historical rate structure into `fi_historical_rates` in Supabase."""
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO fi_historical_rates (entity_id, entity_data_json, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (entity_id) DO UPDATE SET
                    entity_data_json = EXCLUDED.entity_data_json,
                    updated_at = CURRENT_TIMESTAMP
            """, [entity_id, Json(entity_data)])
