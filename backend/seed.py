import requests

url = "http://localhost:8000/api/rebalances"
payload = {
    "rebalance_date": "2026-08-03",
    "cash_added": 2000.0,
    "tickers": [
        "AMD",
        "AMAT",
        "HPQ",
        "INTC",
        "ON",
        "ORCL",
        "POWI",
        "QCOM",
        "TXN",
        "MRVL",
        "HIMX",
        "NTAP",
        "KD",
        "ARM",
    ],
}

res = requests.post(url, json=payload)
print(res.status_code, res.text)
