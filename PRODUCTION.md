# Production Runbook

## Current deployment status

The app can run as a static browser app, but the current custom login is not a
complete production authorization boundary. Do not expose real agent/password
data to broad users until Firebase Authentication and Firestore Rules are active.

## Required production migration

1. Enable Firebase Authentication with Email/Password or SSO.
2. Create users in Firebase Auth. The Firebase Auth `uid` should become the
   agent id used in Firestore. Use stable UIDs that are also safe Firestore
   document ids: no `/`, no control characters, not `.` or `..`, and at most
   128 characters.
3. Store only profile metadata in `agents/{uid}`:
   - `name`
   - `email`
   - `phone`
   - `role`
   - `active`
   - timestamps
4. Keep profile emails trimmed and lowercase before import. The validators
   reject mixed-case or whitespace-padded emails so Firebase Auth users,
   claims, and Firestore profiles line up deterministically.
5. Do not store `password` or `passwordHash` in Firestore after migration.
6. Set server-controlled custom claims for roles:
   - `agent`
   - `lead`
   - `manager`
6. Set `CONFIG.AUTH_MODE` in `config.js` to `firebase`.
7. Deploy `firestore.rules`.
8. Verify the app with one user from each role.

In `firebase` auth mode, the app signs in through Firebase Auth and loads the
agent profile from `agents/{uid}`. Password creation and password reset must be
handled in Firebase Auth/Admin tooling, not by writing to Firestore.
After the Auth user and role custom claims exist, a manager can create the
matching `agents/{uid}` profile in the app by entering the existing Firebase
Auth UID. The app writes only profile metadata in Firebase mode.

Validate profile-only agent JSON before import with:

```powershell
npm run validate:firebase-auth-profiles -- path\to\profiles.json
npm run validate:firebase-auth-claims -- path\to\claims.json path\to\profiles.json
npm run plan:firebase-auth-migration -- path\to\profiles.json path\to\claims.json
```

## First manager account

Do not use browser bootstrap with a shared/default password in production. The
old demo password `volta` is intentionally disabled. Create the first manager
out-of-band through Firebase Console/Admin tooling, then manage additional users
from the app after Firestore rules and Firebase Auth are active.

## Pre-deploy checks

Prefer running the full release gate from the parent `City volta solar` folder:

```powershell
nvm use
npm install
npm run verify:all
```

The root `verify:all` runs tests, dependency audits, secret scanning, vendored
asset verification, Firestore Rules emulator tests, Firebase Auth profile/claim
validation, migration-plan generation, security checks, CSP, map, and editor
browser checks.

The same checks are also available from this app folder:

```powershell
nvm use
npm install
npm run build
npm test
npm run audit
npm run verify:secrets
npm run verify:vendor
npm run verify:rules
npm run verify:production-readiness
npm run verify:local
npm run validate:firebase-auth-profiles
npm run validate:firebase-auth-claims
npm run verify:security
npm run verify:all
```

From the parent project folder, the individual wrappers are:

```powershell
npm run verify:deps
npm run verify:secrets
npm run verify:vendor
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
```

The repository also includes `.github/workflows/verify.yml`, which runs the
same full verification gate in GitHub Actions with read-only repository
permissions.
`.github/dependabot.yml` is configured for weekly npm and GitHub Actions update
pull requests so dependency drift is visible.
`.nvmrc`, `package.json` engines, and `.npmrc` keep the local and CI Node/npm
runtime aligned.
`.editorconfig` and `.gitattributes` keep line endings and binary handling
consistent across Windows, CI, and GitHub.

The browser-based checks use Google Chrome. If Chrome is installed in a
non-standard location, set `CHROME_PATH` before running them.
`verify:rules` starts the local Firestore emulator and runs behavioral tests
against `firestore.rules`, including role-scoped agent reads, request decisions,
roof configuration writes, and append-only audit logs.
It requires Java 21 or another Firebase Emulator-compatible JDK on `PATH`,
`JAVA_HOME`, `VOLTA_JAVA_HOME`, or a portable JDK under `.tools/`; the included
GitHub Actions workflow installs Temurin 21 before running `verify:all`.
Use `verify:local` only for day-to-day development on machines without Java; it
does not replace the strict `verify:all` or `verify:deploy` release gates.
The supported Node runtime is Node 22, enforced by `.nvmrc`, package engines,
and CI.

After Firebase Auth users, role claims, and `agents/{uid}` profiles are ready
and `CONFIG.AUTH_MODE` is changed to `firebase`, also run:

```powershell
npm run verify:production-readiness
npm run verify:deploy
```

`verify:deploy` includes Firestore Rules emulator tests, so Java must be
available before production deployment.
`verify:production-readiness` also requires a verified migration-plan artifact.
By default it reads `.verify-artifacts/firebase-auth-migration-plan.json`; set
`FIREBASE_AUTH_MIGRATION_PLAN` or pass a plan path if the production artifact is
stored elsewhere.

To deploy production hosting and Firestore rules, use the gated production
deploy command from the parent project folder:

```powershell
npm run deploy:production
```

This runs `verify:deploy` first and only then calls
`firebase deploy --only hosting,firestore:rules`.

## Firebase checks

- Firestore rules do not contain `allow read, write: if true`.
- `npm run verify:rules` passes against the local Firestore emulator.
- A non-authenticated browser cannot read `agents`.
- An agent cannot read another agent's request history.
- In Firebase Auth mode, the app subscribes to only the current agent's requests
  for "my requests"; lead/manager users subscribe to the full review queue.
- A lead can review requests but cannot edit agents.
- A manager can edit agents and settlement overrides.
- Permanent settlement approvals update the request and settlement override in
  one Firestore batch; if either write fails, neither partial change should be
  committed.
- Agent profile deletion is disabled in Firestore rules. Archive/deactivate
  users instead of deleting `agents/{uid}` so request and audit history remains
  attributable.
- A manager can write `roofConfig/default`; agents and leads can read it.
- `roofConfig` writes are limited to the `default` document, require known
  top-level fields, bounded numeric thresholds, a non-empty bounded materials
  list, and an empty `managerPassword`.
- Lead/manager review actions and manager changes create `auditLogs` entries.
- `auditLogs` can be created by leads/managers, read by managers, and never
  updated or deleted from the client.
- Current client-side audit logging is a best-effort operational trail. For a
  legally authoritative audit trail, move privileged mutations to Cloud
  Functions or enforce batched writes with Firestore `getAfter()` checks.
- At least two manager accounts exist before deleting or disabling any manager.

## Hosting headers

`firebase.json` includes baseline security headers and a CSP with strict
`script-src` and `style-src` directives that no longer allow `unsafe-inline`.
Inline event handlers were moved to delegated listeners in the main app,
manager panel, roof settings editor, simulation editor, and dock controls.
Inline styles and runtime-injected style blocks were moved into `styles.css`.
Three.js and OrbitControls are vendored under `vendor/three` from the pinned
npm `three` package, so the app does not load simulation scripts from `unpkg`.
`verify:vendor` compares those files to the installed npm package by SHA-256 so
dependency updates cannot silently leave stale runtime files in `vendor/three`.
Firebase SDK modules are loaded from `www.gstatic.com/firebasejs` at the exact
version recorded in `package-lock.json`; `verify:security` fails if the runtime
CDN version drifts from the audited npm dependency version.
The `verify:security` check fails if the app reintroduces `unpkg` scripts or if
a future HTTPS script is added without SRI.
The app uses system font stacks and does not load Google Fonts at runtime;
`style-src` and `font-src` are limited to `'self'`.

Firebase Hosting serves the generated `dist` folder, not the source directory.
`npm run build` copies only runtime assets referenced by `index.html` and writes
`dist/deploy-manifest.json`; raw CSV/XLSX/JSON analysis files, scripts, docs,
tests, and logs are not part of the deployable payload. Local `serve` commands
also serve `dist`, not the source tree.
Because runtime files currently use fixed names such as `app.js` and
`styles.css`, Firebase Hosting sends `Cache-Control: no-cache` for HTML, JS, and
CSS and `no-store` for `deploy-manifest.json`. This prevents users from staying
on stale browser assets after a deploy. If the build later switches to hashed
filenames, those headers can be tightened to long-lived immutable caching.

`firebase.json` runs `npm run verify:deploy` as a Hosting `predeploy` step. This
intentionally blocks `firebase deploy` until the Firebase Auth migration is done
and `CONFIG.AUTH_MODE` is set to `firebase`.
The preferred manual production deploy path is `npm run deploy:production`,
which runs the same gate before deploying Hosting and Firestore rules.

## Rollback

1. Keep a zip backup of the previous static app folder.
2. Keep the previous Firestore rules version in Firebase Console.
3. If a rules deploy blocks users, roll back the rules first, then the static app.
4. Export Firestore before large migrations involving `agents`, `requests`, or
   `settlementOverrides`.
