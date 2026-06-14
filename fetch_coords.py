"""Fetch Hebrew locality names + coordinates from Wikidata SPARQL."""
import urllib.request, urllib.parse, ssl, json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE

# Localities in Israel with coordinates. Q2225692 = city of Israel; broader: located in Israel + coordinates.
query = """
SELECT ?heb ?lat ?lon WHERE {
  ?place wdt:P17 wd:Q801 ;          # country = Israel
         wdt:P625 ?coord .
  ?place wdt:P31/wdt:P279* wd:Q486972 .   # instance of human settlement
  ?place rdfs:label ?heb . FILTER(LANG(?heb)="he")
  BIND(geof:latitude(?coord) AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
}
"""
url = 'https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(query)
req = urllib.request.Request(url, headers={'User-Agent':'VoltaSolar/1.0 (research)','Accept':'application/sparql-results+json'})
data = json.loads(urllib.request.urlopen(req, timeout=120, context=ctx).read().decode('utf-8'))
rows = data['results']['bindings']
out = {}
for r in rows:
    heb = r['heb']['value']
    lat = float(r['lat']['value']); lon = float(r['lon']['value'])
    # keep southernmost if duplicate
    if heb not in out or lat < out[heb][0]:
        out[heb] = (lat, lon)
print(f'Fetched {len(rows)} rows, {len(out)} unique Hebrew names')
json.dump(out, open(r"C:\Users\Sinaymer\Desktop\City volta solar\wikidata_coords.json",'w',encoding='utf-8'), ensure_ascii=False)

# Mitzpe Ramon latitude reference
mr = out.get('מצפה רמון')
print('Mitzpe Ramon coords:', mr)
