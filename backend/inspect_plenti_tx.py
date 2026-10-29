import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# Find plenti account
plenti_acc = next((a for a in db.get("accounts", []) if "plenti" in a.get("name", "").lower() or a.get("entityId") == "ent_1786777900826"), None)
print("Plenti Account:", plenti_acc)

plenti_tx = [t for t in db.get("transactions", []) if t.get("accountId") == (plenti_acc.get("id") if plenti_acc else "")]
print(f"Total Transactions ({len(plenti_tx)}):")
for t in plenti_tx:
    print(" ", t)
