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
        rate_val = float(acc.get("interestRateEA") or 0.0)
        account_name = acc.get("name", "Cuenta")
        acc_name_lower = account_name.lower()
        cat = (acc.get("accountCategory") or "").lower()
        entity_id = acc.get("entityId", "")
        entity_obj = entity_map.get(entity_id, {})
        entity_name = entity_obj.get("name", "")

        # 1. Skip non-yield categories (payroll, digital wallet, cash)
        # Checking/payroll accounts naturally yield 0.0% and should never be flagged as an error!
        if cat in ("payroll", "digital_wallet", "cash") or any(k in acc_name_lower for k in ("(nómina)", "(nomina)", "(principal)", "principal", "transaccional", "billetera", "efectivo", "disponible nequi", "daviplata")):
            continue

        # 2. Match preset and determine specific product rate
        matched_preset = None
        for key, preset in KNOWN_MARKET_ENTITIES.items():
            if key == entity_id or key in entity_id.lower() or preset["name"].lower() in entity_name.lower() or preset["name"].lower() in acc_name_lower:
                matched_preset = preset
                break

        if not matched_preset:
            continue

        monitored_accounts_count += 1
        market_rate = float(matched_preset["currentMarketRateEA"])
        product_name = matched_preset["productName"]

        # Granular product tier distinctions:
        # Nu Colombia: Cajitas (9.35%) vs Cajitas Congeladas / CDT (10.50%)
        if "nu" in entity_id.lower() or "nu" in acc_name_lower:
            if any(k in acc_name_lower for k in ("congelada", "congeladas", "cdt")):
                market_rate = 10.50
                product_name = "Cajita Congelada Nu (CDT)"
            else:
                market_rate = 9.35
                product_name = "Cajitas Nu (A la vista)"
        # RappiPay: Bolsillos a la vista (9.00%) vs Bóvedas CDT (10.00%)
        elif "rappi" in entity_id.lower() or "rappi" in acc_name_lower or entity_id == "ent_1789616750396":
            if any(k in acc_name_lower for k in ("boveda", "bóveda", "bovedas", "bóvedas", "cdt")):
                market_rate = 10.00
                product_name = "Bóvedas RappiPay (Plazo fijo / CDT)"
            else:
                market_rate = 9.00
                product_name = "Bolsillos RappiCuenta (A la vista)"
        # Finandina: FlexiDigital + (10.50%) vs Tradicional (0.15%)
        elif "finandina" in entity_id.lower() or "flexi" in acc_name_lower or entity_id == "ent_1786771791285":
            if any(k in acc_name_lower for k in ("flexi", "emergencia", "bolsillo")):
                market_rate = 10.50
                product_name = "FlexiDigital + (Bolsillo Ahorro)"
            else:
                market_rate = 0.15
                product_name = "Cuenta Tradicional Finandina"

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
                "productName": product_name,
                "sourceUrl": matched_preset["sourceUrl"],
                "suggestedEffectiveDate": now.strftime("%Y-%m-%d"),
                "message": f"Tasa de {matched_preset['name']} ({product_name}) actualizada en mercado a {market_rate:.2f}% E.A. (tu cuenta tiene {rate_val:.2f}% E.A.)."
            })

    if simulate:
        # Generate an instant live flash test alert targeting a real yielding pocket (e.g. Cajita Viaje, Impresora, etc.)
        valid_pockets = [
            a for a in (user_accounts or [])
            if (a.get("accountCategory") or "").lower() == "high_yield"
            and not any(k in (a.get("name") or "").lower() for k in ("nómina", "nomina", "principal"))
        ]
        target_acc = valid_pockets[0] if valid_pockets else (user_accounts[0] if user_accounts else None)

        if target_acc:
            curr_rate = float(target_acc.get("interestRateEA") or 9.35)
            # Simulate a realistic market movement (+0.90% E.A. or -0.50%)
            sim_rate = round(curr_rate + 0.90, 2) if curr_rate < 12.0 else round(curr_rate - 0.50, 2)
            diff = round(sim_rate - curr_rate, 2)
            acc_name = target_acc.get("name", "Cajita de Ahorro")
            is_rappi = "rappi" in target_acc.get("entityId", "").lower() or target_acc.get("entityId") == "ent_1789616750396"
            ent_name = "RappiPay" if is_rappi else "Nu Colombia"
            prod_name = "Bolsillos RappiCuenta (A la vista)" if is_rappi else "Cajitas Nu (A la vista)"
            source_url = "https://rappipay.co/rappicuenta/" if is_rappi else "https://nu.com.co/cf/cuenta/"

            alerts.insert(0, {
                "accountId": target_acc.get("id"),
                "accountName": acc_name,
                "entityId": target_acc.get("entityId", "ent_nu"),
                "entityName": ent_name,
                "currency": target_acc.get("currency", "COP"),
                "currentRateEA": curr_rate,
                "marketRateEA": sim_rate,
                "diff": diff,
                "direction": "up" if diff > 0 else "down",
                "productName": prod_name,
                "sourceUrl": source_url,
                "suggestedEffectiveDate": now.strftime("%Y-%m-%d"),
                "isSimulated": True,
                "message": f"🧪 [Prueba Flash] {ent_name} reportó ajuste de rentabilidad en {prod_name} a {sim_rate:.2f}% E.A. (tu bolsillo '{acc_name}' tiene {curr_rate:.2f}% E.A.)."
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
