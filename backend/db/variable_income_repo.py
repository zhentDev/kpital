"""Variable Income, Strategies, Rebalances & Stock Alerts SQL Repository (100% Supabase PostgreSQL)."""

from datetime import date
from typing import Optional
import uuid
from psycopg2.extras import Json, execute_values
from db.connection import pg_session, OWNER_ID
from db.users_repo import get_user_by_id


# ── Rebalances ────────────────────────────────────────────────────────────────

def add_rebalance(
    rebalance_date: date,
    cash_added: float,
    tickers: list[str],
    strategy_id: str = "historical",
    user_id: Optional[str] = None,
):
    with pg_session() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    "DELETE FROM rebalance_tickers WHERE rebalance_date = %s AND strategy_id = %s AND (user_id = %s OR user_id IS NULL)",
                    [rebalance_date, strategy_id, user_id],
                )
                cur.execute(
                    "DELETE FROM rebalances WHERE rebalance_date = %s AND strategy_id = %s AND (user_id = %s OR user_id IS NULL)",
                    [rebalance_date, strategy_id, user_id],
                )
            else:
                cur.execute("DELETE FROM rebalance_tickers WHERE rebalance_date = %s AND strategy_id = %s", [rebalance_date, strategy_id])
                cur.execute("DELETE FROM rebalances WHERE rebalance_date = %s AND strategy_id = %s", [rebalance_date, strategy_id])

            cur.execute(
                "INSERT INTO rebalances (rebalance_date, cash_added, strategy_id, user_id) VALUES (%s, %s, %s, %s)",
                [rebalance_date, cash_added, strategy_id, user_id],
            )
            for ticker in tickers:
                cur.execute(
                    "INSERT INTO rebalance_tickers (rebalance_date, ticker, strategy_id, user_id) VALUES (%s, %s, %s, %s)",
                    [rebalance_date, ticker, strategy_id, user_id],
                )


def get_all_rebalances(strategy_id: str = "historical", user_id: Optional[str] = None) -> list[dict]:
    with pg_session() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute("""
                    SELECT r.rebalance_date, r.cash_added, ARRAY_AGG(t.ticker) as tickers
                    FROM rebalances r
                    LEFT JOIN rebalance_tickers t ON r.rebalance_date = t.rebalance_date AND r.strategy_id = t.strategy_id
                    WHERE r.strategy_id = %s AND (r.user_id = %s OR r.user_id IS NULL OR r.user_id = %s)
                    GROUP BY r.rebalance_date, r.cash_added
                    ORDER BY r.rebalance_date ASC
                """, [strategy_id, user_id, OWNER_ID])
            else:
                cur.execute("""
                    SELECT r.rebalance_date, r.cash_added, ARRAY_AGG(t.ticker) as tickers
                    FROM rebalances r
                    LEFT JOIN rebalance_tickers t ON r.rebalance_date = t.rebalance_date AND r.strategy_id = t.strategy_id
                    WHERE r.strategy_id = %s AND (r.user_id IS NULL OR r.user_id = %s)
                    GROUP BY r.rebalance_date, r.cash_added
                    ORDER BY r.rebalance_date ASC
                """, [strategy_id, OWNER_ID])

            rebalances = []
            for row in cur.fetchall():
                clean_tickers = [t for t in (row[2] or []) if t is not None]
                d_str = row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])
                rebalances.append({
                    "date": d_str,
                    "rebalance_date": d_str,
                    "cash_added": float(row[1] or 0.0),
                    "tickers": clean_tickers,
                })
            return rebalances


def delete_rebalance(rebalance_date: date, strategy_id: str = "historical", user_id: Optional[str] = None):
    with pg_session() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    "DELETE FROM rebalance_tickers WHERE rebalance_date = %s AND strategy_id = %s AND (user_id = %s OR user_id IS NULL)",
                    [rebalance_date, strategy_id, user_id],
                )
                cur.execute(
                    "DELETE FROM rebalances WHERE rebalance_date = %s AND strategy_id = %s AND (user_id = %s OR user_id IS NULL)",
                    [rebalance_date, strategy_id, user_id],
                )
            else:
                cur.execute("DELETE FROM rebalance_tickers WHERE rebalance_date = %s AND strategy_id = %s", [rebalance_date, strategy_id])
                cur.execute("DELETE FROM rebalances WHERE rebalance_date = %s AND strategy_id = %s", [rebalance_date, strategy_id])


def update_rebalance_date(old_date: date, new_date: date, strategy_id: str = "historical", user_id: Optional[str] = None):
    if old_date == new_date:
        return
    delete_rebalance(new_date, strategy_id, user_id)
    with pg_session() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    "UPDATE rebalance_tickers SET rebalance_date = %s WHERE rebalance_date = %s AND strategy_id = %s AND (user_id = %s OR user_id IS NULL)",
                    [new_date, old_date, strategy_id, user_id],
                )
                cur.execute(
                    "UPDATE rebalances SET rebalance_date = %s WHERE rebalance_date = %s AND strategy_id = %s AND (user_id = %s OR user_id IS NULL)",
                    [new_date, old_date, strategy_id, user_id],
                )
            else:
                cur.execute("UPDATE rebalance_tickers SET rebalance_date = %s WHERE rebalance_date = %s AND strategy_id = %s", [new_date, old_date, strategy_id])
                cur.execute("UPDATE rebalances SET rebalance_date = %s WHERE rebalance_date = %s AND strategy_id = %s", [new_date, old_date, strategy_id])


# ── Custom Strategies ─────────────────────────────────────────────────────────

def get_custom_strategies(user_id: Optional[str] = None) -> list[dict]:
    with pg_session() as conn:
        with conn.cursor() as cur:
            if user_id:
                user = get_user_by_id(user_id)
                if user and user.get("is_pro"):
                    cur.execute("""
                        SELECT id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, created_at
                        FROM custom_strategies
                        WHERE user_id = %s OR is_system = TRUE OR user_id = %s OR user_id IS NULL
                        ORDER BY created_at ASC
                    """, [user_id, OWNER_ID])
                else:
                    cur.execute("""
                        SELECT id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, created_at
                        FROM custom_strategies
                        WHERE is_system = TRUE OR user_id = %s OR user_id IS NULL
                        ORDER BY created_at ASC
                    """, [OWNER_ID])
            else:
                cur.execute("""
                    SELECT id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, created_at
                    FROM custom_strategies
                    WHERE is_system = TRUE OR user_id = %s OR user_id IS NULL
                    ORDER BY created_at ASC
                """, [OWNER_ID])

            return [
                {
                    "id": r[0],
                    "name": r[1],
                    "country": r[2] or "🌎",
                    "numSlots": r[3] or 20,
                    "capital": float(r[4] or 1000.0),
                    "activeInvested": float(r[5] or 1000.0),
                    "benchmark": r[6] or "S&P 500",
                    "color": r[7] or "#a855f7",
                    "isSystem": bool(r[8]),
                    "isRealMoney": bool(r[9]),
                    "createdAt": r[10].isoformat() if hasattr(r[10], "isoformat") else str(r[10]),
                }
                for r in cur.fetchall()
            ]


def save_custom_strategy(strat: dict, user_id: Optional[str] = None):
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO custom_strategies (id, name, country, num_slots, capital, active_invested, benchmark, color, is_system, is_real_money, user_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    country = EXCLUDED.country,
                    num_slots = EXCLUDED.num_slots,
                    capital = EXCLUDED.capital,
                    active_invested = EXCLUDED.active_invested,
                    benchmark = EXCLUDED.benchmark,
                    color = EXCLUDED.color,
                    is_system = EXCLUDED.is_system,
                    is_real_money = EXCLUDED.is_real_money,
                    user_id = COALESCE(EXCLUDED.user_id, custom_strategies.user_id)
            """, [
                strat["id"],
                strat.get("name", "Nueva Estrategia"),
                strat.get("country", "🌎"),
                int(strat.get("numSlots", 20)),
                float(strat.get("capital", 1000.0)),
                float(strat.get("activeInvested", 1000.0)),
                strat.get("benchmark", "S&P 500"),
                strat.get("color", "#a855f7"),
                bool(strat.get("isSystem", False)),
                bool(strat.get("isRealMoney", strat.get("is_real_money", False))),
                user_id,
            ])


def delete_custom_strategy(strategy_id: str, user_id: Optional[str] = None):
    with pg_session() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute("DELETE FROM custom_strategies WHERE id = %s AND is_system = FALSE AND (user_id = %s OR user_id IS NULL)", [strategy_id, user_id])
                cur.execute("DELETE FROM rebalance_tickers WHERE strategy_id = %s AND (user_id = %s OR user_id IS NULL)", [strategy_id, user_id])
                cur.execute("DELETE FROM rebalances WHERE strategy_id = %s AND (user_id = %s OR user_id IS NULL)", [strategy_id, user_id])
            else:
                cur.execute("DELETE FROM custom_strategies WHERE id = %s AND is_system = FALSE", [strategy_id])
                cur.execute("DELETE FROM rebalance_tickers WHERE strategy_id = %s", [strategy_id])
                cur.execute("DELETE FROM rebalances WHERE strategy_id = %s", [strategy_id])


# ── Stock Alerts ──────────────────────────────────────────────────────────────

def get_stock_alerts_db(user_id: Optional[str] = None, scope: Optional[str] = None, target_id: Optional[str] = None) -> list[dict]:
    sql = """
        SELECT id, user_id, scope, target_id, ticker, alert_type, target_value,
               is_active, notify_email, notify_app, user_email, triggered_at,
               last_checked_price, created_at
        FROM rv_stock_alerts
        WHERE 1=1
    """
    params = []
    if user_id:
        sql += " AND user_id = %s"
        params.append(user_id)
    if scope:
        sql += " AND scope = %s"
        params.append(scope)
    if target_id:
        sql += " AND target_id = %s"
        params.append(target_id)
    sql += " ORDER BY created_at DESC"

    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            cols = [desc[0] for desc in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def upsert_stock_alert_db(alert: dict) -> dict:
    alert_id = alert.get("id") or f"alt_{uuid.uuid4().hex[:12]}"
    user_id = alert.get("user_id", OWNER_ID)
    scope = alert.get("scope", "strategy")
    target_id = alert.get("target_id", "historical")
    ticker = alert.get("ticker", "").upper().strip()
    alert_type = alert.get("alert_type", "PROFIT_TARGET")
    target_value = float(alert.get("target_value", 10.0))
    is_active = bool(alert.get("is_active", True))
    notify_email = bool(alert.get("notify_email", True))
    notify_app = bool(alert.get("notify_app", True))
    user_email = alert.get("user_email")

    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO rv_stock_alerts (
                    id, user_id, scope, target_id, ticker, alert_type, target_value,
                    is_active, notify_email, notify_app, user_email, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE SET
                    scope = EXCLUDED.scope,
                    target_id = EXCLUDED.target_id,
                    ticker = EXCLUDED.ticker,
                    alert_type = EXCLUDED.alert_type,
                    target_value = EXCLUDED.target_value,
                    is_active = EXCLUDED.is_active,
                    notify_email = EXCLUDED.notify_email,
                    notify_app = EXCLUDED.notify_app,
                    user_email = EXCLUDED.user_email
            """, [alert_id, user_id, scope, target_id, ticker, alert_type, target_value, is_active, notify_email, notify_app, user_email])

    return {
        "id": alert_id,
        "user_id": user_id,
        "scope": scope,
        "target_id": target_id,
        "ticker": ticker,
        "alert_type": alert_type,
        "target_value": target_value,
        "is_active": is_active,
        "notify_email": notify_email,
        "notify_app": notify_app,
        "user_email": user_email,
    }


def delete_stock_alert_db(alert_id: str, user_id: Optional[str] = None) -> bool:
    with pg_session() as conn:
        with conn.cursor() as cur:
            if user_id:
                cur.execute("DELETE FROM rv_stock_alerts WHERE id = %s AND user_id = %s", [alert_id, user_id])
            else:
                cur.execute("DELETE FROM rv_stock_alerts WHERE id = %s", [alert_id])
    return True


def trigger_stock_alert_db(alert_id: str, current_price: float) -> None:
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE rv_stock_alerts
                SET triggered_at = CURRENT_TIMESTAMP, is_active = FALSE, last_checked_price = %s
                WHERE id = %s
            """, [current_price, alert_id])


# ── Market Indices History (SQL Table) ────────────────────────────────────────

def get_market_indices_history_db(start_date: str = "2020-01-01") -> dict:
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT date_str, values_json FROM market_indices_history WHERE date_str >= %s ORDER BY date_str ASC", [start_date])
            return {r[0]: r[1] for r in cur.fetchall() if isinstance(r[1], dict)}


def save_market_indices_history_db(indices_map: dict) -> None:
    if not indices_map:
        return
    rows = [(k, Json(v)) for k, v in indices_map.items()]
    with pg_session() as conn:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO market_indices_history (date_str, values_json)
                VALUES %s
                ON CONFLICT (date_str) DO UPDATE SET values_json = EXCLUDED.values_json
                """,
                rows,
                page_size=500,
            )
