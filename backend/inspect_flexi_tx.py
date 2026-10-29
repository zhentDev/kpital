import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

txs = db.get("transactions", [])
accs = db.get("accounts", [])
flexi = [a for a in accs if "flexi" in a.get("name", "").lower() or a.get("entityId") == "ent_1786771791285"]
flexi_id = flexi[0]["id"] if flexi else None
print("Flexi Account:", flexi)

print(f"\nTransacciones asociadas a Flexi ({flexi_id}):")
flexi_txs = [t for t in txs if t.get("accountId") == flexi_id or "flexi" in (t.get("description") or "").lower() or "finandina" in (t.get("description") or "").lower()]
for t in flexi_txs:
    print(t)

with open("data/historical_rates.json", "r", encoding="utf-8") as f:
    rates = json.load(f)

print("\nTasas históricas en historical_rates.json:")
print(json.dumps(rates.get("entities", {}), indent=2))
