import json
from datetime import datetime

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

accounts = db.get("accounts", [])
cdts = db.get("cdts", [])
txs = db.get("transactions", [])

with open("data/historical_rates.json", "r", encoding="utf-8") as f:
    rates_db = json.load(f)

print("=== 1. CUENTAS INDIVIDUALES ===")
total_aportes = 0.0
total_ganancias = 0.0
total_liquido = 0.0

for a in accounts:
    bal = float(a.get("balance", 0))
    # Sum net tx
    a_tx = [t for t in txs if t.get("accountId") == a["id"]]
    net_dep = sum(float(t.get("amount", 0)) if t.get("type") != "debit" and "retiraste" not in (t.get("description") or "").lower() and "retiro" not in (t.get("description") or "").lower() and float(t.get("amount", 0)) > 0 else -abs(float(t.get("amount", 0))) for t in a_tx)
    gain = bal - net_dep
    total_aportes += net_dep
    total_ganancias += gain
    total_liquido += bal
    print(f"{a.get('name')}: Aportado=${net_dep:,.2f} | Ganancia=+${gain:,.2f} | Saldo Liquido=${bal:,.2f}")

print(f"\nTOTAL CAJITAS LÍQUIDAS: Aportado=${total_aportes:,.2f} | Ganancia=+${total_ganancias:,.2f} | Saldo Líquido=${total_liquido:,.2f}")

print("\n=== 2. CDTS ACTIVOS ===")
total_cdt_cap = 0.0
total_cdt_gain = 0.0
today = datetime.now()

for c in cdts:
    if c.get("status") != "matured":
        cap = float(c.get("capital", 0))
        r_ea = float(c.get("interestRateEA", 11.0)) / 100.0
        rete = 1.0 - (float(c.get("reteFuentePct", 4.0)) / 100.0)
        s_date = datetime.strptime(c.get("startDate"), "%Y-%m-%d")
        days = (today - s_date).days
        accrued = cap * (((1.0 + r_ea) ** (days / 360.0)) - 1.0) * rete
        total_cdt_cap += cap
        total_cdt_gain += accrued
        print(f"{c.get('name')}: Cap=${cap:,.2f} | Tasa={c.get('interestRateEA')}% | Rend Devengado=+${accrued:,.2f} | Total CDT=${cap + accrued:,.2f}")

print(f"\nTOTAL CDTS ACTIVOS: Capital=${total_cdt_cap:,.2f} | Rendimiento Devengado=+${total_cdt_gain:,.2f} | Total=${total_cdt_cap + total_cdt_gain:,.2f}")

print("\n=== 3. CONSOLIDADO PATRIMONIO RENTA FIJA ===")
print(f"Patrimonio Total Real = Saldo Líquido (${total_liquido:,.2f}) + CDTs (${total_cdt_cap + total_cdt_gain:,.2f})")
print(f"                       = ${total_liquido + total_cdt_cap + total_cdt_gain:,.2f} COP")
print(f"Capital Base Total    = Aportes Cajitas (${total_aportes:,.2f}) + Capital CDTs (${total_cdt_cap:,.2f})")
print(f"                       = ${total_aportes + total_cdt_cap:,.2f} COP")
print(f"Ganancia Total Real   = Ganancia Cajitas (${total_ganancias:,.2f}) + Rendimiento CDTs (${total_cdt_gain:,.2f})")
print(f"                       = +${total_ganancias + total_cdt_gain:,.2f} COP")
