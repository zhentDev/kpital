import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

print("=== TOTAL TRANSACCIONES EN BACKEND ===")
for i, t in enumerate(db.get("transactions", [])):
    print(f"{i+1:2}. ID: {t.get('id')} | AccID: {t.get('accountId')} | Fecha: {t.get('date')} | Monto: ${float(t.get('amount', 0)):10,.2f} | {t.get('description')}")
