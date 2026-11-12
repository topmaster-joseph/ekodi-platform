import test from 'node:test';
import assert from 'node:assert/strict';

const { COOPERATIVES } = await import('../cooperative-registry.js');
const { routeCooperative } = await import('../cooperative-control.js');
const { cooperativeScript, cooperativeCss } = await import('../cooperative-ui.js');
const { cooperativePage } = await import('../cooperative-page.js');
const { fixture: baseFixture, authFetch } = await import('./helpers/cooperative-fixture.mjs');
const fixture = () => { const f = baseFixture(); f.sqlite.exec(`ALTER TABLE customer_access_grants ADD COLUMN created_at TEXT;
  ALTER TABLE customer_access_grants ADD COLUMN principal_type TEXT NOT NULL DEFAULT 'member';
  ALTER TABLE customer_access_grants ADD COLUMN note TEXT NOT NULL DEFAULT '';
  ALTER TABLE customer_access_grants ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
  ALTER TABLE customer_access_grants ADD COLUMN updated_at TEXT;`); return f; };
const [jubilee, open] = COOPERATIVES;
const req = (coop, path, token = '', method = 'GET', body) => new Request(`https://ekodi.kr/${coop.slug}/api${path}`, {
  method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { origin: 'https://ekodi.kr', 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
});
const call = (f, ...a) => routeCooperative(req(...a), f.env);

async function setAccount(f, coop, shareAccount) {
  const p = await (await call(f, coop, '/project', 'chair')).json();
  return call(f, coop, '/project', 'chair', 'PUT', { revision: p.revision, state: { profile: { ...p.state.profile, shareAccount } } });
}

test('admin registers the share account; join GET shows it before registration', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  t.mock.method(globalThis, 'fetch', authFetch({ chair: 'chair@example.test', a: 'new@example.test' }));
  f.grant(jubilee, 'chair@example.test', 'admin', { capabilities: ['tenant.site.manage'] });
  let before = await (await call(f, jubilee, '/join', 'a')).json();
  assert.equal(before.shareAccount, null); assert.equal(before.shareUnit, 10000);
  assert.equal((await (await setAccount(f, jubilee, { bank: '농협', number: '12-34', holder: '' })).json()).code, 'COOP_SHARE_ACCOUNT_INVALID');
  assert.equal((await (await setAccount(f, jubilee, { bank: '', number: '301-1234-5678-91', holder: '정찬균' })).json()).code, 'COOP_SHARE_ACCOUNT_INCOMPLETE');
  assert.equal((await setAccount(f, jubilee, { bank: '농협', number: '301-1234-5678-91', holder: '희년세상협동조합 발기인 정찬균' })).status, 200);
  before = await (await call(f, jubilee, '/join', 'a')).json();
  assert.deepEqual(before.shareAccount, { bank: '농협', number: '301-1234-5678-91', holder: '희년세상협동조합 발기인 정찬균' });
  assert.equal((await (await call(f, open, '/join', 'a')).json()).shareAccount, null, 'other cooperative untouched');
});

test('payment state: member can only report, admin confirms and the server stamps the date', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  t.mock.method(globalThis, 'fetch', authFetch({ chair: 'chair@example.test', a: 'm1@example.test', b: 'm2@example.test' }));
  f.grant(open, 'chair@example.test', 'admin', { capabilities: ['tenant.site.manage'] });
  assert.equal((await call(f, open, '/join', 'a', 'POST', { representative: '갑', phone: '01012345678', consent: true })).status, 200);
  assert.equal((await call(f, open, '/join', 'b', 'POST', { representative: '을', phone: '01022223333', consent: true, depositReported: true })).status, 200);
  let a = await (await call(f, open, '/me', 'a')).json();
  assert.equal(a.me.founder.payment, 'unpaid');
  assert.equal((await (await call(f, open, '/me', 'b')).json()).me.founder.payment, 'reported');
  // member cannot self-confirm through my-business
  assert.equal((await call(f, open, '/my-business', 'a', 'PUT', { payment: 'confirmed', revision: a.revision })).status, 400);
  const reported = await call(f, open, '/my-business', 'a', 'PUT', { depositReported: true, revision: a.revision });
  assert.equal(reported.status, 200);
  a = await reported.json();
  assert.equal(a.me.founder.payment, 'reported');
  assert.equal(a.me.founder.business, null, 'deposit report keeps business fields untouched');
  assert.equal(JSON.stringify(a.founders).includes('payment'), false, 'peers never see payment state');
  // admin confirms
  const p = await (await call(f, open, '/project', 'chair')).json();
  const founders = p.state.founders.map(x => x.accountEmail === 'm1@example.test' ? { ...x, payment: 'confirmed' } : x);
  const saved = await call(f, open, '/project', 'chair', 'PUT', { revision: p.revision, state: { founders } });
  assert.equal(saved.status, 200);
  const row = (await saved.json()).state.founders.find(x => x.accountEmail === 'm1@example.test');
  assert.equal(row.payment, 'confirmed'); assert.match(row.paymentConfirmedAt, /^\d{4}-\d{2}-\d{2}$/);
  const bad = p.state.founders.map(x => ({ ...x, payment: 'paid-by-magic' }));
  assert.equal((await call(f, open, '/project', 'chair', 'PUT', { revision: p.revision + 1, state: { founders: bad } })).status, 400);
});

test('join form explains the deposit before consent; member space shows status; text wraps naturally', () => {
  const html = cooperativePage(jubilee, 'members');
  const guide = html.indexOf('출자금 납입 안내'), consent = html.indexOf('name="consent"');
  assert.ok(guide > 0 && guide < consent, 'deposit guide precedes consent');
  assert.match(html, /name="depositReported"/);
  const js = cooperativeScript();
  for (const s of ['입금 전', '입금 알림 · 운영진 확인 중', '입금 확인 완료', 'id="reportDeposit"', 'shareAccountNumber', 'data-key="payment"', 'depositReported: form.elements.depositReported']) assert.ok(js.includes(s), s);
  assert.match(cooperativeCss(), /word-break:keep-all/); assert.match(cooperativeCss(), /\.pay-badge\.confirmed/);
});
