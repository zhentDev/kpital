import json
from datetime import datetime, timedelta

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

txs = db.get("transactions", [])
cdts = db.get("cdts", [])
accounts = db.get("accounts", [])

print(f"Total transacciones: {len(txs)}")
print(f"Total CDTs: {len(cdts)}")

# Check peak in previous simulation
with open("data/historical_rates.json", "r", encoding="utf-8") as f:
    rates_db = json.load(f)
nu_rates = rates_db["entities"]["ent_nu"]["savings_rates"]

def get_nu_rate(d_str):
    for r in nu_rates:
        if r["from"] <= d_str <= r["to"]:
            return float(r["rateEA"])
    return 9.30

# Sort txs
txs.sort(key=lambda x: x.get("date") or "2024-01-01")

# Track cajitas balances individually
cajitas = {a["id"]: 0.0 for a in accounts}
total_net_deposits = 0.0

print("\n--- CRONOLOGÍA DE APORTES Y RETIROS ---")
for t in txs:
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
    signed = -amt if is_debit else amt
    total_net_deposits += signed
    acc_id = t.get("accountId")
    if acc_id in cajitas:
        cajitas[acc_id] += signed
    print(f"{t.get('date')} | {'- ' if is_debit else '+ '} ${amt:10,.2f} | Acc: {acc_id:15} | Net Acum: ${total_net_deposits:10,.2f} | {t.get('description')}")

print(f"\nNeto total de depósitos en cajitas: ${total_net_deposits:,.2f}")
print("Saldos netos aportados por cajita:")
for acc_id, bal in cajitas.items():
    print(f"  {acc_id}: ${bal:,.2f}")

print("\n--- CDTS EN CURSO / HISTÓRICOS ---")
for c in cdts:
    print(f"  {c.get('name')} | Cap: ${float(c.get('capital', 0)):10,.2f} | {c.get('startDate')} a {c.get('maturityDate')} | Status: {c.get('status')}")
