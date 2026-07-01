import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PARENT = path.dirname(ROOT);

const files = [
  {
    name: 'three.min.js',
    vendor: path.join(ROOT, 'vendor', 'three', 'three.min.js'),
    source: path.join(PARENT, 'node_modules', 'three', 'build', 'three.min.js'),
  },
  {
    name: 'OrbitControls.js',
    vendor: path.join(ROOT, 'vendor', 'three', 'OrbitControls.js'),
    source: path.join(PARENT, 'node_modules', 'three', 'examples', 'js', 'controls', 'OrbitControls.js'),
  },
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const errors = [];

for (const file of files) {
  if (!fs.existsSync(file.vendor)) {
    errors.push(`${file.name}: missing vendored file ${path.relative(ROOT, file.vendor)}`);
    continue;
  }
  if (!fs.existsSync(file.source)) {
    errors.push(`${file.name}: missing npm source file ${path.relative(ROOT, file.source)}`);
    continue;
  }
  const vendorHash = sha256(file.vendor);
  const sourceHash = sha256(file.source);
  if (vendorHash !== sourceHash) {
    errors.push(`${file.name}: vendor hash ${vendorHash} does not match npm package hash ${sourceHash}`);
  }
}

if (errors.length) {
  console.error(`VENDOR_CHECK_FAILED: ${errors.length}`);
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log(`VENDOR_CHECK_OK: ${files.length} files`);
