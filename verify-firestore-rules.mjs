import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PARENT = path.dirname(ROOT);
const isWin = process.platform === 'win32';
const javaExe = isWin ? 'java.exe' : 'java';
const npmExe = isWin ? 'npm.cmd' : 'npm';
const PROJECT_ID = 'demo-volta-rules';

function pathEntries() {
  return (process.env.PATH || '').split(path.delimiter).filter(Boolean);
}

function candidateJavaBins() {
  const dirs = [];
  for (const envName of ['VOLTA_JAVA_HOME', 'JAVA_HOME']) {
    if (process.env[envName]) dirs.push(path.join(process.env[envName], 'bin'));
  }
  for (const base of [path.join(ROOT, '.tools'), path.join(PARENT, '.tools')]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && /jdk|java|temurin/i.test(entry.name)) {
        const dir = path.join(base, entry.name);
        dirs.push(path.join(dir, 'bin'));
        for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
          if (child.isDirectory() && /jdk|java|temurin|jre/i.test(child.name)) {
            dirs.push(path.join(dir, child.name, 'bin'));
          }
        }
      }
    }
  }
  dirs.push(...pathEntries());
  return [...new Set(dirs)];
}

function findJava() {
  for (const dir of candidateJavaBins()) {
    const candidate = path.join(dir, javaExe);
    if (fs.existsSync(candidate)) return { java: candidate, bin: dir };
  }
  return null;
}

function workspaceRoot() {
  const pkgPath = path.join(PARENT, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : [];
    return workspaces.includes(path.basename(ROOT)) ? PARENT : null;
  } catch (_) {
    return null;
  }
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

const found = findJava();
if (!found) {
  console.error('JAVA_CHECK_FAILED');
  console.error('Firestore Rules emulator tests require Java 21 or another Firebase Emulator-compatible JDK.');
  console.error('Set JAVA_HOME/VOLTA_JAVA_HOME, add Java to PATH, or place a portable JDK under .tools/.');
  console.error('GitHub Actions installs Temurin 21 automatically.');
  process.exit(1);
}

const javaCheck = spawnSync(found.java, ['-version'], { encoding: 'utf8' });
if (javaCheck.error || javaCheck.status !== 0) {
  console.error('JAVA_CHECK_FAILED');
  console.error(javaCheck.stderr || javaCheck.error?.message || 'Unable to execute java -version');
  process.exit(1);
}

const versionText = `${javaCheck.stderr || ''}\n${javaCheck.stdout || ''}`;
const version = versionText.match(/version "([^"]+)"/)?.[1] || 'unknown';
console.log(`JAVA_CHECK_OK: ${version}`);

const env = {
  ...process.env,
  PATH: [found.bin, ...pathEntries()].join(path.delimiter),
  FIREBASE_CLI_DISABLE_UPDATE_NOTIFIER: 'true',
};
delete env.DEBUG;
delete env.FIREBASE_DEBUG_MODE;

const execCwd = workspaceRoot() || ROOT;
const testScript = execCwd === ROOT
  ? 'node --test tests/firestore-rules.emulator.js'
  : `node --test ${path.basename(ROOT)}/tests/firestore-rules.emulator.js`;

const command = [
  npmExe,
  'exec',
  '--yes',
  '--package',
  'firebase-tools@14.23.0',
  '--',
  'firebase',
  'emulators:exec',
  '--project',
  PROJECT_ID,
  '--config',
  path.join(ROOT, 'firebase.json'),
  '--only',
  'firestore',
  testScript,
].map(shellQuote).join(' ');

const result = spawnSync(command, {
  cwd: execCwd,
  env,
  shell: true,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
