import requests
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

r = requests.get('https://www.mejorcdt.com', headers=headers, verify=False, timeout=12)
with open("mejorcdt_raw.html", "w", encoding="utf-8") as f:
    f.write(r.text)

print("Saved raw HTML. Bytes:", len(r.text))

# Let's find any URLs or links
links = re.findall(r'href=["\']([^"\']+)["\']', r.text)
print("Links:", set(links))

# Also search for inline JSON or script contents
scripts = re.findall(r'<script[^>]*>(.*?)</script>', r.text, re.DOTALL)
print("Inline scripts count:", len(scripts))
for i, s in enumerate(scripts):
    if "rate" in s.lower() or "tasa" in s.lower() or "cdt" in s.lower():
        print(f"Script #{i} contains keywords! Length: {len(s)}")
        print(s[:300])
