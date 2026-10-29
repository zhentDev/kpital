"""Quick test: verify yfinance can download data in this environment."""

import sys
import time

import yfinance as yf

print(f"Python {sys.version}")
print("Testing yfinance download...")
start = time.time()

try:
    t = yf.Ticker("AAPL")
    price = t.fast_info.last_price
    elapsed = time.time() - start
    print(f"OK — AAPL price: {price} in {elapsed:.1f}s")
except Exception as e:
    import traceback

    print(f"ERROR: {e}")
    traceback.print_exc()
