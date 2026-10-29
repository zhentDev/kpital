import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

print("=== ENTIDADES ACTIVAS ===")
for e in db.get("entities", []):
    accs = [a for a in db.get("accounts", []) if a.get("entityId") == e.get("id")]
    cdts = [c for c in db.get("cdts", []) if c.get("entityId") == e.get("id") and c.get("status") != "matured"]
    print(f"Entidad: {e.get('name')} (ID: {e.get('id')}) | Cuentas: {len(accs)} | CDTs Activos: {len(cdts)}")

# Nu totals
nu_accs = [a for a in db.get("accounts", []) if a.get("entityId") == "ent_nu"]
nu_bal = sum(float(a.get("balance", 0)) for a in nu_accs)
nu_extra_cdt_yield = 11393.76
nu_patrimony = nu_bal + nu_extra_cdt_yield
nu_capital = 1187542.30
nu_yield = 338309.67

# Finandina totals
fin_accs = [a for a in db.get("accounts", []) if "finandina" in a.get("name", "").lower() or a.get("entityId") == "ent_1786771791285"]
fin_bal = sum(float(a.get("balance", 0)) for a in fin_accs)
fin_capital = 533000.00
fin_yield = 111145.92

# Consolidated totals
total_patrimony = nu_patrimony + fin_bal
total_capital = nu_capital + fin_capital
total_yield = nu_yield + fin_yield
weighted_rate = ((nu_patrimony * 9.30) + (fin_bal * 10.00)) / total_patrimony

print("\n--- CONSOLIDADO GLOBAL ---")
print(f"Patrimonio Total : ${total_patrimony:,.2f} COP")
print(f"Aportado Neto    : ${total_capital:,.2f} COP")
print(f"Ganancia Neta    : +${total_yield:,.2f} COP")
print(f"Tasa Ponderada   : {weighted_rate:.2f}% E.A.")
print(f"Check Suma       : ${total_capital + total_yield:,.2f} COP")

print("\n--- SOLO NU COLOMBIA ---")
print(f"Patrimonio Nu    : ${nu_patrimony:,.2f} COP")
print(f"Aportado Nu      : ${nu_capital:,.2f} COP")
print(f"Ganancia Nu      : +${nu_yield:,.2f} COP")
print(f"Tasa Nu          : 9.30% E.A.")

print("\n--- SOLO BANCO FINANDINA ---")
print(f"Patrimonio Fin.  : ${fin_bal:,.2f} COP")
print(f"Aportado Fin.    : ${fin_capital:,.2f} COP")
print(f"Ganancia Fin.    : +${fin_yield:,.2f} COP")
print(f"Tasa Fin.        : 10.00% E.A.")
