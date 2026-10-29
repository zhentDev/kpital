import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# 1. Update Plenti entity
plenti_ent = next((e for e in db.get("entities", []) if "plenti" in e.get("name", "").lower()), None)
if plenti_ent:
    plenti_ent["country"] = "🇺🇸"

# 2. Update Plenti account
plenti_acc = next((a for a in db.get("accounts", []) if a.get("id") == "acc_1786777955489" or "plenti" in a.get("name", "").lower()), None)
if plenti_acc:
    plenti_acc["currency"] = "USD"
    plenti_acc["interestRateEA"] = 3.0
    plenti_acc["balance"] = 875.59
    plenti_acc["tieredRates"] = [
        {"maxBalance": 500, "rateEA": 2.0, "label": "Hasta $500 USD (2.0% EA)"},
        {"maxBalance": 1000, "rateEA": 3.0, "label": "$500 a $1,000 USD (3.0% EA)"},
        {"maxBalance": 5000, "rateEA": 4.5, "label": "$1,000 a $5,000 USD (4.5% EA)"},
        {"maxBalance": 9999999, "rateEA": 6.0, "label": "Más de $5,000 USD (6.0% EA)"}
    ]

# 3. Update all 20 transactions of Plenti to USD
for tx in db.get("transactions", []):
    if tx.get("accountId") == "acc_1786777955489":
        tx["currency"] = "USD"

with open("data/fixed_income.json", "w", encoding="utf-8") as f:
    json.dump(db, f, indent=2, ensure_ascii=False)

print("Plenti account and transactions updated to USD with tiered rates support!")
