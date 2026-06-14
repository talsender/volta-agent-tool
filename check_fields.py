import urllib.request, ssl, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
def get(url):
    req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    return json.loads(urllib.request.urlopen(req, timeout=60, context=ctx).read().decode('utf-8'))

resources = {
  'census2022_selected': '9a9e085f-3bc8-41df-b15f-be0daaf99e30',
  'census2022_pop_hh'  : '38207cf8-afe2-48ed-a3b0-c8f70c796015',
  'localities_list'    : 'ef1c8e7f-9287-4b29-889d-26dbb9c9ad46',
  'socioeconomic'      : '7c860e04-9f8d-41c2-9f24-6249958d2081',
}
for name, rid in resources.items():
    try:
        d=get(f'https://data.gov.il/api/3/action/datastore_search?resource_id={rid}&limit=1')
        fields=[f['id'] for f in d['result']['fields']]
        print(f'\n===== {name} (total={d["result"]["total"]}) =====')
        for f in fields: print('   ', f)
        if d['result']['records']:
            print('  SAMPLE:', json.dumps(d['result']['records'][0], ensure_ascii=False)[:400])
    except Exception as e:
        print(f'\n{name}: ERR', repr(e))
