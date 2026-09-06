import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { injectTaxHometaxLedger } from '../tax-hometax-ledger.js';
import { namespaceFinanceSql } from '../finance-entry-worker.js';

const migration = fs.readFileSync(new URL('../migrations/0044_finance_hometax_ledger.sql', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../tax-hometax-ledger-service.js', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');

test('HomeTax ledger schema is additive and approval-number deduplicated', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS finance_tax_hometax_import_batches/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS finance_tax_hometax_ledger/);
  assert.match(migration, /UNIQUE\(organization_id, source_key\)/);
  assert.match(migration, /idx_finance_tax_hometax_approval/);
});

test('Finance namespace maps HomeTax ledger tables to shared Finance D1', () => {
  assert.equal(namespaceFinanceSql('SELECT * FROM tax_hometax_ledger'), 'SELECT * FROM finance_tax_hometax_ledger');
  assert.equal(namespaceFinanceSql('SELECT * FROM tax_hometax_import_batches'), 'SELECT * FROM finance_tax_hometax_import_batches');
});

test('HomeTax import service supports free file import and EKODI reconciliation', () => {
  assert.match(service, /tax-hometax-import/);
  assert.match(service, /tax-hometax-ledger/);
  assert.match(service, /sourceOfTruth:'HOMETAX'/);
  assert.match(service, /hometax-import-confirm/);
  assert.match(service, /NTS_CONFIRMED/);
  assert.match(service, /rawRows\.length>500/);
});

test('Tax portal injection exposes XLSX XML ZIP CSV import without third-party upload', async () => {
  const base = new Response("const x=1;\nloadAll();\n})();", { headers: { 'content-type':'application/javascript' } });
  const response = await injectTaxHometaxLedger(base);
  const text = await response.text();
  assert.match(text, /hometaxImportBtn/);
  assert.match(text, /\.xlsx,\.xls,\.xml,\.zip,\.csv,\.tsv/);
  assert.match(text, /DecompressionStream/);
  assert.match(text, /홈택스 실제 발행내역/);
  assert.match(text, /\/api\/finance\/tax-hometax-import/);
  assert.equal(response.headers.get('x-ekodi-tax-hometax-ledger'), 'v1');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('shared Tax router injects both local supplier fallback and HomeTax ledger', () => {
  assert.match(router, /injectTaxLocalFallback/);
  assert.match(router, /injectTaxHometaxLedger/);
  assert.match(router, /routeTaxFinance/);
});
