import urllib.request, ssl, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE

def get(url):
    req=urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=120, context=ctx).read()

# Get package metadata for the localities file (to find download URL)
meta = json.loads(get('https://data.gov.il/api/3/action/package_show?id=localities-in-israel').decode('utf-8'))
for res in meta['result']['resources']:
    if '2023' in res.get('name',''):
        print('NAME:', res['name'])
        print('URL :', res['url'])
        print('FMT :', res['format'])
        # download
        data = get(res['url'])
        out = r"C:\Users\Sinaymer\Desktop\City volta solar\cbs_localities_2023.xlsx"
        with open(out,'wb') as f: f.write(data)
        print('Saved', out, len(data), 'bytes')
        break
