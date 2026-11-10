import './support-cloudflare-workers-stub.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { normalizeNotice, sendOperatorNotice, operatorNotifyConfig, encodeHeaderWord, OperatorNotifier } = await import('../operator-notify.js');

const db = (row) => ({ prepare: () => ({ bind: () => ({ first: async () => row }) }) });
const notice = { source: 'mall', subject: '에코디몰 새 주문 1건', lines: ['커튼 × 1 · 8,500원 결제완료'], link: 'https://ekodi.kr/ekodimall/order-ops' };

test('only allow-listed sources, no PII, ekodi.kr links only', () => {
  assert.equal(normalizeNotice({ ...notice, source: 'evil' }).error, 'SOURCE_NOT_ALLOWED');
  assert.equal(normalizeNotice({ ...notice, lines: ['연락처 010-1234-5678'] }).error, 'PII_REJECTED');
  assert.equal(normalizeNotice({ ...notice, lines: ['메일 a@b.co'] }).error, 'PII_REJECTED');
  assert.equal(normalizeNotice({ ...notice, link: 'https://evil.example/' }).link, '');
  assert.equal(normalizeNotice({ ...notice, subject: '' }).error, 'EMPTY_NOTICE');
});

test('does not send until the sender Gmail is connected with send scope', async () => {
  assert.equal((await sendOperatorNotice({ DB: db(null) }, notice)).code, 'SENDER_NOT_CONNECTED');
  const acct = { id: 1 };
  const noScope = await sendOperatorNotice({ DB: db(acct) }, notice, { googleAccess: async () => ({ accessToken: 't', scopes: '' }), hasSendScope: () => false });
  assert.equal(noScope.code, 'SENDER_SEND_SCOPE_REQUIRED');
  assert.equal((await sendOperatorNotice({ DB: db(acct), OPERATOR_NOTIFY_ENABLED: 'false' }, notice)).code, 'NOTIFY_DISABLED');
});

test('sends a plain-text mail with an encoded Korean subject to configured recipients', async () => {
  let mail;
  const r = await sendOperatorNotice({ DB: db({ id: 1 }), OPERATOR_NOTIFY_RECIPIENTS: 'a@ekodi.kr' }, notice, {
    googleAccess: async () => ({ accessToken: 't', scopes: 'gmail.send' }), hasSendScope: () => true,
    send: async (_t, m) => { mail = m; return { id: 'm1' }; }
  });
  assert.deepEqual(r, { ok: true, id: 'm1' });
  assert.equal(mail.to, 'a@ekodi.kr');
  assert.equal(mail.subject, encodeHeaderWord('[에코디] 에코디몰 새 주문 1건'));
  assert.match(mail.body, /바로가기: https:\/\/ekodi\.kr\/ekodimall\/order-ops/);
});

test('defaults and public-surface isolation', async () => {
  const c = operatorNotifyConfig({});
  assert.equal(c.sender, 'ekodibiz@gmail.com');
  const rpc = new OperatorNotifier({}, {});
  assert.equal((await rpc.fetch()).status, 404);
  const entry = readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');
  assert.match(entry, /export \{ OperatorNotifier \} from '\.\/operator-notify\.js';/);
  const toml = readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8');
  assert.match(toml, /OPERATOR_NOTIFY_SENDER = "ekodibiz@gmail.com"/);
});
