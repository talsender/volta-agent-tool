const CONFIG = {
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5wgyw1axUjpCSEFpaHnOk0VBMVxpb-RQ3WSPRTfgQ7QBAvMWKJUZE1_ed_GugH3auUmA_aO3ycHK3/pub?output=csv',
  ROOF_SIZE_GOOD: 70,
  ROOF_SIZE_BORDERLINE: 60,
  ROOF_AGE_WARNING: 25,

  // הדבק כאן את ערכי ה-config מפרויקט ה-Firebase שלך.
  // ניהול בקשות החריגה והנציגים נשמר ב-Firestore.
  FIREBASE_CONFIG: {
    apiKey: 'REPLACE_ME',
    authDomain: 'REPLACE_ME.firebaseapp.com',
    projectId: 'REPLACE_ME',
    storageBucket: 'REPLACE_ME.appspot.com',
    messagingSenderId: 'REPLACE_ME',
    appId: 'REPLACE_ME',
  },
};

// Single source of truth for roof eligibility. Manager-editable in a later
// phase; for now these embedded defaults drive the wizard offline.
const DEFAULT_ROOF_CONFIG = {
  totalSizeThresholds: { good: 70, borderline: 60 }, // m², vs sum of all materials
  tilesAgeWarning: 25,                               // years
  managerPassword: 'volta',

  materials: [
    {
      id: 'concrete', label: 'בטון שטוח', emoji: '🟫',
      baseFlagClass: 'ok', baseAction: null, geometry: 'flat',
      messages: { flagMsg: '', escalateNote: '', stopReason: '', stopScript: '' },
      sizeRules: [{ upTo: null, outcome: 'ok', message: '' }],
    },
    {
      id: 'tiles', label: 'רעפים', emoji: '🔺',
      baseFlagClass: 'ok', baseAction: 'tiles-age', geometry: 'pitched',
      messages: { flagMsg: '', escalateNote: '', stopReason: '', stopScript: '' },
      sizeRules: [{ upTo: null, outcome: 'ok', message: '' }],
    },
    {
      id: 'pergola', label: 'פרגולה סולארית', emoji: '☀️',
      baseFlagClass: 'ok', baseAction: 'flag', geometry: 'pergola',
      messages: { flagMsg: 'פרגולה סולארית — פאנלים מיוחדים, המומחה יאשר את הסוג', escalateNote: '', stopReason: '', stopScript: '' },
      sizeRules: [{ upTo: null, outcome: 'ok', message: '' }],
    },
    {
      id: 'insulated', label: 'פאנל מבודד', emoji: '🔧',
      baseFlagClass: 'warn', baseAction: 'escalate', geometry: 'insulated',
      messages: { flagMsg: '', escalateNote: 'פאנל מבודד — נדרש אישור מנהל. יש מקרים שהושלמו בהצלחה.', stopReason: '', stopScript: '' },
      sizeRules: [{ upTo: null, outcome: 'ok', message: '' }],
    },
    {
      id: 'corrugated', label: 'איסכורית', emoji: '🏗',
      baseFlagClass: 'warn', baseAction: 'flag', geometry: 'corrugated',
      messages: { flagMsg: 'איסכורית — נדרש אישור קונסטרוקטור לחוזק הגג. המומחה יבדוק.', escalateNote: '', stopReason: '', stopScript: '' },
      sizeRules: [{ upTo: null, outcome: 'ok', message: '' }],
    },
    {
      id: 'light', label: 'בנייה קלה / מייטק', emoji: '❌',
      baseFlagClass: 'bad', baseAction: 'stop', geometry: 'light',
      messages: { flagMsg: '', escalateNote: '', stopReason: 'בנייה קלה / מייטק — לא מתאים להתקנה', stopScript: 'לצערנו לא מתקינים על גגות בנייה קלה או מייטק. תודה על הפנייה!' },
      sizeRules: [{ upTo: null, outcome: 'ok', message: '' }],
    },
  ],
};

// Node export (for tests); harmless in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign(module.exports || {}, { CONFIG, DEFAULT_ROOF_CONFIG });
}
