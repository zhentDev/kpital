import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# Let's inspect the accounts and transactions
accounts = db.get("accounts", [])
transactions = db.get("transactions", [])
cdts = db.get("cdts", [])

print("=== BALANCE DE CUENTAS GUARDADAS ===")
for a in accounts:
    print(f"Cuenta: {a.get('name')} | Balance en DB: ${float(a.get('balance', 0)):,.2f}")

print("\n=== CDTS ACTIVOS ===")
active_cdts = [c for c in cdts if c.get("status") != "matured"]
for c in active_cdts:
    print(f"CDT Activo: {c.get('name')} | Cap: ${float(c.get('capital', 0)):,.2f} | Tasa: {c.get('interestRateEA')}%")
