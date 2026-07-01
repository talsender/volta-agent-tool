const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadScanner() {
  return import('../verify-secrets.mjs');
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'volta-secrets-'));
}

test('secret scanner accepts ordinary source files and public Firebase config shape', async () => {
  const { scanSecrets } = await loadScanner();
  const root = tempRoot();
  fs.writeFileSync(path.join(root, 'config.js'), "const cfg = { apiKey: 'public-browser-key' };\n");

  assert.deepStrictEqual(scanSecrets(root), []);
});

test('secret scanner rejects private keys and service account JSON', async () => {
  const { scanSecrets } = await loadScanner();
  const root = tempRoot();
  const privateKey = '-----' + 'BEGIN PRIVATE KEY' + '-----\\nsecret\\n-----' + 'END PRIVATE KEY' + '-----';
  fs.writeFileSync(path.join(root, 'service-account.json'), JSON.stringify({
    type: 'service_account',
    private_key: privateKey,
  }));

  const issues = scanSecrets(root).map(f => f.issue);
  assert.ok(issues.includes('sensitive filename should not be committed'));
  assert.ok(issues.includes('google service account type'));
  assert.ok(issues.includes('service account private_key field'));
});

test('secret scanner rejects enabled manager bootstrap password', async () => {
  const { scanSecrets } = await loadScanner();
  const root = tempRoot();
  const field = 'manager' + 'Password';
  fs.writeFileSync(path.join(root, 'config.js'), `const cfg = { ${field}: 'change-me' };\n`);

  assert.deepStrictEqual(scanSecrets(root), [
    { file: 'config.js', issue: 'enabled manager bootstrap password' },
  ]);
});

test('secret scanner ignores generated, tooling, and vendored directories', async () => {
  const { scanSecrets } = await loadScanner();
  const root = tempRoot();
  for (const dir of ['dist', '.verify-artifacts', '.tools', 'vendor']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  const privateKey = '-----' + 'BEGIN PRIVATE KEY' + '-----';
  fs.writeFileSync(path.join(root, 'dist', 'bundle.js'), privateKey);
  fs.writeFileSync(path.join(root, '.verify-artifacts', 'plan.json'), privateKey);
  fs.writeFileSync(path.join(root, '.tools', 'runtime.txt'), privateKey);
  fs.writeFileSync(path.join(root, 'vendor', 'bundle.js'), privateKey);

  assert.deepStrictEqual(scanSecrets(root), []);
});
