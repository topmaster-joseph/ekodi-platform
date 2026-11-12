import './support-cloudflare-workers-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const { runMailPushWatch, pickNew, buildMailPush, senderName } = await import('../mail-push-watch.js');

const JWK = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' });
function env() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE mail_accounts (id INTEGER PRIMARY KEY, provider TEXT, connection_status TEXT, enabled INTEGER, display_name TEXT, email_address TEXT);
    CREATE TABLE mail_credentials (account_id INTEGER);
    INSERT INTO mail_accounts VALUES (1,'gmail','connected',1,'에코디비즈','ekodibiz@gmail.com'),(2,'gmail','pending_oauth',1,'x','x@y.z');
    INSERT INTO mail_credentials VALUES (1);`);
  const wrap = (sql) => { const st = () => db.prepare(sql); return { bind: (...a) => ({ run: async () => st().run(...a), first: async () => st().get(...a) ?? null, all: async () => ({ results: st().all(...a) }) }), run: async () => st().run(), all: async () => ({ results: st().all() }) }; };
  return { db, e: { DB: { prepare: wrap }, NOTIFICATION_VAPID_PUBLIC_KEY: 'k', NOTIFICATION_VAPID_PRIVATE_JWK: JWK } };
}
const msg = (id, from = '"홍길동" <h@x.kr>', subject = '견적 문의') => ({ id, from, subject });

test('first run only records existing mail; later runs push only new mail for connected accounts', async () => {
  const { e } = env();
  let inbox = [msg('m2'), msg('m1')];
  const pushes = [];
  const deps = { googleAccess: async () => ({ accessToken: 't', scopes: 'gmail.readonly' }), hasRead: () => true, list: async () => ({ messages: inbox }), push: async (_e, p) => { pushes.push(p); return { ok: true, sent: 1 }; } };
  assert.deepEqual(await runMailPushWatch(e, deps), { accounts: 1, notified: 0, errors: 0 });
  assert.equal(pushes.length, 0);
  inbox = [msg('m3', 'Toss <no-reply@toss.im>', '정산 안내'), msg('m2'), msg('m1')];
  const r = await runMailPushWatch(e, deps);
  assert.equal(r.notified, 1);
  assert.equal(pushes[0].title, '새 메일 · 에코디비즈');
  assert.equal(pushes[0].body, 'Toss — 정산 안내');
  assert.match(pushes[0].targetPath, /^\/\?account=1&message=m3$/);
  assert.equal((await runMailPushWatch(e, deps)).notified, 0, 'no duplicate alerts');
});

test('a failed first check never creates an empty cursor (which would flood old mail later)', async () => {
  const { e, db } = env();
  await runMailPushWatch(e, { googleAccess: async () => { throw Object.assign(new Error('x'), { code: 'MAIL_REFRESH_FAILED' }); } });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM mail_push_cursor').get().n, 0);
});

test('batching, sender names, disable switch and cron wiring', async () => {
  const many = Array.from({ length: 7 }, (_, i) => msg('n' + i, `a${i}@x.kr`, '제목' + i));
  const p = buildMailPush({ id: 9, display_name: '청계면상인회', email_address: 'c@x.kr' }, many);
  assert.equal(p.title, '새 메일 7건 · 청계면상인회');
  assert.match(p.body, /외 2건$/);
  assert.equal(senderName('"에코디" <a@b.c>'), '에코디');
  assert.deepEqual(pickNew([msg('a')], [], true).fresh, []);
  assert.deepEqual(await runMailPushWatch({ OPERATOR_MAIL_PUSH_ENABLED: 'false' }), { skipped: 'disabled' });
  const entry = readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
  assert.match(entry, /const mailPush = runMailPushWatch\(env\)/);
  assert.match(readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8'), /OPERATOR_MAIL_PUSH_ENABLED = "true"/);
});
