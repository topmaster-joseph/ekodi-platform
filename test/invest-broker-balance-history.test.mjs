import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildBrokerReadOnlyView, recordBalanceHistory } from '../invest-broker-readonly-adapter.js';
import { normalizeBrokerReadOnlySnapshot } from '../invest-broker-readonly-snapshot.js';
import { investMyRoute } from '../invest-my-workspace.js';

const NOW = Date.UTC(2026, 9, 31, 3, 0, 0);
function d1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['202610310100_invest_broker_token_cache.sql', '202610310300_invest_broker_snapshot_history.sql'])
    sqlite.exec(fs.readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  const st = (sql, p = []) => ({ bind(...v) { return st(sql, v); }, async first() { return sqlite.prepare(sql).get(...p) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...p) }; }, async run() { const r = sqlite.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } });
  return { sqlite, prepare: sql => st(sql) };
}
const ACC = '11111111-2222-4333-8444-555555555555';
const snap = (cash, value, at, ref) => normalizeBrokerReadOnlySnapshot({
  brokerId: 'kis', environment: 'paper', accountRef: ACC, snapshotRef: ref, capturedAt: new Date(at).toISOString(), currency: 'KRW',
  cashAmount: cash, positions: [{ symbol: '069500', market: 'KR', currency: 'KRW', quantity: '1', marketValue: value }],
}, { now: at });

test('first inquiry has no comparison; a later one reports the balance change, labelled as not return', async () => {
  const db = d1();
  assert.equal(await recordBalanceHistory({ db, subjectKey: 'person:a', dataMode: 'kis-paper', normalized: snap('1000', '500', NOW, '0b0b0b0b-0000-4000-8000-000000000001'), now: NOW }), null);
  const later = NOW + 2 * 3600_000;
  const change = await recordBalanceHistory({ db, subjectKey: 'person:a', dataMode: 'kis-paper', normalized: snap('900', '800', later, '0b0b0b0b-0000-4000-8000-000000000002'), now: later });
  assert.equal(change.totalChangeMinor, String((1700n - 1500n) * 100n));
  assert.equal(change.cashChangeMinor, '-10000');
  assert.equal(change.holdingsChangeMinor, '30000');
  assert.equal(change.meaning, 'balance_change_not_investment_return');
  assert.equal(change.previousCapturedAt, new Date(NOW).toISOString());
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM investment_broker_snapshots').get().n, 2);
});

test('history is isolated by owner, data mode and account, and throttled to one row per 10 minutes', async () => {
  const db = d1();
  await recordBalanceHistory({ db, subjectKey: 'person:a', dataMode: 'kis-paper', normalized: snap('1000', '500', NOW, '0b0b0b0b-0000-4000-8000-000000000011'), now: NOW });
  assert.equal(await recordBalanceHistory({ db, subjectKey: 'person:b', dataMode: 'kis-paper', normalized: snap('1', '1', NOW + 1000, '0b0b0b0b-0000-4000-8000-000000000012'), now: NOW + 1000 }), null);
  assert.equal(await recordBalanceHistory({ db, subjectKey: 'person:a', dataMode: 'kis-live', normalized: snap('1', '1', NOW + 2000, '0b0b0b0b-0000-4000-8000-000000000013'), now: NOW + 2000 }), null);
  const soon = await recordBalanceHistory({ db, subjectKey: 'person:a', dataMode: 'kis-paper', normalized: snap('1100', '500', NOW + 60_000, '0b0b0b0b-0000-4000-8000-000000000014'), now: NOW + 60_000 });
  assert.equal(soon.totalChangeMinor, '10000');
  assert.equal(db.sqlite.prepare(`SELECT COUNT(*) n FROM investment_broker_snapshots WHERE subject_key='person:a' AND data_mode='kis-paper'`).get().n, 1, 'throttled');
  const stored = db.sqlite.prepare('SELECT snapshot_json FROM investment_broker_snapshots').all().map(r => r.snapshot_json).join('');
  assert.doesNotMatch(stored, /appkey|appsecret|access_token|CANO/i);
});

test('mock view carries a change only between mock snapshots and never without an owner key', async () => {
  const db = d1();
  const a = await buildBrokerReadOnlyView({ brokerId: 'kis', env: {}, db, now: NOW, subjectKey: 'person:a' });
  assert.equal(a.change, null);
  const b = await buildBrokerReadOnlyView({ brokerId: 'kis', env: {}, db, now: NOW + 3600_000, subjectKey: 'person:a' });
  assert.equal(b.change.totalChangeMinor, '0');
  assert.equal(b.dataMode, 'mock');
  const anon = await buildBrokerReadOnlyView({ brokerId: 'kis', env: {}, db: d1(), now: NOW });
  assert.equal(anon.change, null);
});

test('page shows the balance-change tile with the not-a-return caption', async () => {
  const html = await (await investMyRoute(new Request('https://ekodi.kr/invest'), {})).text();
  const js = await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'), {})).text();
  assert.match(html, /id="brokerChange"/); assert.match(html, /잔고 변화이며 투자수익이 아님/);
  assert.match(js, /입출금 포함, 투자수익 아님/);
});
