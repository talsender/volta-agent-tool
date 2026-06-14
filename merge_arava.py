"""Set Arava settlements south of Mitzpe Ramon -> לא מתקינים."""
import sys, io, shutil, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')
CSV = r"C:\Users\Sinaymer\Desktop\City volta solar\volta-settlements.csv"
TODAY = datetime.date.today().strftime('%d/%m/%Y')
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = CSV.replace('.csv', f'_backup_{STAMP}.csv')
shutil.copy2(CSV, BACKUP); print('גיבוי:', BACKUP)

SOUTH = ['פארן','צופר','צוקים']
df = pd.read_csv(CSV, encoding='utf-8-sig', header=0, dtype=str).fillna('')
cols=list(df.columns); NAME,TYPE,STATUS,ALIAS,ACTION,NOTE,SOURCE,UPDATED,INST,LAST=range(10)

def appnote(e,a):
    e=(e or '').strip()
    return e if a in e else ((e+' | '+a).strip(' |') if e else a)

changes=[]
for i in df.index:
    n=df.at[i,cols[NAME]].strip()
    if n in SOUTH and df.at[i,cols[STATUS]].strip()!='לא מתקינים':
        old=df.at[i,cols[STATUS]].strip()
        df.at[i,cols[STATUS]]='לא מתקינים'
        df.at[i,cols[NOTE]]=appnote(df.at[i,cols[NOTE]],'דרומית למצפה רמון (ערבה — אומת בקואורדינטות)')
        df.at[i,cols[SOURCE]]=appnote(df.at[i,cols[SOURCE]],'קואורדינטות')
        df.at[i,cols[UPDATED]]=TODAY
        changes.append((n,old))

df.to_csv(CSV, encoding='utf-8-sig', index=False)
print(f'\n{len(changes)} שינויים:')
for n,o in changes: print(f'  {n}: {o} → לא מתקינים')
print(f'\nפילוח סטטוס:')
print(df[cols[STATUS]].str.strip().value_counts().to_string())
