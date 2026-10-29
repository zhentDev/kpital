import json
from datetime import datetime, timedelta
import calendar

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

accs = db.get("accounts", [])
flexi = [a for a in accs if "flexi" in a.get("name", "").lower() or a.get("entityId") == "ent_1786771791285"][0]
txs = [t for t in db.get("transactions", []) if t.get("accountId") == flexi["id"]]

# Sort movements
txs.sort(key=lambda x: x.get("date") or "2025-01-01")

start_date_str = txs[0]["date"]
start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
today = datetime.now()

# Map movements by date
tx_by_date = {}
for t in txs:
    d = t.get("date")
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    is_debit = t.get("type") == "debit" or "retiro" in desc or "retiraste" in desc or float(t.get("amount", 0)) < 0
    change = -amt if is_debit else amt
    tx_by_date.setdefault(d, []).append(change)

# Finandina rate history
# 2025: ~12.0% EA, 2026: ~11.5% EA (or rate set on account 9.3% / 12.0%)
rate_ea = float(flexi.get("interestRateEA") or 9.30)

curr_balance = 0.0
curr_date = start_date

monthly_gains = []
curr_month_str = ""
curr_month_interest = 0.0

while curr_date <= today:
    d_str = curr_date.strftime("%Y-%m-%d")
    m_str = curr_date.strftime("%Y-%m")
    
    if m_str != curr_month_str:
        if curr_month_str and curr_month_interest > 0:
            # End of previous month
            last_day = calendar.monthrange(int(curr_month_str.split('-')[0]), int(curr_month_str.split('-')[1]))[1]
            last_date_str = f"{curr_month_str}-{last_day:02d}"
            monthly_gains.append({
                "month": curr_month_str,
                "date": last_date_str,
                "interest": curr_month_interest,
                "balance_before": curr_balance
            })
            # Add monthly payout to balance
            curr_balance += curr_month_interest
            
        curr_month_str = m_str
        curr_month_interest = 0.0
        
    # Apply day movements
    if d_str in tx_by_date:
        for chg in tx_by_date[d_str]:
            curr_balance = max(0.0, curr_balance + chg)
            
    # Daily interest of the month (base 360)
    daily_r = ((1.0 + rate_ea / 100.0) ** (1.0 / 360.0)) - 1.0
    day_interest = curr_balance * daily_r
    curr_month_interest += day_interest
    
    curr_date += timedelta(days=1)

# Check last month
if curr_month_interest > 0:
    monthly_gains.append({
        "month": curr_month_str,
        "date": today.strftime("%Y-%m-%d"),
        "interest": curr_month_interest,
        "balance_before": curr_balance
    })
    curr_balance += curr_month_interest

print("=== RENDIMIENTOS MENSUALES GENERADOS PARA FINANDINA ===")
total_interest = 0.0
for mg in monthly_gains:
    total_interest += mg["interest"]
    print(f"Fecha: {mg['date']} | Mes: {mg['month']} | Rendimiento: +${mg['interest']:10,.2f} | Saldo Acumulado: ${mg['balance_before'] + mg['interest']:10,.2f}")

print(f"\nTotal Rendimientos Generados: +${total_interest:,.2f} COP")
print(f"Saldo Final Calculado en Flexi Digital +: ${curr_balance:,.2f} COP")
