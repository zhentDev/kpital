import json
from datetime import datetime, timedelta
import calendar

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

accs = db.get("accounts", [])
flexi = [a for a in accs if "flexi" in a.get("name", "").lower() or a.get("entityId") == "ent_1786771791285"][0]
txs = db.get("transactions", [])

# Find all existing txs for flexi
flexi_txs = [t for t in txs if t.get("accountId") == flexi["id"]]
flexi_txs.sort(key=lambda x: x.get("date") or "2025-01-01")

start_date_str = flexi_txs[0]["date"]
start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
today = datetime.now()

# Map movements by date (excluding existing interest payouts if any)
tx_by_date = {}
existing_payout_months = set()
for t in flexi_txs:
    d = t.get("date")
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    if "rendimiento mensual" in desc or "interés mensual" in desc or t.get("isInterestPayout"):
        existing_payout_months.add(d[:7])
        continue
    is_debit = t.get("type") == "debit" or "retiro" in desc or "retiraste" in desc or float(t.get("amount", 0)) < 0
    change = -amt if is_debit else amt
    tx_by_date.setdefault(d, []).append(change)

rate_ea = float(flexi.get("interestRateEA") or 9.30)

curr_balance = 0.0
curr_date = start_date
curr_month_str = ""
curr_month_interest = 0.0

new_transactions = []

while curr_date <= today:
    d_str = curr_date.strftime("%Y-%m-%d")
    m_str = curr_date.strftime("%Y-%m")
    
    if m_str != curr_month_str:
        if curr_month_str and curr_month_interest > 0.01:
            if curr_month_str not in existing_payout_months:
                yr, mo = map(int, curr_month_str.split("-"))
                last_day = calendar.monthrange(yr, mo)[1]
                last_date_str = f"{curr_month_str}-{last_day:02d}"
                dt_obj = datetime(yr, mo, 1)
                month_name = dt_obj.strftime("%b %Y")
                
                new_tx = {
                    "id": f"tx_finandina_yield_{curr_month_str}",
                    "accountId": flexi["id"],
                    "date": last_date_str,
                    "description": f"Rendimiento Mensual Flexi Digital + ({month_name})",
                    "amount": round(curr_month_interest, 2),
                    "currency": "COP",
                    "type": "credit",
                    "isInterestPayout": True,
                    "createdAt": datetime.now().isoformat()
                }
                new_transactions.append(new_tx)
                
            curr_balance += curr_month_interest
            
        curr_month_str = m_str
        curr_month_interest = 0.0
        
    if d_str in tx_by_date:
        for chg in tx_by_date[d_str]:
            curr_balance = max(0.0, curr_balance + chg)
            
    daily_r = ((1.0 + rate_ea / 100.0) ** (1.0 / 360.0)) - 1.0
    day_interest = curr_balance * daily_r
    curr_month_interest += day_interest
    
    curr_date += timedelta(days=1)

print(f"Nuevas transacciones mensuales calculadas: {len(new_transactions)}")
total_new_yield = sum(t["amount"] for t in new_transactions)
print(f"Total Rendimientos Mes a Mes Inyectados: +${total_new_yield:,.2f} COP")

# Append to db transactions
for ntx in new_transactions:
    txs.append(ntx)

# Update Flexi Digital + balance
flexi["balance"] = round(curr_balance, 2)

with open("data/fixed_income.json", "w", encoding="utf-8") as f:
    json.dump(db, f, indent=2, ensure_ascii=False)

print(f"¡Base de datos fixed_income.json actualizada con éxito! Nuevo saldo Flexi: ${flexi['balance']:,.2f} COP")
