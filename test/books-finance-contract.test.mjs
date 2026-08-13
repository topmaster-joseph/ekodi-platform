import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

await import('../books-finance-control.js');

const [migration, api, entry, admin, build] = await Promise.all([
  readFile(new URL('../migrations/0010_books_channel_finance.sql', import.meta.url), 'utf8'),
  readFile(new URL('../books-finance-control.js', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../books-finance-admin.js', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

new Function(admin);

test('Books finance ledger stores channel, publication, currency and settlement dimensions', () => {
  for (const marker of [
    'books_sales_channels',
    'books_finance_transactions',
    'channel_code',
    'publication_id',
    'amount_original',
    'fx_rate',
    'amount_krw',
    'settlement_status',
    'amazon-kdp',
    'google-play',
    'ekodi-direct',
  ]) assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Books finance API separates sales, refunds and costs and remains administrator-only', () => {
  assert.match(api, /VALID_TYPES/);
  assert.match(api, /grossSales/);
  assert.match(api, /refunds/);
  assert.match(api, /costs/);
  assert.match(api, /profit/);
  assert.match(api, /unsettledNet/);
  assert.match(api, /await session\(request, env\)/);
  assert.match(api, /books\.finance\.create/);
  assert.match(api, /books\.finance\.import/);
  assert.match(entry, /handleBooksFinanceRequest/);
  assert.match(entry, /\/api\/books\/admin\/finance/);
});

test('Books Control exposes channel P&L, ledger entry, CSV import and export', () => {
  assert.match(admin, /Sales & Costs/);
  assert.match(admin, /CHANNEL P&L/);
  assert.match(admin, /TRANSACTION LEDGER/);
  assert.match(admin, /CSV Export/);
  assert.match(admin, /CSV Import/);
  assert.match(admin, /\/api\/books\/admin\/finance\/transactions/);
  assert.match(admin, /\/api\/books\/admin\/finance\/import/);
});

test('production build ships the Books finance UI assets', () => {
  assert.match(build, /'books-finance-admin\.css'/);
  assert.match(build, /'books-finance-admin\.js'/);
  assert.match(build, /books-finance-admin\.css/);
  assert.match(build, /books-finance-admin\.js/);
});
