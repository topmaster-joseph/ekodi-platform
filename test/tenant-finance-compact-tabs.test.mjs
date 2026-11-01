import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const finance=fs.readFileSync(new URL('../tenant-finance-admin.js',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const church=fs.readFileSync(new URL('../church-pastor-admin-page.js',import.meta.url),'utf8');

test('tenant finance exposes only three task tabs across workspace admins',()=>{
  assert.match(finance,/const FINANCE_TABS=\[\['accounts','계좌'\],\['ledger','거래내역'\],\['transfers','이체'\]\]/);
  assert.match(finance,/const ledgerPanel=/);
  assert.match(finance,/panel\('ledger',ledgerPanel\)/);
  assert.match(finance,/panel\('accounts',accountsPanel\)/);
  assert.match(finance,/panel\('transfers',transfersPanel\)/);
  assert.doesNotMatch(finance,/panel\('overview',/);
  assert.doesNotMatch(finance,/panel\('import',/);
  assert.match(finance,/overview:'accounts',import:'ledger'/);
});

test('account summary is only inside the account tab and import+monthly totals stay in transactions',()=>{
  assert.match(finance,/const accountSummary=/);
  assert.match(finance,/slice\(0,2\)\.map/);
  assert.match(finance,/summaryRoot\.replaceChildren\(\)/);
  assert.match(finance,/const accountsPanel=.*accountSummary/);
  assert.match(finance,/const ledgerPanel=.*importForm.*overviewPanel.*ledgerSection/);
  assert.match(finance,/data-bank-months/);
  assert.match(finance,/data-bank-export/);
});

test('real transfer execution remains gated and finance lazy module uses its source hash',()=>{
  assert.match(finance,/ready\.executorConnected&&ready\.transferExecutionEnabled/);
  assert.match(finance,/const API='\/api\/finance\/banking'/);
  const digest=createHash('sha256').update(finance).digest('hex').slice(0,12);
  assert.ok(shell.includes('tenant-finance-admin.js?v=finance-'+digest));
  assert.ok(church.includes('tenant-finance-admin.js?v=finance-'+digest));
});
