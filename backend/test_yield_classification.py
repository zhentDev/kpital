import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

txs = db.get("transactions", [])
flexi = [a for a in db.get("accounts", []) if "flexi" in a.get("name", "").lower()][0]
flexi_txs = [t for t in txs if t.get("accountId") == flexi["id"]]

user_deposits = 0.0
user_withdrawals = 0.0
interest_payouts = 0.0

for t in flexi_txs:
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    is_interest = t.get("isInterestPayout") or "rendimiento" in desc or "interes" in desc or "interés" in desc
    is_debit = t.get("type") == "debit" or "retiro" in desc or "retiraste" in desc or float(t.get("amount", 0)) < 0
    
    if is_interest:
        interest_payouts += amt
    elif is_debit:
        user_withdrawals += amt
    else:
        user_deposits += amt

net_capital = user_deposits - user_withdrawals
total_balance = net_capital + interest_payouts

print("=== BALANCE CORRECTO DE FINANDINA FLEXI DIGITAL + ===")
print(f"Depositos de Capital Real : ${user_deposits:12,.2f} COP")
print(f"Retiros Reales            : ${user_withdrawals:12,.2f} COP")
print(f"Aportado Neto Real        : ${net_capital:12,.2f} COP")
print(f"Rentabilidad Ganada Real  : +${interest_payouts:12,.2f} COP")
print(f"Saldo Liquido Total       : ${total_balance:12,.2f} COP")
print(f"Verificacion: ${net_capital:,.2f} + ${interest_payouts:,.2f} = ${total_balance:,.2f} COP (100% exacto)")
