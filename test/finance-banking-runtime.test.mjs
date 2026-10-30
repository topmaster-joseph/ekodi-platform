import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import entryWorker, { namespaceFinanceSql } from '../finance-entry-worker.js';

// Runtime contract test for the pre-approval (file-linked) banking ledger.
// Executes the real worker SQL against SQLite through the same table namespacing
// the production entry worker applies, with a stubbed central identity service.

const migration = await readFile(new URL('../migrations/0112_finance_banking_tenant_admin.sql', import.meta.url), 'utf8');

function d1(sqlite) {
  const statement = (sql, values = []) => ({
    bind: (...args) => statement(sql, args),
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: r.changes } }; }
  });
  return { prepare: sql => statement(sql) };
}

function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE finance_organizations (id TEXT PRIMARY KEY,name TEXT,legal_name TEXT,kind TEXT,active INTEGER,created_at TEXT,updated_at TEXT);
    CREATE TABLE finance_business_units (id TEXT PRIMARY KEY,organization_id TEXT,name TEXT,source_domain TEXT,kind TEXT,active INTEGER,created_at TEXT,updated_at TEXT);
    INSERT INTO finance_organizations VALUES ('EKODIBIZ','에코디비즈','에코디비즈','business',1,'x','x'),('CGMA','청계면상인회','청계면상인회','association',1,'x','x'),
      ('EKODICHURCH','에코디교회','에코디교회','church',1,'x','x'),('EKODILAB','에코디연구소','에코디연구소','research',1,'x','x');`);
  sqlite.exec(migration);
  return sqlite;
}

const TOKENS = {
  'tok-biz-owner': { email: 'owner@ekodi.test', workspace: 'ekodibiz', role: 'owner' },
  'tok-biz-viewer': { email: 'viewer@ekodi.test', workspace: 'ekodibiz', role: 'manager' },
  'tok-cgma-owner': { email: 'cgma@ekodi.test', workspace: 'cgma', role: 'owner' }
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  const auth = String(init.headers?.authorization || '');
  const who = TOKENS[auth.replace(/^Bearer /, '')];
  if (url.endsWith('/auth/v1/user')) {
    return who ? Response.json({ id: `uid-${who.email}`, email: who.email, email_confirmed_at: '2026-01-01' }) : new Response('{}', { status: 401 });
  }
  if (url.endsWith('/rpc/current_site_activity_contexts')) {
    return Response.json(who ? [{ tenant: who.workspace, workspace_key: who.workspace, authorization_role: who.role }] : []);
  }
  if (url.startsWith('https://renzehysxirjilvdxacv.supabase.co')) return new Response('{}', { status: 403 });
  return realFetch(input, init);
};

function client(env) {
  return async (token, method, path, body, workspace) => {
    const ws = workspace ?? TOKENS[token]?.workspace ?? 'ekodibiz';
    const url = new URL(`https://ekodi.kr/api/finance/banking${path}`);
    url.searchParams.set('workspace', ws);
    const headers = { origin: 'https://ekodi.kr' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body) headers['content-type'] = 'application/json';
    const response = await entryWorker.fetch(new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined }), env, {});
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  };
}

async function seeded() {
  const sqlite = freshDb();
  const env = { DB: d1(sqlite) };
  const call = client(env);
  const biz = await call('tok-biz-owner', 'POST', '/accounts', { institutionName: '토스뱅크', accountAlias: '운영비 통장', accountLast4: '1234', currentBalance: 0, provider: 'OPENBANK', transferEnabled: true, organizationId: 'CGMA' });
  assert.equal(biz.status, 201, JSON.stringify(biz.data));
  const cgma = await call('tok-cgma-owner', 'POST', '/accounts', { institutionName: '농협', accountAlias: '상인회 통장', accountLast4: '9876' });
  assert.equal(cgma.status, 201);
  return { sqlite, env, call, bizAccount: biz.data.id, cgmaAccount: cgma.data.id };
}

const ROWS = [
  { rowNumber: 2, bookedAt: '2026.09.03 10:00', direction: 'in', amount: 500000, balanceAfter: 500000, description: '후원금', counterpartyName: '홍길동', category: '후원', externalId: 'a-1' },
  { rowNumber: 3, bookedAt: '2026-09-15', direction: 'out', amount: 120000, balanceAfter: 380000, description: '=HYPERLINK("x")', counterpartyName: '문구점', category: '운영비', externalId: 'a-2' },
  { rowNumber: 4, bookedAt: '2026/10/01 09:30', direction: 'out', amount: 30000, balanceAfter: 350000, description: '통신비', counterpartyName: 'KT', category: '', externalId: 'a-3' },
  { rowNumber: 5, bookedAt: '2026-02-30', direction: 'in', amount: 1000, externalId: 'bad-date' },
  { rowNumber: 6, bookedAt: '2026-10-02', direction: 'in', amount: 0, externalId: 'bad-amount' },
  { rowNumber: 7, bookedAt: '2026/10/01 09:30', direction: 'out', amount: 30000, balanceAfter: 350000, description: '통신비', counterpartyName: 'KT', category: '', externalId: 'a-3' }
];

test('tenant manual account is forced to MANUAL, own organization, no read/transfer rights', async () => {
  const { sqlite, bizAccount } = await seeded();
  const row = sqlite.prepare('SELECT * FROM finance_bank_connections WHERE id=?').get(bizAccount);
  assert.equal(row.organization_id, 'EKODIBIZ');
  assert.equal(row.provider, 'MANUAL');
  assert.equal(row.account_ref, '');
  assert.equal(row.read_enabled, 0);
  assert.equal(row.transfer_enabled, 0);
});

test('import reports created, duplicate and rejected rows with row numbers and is idempotent', async () => {
  const { call, bizAccount, sqlite } = await seeded();
  const first = await call('tok-biz-owner', 'POST', '/transactions/import', { bankConnectionId: bizAccount, transactions: ROWS });
  assert.equal(first.status, 201);
  assert.equal(first.data.created, 3);
  assert.equal(first.data.duplicates, 1);
  assert.equal(first.data.skipped, 2);
  assert.deepEqual(first.data.errors, [{ row: 5, reason: 'INVALID_DATE' }, { row: 6, reason: 'INVALID_AMOUNT' }]);
  const again = await call('tok-biz-owner', 'POST', '/transactions/import', { bankConnectionId: bizAccount, transactions: ROWS });
  assert.equal(again.data.created, 0);
  assert.equal(again.data.duplicates, 4);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM finance_bank_transactions').get().n, 3);
  const stored = sqlite.prepare("SELECT booked_at FROM finance_bank_transactions WHERE external_id='a-1'").get();
  assert.equal(stored.booked_at, '2026-09-03T10:00:00');
  const account = sqlite.prepare('SELECT current_balance FROM finance_bank_connections WHERE id=?').get(bizAccount);
  assert.equal(account.current_balance, 350000);
});

test('transaction filters, totals and monthly summary stay inside the organization', async () => {
  const { call, bizAccount, cgmaAccount } = await seeded();
  await call('tok-biz-owner', 'POST', '/transactions/import', { bankConnectionId: bizAccount, transactions: ROWS });
  await call('tok-cgma-owner', 'POST', '/transactions/import', { bankConnectionId: cgmaAccount, transactions: [{ bookedAt: '2026-09-10', direction: 'in', amount: 777, externalId: 'c-1', category: '회비' }] });

  const all = await call('tok-biz-owner', 'GET', '/transactions');
  assert.equal(all.status, 200);
  assert.equal(all.data.totals.count, 3);
  assert.equal(all.data.totals.income, 500000);
  assert.equal(all.data.totals.expense, 150000);
  assert.equal(all.data.totals.net, 350000);
  assert.ok(all.data.transactions.every(t => t.organizationId === 'EKODIBIZ'));
  assert.deepEqual(all.data.categories, ['운영비', '후원']);

  const sept = await call('tok-biz-owner', 'GET', '/transactions?from=2026-09-01&to=2026-09-30&direction=out');
  assert.equal(sept.data.totals.count, 1);
  assert.equal(sept.data.transactions[0].externalId, undefined);
  const search = await call('tok-biz-owner', 'GET', '/transactions?q=%ED%99%8D%EA%B8%B8');
  assert.equal(search.data.totals.count, 1);
  const uncategorized = await call('tok-biz-owner', 'GET', '/transactions?category=__none__');
  assert.equal(uncategorized.data.totals.count, 1);
  const wildcard = await call('tok-biz-owner', 'GET', '/transactions?q=%25');
  assert.equal(wildcard.data.totals.count, 0);

  const crossAccount = await call('tok-biz-owner', 'GET', `/transactions?accountId=${encodeURIComponent(cgmaAccount)}`);
  assert.equal(crossAccount.data.totals.count, 0, 'another organization account id must not leak rows');

  const summary = await call('tok-biz-owner', 'GET', '/transactions/summary');
  assert.deepEqual(summary.data.months, [
    { month: '2026-10', count: 1, income: 0, expense: 30000, net: -30000 },
    { month: '2026-09', count: 2, income: 500000, expense: 120000, net: 380000 }
  ]);
  const bad = await call('tok-biz-owner', 'GET', '/transactions?from=2026/09/01');
  assert.equal(bad.status, 400);
});

test('CSV export is scoped, BOM-prefixed and neutralises spreadsheet formulas', async () => {
  const { call, bizAccount, cgmaAccount, sqlite } = await seeded();
  await call('tok-biz-owner', 'POST', '/transactions/import', { bankConnectionId: bizAccount, transactions: ROWS });
  await call('tok-cgma-owner', 'POST', '/transactions/import', { bankConnectionId: cgmaAccount, transactions: [{ bookedAt: '2026-09-10', direction: 'in', amount: 777, externalId: 'c-1' }] });
  const exported = await call('tok-biz-owner', 'GET', '/transactions/export');
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-type'), /text\/csv/);
  assert.match(exported.headers.get('content-disposition'), /attachment; filename="ekodi-transactions-ekodibiz-/);
  assert.equal(exported.headers.get('x-ekodi-export-rows'), '3');
  assert.ok(exported.data.startsWith('﻿거래일시,계좌,구분,금액'));
  assert.match(exported.data, /"'=HYPERLINK\(""x""\)"/);
  assert.doesNotMatch(exported.data, /777/);
  assert.doesNotMatch(exported.data, /9876/);
  const audit = sqlite.prepare("SELECT organization_id,detail FROM finance_bank_audit_log WHERE action='bank.transactions.export'").get();
  assert.deepEqual({ ...audit }, { organization_id: 'EKODIBIZ', detail: 'rows=3' });
});

test('account edit and deactivation are audited, reversible, scoped and block imports while inactive', async () => {
  const { call, bizAccount, cgmaAccount, sqlite } = await seeded();
  const edit = await call('tok-biz-owner', 'PATCH', `/accounts/${encodeURIComponent(bizAccount)}`, { accountAlias: '사업 운영비', accountLast4: '4321', provider: 'OPENBANK', transferEnabled: true, organizationId: 'CGMA' });
  assert.equal(edit.status, 200);
  assert.deepEqual(edit.data.changed, ['accountAlias', 'accountLast4']);
  const row = sqlite.prepare('SELECT * FROM finance_bank_connections WHERE id=?').get(bizAccount);
  assert.equal(row.account_alias, '사업 운영비');
  assert.equal(row.provider, 'MANUAL');
  assert.equal(row.transfer_enabled, 0);
  assert.equal(row.organization_id, 'EKODIBIZ');

  assert.equal((await call('tok-biz-owner', 'PATCH', `/accounts/${encodeURIComponent(bizAccount)}`, { accountLast4: '12' })).status, 400);
  assert.equal((await call('tok-biz-owner', 'PATCH', `/accounts/${encodeURIComponent(bizAccount)}`, { accountAlias: '' })).status, 400);

  const off = await call('tok-biz-owner', 'PATCH', `/accounts/${encodeURIComponent(bizAccount)}`, { active: false });
  assert.equal(off.data.connectionStatus, 'disconnected');
  const blocked = await call('tok-biz-owner', 'POST', '/transactions/import', { bankConnectionId: bizAccount, transactions: ROWS });
  assert.equal(blocked.status, 409);
  const on = await call('tok-biz-owner', 'PATCH', `/accounts/${encodeURIComponent(bizAccount)}`, { active: true });
  assert.equal(on.data.connectionStatus, 'active');

  const actions = sqlite.prepare("SELECT action FROM finance_bank_audit_log WHERE resource_id=? ORDER BY id").all(bizAccount).map(r => r.action);
  assert.deepEqual(actions, ['bank.connection.create', 'bank.connection.update', 'bank.connection.deactivate', 'bank.connection.reactivate']);

  const cross = await call('tok-biz-owner', 'PATCH', `/accounts/${encodeURIComponent(cgmaAccount)}`, { active: false });
  assert.equal(cross.status, 404, 'cannot touch another organization account');
  assert.equal(sqlite.prepare('SELECT connection_status FROM finance_bank_connections WHERE id=?').get(cgmaAccount).connection_status, 'active');

  sqlite.prepare("UPDATE finance_bank_connections SET provider='OPENBANK' WHERE id=?").run(bizAccount);
  const providerManaged = await call('tok-biz-owner', 'PATCH', `/accounts/${encodeURIComponent(bizAccount)}`, { active: false });
  assert.equal(providerManaged.status, 403);
});

test('unauthenticated is 401, read-only role is 403 for writes but can read and export', async () => {
  const { call, bizAccount } = await seeded();
  for (const [method, path] of [['GET', '/transactions'], ['GET', '/transactions/summary'], ['GET', '/transactions/export'], ['PATCH', `/accounts/${bizAccount}`]]) {
    const response = await call('', method, path, method === 'PATCH' ? { active: false } : undefined, 'ekodibiz');
    assert.equal(response.status, 401, `${method} ${path}`);
  }
  assert.equal((await call('tok-biz-viewer', 'GET', '/transactions')).status, 200);
  assert.equal((await call('tok-biz-viewer', 'GET', '/transactions/export')).status, 200);
  assert.equal((await call('tok-biz-viewer', 'PATCH', `/accounts/${encodeURIComponent(bizAccount)}`, { active: false })).status, 403);
  assert.equal((await call('tok-biz-viewer', 'POST', '/transactions/import', { bankConnectionId: bizAccount, transactions: ROWS })).status, 403);
  assert.equal((await call('tok-biz-owner', 'GET', '/transactions', undefined, 'cgma')).status, 401, 'workspace without membership');
});

test('namespacing covers every banking table used by new queries', () => {
  const sql = namespaceFinanceSql('SELECT * FROM bank_transactions t LEFT JOIN bank_connections c');
  assert.equal(sql, 'SELECT * FROM finance_bank_transactions t LEFT JOIN finance_bank_connections c');
});
