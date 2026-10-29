"""User Authentication & Account SQL Repository (100% Supabase PostgreSQL)."""

from typing import List, Optional
from db.connection import pg_session, OWNER_ID


def get_user_by_email(email: str) -> Optional[dict]:
    clean_email = email.lower().strip()
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
                FROM users
                WHERE LOWER(TRIM(email)) = %s
            """, [clean_email])
            row = cur.fetchone()
            if not row:
                return None
            is_owner = bool(row[1] and row[1].lower().strip() == "caballerojesus703@hotmail.com")
            return {
                "id": row[0],
                "email": row[1],
                "name": row[2],
                "password_hash": row[3],
                "provider": row[4],
                "provider_id": row[5],
                "avatar_url": row[6],
                "created_at": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
                "is_pro": bool(row[8] or is_owner),
            }


def get_user_by_id(user_id: str) -> Optional[dict]:
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, email, name, password_hash, provider, provider_id, avatar_url, created_at, is_pro
                FROM users
                WHERE id = %s
            """, [user_id])
            row = cur.fetchone()
            if not row:
                return None
            is_owner = bool(row[1] and row[1].lower().strip() == "caballerojesus703@hotmail.com")
            return {
                "id": row[0],
                "email": row[1],
                "name": row[2],
                "password_hash": row[3],
                "provider": row[4],
                "provider_id": row[5],
                "avatar_url": row[6],
                "created_at": row[7].isoformat() if hasattr(row[7], "isoformat") else str(row[7]),
                "is_pro": bool(row[8] or is_owner),
            }


def create_user(user_data: dict) -> dict:
    email = user_data["email"].lower().strip()
    name = user_data.get("name") or email.split("@")[0]
    pwd_hash = user_data.get("password_hash")
    provider = user_data.get("provider", "local")
    provider_id = user_data.get("provider_id")
    avatar_url = user_data.get("avatar_url")
    is_pro = bool(user_data.get("is_pro", False))

    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO users (id, email, name, password_hash, provider, provider_id, avatar_url, is_pro)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                    name = EXCLUDED.name,
                    password_hash = EXCLUDED.password_hash,
                    is_pro = EXCLUDED.is_pro
            """, [
                user_data["id"],
                email,
                name,
                pwd_hash,
                provider,
                provider_id,
                avatar_url,
                is_pro,
            ])
    return get_user_by_id(user_data["id"]) or {}


def count_users() -> int:
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            row = cur.fetchone()
            return row[0] if row else 0


def list_all_users() -> List[dict]:
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, email, name, provider, provider_id, avatar_url, created_at, is_pro
                FROM users
                ORDER BY created_at DESC
            """)
            rows = cur.fetchall()
            return [
                {
                    "id": r[0],
                    "email": r[1],
                    "name": r[2],
                    "provider": r[3],
                    "provider_id": r[4],
                    "avatar_url": r[5],
                    "created_at": r[6].isoformat() if hasattr(r[6], "isoformat") else str(r[6]),
                    "is_pro": bool(r[7] or (r[1] and r[1].lower().strip() == "caballerojesus703@hotmail.com")),
                }
                for r in rows
            ]


def delete_user_by_email(email: str) -> bool:
    clean_email = email.lower().strip()
    if clean_email == "caballerojesus703@hotmail.com":
        return False

    user = get_user_by_email(clean_email)
    user_id = user["id"] if user else None

    with pg_session() as conn:
        with conn.cursor() as cur:
            if user_id:
                for table in [
                    "cf_periods_config", "cf_budget_envelopes", "cf_movements",
                    "cf_credit_cards", "cf_credit_purchases", "cf_credit_payments",
                    "cf_debts", "fi_entities", "fi_accounts", "fi_cdts", "fi_transactions",
                    "rv_portfolios", "rv_purchases", "rv_sales", "rv_stock_alerts"
                ]:
                    cur.execute(f"DELETE FROM {table} WHERE user_id = %s", [user_id])
            cur.execute("DELETE FROM users WHERE LOWER(TRIM(email)) = %s", [clean_email])
    return True


def claim_legacy_data(user_id: str):
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE rv_portfolios SET user_id = %s WHERE user_id IS NULL", [user_id])
            cur.execute("UPDATE rv_purchases SET user_id = %s WHERE user_id IS NULL", [user_id])
            cur.execute("UPDATE custom_strategies SET user_id = %s WHERE user_id IS NULL AND is_system = FALSE", [user_id])
            cur.execute(
                "UPDATE rebalances SET user_id = %s WHERE user_id IS NULL AND strategy_id NOT IN ('historical', 'strat_mm20')",
                [user_id],
            )
            cur.execute(
                "UPDATE rebalance_tickers SET user_id = %s WHERE user_id IS NULL AND strategy_id NOT IN ('historical', 'strat_mm20')",
                [user_id],
            )
