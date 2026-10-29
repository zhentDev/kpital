"""
Kpital Unified Database Service Facade (100% Supabase PostgreSQL, Zero JSON files).
Delegates to modular repositories in `backend/db/` (`connection.py`, `users_repo.py`,
`cash_flow_repo.py`, `fixed_income_repo.py`, `variable_income_repo.py`).
"""

from db.connection import (
    DATABASE_URL,
    OWNER_ID,
    get_connection,
    get_pg_connection,
    pg_execute,
    pg_fetchall,
    pg_fetchone,
    pg_session,
    release_pg_connection,
)
from db.users_repo import (
    claim_legacy_data,
    count_users,
    create_user,
    delete_user_by_email,
    get_user_by_email,
    get_user_by_id,
    list_all_users,
)
from db.cash_flow_repo import (
    DEFAULT_CASH_FLOW_DATA,
    delete_movement_cascade_db,
    get_user_cash_flow_db,
    save_user_cash_flow_db,
)
from db.fixed_income_repo import (
    get_historical_rates_db,
    get_user_fixed_income_db,
    save_user_fixed_income_db,
    upsert_historical_rate_entity_db,
)
from db.variable_income_repo import (
    add_rebalance,
    delete_custom_strategy,
    delete_rebalance,
    delete_stock_alert_db,
    get_all_rebalances,
    get_custom_strategies,
    get_market_indices_history_db,
    get_stock_alerts_db,
    save_custom_strategy,
    save_market_indices_history_db,
    trigger_stock_alert_db,
    update_rebalance_date,
    upsert_stock_alert_db,
)

__all__ = [
    "DATABASE_URL",
    "OWNER_ID",
    "DEFAULT_CASH_FLOW_DATA",
    "get_connection",
    "get_pg_connection",
    "pg_execute",
    "pg_fetchall",
    "pg_fetchone",
    "pg_session",
    "release_pg_connection",
    "claim_legacy_data",
    "count_users",
    "create_user",
    "delete_user_by_email",
    "get_user_by_email",
    "get_user_by_id",
    "list_all_users",
    "delete_movement_cascade_db",
    "get_user_cash_flow_db",
    "save_user_cash_flow_db",
    "get_historical_rates_db",
    "get_user_fixed_income_db",
    "save_user_fixed_income_db",
    "upsert_historical_rate_entity_db",
    "add_rebalance",
    "delete_custom_strategy",
    "delete_rebalance",
    "delete_stock_alert_db",
    "get_all_rebalances",
    "get_custom_strategies",
    "get_market_indices_history_db",
    "get_stock_alerts_db",
    "save_custom_strategy",
    "save_market_indices_history_db",
    "trigger_stock_alert_db",
    "update_rebalance_date",
    "upsert_stock_alert_db",
]
