import requests
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

chunks = [
    'chunk-KE7BYQQU.js', 'chunk-4F22JURB.js', 'chunk-FN6VKIGF.js', 'chunk-DM275RSA.js',
    'chunk-AHF2T6JG.js', 'chunk-PIE6JCDL.js', 'chunk-F7K7REE6.js', 'chunk-ORCJFVUX.js',
    'chunk-47BCEYLV.js', 'chunk-IFFSZJKM.js', 'chunk-ZWTTCIVO.js', 'chunk-DACUUMC3.js',
    'chunk-IZTCCUON.js', 'chunk-O3W7FCBT.js', 'chunk-L7TQK7EP.js', 'chunk-V2BCFZA7.js',
    'chunk-7VB35Q47.js', 'chunk-LGOP3YDN.js', 'chunk-DSVONPWW.js', 'chunk-Y73BKUYQ.js',
    'chunk-WIWC2B4L.js', 'chunk-HODYTDXH.js', 'chunk-USCDUHPW.js', 'chunk-VQQ5GL7B.js',
    'main-QKPQ3UGZ.js', 'chunk-H52WSLF4.js', 'chunk-WMI4TUQ5.js', 'chunk-ER2RVATZ.js',
    'chunk-WG5NVQJW.js', 'chunk-2POHX22L.js', 'chunk-ZMMDJKBS.js', 'chunk-VG3G76BM.js',
    'chunk-NJDWVDAL.js'
]

print("Searching for rate fetch calls across chunks...")
for c in chunks:
    try:
        r = requests.get(f"https://www.mejorcdt.com/{c}", headers=headers, verify=False, timeout=6)
        # Look for simulate, getRates, fetchRates, bankRates
        matches = re.findall(r'(?:fetch|get|post)\s*\([^)]*(?:bank-rates|rates|simulate|adelaida)[^)]*\)', r.text, re.IGNORECASE)
        if matches:
            print(f"\nIn {c} fetch call found:")
            for m in matches:
                print("  ->", m)
        # Look for headers object
        h_matches = re.findall(r'headers\s*:\s*\{[^}]{1,150}\}', r.text)
        if h_matches:
            print(f"In {c} headers:")
            for hm in h_matches[:2]:
                print("  ->", hm)
    except Exception as e:
        pass
