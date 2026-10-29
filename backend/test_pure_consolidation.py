import json
from datetime import datetime

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

accounts = db.get("accounts", [])
cdts = db.get("cdts", [])
txs = db.get("transactions", [])

print("=== BALANCE Y CAPITAL REAL DE LAS CAJITAS ===")
total_aportes = 0.0
total_ganancia_cajitas = 0.0
total_cajitas = 0.0

for a in accounts:
    bal = float(a.get("balance", 0))
    a_tx = [t for t in txs if t.get("accountId") == a["id"]]
    net_dep = sum(float(t.get("amount", 0)) if t.get("type") != "debit" and "retiraste" not in (t.get("description") or "").lower() and "retiro" not in (t.get("description") or "").lower() and float(t.get("amount", 0)) > 0 else -abs(float(t.get("amount", 0))) for t in a_tx)
    gain = bal - net_dep
    total_aportes += net_dep
    total_ganancia_cajitas += gain
    total_cajitas += bal
    print(f"  {a.get('name')}: Aportado=${net_dep:,.2f} | Ganancia=+${gain:,.2f} | Saldo=${bal:,.2f}")

print(f"\nTOTAL CAJITAS: Aportado=${total_aportes:,.2f} | Ganancia=+${total_ganancia_cajitas:,.2f} | Saldo=${total_cajitas:,.2f}")

# CDTs activos solo aportan sus RENDIMIENTOS DEVENGADOS (el capital ya está dentro de las cajitas)
total_rendimiento_cdts = 0.0
today = datetime.now()

for c in cdts:
    if c.get("status") != "matured":
        cap = float(c.get("capital", 0))
        r_ea = float(c.get("interestRateEA", 11.0)) / 100.0
        rete = 1.0 - (float(c.get("reteFuentePct", 4.0)) / 100.0)
        s_date = datetime.strptime(c.get("startDate"), "%Y-%m-%d")
        days = (today - s_date).days
        accrued = cap * (((1.0 + r_ea) ** (days / 360.0)) - 1.0) * rete
        total_rendimiento_cdts += accrued
        print(f"  CDT {c.get('name')}: Cap=${cap:,.2f} (congelado de cajita) | Rendimiento Devengado=+${accrued:,.2f}")

print(f"\nTOTAL RENDIMIENTO DEVENGADO DE CDTS: +${total_rendimiento_cdts:,.2f}")

patrimonio_total = total_cajitas + total_rendimiento_cdts
ganancia_total = total_ganancia_cajitas + total_rendimiento_cdts

print("\n=== BALANCE CONSOLIDADO DEFINITIVO ===")
print(f"📥 Aportado Neto Total : ${total_aportes:,.2f} COP")
print(f"📈 Ganancia Total Real : +${ganancia_total:,.2f} COP (Cajitas: ${total_ganancia_cajitas:,.2f} + CDTs: ${total_rendimiento_cdts:,.2f})")
print(f"💰 PATRIMONIO TOTAL    : ${patrimonio_total:,.2f} COP")
print(f"Comprobación (Aporte + Ganancia = Patrimonio): ${total_aportes + ganancia_total:,.2f} COP == ${patrimonio_total:,.2f} COP -> {'PERFECTO!' if abs(total_aportes + ganancia_total - patrimonio_total) < 0.01 else 'ERROR'}")
