import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('migrations/202611091000_mokpo_presbytery_roster.sql', 'utf8'));
  const wrap = (sql) => { let args = []; const st = { bind: (...a) => { args = a; return st; }, first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }) }; return st; };
  return { DB: { prepare: wrap } };
}

test('Control API entry serves /api/mokpo-presbytery/roster/*', async () => {
  const { default: control } = await import('../mission-control-entry-worker.js');
  const { DB } = d1();
  const env = { ENVIRONMENT: 'production', DB };
  const r = await control.fetch(new Request('https://ekodi.kr/api/mokpo-presbytery/roster/status'), env, { waitUntil() {} });
  assert.equal(r.headers.get('x-ekodi-route'), 'mokpo-presbytery-roster');
  assert.equal(r.status, 200);
  const list = await control.fetch(new Request('https://ekodi.kr/api/mokpo-presbytery/roster/'), env, { waitUntil() {} });
  assert.equal(list.headers.get('x-ekodi-route'), 'mokpo-presbytery-roster');
  assert.equal(list.status, 401);
});

