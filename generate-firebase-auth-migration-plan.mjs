import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import planner from './firebase-auth-migration-plan.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args.splice(outIndex, 2)[1] : '';
if (outIndex >= 0 && !outFile) {
  console.error('FIREBASE_AUTH_MIGRATION_PLAN_FAILED: --out requires a file path');
  process.exit(1);
}
const profilesInput = args[0] || path.join(ROOT, 'firebase-auth-profiles.example.json');
const claimsInput = args[1] || path.join(ROOT, 'firebase-auth-claims.example.json');
const profilesFile = path.resolve(process.cwd(), profilesInput);
const claimsFile = path.resolve(process.cwd(), claimsInput);
const profilesPayload = JSON.parse(fs.readFileSync(profilesFile, 'utf8'));
const claimsPayload = JSON.parse(fs.readFileSync(claimsFile, 'utf8'));
const plan = planner.buildMigrationPlan(profilesPayload, claimsPayload);

if (!plan.ok) {
  console.error(`FIREBASE_AUTH_MIGRATION_PLAN_FAILED: ${plan.errors.length}`);
  for (const error of plan.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const text = JSON.stringify(plan, null, 2) + '\n';
  if (outFile) {
    const target = path.resolve(process.cwd(), outFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    console.log(`FIREBASE_AUTH_MIGRATION_PLAN_WRITTEN: ${path.relative(process.cwd(), target)}`);
  } else {
    console.log(text.trimEnd());
  }
}
