import sys, io, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd, warnings
warnings.filterwarnings('ignore')
BASE = r"C:\Users\Sinaymer\Desktop\City volta solar"
locs = json.load(open(BASE+r"\localities.json", encoding='utf-8'))

from collections import defaultdict
council_members = defaultdict(list)
for r in locs:
    c = (r.get('שם_מועצה') or '').strip()
    n = (r.get('שם_ישוב') or '').strip()
    council_members[c].append(n)

# Show councils that look southern
for c in council_members:
    if any(k in c for k in ['ערבה','אילות','רמת נגב','רמת-נגב','תיכונה','נגב']):
        print(f'\n=== {c} ({len(council_members[c])}) ===')
        print('  ' + ', '.join(council_members[c]))
