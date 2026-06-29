// Commercial offerings — distilled from the reps' field notes (פרי, טום).
// Embedded (no network). Hybrid-ready: a clean array that can later be
// backed by Firestore/manager edits. Consumed by offerings.js + app.js.
// price.unit: 'total' (₪ for whole system) | 'perSqm' (₪ per מ"ר).
window.VOLTA_OFFERINGS = [
  {
    id: 'system-traditional', name: 'מערכת בבעלות — פאנלים מסורתיים', emoji: '🔋',
    category: 'system', appliesTo: ['concrete','tiles','spanish_tiles','ground'],
    minArea: 70, price: { min: 50000, max: 90000, unit: 'total' }, roi: '5-8 שנים',
    financing: 'purchase',
    highlights: ['פאנלים מסורתיים על בטון / רעפים', 'שטח 60-69 מ"ר — גבולי, המומחה יאשר'],
    note: 'מערכת בבעלות הלקוח. שטח מומלץ 70 מ"ר ומעלה.',
  },
  {
    id: 'system-apollo', name: 'מערכת בבעלות — אפולו (פאנלים גמישים)', emoji: '🧩',
    category: 'system',
    appliesTo: ['light','corrugated','onduline','membrane','polycarbonate','insulated','light_tile'],
    minArea: null, price: { min: 90000, max: 130000, unit: 'total' }, roi: null,
    financing: 'purchase',
    highlights: ['פאנלים גמישים של אפולו', 'לבנייה קלה ולמשטחים שאינם בטון/רעפים', 'יתרון: מונע נזילות'],
    note: 'מתאים כשהמשטח אינו נושא פאנל מסורתי. החזר השקעה — לפי המומחה.',
  },
  {
    id: 'leasing', name: 'ליסינג — השכרת גג', emoji: '🤝',
    category: 'leasing', appliesTo: 'all',
    minArea: 100, price: null, roi: null, financing: 'leasing',
    highlights: ['מענק ראשוני עד 15,000 ₪', 'תשואה שנתית 2,500-5,000 ₪',
                 'חוזה ל-25 שנה', 'אפשרות רכישת המערכת אחרי מספר שנים (לפי המומחה)'],
    note: 'השכרת גג הבית. שטח מינימלי לליסינג — 100 מ"ר.',
  },
  {
    id: 'pergola-unikit', name: 'פרגולה סולארית — יוניקיט (הקמה חדשה)', emoji: '☀️',
    category: 'pergola', appliesTo: ['pergola','wood_pergola','alu_pergola'],
    minArea: 40, price: null, roi: null, financing: 'purchase',
    highlights: ['הקמת פרגולת יוניקיט עצמאית — מינימום 40 מ"ר',
                 'פרגולה כחלק מגג בית — נספרת לשטח הכולל (מינ׳ גג 60 מ"ר), ללא מינימום נפרד',
                 'מעל 50 מ"ר — נדרש היתר עירייה (תהליך אישורים)'],
    note: 'אין טווח מחירים קבוע — לפי תכנון.',
  },
  {
    id: 'pergola-build', name: 'הקמת פרגולה (בנייה)', emoji: '🏗',
    category: 'pergola', appliesTo: ['pergola','wood_pergola','alu_pergola'],
    minArea: null, price: { min: 600, max: 900, unit: 'perSqm' }, roi: null,
    financing: 'purchase',
    highlights: ['מחיר הבנייה נפרד ממחיר המערכת'],
    note: 'עלות בניית הפרגולה עצמה.',
  },
];
