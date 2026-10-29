import json
from datetime import datetime, timedelta

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# Global test
nu_accounts = [a for a in db.get("accounts", []) if a.get("entityId") == "ent_nu"]
fin_accounts = [a for a in db.get("accounts", []) if a.get("entityId") == "ent_1786771791285" or "finandina" in a.get("name", "").lower()]
all_cdts = [c for c in db.get("cdts", []) if c.get("status") != "matured"]

# Rates check
# Nu: 3 cajitas totaling $1,514,458.21. CDTs capital totaling $403,932.00.
# Unfrozen liquid in Nu = $1,110,526.21 @ 9.30% EA
# Nu CDTs = $403,932.00 @ 11.30% EA
# Finandina = $644,145.92 @ 10.00% EA
# Total liquid balance in cajitas/cuentas = $1,514,458.21 + $644,145.92 = $2,158,604.13
rate_sum = (1110526.21 * 9.30) + (403932.00 * 11.30) + (644145.92 * 10.00)
weighted_rate = rate_sum / 2158604.13
print(f"Tasa Ponderada Exacta: {weighted_rate:.2f}% E.A.")

# Nu earnings: $326,915.91 + $11,393.76 (CDTs) = $338,309.67
# Finandina earnings: $111,145.92
# Total earnings: $449,455.59
# Total capital: $1,187,542.30 + $533,000.00 = $1,720,542.30
# Total patrimony: $1,720,542.30 + $449,455.59 = $2,169,997.89
print(f"Patrimonio Total: ${1720542.30 + 449455.59:,.2f} COP")
print(f"Capital Total   : ${1720542.30:,.2f} COP")
print(f"Ganancia Total  : +${449455.59:,.2f} COP")
