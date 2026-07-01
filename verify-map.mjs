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
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
const errors = [];
const isIgnorableConsole = text =>
  /@firebase\/firestore: Firestore .*Could not reach Cloud Firestore backend/.test(text);
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !isIgnorableConsole(m.text())) errors.push('CONSOLE: ' + m.text());
});

const shot = p => path.join(ARTIFACTS, p);

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => { const g = document.getElementById('login-gate'); if (g) g.style.display = 'none'; });
  await page.waitForFunction(
    "window.VoltaGlobe && typeof Settlements !== 'undefined' && Settlements.getAll && Settlements.getAll().length > 0",
    { timeout: 30000 });

  const stats = await page.evaluate(() => {
    const all = Settlements.getAll();
    const coords = window.SETTLEMENT_COORDS || {};
    const norm = s => String(s || '').trim()
      .replace(/[)(\]\[]/g, ' ')
      .replace(/['"`׳״]/g, '')
      .replace(/[־\-–—]/g, '')
      .replace(/[ךםןףץ]/g, c => ({ 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }[c]))
      .replace(/\s+/g, '');
    const withCoords = all.filter(s => coords[norm(s.name)]);
    const yes = withCoords.find(s => s.status === 'מתקינים');
    const no = withCoords.find(s => s.status === 'לא מתקינים');
    return {
      total: all.length, withCoords: withCoords.length,
      yesName: yes ? yes.name : null, noName: no ? no.name : null,
    };
  });

  const stage = await page.$('.globe-stage');
  if (!stage) throw new Error('Globe stage was not rendered');
  await new Promise(r => setTimeout(r, 1500));
  await screenshotWithRetry(stage, { path: shot('map-rest.png') });
  await screenshotWithRetry(page, { path: shot('map-fullpage.png') });

  await page.evaluate(() => window.VoltaGlobe.lockTarget('קרית ים', 'yes'));
  await new Promise(r => setTimeout(r, 1800));
  await screenshotWithRetry(stage, { path: shot('map-kiryat-yam.png') });
  await page.evaluate(() => window.VoltaGlobe.deploy());
  await new Promise(r => setTimeout(r, 600));
  await screenshotWithRetry(stage, { path: shot('map-burst.png') });

  await page.evaluate(() => window.VoltaGlobe.release());
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => window.VoltaGlobe.lockTarget('אבו בלאל', 'unknown'));
  await new Promise(r => setTimeout(r, 1400));
  const cap = await page.evaluate(() => document.getElementById('globe-caption').textContent);
  console.log('NO_COORD_CAPTION:', cap);
  await screenshotWithRetry(stage, { path: shot('map-nocoord.png') });

  if (stats.noName) {
    await page.evaluate(() => window.VoltaGlobe.release());
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(n => window.VoltaGlobe.lockTarget(n, 'no'), stats.noName);
    await new Promise(r => setTimeout(r, 1600));
    await screenshotWithRetry(stage, { path: shot('map-lock-no.png') });
  }

  console.log('STATS:', JSON.stringify(stats));
  console.log('ERRORS:', JSON.stringify(errors));
  if (errors.length || stats.total < 1 || stats.withCoords < 1 || !/LOCATION UNAVAILABLE/i.test(cap)) process.exitCode = 1;
} catch (e) {
  console.log('SCRIPT_ERROR:', e.message);
  console.log('ERRORS:', JSON.stringify(errors));
  try { await screenshotWithRetry(page, { path: shot('map-error.png') }, 1); } catch (_) {}
  process.exitCode = 1;
} finally {
  await safeCloseBrowser(browser);
}
