import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launchBrowser, safeCloseBrowser, screenshotWithRetry } from './verify-browser-utils.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(ROOT, 'dist');
const ARTIFACTS = path.join(ROOT, '.verify-artifacts');
const URL = pathToFileURL(path.join(PUBLIC_ROOT, 'index.html')).href;

fs.mkdirSync(ARTIFACTS, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860 });
const errors = [];
const isIgnorableConsole = text =>
  /@firebase\/firestore: Firestore .*Could not reach Cloud Firestore backend/.test(text);
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !isIgnorableConsole(m.text())) errors.push('CONSOLE: ' + m.text());
});

try {
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(
    "window.VoltaSim && window.VoltaSim.available && window.VoltaSim.available() && window.SimEditor && window.buildSimState && window.Shading",
    { timeout: 30000 });

  const dockExposureBefore = await page.evaluate(() => !!document.getElementById('sim-dock-canvas'));
  await page.evaluate(() => { const g = document.getElementById('login-gate'); if (g) g.style.display = 'none'; });
  await page.evaluate("SimEditor.open()");
  await new Promise(r => setTimeout(r, 1200));
  const metricEmpty = await page.evaluate(() => ({
    total: (document.getElementById('se-total') || {}).textContent,
    exposure: (document.getElementById('se-exposure') || {}).textContent,
    yieldv: (document.getElementById('se-yield') || {}).textContent,
  }));

  await page.evaluate("SimEditor.addObstacle('building')");
  await page.evaluate("SimEditor.setTime(0.5)");
  await new Promise(r => setTimeout(r, 900));
  const metricObstacle = await page.evaluate(() => ({
    total: (document.getElementById('se-total') || {}).textContent,
    exposure: (document.getElementById('se-exposure') || {}).textContent,
    yieldv: (document.getElementById('se-yield') || {}).textContent,
    obstacles: window.__seObs ? window.__seObs() : 'n/a',
  }));

  await screenshotWithRetry(page, { path: path.join(ARTIFACTS, 'editor-shot.png') });
  console.log('DOCK_CANVAS:', dockExposureBefore);
  console.log('METRIC_EMPTY:', JSON.stringify(metricEmpty));
  console.log('METRIC_OBSTACLE:', JSON.stringify(metricObstacle));
  console.log('ERRORS:', JSON.stringify(errors));
  if (errors.length || !dockExposureBefore || !metricEmpty.total || !metricObstacle.total) process.exitCode = 1;
} catch (e) {
  console.log('SCRIPT_ERROR:', e.message);
  console.log('ERRORS:', JSON.stringify(errors));
  try { await screenshotWithRetry(page, { path: path.join(ARTIFACTS, 'editor-error.png') }, 1); } catch (_) {}
  process.exitCode = 1;
} finally {
  await safeCloseBrowser(browser);
}
