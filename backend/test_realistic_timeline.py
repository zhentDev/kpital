import json
from datetime import datetime, timedelta

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

txs = db.get("transactions", [])
cdts = db.get("cdts", [])
accounts = db.get("accounts", [])

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

start_date_str = txs[0]["date"] if txs else "2024-06-13"
start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
today = datetime.now()

# Map movements by date
tx_by_date = {}
for t in txs:
    d = t.get("date")
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
    change = -amt if is_debit else amt
    tx_by_date.setdefault(d, []).append(change)

# Active CDTs today
active_cdts = [c for c in cdts if c.get("status") != "matured"]
active_cdts_cap = sum(float(c.get("capital", 0)) for c in active_cdts)

# Simulation: The deposits in txs represent the capital flow
# Balance compounds over time
curr_capital = 0.0
curr_balance = 0.0
total_interest = 0.0

timeline = []
curr_date = start_date

max_balance = 0.0
max_date = ""

while curr_date <= today:
    d_str = curr_date.strftime("%Y-%m-%d")
    
    # 1. Apply deposits/withdrawals of the day
    if d_str in tx_by_date:
        for chg in tx_by_date[d_str]:
            curr_capital = max(0.0, curr_capital + chg)
            curr_balance = max(0.0, curr_balance + chg)
            
    # 2. Daily interest compounding (base 360)
    rate_ea = get_nu_rate(d_str)
    daily_r = ((1.0 + rate_ea / 100.0) ** (1.0 / 360.0)) - 1.0
    daily_int = curr_balance * daily_r
    
    total_interest += daily_int
    curr_balance += daily_int
    
    if curr_balance > max_balance:
        max_balance = curr_balance
        max_date = d_str
        
    timeline.append({
        "date": d_str,
        "capital": curr_capital,
        "saldo": curr_balance,
        "ganancia": total_interest,
        "tasa": rate_ea
    })
    
    curr_date += timedelta(days=1)

# Add active CDTs accrued profit to align with KPI
print(f"=== SIMULACIÓN CRONOLÓGICA REAL (SIN DUPLICACIÓN DE CDTs) ===")
print(f"Punto Inicial ({timeline[0]['date']}): Saldo = ${timeline[0]['saldo']:,.2f} | Cap = ${timeline[0]['capital']:,.2f} | Ganancia = ${timeline[0]['ganancia']:,.2f}")
print(f"PICO MÁXIMO   ({max_date}): Saldo = ${max_balance:,.2f} | Cap = ${timeline[[x['date'] for x in timeline].index(max_date)]['capital']:,.2f}")
print(f"Punto Final   ({timeline[-1]['date']}): Saldo = ${timeline[-1]['saldo']:,.2f} | Cap = ${timeline[-1]['capital']:,.2f} | Ganancia = ${timeline[-1]['ganancia']:,.2f}")
