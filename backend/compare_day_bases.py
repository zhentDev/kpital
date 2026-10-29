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

print("=== COMPARACIÓN DE RENDIMIENTOS: BASE 365 vs BASE 360 ===")

for acc in accounts:
    acc_id = acc["id"]
    acc_name = acc["name"]
    txs = [t for t in transactions if t.get("accountId") == acc_id]
    txs.sort(key=lambda x: x.get("date") or "2024-01-01")
    
    if not txs:
        continue
        
    start_date = datetime.strptime(txs[0]["date"], "%Y-%m-%d")
    today = datetime.now()
    
    # Group transactions by date
    tx_by_date = {}
    for t in txs:
        d = t.get("date")
        amt = abs(float(t.get("amount", 0)))
        desc = (t.get("description") or "").lower()
        is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
        signed = -amt if is_debit else amt
        tx_by_date[d] = tx_by_date.get(d, 0.0) + signed

    # Simulation with 365 base
    curr_365 = 0.0
    int_365 = 0.0
    curr_date = start_date
    while curr_date <= today:
        d_str = curr_date.strftime("%Y-%m-%d")
        if d_str in tx_by_date:
            curr_365 = max(0.0, curr_365 + tx_by_date[d_str])
        rate_ea = get_rate_for_date(d_str)
        daily_rate_365 = ((1.0 + rate_ea / 100.0) ** (1.0 / 365.0)) - 1.0
        daily_int = curr_365 * daily_rate_365
        int_365 += daily_int
        curr_365 += daily_int
        curr_date += timedelta(days=1)

    # Simulation with 360 base (Bancario Comercial Colombiano)
    curr_360 = 0.0
    int_360 = 0.0
    curr_date = start_date
    while curr_date <= today:
        d_str = curr_date.strftime("%Y-%m-%d")
        if d_str in tx_by_date:
            curr_360 = max(0.0, curr_360 + tx_by_date[d_str])
        rate_ea = get_rate_for_date(d_str)
        daily_rate_360 = ((1.0 + rate_ea / 100.0) ** (1.0 / 360.0)) - 1.0
        daily_int = curr_360 * daily_rate_360
        int_360 += daily_int
        curr_360 += daily_int
        curr_date += timedelta(days=1)

    print(f"\n--- {acc_name} ---")
    print(f"  Base 365 días: Rentabilidad = +${int_365:10,.2f} COP | Saldo Total = ${curr_365:10,.2f} COP")
    print(f"  Base 360 días: Rentabilidad = +${int_360:10,.2f} COP | Saldo Total = ${curr_360:10,.2f} COP")
    print(f"  Diferencia ganada con base bancaria (360): +${(int_360 - int_365):10,.2f} COP")
