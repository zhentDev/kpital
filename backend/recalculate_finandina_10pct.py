import json
from datetime import datetime, timedelta
import calendar

# 1. Update historical_rates.json
with open("data/historical_rates.json", "r", encoding="utf-8") as f:
    rates = json.load(f)

rates["entities"]["ent_finandina"] = {
    "name": "Banco Finandina",
    "country": "🇨🇴",
    "savings_rates": [
        {
            "from": "2024-01-01",
            "to": "2099-12-31",
            "rateEA": 10.0,
            "notes": "Cuenta FlexiDigital + (Bolsillo de Ahorro) 10.00% E.A."
        }
    ],
    "cdt_term_rates": [
        { "termDaysMin": 1, "termDaysMax": 45, "rateEA": 9.5, "label": "30 Días Digital" },
        { "termDaysMin": 46, "termDaysMax": 120, "rateEA": 10.2, "label": "90 Días Digital" },
        { "termDaysMin": 121, "termDaysMax": 220, "rateEA": 10.8, "label": "180 Días Digital" },
        { "termDaysMin": 221, "termDaysMax": 999, "rateEA": 11.2, "label": "360 Días Digital" }
    ]
}

with open("data/historical_rates.json", "w", encoding="utf-8") as f:
    json.dump(rates, f, indent=2, ensure_ascii=False)

print("historical_rates.json actualizado con tasa 10.00% E.A. para Finandina FlexiDigital +")

# 2. Update fixed_income.json and re-calculate monthly yields with 10.0% EA
with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

accs = db.get("accounts", [])
flexi = [a for a in accs if "flexi" in a.get("name", "").lower() or a.get("entityId") == "ent_1786771791285"][0]
flexi["interestRateEA"] = 10.0
flexi["rateHistory"] = [{"date": "2024-01-01", "rateEA": 10.0}]

# Remove old generated monthly yields for flexi
txs = db.get("transactions", [])
manual_txs = [t for t in txs if not (t.get("accountId") == flexi["id"] and (t.get("isInterestPayout") or "rendimiento mensual" in (t.get("description") or "").lower()))]

# Recalculate monthly yields at 10.0% EA
flexi_manual = [t for t in manual_txs if t.get("accountId") == flexi["id"]]
flexi_manual.sort(key=lambda x: x.get("date") or "2025-01-01")

start_date_str = flexi_manual[0]["date"]
start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
today = datetime.now()

tx_by_date = {}
for t in flexi_manual:
    d = t.get("date")
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    is_debit = t.get("type") == "debit" or "retiro" in desc or "retiraste" in desc or float(t.get("amount", 0)) < 0
    change = -amt if is_debit else amt
    tx_by_date.setdefault(d, []).append(change)

rate_ea = 10.00
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

print(f"Rendimientos calculados al 10.0% E.A.: {len(new_transactions)}")
for ntx in new_transactions:
    print(f"  {ntx['date']}: {ntx['description']} -> +${ntx['amount']:,.2f} COP")
    manual_txs.append(ntx)

total_yield = sum(t["amount"] for t in new_transactions)
print(f"\nTotal Rendimientos al 10.0% E.A.: +${total_yield:,.2f} COP")
flexi["balance"] = round(curr_balance, 2)
print(f"Nuevo Saldo Calculado en Flexi Digital +: ${flexi['balance']:,.2f} COP")

db["transactions"] = manual_txs

with open("data/fixed_income.json", "w", encoding="utf-8") as f:
    json.dump(db, f, indent=2, ensure_ascii=False)

print("fixed_income.json actualizado exitosamente!")
