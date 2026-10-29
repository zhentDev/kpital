import json

with open("data/historical_rates.json", "r", encoding="utf-8") as f:
    rates_db = json.load(f)

plenti_config = {
    "name": "Plenti (Ahorros)",
    "country": "🇺🇸",
    "currency": "USD",
    "savings_rates": [
        {
            "from": "2024-01-01",
            "to": "2099-12-31",
            "rateEA": 4.0,
            "notes": "Bolsillo Visible USD (hasta 4.0% E.A.)"
        }
    ],
    "tiered_savings_rates": [
        {"maxBalance": 500, "rateEA": 2.0, "label": "Hasta $500 USD (2.0% EA)"},
        {"maxBalance": 1000, "rateEA": 3.0, "label": "$500 a $1,000 USD (3.0% EA)"},
        {"maxBalance": 5000, "rateEA": 3.5, "label": "$1,000 a $5,000 USD (3.5% EA)"},
        {"maxBalance": 9999999, "rateEA": 4.0, "label": "Más de $5,000 USD (4.0% EA Máx Bolsillo Visible)"}
    ],
    "cdt_term_rates": [
        {"termDaysMin": 30, "termDaysMax": 89, "rateEA": 5.5, "label": "30 Días Plenti Lock (5.50% E.A.)"},
        {"termDaysMin": 90, "termDaysMax": 365, "rateEA": 8.0, "label": "90 Días Plenti Lock (8.00% E.A.)"}
    ]
}

rates_db["entities"]["ent_plenti"] = plenti_config
rates_db["entities"]["ent_1786777900826"] = plenti_config

with open("data/historical_rates.json", "w", encoding="utf-8") as f:
    json.dump(rates_db, f, indent=2, ensure_ascii=False)

print("Tasas Plenti Lock actualizadas a 30d @ 5.5% y 90d @ 8.0%!")
