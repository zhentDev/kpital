
-- 0. Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    password_hash TEXT,
    provider VARCHAR(64) DEFAULT 'local',
    provider_id VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_pro BOOLEAN DEFAULT FALSE
);

-- 1. Cash Flow Period Config & Global Settings
CREATE TABLE IF NOT EXISTS cf_periods_config (
    user_id VARCHAR(64) NOT NULL,
    period VARCHAR(32) NOT NULL,
    start_period VARCHAR(32) DEFAULT '2026-11',
    active_period VARCHAR(32) DEFAULT '2026-11',
    currency VARCHAR(16) DEFAULT 'COP',
    allocation_model VARCHAR(32) DEFAULT 'custom',
    needs_ratio DOUBLE PRECISION DEFAULT 40.0,
    wants_ratio DOUBLE PRECISION DEFAULT 20.0,
    savings_ratio DOUBLE PRECISION DEFAULT 40.0,
    emergency_months INTEGER DEFAULT 6,
    payroll_account_json JSONB DEFAULT '{}'::jsonb,
    deleted_ids_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, period)
);

-- 2. Cash Flow Budget Envelopes (inflows, needs, wants, wealth)
CREATE TABLE IF NOT EXISTS cf_budget_envelopes (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    period VARCHAR(32) NOT NULL DEFAULT 'base',
    pillar VARCHAR(32) NOT NULL, -- 'inflows', 'needs', 'wants', 'wealth'
    name TEXT NOT NULL,
    amount DOUBLE PRECISION DEFAULT 0.0,
    category VARCHAR(64) DEFAULT 'general',
    sub_items_json JSONB DEFAULT '[]'::jsonb,
    is_explicit_sankey_income BOOLEAN DEFAULT FALSE,
    extra_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, period, pillar, id)
);

-- 3. Cash Flow Movements (expensesLog)
CREATE TABLE IF NOT EXISTS cf_movements (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    period VARCHAR(32) NOT NULL,
    date VARCHAR(32),
    time VARCHAR(32),
    type VARCHAR(32) DEFAULT 'debit',
    amount DOUBLE PRECISION DEFAULT 0.0,
    currency VARCHAR(16) DEFAULT 'COP',
    description TEXT,
    budget_item_id VARCHAR(128),
    budget_item_name TEXT,
    budget_item_type VARCHAR(64),
    sub_item_id VARCHAR(128),
    sub_item_name TEXT,
    payment_source_json JSONB DEFAULT '{}'::jsonb,
    destination_account_id VARCHAR(128),
    destination_account_name TEXT,
    is_split_child BOOLEAN DEFAULT FALSE,
    split_parent_id VARCHAR(128),
    credit_card_payment_id VARCHAR(128),
    card_id VARCHAR(128),
    debt_id VARCHAR(128),
    is_loan BOOLEAN DEFAULT FALSE,
    is_shared_expense BOOLEAN DEFAULT FALSE,
    participants_json JSONB DEFAULT '[]'::jsonb,
    is_explicit_sankey_income BOOLEAN DEFAULT FALSE,
    extra_json JSONB DEFAULT '{}'::jsonb,
    created_at VARCHAR(64),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, id)
);

-- 4. Cash Flow Credit Cards
CREATE TABLE IF NOT EXISTS cf_credit_cards (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    name TEXT NOT NULL,
    brand VARCHAR(64),
    total_limit DOUBLE PRECISION DEFAULT 0.0,
    used_limit DOUBLE PRECISION DEFAULT 0.0,
    cutoff_day INTEGER,
    due_day INTEGER,
    extra_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, id)
);

-- 5. Cash Flow Credit Purchases
CREATE TABLE IF NOT EXISTS cf_credit_purchases (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    card_id VARCHAR(128) NOT NULL,
    movement_id VARCHAR(128),
    description TEXT,
    total_amount DOUBLE PRECISION DEFAULT 0.0,
    installments_count INTEGER DEFAULT 1,
    monthly_installment DOUBLE PRECISION DEFAULT 0.0,
    start_period VARCHAR(32),
    date VARCHAR(32),
    extra_json JSONB DEFAULT '{}'::jsonb,
    created_at VARCHAR(64),
    PRIMARY KEY (user_id, id)
);

-- 6. Cash Flow Credit Card Payments
CREATE TABLE IF NOT EXISTS cf_credit_payments (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    card_id VARCHAR(128) NOT NULL,
    card_name TEXT,
    period VARCHAR(32),
    amount DOUBLE PRECISION DEFAULT 0.0,
    date VARCHAR(32),
    time VARCHAR(32),
    source_type VARCHAR(64),
    source_account_id VARCHAR(128),
    source_account_name TEXT,
    budget_deductions_json JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    extra_json JSONB DEFAULT '{}'::jsonb,
    created_at VARCHAR(64),
    PRIMARY KEY (user_id, id)
);

-- 7. Cash Flow Debts & Loans
CREATE TABLE IF NOT EXISTS cf_debts (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    origin_movement_id VARCHAR(128),
    debt_type VARCHAR(32) DEFAULT 'payable',
    concept TEXT,
    debtor TEXT,
    creditor TEXT,
    total_amount DOUBLE PRECISION DEFAULT 0.0,
    remaining_amount DOUBLE PRECISION DEFAULT 0.0,
    my_share DOUBLE PRECISION DEFAULT 0.0,
    status VARCHAR(32) DEFAULT 'pending',
    participants_json JSONB DEFAULT '[]'::jsonb,
    payments_log_json JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    extra_json JSONB DEFAULT '{}'::jsonb,
    created_at VARCHAR(64),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, id)
);

-- 8. Fixed Income Tables (fi_entities, fi_accounts, fi_cdts, fi_transactions, fi_historical_rates)
CREATE TABLE IF NOT EXISTS fi_entities (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    name TEXT NOT NULL,
    country VARCHAR(32) DEFAULT '🇨🇴',
    color VARCHAR(32) DEFAULT '#10b981',
    icon VARCHAR(32) DEFAULT '🏦',
    extra_json JSONB DEFAULT '{}'::jsonb,
    created_at VARCHAR(64),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS fi_accounts (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    name TEXT NOT NULL,
    type VARCHAR(32) DEFAULT 'savings',
    account_category VARCHAR(64) DEFAULT 'high_yield',
    sync_type VARCHAR(32) DEFAULT 'api',
    currency VARCHAR(16) DEFAULT 'COP',
    balance DOUBLE PRECISION DEFAULT 0.0,
    interest_rate_ea DOUBLE PRECISION DEFAULT 0.0,
    is_tax_exempt_gmf BOOLEAN DEFAULT TRUE,
    rate_history_json JSONB DEFAULT '[]'::jsonb,
    extra_json JSONB DEFAULT '{}'::jsonb,
    created_at VARCHAR(64),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS fi_cdts (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    name TEXT NOT NULL,
    capital DOUBLE PRECISION DEFAULT 0.0,
    currency VARCHAR(16) DEFAULT 'COP',
    interest_rate_ea DOUBLE PRECISION DEFAULT 0.0,
    term_days INTEGER DEFAULT 180,
    start_date VARCHAR(32),
    maturity_date VARCHAR(32),
    rete_fuente_pct DOUBLE PRECISION DEFAULT 4.0,
    is_auto_renew BOOLEAN DEFAULT FALSE,
    status VARCHAR(32) DEFAULT 'active',
    extra_json JSONB DEFAULT '{}'::jsonb,
    created_at VARCHAR(64),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS fi_transactions (
    id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    account_id VARCHAR(128),
    entity_id VARCHAR(128),
    date VARCHAR(32),
    time VARCHAR(32),
    type VARCHAR(32) DEFAULT 'deposit',
    amount DOUBLE PRECISION DEFAULT 0.0,
    currency VARCHAR(16) DEFAULT 'COP',
    description TEXT,
    category VARCHAR(128),
    source VARCHAR(64),
    extra_json JSONB DEFAULT '{}'::jsonb,
    created_at VARCHAR(64),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS fi_historical_rates (
    entity_id VARCHAR(128) PRIMARY KEY,
    entity_data_json JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Variable Income Tables (rv_portfolios, rv_purchases, rv_sales, rv_stock_alerts, custom_strategies, rebalances, rebalance_tickers, market_indices_history)
CREATE TABLE IF NOT EXISTS rv_portfolios (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255),
    is_plan BOOLEAN DEFAULT FALSE,
    plan_config TEXT,
    asset_currency VARCHAR(32) DEFAULT 'USD',
    local_currency VARCHAR(32) DEFAULT 'COP',
    annual_inflation_rate DOUBLE PRECISION DEFAULT 0.0,
    use_auto_col_inflation BOOLEAN DEFAULT FALSE,
    user_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rv_purchases (
    id VARCHAR(64) PRIMARY KEY,
    portfolio_id VARCHAR(64),
    ticker VARCHAR(32),
    date DATE,
    purchase_price DOUBLE PRECISION,
    shares DOUBLE PRECISION,
    manual_current_price DOUBLE PRECISION,
    purchase_time VARCHAR(32),
    commission_amount DOUBLE PRECISION DEFAULT 0.0,
    notes TEXT,
    user_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rv_sales (
    id VARCHAR(64) PRIMARY KEY,
    lot_id VARCHAR(64),
    portfolio_id VARCHAR(64),
    ticker VARCHAR(32),
    sale_date DATE,
    sale_time VARCHAR(32),
    sale_price DOUBLE PRECISION,
    shares DOUBLE PRECISION,
    sale_commission DOUBLE PRECISION DEFAULT 0.0,
    realized_pnl DOUBLE PRECISION DEFAULT 0.0,
    notes TEXT,
    user_id VARCHAR(64),
    purchase_date DATE,
    cost_basis DOUBLE PRECISION DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rv_stock_alerts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    scope VARCHAR(32) NOT NULL DEFAULT 'strategy',
    target_id VARCHAR(64) NOT NULL,
    ticker VARCHAR(32) NOT NULL,
    alert_type VARCHAR(32) NOT NULL DEFAULT 'PROFIT_TARGET',
    target_value DOUBLE PRECISION NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    notify_email BOOLEAN DEFAULT TRUE,
    notify_app BOOLEAN DEFAULT TRUE,
    user_email VARCHAR(255),
    triggered_at TIMESTAMP,
    last_checked_price DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_strategies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255),
    country VARCHAR(32) DEFAULT '🌎',
    num_slots INTEGER DEFAULT 20,
    capital DOUBLE PRECISION DEFAULT 1000.0,
    active_invested DOUBLE PRECISION DEFAULT 1000.0,
    benchmark VARCHAR(255) DEFAULT 'S&P 500',
    color VARCHAR(32) DEFAULT '#a855f7',
    is_system BOOLEAN DEFAULT FALSE,
    is_real_money BOOLEAN DEFAULT FALSE,
    user_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rebalances (
    rebalance_date DATE,
    cash_added DOUBLE PRECISION DEFAULT 0.0,
    strategy_id VARCHAR(64) DEFAULT 'historical',
    user_id VARCHAR(64),
    PRIMARY KEY (rebalance_date, strategy_id)
);

CREATE TABLE IF NOT EXISTS rebalance_tickers (
    rebalance_date DATE,
    ticker VARCHAR(32),
    strategy_id VARCHAR(64) DEFAULT 'historical',
    user_id VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS market_indices_history (
    date_str VARCHAR(16) PRIMARY KEY,
    values_json JSONB NOT NULL
);

-- Views/aliases for backward compatibility with purchase_portfolios, individual_purchases, purchase_sales, user_stock_alerts
CREATE OR REPLACE VIEW purchase_portfolios AS SELECT * FROM rv_portfolios;
CREATE OR REPLACE VIEW individual_purchases AS SELECT * FROM rv_purchases;
CREATE OR REPLACE VIEW purchase_sales AS SELECT * FROM rv_sales;
CREATE OR REPLACE VIEW user_stock_alerts AS SELECT * FROM rv_stock_alerts;


-- Atomic RPC 1: Delete movement cascade (removes movement, child splits, and linked credit purchase)
CREATE OR REPLACE FUNCTION rpc_delete_movement_cascade(p_user_id VARCHAR, p_movement_id VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    DELETE FROM cf_movements
    WHERE user_id = p_user_id AND (id = p_movement_id OR split_parent_id = p_movement_id);
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    DELETE FROM cf_credit_purchases
    WHERE user_id = p_user_id AND (movement_id = p_movement_id OR id = 'cp_' || REPLACE(p_movement_id, 'cf_', ''));

    RETURN jsonb_build_object('status', 'ok', 'deleted_movements', v_deleted_count, 'movement_id', p_movement_id);
END;
$$;

-- Atomic RPC 2: Distribute credit card payment across budget envelopes in a single transaction
CREATE OR REPLACE FUNCTION rpc_distribute_card_payment(
    p_user_id VARCHAR,
    p_payment_id VARCHAR,
    p_deductions JSONB,
    p_child_movements JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_item JSONB;
BEGIN
    -- 1. Update payment budget_deductions_json
    UPDATE cf_credit_payments
    SET budget_deductions_json = p_deductions,
        extra_json = jsonb_set(COALESCE(extra_json, '{}'::jsonb), '{budgetDeductions}', p_deductions)
    WHERE user_id = p_user_id AND id = p_payment_id;

    -- 2. Remove previous split children for this payment
    DELETE FROM cf_movements
    WHERE user_id = p_user_id AND credit_card_payment_id = p_payment_id;

    -- 3. Insert new split children movements
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_child_movements)
    LOOP
        INSERT INTO cf_movements (
            id, user_id, period, date, time, type, amount, currency, description,
            budget_item_id, budget_item_name, budget_item_type, sub_item_id, sub_item_name,
            payment_source_json, is_split_child, credit_card_payment_id, card_id, extra_json, created_at
        ) VALUES (
            v_item->>'id',
            p_user_id,
            COALESCE(v_item->>'period', '2026-11'),
            v_item->>'date',
            v_item->>'time',
            COALESCE(v_item->>'type', 'debit'),
            COALESCE((v_item->>'amount')::DOUBLE PRECISION, 0.0),
            COALESCE(v_item->>'currency', 'COP'),
            v_item->>'description',
            v_item->>'budgetItemId',
            v_item->>'budgetItemName',
            v_item->>'budgetItemType',
            v_item->>'subItemId',
            v_item->>'subItemName',
            COALESCE(v_item->'paymentSource', '{}'::jsonb),
            TRUE,
            p_payment_id,
            v_item->>'cardId',
            v_item,
            COALESCE(v_item->>'createdAt', NOW()::TEXT)
        )
        ON CONFLICT (user_id, id) DO UPDATE SET
            amount = EXCLUDED.amount,
            description = EXCLUDED.description,
            budget_item_id = EXCLUDED.budget_item_id,
            budget_item_name = EXCLUDED.budget_item_name,
            budget_item_type = EXCLUDED.budget_item_type,
            extra_json = EXCLUDED.extra_json,
            updated_at = CURRENT_TIMESTAMP;
    END LOOP;

    RETURN jsonb_build_object('status', 'ok', 'payment_id', p_payment_id);
END;
$$;

-- Atomic RPC 3: Register webhook transaction atomically (updates account/card, inserts fi_transaction & cf_movement)
CREATE OR REPLACE FUNCTION rpc_register_webhook_transaction(
    p_user_id VARCHAR,
    p_account_id VARCHAR,
    p_new_balance DOUBLE PRECISION,
    p_fi_tx JSONB,
    p_cf_mov JSONB DEFAULT NULL,
    p_card_id VARCHAR DEFAULT NULL,
    p_new_used_limit DOUBLE PRECISION DEFAULT NULL,
    p_credit_purchase JSONB DEFAULT NULL,
    p_credit_payment JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Update Fixed Income Account balance if applicable
    IF p_account_id IS NOT NULL AND p_new_balance IS NOT NULL THEN
        UPDATE fi_accounts
        SET balance = p_new_balance,
            extra_json = jsonb_set(COALESCE(extra_json, '{}'::jsonb), '{balance}', to_jsonb(p_new_balance)),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = p_user_id AND id = p_account_id;
    END IF;

    -- 2. Insert Fixed Income Transaction
    IF p_fi_tx IS NOT NULL THEN
        INSERT INTO fi_transactions (
            id, user_id, account_id, entity_id, date, time, type, amount, currency,
            description, category, source, extra_json, created_at
        ) VALUES (
            p_fi_tx->>'id',
            p_user_id,
            p_fi_tx->>'accountId',
            p_fi_tx->>'entityId',
            p_fi_tx->>'date',
            p_fi_tx->>'time',
            p_fi_tx->>'type',
            COALESCE((p_fi_tx->>'amount')::DOUBLE PRECISION, 0.0),
            COALESCE(p_fi_tx->>'currency', 'COP'),
            p_fi_tx->>'description',
            p_fi_tx->>'category',
            p_fi_tx->>'source',
            p_fi_tx,
            p_fi_tx->>'createdAt'
        )
        ON CONFLICT (user_id, id) DO UPDATE SET
            amount = EXCLUDED.amount,
            description = EXCLUDED.description,
            extra_json = EXCLUDED.extra_json;
    END IF;

    -- 3. Update Credit Card used_limit if applicable
    IF p_card_id IS NOT NULL AND p_new_used_limit IS NOT NULL THEN
        UPDATE cf_credit_cards
        SET used_limit = p_new_used_limit,
            extra_json = jsonb_set(COALESCE(extra_json, '{}'::jsonb), '{usedLimit}', to_jsonb(p_new_used_limit)),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = p_user_id AND id = p_card_id;
    END IF;

    -- 4. Insert Cash Flow Movement if applicable
    IF p_cf_mov IS NOT NULL THEN
        INSERT INTO cf_movements (
            id, user_id, period, date, time, type, amount, currency, description,
            budget_item_id, budget_item_name, budget_item_type, payment_source_json,
            extra_json, created_at
        ) VALUES (
            p_cf_mov->>'id',
            p_user_id,
            COALESCE(p_cf_mov->>'period', '2026-11'),
            p_cf_mov->>'date',
            p_cf_mov->>'time',
            p_cf_mov->>'type',
            COALESCE((p_cf_mov->>'amount')::DOUBLE PRECISION, 0.0),
            COALESCE(p_cf_mov->>'currency', 'COP'),
            p_cf_mov->>'description',
            p_cf_mov->>'budgetItemId',
            p_cf_mov->>'budgetItemName',
            p_cf_mov->>'budgetItemType',
            COALESCE(p_cf_mov->'paymentSource', '{}'::jsonb),
            p_cf_mov,
            p_cf_mov->>'createdAt'
        )
        ON CONFLICT (user_id, id) DO UPDATE SET
            amount = EXCLUDED.amount,
            description = EXCLUDED.description,
            extra_json = EXCLUDED.extra_json;
    END IF;

    -- 5. Insert Credit Purchase if applicable
    IF p_credit_purchase IS NOT NULL THEN
        INSERT INTO cf_credit_purchases (
            id, user_id, card_id, description, total_amount, installments_count,
            monthly_installment, start_period, date, extra_json, created_at
        ) VALUES (
            p_credit_purchase->>'id',
            p_user_id,
            p_credit_purchase->>'cardId',
            p_credit_purchase->>'description',
            COALESCE((p_credit_purchase->>'amount')::DOUBLE PRECISION, 0.0),
            COALESCE((p_credit_purchase->>'installmentsCount')::INT, 1),
            COALESCE((p_credit_purchase->>'monthlyInstallment')::DOUBLE PRECISION, 0.0),
            p_credit_purchase->>'startPeriod',
            p_credit_purchase->>'date',
            p_credit_purchase,
            p_credit_purchase->>'createdAt'
        )
        ON CONFLICT (user_id, id) DO NOTHING;
    END IF;

    -- 6. Insert Credit Payment if applicable
    IF p_credit_payment IS NOT NULL THEN
        INSERT INTO cf_credit_payments (
            id, user_id, card_id, card_name, period, amount, date, time,
            source_type, source_account_id, source_account_name, notes, extra_json, created_at
        ) VALUES (
            p_credit_payment->>'id',
            p_user_id,
            p_credit_payment->>'cardId',
            p_credit_payment->>'cardName',
            p_credit_payment->>'period',
            COALESCE((p_credit_payment->>'amount')::DOUBLE PRECISION, 0.0),
            p_credit_payment->>'date',
            p_credit_payment->>'time',
            p_credit_payment->>'sourceType',
            p_credit_payment->>'sourceAccountId',
            p_credit_payment->>'sourceAccount',
            p_credit_payment->>'notes',
            p_credit_payment,
            p_credit_payment->>'createdAt'
        )
        ON CONFLICT (user_id, id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object('status', 'ok');
END;
$$;
