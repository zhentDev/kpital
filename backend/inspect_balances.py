import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

print("=== CUENTAS / CAJITAS ===")
for acc in db.get("accounts", []):
    bal = float(acc.get("balance", 0))
    print(f"ID: {acc['id']} | Nombre: {acc['name']} | Saldo actual: ${bal:,.2f}")

print("\n=== SUMA DE TRANSACCIONES POR CAJITA ===")
txs = db.get("transactions", [])
print(f"Total transacciones en JSON: {len(txs)}")

by_acc = {}
for tx in txs:
    aid = tx.get("accountId", "sin_id")
    by_acc.setdefault(aid, []).append(tx)

for aid, t_list in by_acc.items():
    deposits = 0.0
    withdrawals = 0.0
    for t in t_list:
        desc = (t.get("description") or "").lower()
        amt = abs(float(t.get("amount", 0)))
        is_debit = t.get("type") == "debit" or "retiraste" in desc or "retiro" in desc or "invertiste" in desc or float(t.get("amount", 0)) < 0
        if is_debit:
            withdrawals += amt
        else:
            deposits += amt
    net = deposits - withdrawals
    print(f"Cajita ID: {aid:15} ({len(t_list):2} movs) | Depósitos: ${deposits:12,.2f} | Retiros: ${withdrawals:12,.2f} | Neto Movimientos: ${net:12,.2f}")
