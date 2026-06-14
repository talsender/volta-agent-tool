"""Geocode Arava + Ramat Negev settlements via Nominatim, classify by latitude vs Mitzpe Ramon."""
import urllib.request, urllib.parse, ssl, json, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE

def geocode(name):
    q = urllib.parse.quote(name + ', Israel')
    url = f'https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1'
    req = urllib.request.Request(url, headers={'User-Agent':'VoltaSolar-research/1.0 (talsender96@gmail.com)'})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=30, context=ctx).read().decode('utf-8'))
        if d: return float(d[0]['lat']), float(d[0]['lon'])
    except Exception as e:
        print(f'   ! geocode err {name}: {e}')
    return None

ARAVA = ['חצבה','ספיר','עידן','עין יהב','עיר אובות','פארן','צופר','צוקים']
RAMAT_NEGEV = ['אשלים','באר מילכה','טללים','כמהין','מדרשת בן גוריון','מחנה טלי','מרחב עם',
               'משאבי שדה','ניצנה','ניצני סיני','עזוז','רביבים','רוח מדבר','רתמים','שדה בוקר','שלווה במדבר']

print('Geocoding Mitzpe Ramon...')
mr = geocode('מצפה רמון'); time.sleep(1.2)
print('  Mitzpe Ramon:', mr)
MR_LAT = mr[0]

results = {}
for name in ARAVA + RAMAT_NEGEV:
    c = geocode(name)
    time.sleep(1.2)
    if c:
        side = 'דרום' if c[0] < MR_LAT else 'צפון'
        results[name] = (c[0], c[1], side)
        print(f'  {name}: lat={c[0]:.4f}  → {side}')
    else:
        results[name] = None
        print(f'  {name}: לא נמצא')

json.dump({'mr_lat':MR_LAT,'results':results}, open(r"C:\Users\Sinaymer\Desktop\City volta solar\arava_coords.json",'w',encoding='utf-8'), ensure_ascii=False)
print('\n=== דרומיים (לא מתקינים): ===')
print('  ' + ', '.join(n for n,v in results.items() if v and v[2]=='דרום'))
