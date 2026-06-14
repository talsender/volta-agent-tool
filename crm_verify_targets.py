import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')

CSV = r"C:\Users\Sinaymer\Desktop\City volta solar\volta-settlements.csv"
df = pd.read_csv(CSV, encoding='utf-8-sig', header=0, dtype=str).fillna('')

targets_up   = ['כפר הנגיד','כפר ורדים','כפר כמא','כפר מימון','כפר רות']
targets_cons = ['באקה אלגרביה','באקה אל-גרביה','כסרא-סמיע','כסרא סמיע','פקיעין']

name_col = df.columns[0]
alias_col = df.columns[3]
status_col = df.columns[2]

def find(name):
    hits = df[df[name_col].str.strip() == name]
    if len(hits): return hits
    # try alias / contains
    hits = df[df[name_col].str.contains(name.replace('-',''), regex=False, na=False)]
    return hits

print("=== יעדי שדרוג ל'מתקינים' ===")
for t in targets_up:
    h = find(t)
    if len(h):
        print(f"  ✓ {t}: נמצא כ-'{h.iloc[0][name_col]}' | סטטוס נוכחי: {h.iloc[0][status_col]}")
    else:
        print(f"  ✗ {t}: לא נמצא!")

print("\n=== יעדי שינוי ל'להתיייעץ' (דרוזים/ערבים) ===")
for t in targets_cons:
    h = find(t)
    if len(h):
        print(f"  ✓ {t}: נמצא כ-'{h.iloc[0][name_col]}' | סטטוס נוכחי: {h.iloc[0][status_col]}")
    else:
        print(f"  - {t}: לא נמצא (אולי כתיב אחר)")
