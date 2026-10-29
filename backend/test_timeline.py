import json
from datetime import datetime, timedelta

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

transactions = db.get("transactions", [])
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

# Sort transactions
transactions.sort(key=lambda x: x.get("date") or "2024-01-01")

start_date_str = transactions[0]["date"] if transactions else "2024-06-01"
start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
today = datetime.now()

# Map tx by date
tx_by_date = {}
for t in transactions:
    d = t.get("date")
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
    change = -amt if is_debit else amt
    tx_by_date.setdefault(d, []).append(change)

# Active/Matured CDTs by date
# Simulation
curr_pocket_balance = 0.0
net_capital_deposited = 0.0
total_interest_earned = 0.0

timeline = []
curr_date = start_date

while curr_date <= today:
    d_str = curr_date.strftime("%Y-%m-%d")
    
    # 1. Apply deposits/withdrawals
    if d_str in tx_by_date:
        for chg in tx_by_date[d_str]:
            curr_pocket_balance = max(0.0, curr_pocket_balance + chg)
            net_capital_deposited += chg
            
    # 2. CDTs active on this day
    active_cdt_cap = 0.0
    cdt_gain_today = 0.0
    
    for c in cdts:
        s_date = c.get("startDate")
        m_date = c.get("maturityDate") or s_date
        cap = float(c.get("capital", 0))
        r_ea = float(c.get("interestRateEA", 12.2)) / 100.0
        rete = 1.0 - (float(c.get("reteFuentePct", 4.0)) / 100.0)
        
        if s_date <= d_str <= m_date:
            if c.get("status") == "matured" and d_str == m_date:
                continue
            active_cdt_cap += cap
            daily_cdt_r = ((1.0 + r_ea) ** (1.0 / 360.0)) - 1.0
            cdt_gain_today += cap * daily_cdt_r * rete

    # 3. Pocket daily interest
    rate_ea = get_nu_rate(d_str)
    daily_pocket_r = ((1.0 + rate_ea / 100.0) ** (1.0 / 360.0)) - 1.0
    pocket_gain_today = curr_pocket_balance * daily_pocket_r
    
    total_interest_earned += (cdt_gain_today + pocket_gain_today)
    curr_pocket_balance += pocket_gain_today # Compounding
    
    total_balance = curr_pocket_balance + active_cdt_cap
    total_base_capital = max(0.0, net_capital_deposited + active_cdt_cap)
    
    timeline.append({
        "date": d_str,
        "saldo_total": total_balance,
        "capital_base": total_base_capital,
        "ganancia_neta": total_interest_earned,
        "tasa": rate_ea
    })
    
    curr_date += timedelta(days=1)

print(f"Total puntos simulados: {len(timeline)}")
print(f"Punto Inicial ({timeline[0]['date']}): Saldo = ${timeline[0]['saldo_total']:,.2f} | Cap = ${timeline[0]['capital_base']:,.2f} | Ganancia = ${timeline[0]['ganancia_neta']:,.2f}")
mid = len(timeline) // 2
print(f"Punto Medio   ({timeline[mid]['date']}): Saldo = ${timeline[mid]['saldo_total']:,.2f} | Cap = ${timeline[mid]['capital_base']:,.2f} | Ganancia = ${timeline[mid]['ganancia_neta']:,.2f}")
print(f"Punto Final   ({timeline[-1]['date']}): Saldo = ${timeline[-1]['saldo_total']:,.2f} | Cap = ${timeline[-1]['capital_base']:,.2f} | Ganancia = ${timeline[-1]['ganancia_neta']:,.2f}")
