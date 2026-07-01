import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(APP_ROOT, 'dist');
const LOCK = path.join(APP_ROOT, '.dist-build.lock');
const STALE_LOCK_MS = 120000;

function read(rel) {
  return fs.readFileSync(path.join(APP_ROOT, rel), 'utf8');
}

function localAsset(src) {
  return src && !/^(https?:)?\/\//i.test(src) && !src.startsWith('data:') && !src.startsWith('#');
}

function normalizeAssetRef(src) {
  if (!localAsset(src)) return null;
  if (/[?#\0]/.test(src) || path.isAbsolute(src) || src.startsWith('/') || src.startsWith('\\')) {
    throw new Error(`Unsafe runtime asset reference: ${src}`);
  }
  const normalized = path.posix.normalize(src.replace(/\\/g, '/')).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe runtime asset reference: ${src}`);
  }
  const allowedExt = new Set(['.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2']);
  const ext = path.posix.extname(normalized).toLowerCase();
  if (!allowedExt.has(ext)) {
    throw new Error(`Unsupported runtime asset extension: ${src}`);
  }
  if (/\b(?:firebase-debug|package-lock|package|firestore\.rules|production|security|readme)\b/i.test(normalized)) {
    throw new Error(`Blocked non-runtime asset reference: ${src}`);
  }
  return normalized;
}

function copy(rel) {
  const from = path.join(APP_ROOT, rel);
  const to = path.join(DIST, rel);
  const fromResolved = path.resolve(from);
  const toResolved = path.resolve(to);
  if (!fromResolved.startsWith(APP_ROOT + path.sep) || !toResolved.startsWith(DIST + path.sep)) {
    throw new Error(`Unsafe runtime asset path: ${rel}`);
  }
  if (!fs.existsSync(from)) throw new Error(`Missing runtime asset: ${rel}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function sha256(rel) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(DIST, rel)))
    .digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireLock() {
  const started = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
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
      if (Date.now() - started > STALE_LOCK_MS) throw new Error('Timed out waiting for dist build lock');
      await sleep(150);
    }
  }
}

await acquireLock();
try {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const index = read('index.html');
  const assets = new Set(['index.html']);

  for (const match of index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const asset = normalizeAssetRef(match[1]);
    if (asset) assets.add(asset);
  }
  for (const match of index.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const asset = normalizeAssetRef(match[1]);
    if (asset) assets.add(asset);
  }

  for (const rel of assets) copy(rel);

  const manifest = {
    generatedAt: new Date().toISOString(),
    files: [...assets].sort(),
  };
  manifest.sha256 = Object.fromEntries(manifest.files.map(rel => [rel, sha256(rel)]));
  fs.writeFileSync(path.join(DIST, 'deploy-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`Built ${manifest.files.length} runtime files into ${path.relative(APP_ROOT, DIST)}`);
} finally {
  try { fs.rmSync(LOCK, { force: true }); } catch (_) {}
}
