import json

with open("data/historical_rates.json", "r", encoding="utf-8") as f:
    db = json.load(f)

# Add MejorCDT
db["entities"]["ent_mejorcdt"] = {
    "name": "MejorCDT",
    "country": "🇨🇴",
    "savings_rates": [
        {
            "from": "2024-01-01",
            "to": "2099-12-31",
            "rateEA": 11.5,
            "notes": "Tasa promedio de referencia MejorCDT"
        }
    ],
    "cdt_term_rates": [
        {
            "termDaysMin": 60,
            "termDaysMax": 119,
            "rateEA": 10.8,
            "label": "90 Días (KOA / Contactar)"
        },
        {
            "termDaysMin": 120,
            "termDaysMax": 239,
            "rateEA": 11.8,
            "label": "180 Días (KOA)"
        },
        {
            "termDaysMin": 240,
            "termDaysMax": 320,
            "rateEA": 12.0,
            "label": "270 Días (KOA)"
        },
        {
            "termDaysMin": 321,
            "termDaysMax": 450,
            "rateEA": 12.3,
            "label": "1 Año / 360 Días (KOA / Ban100)"
        },
        {
            "termDaysMin": 451,
            "termDaysMax": 650,
            "rateEA": 12.1,
            "label": "540 Días (KOA)"
        },
        {
            "termDaysMin": 651,
            "termDaysMax": 1080,
            "rateEA": 11.9,
            "label": "2 Años / 720 Días"
        }
    ]
}

# Add Plenti
db["entities"]["ent_plenti"] = {
    "name": "Plenti (Ahorros)",
    "country": "🇨🇴",
    "savings_rates": [
        {
            "from": "2024-01-01",
            "to": "2099-12-31",
            "rateEA": 10.5,
            "notes": "Rendimiento diario Plenti Flex"
        }
    ],
    "cdt_term_rates": [
        {
            "termDaysMin": 30,
            "termDaysMax": 90,
            "rateEA": 11.0,
            "label": "30-90 Días Plenti Lock"
        },
        {
            "termDaysMin": 91,
            "termDaysMax": 180,
            "rateEA": 11.5,
            "label": "180 Días Plenti Lock"
        }
    ]
}

# Also map if entity id is customized (like ent_1786... or name contains mejorcdt)
with open("data/historical_rates.json", "w", encoding="utf-8") as f:
    json.dump(db, f, indent=2, ensure_ascii=False)

print("Tasas y plazos de MejorCDT (KOA) y Plenti agregados con éxito a historical_rates.json!")
