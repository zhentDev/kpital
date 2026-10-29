import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# All accounts liquid total (converted to COP with fxRate ~4150)
fx_rate = 4150.0

accounts_liquid = sum(a.get("balance", 0) * (fx_rate if a.get("currency") == "USD" else 1.0) for a in db.get("accounts", []))
active_cdts = [c for c in db.get("cdts", []) if c.get("status") != "matured"]
cdts_capital = sum(c.get("capital", 0) * (fx_rate if c.get("currency") == "USD" else 1.0) for c in active_cdts)

print(f"Liquid Balance Accounts (Cajitas): ${accounts_liquid:,.2f} COP")
print(f"Active CDTs Capital: ${cdts_capital:,.2f} COP")
print(f"Total Combined Capital: ${accounts_liquid + cdts_capital:,.2f} COP")
