import urllib.request, ssl, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(url):
    req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    return json.loads(urllib.request.urlopen(req, timeout=90, context=ctx).read().decode('utf-8'))

def fetch_all(rid, label):
    out=[]; off=0
    while True:
        d=get(f'https://data.gov.il/api/3/action/datastore_search?resource_id={rid}&limit=1000&offset={off}')
        recs=d['result']['records']; out.extend(recs)
        off+=1000
        if off>=d['result']['total']: break
    print(f'{label}: {len(out)} records')
    return out

# Census religion per locality
census = fetch_all('9a9e085f-3bc8-41df-b15f-be0daaf99e30','census_religion')
# Localities list (name <-> code <-> regional council)
locs   = fetch_all('d4901968-dad3-4845-a9b0-a57d027f11ab','localities')

with open(r"C:\Users\Sinaymer\Desktop\City volta solar\census_religion.json",'w',encoding='utf-8') as f:
    json.dump(census,f,ensure_ascii=False)
with open(r"C:\Users\Sinaymer\Desktop\City volta solar\localities.json",'w',encoding='utf-8') as f:
    json.dump(locs,f,ensure_ascii=False)

# Religion distribution (locality-level rows: StatArea empty)
from collections import Counter
relc = Counter()
for r in census:
    if not r.get('StatArea') and r.get('LocalityCode'):
        relc[r.get('ReligionHeb')] += 1
print('\nReligion distribution (locality-level):')
for k,v in relc.most_common():
    print(f'  {k}: {v}')
