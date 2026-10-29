import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

for a in db.get("accounts", []):
    if "flexi" in a.get("name", "").lower() or a.get("entityId") == "ent_1786771791285":
        a["balance"] = 644145.92

with open("data/fixed_income.json", "w", encoding="utf-8") as f:
    json.dump(db, f, indent=2, ensure_ascii=False)

print("Saldo de Flexi Digital + corregido a $644,145.92 COP!")
