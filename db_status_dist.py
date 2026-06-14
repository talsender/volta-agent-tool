import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')
CSV = r"C:\Users\Sinaymer\Desktop\City volta solar\volta-settlements.csv"
df = pd.read_csv(CSV, encoding='utf-8-sig', header=0, dtype=str).fillna('')
df.columns = ['name','type','status','aliases','action','note','source','updated','installCount','lastInstall']
print(f"סה\"כ יישובים: {len(df)}\n")
print("=== פילוח סטטוס נוכחי ===")
print(df['status'].value_counts(dropna=False).to_string())
print("\n=== פילוח סוג יישוב ===")
print(df['type'].value_counts(dropna=False).head(20).to_string())
print("\n=== דוגמת 10 שורות ===")
print(df[['name','type','status']].head(10).to_string(index=False))
