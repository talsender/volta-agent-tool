"""Second merge: חורפיש + ירכא (Druze, with completed installs) → מתקינים."""
import sys, io, shutil, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')

CSV = r"C:\Users\Sinaymer\Desktop\City volta solar\volta-settlements.csv"
TODAY = datetime.date.today().strftime('%d/%m/%Y')
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = CSV.replace('.csv', f'_backup_{STAMP}.csv')
shutil.copy2(CSV, BACKUP)
print(f"גיבוי נשמר: {BACKUP}")

df = pd.read_csv(CSV, encoding='utf-8-sig', header=0, dtype=str).fillna('')
cols = list(df.columns)
NAME, TYPE, STATUS, ALIAS, ACTION, NOTE, SOURCE, UPDATED, INST, LAST = range(10)

TO_INSTALL = ['חורפיש','ירכא']

def append_note(existing, addition):
    existing = (existing or '').strip()
    if addition in existing: return existing
    return (existing + ' | ' + addition).strip(' |') if existing else addition

changes = []
# match flexibly (name may have variant spelling)
for i in df.index:
    name = df.at[i, cols[NAME]].strip()
    base = name.replace('-','').replace('־','').strip()
    if base in TO_INSTALL or name in TO_INSTALL:
        cur = df.at[i, cols[STATUS]].strip()
        if cur != 'מתקינים':
            df.at[i, cols[STATUS]]  = 'מתקינים'
            df.at[i, cols[NOTE]]    = append_note(df.at[i, cols[NOTE]], 'אומת מ-CRM: פרויקטים הושלמו ביישוב (החלטת מנהל)')
            df.at[i, cols[SOURCE]]  = append_note(df.at[i, cols[SOURCE]], 'CRM')
            df.at[i, cols[UPDATED]] = TODAY
            changes.append((name, cur, 'מתקינים'))

df.to_csv(CSV, encoding='utf-8-sig', index=False)
print(f"\n=== {len(changes)} שינויים ===")
for n, o, nw in changes:
    print(f"  {n}: {o} → {nw}")
print(f"\nנשמר: {CSV} | סה\"כ שורות: {len(df)}")
