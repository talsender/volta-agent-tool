"""
Step 1: Inspect CRM file structure - sheet names, column headers, sample rows.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import pandas as pd
import warnings
warnings.filterwarnings('ignore')

FILE = r"C:\Users\Sinaymer\Desktop\City volta solar\Residential - Last view used.xlsx"

xl = pd.ExcelFile(FILE)
print("=== SHEETS ===")
for s in xl.sheet_names:
    print(f"  {repr(s)}")

df = pd.read_excel(FILE, sheet_name=0, nrows=5, header=0)
print(f"\n=== COLUMN LIST ({len(df.columns)} cols) ===")
for i, col in enumerate(df.columns):
    sample = str(df[col].iloc[0]) if len(df) > 0 else ''
    sample = sample[:60].replace('\n', ' ')
    line = f"  [{i:3d}] {str(col)[:50]}"
    print(line)

# --- Full row count ---
df_count = pd.read_excel(FILE, sheet_name=0, header=0, usecols=[0])
print(f"\nTotal rows (approx): {len(df_count)}")
