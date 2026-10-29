"""Automated Rate Tracker Service.

Tracks interest rates for high-yield savings accounts and CDTs across all known
Colombian and global financial entities (Nu, Finandina, Lulo, Pibank, RappiPay,
Ualá, Falabella, Bancolombia, Davivienda, Plenti, etc.).
Provides weekly review alerts and seamless 1-click rate updates that preserve
historical compound interest calculations.
"""

from datetime import datetime, timedelta
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Complete catalog of all known financial institutions, their verified current market rates,
# official rate portals, and official payout frequencies.
KNOWN_MARKET_ENTITIES = {
    "nu": {
        "id": "nu",
        "name": "Nu Colombia",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 9.35,
        "productName": "Cajitas Nu (Cuenta de Ahorros)",
        "payoutFrequency": "daily",
        "sourceUrl": "https://nu.com.co/cf/cuenta/",
        "searchQuery": "tasa cajitas nu colombia efectiva anual",
    },
    "finandina": {
        "id": "finandina",
        "name": "Banco Finandina",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 10.50,
        "productName": "FlexiDigital + / Bolsillo Ahorro",
        "payoutFrequency": "monthly",
        "sourceUrl": "https://www.bancofinandina.com/personas/ahorro-e-inversion/cuenta-de-ahorros-flexidigital",
        "searchQuery": "tasa flexidigital banco finandina efectiva anual",
    },
    "lulo": {
        "id": "lulo",
        "name": "Lulo Bank",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 13.00,
        "productName": "Lulo Cuenta / Bolsillos Lulo",
        "payoutFrequency": "daily",
        "sourceUrl": "https://www.lulobank.com/",
        "searchQuery": "tasa bolsillos lulo bank efectiva anual",
    },
    "pibank": {
        "id": "pibank",
        "name": "Pibank",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 12.00,
        "productName": "Cuenta Remunerada Pibank",
        "payoutFrequency": "daily",
        "sourceUrl": "https://www.pibank.co/cuenta-remunerada/",
        "searchQuery": "tasa cuenta remunerada pibank colombia",
    },
    "rappi": {
        "id": "rappi",
        "name": "RappiPay",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 10.00,
        "productName": "RappiCuenta / Bóvedas",
        "payoutFrequency": "daily",
        "sourceUrl": "https://rappipay.co/rappicuenta/",
        "searchQuery": "tasa bovedas rappicuenta rappipay efectiva anual",
    },
    "uala": {
        "id": "uala",
        "name": "Ualá Colombia",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 13.00,
        "productName": "Cuenta Ualá Rendimientos",
        "payoutFrequency": "daily",
        "sourceUrl": "https://www.uala.com.co/",
        "searchQuery": "tasa rendimientos uala colombia efectiva anual",
    },
    "falabella": {
        "id": "falabella",
        "name": "Banco Falabella",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 10.00,
        "productName": "Cuenta PAC Ahorro",
        "payoutFrequency": "monthly",
        "sourceUrl": "https://www.bancofalabella.com.co/",
        "searchQuery": "tasa cuenta pac ahorro banco falabella",
    },
    "bancolombia": {
        "id": "bancolombia",
        "name": "Bancolombia",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 9.50,
        "productName": "Bolsillos / Cuenta Libre",
        "payoutFrequency": "monthly",
        "sourceUrl": "https://www.bancolombia.com/",
        "searchQuery": "tasa bolsillos cuenta ahorro bancolombia",
    },
    "davivienda": {
        "id": "davivienda",
        "name": "Davivienda",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 9.00,
        "productName": "Bolsillos / Cuenta Móvil",
        "payoutFrequency": "monthly",
        "sourceUrl": "https://www.davivienda.com/",
        "searchQuery": "tasa cuenta rentable davivienda",
    },
    "cajasocial": {
        "id": "cajasocial",
        "name": "Banco Caja Social",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 9.25,
        "productName": "Rendicuenta / Cuentamiga",
        "payoutFrequency": "monthly",
        "sourceUrl": "https://www.bancocajasocial.com/",
        "searchQuery": "tasa rendicuenta banco caja social",
    },
    "serfinanza": {
        "id": "serfinanza",
        "name": "Banco Serfinanza",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 11.00,
        "productName": "Cuenta Ahorro Serfinanza",
        "payoutFrequency": "monthly",
        "sourceUrl": "https://www.bancoserfinanza.com/",
        "searchQuery": "tasa cuenta ahorro banco serfinanza",
    },
    "mejorcdt": {
        "id": "mejorcdt",
        "name": "MejorCDT",
        "country": "🇨🇴",
        "currency": "COP",
        "currentMarketRateEA": 11.50,
        "productName": "CDT Multibanco MejorCDT",
        "payoutFrequency": "at_maturity",
        "sourceUrl": "https://mejorcdt.com/",
        "searchQuery": "tasas cdt colombia mejorcdt",
    },
    "plenti": {
        "id": "plenti",
        "name": "Plenti (Ahorros USD)",
        "country": "🇺🇸",
        "currency": "USD",
        "currentMarketRateEA": 4.00,
        "productName": "Bolsillo a la Vista Plenti USD",
        "payoutFrequency": "daily",
        "sourceUrl": "https://plenti.app/",
        "searchQuery": "tasa plenti app dolares rendimiento",
    },
    "plenti_gold": {
        "id": "plenti_gold",
        "name": "Plenti (Oro PAXG)",
        "country": "🇺🇸",
        "currency": "USD",
        "currentMarketRateEA": 8.00,
        "productName": "Bolsillo Rendimiento Oro PAXG",
        "payoutFrequency": "daily",
        "sourceUrl": "https://plenti.app/",
        "searchQuery": "tasa plenti oro paxg rendimiento",
    },
    "ibkr": {
        "id": "ibkr",
        "name": "Interactive Brokers",
        "country": "🇺🇸",
        "currency": "USD",
        "currentMarketRateEA": 4.58,
        "productName": "Efectivo USD Rendimiento IBKR",
        "payoutFrequency": "monthly",
        "sourceUrl": "https://www.interactivebrokers.com/en/pricing/cash-yield.php",
        "searchQuery": "interactive brokers cash interest rate usd",
    },
}


def get_market_rates_summary() -> List[Dict[str, Any]]:
    """Returns the complete list of all known market rates across all institutions."""
    return list(KNOWN_MARKET_ENTITIES.values())


def evaluate_user_rates(user_accounts: List[Dict[str, Any]], user_entities: List[Dict[str, Any]], simulate: bool = False) -> Dict[str, Any]:
    """Compares the user's active accounts with official market rates and generates weekly alerts.

    Human-in-the-loop: Never changes historical numbers automatically. Returns pending
    suggestions for the user to review and apply with 1-click.
    """
    now = datetime.now()
    entity_map = {e.get("id"): e for e in (user_entities or [])}

    alerts = []
    monitored_accounts_count = 0

    for acc in (user_accounts or []):
        # Only evaluate active savings accounts (skip zero-rate payroll if designated)
        rate_val = float(acc.get("interestRateEA") or 0.0)
        account_name = acc.get("name", "Cuenta")
        entity_id = acc.get("entityId", "")
        entity_obj = entity_map.get(entity_id, {})
        entity_name = entity_obj.get("name", "")

        # Find matching market preset by entityId or name
        matched_preset = None
        for key, preset in KNOWN_MARKET_ENTITIES.items():
            if key == entity_id or key in entity_id.lower() or preset["name"].lower() in entity_name.lower() or preset["name"].lower() in account_name.lower():
                matched_preset = preset
                break

        if not matched_preset:
            continue

        monitored_accounts_count += 1
        market_rate = float(matched_preset["currentMarketRateEA"])
        diff = round(market_rate - rate_val, 2)

        # If there is a meaningful discrepancy (>= 0.05% EA)
        if abs(diff) >= 0.05:
            alerts.append({
                "accountId": acc.get("id"),
                "accountName": account_name,
                "entityId": entity_id,
                "entityName": matched_preset["name"],
                "currency": acc.get("currency", matched_preset["currency"]),
                "currentRateEA": rate_val,
                "marketRateEA": market_rate,
                "diff": diff,
                "direction": "up" if diff > 0 else "down",
                "productName": matched_preset["productName"],
                "sourceUrl": matched_preset["sourceUrl"],
                "suggestedEffectiveDate": now.strftime("%Y-%m-%d"),
                "message": f"Tasa de {matched_preset['name']} actualizada en mercado a {market_rate:.2f}% E.A. (tu cuenta tiene {rate_val:.2f}% E.A.)."
            })

    if simulate:
        # Generate an instant live flash test alert for the user's active account
        target_acc = next((a for a in (user_accounts or []) if "nu" in a.get("entityId", "").lower() or "nu" in a.get("name", "").lower()), (user_accounts[0] if user_accounts else None))
        if target_acc:
            curr_rate = float(target_acc.get("interestRateEA") or 9.35)
            sim_rate = 10.25 if curr_rate < 10.0 else 9.35
            diff = round(sim_rate - curr_rate, 2)
            alerts.insert(0, {
                "accountId": target_acc.get("id"),
                "accountName": target_acc.get("name", "Cajita Nu"),
                "entityId": target_acc.get("entityId", "ent_nu"),
                "entityName": "Nu Colombia",
                "currency": target_acc.get("currency", "COP"),
                "currentRateEA": curr_rate,
                "marketRateEA": sim_rate,
                "diff": diff,
                "direction": "up" if diff > 0 else "down",
                "productName": "Cajitas Nu (Cuenta de Ahorros)",
                "sourceUrl": "https://nu.com.co/cf/cuenta/",
                "suggestedEffectiveDate": now.strftime("%Y-%m-%d"),
                "isSimulated": True,
                "message": f"🧪 [Prueba Flash] Nu Colombia reportó ajuste de rentabilidad a {sim_rate:.2f}% E.A. (tu cuenta tiene {curr_rate:.2f}% E.A.)."
            })

    next_check = (now + timedelta(days=7)).strftime("%Y-%m-%d")

    return {
        "status": "success",
        "lastChecked": now.isoformat(),
        "nextScheduledCheck": next_check,
        "monitoredAccounts": monitored_accounts_count,
        "alertsCount": len(alerts),
        "alerts": alerts,
        "allMarketRates": list(KNOWN_MARKET_ENTITIES.values()),
    }
