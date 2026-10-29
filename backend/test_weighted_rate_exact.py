import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# Cajitas Nu
nu_accounts = [a for a in db.get("accounts", []) if a.get("entityId") == "ent_nu"]
nu_cdts = [c for c in db.get("cdts", []) if c.get("entityId") == "ent_nu" and c.get("status") != "matured"]
fin_accounts = [a for a in db.get("accounts", []) if a.get("entityId") == "ent_1786771791285" or "finandina" in a.get("name", "").lower()]

total_nu_cajitas = sum(float(a.get("balance", 0)) for a in nu_accounts) # $1,514,458.21
total_nu_cdts_capital = sum(float(c.get("capital", 0)) for c in nu_cdts) # $403,932.00
total_nu_cdts_yield = 11393.76
total_nu_liquid_without_cdt = total_nu_cajitas - total_nu_cdts_capital # $1,110,526.21
total_finandina = sum(float(a.get("balance", 0)) for a in fin_accounts) # $644,145.92

# Rates
rate_nu_cajita = 9.30
rate_finandina = 10.00
# CDT rates weighted
cdt_rate_sum = sum(float(c.get("capital", 0)) * float(c.get("interestRateEA", 11.0)) for c in nu_cdts)
cdt_weighted_rate = cdt_rate_sum / total_nu_cdts_capital if total_nu_cdts_capital > 0 else 11.0

# Total weighted rate
total_patrimony = total_nu_cajitas + total_nu_cdts_yield + total_finandina # $2,169,997.89

weighted_sum = (
    (total_nu_liquid_without_cdt * rate_nu_cajita) +
    (total_nu_cdts_capital * cdt_weighted_rate) +
    (total_finandina * rate_finandina)
)
weighted_rate_ea = weighted_sum / (total_nu_cajitas + total_finandina)

print("=== CALCULOS EXACTOS DE TASA PONDERADA GLOBAL ===")
print(f"1. Nu Cajita Líquida : ${total_nu_liquid_without_cdt:12,.2f} COP @ {rate_nu_cajita:.2f}% E.A.")
print(f"2. Nu CDTs Activos   : ${total_nu_cdts_capital:12,.2f} COP @ {cdt_weighted_rate:.2f}% E.A.")
print(f"3. Finandina Flexi + : ${total_finandina:12,.2f} COP @ {rate_finandina:.2f}% E.A.")
print(f"-------------------------------------------------------------")
print(f"Patrimonio Total     : ${total_patrimony:12,.2f} COP")
print(f"TASA PONDERADA REAL  : {weighted_rate_ea:.2f}% E.A.")
