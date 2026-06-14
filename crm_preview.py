"""
Step 1b: Show relevant columns + 5 anonymized sample rows.
No personal data (names, phones, emails, IDs) is printed.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import pandas as pd
import warnings
warnings.filterwarnings('ignore')

FILE = r"C:\Users\Sinaymer\Desktop\City volta solar\Residential - Last view used.xlsx"

# Relevant column indices and their labels
RELEVANT_COLS = {
    10:  'Status',
    20:  'City',
    21:  'Regional Council',
    24:  'Description',
    25:  'Customer Description',
    26:  'Site Description',
    28:  'Pre-meeting Remarks',
    29:  'Building Type',
    33:  'Roof Size',
    35:  'Roof Type',
    37:  'False SE Call',
    38:  'False SE Call Reasons',
    39:  'Irrelevant - Before Meeting',
    41:  'Date Of Expert Call',
    42:  'Date Of Frontal Meeting',
    43:  'Date Of Video Meeting',
    44:  'Date Of Phone Meeting',
    60:  'Lead Source',
    78:  'Meeting Summary',
    84:  'Irrelevant - After Meeting',
    87:  'Losing Customer Reason',
    130: 'Remarks for CSL',
    137: 'Installation Notes',
    193: 'Electrical Infrastructure',
    251: 'Cancellation Reason',
    299: 'Podio Item ID',
    302: 'InternalID',
}

# Columns that may contain personal data — suppress their content in preview
PII_COLS = {0, 4, 13, 14, 15, 16, 17, 19, 191, 192, 194, 195}

print("=== RELEVANT COLUMNS IDENTIFIED ===")
for idx, label in RELEVANT_COLS.items():
    print(f"  col[{idx:3d}] = {label}")

# Load only relevant columns
col_indices = list(RELEVANT_COLS.keys())
df = pd.read_excel(FILE, sheet_name=0, header=0, usecols=col_indices, nrows=200)
df.columns = [RELEVANT_COLS[i] for i in col_indices]

# Drop rows where City is empty (no settlement = no operational value)
df = df[df['City'].notna() & (df['City'].astype(str).str.strip() != '') & (df['City'].astype(str) != 'nan')]

print(f"\n=== SAMPLE: First 5 rows with a City value (anonymized) ===")
for row_i, (_, row) in enumerate(df.head(5).iterrows()):
    print(f"\n--- Row {row_i+1} ---")
    for col_name, val in row.items():
        val_str = str(val).strip() if pd.notna(val) else ''
        if val_str in ('', 'nan', 'NaT', 'None'):
            continue
        # Truncate long text fields
        if len(val_str) > 120:
            val_str = val_str[:120] + '…'
        print(f"  {col_name:<30}: {val_str}")

# --- Value distributions for key fields ---
print("\n=== STATUS VALUES (distribution) ===")
print(df['Status'].value_counts(dropna=False).head(20).to_string())

print("\n=== ROOF TYPE VALUES (distribution) ===")
print(df['Roof Type'].value_counts(dropna=False).head(20).to_string())

print("\n=== BUILDING TYPE VALUES (distribution) ===")
print(df['Building Type'].value_counts(dropna=False).head(20).to_string())

print("\n=== FALSE SE CALL (distribution) ===")
print(df['False SE Call'].value_counts(dropna=False).head(10).to_string())

print("\n=== IRRELEVANT BEFORE MEETING (distribution) ===")
print(df['Irrelevant - Before Meeting'].value_counts(dropna=False).head(10).to_string())

print("\n=== CANCELLATION REASON (distribution) ===")
print(df['Cancellation Reason'].value_counts(dropna=False).head(15).to_string())

print("\n=== TOP 15 CITIES ===")
print(df['City'].value_counts().head(15).to_string())
