import urllib.request, ssl, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE

def get(url):
    req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    return json.loads(urllib.request.urlopen(req, timeout=60, context=ctx).read().decode('utf-8'))

# Search packages mentioning localities / population
for q in ['יישובים','אוכלוסייה','קואורדינטות יישובים']:
    url=f'https://data.gov.il/api/3/action/package_search?q={urllib.parse.quote(q)}&rows=15'
    try:
        d=get(url)
        print(f'\n===== query: {q} | count={d["result"]["count"]} =====')
        for p in d['result']['results'][:15]:
            print(f'  pkg: {p["name"]} | title: {p.get("title","")[:50]}')
            for res in p.get('resources',[]):
                if res.get('format','').upper() in ('CSV','XLSX','JSON','API') or res.get('datastore_active'):
                    print(f'      res[{res.get("format")}] id={res["id"]} active={res.get("datastore_active")} | {res.get("name","")[:40]}')
    except Exception as e:
        print('ERR', q, repr(e))
