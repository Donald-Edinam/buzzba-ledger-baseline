#!/usr/bin/env node
/**
 * Reproducibility gate. Run this before submitting.
 * Fails loudly if the repo would not build clean on a judge's machine.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push({ name, pass: true });
  } catch (e) {
    checks.push({ name, pass: false, detail: (e.message || String(e)).split('\n')[0] });
  }
};

check('lockfile committed', () => {
  if (!existsSync('package-lock.json') && !existsSync('pnpm-lock.yaml'))
    throw new Error('no lockfile');
});
check('node engine pinned', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (!pkg.engines?.node) throw new Error('engines.node missing');
});
check('README exists', () => {
  if (!existsSync('README.md')) throw new Error('missing README.md');
});
check('decisions logged', () => {
  const d = readFileSync('DECISIONS.md', 'utf8');
  if (d.includes('<!-- TEMPLATE -->')) throw new Error('DECISIONS.md still a template');
});
check('typecheck', () => execSync('npm run typecheck', { stdio: 'pipe' }));
check('tests', () => execSync('npm run test', { stdio: 'pipe' }));
check('no stray .only in tests', () => {
  const out = execSync('grep -rn "\\.only(" tests || true', { encoding: 'utf8' });
  if (out.trim()) throw new Error('focused test left in: ' + out.trim().split('\n')[0]);
});

let failed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  -> ' + c.detail : ''}`);
  if (!c.pass) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
