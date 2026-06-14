"""
Cross-reference the DB settlements against official CBS religion classification
+ regional council (for geographic south). REPORT ONLY — no writes.
"""
import sys, io, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')

BASE = r"C:\Users\Sinaymer\Desktop\City volta solar"
census = json.load(open(BASE+r"\census_religion.json", encoding='utf-8'))
locs   = json.load(open(BASE+r"\localities.json", encoding='utf-8'))

def norm(s):
    if not s: return ''
    s = str(s).strip()
    s = re.sub(r'[)(\]\[]', ' ', s)          # drop bracket chars
    s = re.sub(r'\b(שבט|באר שבע|נפה)\b', '', s)
    s = s.replace('־','-')
    s = re.sub(r'[\'"`׳״]', '', s)
    s = re.sub(r'[-–—]', '', s)
    s = re.sub(r'\s+', '', s)                 # remove ALL spaces for fuzzy key
    return s

# code -> religion (locality-level rows where StatArea empty)
code2rel = {}
name2rel = {}
for r in census:
    if r.get('LocalityCode') and not r.get('StatArea'):
        rel = (r.get('ReligionHeb') or '').strip()
        code2rel[int(r['LocalityCode'])] = rel
        nm = norm(r.get('LocNameHeb'))
        if nm: name2rel[nm] = rel

# localities list: name -> code, name -> regional council
name2council = {}
for r in locs:
    code = r.get('סמל_ישוב')
    nm   = norm(r.get('שם_ישוב'))
    council = (r.get('שם_מועצה') or '').strip()
    if nm:
        if council: name2council[nm] = council
        # add religion via code if not already
        if nm not in name2rel and code and int(code) in code2rel:
            name2rel[nm] = code2rel[int(code)]

print(f"מיפוי דת: {len(name2rel)} שמות | מיפוי מועצה: {len(name2council)}")

# Southern regional councils (south of / around Mitzpe Ramon)
SOUTH_COUNCILS = {'חבל אילות','אילות'}
ARAVA_COUNCILS = {'הערבה התיכונה','ערבה תיכונה','רמת נגב'}

# Load DB
df = pd.read_csv(BASE+r"\volta-settlements.csv", encoding='utf-8-sig', header=0, dtype=str).fillna('')
df.columns = ['name','type','status','aliases','action','note','source','updated','installCount','lastInstall']

ARAB_RELS = {'מוסלמים','נוצרים'}
def classify_religion(name):
    k = norm(name)
    rel = name2rel.get(k, '')
    return rel

matched=0; arab=0; druze=0; jewish=0; other=0; unknown=0
arab_installing=[]    # Arab but currently מתקינים  -> ERROR to fix
druze_rows=[]
arab_ok=[]            # Arab and already לא מתקינים -> correct

for _, row in df.iterrows():
    rel = classify_religion(row['name'])
    if not rel:
        unknown += 1
        continue
    matched += 1
    if rel in ARAB_RELS:
        arab += 1
        if row['status'].strip() == 'מתקינים':
            arab_installing.append((row['name'], rel, row['status']))
        else:
            arab_ok.append(row['name'])
    elif rel == 'דרוזים':
        druze += 1
        druze_rows.append((row['name'], row['status']))
    elif rel == 'יהודים':
        jewish += 1
    else:
        other += 1

print(f"\n=== התאמה מול המאגר ===")
print(f"הותאמו לסיווג רשמי: {matched} | לא הותאמו: {unknown}")
print(f"  ערבים (מוסלמים/נוצרים): {arab}")
print(f"  דרוזים: {druze}")
print(f"  יהודים: {jewish}")
print(f"  דת אחרת: {other}")

print(f"\n=== ⚠️ יישובים ערביים שמסומנים 'מתקינים' (טעות לתיקון): {len(arab_installing)} ===")
for n, rel, st in arab_installing:
    print(f"  {n}  [{rel}]  כרגע: {st}")

print(f"\n=== יישובים דרוזיים ({len(druze_rows)}) — סטטוס נוכחי ===")
from collections import Counter
dstat = Counter(s for _,s in druze_rows)
print('  פילוח:', dict(dstat))
for n, st in druze_rows:
    print(f"  {n}: {st}")

# Geographic: southern councils
print(f"\n=== יישובים במועצות דרומיות (חבל אילות) ===")
south_db=[]
for _, row in df.iterrows():
    k = norm(row['name'])
    council = name2council.get(k,'')
    if council in SOUTH_COUNCILS:
        south_db.append((row['name'], council, row['status']))
for n,c,st in south_db:
    flag = '  ⚠️ מתקינים!' if st=='מתקינים' else ''
    print(f"  {n} [{c}]: {st}{flag}")
