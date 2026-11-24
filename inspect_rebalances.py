import psycopg2, json

conn = psycopg2.connect('postgresql://postgres.ixnidzllqwbkexsrmgwz:Caballero%21Dorado%22715%23@aws-0-us-east-1.pooler.supabase.com:5432/postgres')
cur = conn.cursor()

cur.execute("SELECT * FROM custom_strategies WHERE id IN ('strat_1786185510491', 'strat_1788304141581')")
for r in cur.fetchall():
    print(r)
