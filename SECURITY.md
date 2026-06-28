# Security Notes

## Current state

This app is a static browser app with a custom agent login stored in Firestore.
The client now stores new agent passwords as salted PBKDF2 hashes and migrates
older plain-text or SHA-256 password records on successful login.

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

## Suggested Firestore access model

- `agents`: readable only by authenticated managers; users may read their own
  profile if needed.
- `requests`: agents may create their own requests and read their own request
  history; leads/managers may read and update review fields.
- `settlementOverrides`: read by authenticated users; written only by managers.

Do not deploy open rules such as `allow read, write: if true`.
