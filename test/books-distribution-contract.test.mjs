import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('Books distribution schema contains channel and per-publication tracking', async () => {
  const sql = await read('migrations/0011_books_distribution_status.sql');
  for (const marker of [
    'books_distribution_channels',
    'books_distribution_status',
    'google-play-books',
    'amazon-kdp',
    'kyobo',
    'yes24',
    'aladin',
    'ridibooks',
    'ekodi-direct',
  ]) assert.ok(sql.includes(marker), `missing distribution schema marker: ${marker}`);
});

test('Books distribution API is routed before the generic Books controller', async () => {
  const worker = await read('customer-entry-worker.js');
  const distribution = worker.indexOf("path.startsWith('/api/books/admin/distribution')");
  const generic = worker.indexOf('handleBooksRequest(request, env)');
  assert.ok(distribution >= 0, 'distribution route missing');
  assert.ok(generic > distribution, 'distribution handler must run before generic Books handler');
});

test('Books distribution admin provides status matrix and verified channel links', async () => {
  const ui = await read('books-distribution-admin.js');
  const migration = await read('migrations/0011_books_distribution_status.sql');
  for (const marker of ['Distribution', '채널 계정 · 제휴 현황', '도서별 등록 · 배포 현황', '관리센터', '가입/제휴', '도움말']) {
    assert.ok(ui.includes(marker), `missing distribution UI marker: ${marker}`);
  }
  for (const url of [
    'https://play.google.com/books/publish/',
    'https://kdp.amazon.com/en_US/bookshelf',
    'https://partner.kyobobook.co.kr/login',
    'https://www.aladin.co.kr/supplier/wmain.aspx',
    'https://cp.ridibooks.com/',
  ]) assert.ok(migration.includes(url), `missing channel link: ${url}`);
});

test('Books distribution operations surface stale checks, action queue and CSV export', async () => {
  const ui = await read('books-distribution-admin.js');
  const css = await read('books-distribution-admin.css');
  for (const marker of [
    'STALE_DAYS = 14',
    'ACTION QUEUE',
    'Needs Attention',
    'Stale 14d+',
    'CSV Export',
    'markCheckedToday',
    'openFinance',
    'exportCsv',
  ]) assert.ok(ui.includes(marker), `missing distribution operations marker: ${marker}`);
  for (const marker of ['books-distribution-attention', 'books-attention-item', 'books-dist-stale']) {
    assert.ok(css.includes(marker), `missing distribution operations style: ${marker}`);
  }
});

test('Books build bundles distribution module into secured lazy Books assets', async () => {
  const build = await read('scripts/build.mjs');
  assert.ok(build.includes('books-distribution-admin.css'));
  assert.ok(build.includes('books-distribution-admin.js'));
  assert.ok(build.includes('books-finance-admin.css'));
  assert.ok(build.includes('books-finance-admin.js'));
});