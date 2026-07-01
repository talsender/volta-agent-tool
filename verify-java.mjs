import { spawnSync } from 'node:child_process';

const result = spawnSync('java', ['-version'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (result.error || result.status !== 0) {
  console.error('JAVA_CHECK_FAILED');
  console.error('Firestore Rules emulator tests require Java 21 or another Firebase Emulator-compatible JDK on PATH.');
  console.error('Install a JDK, then rerun this command. GitHub Actions installs Temurin 21 automatically.');
  process.exit(1);
}

const output = `${result.stderr || ''}\n${result.stdout || ''}`;
const version = output.match(/version "([^"]+)"/)?.[1] || 'unknown';
console.log(`JAVA_CHECK_OK: ${version}`);
