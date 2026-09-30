import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { namespaceFinanceSql } from '../finance-entry-worker.js';

const root = fileURLToPath(new URL('../', import.meta.url));

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('finance namespace isolates tax invoice tables', () => {
  const sql = namespaceFinanceSql('SELECT * FROM tax_invoices JOIN tax_customers ON tax_customers.id=tax_invoices.customer_id');
  assert.match(sql, /finance_tax_invoices/);
  assert.match(sql, /finance_tax_customers/);
  assert.doesNotMatch(sql, /\bFROM tax_invoices\b/);
});

test('tax invoice lifecycle requires explicit human approval before issue', async () => {
  const worker = await source('tax-invoice-worker.js');
  assert.match(worker, /row\.status !== 'DRAFT'/);
  assert.match(worker, /status='APPROVED'/);
  assert.match(worker, /row\.status !== 'APPROVED'/);
  assert.match(worker, /TAX_INVOICE_LIVE_ENABLED/);
  assert.match(worker, /운영 발행 잠금/);
});

test('provider secrets stay server-side and admin receives readiness booleans only', async () => {
  const worker = await source('tax-invoice-worker.js');
  const admin = await source('tax-invoice-admin.js');
  for (const secret of ['POPBILL_SECRET_KEY', 'POPBILL_LINK_ID']) {
    assert.match(worker, new RegExp(secret));
    assert.doesNotMatch(admin, new RegExp(secret));
  }
  assert.match(worker, /credentialsConfigured: providerConfigured\(env\)/);
});

test('migration creates independent tax ledger and immutable event history table', async () => {
  const migration = await source('migrations/0030_finance_tax_invoices.sql');
  for (const table of ['finance_tax_profiles', 'finance_tax_customers', 'finance_tax_invoices', 'finance_tax_invoice_events']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /'DRAFT','APPROVED','ISSUING','ISSUED','NTS_CONFIRMED','FAILED','CANCELED'/);
});

test('new Finance assets pass Node syntax checks', () => {
  for (const file of ['tax-invoice-worker.js', 'tax-invoice-admin.js', 'finance-entry-worker.js', 'admin-demand-loader.js']) {
    execFileSync(process.execPath, ['--check', `${root}${file}`], { stdio: 'pipe' });
  }
});
