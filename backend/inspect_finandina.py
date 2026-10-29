import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

print("=== ENTIDADES EN DB ===")
for e in db.get("entities", []):
    print(f"Entidad: {e.get('id')} | Nombre: {e.get('name')} | Logo: {e.get('logoUrl')} | Color: {e.get('color')}")

print("\n=== CUENTAS DE OTRAS ENTIDADES ===")
for a in db.get("accounts", []):
    print(f"Cuenta: {a.get('name')} | Entidad: {a.get('entityId')} | Balance: ${float(a.get('balance', 0)):,.2f}")

print("\n=== CDTS DE OTRAS ENTIDADES ===")
for c in db.get("cdts", []):
    print(f"CDT: {c.get('name')} | Entidad: {c.get('entityId')} | Capital: ${float(c.get('capital', 0)):,.2f} | Status: {c.get('status')}")
