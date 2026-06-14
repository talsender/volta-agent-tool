"""Inspect the proposed settlement updates before merging anything."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')

OUT = r"C:\Users\Sinaymer\Desktop\City volta solar\crm_knowledge_analysis_output.xlsx"

df = pd.read_excel(OUT, sheet_name='עדכונים מוצעים - יישובים')
print(f"סה\"כ עדכונים מוצעים: {len(df)}\n")

print("=== פילוח לפי 'דורש אישור' ===")
print(df['דורש אישור'].value_counts().to_string())

print("\n=== פילוח לפי 'החלטה מוצעת' ===")
print(df['החלטה מוצעת'].value_counts().to_string())

print("\n=== פילוח לפי 'רמת ודאות' ===")
print(df['רמת ודאות'].value_counts().to_string())

# Safe to auto-apply: high confidence + no approval needed
safe = df[(df['דורש אישור'] == 'לא') & (df['רמת ודאות'] == 'גבוהה')]
print(f"\n=== בטוח לעדכון אוטומטי (ודאות גבוהה + לא דורש אישור): {len(safe)} ===")
print(safe['החלטה מוצעת'].value_counts().to_string())

# Contradictions needing approval
contra = df[df['דורש אישור'] == 'כן']
print(f"\n=== סתירות שדורשות אישור: {len(contra)} ===")
print(contra[['יישוב','החלטה קיימת','החלטה מוצעת','סיבה']].head(30).to_string(index=False))
