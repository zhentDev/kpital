import duckdb

try:
    con = duckdb.connect("titanes.duckdb")

    print("Backing up tables...")
    con.execute("CREATE TABLE IF NOT EXISTS ip_backup AS SELECT * FROM individual_purchases")
    con.execute("CREATE TABLE IF NOT EXISTS pp_backup AS SELECT * FROM purchase_portfolios")

    print("Dropping old tables...")
    con.execute("DROP TABLE individual_purchases")
    con.execute("DROP TABLE purchase_portfolios")

    print("Creating new purchase_portfolios...")
    con.execute("""
        CREATE TABLE purchase_portfolios (
            id VARCHAR PRIMARY KEY,
            name VARCHAR,
            is_plan BOOLEAN DEFAULT FALSE,
            plan_config VARCHAR,
            asset_currency VARCHAR DEFAULT 'USD',
            local_currency VARCHAR DEFAULT 'COP',
            annual_inflation_rate DOUBLE DEFAULT 0.0,
            use_auto_col_inflation BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    print("Creating new individual_purchases...")
    con.execute("""
        CREATE TABLE individual_purchases (
            id VARCHAR PRIMARY KEY,
            portfolio_id VARCHAR,
            ticker VARCHAR,
            date DATE,
            purchase_price DOUBLE,
            shares DOUBLE,
            manual_current_price DOUBLE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (portfolio_id) REFERENCES purchase_portfolios(id)
        )
    """)

    print("Restoring data...")
    con.execute("""
        INSERT INTO purchase_portfolios (id, name, created_at, is_plan, plan_config, local_currency, annual_inflation_rate, asset_currency, use_auto_col_inflation)
        SELECT id, name, created_at, is_plan, plan_config, base_currency, annual_inflation_rate, 'USD', FALSE
        FROM pp_backup
    """)

    con.execute("""
        INSERT INTO individual_purchases
        SELECT * FROM ip_backup
    """)

    print("Cleaning up...")
    con.execute("DROP TABLE pp_backup")
    con.execute("DROP TABLE ip_backup")

    print("Migration successful!")
except Exception as e:
    print(f"Migration error: {e}")
