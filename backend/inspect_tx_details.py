import json

with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    db = json.load(f)

for acc in db.get("accounts", []):
    aid = acc["id"]
    name = acc["name"]
    bal = acc.get("balance", 0)
    txs = [t for t in db.get("transactions", []) if t.get("accountId") == aid or name.lower() in (t.get("description") or "").lower()]
    txs.sort(key=lambda x: x.get("date", ""))
    
    deps = sum(abs(float(t.get("amount", 0))) for t in txs if t.get("type") == "credit" or (not t.get("type") and float(t.get("amount", 0)) > 0))
    rets = sum(abs(float(t.get("amount", 0))) for t in txs if t.get("type") == "debit" or float(t.get("amount", 0)) < 0)
    net_mvs = deps - rets
    print(f"\n==========================================")
    print(f"=== {name} (ID: {aid}) ===")
    print(f"Saldo registrado en BD: ${bal:,.2f}")
    print(f"Total Movs: {len(txs)} | Depósitos: ${deps:,.2f} | Retiros: ${rets:,.2f} | Neto Movimientos: ${net_mvs:,.2f}")
    for t in txs:
        print(f"  {t.get('date')} | {t.get('type'):6} | ${float(t.get('amount', 0)):10,.2f} | {t.get('description')}")
