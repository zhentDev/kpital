import requests
import urllib3
import json

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

api_key = "Z6mrBFD09ndIz6nWUt6C"
endpoints = [
    "https://api-cdt.mejorcdt.com/bank-rates",
    "https://api-mcdt.mejorcdt.com/v1/bank-rates",
    "https://api-mcdt.mejorcdt.com/v1/rates",
    "https://api-mcdt.mejorcdt.com/v1/banks",
    "https://api-mcdt.mejorcdt.com/v1/cdts",
    "https://api-mcdt.mejorcdt.com/v1/simulator",
    "https://3giw1p5i3e.execute-api.us-east-1.amazonaws.com/pro/rates",
]

headers_variants = [
    {"x-api-key": api_key},
    {"Authorization": f"Bearer {api_key}"},
    {"api-key": api_key},
    {"X-API-KEY": api_key, "User-Agent": "Mozilla/5.0"},
]

for ep in endpoints:
    for h in headers_variants:
        try:
            r = requests.get(ep, headers=h, verify=False, timeout=6)
            if r.status_code == 200:
                print(f"✅ SUCCESS! Endpoint: {ep} with header {list(h.keys())}")
                print("Len:", len(r.text))
                print(r.text[:300])
                try:
                    data = r.json()
                    with open(f"mejorcdt_extracted.json", "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                    print("Saved to mejorcdt_extracted.json!")
                except:
                    pass
                break
            else:
                pass
        except Exception as e:
            pass
