import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('free-first Finance blocks paid tax automation unless explicitly enabled', async () => {
  const worker = await source('tax-invoice-free-first-worker.js');
  assert.match(worker, /TAX_INVOICE_AUTOMATION_ENABLED/);
  assert.match(worker, /FREE_FIRST_AUTOMATION_DISABLED/);
  assert.match(worker, /defaultChannel: 'HOMETAX_MANUAL'/);
  assert.match(worker, /provider='HOMETAX_MANUAL'/);
});

test('manual HomeTax completion has a first-class ledger endpoint', async () => {
  const worker = await source('tax-invoice-free-first-worker.js');
  assert.match(worker, /manual-issued/);
  assert.match(worker, /hometax\.manual\.record/);
  assert.match(worker, /NTS_CONFIRMED/);
  assert.match(worker, /ISSUED/);
});

test('paid adapter remains installed for future scale but is not the default channel', async () => {
  const base = await source('tax-invoice-worker.js');
  const policy = await source('tax-invoice-free-first-worker.js');
  assert.match(base, /POPBILL_LINK_ID/);
  assert.match(base, /popbillIssue/);
  assert.match(policy, /paidAutomationProvider: 'POPBILL'/);
  assert.match(policy, /costMode: 'FREE_DEFAULT'/);
});

test('admin clearly exposes free HomeTax operations', async () => {
  const admin = await source('tax-invoice-admin.js');
  assert.match(admin, /홈택스 · 무료 기본/);
  assert.match(admin, /정보 복사/);
  assert.match(admin, /홈택스 열기/);
  assert.match(admin, /발행완료 기록/);
  assert.match(admin, /FREE-FIRST/);
});

test('free-first source modules pass Node syntax checks', () => {
  for (const file of [
    'tax-invoice-free-first-worker.js',
    'tax-invoice-admin.js',
    'finance-entry-worker.js'
  ]) {
    execFileSync(process.execPath, ['--check', `${root}${file}`], { stdio: 'pipe' });
  }
});
