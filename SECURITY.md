# Security Notes

## Current state

This app is a static browser app with a custom agent login stored in Firestore.
The client now stores new agent passwords as salted PBKDF2 hashes and migrates
older plain-text or SHA-256 password records on successful login.

The codebase also includes an optional Firebase Auth path controlled by
`CONFIG.AUTH_MODE`. Keep `legacy` until Firebase Auth users, role claims, and
`agents/{uid}` profile documents are ready; then switch to `firebase` so password
material is no longer delivered to browsers.

This is an important improvement, but it is not a full authorization boundary.
Browser code and `localStorage` can be inspected or changed by a determined user.

## Before production use

1. Enable strict Firestore Security Rules. Do not allow public read/write access
   to `agents`, `requests`, or `settlementOverrides`.
2. Prefer Firebase Authentication for real identity. The custom `agents`
   collection should become profile/role metadata, not the password authority.
3. Keep at least one active manager account. The UI guards this, but Firestore
   rules or backend functions should enforce it too.
4. Review the Firebase project API key restrictions and allowed domains.
5. Treat all manager-editable text as untrusted input. The main wizard rendering
   escapes dynamic labels, notes, and outcomes, but new UI should keep doing so.
6. Do not use a shared default bootstrap password. Browser bootstrap rejects the
   old demo password `volta`; production should provision the first manager
   outside the browser.
7. Run `npm run verify:security` from this folder and `npm run verify:deps`
   from the parent project folder before production
   deployments so dependency advisories block the release.
8. Keep Firebase Hosting deploys behind `npm run verify:deploy`; it blocks
   production deploys while `CONFIG.AUTH_MODE` is still `legacy`.
9. Validate Firebase Auth profile imports with
   `npm run validate:firebase-auth-profiles -- path\to\profiles.json`; imported
   `agents/{uid}` documents must not contain password material. UIDs must be
   safe Firestore document ids, and profile emails must already be trimmed and
   lowercase.
10. Validate Firebase Auth custom claims with
    `npm run validate:firebase-auth-claims -- path\to\claims.json path\to\profiles.json`;
    each claim role must match the corresponding profile role.
11. Generate a dry-run Firebase Auth migration plan with
    `npm run plan:firebase-auth-migration -- path\to\profiles.json path\to\claims.json`
    before changing production data.
12. Keep `DEFAULT_ROOF_CONFIG.managerPassword` empty. `npm run verify:security`
    blocks any accidental return of an embedded first-manager password.
13. Run `npm run verify:secrets` before sharing or deploying. It rejects
    high-confidence secrets such as private keys, service-account JSON, `.env`
    files, and embedded manager bootstrap passwords.
14. In Firebase Auth mode, do not delete `agents/{uid}` profile documents.
    Archive/deactivate profiles instead so request history and audit records
    keep their actor references.
15. Production Firestore rules require `roofConfig/default` to keep
    `managerPassword` empty and reject malformed top-level roof settings.
16. Keep Firebase SDK runtime URLs aligned with the audited npm dependency.
    `npm run verify:security` fails if `firebase-bootstrap.js` loads a
    different `www.gstatic.com/firebasejs` version than `package-lock.json`.

See `PRODUCTION.md` for the required migration checklist.

## Files added for production hardening

- `firebase.json` adds Firebase Hosting headers and points Firestore deploys to
  `firestore.rules`.
- `firestore.rules` is the target locked-down ruleset for the Firebase Auth
  migration. It intentionally requires authenticated users and role claims.
- `firestore.rules.example` is kept as a readable reference copy.

Do not deploy `firestore.rules` until Firebase Auth users and role claims are in
place; the current custom login does not populate `request.auth`.

## Suggested Firestore access model

- `agents`: readable only by authenticated managers; users may read their own
  profile if needed.
- `requests`: agents may create their own requests and read their own request
  history; leads/managers may read and update review fields.
- `settlementOverrides`: read by authenticated users; written only by managers.
- `roofConfig`: read by authenticated users; written only by managers.
- `auditLogs`: append-only from leads/managers, readable by managers, not
  editable or deletable from the client.
- Rules also bound user-controlled text fields such as request reasons,
  manager notes, agent profile fields, and audit metadata to practical lengths.

Do not deploy open rules such as `allow read, write: if true`.
