import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validators from './firebase-auth-claims.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const claimsInput = process.argv[2] || path.join(ROOT, 'firebase-auth-claims.example.json');
const profilesInput = process.argv[3] || path.join(ROOT, 'firebase-auth-profiles.example.json');
const claimsFile = path.resolve(process.cwd(), claimsInput);
const profilesFile = path.resolve(process.cwd(), profilesInput);
const claimsPayload = JSON.parse(fs.readFileSync(claimsFile, 'utf8'));
const profilesPayload = JSON.parse(fs.readFileSync(profilesFile, 'utf8'));
const result = validators.validateClaimsPayload(claimsPayload, profilesPayload);

if (result.ok) {
  console.log(`FIREBASE_AUTH_CLAIMS_OK: ${result.count} claim set(s)`);
} else {
  console.error(`FIREBASE_AUTH_CLAIMS_FAILED: ${result.errors.length}`);
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
