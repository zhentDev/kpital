import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

gold_acc = next((a for a in db.get("accounts", []) if "oro" in a.get("name", "").lower() or "paxg" in a.get("name", "").lower()), None)
print("Gold Account in DB:", gold_acc)

if gold_acc:
    gold_tx = [t for t in db.get("transactions", []) if t.get("accountId") == gold_acc.get("id")]
    print(f"Gold Transactions ({len(gold_tx)}):")
    for t in gold_tx:
        print(" ", t)
