import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# Let's inspect Cajita Viaje transactions
viaje_txs = [t for t in db.get("transactions", []) if t.get("accountId") == "acc_viaje"]
print(f"Total transacciones Cajita Viaje: {len(viaje_txs)}")

deposits = 0.0
withdrawals = 0.0

for t in viaje_txs:
    amt = abs(float(t.get("amount", 0)))
    desc = (t.get("description") or "").lower()
    is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
    if is_debit:
        withdrawals += amt
    else:
        deposits += amt
    print(f"  {t.get('date')} | {'RETIRO' if is_debit else 'DEPOSITO':8} | ${amt:10,.2f} | {t.get('description')}")

net = deposits - withdrawals
print(f"\nDepósitos Totales: ${deposits:,.2f}")
print(f"Retiros Totales:   ${withdrawals:,.2f}")
print(f"Neto Aportado:     ${net:,.2f}")
