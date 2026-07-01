import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeServer, launchBrowser, safeCloseBrowser } from './verify-browser-utils.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(ROOT, 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function readCsp() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  const csp = (cfg.hosting.headers || [])
    .flatMap(h => h.headers || [])
    .find(h => String(h.key || '').toLowerCase() === 'content-security-policy');
  if (!csp || !csp.value) throw new Error('Content-Security-Policy missing in firebase.json');
  return csp.value;
}

function createServer(csp) {
  const root = path.resolve(PUBLIC_ROOT);
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(PUBLIC_ROOT, rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403, { 'Content-Security-Policy': csp });
      res.end('forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(rel === 'favicon.ico' ? 204 : 404, { 'Content-Security-Policy': csp });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Content-Security-Policy': csp,
      });
      res.end(data);
    });
  });
}

const csp = readCsp();
const server = createServer(csp);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const browser = await launchBrowser();

const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (
    ['error', 'warning'].includes(m.type()) &&
    /Content Security Policy|Refused|unsafe-inline|violat|Failed to load resource/i.test(m.text())
  ) {
    errors.push(m.type().toUpperCase() + ': ' + m.text());
  }
});

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.firebase && window.VoltaSim && window.SimEditor && window.RoofCompass', { timeout: 30000 });
  await page.evaluate(() => SimEditor.open());
  await page.waitForSelector('#se-overlay', { timeout: 10000 });
  const result = await page.evaluate(() => ({
    hasFirebase: !!window.firebase,
    hasEditor: !!document.getElementById('se-overlay'),
    hasStylesheet: Array.from(document.styleSheets).some(s => (s.href || '').includes('styles.css')),
    hasInlineScript: !!document.querySelector('script:not([src])'),
  }));
  console.log('CSP_RESULT:', JSON.stringify(result));
  console.log('CSP_ERRORS:', JSON.stringify(errors));
  if (errors.length || !result.hasFirebase || !result.hasEditor || !result.hasStylesheet || result.hasInlineScript) {
    process.exitCode = 1;
  }
} catch (err) {
  console.log('CSP_SCRIPT_ERROR:', err.message);
  console.log('CSP_ERRORS:', JSON.stringify(errors));
  process.exitCode = 1;
} finally {
  await safeCloseBrowser(browser);
  await closeServer(server);
}
