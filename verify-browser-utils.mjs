import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

export const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const BASE_CHROME_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--disable-background-networking',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
];
const BROWSER_CLOSE_TIMEOUT_MS = 5000;
const SCREENSHOT_TIMEOUT_MS = 15000;

function timeoutError(label, ms) {
  return new Error(`${label} timed out after ${ms}ms`);
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function launchBrowser(extraArgs = []) {
  if (!fs.existsSync(CHROME)) {
    throw new Error(`Chrome executable not found at ${CHROME}. Set CHROME_PATH to a Chromium or Chrome executable.`);
  }
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [...BASE_CHROME_ARGS, ...extraArgs],
  });
}

export async function safeCloseBrowser(browser) {
  try {
    await withTimeout(browser.close(), BROWSER_CLOSE_TIMEOUT_MS, 'Browser close');
  } catch (err) {
    try {
      const proc = browser && browser.process && browser.process();
      if (proc && !proc.killed) proc.kill();
    } catch (_) {}
    // Browser may already be gone after a Chromium target crash.
  }
}

export async function closeServer(server) {
  if (!server || !server.listening) return;
  await new Promise((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

export async function screenshotWithRetry(target, options, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await withTimeout(target.screenshot(options), SCREENSHOT_TIMEOUT_MS, 'Screenshot');
    } catch (err) {
      lastError = err;
      if (attempt + 1 >= attempts || !isScreenshotFlake(err)) break;
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
  throw lastError;
}

function isScreenshotFlake(err) {
  return /Target closed|Page\.captureScreenshot|Protocol error/i.test(String(err && err.message));
}
