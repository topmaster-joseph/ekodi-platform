import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Books rights migration creates holders, rules, statements and statement lines', async () => {
  const sql = await read('migrations/0013_books_rights_royalties.sql');
  for (const marker of ['books_rightsholders','books_publication_rights','books_royalty_statements','books_royalty_statement_lines','royalty_rate_bps','fixed_per_unit_krw','payout_reference']) {
    assert.ok(sql.includes(marker), `missing royalty schema marker: ${marker}`);
  }
  assert.equal(sql.includes('bank_account'), false, 'raw bank account data must not be stored');
  assert.equal(sql.includes('tax_id'), false, 'raw tax identifier data must not be stored');
});

test('Books royalty API calculates statements from finance ledger and posts paid royalties back as costs', async () => {
  const control = await read('books-royalty-control.js');
  for (const marker of ['gross_sales','net_receipts','per_unit','books_finance_transactions','channel_fee','royalty-engine','transaction_type','royalty','payoutRef','TRANSITIONS']) {
    assert.ok(control.includes(marker), `missing royalty API marker: ${marker}`);
  }
  assert.ok(control.includes("status<>'void'"), 'duplicate active statement periods should be blocked');
  assert.ok(control.includes("externalRef = `royalty:${statement.statement_no}:${line.id}`"), 'royalty finance entries need idempotent external references');
});

test('Canonical Books API routes royalties before generic Books handling', async () => {
  const entry = await read('customer-entry-worker.js');
  const royaltyRoute = entry.indexOf("path.startsWith('/api/books/admin/royalties')");
  const genericBooks = entry.indexOf('handleBooksRequest(request, env)');
  assert.ok(entry.includes("import { handleBooksRoyaltyRequest } from './books-royalty-control.js'"));
  assert.ok(royaltyRoute >= 0);
  assert.ok(genericBooks > royaltyRoute);
});

test('Books royalties admin manages holders, rights rules and statement lifecycle without collecting sensitive payout data', async () => {
  const ui = await read('books-royalty-admin.js');
  for (const marker of ['Royalties','권리 · 인세 · 지급 관리','RIGHTSHOLDERS','RIGHTS RULES','STATEMENTS','Generate Statement','Mark Paid','Sales & Costs','계좌번호나 세금 식별번호는 저장하지 않습니다.']) {
    assert.ok(ui.includes(marker), `missing royalties UI marker: ${marker}`);
  }
  assert.ok(ui.includes('/api/books/admin/royalties/statements/generate'));
  assert.ok(ui.includes('/api/books/admin/royalties/rights'));
  assert.ok(ui.includes('/api/books/admin/royalties/holders'));
  assert.equal(ui.includes('name="bankAccount"'), false);
  assert.equal(ui.includes('name="taxId"'), false);
});

test('Books build includes royalties in secured lazy operations bundle', async () => {
  const build = await read('scripts/build.mjs');
  for (const marker of ['books-royalty-admin.css','books-royalty-admin.js','books-finance-admin.css','books-finance-admin.js']) {
    assert.ok(build.includes(marker), `missing royalty build marker: ${marker}`);
  }
});
