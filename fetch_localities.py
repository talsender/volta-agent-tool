"""Download the official Israel localities dataset from data.gov.il (CKAN)."""
import urllib.request, ssl, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE

RID = 'd4901968-dad3-4845-a9b0-a57d027f11ab'  # יישובים גאוגרפי
def fetch(offset, limit=1000):
    url=f'https://data.gov.il/api/3/action/datastore_search?resource_id={RID}&limit={limit}&offset={offset}'
    req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    r=urllib.request.urlopen(req, timeout=60, context=ctx)
    return json.loads(r.read().decode('utf-8'))

first = fetch(0, 1000)
total = first['result']['total']
fields = [f['id'] for f in first['result']['fields']]
print('TOTAL records:', total)
print('FIELDS:', fields)
recs = first['result']['records']
print('\nSAMPLE RECORD:')
print(json.dumps(recs[0], ensure_ascii=False, indent=2))

# Fetch all
all_recs = list(recs)
off = 1000
while off < total:
    d = fetch(off, 1000)
    all_recs.extend(d['result']['records'])
    off += 1000
print(f'\nFetched {len(all_recs)} records')

with open(r"C:\Users\Sinaymer\Desktop\City volta solar\localities_raw.json", 'w', encoding='utf-8') as f:
    json.dump(all_recs, f, ensure_ascii=False)
print('Saved localities_raw.json')
