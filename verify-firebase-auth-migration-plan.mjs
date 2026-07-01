import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const planPath = path.resolve(process.cwd(), process.argv[2] || path.join(ROOT, '.verify-artifacts', 'firebase-auth-migration-plan.json'));

function fail(message) {
  console.error(`FIREBASE_AUTH_MIGRATION_PLAN_VERIFY_FAILED: ${message}`);
  process.exit(1);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

if (!fs.existsSync(planPath)) fail(`missing plan file: ${planPath}`);

let plan;
try {
  plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
} catch (err) {
  fail(`plan is not valid UTF-8 JSON: ${err.message}`);
}

if (!plan || plan.ok !== true) fail('plan is not marked ok');
for (const key of ['authUsers', 'customClaims', 'firestoreAgents']) {
  if (!Array.isArray(plan[key])) fail(`${key} must be an array`);
  if (plan.counts?.[key] !== plan[key].length) fail(`${key} count does not match array length`);
}

const authByUid = new Map();
for (const user of plan.authUsers) {
  if (!user.uid || authByUid.has(user.uid)) fail(`duplicate or missing auth uid: ${user.uid || '(missing)'}`);
  if (typeof user.email !== 'string' || user.email !== user.email.trim() || user.email !== user.email.toLowerCase()) {
    fail(`auth user ${user.uid} email is not normalized`);
  }
  authByUid.set(user.uid, user);
}

for (const entry of plan.customClaims) {
  if (!authByUid.has(entry.uid)) fail(`claims for unknown uid: ${entry.uid}`);
  if (!isPlainObject(entry.claims) || !['agent', 'lead', 'manager'].includes(entry.claims.role)) {
    fail(`claims for ${entry.uid} are missing a valid role`);
  }
}

for (const entry of plan.firestoreAgents) {
  const uid = String(entry.path || '').replace(/^agents\//, '');
  if (!entry.path || !entry.path.startsWith('agents/') || !authByUid.has(uid)) fail(`profile path does not match an auth user: ${entry.path}`);
  if (!isPlainObject(entry.data)) fail(`profile ${entry.path} data must be an object`);
  if ('password' in entry.data || 'passwordHash' in entry.data) fail(`profile ${entry.path} contains password material`);
  if (entry.data.email !== authByUid.get(uid).email) fail(`profile ${entry.path} email does not match auth user`);
}

if (!Array.isArray(plan.checklist) || !plan.checklist.some(item => /verify:deploy/.test(item))) {
  fail('checklist must include the deploy verification gate');
}

console.log(`FIREBASE_AUTH_MIGRATION_PLAN_VERIFIED: ${plan.authUsers.length} users`);
