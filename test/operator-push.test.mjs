import './support-cloudflare-workers-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { operatorPushEmails, operatorPushReady, validOperatorSubscription, sendOperatorPush } from '../operator-push.js';
const { sendOperatorNotice } = await import('../operator-notify.js');

const JWK = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' });
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } };
function fakeDb(rows = []) {
  const updates = [];
  return { updates, prepare: (sql) => ({ bind: (...a) => ({ run: async () => { updates.push([sql, a]); }, first: async () => null }), run: async () => {}, all: async () => ({ results: rows }) }) };
}

test('operator push is limited to configured operator accounts and needs VAPID keys only', () => {
  assert.deepEqual(operatorPushEmails({}), ['topmaster.joseph@gmail.com', 'joseph@ekodi.kr']);
  assert.equal(operatorPushReady({}), false);
  assert.equal(operatorPushReady({ NOTIFICATION_VAPID_PUBLIC_KEY: 'k', NOTIFICATION_VAPID_PRIVATE_JWK: JWK }), true);
  assert.equal(validOperatorSubscription(sub), true);
  assert.equal(validOperatorSubscription({ ...sub, endpoint: 'https://evil.example/push' }), false);
});

test('sends to every operator device and disables expired ones', async () => {
  const db = fakeDb([{ id: 'd1', endpoint: sub.endpoint }, { id: 'd2', endpoint: sub.endpoint + '2' }]);
  const env = { DB: db, NOTIFICATION_VAPID_PUBLIC_KEY: 'k', NOTIFICATION_VAPID_PRIVATE_JWK: JWK };
  const r = await sendOperatorPush(env, { title: 't', body: 'b', targetPath: '/ekodimall/order-ops' }, { sendWebPush: async (row) => ({ ok: row.id === 'd1', status: row.id === 'd1' ? 201 : 410 }) });
  assert.deepEqual(r, { ok: true, sent: 1 });
  assert.ok(db.updates.some(([sql, a]) => sql.includes('disabled_at=?') && a.at(-1) === 'd2'));
  assert.equal((await sendOperatorPush({ DB: fakeDb([]), NOTIFICATION_VAPID_PUBLIC_KEY: 'k', NOTIFICATION_VAPID_PRIVATE_JWK: JWK }, { title: 't', body: 'b', targetPath: '/' })).code, 'OPERATOR_PUSH_NO_DEVICE');
});

test('a notice succeeds when either phone push or Gmail delivers; waits when neither channel exists', async () => {
  const notice = { source: 'mall', subject: '새 주문 1건', lines: ['커튼 × 1 · 8,500원 결제완료'], link: 'https://ekodi.kr/ekodimall/order-ops' };
  let pushed;
  const viaPush = await sendOperatorNotice({ DB: fakeDb() }, notice, { push: async (_e, p) => { pushed = p; return { ok: true, sent: 1 }; } });
  assert.equal(viaPush.ok, true); assert.equal(viaPush.push, true); assert.equal(pushed.targetPath, '/ekodimall/order-ops');
  let mailCalled = false;
  const pushOnly = await sendOperatorNotice({ DB: fakeDb() }, notice, { push: async () => ({ ok: true, sent: 1 }), send: async () => { mailCalled = true; return { id: 'm' }; } });
  assert.equal(pushOnly.ok, true); assert.equal(pushOnly.mail, false); assert.equal(mailCalled, false, 'mail is off by default');
  assert.match(readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8'), /OPERATOR_NOTIFY_MAIL_ENABLED = "false"/);
  const none = await sendOperatorNotice({ DB: fakeDb() }, notice, { push: async () => ({ ok: false, code: 'OPERATOR_PUSH_NO_DEVICE' }) });
  assert.equal(none.code, 'NO_OPERATOR_CHANNEL');
});

test('routes, UI and deploy provisioning are wired without rotating existing keys', () => {
  const mail = readFileSync(new URL('../mail-control.js', import.meta.url), 'utf8');
  assert.match(mail, /url\.pathname==='\/api\/mail\/control\/operator-push'/);
  assert.match(mail, /if\(!isOperator\)return json\(\{error:'운영자 계정만 등록할 수 있습니다\.',code:'OPERATOR_ONLY'\},403,request\)/);
  const page = readFileSync(new URL('../mail-admin-page.js', import.meta.url), 'utf8');
  assert.match(page, /id="opPush" hidden/);
  assert.match(page, /pushManager\.subscribe\(\{userVisibleOnly:true/);
  // navigator.serviceWorker.ready never resolves on /mail/admin (outside the /notifications/ scope) → must wait on the registration itself.
  assert.doesNotMatch(page, /navigator\.serviceWorker\.ready/);
  assert.match(page, /await swActive\(reg\)/);
  const wf = readFileSync(new URL('../.github/workflows/deploy-control-api.yml', import.meta.url), 'utf8');
  assert.match(wf, /if \[ "\$has_pub" = 0 \] && \[ "\$has_priv" = 0 \]; then/);
  assert.match(wf, /refusing to rotate/);
  const mall = readFileSync(new URL('../sites/ekodi-mall/api/operator-notify.js', import.meta.url), 'utf8');
  assert.match(mall, /'NO_OPERATOR_CHANNEL'/);
});
