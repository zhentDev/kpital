import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

print("=== CUENTAS EN DB ===")
for a in db.get("accounts", []):
    print(f"Cuenta: {a.get('name')} | startDate: {a.get('startDate')} | createdAt: {a.get('createdAt')}")

print("\n=== PRIMERA TRANSACCION ===")
txs = db.get("transactions", [])
txs.sort(key=lambda x: x.get("date") or "9999-99-99")
if txs:
    print(f"Primer movimiento: {txs[0].get('date')} | {txs[0].get('description')}")
