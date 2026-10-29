import json
from datetime import datetime, timedelta

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

plenti_acc = next((a for a in db.get("accounts", []) if a.get("id") == "acc_1786777955489"), None)
plenti_tx = [t for t in db.get("transactions", []) if t.get("accountId") == "acc_1786777955489"]

# Sort transactions ascending by date
plenti_tx.sort(key=lambda t: t.get("date", ""))

# Net Capital
total_deposits = sum(t["amount"] for t in plenti_tx if t["amount"] > 0)
total_withdrawals = sum(abs(t["amount"]) for t in plenti_tx if t["amount"] < 0)
net_capital = total_deposits - total_withdrawals

print(f"Total Deposits: ${total_deposits:.2f} USD")
print(f"Total Withdrawals: ${total_withdrawals:.2f} USD")
print(f"Net Capital: ${net_capital:.2f} USD")

# Daily compound simulation from first deposit (2026-05-16) to today (2026-08-15)
start_date = datetime.strptime(plenti_tx[0]["date"], "%Y-%m-%d")
end_date = datetime.strptime("2026-08-15", "%Y-%m-%d")

# Case A: Flat 3.00% E.A.
current_bal = 0.0
tx_by_date = {}
for t in plenti_tx:
    d = t["date"]
    tx_by_date[d] = tx_by_date.get(d, 0.0) + t["amount"]

curr_d = start_date
while curr_d <= end_date:
    d_str = curr_d.strftime("%Y-%m-%d")
    # Apply today's transactions at start of day
    if d_str in tx_by_date:
        current_bal += tx_by_date[d_str]
    
    # Apply 1 day compound interest (3.0% EA base 360)
    daily_rate = (1 + 0.03) ** (1 / 360) - 1
    if current_bal > 0:
        current_bal += current_bal * daily_rate
        
    curr_d += timedelta(days=1)

profit_3pct = current_bal - net_capital
print(f"\n--- Caso A: Tasa Fija 3.00% E.A. ---")
print(f"Saldo Final Calculado: ${current_bal:.2f} USD")
print(f"Rentabilidad Acumulada: +${profit_3pct:.2f} USD")

# Case B: Tasa Escalonada / Tiers Plenti:
# < $500: 2.0% EA, $500-$1000: 3.0% EA, >$1000: 4.5% EA
current_bal_tiered = 0.0
curr_d = start_date
while curr_d <= end_date:
    d_str = curr_d.strftime("%Y-%m-%d")
    if d_str in tx_by_date:
        current_bal_tiered += tx_by_date[d_str]
    
    # Tier logic
    if current_bal_tiered < 500:
        rate_ea = 0.02
    elif current_bal_tiered <= 1000:
        rate_ea = 0.03
    else:
        rate_ea = 0.045
        
    daily_rate = (1 + rate_ea) ** (1 / 360) - 1
    if current_bal_tiered > 0:
        current_bal_tiered += current_bal_tiered * daily_rate
        
    curr_d += timedelta(days=1)

profit_tiered = current_bal_tiered - net_capital
print(f"\n--- Caso B: Tiers Plenti ---")
print(f"Saldo Final Calculado: ${current_bal_tiered:.2f} USD")
print(f"Rentabilidad Acumulada: +${profit_tiered:.2f} USD")
