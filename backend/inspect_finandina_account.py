import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

acc = [a for a in db.get("accounts", []) if a.get("entityId") == "ent_1786771791285"]
print("Finandina accounts:", json.dumps(acc, indent=2))

txs = [t for t in db.get("transactions", []) if t.get("accountId") in [a["id"] for a in acc]]
print(f"Finandina transactions count: {len(txs)}")
for t in txs:
    print(t)
