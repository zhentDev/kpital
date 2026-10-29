import requests
import urllib3
import re
import json

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

def analyze_scripts():
    r = requests.get('https://www.mejorcdt.com', headers=headers, verify=False, timeout=12)
    script_urls = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', r.text)
    print(f"Total scripts encontrados: {len(script_urls)}")
    
    api_patterns = set()
    for s_url in script_urls:
        if not s_url.startswith("http"):
            s_url = "https://www.mejorcdt.com" + s_url
        try:
            s_res = requests.get(s_url, headers=headers, verify=False, timeout=8)
            # Buscar menciones a API, endpoints, tasas, etc.
            apis = re.findall(r'https?://[a-zA-Z0-9\-\._]+/(?:api|v1|v2|rates|simulate|cdts)[a-zA-Z0-9_\-\./]*', s_res.text)
            for a in apis:
                api_patterns.add(a)
            # Buscar menciones a entidades como KOA, Contactar, etc.
            banks = re.findall(r'(?:KOA|Contactar|Ban100|Serfinanza|Finandina|Crezcamos|Bancam[ií]a)', s_res.text, re.IGNORECASE)
            if banks:
                print(f"En {s_url[-30:]} menciones a bancos:", set(banks))
        except Exception as e:
            pass

    print("\nEndpoints API encontrados:")
    for a in sorted(api_patterns):
        print(" ->", a)

if __name__ == "__main__":
    analyze_scripts()
