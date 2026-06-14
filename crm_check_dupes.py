import sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')

OUT = r"C:\Users\Sinaymer\Desktop\City volta solar\crm_knowledge_analysis_output.xlsx"
CSV = r"C:\Users\Sinaymer\Desktop\City volta solar\volta-settlements.csv"

df_upd = pd.read_excel(OUT, sheet_name='עדכונים מוצעים - יישובים')

# Load existing DB names + aliases
df_csv = pd.read_csv(CSV, encoding='utf-8-sig', header=0)
print("CSV columns:", list(df_csv.columns))
print(f"CSV rows: {len(df_csv)}")

names = set()
for _, r in df_csv.iterrows():
    nm = str(r.iloc[0]).strip()
    if nm and nm != 'nan':
        names.add(nm)
    # aliases column (index 3)
    al = str(r.iloc[3]) if len(r) > 3 else ''
    if al and al != 'nan':
        for a in al.split(','):
            a = a.strip()
            if a:
                names.add(a)

def is_hebrew(s):
    return bool(re.search(r'[֐-׿]', s))

upd_cities = df_upd['יישוב'].dropna().tolist()
heb = [c for c in upd_cities if is_hebrew(c)]
eng = [c for c in upd_cities if not is_hebrew(c)]
print(f"\nסה\"כ עדכונים: {len(upd_cities)}")
print(f"  בעברית: {len(heb)}")
print(f"  באנגלית: {len(eng)}")

# How many Hebrew update-cities already exist exactly in DB?
heb_in_db = [c for c in heb if c in names]
heb_new   = [c for c in heb if c not in names]
print(f"\nמתוך העבריים — כבר במאגר (התאמה מדויקת): {len(heb_in_db)}")
print(f"מתוך העבריים — לא נמצאו: {len(heb_new)}")
print("דוגמאות עבריים לא נמצאו:", ', '.join(heb_new[:30]))

print(f"\nדוגמאות אנגלית (כנראה כפילויות של עברית קיימת):")
print(', '.join(eng[:40]))
