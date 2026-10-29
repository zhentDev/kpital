import json

# 1. Update historical_rates.json
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
        {"termDaysMin": 30, "termDaysMax": 89, "rateEA": 5.5, "label": "30 Días Plenti Lock (5.5% EA)"},
        {"termDaysMin": 90, "termDaysMax": 179, "rateEA": 6.0, "label": "90 Días Plenti Lock (6.0% EA)"},
        {"termDaysMin": 180, "termDaysMax": 359, "rateEA": 7.0, "label": "180 Días Plenti Lock (7.0% EA)"},
        {"termDaysMin": 360, "termDaysMax": 720, "rateEA": 8.0, "label": "1 Año / 360 Días Plenti Lock (8.0% EA Máx)"}
    ]
}

rates_db["entities"]["ent_plenti"] = plenti_config
rates_db["entities"]["ent_1786777900826"] = plenti_config

with open("data/historical_rates.json", "w", encoding="utf-8") as f:
    json.dump(rates_db, f, indent=2, ensure_ascii=False)

# 2. Update fixed_income.json
with open("data/fixed_income.json", "r", encoding="utf-8") as f:
    fi_db = json.load(f)

# Update account
plenti_acc = next((a for a in fi_db.get("accounts", []) if a.get("id") == "acc_1786777955489"), None)
if plenti_acc:
    plenti_acc["currency"] = "USD"
    plenti_acc["interestRateEA"] = 3.0 # Tasa activa actual según saldo ($875 USD está en tramo $500-$1000 = 3.0% EA)
    plenti_acc["tieredRates"] = plenti_config["tiered_savings_rates"]

with open("data/fixed_income.json", "w", encoding="utf-8") as f:
    json.dump(fi_db, f, indent=2, ensure_ascii=False)

print("Tasas oficiales de Plenti actualizadas: Máx 4% en Bolsillo Visible y Máx 8% en Término Fijo!")
