import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validators from './firebase-auth-profiles.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] || path.join(ROOT, 'firebase-auth-profiles.example.json');
const file = path.resolve(process.cwd(), input);
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const result = validators.validateProfilesPayload(payload);

if (result.ok) {
  console.log(`FIREBASE_AUTH_PROFILES_OK: ${result.count} profiles, ${result.activeManagers} active manager(s)`);
} else {
  console.error(`FIREBASE_AUTH_PROFILES_FAILED: ${result.errors.length}`);
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
}
