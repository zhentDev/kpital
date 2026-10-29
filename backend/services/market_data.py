"""
Market data service using yfinance.
Provides historical OHLCV data and real-time quotes.
Cache is simple in-memory with TTL to avoid hammering Yahoo Finance.
"""

import warnings
warnings.filterwarnings("ignore")
warnings.simplefilter("ignore")

import threading
import time
from datetime import datetime, timezone
import traceback
from typing import Any, Dict

import pandas as pd
import polars as pl
import yfinance as yf
from curl_cffi import requests as cureq

_yf_session = cureq.Session(impersonate="chrome", verify=False)


def get_yf_ticker(ticker: str) -> yf.Ticker:
    return yf.Ticker(ticker, session=_yf_session)


# ──────────────────────────────────────────────
# Default portfolio & benchmarks
# ──────────────────────────────────────────────
DEFAULT_TICKERS: list[str] = [
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
]
BENCHMARKS: list[str] = ["^GSPC", "^IXIC", "IJH", "^MID"]

# Catálogo oficial de metadatos para Titanes Tecnológicos y acciones de MM20
TICKER_METADATA: dict[str, dict[str, str]] = {
    "AMD": {
        "name": "Advanced Micro Devices, Inc.",
        "sector": "Semiconductores & GPUs",
        "exchange": "NASDAQ",
    },
    "AMAT": {
        "name": "Applied Materials, Inc.",
        "sector": "Equipamiento de Semiconductores",
        "exchange": "NASDAQ",
    },
    "HPQ": {"name": "HP Inc.", "sector": "Hardware, PCs & Impresión", "exchange": "NYSE"},
    "INTC": {
        "name": "Intel Corporation",
        "sector": "Procesadores & Fabricación",
        "exchange": "NASDAQ",
    },
    "ON": {
        "name": "ON Semiconductor Corporation",
        "sector": "Semiconductores & Automoción",
        "exchange": "NASDAQ",
    },
    "ORCL": {
        "name": "Oracle Corporation",
        "sector": "Software Empresarial & Nube",
        "exchange": "NYSE",
    },
    "POWI": {
        "name": "Power Integrations, Inc.",
        "sector": "Chips de Alta Eficiencia",
        "exchange": "NASDAQ",
    },
    "QCOM": {"name": "Qualcomm Incorporated", "sector": "Chips Móviles & 5G", "exchange": "NASDAQ"},
    "TXN": {
        "name": "Texas Instruments Incorporated",
        "sector": "Semiconductores Analógicos",
        "exchange": "NASDAQ",
    },
    "MRVL": {
        "name": "Marvell Technology, Inc.",
        "sector": "Infraestructura & Centros de Datos",
        "exchange": "NASDAQ",
    },
    "HIMX": {
        "name": "Himax Technologies, Inc.",
        "sector": "Controladores de Pantalla",
        "exchange": "NASDAQ",
    },
    "NTAP": {
        "name": "NetApp, Inc.",
        "sector": "Almacenamiento Híbrido & Nube",
        "exchange": "NASDAQ",
    },
    "KD": {
        "name": "Kyndryl Holdings, Inc.",
        "sector": "Infraestructura TI & Servicios",
        "exchange": "NYSE",
    },
    "ARM": {
        "name": "Arm Holdings plc",
        "sector": "Arquitectura de Microchips",
        "exchange": "NASDAQ",
    },
    # Mid-caps MM20
    "ARLP": {
        "name": "Alliance Resource Partners",
        "sector": "Energía / Carbón",
        "exchange": "NASDAQ",
    },
    "ACLS": {"name": "Axcelis Technologies", "sector": "Semiconductores", "exchange": "NASDAQ"},
    "BHC": {"name": "Bausch Health", "sector": "Salud / Farmacéutica", "exchange": "NYSE"},
    "DIOD": {"name": "Diodes Inc", "sector": "Semiconductores", "exchange": "NASDAQ"},
    "HAE": {"name": "Haemonetics Corp", "sector": "Dispositivos Médicos", "exchange": "NYSE"},
    "NSIT": {
        "name": "Insight Enterprises",
        "sector": "Soluciones IT & Cloud",
        "exchange": "NASDAQ",
    },
    "VECO": {"name": "Veeco Instruments", "sector": "Equipamiento de Chips", "exchange": "NASDAQ"},
    "OSK": {"name": "Oshkosh Corp", "sector": "Maquinaria Industrial", "exchange": "NYSE"},
    "SM": {"name": "SM Energy", "sector": "Petróleo & Gas", "exchange": "NYSE"},
    "IJH": {
        "name": "iShares Core S&P Mid-Cap ETF",
        "sector": "Benchmark S&P MidCap 400",
        "exchange": "NYSE",
    },
    # Cripto & Oro Digital (Plenti / Exchanges)
    "XAUT-USD": {
        "name": "Tether Gold (XAUt / Plenti)",
        "sector": "Cripto / Oro Físico Tokenizado",
        "exchange": "CRYPTO",
    },
    "PAXG-USD": {
        "name": "PAX Gold (PAXG)",
        "sector": "Cripto / Oro Físico Tokenizado",
        "exchange": "CRYPTO",
    },
    "BTC-USD": {
        "name": "Bitcoin (BTC)",
        "sector": "Criptomoneda",
        "exchange": "CRYPTO",
    },
    "ETH-USD": {
        "name": "Ethereum (ETH)",
        "sector": "Criptomoneda / Smart Contracts",
        "exchange": "CRYPTO",
    },
    # ETFs y Metales Físicos (LSE / Xetra / US)
    "IPLT.L": {
        "name": "WisdomTree Physical Platinum",
        "sector": "Metales Preciosos / Platino Físico",
        "exchange": "LSE",
    },
    "SMH.L": {
        "name": "VanEck Semiconductor UCITS ETF",
        "sector": "Semiconductores Globales",
        "exchange": "LSE",
    },
    "SMH": {
        "name": "VanEck Semiconductor ETF",
        "sector": "Semiconductores",
        "exchange": "NASDAQ",
    },
    "GDX.L": {
        "name": "VanEck Gold Miners UCITS ETF",
        "sector": "Minería de Oro",
        "exchange": "LSE",
    },
    "GDX": {
        "name": "VanEck Gold Miners ETF",
        "sector": "Minería de Oro",
        "exchange": "NYSE",
    },
    "CSPX.L": {
        "name": "iShares Core S&P 500 UCITS ETF",
        "sector": "Índice S&P 500",
        "exchange": "LSE",
    },
    "CNDX.L": {
        "name": "iShares NASDAQ 100 UCITS ETF",
        "sector": "Índice NASDAQ 100",
        "exchange": "LSE",
    },
    "EMIM.L": {
        "name": "iShares Core MSCI Emerging Markets IMI ETF",
        "sector": "Mercados Emergentes",
        "exchange": "LSE",
    },
    "CNYA.L": {
        "name": "iShares MSCI China A UCITS ETF",
        "sector": "Renta Variable China A",
        "exchange": "LSE",
    },
    "KWEB.L": {
        "name": "KraneShares CSI China Internet ETF",
        "sector": "Internet & Tecnología China",
        "exchange": "LSE",
    },
    "3CP.F": {
        "name": "WisdomTree Physical Platinum (Xetra)",
        "sector": "Metales Preciosos / Platino",
        "exchange": "XETRA",
    },
    "NNND.F": {
        "name": "iShares NASDAQ 100 UCITS ETF (Xetra)",
        "sector": "Índice NASDAQ 100 EUR",
        "exchange": "XETRA",
    },
    "NVDA": {
        "name": "NVIDIA Corporation",
        "sector": "Chips & Aceleradores IA",
        "exchange": "NASDAQ",
    },
}



def get_ticker_meta(ticker: str) -> dict[str, str]:
    """Retorna el nombre completo, sector y bolsa para un símbolo dado."""
    t_clean = ticker.strip().upper()
    if t_clean in TICKER_METADATA:
        return {"ticker": t_clean, **TICKER_METADATA[t_clean]}
    try:
        t = get_yf_ticker(t_clean)
        info = getattr(t, "info", {}) or {}
        name = info.get("longName") or info.get("shortName") or t_clean
        sector = info.get("sector") or info.get("industry") or "Tecnología"
        exchange = info.get("exchange") or "US"
        return {"ticker": t_clean, "name": name, "sector": sector, "exchange": exchange}
    except Exception:
        return {"ticker": t_clean, "name": t_clean, "sector": "Tecnología", "exchange": "US"}


# ──────────────────────────────────────────────
# Redis Cache Integration
# ──────────────────────────────────────────────
import logging
import os
import pickle

import redis

try:
    _redis_host = os.environ.get("REDIS_HOST", "localhost")
    _redis_client = redis.Redis(
        host=_redis_host,
        port=6379,
        db=0,
        decode_responses=False,
        socket_connect_timeout=0.5,
        socket_timeout=0.5,
    )
    # Test connection
    _redis_client.ping()
    _use_redis = True
except Exception as e:
    logging.warning(f"Redis not available, falling back to in-memory cache. Error: {e}")
    _use_redis = False

_memory_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()
_yf_download_lock = threading.Lock()
HISTORICAL_TTL = 3600  # 1 hour for daily historical data
LIVE_TTL = 60  # 1 minute for live quotes


def _cache_get(key: str) -> object | None:
    if _use_redis:
        try:
            cached = _redis_client.get(key)
            if cached:
                return pickle.loads(cached)
            return None
        except Exception:
            pass

    # Fallback to memory
    with _cache_lock:
        if key in _memory_cache:
            ts, data = _memory_cache[key]
            ttl = LIVE_TTL if key.startswith("live:") else HISTORICAL_TTL
            if time.time() - ts < ttl:
                return data
    return None


def _cache_set(key: str, data: object, ttl: int | None = None) -> None:
    if ttl is None:
        ttl = LIVE_TTL if key.startswith("live:") else HISTORICAL_TTL
    if _use_redis:
        try:
            _redis_client.setex(key, ttl, pickle.dumps(data))
            return
        except Exception:
            pass

    # Fallback to memory
    with _cache_lock:
        _memory_cache[key] = (time.time(), data)


# ──────────────────────────────────────────────
# Historical prices
# ──────────────────────────────────────────────
PERIOD_MAP = {
    "1D": "1d",
    "1W": "1wk",
    "1M": "1mo",
    "3M": "3mo",
    "6M": "6mo",
    "1Y": "1y",
    "3Y": "3y",
    "5Y": "5y",
    "MAX": "max",
}


def get_historical_prices(
    tickers: list[str],
    period: str = "1Y",
    include_benchmarks: bool = True,
    start_date: str | None = None,
) -> pl.DataFrame:
    """
    Download adjusted closing prices for tickers (and benchmarks).
    Returns a Polars DataFrame with columns: date, <ticker1>, <ticker2>, …
    For period='1D', downloads 1-hour interval intraday data for the current trading day.
    """
    all_tickers = list(tickers)
    if include_benchmarks:
        all_tickers += BENCHMARKS

    period_upper = period.upper()
    cache_key = f"hist:{','.join(sorted(all_tickers))}:{period_upper}:{start_date}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached.clone() if hasattr(cached, "clone") else cached  # type: ignore[return-value]

    yf_period = PERIOD_MAP.get(period_upper, "1y")

    download_kwargs = {
        "auto_adjust": True,
        "progress": False,
        "threads": True,
        "session": _yf_session,
    }

    if period_upper == "1D":
        download_kwargs["period"] = "1d"
        download_kwargs["interval"] = "1h"
    elif start_date:
        download_kwargs["start"] = start_date
    else:
        download_kwargs["period"] = yf_period

    with _yf_download_lock:
        raw: pd.DataFrame = yf.download(
            all_tickers,
            **download_kwargs,
        )

    # yfinance returns MultiIndex when multiple tickers
    if isinstance(raw.columns, pd.MultiIndex):
        closes: pd.DataFrame = raw["Close"].copy()
    else:
        # Single ticker — raw is already the OHLCV df
        closes = raw[["Close"]].copy()
        closes.columns = [all_tickers[0]]

    closes.index.name = "date"
    closes = closes.reset_index()

    if period_upper == "1D":
        # Keep UNIX timestamp seconds (integer) for lightweight-charts intraday time scale
        try:
            closes["date"] = [int(pd.to_datetime(t).timestamp()) for t in closes["date"]]
        except Exception:
            pass
    else:
        closes["date"] = pd.to_datetime(closes["date"]).dt.date

    # Forward-fill then back-fill ticker prices so transient missing bars/NaNs from Yahoo don't drop positions
    price_cols = [c for c in closes.columns if c != "date"]
    if price_cols:
        closes[price_cols] = closes[price_cols].ffill().bfill()

    df = pl.from_pandas(closes)

    # Rename benchmark columns to friendly names
    rename_map: dict[str, str] = {}
    if "^GSPC" in df.columns:
        rename_map["^GSPC"] = "SP500"
    if "^IXIC" in df.columns:
        rename_map["^IXIC"] = "NASDAQ"
    if rename_map:
        df = df.rename(rename_map)

    # Cache 1D for LIVE_TTL (60s), historical for HISTORICAL_TTL (1h)
    ttl = LIVE_TTL if period_upper == "1D" else HISTORICAL_TTL
    _cache_set(cache_key, df, ttl=ttl)
    return df


# ──────────────────────────────────────────────
# Live / current quotes
# ──────────────────────────────────────────────
def get_live_quotes(tickers: list[str]) -> list[dict]:
    """
    Fetch current price, change, % change for each ticker.
    Uses fast_info with fallback to 5d history for London (.L) and international tickers.
    Cached to avoid Yahoo Finance rate-limiting.
    """
    if not tickers:
        return []

    cache_key = f"live:{','.join(sorted(tickers))}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    results: list[dict] = []
    for ticker in tickers:
        ticker_clean = ticker.strip().upper()
        meta = get_ticker_meta(ticker_clean)
        try:
            t = get_yf_ticker(ticker_clean)
            price = None
            prev = None

            # 1. Try fast_info
            try:
                fi = t.fast_info
                price = getattr(fi, "last_price", None)
                prev = getattr(fi, "previous_close", None)
            except Exception:
                pass

            # 2. Fallback to 5-day history if fast_info returns None or 0
            if not price or pd.isna(price) or price <= 0:
                hist = t.history(period="5d")
                if not hist.empty and "Close" in hist.columns:
                    closes = hist["Close"].dropna()
                    if not closes.empty:
                        price = float(closes.iloc[-1])
                        prev = float(closes.iloc[-2]) if len(closes) > 1 else price

            # Detect real currency from fast_info or info
            currency = getattr(getattr(t, "fast_info", None), "currency", None)
            if not currency:
                try:
                    currency = getattr(t, "info", {}).get("currency")
                except Exception:
                    pass
            if not currency:
                currency = "GBP" if ticker_clean.endswith(".L") else "USD"

            if price is not None and not pd.isna(price) and price > 0:
                price = float(price)
                prev = float(prev) if prev and not pd.isna(prev) else price
                change = price - prev
                change_pct = (change / prev * 100) if prev > 0 else 0.0

                exchange = meta.get("exchange") or ("LSE" if ticker_clean.endswith(".L") else ("HKG" if ticker_clean.endswith(".HK") else "US"))
                is_open = is_ticker_market_open(ticker_clean, exchange)
                results.append(
                    {
                        "ticker": ticker_clean,
                        "name": meta.get("name") or ticker_clean,
                        "sector": meta.get("sector") or "Tecnología",
                        "exchange": exchange,
                        "currency": currency,
                        "quoteType": "EQUITY",
                        "price": round(price, 4),
                        "change": round(change, 4),
                        "change_pct": round(change_pct, 4),
                        "previous_close": round(prev, 4),
                        "market_open": is_open,
                    }
                )
            else:
                raise ValueError(f"No price data available for {ticker_clean}")

        except Exception as exc:
            meta = get_ticker_meta(ticker)
            exchange = meta.get("exchange") or ("LSE" if ticker.endswith(".L") else ("HKG" if ticker.endswith(".HK") else "US"))
            results.append(
                {
                    "ticker": ticker,
                    "name": meta.get("name") or ticker,
                    "sector": meta.get("sector") or "Desconocido",
                    "exchange": exchange,
                    "currency": "USD",
                    "quoteType": "EQUITY",
                    "price": None,
                    "change": None,
                    "change_pct": None,
                    "previous_close": None,
                    "market_open": is_ticker_market_open(ticker, exchange),
                    "error": str(exc),
                }
            )

    _cache_set(cache_key, results)
    return results


def get_intraday(ticker: str, target_date: str | None = None) -> list[dict]:
    """
    Return intraday 5-minute prices for a single ticker (today or a specific historical date YYYY-MM-DD).
    Uses Ticker.history() instead of yf.download() to avoid yfinance global shared-state race conditions
    when multiple tickers are requested concurrently.
    """
    t_clean = ticker.strip().upper()
    cache_key = f"intraday_v2:{t_clean}:{target_date or 'today'}"
    cached = _cache_get(cache_key)
    if cached is not None and isinstance(cached, list) and len(cached) > 0:
        return cached  # type: ignore[return-value]

    records = []
    try:
        t = get_yf_ticker(t_clean)
        if target_date:
            from datetime import datetime, timedelta
            start_dt = datetime.strptime(target_date, "%Y-%m-%d")
            end_dt = start_dt + timedelta(days=1)
            df = t.history(
                start=start_dt.strftime("%Y-%m-%d"),
                end=end_dt.strftime("%Y-%m-%d"),
                interval="5m",
                auto_adjust=True,
            )
            if not df.empty:
                df = df[df.index.strftime("%Y-%m-%d") == target_date]
        else:
            df = t.history(
                period="1d",
                interval="5m",
                auto_adjust=True,
            )

        if not df.empty:
            close_series = df["Close"] if "Close" in df.columns else df.iloc[:, 0]
            if isinstance(close_series, pd.DataFrame):
                close_series = close_series.iloc[:, 0]

            for idx, val in close_series.items():
                try:
                    fval = float(val)
                    if pd.isna(fval) or fval <= 0:
                        continue
                    records.append(
                        {
                            "time": int(idx.timestamp()),
                            "value": round(fval, 4),
                        }
                    )
                except Exception:
                    continue
    except Exception:
        records = []

    if records:
        ttl = LIVE_TTL if not target_date else HISTORICAL_TTL
        _cache_set(cache_key, records, ttl=ttl)
    return records


# ──────────────────────────────────────────────
# Helpers: Market Open/Closed per Exchange
# ──────────────────────────────────────────────
import zoneinfo

def is_ticker_market_open(ticker: str, exchange: str | None = None) -> bool:
    """
    Determina si el mercado para un ticker o exchange específico está abierto o cerrado en este momento.
    Cubre:
    - EE.UU. (NYSE, NASDAQ, NMS, NYQ, etc.): Mon-Fri 09:30 - 16:00 US/Eastern
    - Londres (LSE, LON, .L): Mon-Fri 08:00 - 16:30 Europe/London
    - Hong Kong (HKG, HKEX, .HK): Mon-Fri 09:30 - 12:00 y 13:00 - 16:00 Asia/Hong_Kong
    - Europa (Euronext, XETRA, etc.): Mon-Fri 09:00 - 17:30 Europe/Paris
    - Colombia (BVC): Mon-Fri 09:30 - 16:00 America/Bogota
    """
    t_clean = ticker.strip().upper() if ticker else ""
    ex_clean = (exchange or "").strip().upper()

    try:
        if ex_clean in ["CRYPTO", "CRYPTOCURRENCY", "CCC"] or t_clean.endswith("-USD") and any(c in t_clean for c in ["BTC", "ETH", "XAUT", "PAXG", "SOL", "ADA", "BNB"]):
            return True

        if t_clean.endswith(".HK") or ex_clean in ["HKG", "HKEX", "HONG KONG"]:
            tz = zoneinfo.ZoneInfo("Asia/Hong_Kong")
            now = datetime.now(tz)
            if now.weekday() >= 5:
                return False
            time_dec = now.hour + now.minute / 60.0
            return (9.5 <= time_dec <= 12.0) or (13.0 <= time_dec <= 16.0)

        elif t_clean.endswith(".L") or ex_clean in ["LSE", "LON", "LONDON", "FTSE"]:
            tz = zoneinfo.ZoneInfo("Europe/London")
            now = datetime.now(tz)
            if now.weekday() >= 5:
                return False
            time_dec = now.hour + now.minute / 60.0
            return 8.0 <= time_dec <= 16.5

        elif any(t_clean.endswith(sfx) for sfx in [".PA", ".DE", ".AS", ".MI", ".MC", ".F"]) or ex_clean in ["EURONEXT", "XETRA", "PAR", "GER", "FRA"]:
            tz = zoneinfo.ZoneInfo("Europe/Paris")
            now = datetime.now(tz)
            if now.weekday() >= 5:
                return False
            time_dec = now.hour + now.minute / 60.0
            return 9.0 <= time_dec <= 17.5

        elif t_clean.endswith(".CL") or ex_clean in ["BVC", "COLOMBIA"]:
            tz = zoneinfo.ZoneInfo("America/Bogota")
            now = datetime.now(tz)
            if now.weekday() >= 5:
                return False
            time_dec = now.hour + now.minute / 60.0
            return 9.5 <= time_dec <= 16.0

        else:
            # Por defecto bolsas de EE.UU. (NYSE, NASDAQ, AMEX, ETFs globales)
            tz = zoneinfo.ZoneInfo("America/New_York")
            now = datetime.now(tz)
            if now.weekday() >= 5:
                return False
            time_dec = now.hour + now.minute / 60.0
            return 9.5 <= time_dec <= 16.0
    except Exception:
        # Fallback genérico UTC
        now_utc = datetime.now(timezone.utc)
        if now_utc.weekday() >= 5:
            return False
        h_utc = now_utc.hour + now_utc.minute / 60.0
        return 14.5 <= h_utc < 21.0


def _is_market_open(ticker: str = "SPY", exchange: str | None = None) -> bool:
    return is_ticker_market_open(ticker, exchange)


# ──────────────────────────────────────────────
# FX / Currency Data
# ──────────────────────────────────────────────
def get_fx_data(currency_str: str) -> dict:
    """
    Fetch historical and current FX rates for an asset currency to local currency.
    Format of currency_str is 'ASSET-LOCAL' (e.g. 'USD-COP').
    Returns: { "current": 4200.5, "history": { "2024-01-01": 3900.2, ... } }
    """
    parts = currency_str.split("-")
    asset_currency = parts[0].strip().upper() if len(parts) > 0 else "USD"
    local_currency = parts[1].strip().upper() if len(parts) > 1 else "COP"

    if asset_currency == local_currency:
        return {"current": 1.0, "history": {}}

    ticker_sym = f"{asset_currency}{local_currency}=X"
    cache_key = f"fx:{ticker_sym}"

    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        # Get historical data for the last 10 years (or max)
        df = yf.download(
            ticker_sym, period="10y", auto_adjust=True, progress=False, session=_yf_session
        )
        history_dict = {}

        if not df.empty:
            # Handle MultiIndex if present
            if isinstance(df.columns, pd.MultiIndex):
                closes = df["Close"].copy()
            else:
                closes = df[["Close"]].copy()
                closes.columns = [ticker_sym]

            closes.index.name = "date"
            closes = closes.reset_index()
            closes["date"] = pd.to_datetime(closes["date"]).dt.date

            for _, row in closes.iterrows():
                val = row.iloc[1] if len(row) > 1 else None
                if pd.isna(val):
                    continue
                history_dict[str(row["date"])] = float(val)

        # Get current price
        t = get_yf_ticker(ticker_sym)
        fi = t.fast_info
        current_price = fi.last_price or 0.0

        if current_price == 0.0 and history_dict:
            # Fallback to last available day
            last_date = sorted(history_dict.keys())[-1]
            current_price = history_dict[last_date]

        result = {"current": current_price, "history": history_dict}

        # Cache for 1 hour
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        logging.error(f"Error fetching FX data for {currency_str}: {e}")
        return {"current": 1.0, "history": {}}


# ──────────────────────────────────────────────
# Inflation Data
# ──────────────────────────────────────────────
import io
from pathlib import Path

# Official DANE monthly variations (MoM %) to supplement FRED series when FRED has data lag
DANE_CPI_EXTENSIONS: list[tuple[str, float]] = [
    ("2025-05-01", 0.32),
    ("2025-06-01", 0.10),
    ("2025-07-01", 0.28),
    ("2025-08-01", 0.19),
    ("2025-09-01", 0.32),
    ("2025-10-01", 0.18),
    ("2025-11-01", 0.07),
    ("2025-12-01", 0.27),
    ("2026-01-01", 1.18),
    ("2026-02-01", 1.08),
    ("2026-03-01", 0.78),
    ("2026-04-01", 0.78),
    ("2026-05-01", 0.47),
    ("2026-06-01", 0.39),
    ("2026-07-01", 0.17),
    ("2026-08-01", 0.39),
]


def get_colombia_cpi_history() -> dict:
    """
    Fetch Colombian CPI (Consumer Price Index) from FRED (Federal Reserve Economic Data).
    Series: COLCPALTT01IXOBM
    Supplements recent official DANE releases (2025-2026) to ensure the index is always
    current (up to 1-2 months ago) rather than lagging behind FRED releases.
    Returns a dictionary of date strings to CPI values, latest summary, and monthly rates.
    """
    cache_key = "inflation:colombia"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=COLCPALTT01IXOBM"
    df = None

    # 1. Attempt download from FRED
    try:
        if _yf_session:
            resp = _yf_session.get(url, timeout=12)
            if resp.status_code == 200 and len(resp.text) > 100:
                df = pd.read_csv(io.StringIO(resp.text))
        if df is None:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=12) as response:
                df = pd.read_csv(response)
    except Exception as e:
        logging.warning(f"Could not fetch fresh FRED CPI online ({e}), trying local base fallback...")

    # 2. Fallback to local base CSV if online request failed
    base_file = Path(__file__).parent / "cpi_colombia_base.csv"
    if df is None and base_file.exists():
        try:
            df = pd.read_csv(base_file)
        except Exception as e:
            logging.error(f"Error reading local cpi_colombia_base.csv: {e}")

    if df is None or df.empty:
        return {
            "history": {},
            "latest": {"date": "", "cpi": 0, "mom": 0, "yoy": 0},
            "monthly_rates": [],
        }

    try:
        # Detect column names dynamically
        date_col = (
            "observation_date"
            if "observation_date" in df.columns
            else ("DATE" if "DATE" in df.columns else df.columns[0])
        )
        val_col = "COLCPALTT01IXOBM" if "COLCPALTT01IXOBM" in df.columns else df.columns[1]

        history_dict = {}
        for _, row in df.iterrows():
            date_str = str(row[date_col])[:10]
            try:
                val = float(row[val_col])
                history_dict[date_str] = val
            except (ValueError, TypeError):
                pass

        # 3. Append official DANE monthly variations for any missing newer months
        if history_dict:
            sorted_existing = sorted(history_dict.keys())
            last_date = sorted_existing[-1]
            last_val = history_dict[last_date]

            for d_str, mom_pct in DANE_CPI_EXTENSIONS:
                if d_str not in history_dict:
                    last_val = round(last_val * (1.0 + mom_pct / 100.0), 4)
                    history_dict[d_str] = last_val
                else:
                    last_val = history_dict[d_str]

        # 4. Compute MoM and YoY rates
        sorted_dates = sorted(history_dict.keys())
        monthly_rates = []
        for i, d in enumerate(sorted_dates):
            cpi = history_dict[d]
            mom = 0.0
            yoy = 0.0
            if i > 0:
                prev_cpi = history_dict[sorted_dates[i - 1]]
                mom = ((cpi - prev_cpi) / prev_cpi) * 100 if prev_cpi > 0 else 0.0
            if i >= 12:
                year_ago_cpi = history_dict[sorted_dates[i - 12]]
                yoy = ((cpi - year_ago_cpi) / year_ago_cpi) * 100 if year_ago_cpi > 0 else 0.0

            monthly_rates.append(
                {"date": d, "cpi": round(cpi, 4), "mom": round(mom, 2), "yoy": round(yoy, 2)}
            )

        latest = monthly_rates[-1] if monthly_rates else {"date": "", "cpi": 0, "mom": 0, "yoy": 0}

        result = {
            "history": history_dict,
            "latest": latest,
            "monthly_rates": list(reversed(monthly_rates)),  # newest first
        }
        _cache_set(cache_key, result, ttl=86400)
        return result
    except Exception as e:
        logging.error(f"Error processing Colombian CPI data: {e}")
        return {
            "history": {},
            "latest": {"date": "", "cpi": 0, "mom": 0, "yoy": 0},
            "monthly_rates": [],
        }
