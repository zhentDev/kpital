import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

cdts = db.get("cdts", [])
print(f"=== TOTAL CDTS EN BASE DE DATOS: {len(cdts)} ===")

for i, c in enumerate(cdts):
    print(f"{i+1:2}. ID: {c.get('id')} | Nombre: {c.get('name')} | Cat: {c.get('category')} | Status: {c.get('status')} | Fechas: {c.get('startDate')} -> {c.get('maturityDate')} | Cap: ${float(c.get('capital', 0)):,.2f} | Tasa: {c.get('interestRateEA')}%")
