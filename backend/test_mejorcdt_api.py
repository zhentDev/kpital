import requests
import urllib3
import re
import json

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
}

def inspect_mejorcdt():
    print("--- Probando conexión con MejorCDT ---")
    try:
        r = requests.get('https://www.mejorcdt.com', headers=headers, verify=False, timeout=12)
        print("Status code:", r.status_code, "Bytes:", len(r.text))
        
        # Buscar __NEXT_DATA__ o datos JSON embebidos
        next_data = re.search(r'<script id="__NEXT_DATA__" type="application/json">([^<]+)</script>', r.text)
        if next_data:
            print("Encontrado __NEXT_DATA__!")
            data = json.loads(next_data.group(1))
            props = data.get("props", {}).get("pageProps", {})
            print("Keys en pageProps:", list(props.keys()))
            with open("mejorcdt_nextdata.json", "w", encoding="utf-8") as f:
                json.dump(props, f, indent=2, ensure_ascii=False)
            print("Guardado en mejorcdt_nextdata.json")
        else:
            print("Buscando patrones de tasas en HTML...")
            rates = re.findall(r'(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:E\.A\.|EA)?', r.text, re.IGNORECASE)
            print("Tasas encontradas en texto:", set(rates[:10]))
            
    except Exception as e:
        print("Error al conectar:", e)

if __name__ == "__main__":
    inspect_mejorcdt()
