import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PARENT = path.dirname(ROOT);
const DEFAULT_PLAN = path.join(ROOT, '.verify-artifacts', 'firebase-auth-migration-plan.json');
const planPath = path.resolve(process.cwd(), process.argv[2] || process.env.FIREBASE_AUTH_MIGRATION_PLAN || DEFAULT_PLAN);
const results = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function check(name, ok, detail = '') {
  results.push({ type: 'check', name, ok, detail });
}

function warn(name, detail = '') {
  results.push({ type: 'warn', name, ok: true, detail });
}

function evaluateConfig() {
  const configJs = read('config.js');
  return new Function(`${configJs}; return { CONFIG, DEFAULT_ROOF_CONFIG };`)();
}

function verifyMigrationPlan() {
  if (!fs.existsSync(planPath)) {
    return { ok: false, detail: `missing plan artifact: ${planPath}` };
  }
  const result = spawnSync(process.execPath, [path.join(ROOT, 'verify-firebase-auth-migration-plan.mjs'), planPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return {
    ok: result.status === 0,
    detail: output || `exit ${result.status}`,
  };
}

const { CONFIG, DEFAULT_ROOF_CONFIG } = evaluateConfig();
const firebaseJson = JSON.parse(read('firebase.json'));
const appPkg = JSON.parse(read('package.json'));
const parentPkgPath = path.join(PARENT, 'package.json');
const parentPkg = fs.existsSync(parentPkgPath) ? JSON.parse(fs.readFileSync(parentPkgPath, 'utf8')) : null;

check('CONFIG.AUTH_MODE is firebase', CONFIG.AUTH_MODE === 'firebase', `current: ${CONFIG.AUTH_MODE}`);
check('Default manager bootstrap password is disabled', DEFAULT_ROOF_CONFIG.managerPassword === '');
check('Firebase Hosting deploys generated dist folder', firebaseJson.hosting?.public === 'dist');
check('Firebase Hosting predeploy runs verify:deploy', (firebaseJson.hosting?.predeploy || []).includes('npm run verify:deploy'));
check('Firestore production rules file is selected', firebaseJson.firestore?.rules === 'firestore.rules');
check('App deploy gate runs production readiness', /verify:production-readiness/.test(appPkg.scripts?.['verify:deploy'] || ''));
if (parentPkg) {
  check('Parent deploy gate runs production readiness', /verify:production-readiness/.test(parentPkg.scripts?.['verify:deploy'] || ''));
}

const fb = CONFIG.FIREBASE_CONFIG || {};
check('Firebase project config is internally consistent', (
  /^AIza[0-9A-Za-z_-]+$/.test(fb.apiKey || '') &&
  fb.authDomain === `${fb.projectId}.firebaseapp.com` &&
  [`${fb.projectId}.appspot.com`, `${fb.projectId}.firebasestorage.app`].includes(fb.storageBucket) &&
  new RegExp(`^1:${fb.messagingSenderId}:web:[0-9a-f]+$`).test(fb.appId || '')
));

const plan = verifyMigrationPlan();
check('Firebase Auth migration plan artifact verifies', plan.ok, plan.detail);
warn('External Firebase Auth cutover must be verified outside this repo', 'Confirm real Auth users exist, role custom claims are set, agents/{uid} profiles are imported, and one user from each role can sign in.');

for (const result of results) {
  const label = result.type === 'warn' ? 'WARN' : (result.ok ? 'PASS' : 'FAIL');
  console.log(`${label} ${result.name}${result.detail ? ' - ' + result.detail : ''}`);
}

const failed = results.filter(result => result.type === 'check' && !result.ok);
if (failed.length) {
  console.error(`PRODUCTION_READINESS_FAILED: ${failed.length}`);
  process.exitCode = 1;
} else {
  console.log(`PRODUCTION_READINESS_OK: ${results.filter(result => result.type === 'check').length} checks, ${results.filter(result => result.type === 'warn').length} warnings`);
}
