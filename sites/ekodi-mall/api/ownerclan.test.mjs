import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { probeOwnerclan, ownerclanHosts } from './ownerclan.js';

function d1(db) {
  const wrap = (sql) => { const stmt = db.prepare(sql); let args = []; const api = {
    bind(...v) { args = v.map((x) => (x === undefined ? null : x)); return api; },
    async first() { return stmt.get(...args) ?? null; }, async run() { stmt.run(...args); return { success: true }; },
    async all() { return { results: stmt.all(...args) }; } }; return api; };
  return { prepare: wrap, async batch(list) { for (const s of list) await s.run(); return []; } };
}
function setup(extra = {}) {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('./migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  return { db, env: { DB: d1(db), OWNERCLAN_USER_ID: 'ekodi', OWNERCLAN_PASSWORD: 'SECRET!', ...extra } };
}
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc_def';

test('hosts default to production; sandbox via OWNERCLAN_ENV', () => {
  assert.equal(ownerclanHosts({}).graphql, 'https://api.ownerclan.com/v1/graphql');
  assert.equal(ownerclanHosts({ OWNERCLAN_ENV: 'sandbox' }).auth, 'https://auth-sandbox.ownerclan.com/auth');
});

test('probe logs in, records schema field names only, never the token or password', async () => {
  const { db, env } = setup();
  const seen = [];
  const r = await probeOwnerclan(env, async (url, init) => {
    seen.push({ url: String(url), init });
    if (String(url).includes('/auth')) return new Response(JSON.stringify({ token: TOKEN }));
    assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
    return new Response(JSON.stringify({ data: { __schema: { queryType: { fields: [{ name: 'allItems', args: [{ name: 'first' }, { name: 'search' }] }] }, mutationType: { fields: [{ name: 'createOrder', args: [{ name: 'input' }] }] } } } }));
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.mutations, ['createOrder(input)']);
  const auth = JSON.parse(seen[0].init.body);
  assert.deepEqual({ service: auth.service, userType: auth.userType, username: auth.username }, { service: 'ownerclan', userType: 'seller', username: 'ekodi' });
  const row = db.prepare("SELECT result_status,metadata_json FROM supplier_connector_checks WHERE external_ref='probe:ownerclan'").get();
  assert.equal(row.result_status, 'ok');
  assert.ok(!row.metadata_json.includes('SECRET!') && !row.metadata_json.includes(TOKEN));
  assert.equal((await probeOwnerclan(env, async () => { throw new Error('x'); })).skipped, 'recent');
});

test('login failure raises an alert without leaking the password', async () => {
  const { db, env } = setup();
  const r = await probeOwnerclan(env, async () => new Response('invalid password SECRET!', { status: 401 }));
  assert.equal(r.ok, false);
  const alert = db.prepare("SELECT message FROM mall_ops_alerts WHERE kind='supply.ownerclan_login_failed'").get();
  assert.ok(alert && !alert.message.includes('SECRET!'));
  assert.equal((await probeOwnerclan(setup({ OWNERCLAN_PASSWORD: '' }).env)).skipped, 'not-configured');
});
