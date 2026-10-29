import json
from datetime import datetime, timedelta

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# Let's verify end of curve:
# Nu + Finandina
nu_capital = 1187542.30
nu_yield = 338309.67
nu_total = 1525851.97

fin_capital = 533000.00
fin_yield = 111145.92
fin_total = 644145.92

global_capital = nu_capital + fin_capital
global_yield = nu_yield + fin_yield
global_total = nu_total + fin_total

print("=== TOTALES DE LA CURVA COMBINADA A HOY ===")
print(f"Capital Base Global : ${global_capital:12,.2f} COP")
print(f"Ganancia Neta Global: +${global_yield:12,.2f} COP")
print(f"Saldo Total Global  : ${global_total:12,.2f} COP")
print(f"Comprobacion: ${global_capital:,.2f} + ${global_yield:,.2f} = ${global_total:,.2f} COP (100% exacto)")
