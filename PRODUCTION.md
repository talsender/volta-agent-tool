# Production Runbook

## Current deployment status

The app can run as a static browser app, but the current custom login is not a
complete production authorization boundary. Do not expose real agent/password
data to broad users until Firebase Authentication and Firestore Rules are active.

## Required production migration

1. Enable Firebase Authentication with Email/Password or SSO.
2. Create users in Firebase Auth. The Firebase Auth `uid` should become the
   agent id used in Firestore.
3. Store only profile metadata in `agents/{uid}`:
   - `name`
   - `email`
   - `phone`
   - `role`
   - `active`
   - timestamps
4. Do not store `password` or `passwordHash` in Firestore after migration.
5. Set server-controlled custom claims for roles:
   - `agent`
   - `lead`
   - `manager`
6. Deploy `firestore.rules`.
7. Verify the app with one user from each role.

## First manager account

Do not use browser bootstrap with a shared/default password in production. The
old demo password `volta` is intentionally disabled. Create the first manager
out-of-band through Firebase Console/Admin tooling, then manage additional users
from the app after Firestore rules and Firebase Auth are active.

## Pre-deploy checks

```powershell
npm install
npm test
```

From the parent project folder, also run:

```powershell
npm run verify:map
npm run verify:editor
```

## Firebase checks

- Firestore rules do not contain `allow read, write: if true`.
- A non-authenticated browser cannot read `agents`.
- An agent cannot read another agent's request history.
- A lead can review requests but cannot edit agents.
- A manager can edit agents and settlement overrides.
- At least two manager accounts exist before deleting or disabling any manager.

## Hosting headers

`firebase.json` includes baseline security headers and a CSP that still allows
`unsafe-inline` because the current UI uses inline event handlers. After the UI
is refactored to event listeners, remove `unsafe-inline` from `script-src`.

## Rollback

1. Keep a zip backup of the previous static app folder.
2. Keep the previous Firestore rules version in Firebase Console.
3. If a rules deploy blocks users, roll back the rules first, then the static app.
4. Export Firestore before large migrations involving `agents`, `requests`, or
   `settlementOverrides`.
