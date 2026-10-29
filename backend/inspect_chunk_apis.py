import requests
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
}

r = requests.get('https://www.mejorcdt.com/chunk-3X7IX7HE.js', headers=headers, verify=False, timeout=10)
text = r.text

print("Chunk length:", len(text))
matches = [m.start() for m in re.finditer(r'bank-rates|api-cdt|api-mcdt|execute-api', text)]
for idx in matches:
    snippet = text[max(0, idx - 150):min(len(text), idx + 250)]
    print("\n--- SNIPPET ---")
    print(snippet)
