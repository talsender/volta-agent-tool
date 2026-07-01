import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PARENT = path.dirname(ROOT);
const DIST = path.join(ROOT, 'dist');
const LOCK = path.join(ROOT, '.dist-build.lock');
const STALE_LOCK_MS = 120000;
const productionMode = process.argv.includes('--production');
const checks = [];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireDistLock() {
  const started = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, purpose: 'verify-security', startedAt: Date.now() }));
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const age = Date.now() - fs.statSync(LOCK).mtimeMs;
        if (age > STALE_LOCK_MS) {
          fs.rmSync(LOCK, { force: true });
          continue;
        }
      } catch (_) {
        continue;
      }
      if (Date.now() - started > STALE_LOCK_MS) throw new Error('Timed out waiting for dist lock');
      await sleep(150);
    }
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function add(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

await acquireDistLock();
process.on('exit', () => {
  try { fs.rmSync(LOCK, { force: true }); } catch (_) {}
});

const appFiles = ['index.html', 'app.js', 'admin.js', 'settings.js', 'sim-editor.js'];
const inlineHandler = /\bon(?:click|input|change)\s*=/i;
const inlineStyle = /\bstyle\s*=/i;
const inlineScript = /<script(?![^>]*\bsrc=)/i;

for (const file of appFiles) {
  const text = read(file);
  add(`${file}: no inline handlers`, !inlineHandler.test(text));
  add(`${file}: no inline styles`, !inlineStyle.test(text));
}
add('index.html: no inline scripts', !inlineScript.test(read('index.html')));

const indexHtml = read('index.html');
const externalScripts = [...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
add('index.html does not load external font stylesheets', !/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(indexHtml));
add('index.html loads Three.js from local vendor files', /src=["']vendor\/three\/three\.min\.js["']/.test(indexHtml) && /src=["']vendor\/three\/OrbitControls\.js["']/.test(indexHtml));
add('index.html does not load scripts from unpkg', !/https:\/\/unpkg\.com/i.test(indexHtml));
for (const [, src] of externalScripts) {
  if (/^https:\/\//i.test(src)) {
    const tag = externalScripts.find(m => m[1] === src)?.[0] || '';
    add(`external script has SRI: ${src}`, /\bintegrity=["']sha384-[^"']+["']/.test(tag));
    add(`external script is anonymous CORS: ${src}`, /\bcrossorigin=["']anonymous["']/.test(tag));
  }
}

const firebaseBootstrap = read('firebase-bootstrap.js');
const remoteImports = [...firebaseBootstrap.matchAll(/import\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
const appPkg = JSON.parse(read('package.json'));
const appLock = JSON.parse(read('package-lock.json'));
const lockedFirebaseVersion = appLock.packages?.['node_modules/firebase']?.version || '';
const allowedRemoteImports = [
  `https://www.gstatic.com/firebasejs/${lockedFirebaseVersion}/firebase-app.js`,
  `https://www.gstatic.com/firebasejs/${lockedFirebaseVersion}/firebase-firestore.js`,
  `https://www.gstatic.com/firebasejs/${lockedFirebaseVersion}/firebase-auth.js`,
];
const unexpectedRemoteImports = remoteImports.filter(src => !allowedRemoteImports.includes(src));
const missingRemoteImports = allowedRemoteImports.filter(src => !remoteImports.includes(src));
add('Firebase dynamic imports are pinned and allow-listed', unexpectedRemoteImports.length === 0 && missingRemoteImports.length === 0, [...unexpectedRemoteImports.map(src => `unexpected:${src}`), ...missingRemoteImports.map(src => `missing:${src}`)].join(', '));
add('Firebase runtime SDK version matches package lock', !!lockedFirebaseVersion && remoteImports.every(src => src.includes(`/firebasejs/${lockedFirebaseVersion}/`)), lockedFirebaseVersion ? `lock:${lockedFirebaseVersion}` : 'missing lock version');
add('Firebase bootstrap exposes Firestore batch writes', /writeBatch:\s*firestoreMod\.writeBatch/.test(firebaseBootstrap));

const firebaseJson = JSON.parse(read('firebase.json'));
add('Firebase hosting public is dist', firebaseJson.hosting && firebaseJson.hosting.public === 'dist');
add('Firebase hosting predeploy runs deploy verification', (firebaseJson.hosting.predeploy || []).includes('npm run verify:deploy'));

add('App package declares Node engine', appPkg.engines && appPkg.engines.node === '>=22.12.0 <23');
add('App package declares npm engine', appPkg.engines && appPkg.engines.npm === '>=10');
add('Package lock records Node engine', appLock.packages && appLock.packages[''] && appLock.packages[''].engines && appLock.packages[''].engines.node === '>=22.12.0 <23');
add('.nvmrc pins CI Node baseline', read('.nvmrc').trim() === '22.12.0');
const workspaceNpmrcPath = path.join(ROOT, '.npmrc');
const workspaceNpmrc = fs.existsSync(workspaceNpmrcPath) ? fs.readFileSync(workspaceNpmrcPath, 'utf8') : '';
add('npm enforces package engines', /^engine-strict=true$/m.test(workspaceNpmrc));
add('npm keeps CI install output focused', /^fund=false$/m.test(workspaceNpmrc));
add('App package has build script', appPkg.scripts && appPkg.scripts.build === 'node build-hosting.mjs');
add('App package has production deploy gate', appPkg.scripts && /verify-security\.mjs --production/.test(appPkg.scripts['verify:deploy'] || ''));
add('App production deploy runs gate before Firebase deploy', appPkg.scripts && /^npm run verify:deploy && firebase deploy --only hosting,firestore:rules$/.test(appPkg.scripts['deploy:production'] || ''));
add('App serve previews dist', appPkg.scripts && /http-server dist\b/.test(appPkg.scripts.serve || ''));
add('App package has secret scanner', appPkg.scripts && /verify-secrets\.mjs/.test(appPkg.scripts['verify:secrets'] || ''));
add('App package verifies vendored runtime assets', appPkg.scripts && /verify-vendor\.mjs/.test(appPkg.scripts['verify:vendor'] || ''));
add('App package has Firestore rules emulator verification', appPkg.scripts && /verify-firestore-rules\.mjs/.test(appPkg.scripts['verify:rules'] || ''));
add('App package has production readiness verification', appPkg.scripts && /verify-production-readiness\.mjs/.test(appPkg.scripts['verify:production-readiness'] || ''));
add('App deploy verification includes Firestore rules emulator tests', appPkg.scripts && /verify:rules/.test(appPkg.scripts['verify:deploy'] || ''));
add('App deploy verification includes vendor verification', appPkg.scripts && /verify:vendor/.test(appPkg.scripts['verify:deploy'] || ''));
add('App deploy verification includes production readiness gate', appPkg.scripts && /verify:production-readiness/.test(appPkg.scripts['verify:deploy'] || ''));
add('App package has local verification without emulator prerequisite', appPkg.scripts && /verify:local/.test(JSON.stringify(appPkg.scripts)) && !/verify:rules/.test(appPkg.scripts['verify:local'] || ''));
for (const scriptName of ['verify:csp', 'verify:map', 'verify:editor']) {
  add(`App package has ${scriptName}`, appPkg.scripts && new RegExp(`node ${scriptName.replace('verify:', 'verify-')}\\.mjs`).test(appPkg.scripts[scriptName] || ''));
}
add('App package validates Firebase Auth profiles', appPkg.scripts && /validate-firebase-auth-profiles\.mjs/.test(appPkg.scripts['validate:firebase-auth-profiles'] || ''));
add('App package validates Firebase Auth claims', appPkg.scripts && /validate-firebase-auth-claims\.mjs/.test(appPkg.scripts['validate:firebase-auth-claims'] || ''));
add('App package plans Firebase Auth migration', appPkg.scripts && /generate-firebase-auth-migration-plan\.mjs/.test(appPkg.scripts['plan:firebase-auth-migration'] || ''));
add('App package verifies Firebase Auth migration plan artifact', appPkg.scripts && /verify-firebase-auth-migration-plan\.mjs/.test(appPkg.scripts['verify:firebase-auth-migration-plan'] || ''));
add('Full verification includes Firebase Auth profile validation', appPkg.scripts && /validate:firebase-auth-profiles/.test(appPkg.scripts['verify:all'] || ''));
add('Full verification includes Firebase Auth claims validation', appPkg.scripts && /validate:firebase-auth-claims/.test(appPkg.scripts['verify:all'] || ''));
add('Full verification verifies Firebase Auth migration plan artifact', appPkg.scripts && /verify:firebase-auth-migration-plan/.test(appPkg.scripts['verify:all'] || ''));
add('Full verification includes secret scanning', appPkg.scripts && /verify:secrets/.test(appPkg.scripts['verify:all'] || ''));
add('Full verification includes vendor verification', appPkg.scripts && /verify:vendor/.test(appPkg.scripts['verify:all'] || ''));
add('Full verification includes Firestore rules emulator tests', appPkg.scripts && /verify:rules/.test(appPkg.scripts['verify:all'] || ''));
add('Full verification writes Firebase Auth migration plan as UTF-8 JSON', appPkg.scripts && /plan:firebase-auth-migration -- --out \.verify-artifacts\/firebase-auth-migration-plan\.json/.test((appPkg.scripts['verify:all'] || '').replace(/\\/g, '/')));
add('Full verification creates verify artifacts through migration writer', appPkg.scripts && /--out \.verify-artifacts\/firebase-auth-migration-plan\.json/.test((appPkg.scripts['verify:all'] || '').replace(/\\/g, '/')));
add('Deploy verification includes secret scanning', appPkg.scripts && /verify:secrets/.test(appPkg.scripts['verify:deploy'] || ''));

const parentPkgPath = path.join(PARENT, 'package.json');
if (fs.existsSync(parentPkgPath)) {
  const parentPkg = JSON.parse(fs.readFileSync(parentPkgPath, 'utf8'));
  const parentScripts = parentPkg.scripts || {};
  const parentServe = ((parentPkg.scripts || {}).serve || '').replace(/\\/g, '/');
  const parentNpmrcPath = path.join(PARENT, '.npmrc');
  const parentNpmrc = fs.existsSync(parentNpmrcPath) ? fs.readFileSync(parentNpmrcPath, 'utf8') : '';
  if (Array.isArray(parentPkg.workspaces) && parentPkg.workspaces.includes('volta-agent-tool')) {
    add('Workspace root npm enforces package engines', /^engine-strict=true$/m.test(parentNpmrc));
    add('Workspace root npm keeps CI install output focused', /^fund=false$/m.test(parentNpmrc));
  }
  add('Parent serve previews dist', /http-server volta-agent-tool\/dist\b/.test(parentServe));
  add('Parent package uses npm workspace targeting', /--workspace volta-agent-tool/.test(JSON.stringify(parentScripts)));
  add('Parent package has secret scanner', /--workspace volta-agent-tool run verify:secrets/.test(parentScripts['verify:secrets'] || ''));
  add('Parent package verifies vendored runtime assets', /--workspace volta-agent-tool run verify:vendor/.test(parentScripts['verify:vendor'] || ''));
  add('Parent package has Firestore rules emulator verification', /--workspace volta-agent-tool run verify:rules/.test(parentScripts['verify:rules'] || ''));
  add('Parent package has production readiness verification', /--workspace volta-agent-tool run verify:production-readiness/.test(parentScripts['verify:production-readiness'] || ''));
  add('Parent deploy verification includes Firestore rules emulator tests', /verify:rules/.test(parentScripts['verify:deploy'] || ''));
  add('Parent deploy verification includes vendor verification', /verify:vendor/.test(parentScripts['verify:deploy'] || ''));
  add('Parent deploy verification includes production readiness gate', /verify:production-readiness/.test(parentScripts['verify:deploy'] || ''));
  add('Parent package has local verification without emulator prerequisite', /verify:local/.test(JSON.stringify(parentScripts)) && !/verify:rules/.test(parentScripts['verify:local'] || ''));
  add('Parent package validates Firebase Auth profiles', /--workspace volta-agent-tool run validate:firebase-auth-profiles/.test(parentScripts['validate:firebase-auth-profiles'] || ''));
  add('Parent package validates Firebase Auth claims', /--workspace volta-agent-tool run validate:firebase-auth-claims/.test(parentScripts['validate:firebase-auth-claims'] || ''));
  add('Parent package plans Firebase Auth migration', /--workspace volta-agent-tool run --silent plan:firebase-auth-migration/.test(parentScripts['plan:firebase-auth-migration'] || ''));
  add('Parent package verifies Firebase Auth migration plan artifact', /--workspace volta-agent-tool run verify:firebase-auth-migration-plan/.test(parentScripts['verify:firebase-auth-migration-plan'] || ''));
  add('Parent full verification includes secret scanning', /verify:secrets/.test(parentScripts['verify:all'] || ''));
  add('Parent full verification includes vendor verification', /verify:vendor/.test(parentScripts['verify:all'] || ''));
  add('Parent full verification includes Firestore rules emulator tests', /verify:rules/.test(parentScripts['verify:all'] || ''));
  add('Parent full verification includes Firebase Auth profile validation', /validate:firebase-auth-profiles/.test(parentScripts['verify:all'] || ''));
  add('Parent full verification includes Firebase Auth claims validation', /validate:firebase-auth-claims/.test(parentScripts['verify:all'] || ''));
  add('Parent full verification verifies Firebase Auth migration plan artifact', /verify:firebase-auth-migration-plan/.test(parentScripts['verify:all'] || ''));
  add('Parent full verification writes Firebase Auth migration plan as UTF-8 JSON', /--workspace volta-agent-tool run --silent plan:firebase-auth-migration -- --out \.verify-artifacts\/firebase-auth-migration-plan\.json/.test((parentScripts['verify:all'] || '').replace(/\\/g, '/')));
  add('Parent full verification creates app verify artifacts directory', /--out \.verify-artifacts\/firebase-auth-migration-plan\.json/.test((parentScripts['verify:all'] || '').replace(/\\/g, '/')));
  add('Parent deploy verification includes secret scanning', /verify:secrets/.test(parentScripts['verify:deploy'] || ''));
  add('Parent production verification aliases deploy gate', parentScripts['verify:production'] === 'npm run verify:deploy');
  add('Parent production deploy runs gate before Firebase deploy', /^npm run verify:deploy && firebase deploy --only hosting,firestore:rules$/.test(parentScripts['deploy:production'] || ''));
}

const buildScript = read('build-hosting.mjs');
add('Build rejects path traversal assets', /startsWith\('\.\.\/'\)/.test(buildScript) && /includes\('\/\.\.\/'\)/.test(buildScript));
add('Build restricts runtime asset extensions', /allowedExt\s*=\s*new Set/.test(buildScript) && /Unsupported runtime asset extension/.test(buildScript));
add('Build blocks source artifact asset references', /Blocked non-runtime asset reference/.test(buildScript));

const secretScanner = read('verify-secrets.mjs');
add('Secret scanner blocks private keys', /BEGIN .*PRIVATE KEY/.test(secretScanner));
add('Secret scanner blocks service account JSON', /service_account/.test(secretScanner) && /private_key/.test(secretScanner));
add('Secret scanner skips generated artifacts', /'\.verify-artifacts'/.test(secretScanner) && /'dist'/.test(secretScanner));
add('Secret scanner skips tooling and vendored directories', /'\.tools'/.test(secretScanner) && /'vendor'/.test(secretScanner));
const vendorVerifier = read('verify-vendor.mjs');
add('Vendor verifier compares Three.js vendor files to npm package', /vendor[^\n]+three[^\n]+three\.min\.js/.test(vendorVerifier) && /node_modules[^\n]+three[^\n]+OrbitControls\.js/.test(vendorVerifier) && /sha256/.test(vendorVerifier));
const rulesVerifier = read('verify-firestore-rules.mjs');
add('Rules verifier runs Firebase emulator with discovered Java', /firebase-tools@14\.23\.0/.test(rulesVerifier) && /demo-volta-rules/.test(rulesVerifier) && /VOLTA_JAVA_HOME/.test(rulesVerifier) && /\.tools/.test(rulesVerifier));
add('Rules verifier suppresses Firebase debug noise', /delete env\.DEBUG/.test(rulesVerifier) && /FIREBASE_CLI_DISABLE_UPDATE_NOTIFIER/.test(rulesVerifier));
add('Firebase CLI is not a permanent dependency', !(appPkg.dependencies && appPkg.dependencies['firebase-tools']) && !(appPkg.devDependencies && appPkg.devDependencies['firebase-tools']));

const configJs = read('config.js');
add('Default manager bootstrap password is disabled', /managerPassword:\s*''/.test(configJs));
const firebaseConfig = (new Function(`${configJs}; return CONFIG.FIREBASE_CONFIG;`))();
add('Firebase public config authDomain matches projectId', firebaseConfig.authDomain === `${firebaseConfig.projectId}.firebaseapp.com`);
add('Firebase public config storageBucket matches projectId', [`${firebaseConfig.projectId}.appspot.com`, `${firebaseConfig.projectId}.firebasestorage.app`].includes(firebaseConfig.storageBucket));
add('Firebase public config appId matches sender', new RegExp(`^1:${firebaseConfig.messagingSenderId}:web:[0-9a-f]+$`).test(firebaseConfig.appId));
const adminJs = read('admin.js');
add('Admin archives agents in Firebase Auth mode', /authMode\(\)\s*===\s*'firebase'[\s\S]*VoltaDB\.updateAgent\(id,\s*\{\s*active:\s*false\s*\}\)/.test(adminJs));
add('Admin avoids agent delete in Firebase Auth mode', /authMode\(\)\s*===\s*'firebase'[\s\S]*return;[\s\S]*VoltaDB\.deleteAgent\(id\)/.test(adminJs));
add('Admin limits permanent approvals to managers', /const canPermanent\s*=\s*_ctx\s*===\s*'manager'/.test(adminJs) && /resolution === 'permanent' && _ctx !== 'manager'/.test(adminJs));
add('Admin creates profile-only Firebase Auth agents by UID', /Firebase Auth UID/.test(adminJs) && /VoltaDB\.setAgentProfile\(uid/.test(adminJs) && !/passwordHash[\s\S]*setAgentProfile/.test(adminJs));
const firebaseJs = read('firebase.js');
add('Firebase layer can write agent profiles by uid', /function setAgentProfile\(uid,\s*profile\)[\s\S]*doc\(_db,\s*'agents',\s*uid\)/.test(firebaseJs));
add('Firebase layer batches permanent settlement approval', /function applyPermanentSettlementApproval[\s\S]*writeBatch[\s\S]*settlementOverrides[\s\S]*requests[\s\S]*batch\.commit\(\)/.test(firebaseJs));
add('Admin uses batched permanent settlement approval', /resolution === 'permanent' && req\.type === 'settlement'[\s\S]*VoltaDB\.applyPermanentSettlementApproval\(id,\s*patch,\s*ov\)/.test(adminJs));

const readme = read('README.md');
add('README documents root release verification', /parent `City volta solar` folder/.test(readme) && /npm run verify:all/.test(readme));
add('README documents secret scanning and migration validation', /verify:secrets/.test(readme) && /plan:firebase-auth-migration/.test(readme));
add('README documents Firebase Auth profile onboarding', /Firebase Auth UID/.test(readme) && /agents\/\{uid\}/.test(readme));
add('README documents Firebase Auth UID and email normalization', /Firestore document id/.test(readme) && /lowercase/.test(readme));
const productionRunbook = read('PRODUCTION.md');
add('Production runbook prefers root release gate', /parent `City volta solar` folder/.test(productionRunbook) && /npm run verify:all/.test(productionRunbook));
add('Production runbook documents root migration wrappers', /validate:firebase-auth-profiles/.test(productionRunbook) && /validate:firebase-auth-claims/.test(productionRunbook) && /plan:firebase-auth-migration/.test(productionRunbook));
add('Production runbook documents Firebase Auth profile onboarding', /Firebase\s+Auth UID/.test(productionRunbook) && /agents\/\{uid\}/.test(productionRunbook));
add('Production runbook documents Firebase Auth UID and email normalization', /safe Firestore\s+document ids/.test(productionRunbook) && /trimmed and lowercase/.test(productionRunbook));

const authProfileValidator = read('firebase-auth-profiles.js');
add('Firebase Auth profile validator rejects password fields', /passwordHash/.test(authProfileValidator) && /password material is forbidden/.test(authProfileValidator));
add('Firebase Auth profile validator requires active manager', /at least one active manager/.test(authProfileValidator));
add('Firebase Auth profile validator checks duplicate emails', /duplicate email/.test(authProfileValidator));
add('Firebase Auth profile validator checks safe unique uids', /validFirebaseUid/.test(authProfileValidator) && /duplicate uid/.test(authProfileValidator));
add('Firebase Auth profile validator requires normalized emails', /email must be trimmed and lowercase/.test(authProfileValidator));
add('Firebase Auth profile example exists', fs.existsSync(path.join(ROOT, 'firebase-auth-profiles.example.json')));
const authClaimsValidator = read('firebase-auth-claims.js');
add('Firebase Auth claims validator checks profile role match', /does not match profile role/.test(authClaimsValidator));
add('Firebase Auth claims validator rejects unsupported claim fields', /unsupported claim field/.test(authClaimsValidator));
add('Firebase Auth claims validator requires all profile claims', /missing matching custom claims entry/.test(authClaimsValidator));
add('Firebase Auth claims example exists', fs.existsSync(path.join(ROOT, 'firebase-auth-claims.example.json')));
const authMigrationPlanner = read('firebase-auth-migration-plan.js');
add('Firebase Auth migration planner emits auth users', /authUsers/.test(authMigrationPlanner));
add('Firebase Auth migration planner emits custom claims', /customClaims/.test(authMigrationPlanner));
add('Firebase Auth migration planner emits Firestore profiles', /firestoreAgents/.test(authMigrationPlanner));
add('Firebase Auth migration planner can write UTF-8 artifact directly', /--out/.test(read('generate-firebase-auth-migration-plan.mjs')) && /writeFileSync\(target,\s*text,\s*'utf8'\)/.test(read('generate-firebase-auth-migration-plan.mjs')));
add('Firebase Auth migration planner uses deploy verification gate', /npm run verify:deploy/.test(authMigrationPlanner) && !/verify:production/.test(authMigrationPlanner));
const authPlanVerifier = read('verify-firebase-auth-migration-plan.mjs');
add('Firebase Auth migration plan verifier checks parseable artifact', /JSON\.parse/.test(authPlanVerifier) && /valid UTF-8 JSON/.test(authPlanVerifier));
add('Firebase Auth migration plan verifier rejects password material', /passwordHash/.test(authPlanVerifier) && /password material/.test(authPlanVerifier));
add('Firebase Auth migration plan verifier checks auth/profile consistency', /profile .* email does not match auth user/.test(authPlanVerifier) && /claims for unknown uid/.test(authPlanVerifier));
const productionReadinessVerifier = read('verify-production-readiness.mjs');
add('Production readiness verifier checks Firebase Auth mode', /CONFIG\.AUTH_MODE is firebase/.test(productionReadinessVerifier));
add('Production readiness verifier checks migration plan artifact', /verify-firebase-auth-migration-plan\.mjs/.test(productionReadinessVerifier) && /FIREBASE_AUTH_MIGRATION_PLAN/.test(productionReadinessVerifier));
add('Production readiness verifier warns about external Firebase cutover', /External Firebase Auth cutover/.test(productionReadinessVerifier));
add('Shared auth helper validates Firebase UIDs', /function validFirebaseUid/.test(read('auth.js')) && /validFirebaseUid/.test(adminJs) && /validFirebaseUid/.test(authProfileValidator));

const editorConfig = read('.editorconfig');
add('EditorConfig enforces LF endings', /end_of_line\s*=\s*lf/.test(editorConfig));
add('EditorConfig enforces final newline', /insert_final_newline\s*=\s*true/.test(editorConfig));
add('EditorConfig trims trailing whitespace by default', /trim_trailing_whitespace\s*=\s*true/.test(editorConfig));

const gitAttributes = read('.gitattributes');
add('Git attributes normalize text to LF', /\*\s+text=auto\s+eol=lf/.test(gitAttributes));
add('Git attributes keep binary assets binary', /\*\.png\s+binary/.test(gitAttributes) && /\*\.xlsx\s+binary/.test(gitAttributes));

const workflowPath = path.join(ROOT, '.github', 'workflows', 'verify.yml');
add('CI verify workflow exists', fs.existsSync(workflowPath));
if (fs.existsSync(workflowPath)) {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  add('CI uses read-only permissions', /permissions:\s*\n\s*contents:\s*read/.test(workflow));
  add('CI reads Node version from .nvmrc', /node-version-file:\s*\.nvmrc/.test(workflow));
  add('CI installs Java for Firebase emulator', /actions\/setup-java@v4/.test(workflow) && /java-version:\s*'21'/.test(workflow));
  add('CI runs npm ci', /\brun:\s*npm ci\b/.test(workflow));
  add('CI runs verify:all', /\brun:\s*npm run verify:all\b/.test(workflow));
  add('CI sets Chrome path for browser checks', /CHROME_PATH:\s*\/usr\/bin\/google-chrome/.test(workflow));
}

const browserUtils = read('verify-browser-utils.mjs');
add('Browser verifier reports missing Chrome clearly', /Chrome executable not found/.test(browserUtils) && /CHROME_PATH/.test(browserUtils));
add('Browser verifier closes local servers cleanly', /function closeServer/.test(browserUtils) && /server\.close\(err/.test(browserUtils) && /await closeServer\(server\)/.test(read('verify-csp.mjs')));
add('Browser verifier bounds screenshot and close hangs', /SCREENSHOT_TIMEOUT_MS/.test(browserUtils) && /BROWSER_CLOSE_TIMEOUT_MS/.test(browserUtils) && /proc\.kill\(\)/.test(browserUtils));

const dependabotPath = path.join(ROOT, '.github', 'dependabot.yml');
add('Dependabot config exists', fs.existsSync(dependabotPath));
if (fs.existsSync(dependabotPath)) {
  const dependabot = fs.readFileSync(dependabotPath, 'utf8');
  add('Dependabot updates npm dependencies', /package-ecosystem:\s*npm/.test(dependabot));
  add('Dependabot updates GitHub Actions', /package-ecosystem:\s*github-actions/.test(dependabot));
  add('Dependabot is weekly', (dependabot.match(/interval:\s*weekly/g) || []).length >= 2);
  add('Dependabot PR limit is bounded', (dependabot.match(/open-pull-requests-limit:\s*5/g) || []).length >= 2);
}

const gitignore = read('.gitignore');
for (const pattern of ['.env', '.env.*', '*.pem', '*.key', '*service-account*.json', '*credentials*.json', 'firebase-adminsdk*.json']) {
  add(`.gitignore protects ${pattern}`, gitignore.split(/\r?\n/).includes(pattern));
}
add('.gitignore ignores verify artifacts', gitignore.split(/\r?\n/).includes('.verify-artifacts/'));

const manifestPath = path.join(DIST, 'deploy-manifest.json');
add('dist manifest exists', fs.existsSync(manifestPath));
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const forbidden = (manifest.files || []).filter(f => /\.(py|xlsx|csv|json)$/i.test(f) && f !== 'deploy-manifest.json');
  add('dist manifest contains no raw work artifacts', forbidden.length === 0, forbidden.join(', '));
  add('dist manifest records SHA-256 for every runtime file', (manifest.files || []).every(f => /^[a-f0-9]{64}$/.test((manifest.sha256 || {})[f] || '')));
  add('dist manifest generatedAt is parseable', typeof manifest.generatedAt === 'string' && !Number.isNaN(Date.parse(manifest.generatedAt)));
  const mismatchedHashes = (manifest.files || []).filter(f => {
    const full = path.join(DIST, f);
    if (!fs.existsSync(full)) return true;
    const actual = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    return actual !== manifest.sha256?.[f];
  });
  add('dist manifest SHA-256 values match runtime files', mismatchedHashes.length === 0, mismatchedHashes.join(', '));
  for (const required of ['index.html', 'styles.css', 'app.js', 'firebase-bootstrap.js']) {
    add(`dist manifest includes ${required}`, (manifest.files || []).includes(required));
  }
  function walk(dir, prefix = '') {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full, rel) : [rel];
    });
  }
  const distFiles = fs.existsSync(DIST) ? walk(DIST).sort() : [];
  const expectedFiles = [...(manifest.files || []), 'deploy-manifest.json'].sort();
  const unexpected = distFiles.filter(f => !expectedFiles.includes(f));
  const missing = expectedFiles.filter(f => !distFiles.includes(f));
  const forbiddenDist = distFiles.filter(f => /\.(py|xlsx|csv)$/i.test(f) || /(?:firebase-debug|package-lock|package\.json|firestore\.rules|production|security|readme)/i.test(f));
  add('dist contains only manifest-declared files', unexpected.length === 0 && missing.length === 0, [...unexpected.map(f => `unexpected:${f}`), ...missing.map(f => `missing:${f}`)].join(', '));
  add('dist contains no sensitive source artifacts', forbiddenDist.length === 0, forbiddenDist.join(', '));
}

const hostingIgnore = firebaseJson.hosting.ignore || [];
for (const pattern of ['*.py', '*.xlsx', '*.csv', '*.json', 'firebase-debug.log', 'PRODUCTION.md', 'sim-test.html']) {
  add(`Hosting ignore includes ${pattern}`, hostingIgnore.includes(pattern));
}

const csp = firebaseJson.hosting.headers
  .flatMap(h => h.headers || [])
  .find(h => String(h.key || '').toLowerCase() === 'content-security-policy')?.value || '';
function headerValue(source, key) {
  const entry = (firebaseJson.hosting.headers || []).find(h => h.source === source);
  return (entry?.headers || []).find(h => String(h.key || '').toLowerCase() === key.toLowerCase())?.value || '';
}
add('Hosting sets no-cache for fixed-name HTML', headerValue('/index.html', 'Cache-Control') === 'no-cache');
add('Hosting sets no-cache for fixed-name JavaScript', headerValue('**/*.js', 'Cache-Control') === 'no-cache');
add('Hosting sets no-cache for fixed-name CSS', headerValue('**/*.css', 'Cache-Control') === 'no-cache');
add('Hosting does not cache deploy manifest', headerValue('/deploy-manifest.json', 'Cache-Control') === 'no-store');
add('CSP exists', !!csp);
add('CSP script-src has no unsafe-inline', !/script-src[^;]*'unsafe-inline'/.test(csp));
add('CSP script-src excludes unpkg CDN', !/script-src[^;]*https:\/\/unpkg\.com/.test(csp));
add('CSP style-src has no unsafe-inline', !/style-src[^;]*'unsafe-inline'/.test(csp));
add('CSP style-src is self only', /style-src 'self'(?:;|$)/.test(csp));
add('CSP font-src is self only', /font-src 'self'(?:;|$)/.test(csp));
add('CSP blocks object embedding', /object-src 'none'/.test(csp));
add('CSP blocks framing', /frame-ancestors 'none'/.test(csp));

function checkRules(rel) {
  const rules = read(rel);
  add(`${rel}: no open wildcard access`, !/allow\s+read\s*,\s*write\s*:\s*if\s+true/.test(rules));
  add(`${rel}: requires signed auth`, /request\.auth\s*!=\s*null/.test(rules));
  add(`${rel}: rejects password fields in agents`, /!data\.keys\(\)\.hasAny\(\['password', 'passwordHash'\]\)/.test(rules));
  add(`${rel}: agent profile deletes are disabled`, /match \/agents\/\{agentId\}[\s\S]*allow delete:\s*if false;/.test(rules));
  add(`${rel}: agent request history is scoped`, /resource\.data\.agentId\s*==\s*request\.auth\.uid/.test(rules));
  add(`${rel}: auditLogs append only`, /match \/auditLogs\/\{eventId\}[\s\S]*allow update, delete: if false;/.test(rules));
  add(`${rel}: audit actions are allow-listed`, /data\.action in \[[\s\S]*'request\.approve'[\s\S]*'roofConfig\.update'[\s\S]*\]/.test(rules));
  add(`${rel}: request decisions only from pending`, /resource\.data\.status\s*==\s*'pending'[\s\S]*validReviewerDecision/.test(rules));
  add(`${rel}: request creation requires active agent profile`, /function hasActiveAgentProfile[\s\S]*exists\(agentProfilePath\(\)\)[\s\S]*active == true[\s\S]*role == request\.auth\.token\.role/.test(rules) && /data\.agentName == get\(agentProfilePath\(\)\)\.data\.name/.test(rules));
  add(`${rel}: request context schema is bounded`, /function validRequestContext[\s\S]*context\.keys\(\)\.hasOnly\(\['status'\]\)[\s\S]*context\.status\.size\(\) <= 120[\s\S]*context\.keys\(\)\.hasOnly\(\['outcome', 'answers'\]\)[\s\S]*context\.answers\.size\(\) <= 50/.test(rules));
  add(`${rel}: permanent request approvals require manager role`, /validReviewerDecision[\s\S]*request\.auth\.token\.role == 'manager'[\s\S]*data\.resolution != 'permanent'/.test(rules));
  add(`${rel}: request text has size limits`, /data\.reason\.size\(\)\s*<=\s*2000/.test(rules) && /data\.subject\.size\(\)\s*<=\s*500/.test(rules));
  add(`${rel}: audit actor and target have size limits`, /data\.actorName\.size\(\)\s*<=\s*120/.test(rules) && /data\.targetId\.size\(\)\s*<=\s*200/.test(rules));
  add(`${rel}: audit details schema is bounded`, /function validAuditDetails[\s\S]*details\.keys\(\)\.hasOnly\(\[[\s\S]*permanentOverride[\s\S]*borderline[\s\S]*details\.subject\.size\(\) <= 500[\s\S]*details\.email\.size\(\) <= 254/.test(rules));
  add(`${rel}: roofConfig writes are default-only`, /match \/roofConfig\/\{docId\}[\s\S]*docId == 'default'/.test(rules));
  add(`${rel}: roofConfig validates top-level shape`, /function validRoofConfig[\s\S]*data\.keys\(\)\.hasOnly\(\[[\s\S]*totalSizeThresholds[\s\S]*materials[\s\S]*\]\)/.test(rules));
  add(`${rel}: roofConfig keeps managerPassword empty`, /function validRoofConfig[\s\S]*data\.managerPassword == ''/.test(rules));
  add(`${rel}: roofConfig deletes are disabled`, /match \/roofConfig\/\{docId\}[\s\S]*allow delete:\s*if false;/.test(rules));
}

checkRules('firestore.rules');
checkRules('firestore.rules.example');

if (productionMode) {
  add('Production auth mode is firebase', /AUTH_MODE:\s*'firebase'/.test(configJs));
  add('Production has no manager bootstrap password', /managerPassword:\s*''/.test(configJs));
}

const failed = checks.filter(c => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ' - ' + c.detail : ''}`);
}

if (failed.length) {
  console.error(`SECURITY_CHECKS_FAILED: ${failed.length}`);
  process.exitCode = 1;
} else {
  console.log(`SECURITY_CHECKS_OK: ${checks.length}`);
}

try { fs.rmSync(LOCK, { force: true }); } catch (_) {}
