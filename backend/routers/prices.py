"""
/api/prices  — Live quotes & intraday endpoint.
/api/tickers — Ticker search/validation endpoint.
"""

import datetime
import time
import time as time_module
import pandas as pd
import yfinance as yf
from fastapi import APIRouter, Query
from services.db import get_market_indices_history_db, save_market_indices_history_db
from services.market_data import DEFAULT_TICKERS, get_intraday, get_live_quotes, get_ticker_meta, is_ticker_market_open


def get_yf_ticker(ticker: str) -> yf.Ticker:
    return yf.Ticker(ticker)


router = APIRouter(tags=["Prices"])


@router.get("/prices/live")
def live_quotes(
    tickers: str = Query(
        default=",".join(DEFAULT_TICKERS),
        description="Comma-separated list of tickers",
    ),
):
    """
    Returns current price, daily change and % change for each ticker.
    Data is cached for 60 seconds to avoid rate-limiting Yahoo Finance.
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    return get_live_quotes(ticker_list)


@router.get("/prices/intraday/{ticker}")
def intraday(ticker: str, date: str | None = None):
    """
    Returns 5-minute intraday candles for the given date (YYYY-MM-DD) or current trading day.
    Useful for the Live mode sparkline chart and calendar historical day inspector.
    """
    return get_intraday(ticker.upper(), target_date=date)


_indices_cache = {}
_indices_cache_ts = 0.0
INDICES_TTL = 86400 * 7  # 7 days TTL for daily index history cache

_hist_price_cache: dict[str, tuple[float, dict]] = {}
HIST_PRICE_TTL = 86400 * 7  # 7 days


@router.get("/prices/indices_history")
def indices_history(start_date: str = Query("2020-01-01", description="Start date in YYYY-MM-DD")):
    """
    Returns daily historical prices for S&P 500 and NASDAQ from start_date to today.
    Reads and persists directly against Supabase PostgreSQL (`market_indices_history`).
    """
    global _indices_cache, _indices_cache_ts
    now = time.time()

    if not _indices_cache:
        db_indices = get_market_indices_history_db("2015-01-01")
        if db_indices:
            _indices_cache = db_indices
            _indices_cache_ts = now

    today_date = datetime.date.today()
    expected_date = today_date
    if expected_date.weekday() == 5:  # Saturday -> Friday
        expected_date -= datetime.timedelta(days=1)
    elif expected_date.weekday() == 6:  # Sunday -> Friday
        expected_date -= datetime.timedelta(days=2)
    expected_str = expected_date.isoformat()

    max_cached_date = max(_indices_cache.keys()) if _indices_cache else ""
    needs_topup = (not _indices_cache) or (
        max_cached_date < expected_str
        and (
            now - _indices_cache_ts > 1800
            or max_cached_date < (expected_date - datetime.timedelta(days=1)).isoformat()
        )
    )

    if needs_topup:
        try:
            from services.market_data import get_historical_prices

            fetch_period = "3M" if _indices_cache else "MAX"
            df = get_historical_prices(["^GSPC", "^IXIC"], period=fetch_period, include_benchmarks=False)
            df_pd = df.to_pandas()
            df_pd["date_str"] = df_pd["date"].astype(str).str[:10]

            merged = dict(_indices_cache) if _indices_cache else {}
            new_entries = {}
            for _, row in df_pd.iterrows():
                sp_val = row.get("SP500") if "SP500" in row else row.get("^GSPC")
                nasdaq_val = row.get("NASDAQ") if "NASDAQ" in row else row.get("^IXIC")
                sp_clean = float(sp_val) if sp_val is not None and not pd.isna(sp_val) else None
                nd_clean = float(nasdaq_val) if nasdaq_val is not None and not pd.isna(nasdaq_val) else None
                if sp_clean or nd_clean:
                    entry = {
                        "SP500": sp_clean,
                        "NASDAQ": nd_clean,
                    }
                    merged[row["date_str"]] = entry
                    if row["date_str"] >= "2015-01-01":
                        new_entries[row["date_str"]] = entry

            if merged:
                _indices_cache = merged
                _indices_cache_ts = now
                if new_entries:
                    save_market_indices_history_db(new_entries)
        except Exception as exc:
            print(f"[INDICES] Warning topping up indices_history: {exc}")
            _indices_cache_ts = now

    return {k: v for k, v in _indices_cache.items() if k >= start_date}


@router.get("/prices/historical/{ticker}")
def historical_price(
    ticker: str,
    date: str = Query(..., description="Date in YYYY-MM-DD"),
    time: str | None = Query(None, description="Time in HH:MM (e.g. 08:00 or 09:30)"),
):
    """
    Returns the historical closing or intraday price of the ticker on the specified date (and optional time).
    If time is specified, searches intraday 5m/1m candles for the closest tick to that execution time.
    If the date is a weekend/holiday, returns the closest previous trading day's close.
    """
    ticker_clean = ticker.strip().upper()
    time_val = str(time).strip() if (time is not None and not hasattr(time, "default") and str(time) != "PydanticUndefined") else None
    time_clean = time_val if (time_val and time_val != "None") else None
    cache_key = f"{ticker_clean}:{date}:{time_clean or 'close'}"
    cached = _hist_price_cache.get(cache_key)
    if cached and (time_module.time() - cached[0] < HIST_PRICE_TTL):
        return cached[1]
    try:
        t = get_yf_ticker(ticker_clean)
        target_date = datetime.datetime.strptime(date, "%Y-%m-%d")

        if time_clean:
            try:
                start_dt = target_date - datetime.timedelta(days=1)
                end_dt = target_date + datetime.timedelta(days=2)
                df_intra = t.history(
                    start=start_dt.strftime("%Y-%m-%d"),
                    end=end_dt.strftime("%Y-%m-%d"),
                    interval="5m",
                )
                if not df_intra.empty:
                    df_intra["day_str"] = df_intra.index.strftime("%Y-%m-%d")
                    df_day = df_intra[df_intra["day_str"] == date]
                    if df_day.empty:
                        df_day = df_intra

                    target_dt = pd.to_datetime(f"{date} {time_clean}").tz_localize(df_day.index.tz)
                    idx = df_day.index.get_indexer([target_dt], method="nearest")[0]
                    matched_row = df_day.iloc[idx]
                    matched_time = df_day.index[idx].strftime("%H:%M")
                    price_val = float(matched_row["Open"]) if not pd.isna(matched_row["Open"]) else float(matched_row["Close"])

                    result = {
                        "ticker": ticker_clean,
                        "requested_date": date,
                        "requested_time": time_clean,
                        "actual_date": df_day.index[idx].strftime("%Y-%m-%d"),
                        "actual_time": matched_time,
                        "price": round(price_val, 4),
                        "source": "intraday",
                    }
                    _hist_price_cache[cache_key] = (time_module.time(), result)
                    return result
            except Exception as intra_exc:
                print(f"Intraday lookup fallback to daily for {ticker_clean}: {intra_exc}")

        end_date = target_date + datetime.timedelta(days=1)
        start_date = target_date - datetime.timedelta(days=7)

        df = t.history(start=start_date.strftime("%Y-%m-%d"), end=end_date.strftime("%Y-%m-%d"))
        if not df.empty:
            if time_clean and time_clean <= "09:30" and "Open" in df.columns:
                target_day_rows = df[df.index.strftime("%Y-%m-%d") == date]
                if not target_day_rows.empty:
                    chosen_price = target_day_rows["Open"].iloc[0]
                    actual_date = target_day_rows.index[0].strftime("%Y-%m-%d")
                else:
                    chosen_price = df["Close"].iloc[-1]
                    actual_date = df.index[-1].strftime("%Y-%m-%d")
            else:
                chosen_price = df["Close"].iloc[-1]
                actual_date = df.index[-1].strftime("%Y-%m-%d")

            result = {
                "ticker": ticker_clean,
                "requested_date": date,
                "requested_time": time_clean,
                "actual_date": actual_date,
                "actual_time": time_clean or "close",
                "price": round(float(chosen_price), 4),
                "source": "daily",
            }
            _hist_price_cache[cache_key] = (time_module.time(), result)
            return result
        else:
            return {"error": "No historical data found for this date range."}
    except Exception as exc:
        return {"error": str(exc)}


@router.get("/tickers/search")
def search_ticker(
    q: str = Query(..., min_length=1, description="Ticker symbol or company name"),
):
    ticker_clean = q.strip().upper()
    meta = get_ticker_meta(ticker_clean)

    try:
        t = get_yf_ticker(ticker_clean)
        info = t.info
        last_price = (
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or getattr(t.fast_info, "last_price", 0.0)
        )
        exchange = meta.get("exchange") or info.get("exchange") or "US"
        return {
            "ticker": ticker_clean,
            "name": meta.get("name")
            or info.get("longName")
            or info.get("shortName")
            or ticker_clean,
            "sector": meta.get("sector")
            or info.get("sector")
            or info.get("industry")
            or "Tecnología",
            "exchange": exchange,
            "currency": info.get("currency") or "USD",
            "quoteType": info.get("quoteType") or "EQUITY",
            "price": round(last_price or 0.0, 2),
            "market_open": is_ticker_market_open(ticker_clean, exchange),
            "valid": last_price is not None,
        }
    except Exception as exc:
        return {
            "ticker": ticker_clean,
            "name": meta.get("name", ticker_clean),
            "sector": meta.get("sector", "Tecnología"),
            "exchange": "US",
            "currency": "USD",
            "quoteType": "EQUITY",
            "market_open": False,
            "valid": False,
            "error": str(exc),
        }


@router.get("/tickers/search_multiple")
def search_tickers_multiple(
    q: str = Query(..., min_length=1, description="Ticker symbol or company name"),
):
    import requests
    import urllib3

    urllib3.disable_warnings()

    clean_q = q.strip().upper()
    queries_to_try = [q.strip()]

    if clean_q.endswith(".UK"):
        base = clean_q[:-3]
        queries_to_try.insert(0, f"{base}.L")
    elif clean_q.endswith(".DE"):
        base = clean_q[:-3]
        queries_to_try.insert(0, f"{base}.F")
    elif clean_q.endswith(".FR"):
        base = clean_q[:-3]
        queries_to_try.insert(0, f"{base}.PA")
    elif clean_q.endswith(".NL"):
        base = clean_q[:-3]
        queries_to_try.insert(0, f"{base}.AS")
    elif clean_q.endswith(".ES"):
        base = clean_q[:-3]
        queries_to_try.insert(0, f"{base}.MC")

    quotes = []
    seen_symbols = set()

    for try_q in queries_to_try:
        try:
            res = requests.get(
                f"https://query2.finance.yahoo.com/v1/finance/search?q={try_q}",
                headers={"User-Agent": "Mozilla/5.0"},
                verify=False,
                timeout=5,
            ).json()
            for item in res.get("quotes", []):
                sym = item.get("symbol")
                if sym and sym not in seen_symbols:
                    seen_symbols.add(sym)
                    quotes.append(item)
        except Exception:
            pass

    valid_quotes = [q for q in quotes if q.get("symbol")]

    results = []
    for quote in valid_quotes[:6]:
        sym = quote["symbol"]
        try:
            t = get_yf_ticker(sym)
            info = t.info
            last_price = (
                info.get("currentPrice")
                or info.get("regularMarketPrice")
                or getattr(t.fast_info, "last_price", 0.0)
            )

            exchange = info.get("exchange") or quote.get("exchange") or "US"
            results.append(
                {
                    "ticker": sym,
                    "name": info.get("longName")
                    or info.get("shortName")
                    or quote.get("longname")
                    or quote.get("shortname")
                    or sym,
                    "sector": info.get("sector")
                    or info.get("industry")
                    or quote.get("sectorDisp")
                    or "Tecnología",
                    "exchange": exchange,
                    "currency": info.get("currency") or quote.get("currency") or "USD",
                    "quoteType": info.get("quoteType") or quote.get("quoteType") or "EQUITY",
                    "price": round(last_price or 0.0, 2),
                    "market_open": is_ticker_market_open(sym, exchange),
                    "valid": last_price is not None,
                }
            )
        except Exception:
            ex = quote.get("exchange") or "US"
            results.append(
                {
                    "ticker": sym,
                    "name": quote.get("longname") or quote.get("shortname") or sym,
                    "sector": quote.get("sectorDisp") or "Tecnología",
                    "exchange": ex,
                    "currency": "USD",
                    "quoteType": quote.get("quoteType") or "EQUITY",
                    "price": 0.0,
                    "market_open": is_ticker_market_open(sym, ex),
                    "valid": False,
                }
            )
    return {"results": results}


@router.get("/prices/supervisor-test")
def supervisor_test():
    return {"status": "ok", "test": True}
