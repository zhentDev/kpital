import json
from datetime import datetime

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

cdts = db.get("cdts", [])
matured_cdts = [c for c in cdts if c.get("status") == "matured"]

print("=== GANANCIAS HISTORICAS DE LOS 9 CDTs CERRADOS ===")
total_profit = 0.0

for i, c in enumerate(matured_cdts):
    cap = float(c.get("capital", 0))
    rate_ea = float(c.get("interestRateEA", 12.2)) / 100.0
    start = datetime.strptime(c.get("startDate"), "%Y-%m-%d")
    mat = datetime.strptime(c.get("maturityDate"), "%Y-%m-%d")
    days = (mat - start).days
    rete_mul = 1.0 - (float(c.get("reteFuentePct", 4.0)) / 100.0)
    
    # Base 360
    profit = cap * (((1.0 + rate_ea) ** (days / 360.0)) - 1.0) * rete_mul
    total_profit += profit
    print(f"{i+1}. {c.get('name')} | Cat: {c.get('category')} | {days} dias ({c.get('startDate')} a {c.get('maturityDate')}) | Cap: ${cap:10,.2f} | Ganancia Neta: +${profit:8,.2f} COP")

print(f"\nTOTAL GANANCIAS DE CDTs CERRADOS: +${total_profit:,.2f} COP")
