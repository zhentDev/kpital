import json
from datetime import datetime

# SVG logos
NU_LOGO = "data:image/svg+xml;utf8," + "%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20width%3D%22100%25%22%20height%3D%22100%25%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2222%22%20fill%3D%22%23820ad1%22%2F%3E%3Cpath%20d%3D%22M28%2066V34h9.2l12.4%2019.8V34h8.8v32h-8.8L37.2%2045.4V66H28zm36.8%200V43.6h8.8V66h-8.8zm0-27.2V34h8.8v4.8h-8.8z%22%20fill%3D%22%23ffffff%22%2F%3E%3C%2Fsvg%3E"
FINANDINA_LOGO = "data:image/svg+xml;utf8," + "%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20width%3D%22100%25%22%20height%3D%22100%25%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20rx%3D%2222%22%20fill%3D%22%23d10a5a%22%2F%3E%3Cpath%20d%3D%22M25%2032h50v9H35v10h35v9H35v18H25V32zm38%2022l14%2016H64l-9-11%205-5h3z%22%20fill%3D%22%23ffffff%22%2F%3E%3C%2Fsvg%3E"

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

for e in db.get("entities", []):
    if "nu" in e.get("name", "").lower() or e.get("id") == "ent_nu":
        e["logoUrl"] = NU_LOGO
        e["color"] = "#820ad1"
    elif "finandina" in e.get("name", "").lower() or "finandina" in e.get("id", "").lower():
        e["logoUrl"] = FINANDINA_LOGO
        e["color"] = "#d10a5a"

with open("data/fixed_income.json", "w", encoding="utf-8") as f:
    json.dump(db, f, indent=2, ensure_ascii=False)

print("Entidades actualizadas con sus logos corporativos!")
