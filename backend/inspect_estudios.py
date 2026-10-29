import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

estudios_txs = [t for t in db.get("transactions", []) if t.get("accountId") == "acc_estudios"]
print(f"Total transacciones Cajita Estudios: {len(estudios_txs)}")

deposits = 0.0
withdrawals = 0.0

for i, t in enumerate(estudios_txs):
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
    if is_debit:
        withdrawals += amt
    else:
        deposits += amt
    print(f"{i+1:2}. {t.get('date')} | {'RETIRO' if is_debit else 'DEPOSITO':8} | ${amt:10,.2f} | {t.get('description')} (ID: {t.get('id')})")

net = deposits - withdrawals
print(f"\nTotal Depósitos:   ${deposits:,.2f}")
print(f"Total Retiros:     ${withdrawals:,.2f}")
print(f"Neto (Dep - Ret):  ${net:,.2f}")
