import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const source = fs.readFileSync('tenant-finance-admin.js', 'utf8');
const admin = fs.readFileSync('workspace-admin-page.js', 'utf8');

test('common banking UI has exactly three stable task tabs', () => {
  assert.ok(source.includes("const FINANCE_TABS=[['accounts','계좌'],['ledger','거래내역'],['transfers','이체']];"));
  for (const marker of ["panel('accounts',accountsPanel)", "panel('ledger',ledgerPanel)", "panel('transfers',transfersPanel)"]) assert.ok(source.includes(marker), marker);
  assert.ok(!source.includes("panel('overview',overviewPanel)"));
  assert.ok(!source.includes("panel('import',"));
});

test('legacy query links preserve navigation', () => {
  assert.ok(source.includes("overview:'accounts',import:'ledger'"));
  assert.ok(source.includes("if(key==='accounts')url.searchParams.delete('tab')"));
});

test('transactions tab retains import, ledger, monthly totals and export', () => {
  for (const key of ['bankCsvImportForm','data-bank-months','data-bank-recent','data-bank-transactions','data-bank-export','bankTxnFilterForm']) assert.ok(source.includes(key),key);
  assert.ok(source.includes('const ledgerPanel='));
});

test('accounts tab contains account creation and editing without top summary duplication', () => {
  for (const key of ['bankManualAccountForm','bankAccountEditForm','계좌 상세 현황',"summaryRoot.innerHTML='';"]) assert.ok(source.includes(key),key);
  assert.ok(source.includes("root.querySelector('[data-bank-kpi=\"month\"]')"));
});

test('transfer controls remain server gated', () => {
  for (const key of ['bankTransferRequestForm','data-transfer-approve','data-transfer-reject','data-transfer-execute','ready.transferExecutionEnabled']) assert.ok(source.includes(key),key);
  assert.ok(source.includes("const API='/api/finance/banking'"));
});

test('workspace loader uses current content hash to invalidate module cache', () => {
  const digest=createHash('sha256').update(fs.readFileSync('tenant-finance-admin.js','utf8').replace(/\r\n/g,'\n')).digest('hex').slice(0,12);
  assert.ok(admin.includes('/tenant-finance-admin.js?v='+digest));
});
