import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')
F = r"C:\Users\Sinaymer\Desktop\City volta solar\cbs_localities_2023.xlsx"
xl = pd.ExcelFile(F)
print('SHEETS:', xl.sheet_names)
df = pd.read_excel(F, sheet_name=0)
print('SHAPE:', df.shape)
print('\nCOLUMNS:')
for i,c in enumerate(df.columns):
    print(f'  [{i}] {c}')
print('\nSAMPLE 3 ROWS:')
print(df.head(3).to_string())
