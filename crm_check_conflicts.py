import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')
OUT = r"C:\Users\Sinaymer\Desktop\City volta solar\crm_knowledge_analysis_output.xlsx"
df = pd.read_excel(OUT, sheet_name='עדכונים מוצעים - יישובים')

print("=== פילוח 487 'מתקינים' לפי החלטה קיימת במאגר ===")
inst = df[df['החלטה מוצעת'] == 'מתקינים']
print(inst['החלטה קיימת'].value_counts(dropna=False).to_string())

# Real conflict: DB says לא מתקינים but CRM has completed projects
conflict = inst[inst['החלטה קיימת'] == 'לא מתקינים']
print(f"\n=== סתירה אמיתית: מאגר='לא מתקינים' אבל יש פרויקטים שהושלמו ({len(conflict)}) ===")
if len(conflict):
    print(conflict[['יישוב','סיבה']].to_string(index=False))
else:
    print("אין")

# New settlements not in DB at all
newc = inst[inst['החלטה קיימת'] == '—']
print(f"\n=== יישובים חדשים לגמרי (לא במאגר): {len(newc)} ===")
print(', '.join(newc['יישוב'].head(40).tolist()))

# 35 "לא מתקינים" breakdown
print(f"\n=== 35 'לא מתקינים' לפי החלטה קיימת ===")
noinst = df[df['החלטה מוצעת'] == 'לא מתקינים']
print(noinst['החלטה קיימת'].value_counts(dropna=False).to_string())
print("\nרשימה:")
print(noinst[['יישוב','סוג יישוב','החלטה קיימת','סיבה']].to_string(index=False))
