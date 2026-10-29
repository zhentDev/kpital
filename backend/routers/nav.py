"""
/api/nav — Historical portfolio NAV endpoint.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Query, Request
from services.auth import get_optional_current_user
from services.db import get_all_rebalances
from services.market_data import get_historical_prices
from services.nav_engine import calculate_nav

router = APIRouter(tags=["NAV"])

# Map UI period codes to approximate timedelta offsets
_PERIOD_DELTAS = {
    "1W": timedelta(weeks=1),
    "1M": timedelta(days=30),
    "3M": timedelta(days=90),
    "6M": timedelta(days=180),
    "1Y": timedelta(days=365),
    "3Y": timedelta(days=365 * 3),
    "5Y": timedelta(days=365 * 5),
    "MAX": timedelta(days=365 * 30),  # effectively "all history"
}


@router.get("/nav")
def nav_endpoint(
    request: Request,
    period: str = "1Y",
    investment: float = 2000.0,
    num_slots: int = 15,
    selected_tickers: str | None = None,
    strategy_id: str = "historical",
):
    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    rebalances = get_all_rebalances(strategy_id=strategy_id, user_id=user_id)
    if not rebalances:
        return calculate_nav(None, investment=investment, num_slots=num_slots, strategy_id=strategy_id, user_id=user_id)

    # Parse selected tickers list
    selected_list = None
    if selected_tickers and isinstance(selected_tickers, str):
        selected_list = [t.strip().upper() for t in selected_tickers.split(",") if t.strip()]

    # Collect all unique tickers ever held in the portfolio
    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r["tickers"])

    ticker_list = list(all_tickers)
    earliest_rebal = min([r["date"] for r in rebalances]) if rebalances else None

    # Compute period-aware start date:
    # Use the LATER of (earliest_rebal, today - period_delta) so that
    # short periods (1W, 1M) return fewer data points instead of the full history.
    # For 1D, we don't pass start_date so get_historical_prices downloads 1d with 1h interval.
    is_intraday = period.upper() == "1D"
    if is_intraday:
        effective_start = None
    else:
        period_delta = _PERIOD_DELTAS.get(period.upper(), _PERIOD_DELTAS["1Y"])
        period_start_str = (date.today() - period_delta).isoformat()
        if earliest_rebal:
            # Always simulate from earliest_rebal so trades, cost bases, and closed positions are 100% accurate
            effective_start = earliest_rebal
        else:
            effective_start = period_start_str

    prices_df = get_historical_prices(ticker_list, period=period, start_date=effective_start)

    result = calculate_nav(
        prices_df,
        investment=investment,
        num_slots=num_slots,
        selected_tickers=selected_list,
        strategy_id=strategy_id,
        user_id=user_id,
        period=period,
    )
    return result


@router.get("/nav/export/excel")
def export_nav_excel(
    request: Request,
    period: str = "MAX",
    investment: float = 2000.0,
    num_slots: int = 15,
    selected_tickers: str | None = None,
    strategy_id: str = "historical",
):
    from fastapi.responses import StreamingResponse
    from services.excel_exporter import generate_portfolio_excel
    from services.db import get_custom_strategies

    user = get_optional_current_user(request)
    user_id = user["sub"] if user else None
    
    # 1. Determinar el nombre formal de la estrategia seleccionada
    custom_list = get_custom_strategies(user_id=user_id)
    strat_meta = next((s for s in custom_list if s["id"] == strategy_id), None)
    if strat_meta:
        strategy_name = strat_meta.get("name") or "Estrategia Personalizada"
    elif strategy_id == "historical":
        strategy_name = "Titanes Tecnológicos"
    else:
        strategy_name = strategy_id

    rebalances = get_all_rebalances(strategy_id=strategy_id, user_id=user_id)
    if not rebalances:
        empty_res = calculate_nav(None, investment=investment, num_slots=num_slots, strategy_id=strategy_id, user_id=user_id)
        excel_stream = generate_portfolio_excel(empty_res, investment=investment, strategy_name=strategy_name)
        return StreamingResponse(
            excel_stream,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={strategy_name.replace(' ', '_')}_Reporte.xlsx"},
        )

    all_tickers = set()
    for r in rebalances:
        all_tickers.update(r["tickers"])
    ticker_list = list(all_tickers)
    earliest_rebal = min([r["date"] for r in rebalances]) if rebalances else None

    selected_list = None
    if selected_tickers and isinstance(selected_tickers, str):
        selected_list = [t.strip().upper() for t in selected_tickers.split(",") if t.strip()]

    prices_df = get_historical_prices(ticker_list, period="MAX", start_date=earliest_rebal)
    nav_res = calculate_nav(
        prices_df,
        investment=investment,
        num_slots=num_slots,
        selected_tickers=selected_list,
        strategy_id=strategy_id,
        user_id=user_id,
        period="MAX",
    )

    # 2. Generar datos para la Hoja 4: Comparativa de todas las estrategias (Reales vs Simuladas)
    comparison_data = []
    
    # Agregamos primero la estrategia histórica (Titanes Tech)
    hist_rebalances = get_all_rebalances(strategy_id="historical", user_id=user_id)
    if hist_rebalances:
        hist_tickers = list({t for r in hist_rebalances for t in r["tickers"]})
        hist_start = min([r["date"] for r in hist_rebalances]) if hist_rebalances else None
        hist_prices = get_historical_prices(hist_tickers, period="MAX", start_date=hist_start)
        hist_nav = calculate_nav(hist_prices, investment=2000.0, num_slots=15, strategy_id="historical", user_id=user_id, period="MAX")
        hist_sum = hist_nav.get("summary", {})
        comparison_data.append({
            "id": "historical",
            "name": "Titanes Tech",
            "country": "🏆",
            "is_real_money": True,
            "num_slots": 15,
            "capital": 2000.0,
            "active_invested": hist_sum.get("active_invested", 0),
            "end_value": hist_sum.get("active_stock_value", hist_sum.get("end_value", 0)),
            "active_return": hist_sum.get("active_return", 0),
            "active_return_pct": hist_sum.get("active_return_pct", 0),
            "alpha_sp500": hist_sum.get("alpha_sp500", 0),
            "sharpe_ratio": hist_sum.get("sharpe_ratio", "N/A"),
            "win_rate_pct": hist_sum.get("win_rate_pct", 0),
            "closed_count": len(hist_nav.get("closed_holdings", [])),
        })

    # Agregamos cada estrategia personalizada registrada (reales y simuladas)
    for c_strat in custom_list:
        c_id = c_strat["id"]
        c_rebalances = get_all_rebalances(strategy_id=c_id, user_id=user_id)
        if not c_rebalances:
            continue
        c_tickers = list({t for r in c_rebalances for t in r["tickers"]})
        c_start = min([r["date"] for r in c_rebalances]) if c_rebalances else None
        c_prices = get_historical_prices(c_tickers, period="MAX", start_date=c_start)
        c_nav = calculate_nav(
            c_prices,
            investment=float(c_strat.get("capital") or 1000.0),
            num_slots=int(c_strat.get("numSlots") or 20),
            strategy_id=c_id,
            user_id=user_id,
            period="MAX",
        )
        c_sum = c_nav.get("summary", {})
        comparison_data.append({
            "id": c_id,
            "name": c_strat.get("name", c_id),
            "country": c_strat.get("country", "🌎"),
            "is_real_money": bool(c_strat.get("isRealMoney")),
            "num_slots": int(c_strat.get("numSlots") or 20),
            "capital": float(c_strat.get("capital") or 1000.0),
            "active_invested": c_sum.get("active_invested", 0),
            "end_value": c_sum.get("active_stock_value", c_sum.get("end_value", 0)),
            "active_return": c_sum.get("active_return", 0),
            "active_return_pct": c_sum.get("active_return_pct", 0),
            "alpha_sp500": c_sum.get("alpha_sp500", 0),
            "sharpe_ratio": c_sum.get("sharpe_ratio", "N/A"),
            "win_rate_pct": c_sum.get("win_rate_pct", 0),
            "closed_count": len(c_nav.get("closed_holdings", [])),
        })

    excel_stream = generate_portfolio_excel(
        nav_res,
        investment=investment,
        strategy_name=strategy_name,
        comparison_data=comparison_data,
    )
    safe_name = "".join(c for c in strategy_name if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
    filename = f"{safe_name}_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        excel_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/nav/holding-chart")
def get_holding_hourly_chart(
    ticker: str,
    start_date: str,
    exit_date: str | None = None,
    shares: float = 1.0,
    cost_basis: float = 100.0,
    entry_price: float = 100.0,
):
    """
    Returns hourly (1h) price history and position valuation for a single holding
    (active or closed) between its entry date and exit date (or current day).
    Calculates pure asset value = shares * price and base line = cost_basis.
    """
    import datetime
    import yfinance as yf
    import pandas as pd
    from services.market_data import _yf_session

    ticker_clean = ticker.strip().upper()
    start_d = str(start_date).slice if hasattr(start_date, "slice") else str(start_date)[:10]
    
    # Calculate end date for yfinance download
    if exit_date and str(exit_date).strip() and str(exit_date) != "None":
        exit_d = str(exit_date)[:10]
        try:
            # yfinance end date is exclusive, so add 1 day
            end_dt = datetime.date.fromisoformat(exit_d) + datetime.timedelta(days=1)
            end_d = end_dt.isoformat()
        except Exception:
            end_d = None
    else:
        end_d = None
        exit_d = None

    download_kwargs = {
        "start": start_d,
        "interval": "1h",
        "auto_adjust": True,
        "progress": False,
        "threads": False,
        "session": _yf_session,
    }

    try:
        raw_df = yf.download(ticker_clean, **download_kwargs)
        if isinstance(raw_df.columns, pd.MultiIndex):
            df = raw_df.xs(ticker_clean, level="Ticker", axis=1).copy() if "Ticker" in raw_df.columns.names else raw_df.droplevel(1, axis=1).copy()
        else:
            df = raw_df.copy()

        # If 1h interval returned empty (e.g. beyond 730 days limit), fallback to daily
        if df.empty:
            del download_kwargs["interval"]
            raw_df = yf.download(ticker_clean, **download_kwargs)
            if isinstance(raw_df.columns, pd.MultiIndex):
                df = raw_df.xs(ticker_clean, level="Ticker", axis=1).copy() if "Ticker" in raw_df.columns.names else raw_df.droplevel(1, axis=1).copy()
            else:
                df = raw_df.copy()

        series = []
        candles = []
        shares_flt = float(shares) if float(shares) > 0 else 1.0
        basis_flt = float(cost_basis) if float(cost_basis) > 0 else (shares_flt * float(entry_price))

        exit_point = None
        exit_date_str = str(exit_d) if exit_d else None

        for idx_time, row in df.iterrows():
            close_val = row.get("Close")
            if pd.isna(close_val) or close_val is None or float(close_val) <= 0:
                continue
            close_flt = float(close_val)
            open_flt = float(row.get("Open", close_flt))
            high_flt = float(row.get("High", max(open_flt, close_flt)))
            low_flt = float(row.get("Low", min(open_flt, close_flt)))

            # UNIX timestamp in seconds
            ts = int(pd.to_datetime(idx_time).timestamp())
            iso_date = pd.to_datetime(idx_time).strftime("%Y-%m-%d %H:%M")
            date_prefix = pd.to_datetime(idx_time).strftime("%Y-%m-%d")

            # Pure position valuation: shares * price
            val = round(shares_flt * close_flt, 4)
            ret_pct = round(((val - basis_flt) / basis_flt) * 100, 2) if basis_flt > 0 else 0.0

            pt_dict = {
                "time": ts,
                "date": iso_date,
                "price": round(close_flt, 4),
                "value": val,
                "return_pct": ret_pct,
            }
            series.append(pt_dict)

            candles.append({
                "time": ts,
                "open": round(open_flt, 4),
                "high": round(high_flt, 4),
                "low": round(low_flt, 4),
                "close": round(close_flt, 4),
            })

            # Detect the exact exit point on the day of the sale
            if exit_date_str and date_prefix <= exit_date_str:
                exit_point = pt_dict

        latest_price = series[-1]["price"] if series else float(entry_price)
        latest_val = series[-1]["value"] if series else basis_flt
        total_ret_usd = round(latest_val - basis_flt, 2)
        total_ret_pct = round(((latest_val - basis_flt) / basis_flt) * 100, 2) if basis_flt > 0 else 0.0

        exit_val = exit_point["value"] if exit_point else latest_val
        exit_price_val = exit_point["price"] if exit_point else latest_price
        exit_ret_usd = round(exit_val - basis_flt, 2)
        exit_ret_pct = round(((exit_val - basis_flt) / basis_flt) * 100, 2) if basis_flt > 0 else 0.0

        return {
            "ticker": ticker_clean,
            "start_date": start_d,
            "exit_date": exit_d,
            "exit_time": exit_point["time"] if exit_point else None,
            "exit_price": round(exit_price_val, 4),
            "exit_value": round(exit_val, 2),
            "exit_return_usd": exit_ret_usd,
            "exit_return_pct": exit_ret_pct,
            "is_closed": bool(exit_d),
            "shares": shares_flt,
            "cost_basis": round(basis_flt, 2),
            "entry_price": round(float(entry_price), 4),
            "current_price": round(latest_price, 4),
            "current_value": round(latest_val, 2),
            "return_usd": total_ret_usd,
            "return_pct": total_ret_pct,
            "points_count": len(series),
            "series": series,
            "candles": candles,
        }
    except Exception as e:
        return {
            "error": str(e),
            "ticker": ticker_clean,
            "start_date": start_d,
            "series": [],
            "candles": [],
        }



