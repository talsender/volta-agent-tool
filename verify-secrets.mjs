import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set([
  '.git',
  '.firebase',
  '.tools',
  '.verify-artifacts',
  'dist',
  'node_modules',
  'vendor',
]);
const SKIP_FILES = new Set([
  'package-lock.json',
  'verify-secrets.mjs',
]);
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.editorconfig',
  '.env',
  '.example',
  '.gitignore',
  '.gitattributes',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.rules',
  '.txt',
  '.yml',
  '.yaml',
]);
const SENSITIVE_FILE_NAME = /(^\.env(\.|$)|\.pem$|\.key$|\.p12$|\.pfx$|service-account|credentials|firebase-adminsdk)/i;
const HIGH_CONFIDENCE_PATTERNS = [
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/ },
  { name: 'service account private_key field', pattern: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/ },
  { name: 'google service account type', pattern: /"type"\s*:\s*"service_account"/ },
  { name: 'github token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/ },
  { name: 'slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: 'aws access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'firebase admin private key id', pattern: /"private_key_id"\s*:\s*"[a-f0-9]{20,}"/i },
  { name: 'enabled manager bootstrap password', pattern: /managerPassword\s*:\s*['"][^'"]+['"]/ },
];

export function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile()) files.push(path.join(dir, entry.name));
  }
  return files;
}

export function isTextFile(file) {
  const base = path.basename(file);
  if (SKIP_FILES.has(base)) return false;
  const ext = path.extname(base).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || ['Dockerfile', 'LICENSE'].includes(base);
}

export function scanSecrets(root = ROOT) {
  const findings = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (SENSITIVE_FILE_NAME.test(rel) && !/\.example$/i.test(rel)) {
      findings.push({ file: rel, issue: 'sensitive filename should not be committed' });
    }
    if (!isTextFile(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const rule of HIGH_CONFIDENCE_PATTERNS) {
      if (rule.pattern.test(text)) findings.push({ file: rel, issue: rule.name });
    }
  }
  return findings;
}

export function runSecretsCheck(root = ROOT) {
  const findings = scanSecrets(root);
  if (findings.length) {
    console.error(`SECRETS_CHECK_FAILED: ${findings.length}`);
    for (const finding of findings) console.error(`- ${finding.file}: ${finding.issue}`);
    return 1;
  }
  console.log('SECRETS_CHECK_OK');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runSecretsCheck(ROOT);
}
