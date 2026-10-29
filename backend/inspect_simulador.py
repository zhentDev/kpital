import requests
import urllib3
import re
import json

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

def check_simulador():
    print("Fetching /cdt-simulador...")
    r = requests.get('https://www.mejorcdt.com/cdt-simulador', headers=headers, verify=False, timeout=12)
    print("Status:", r.status_code, "Len:", len(r.text))
    
    # Check for script chunks
    chunks = re.findall(r'(?:chunk-[A-Za-z0-9]+\.js|main-[A-Za-z0-9]+\.js)', r.text)
    print(f"Chunks in simulador ({len(chunks)}):", set(chunks))
    
    # Search each chunk for API URLs, rates, banks (KOA, Contactar, etc.)
    for chunk in set(chunks):
        c_url = f"https://www.mejorcdt.com/{chunk}"
        try:
            c_res = requests.get(c_url, headers=headers, verify=False, timeout=8)
            # Find URLs
            apis = re.findall(r'https?://[a-zA-Z0-9\-\._]+/[a-zA-Z0-9_\-\./]*', c_res.text)
            valid_apis = [a for a in apis if any(k in a.lower() for k in ["api", "rate", "tasa", "cdt", "simulat", "bank", "entit"])]
            if valid_apis:
                print(f"\nAPIs in {chunk}:")
                for va in set(valid_apis):
                    print("  *", va)
            # Find bank mentions or rate tiers
            if "koa" in c_res.text.lower() or "contactar" in c_res.text.lower() or "tasa" in c_res.text.lower():
                print(f"Chunk {chunk} mentions CDT entities/tasas!")
                matches = re.findall(r'(?:tasa|rate|interestRate|plazo|dias|term)[\w\s":,\.]{1,80}', c_res.text, re.IGNORECASE)
                if matches:
                    print("  Sample:", matches[:3])
        except Exception as e:
            print("Error chunk:", chunk, e)

if __name__ == "__main__":
    check_simulador()
