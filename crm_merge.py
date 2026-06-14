"""
Merge validated CRM findings into volta-settlements.csv.
Makes a timestamped backup first. Only in-place status changes on existing
Hebrew rows — NO new rows added (DB is already comprehensive).
"""
import sys, io, shutil, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')

CSV = r"C:\Users\Sinaymer\Desktop\City volta solar\volta-settlements.csv"
TODAY = datetime.date.today().strftime('%d/%m/%Y')
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = CSV.replace('.csv', f'_backup_{STAMP}.csv')

# Backup
shutil.copy2(CSV, BACKUP)
print(f"גיבוי נשמר: {BACKUP}")

df = pd.read_csv(CSV, encoding='utf-8-sig', header=0, dtype=str).fillna('')
cols = list(df.columns)
NAME, TYPE, STATUS, ALIAS, ACTION, NOTE, SOURCE, UPDATED, INST, LAST = range(10)

# Existing DB spelling of the "consult" status (2 yods) — keep consistent so the tool recognises it
CONSULT = 'להתייעץ'

UPGRADE_TO_INSTALL = ['כפר הנגיד','כפר ורדים','כפר כמא','כפר מימון','כפר רות']
CHANGE_TO_CONSULT  = ['כסרא-סמיע','כסרא סמיע','פקיעין (בוקייעה)']

changes = []

def append_note(existing, addition):
    existing = (existing or '').strip()
    if addition in existing:
        return existing
    return (existing + ' | ' + addition).strip(' |') if existing else addition

for i in df.index:
    name = df.at[i, cols[NAME]].strip()
    cur  = df.at[i, cols[STATUS]].strip()

    if name in UPGRADE_TO_INSTALL and cur != 'מתקינים':
        df.at[i, cols[STATUS]]  = 'מתקינים'
        df.at[i, cols[NOTE]]    = append_note(df.at[i, cols[NOTE]], 'אומת מ-CRM: פרויקטים הושלמו ביישוב')
        df.at[i, cols[SOURCE]]  = append_note(df.at[i, cols[SOURCE]], 'CRM')
        df.at[i, cols[UPDATED]] = TODAY
        changes.append((name, cur, 'מתקינים', 'פרויקטים הושלמו'))

    elif name in CHANGE_TO_CONSULT and cur != CONSULT:
        df.at[i, cols[STATUS]]  = CONSULT
        df.at[i, cols[NOTE]]    = append_note(df.at[i, cols[NOTE]], 'יישוב דרוזי — נדרשת התייעצות (החלטת מנהל)')
        df.at[i, cols[SOURCE]]  = append_note(df.at[i, cols[SOURCE]], 'CRM')
        df.at[i, cols[UPDATED]] = TODAY
        changes.append((name, cur, CONSULT, 'יישוב דרוזי — החלטת מנהל'))

# Save (utf-8-sig so Google Sheets / Excel read Hebrew correctly)
df.to_csv(CSV, encoding='utf-8-sig', index=False)

print(f"\n=== {len(changes)} שינויים בוצעו ===")
for name, old, new, reason in changes:
    print(f"  {name}: {old} → {new}  ({reason})")

print(f"\nהקובץ נשמר: {CSV}")
print(f"סה\"כ שורות: {len(df)} (לא נוספו שורות חדשות)")
