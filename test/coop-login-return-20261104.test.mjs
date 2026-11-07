import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const [auth, router, ui] = await Promise.all([
  read('../auth-site/client-auth.js'),
  read('../auth-site/auth-router.js'),
  read('../cooperative-ui.js'),
]);

// Extract client-auth's safeReturn and evaluate it against the coop realm.
function safeReturnFor(site) {
  const start = auth.indexOf('function safeReturn(raw){');
  const end = auth.indexOf('\nconst RETURN_TO=', start);
  assert.ok(start >= 0 && end > start, 'safeReturn exists');
  const realmsStart = auth.indexOf('const realms={');
  const realmsEnd = auth.indexOf('\n};', realmsStart) + 3;
  const realms = new Function(auth.slice(realmsStart, realmsEnd) + '\nreturn realms;')();
  const config = realms[site];
  assert.ok(config, `realm ${site} registered`);
  return new Function('config', 'DIRECT_LOGIN', auth.slice(start, end) + '\nreturn safeReturn;')(config, true);
}

test('cooperative pages request the dedicated coop login realm', () => {
  assert.match(ui, /url\.searchParams\.set\('site', 'coop'\)/);
  assert.doesNotMatch(ui, /url\.searchParams\.set\('site', 'portal'\)/);
  assert.match(router, /firstPartyClientSites=new Set\(\[[^\]]*'coop'/);
});

test('admin and member logins return to the cooperative page they started from', () => {
  const safeReturn = safeReturnFor('coop');
  for (const url of [
    'https://ekodi.kr/jubilee/admin',
    'https://ekodi.kr/jubilee/members',
    'https://ekodi.kr/open/admin',
    'https://ekodi.kr/open/members',
    'https://ekodi.kr/business-coop/',
    'https://ekodi.kr/jubilee-distribution/admin',
  ]) assert.equal(safeReturn(url), url, url);
  assert.equal(safeReturn('https://ekodi.kr/open/admin#ekodi_token=x'), 'https://ekodi.kr/open/admin');
});

test('coop realm never becomes an open redirect', () => {
  const safeReturn = safeReturnFor('coop');
  const fallback = 'https://ekodi.kr/business-coop/';
  for (const url of [
    'https://evil.example/jubilee/admin',
    'https://ekodi.kr/admin/',
    'https://ekodi.kr/jubileefake/admin',
    'https://ekodi.kr/openx',
    'http://ekodi.kr/jubilee/admin',
    'https://user:pw@ekodi.kr/jubilee/admin',
    'javascript:alert(1)',
  ]) assert.equal(safeReturn(url), fallback, url);
});

// ── 조합원 자가 등록(로그인 후 "조합원으로 등록할까요?" 동의 체크) ──
const { COOPERATIVES } = await import('../cooperative-registry.js');
const { routeCooperative } = await import('../cooperative-control.js');
const { loadCooperativeProject } = await import('../cooperative-store.js');
const { fixture: baseFixture, authFetch } = await import('./helpers/cooperative-fixture.mjs');
// Production customer_access_grants columns used by self-join (fixture keeps the minimal shape).
const fixture = () => { const f = baseFixture(); f.sqlite.exec(`ALTER TABLE customer_access_grants ADD COLUMN created_at TEXT;
  ALTER TABLE customer_access_grants ADD COLUMN principal_type TEXT NOT NULL DEFAULT 'member';
  ALTER TABLE customer_access_grants ADD COLUMN note TEXT NOT NULL DEFAULT '';
  ALTER TABLE customer_access_grants ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
  ALTER TABLE customer_access_grants ADD COLUMN updated_at TEXT;`); return f; };
const [jubilee, open] = COOPERATIVES;
const req = (coop, path, token = '', method = 'GET', body) => new Request(`https://ekodi.kr/${coop.slug}/api${path}`, {
  method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { origin: 'https://ekodi.kr', 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
});

test('join requires login and an explicit consent check', async t => {
  const f = fixture(); t.after(() => f.sqlite.close()); t.mock.method(globalThis, 'fetch', authFetch({ a: 'new@example.test' }));
  assert.equal((await routeCooperative(req(open, '/join', '', 'POST', { representative: '홍길동', consent: true }), f.env)).status, 401);
  assert.equal((await routeCooperative(req(open, '/join', 'a', 'POST', { representative: '홍길동', consent: false }), f.env)).status, 400);
  assert.equal((await routeCooperative(req(open, '/join', 'a', 'POST', { representative: '홍길동', consent: true, role: 'owner' }), f.env)).status, 400);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM customer_access_grants').get().n, 0);
});

test('consented join creates a member-only grant in that cooperative and appends the roster', async t => {
  const f = fixture(); t.after(() => f.sqlite.close()); t.mock.method(globalThis, 'fetch', authFetch({ a: 'New@Example.test' }));
  assert.equal((await routeCooperative(req(open, '/me', 'a'), f.env)).status, 403);
  const response = await routeCooperative(req(open, '/join', 'a', 'POST', { representative: '홍길동', phone: '01012345678', business: '길동상회', businessNumber: '1234567890', consent: true }), f.env);
  assert.equal(response.status, 200);
  const me = await (await routeCooperative(req(open, '/me', 'a'), f.env)).json();
  assert.equal(me.authority.role, 'member'); assert.equal(me.authority.canAdmin, false);
  assert.equal(me.me.founder.representative, '홍길동'); assert.equal(me.me.founder.position, 'member');
  assert.equal((await routeCooperative(req(open, '/project', 'a'), f.env)).status, 403, 'no admin capability');
  assert.equal((await routeCooperative(req(jubilee, '/me', 'a'), f.env)).status, 403, 'other cooperative untouched');
  assert.equal((await loadCooperativeProject(f.db, open)).state.founders.length, 6);
  // idempotent
  assert.equal((await routeCooperative(req(open, '/join', 'a', 'POST', { representative: '홍길동', phone: '010-1234-5678', consent: true }), f.env)).status, 200);
  assert.equal((await loadCooperativeProject(f.db, open)).state.founders.length, 6);
});

test('join links an existing unlinked roster name instead of duplicating it', async t => {
  const f = fixture(); t.after(() => f.sqlite.close()); t.mock.method(globalThis, 'fetch', authFetch({ b: 'park@example.test' }));
  const before = (await loadCooperativeProject(f.db, jubilee)).state.founders;
  const name = before[1].representative;
  assert.equal((await routeCooperative(req(jubilee, '/join', 'b', 'POST', { representative: name, phone: '02-123-4567', consent: true }), f.env)).status, 200);
  const after = (await loadCooperativeProject(f.db, jubilee)).state.founders;
  assert.equal(after.length, before.length);
  assert.equal(after[1].accountEmail, 'park@example.test');
});

test('a disabled grant is never revived by self-join', async t => {
  const f = fixture(); t.after(() => f.sqlite.close()); t.mock.method(globalThis, 'fetch', authFetch({ c: 'blocked@example.test' }));
  f.grant(open, 'blocked@example.test', 'member', { enabled: 0 });
  assert.equal((await routeCooperative(req(open, '/join', 'c', 'POST', { representative: '차단', phone: '01011112222', consent: true }), f.env)).status, 403);
  assert.equal((await routeCooperative(req(open, '/me', 'c'), f.env)).status, 403);
});

test('join requires a valid phone, validates business number, and shows only the caller email', async t => {
  const f = fixture(); t.after(() => f.sqlite.close()); t.mock.method(globalThis, 'fetch', authFetch({ a: 'Phone@Example.test', b: 'peer@example.test' }));
  const who = await (await routeCooperative(req(jubilee, '/join', 'a'), f.env)).json();
  assert.equal(who.email, 'phone@example.test');
  assert.equal((await routeCooperative(req(jubilee, '/join'), f.env)).status, 401);
  const post = body => routeCooperative(req(jubilee, '/join', 'a', 'POST', body), f.env);
  assert.equal((await (await post({ representative: '갑', consent: true })).json()).code, 'COOP_PHONE_REQUIRED');
  assert.equal((await (await post({ representative: '갑', phone: '12345', consent: true })).json()).code, 'COOP_PHONE_INVALID');
  assert.equal((await (await post({ representative: '갑', phone: '01012345678', businessNumber: '123', consent: true })).json()).code, 'COOP_BUSINESS_NUMBER_INVALID');
  assert.equal((await post({ representative: '갑', phone: '010 1234 5678', businessNumber: '123-45-67890', consent: true })).status, 200);
  const mine = await (await routeCooperative(req(jubilee, '/me', 'a'), f.env)).json();
  assert.equal(mine.me.founder.phone, '010-1234-5678');
  assert.equal(mine.me.founder.businessNumber, '123-45-67890');
  // another member never sees phone or business number in the shared roster
  assert.equal((await post.call(null, { representative: '갑', phone: '01012345678', consent: true })).status, 200);
  assert.equal((await routeCooperative(req(jubilee, '/join', 'b', 'POST', { representative: '을', phone: '01099998888', consent: true }), f.env)).status, 200);
  const peer = await (await routeCooperative(req(jubilee, '/me', 'b'), f.env)).json();
  const row = peer.founders.find(x => x.representative === '갑');
  assert.ok(row); assert.equal('phone' in row, false); assert.equal('businessNumber' in row, false);
  assert.equal(JSON.stringify(peer.founders).includes('010-1234-5678'), false);
  // self-edit can update own phone and business number
  const edit = await routeCooperative(req(jubilee, '/my-business', 'a', 'PUT', { phone: '01055556666', businessNumber: '', business: '갑상회', industry: '', revision: mine.revision + 1 }), f.env);
  assert.equal(edit.status, 200);
  const edited = await edit.json();
  assert.equal(edited.me.founder.phone, '010-5555-6666'); assert.equal(edited.me.founder.businessNumber, null);
});

// ── 명부 삭제·관리자 사업장 정보 입력(2026-11-07) ──
test('chair/admin can delete a roster member; the member grant is revoked; chair row is protected', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  t.mock.method(globalThis, 'fetch', authFetch({ chair: 'chair@example.test', m: 'member@example.test' }));
  f.grant(jubilee, 'chair@example.test', 'admin', { capabilities: ['tenant.site.manage'] });
  assert.equal((await routeCooperative(req(jubilee, '/join', 'm', 'POST', { representative: '홍길동', phone: '01012345678', consent: true }), f.env)).status, 200);
  let p = await (await routeCooperative(req(jubilee, '/project', 'chair'), f.env)).json();
  const target = p.state.founders.find(x => x.accountEmail === 'member@example.test');
  const chairRow = p.state.founders.find(x => x.position === 'chair-designate');
  const del = (token, id, rev) => routeCooperative(new Request(`https://ekodi.kr/${jubilee.slug}/api/founders/${encodeURIComponent(id)}?revision=${rev}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + token, origin: 'https://ekodi.kr' } }), f.env);
  assert.equal((await del('m', target.id, p.revision)).status, 403, 'members cannot delete');
  assert.equal((await del('chair', chairRow.id, p.revision)).status, 400, 'chair row protected');
  const ok = await del('chair', target.id, p.revision);
  assert.equal(ok.status, 200);
  p = await (await routeCooperative(req(jubilee, '/project', 'chair'), f.env)).json();
  assert.equal(p.state.founders.some(x => x.id === target.id), false);
  assert.equal((await routeCooperative(req(jubilee, '/me', 'm'), f.env)).status, 403, 'member access revoked');
  assert.equal((await routeCooperative(req(jubilee, '/me', 'chair'), f.env)).status, 200, 'admin grant untouched');
});

test('admin roster save validates and stores phone and business number', async t => {
  const f = fixture(); t.after(() => f.sqlite.close());
  t.mock.method(globalThis, 'fetch', authFetch({ chair: 'chair@example.test' }));
  f.grant(open, 'chair@example.test', 'admin', { capabilities: ['tenant.site.manage'] });
  const p = await (await routeCooperative(req(open, '/project', 'chair'), f.env)).json();
  const put = founders => routeCooperative(req(open, '/project', 'chair', 'PUT', { revision: p.revision, state: { founders } }), f.env);
  const bad = p.state.founders.map((x, i) => i === 1 ? { ...x, phone: '123' } : x);
  assert.equal((await put(bad)).status, 400);
  const good = p.state.founders.map((x, i) => i === 1 ? { ...x, phone: '01098765432', businessNumber: '2131301959', business: '테스트상회' } : x);
  const saved = await put(good);
  assert.equal(saved.status, 200);
  const row = (await saved.json()).state.founders[1];
  assert.equal(row.phone, '010-9876-5432'); assert.equal(row.businessNumber, '213-13-01959'); assert.equal(row.business, '테스트상회');
});
