import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')

CSV = r"C:\Users\Sinaymer\Desktop\City volta solar\volta-settlements.csv"
df = pd.read_csv(CSV, encoding='utf-8-sig', header=0)
df.columns = ['name','type','status','aliases','action','note','source','updated','installCount','lastInstall']
df['installCount'] = pd.to_numeric(df['installCount'], errors='coerce').fillna(0).astype(int)

print(f"סה\"כ שורות: {len(df)}")
print(f"שורות עם התקנות > 0: {(df['installCount']>0).sum()}")
print("\n=== פילוח סטטוס של יישובים עם התקנות ===")
print(df[df['installCount']>0]['status'].value_counts(dropna=False).to_string())

# Settlements with installs but status NOT 'מתקינים' = genuine corrections
mismatch = df[(df['installCount']>0) & (df['status'].str.strip() != 'מתקינים')]
print(f"\n=== יישובים עם התקנות אבל סטטוס != מתקינים: {len(mismatch)} ===")
print(mismatch[['name','status','installCount','lastInstall']].to_string(index=False))
