# Volta Agent Tool

כלי דפדפן פנימי לנציגי Volta Solar: בדיקת יישובים, כשירות גג, מאגר ידע,
בקשות חריגה ופאנל מנהל.

## הרצה מקומית

מהתיקייה הזו:

```powershell
nvm use
npm install
npm run serve
```

לאחר מכן לפתוח את הכתובת שהשרת מדפיס, בדרך כלל:

```text
http://127.0.0.1:8080
```

אפשר גם לפתוח את `index.html` ישירות בדפדפן, אבל שרת מקומי קרוב יותר לסביבת
פריסה אמיתית ומפחית בעיות טעינה.
פקודת `serve` בונה ומגישה את `dist`, כדי שהתצוגה המקומית תהיה זהה יותר למה
שנשלח ל-Firebase Hosting ולא תחשוף קבצי עבודה גולמיים.

## בדיקות

```powershell
npm test
npm run validate:firebase-auth-profiles
npm run validate:firebase-auth-claims
npm run verify:vendor
npm run verify:rules
npm run verify:production-readiness
npm run verify:local
npm run verify:security
npm run verify:all
```

The parent `City volta solar` folder exposes the same release gate wrappers:

```powershell
npm run verify:secrets
npm run validate:firebase-auth-profiles
npm run validate:firebase-auth-claims
npm run plan:firebase-auth-migration
npm run verify:vendor
npm run verify:rules
npm run verify:production-readiness
npm run verify:local
npm run verify:map
npm run verify:editor
npm run verify:csp
npm run verify:security
npm run verify:deps
```

Set `CHROME_PATH` first if Chrome is not installed in the default Windows
location.
`verify:rules` requires Java 21 or another Firebase Emulator-compatible JDK on
`PATH`, `JAVA_HOME`, `VOLTA_JAVA_HOME`, or a portable JDK under `.tools/`.
GitHub Actions installs this automatically.
The supported Node runtime is Node 22; use `nvm use` or another Node 22 manager
before running release gates.

For a full local release check, prefer running from the parent folder:

```powershell
npm run verify:all
```

That root command runs tests, dependency audits, secret scanning, vendored asset
verification, Firebase Auth Firestore Rules emulator tests, profile/claim
validation, migration-plan generation, security checks, CSP, map, and editor
browser checks.
It is the strict CI/release gate.

For day-to-day verification on a machine without Java, use:

```powershell
npm run verify:local
```

This keeps the fast application, dependency, secret, CSP, map, and editor
checks available, but it does not replace `verify:all` before release.

After Firebase Auth migration is complete and `CONFIG.AUTH_MODE` is set to
`firebase`, deploy production with the gated command from the parent folder:

```powershell
npm run deploy:production
```

It runs `verify:deploy`, including Firestore Rules emulator tests, before
`firebase deploy --only hosting,firestore:rules`.
`verify:deploy` also runs `verify:production-readiness`, which blocks production
while `CONFIG.AUTH_MODE` is still `legacy` or the Firebase Auth migration-plan
artifact is missing/invalid.

GitHub Actions is ready in `.github/workflows/verify.yml` and runs the same
`npm run verify:all` gate on push and pull requests.
Dependabot is configured in `.github/dependabot.yml` for weekly npm and
GitHub Actions updates.
The project pins the Node baseline in `.nvmrc` and enforces `package.json`
engines through `.npmrc`.
Formatting and line endings are normalized through `.editorconfig` and
`.gitattributes`.

הבדיקות מכסות את הלוגיקה העסקית המרכזית:

- הרשאות וניהול נציגים
- אימות סיסמאות ומיגרציה ל-hash
- בקשות חריגה
- כשירות גג
- סימולציית בית/הצללה
- מפת ישראל ויישובים
- ולידציה של הגדרות גג

## מבנה מרכזי

- `index.html` - מסך האפליקציה וטעינת הסקריפטים.
- `app.js` - חיבור UI ראשי, התחברות, אשף, בקשות ומאגר ידע.
- `auth.js` - הרשאות, session וסיסמאות.
- `firebase.js` - שכבת Firebase/Firestore, כולל מסלול Firebase Auth אופציונלי.
- `admin.js` - פאנל מנהל, בקשות ונציגים.
- `wizard.js` - לוגיקת כשירות גג.
- `requests.js` - לוגיקת בקשות חריגה.
- `roof-store.js` - הגדרות כשירות גג עם Firestore כשזמין ו-localStorage כגיבוי.
- `settlements.js` / `settlements-data.js` - נתוני יישובים וחיפוש.
- `sim.js`, `sim-state.js`, `shading.js` - סימולציית תלת ממד והצללה.
- `tests/` - בדיקות Node.

## אבטחה

קראו את `SECURITY.md` ואת `PRODUCTION.md` לפני פריסה אמיתית.

המצב הנוכחי טוב יותר מסיסמאות גלויות: סיסמאות חדשות נשמרות כ-PBKDF2 עם salt,
וסיסמאות ישנות עוברות מיגרציה בכניסה מוצלחת. עם זאת, האפליקציה עדיין סטטית
ורצה בדפדפן, לכן אסור להסתמך על בדיקות הרשאה בצד לקוח בלבד.

לפני שימוש רחב:

1. להגדיר Firestore Security Rules סגורים.
2. לעבור ל-Firebase Auth או מנגנון זהות שרת אמיתי.
3. להגביל דומיינים ומפתחות בפרויקט Firebase.
4. לבדוק שכל שינוי מנהל נשמר עם הרשאה מתאימה.

קיימים קבצי בסיס לפריסה:

- `firebase.json`
- `firestore.rules`
- `firestore.rules.example`

ברירת המחדל היא `CONFIG.AUTH_MODE: 'legacy'` כדי לא לשבור את המשתמשים הקיימים.
אחרי יצירת משתמשים ב-Firebase Auth, claims לתפקידים, ופרופילי `agents/{uid}`,
אפשר לעבור ל-`CONFIG.AUTH_MODE: 'firebase'`.
במצב Firebase Auth, בקשות הנציג נטענות לפי `agentId == uid`, ורק ראש צוות/מנהל
מאזינים לתור הבקשות המלא.
לפני ייבוא פרופילי `agents/{uid}`, אפשר לבדוק JSON מקומי עם:

```powershell
npm run validate:firebase-auth-profiles -- path\to\profiles.json
npm run validate:firebase-auth-claims -- path\to\claims.json path\to\profiles.json
npm run plan:firebase-auth-migration -- path\to\profiles.json path\to\claims.json
```

ה־UID חייב להיות גם Firebase Auth UID תקין וגם Firestore document id בטוח:
ללא `/`, ללא תווי בקרה, לא `.` או `..`, ועד 128 תווים. אימיילים בפרופילים
צריכים להיות lowercase וללא רווחים בתחילה/בסוף.

במצב `firebase`, יצירת משתמש וסיסמה מתבצעת ב-Firebase Auth/Admin tooling.
לאחר יצירת המשתמש והגדרת custom claims, מנהל יכול ליצור באפליקציה את פרופיל
`agents/{uid}` באמצעות Firebase Auth UID קיים בלבד; האפליקציה אינה שומרת
סיסמאות במצב זה.

## גיבוי

לפני שינוי גדול, מומלץ ליצור zip מלא של תיקיית `City volta solar`. כבר נוצר
גיבוי קודם בשולחן העבודה בשם דומה ל:

```text
City-volta-solar-backup-YYYYMMDD-HHMMSS.zip
```

## הערות תחזוקה

- כאשר מוסיפים טקסט שמגיע ממנהל/Firestore/קובץ נתונים, יש להציג אותו דרך
  escaping ולא להכניסו ישירות ל-`innerHTML`.
- כאשר מוסיפים יכולת מנהל חדשה, יש לבדוק אותה גם ב-UI וגם ברמת כללי Firestore.
- הגדרות גג נשמרות ל-`roofConfig/default` כאשר Firestore זמין; ללא Firestore הן
  נשמרות מקומית בדפדפן כגיבוי.
- רצוי לפצל בהמשך את `app.js` ו-`admin.js` למודולים קטנים יותר.
