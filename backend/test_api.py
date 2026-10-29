import time

import requests

url = "http://localhost:8000/api/nav?tickers=AMD,AMAT,HPQ,INTC,ON,ORCL,POWI,QCOM,TXN,MRVL,HIMX,NTAP,KD,ARM&period=1y&investment=2000&num_slots=15"
print(f"Requesting: {url}")
start = time.time()
try:
    response = requests.get(url, timeout=60)
    print(f"Status Code: {response.status_code}")
    print(f"Elapsed: {time.time() - start:.2f}s")
    if response.status_code == 200:
        data = response.json()
        print(f"Raw response data: {data}")
    else:
        print(response.text[:500])
except Exception as e:
    print(f"Error: {e}")
