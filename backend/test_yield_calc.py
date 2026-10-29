import json
from datetime import datetime, timedelta

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    fi_db = json.load(f)

with open("data/historical_rates.json", "r", encoding="utf-8") as f:
    rates_db = json.load(f)

nu_rates = rates_db["entities"]["ent_nu"]["savings_rates"]

def get_rate_for_date(d_str):
    for r in nu_rates:
        if r["from"] <= d_str <= r["to"]:
            return float(r["rateEA"])
    return 9.25

accounts = fi_db.get("accounts", [])
transactions = fi_db.get("transactions", [])

print("=== CALCULANDO RENDIMIENTOS DÍA A DÍA CON TASAS HISTÓRICAS ===")

for acc in accounts:
    acc_id = acc["id"]
    acc_name = acc["name"]
    # Filter transactions
    txs = [t for t in transactions if t.get("accountId") == acc_id or acc_name.lower() in (t.get("description") or "").lower()]
    txs.sort(key=lambda x: x.get("date") or "2024-01-01")
    
    if not txs:
        continue
        
    start_date = datetime.strptime(txs[0]["date"], "%Y-%m-%d")
    today = datetime.now()
    
    # Net capital
    deposits = 0.0
    withdrawals = 0.0
    for t in txs:
        amt = abs(float(t.get("amount", 0)))
        desc = (t.get("description") or "").lower()
        is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
        if is_debit:
            withdrawals += amt
        else:
            deposits += amt
    net_capital = deposits - withdrawals
    
    # Daily compound simulation
    # Group transactions by date
    tx_by_date = {}
    for t in txs:
        d = t.get("date")
        amt = abs(float(t.get("amount", 0)))
        desc = (t.get("description") or "").lower()
        is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
        signed = -amt if is_debit else amt
        tx_by_date[d] = tx_by_date.get(d, 0.0) + signed

    curr_balance = 0.0
    total_interest = 0.0
    curr_date = start_date
    
    while curr_date <= today:
        d_str = curr_date.strftime("%Y-%m-%d")
        
        # Apply movements of the day at start of day
        if d_str in tx_by_date:
            curr_balance += tx_by_date[d_str]
            curr_balance = max(0.0, curr_balance)
            
        rate_ea = get_rate_for_date(d_str)
        # Daily effective rate: (1 + EA)^(1/365) - 1
        daily_rate = ((1.0 + rate_ea / 100.0) ** (1.0 / 365.0)) - 1.0
        daily_interest = curr_balance * daily_rate
        total_interest += daily_interest
        curr_balance += daily_interest
        
        curr_date += timedelta(days=1)
        
    print(f"\n--- {acc_name} ({len(txs)} movimientos) ---")
    print(f"1. Capital Neto Aportado:  ${net_capital:12,.2f} COP (Depósitos: ${deposits:,.2f} - Retiros: ${withdrawals:,.2f})")
    print(f"2. Rentabilidad Ganada:    ${total_interest:12,.2f} COP")
    print(f"3. Saldo Total (1 + 2):    ${curr_balance:12,.2f} COP")
    print(f"   Saldo Registrado Actual: ${float(acc.get('balance', 0)):12,.2f} COP")
