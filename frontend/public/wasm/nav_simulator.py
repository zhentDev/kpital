"""
WASM Portfolio Simulator Kernel (MicroPython compatible)
Simula el NAV y rendimiento acumulado de una selección dinámica de tickers
sin dependencias externas pesadas (código puro, ultra eficiente en WASM).
"""

import json

def simulate_portfolio(payload_str):
    """
    payload_str: JSON string con la estructura:
    {
      "investment": 2000.0,
      "num_slots": 15,
      "selected_tickers": ["ON", "HPQ", ...],
      "ticker_series": {
         "ON": [{"date": "2026-08-03", "factor": 1.0, "value": 100.0}, ...],
         ...
      }
    }
    """
    try:
        data = json.loads(payload_str)
    except Exception as e:
        return json.dumps({"error": f"Invalid JSON payload: {str(e)}"})

    investment = float(data.get("investment", 2000.0))
    num_slots = int(data.get("num_slots", 15))
    selected_tickers = set(data.get("selected_tickers", []))
    ticker_series = data.get("ticker_series", {})

    if not ticker_series or not selected_tickers:
        return json.dumps({
            "nav": [],
            "metrics": {
                "total_return_pct": 0.0,
                "initial_value": investment,
                "final_value": investment,
                "max_drawdown_pct": 0.0,
                "active_slots": 0,
                "points_calculated": 0
            }
        })

    active_tickers = [t for t in selected_tickers if t in ticker_series and len(ticker_series[t]) > 0]
    
    if not active_tickers:
        return json.dumps({
            "nav": [],
            "metrics": {
                "total_return_pct": 0.0,
                "initial_value": investment,
                "final_value": investment,
                "max_drawdown_pct": 0.0,
                "active_slots": 0,
                "points_calculated": 0
            }
        })

    slot_capital = investment / max(1, num_slots)
    active_invested = len(active_tickers) * slot_capital
    unallocated_cash = max(0.0, investment - active_invested)

    # Indexar factores por fecha
    date_map = {}
    all_dates = []

    for ticker in active_tickers:
        series = ticker_series[ticker]
        for pt in series:
            d = pt.get("date")
            if d is None:
                continue
            # Soporta tanto 'factor' directo como 'value'
            factor = pt.get("factor")
            if factor is None:
                val = pt.get("value", 1.0)
                factor = val
            
            if d not in date_map:
                date_map[d] = {}
                all_dates.append(d)
            
            date_map[d][ticker] = float(factor)

    all_dates.sort()

    nav_curve = []
    peak_val = -1.0
    max_drawdown = 0.0

    for d in all_dates:
        factors = date_map[d]
        stock_value = 0.0
        for ticker in active_tickers:
            factor = factors.get(ticker, 1.0)
            stock_value += slot_capital * factor

        total_val = stock_value + unallocated_cash
        
        if total_val > peak_val:
            peak_val = total_val
        elif peak_val > 0:
            dd = (peak_val - total_val) / peak_val * 100.0
            if dd > max_drawdown:
                max_drawdown = dd

        nav_curve.append({
            "time": d,
            "value": round(total_val, 2),
            "stock_value": round(stock_value, 2),
            "cash": round(unallocated_cash, 2)
        })

    initial_val = nav_curve[0]["value"] if nav_curve else investment
    final_val = nav_curve[-1]["value"] if nav_curve else investment
    total_return_pct = round(((final_val - initial_val) / initial_val) * 100.0, 2) if initial_val > 0 else 0.0

    return json.dumps({
        "nav": nav_curve,
        "metrics": {
            "initial_value": round(initial_val, 2),
            "final_value": round(final_val, 2),
            "total_return_pct": total_return_pct,
            "max_drawdown_pct": round(max_drawdown, 2),
            "active_slots": len(active_tickers),
            "points_calculated": len(nav_curve)
        }
    })
