"""
Full settlement classification merge against official CBS religion + regional council.
Rules applied:
  - Arab (Muslim/Christian)  -> לא מתקינים   [except Circassian: כפר כמא, ריחאניה]
  - Druze: installCount>0     -> מתקינים
           installCount==0    -> להתייעץ  (note: יישוב דרוזי)
  - Southern council (חבל אילות) -> לא מתקינים   (מצפה רמון stays מתקינים)
Backup made first. Only matched/relevant rows change.
"""
import sys, io, json, re, shutil, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')

BASE = r"C:\Users\Sinaymer\Desktop\City volta solar"
CSV  = BASE + r"\volta-settlements.csv"
census = json.load(open(BASE+r"\census_religion.json", encoding='utf-8'))
locs   = json.load(open(BASE+r"\localities.json", encoding='utf-8'))

TODAY = datetime.date.today().strftime('%d/%m/%Y')
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = CSV.replace('.csv', f'_backup_{STAMP}.csv')
shutil.copy2(CSV, BACKUP)
print(f"גיבוי: {BACKUP}")

def norm(s):
    if not s: return ''
    s = str(s).strip()
    s = re.sub(r'[)(\]\[]', ' ', s)
    s = re.sub(r'\b(שבט|באר שבע|נפה)\b', '', s)
    s = re.sub(r'[\'"`׳״]', '', s)
    s = re.sub(r'[־\-–—]', '', s)
    s = re.sub(r'\s+', '', s)
    return s

# Build religion map
code2rel = {}; name2rel = {}
for r in census:
    if r.get('LocalityCode') and not r.get('StatArea'):
        rel = (r.get('ReligionHeb') or '').strip()
        code2rel[int(r['LocalityCode'])] = rel
        nm = norm(r.get('LocNameHeb'))
        if nm: name2rel[nm] = rel
name2council = {}
for r in locs:
    code = r.get('סמל_ישוב'); nm = norm(r.get('שם_ישוב'))
    council = (r.get('שם_מועצה') or '').strip()
    if nm:
        if council: name2council[nm] = council
        if nm not in name2rel and code and int(code) in code2rel:
            name2rel[nm] = code2rel[int(code)]

ARAB_RELS    = {'מוסלמים','נוצרים'}
CIRCASSIAN   = {norm('כפר כמא'), norm('ריחאניה')}
SOUTH_COUNCILS = {'חבל אילות','אילות'}

df = pd.read_csv(CSV, encoding='utf-8-sig', header=0, dtype=str).fillna('')
cols = list(df.columns)
NAME,TYPE,STATUS,ALIAS,ACTION,NOTE,SOURCE,UPDATED,INST,LAST = range(10)

def inst_count(i):
    try: return int(float(df.at[i, cols[INST]] or 0))
    except: return 0
def appnote(existing, add):
    existing=(existing or '').strip()
    if add in existing: return existing
    return (existing+' | '+add).strip(' |') if existing else add

changes=[]
def set_status(i, new, reason, src='הלמ"ס + כלל'):
    old = df.at[i, cols[STATUS]].strip()
    if old == new: return
    df.at[i, cols[STATUS]] = new
    df.at[i, cols[NOTE]]   = appnote(df.at[i, cols[NOTE]], reason)
    df.at[i, cols[SOURCE]] = appnote(df.at[i, cols[SOURCE]], src)
    df.at[i, cols[UPDATED]]= TODAY
    changes.append((df.at[i,cols[NAME]], old, new, reason))

for i in df.index:
    name = df.at[i, cols[NAME]].strip()
    k = norm(name)
    rel = name2rel.get(k,'')
    council = name2council.get(k,'')

    # 1. Southern council (highest priority geographic) — except Mitzpe Ramon
    if council in SOUTH_COUNCILS and name != 'מצפה רמון':
        set_status(i, 'לא מתקינים', 'דרומית למצפה רמון (חבל אילות)')
        continue

    # 2. Arab
    if rel in ARAB_RELS:
        if k in CIRCASSIAN:
            # Circassian: Muslim by religion but not Arab -> מתקינים
            set_status(i, 'מתקינים', 'יישוב צ\'רקסי (לא ערבי)')
        else:
            set_status(i, 'לא מתקינים', 'יישוב ערבי (סיווג הלמ"ס)')
        continue

    # 3. Druze — by install history
    if rel == 'דרוזים':
        if inst_count(i) > 0:
            set_status(i, 'מתקינים', f'יישוב דרוזי עם {inst_count(i)} התקנות בעבר')
        else:
            set_status(i, 'להתייעץ', 'יישוב דרוזי — נדרשת התייעצות (אין התקנות קודמות)')
        continue

df.to_csv(CSV, encoding='utf-8-sig', index=False)

# Report
from collections import Counter
print(f"\n=== {len(changes)} שינויים בוצעו ===")
bycat = Counter(c[3].split('(')[0].split('—')[0].strip() for c in changes)
for cat, n in bycat.most_common():
    print(f"  {cat}: {n}")

print("\n=== פירוט מלא ===")
for name, old, new, reason in sorted(changes, key=lambda x: x[3]):
    print(f"  {name}: {old} → {new}  [{reason}]")

print(f"\nנשמר: {CSV} | סה\"כ שורות: {len(df)} (ללא הוספת שורות)")
# new status distribution
print("\n=== פילוח סטטוס חדש ===")
print(df[cols[STATUS]].str.strip().value_counts().to_string())
