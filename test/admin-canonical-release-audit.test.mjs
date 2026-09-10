import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('Admin release audit treats CGMA apex path as canonical and rejects legacy host', async () => {
  const [audit, shell] = await Promise.all([read('scripts/audit-admin-menu-services.mjs'), read('admin-shell.html')]);
  assert.ok(audit.includes('https://ekodi.kr/cgma'));
  assert.ok(audit.includes('href="https://cgma.ekodi.kr/'));
  assert.ok(shell.includes('href="https://ekodi.kr/cgma"'));
  assert.ok(!shell.includes('href="https://cgma.ekodi.kr/'));
});