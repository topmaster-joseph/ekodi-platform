import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleRosterApi, ROSTER_API_PREFIX, SECTIONS, maskEmail, randomCode, CODE_TTL_MS, GRANT_TTL_MS } from '../mokpo-presbytery-roster-api.js';

const MIGRATION = readFileSync('migrations/202611091000_mokpo_presbytery_roster.sql', 'utf8');

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE admins(email TEXT, role TEXT); CREATE TABLE admin_google_accounts(email TEXT, role TEXT, status TEXT);');
  db.exec(MIGRATION);
  db.exec(MIGRATION); // idempotent
  const wrap = (sql) => {
    let args = [];
    const stmt = {
      bind: (...a) => { args = a; return stmt; },
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    };
    return stmt;
  };
  return { db, DB: { prepare: wrap } };
}

function setup() {
  const { db, DB } = d1();
  db.prepare('INSERT INTO admins VALUES (?,?)').run('owner@ekodi.test', 'super_admin');
  db.prepare('INSERT INTO admin_google_accounts VALUES (?,?,?)').run('owner@ekodi.test', 'super_admin', 'active');
  db.prepare("INSERT INTO mokpo_presbytery_roster_admins(email,status,created_at) VALUES ('clerk@ekodi.test','active','x')").run();
  db.prepare("INSERT INTO mokpo_presbytery_roster_entries(section,seq,kind,church,ministers,elders,address,phone,email,note,updated_at) VALUES ('함무',1,'church','에코디','[{\"role\":\"담임\",\"name\":\"가나다\"}]','[]','주소','010-0000-0000','','','x')").run();
  db.prepare("INSERT INTO mokpo_presbytery_roster_entries(section,seq,kind,church,ministers,elders,address,phone,email,note,updated_at) VALUES ('미분류',1,'person','대중','[]','[\"김영○\"]','','','','성명 확인필요','x')").run();
  const sent = [];
  let clock = 1_800_000_000_000;
  const env = { DB, ENVIRONMENT: 'production' };
  const opts = (email) => ({
    principal: async () => (email ? { email } : null),
    sendMail: async (to, code) => { sent.push({ to, code }); },
    now: () => clock,
  });
  const call = (path, { method = 'GET', email = 'owner@ekodi.test', body, grant, origin = 'https://ekodi.kr' } = {}) => {
    const headers = { authorization: 'Bearer x', 'content-type': 'application/json' };
    if (origin) headers.origin = origin;
    if (grant) headers['x-roster-grant'] = grant;
    return handleRosterApi(new Request('https://ekodi.kr' + ROSTER_API_PREFIX + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env, opts(email));
  };
  return { db, env, sent, call, tick: (ms) => { clock += ms; } };
}

async function verified(t, email = 'owner@ekodi.test') {
  const r = await t.call('/code', { method: 'POST', email });
  assert.equal(r.status, 200);
  const code = t.sent.at(-1).code;
  const v = await t.call('/verify', { method: 'POST', email, body: { code } });
  assert.equal(v.status, 200);
  return (await v.json()).grant;
}

test('non-roster paths are ignored', async () => {
  const { DB } = d1();
  assert.equal(await handleRosterApi(new Request('https://ekodi.kr/api/other'), { DB }, {}), null);
});

test('status is public and carries no roster data', async () => {
  const t = setup();
  const r = await t.call('/status', { email: null });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(await r.json()).sort(), ['mailReady', 'ok']);
});

test('step 1: anonymous and non-admin callers get nothing and no code is sent', async () => {
  const t = setup();
  assert.equal((await t.call('', { email: null })).status, 401);
  assert.equal((await t.call('/code', { method: 'POST', email: null })).status, 401);
  assert.equal((await t.call('/code', { method: 'POST', email: 'member@ekodi.test' })).status, 403);
  assert.equal(t.sent.length, 0);
});

test('step 2: a signed-in admin without the email code cannot read the roster', async () => {
  const t = setup();
  const r = await t.call('', { email: 'owner@ekodi.test' });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'SECOND_FACTOR_REQUIRED');
  assert.equal((await t.call('', { grant: 'f'.repeat(64) })).status, 401);
});

test('code goes to the signed-in email only, is stored hashed, and opens the roster', async () => {
  const t = setup();
  const grant = await verified(t);
  assert.equal(t.sent[0].to, 'owner@ekodi.test');
  assert.match(t.sent[0].code, /^[0-9]{6}$/);
  const stored = t.db.prepare('SELECT code_hash FROM mokpo_presbytery_roster_codes').all();
  assert.ok(stored.every((row) => !row.code_hash.includes(t.sent[0].code)));
  const r = await t.call('', { grant });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  const data = await r.json();
  assert.deepEqual(data.sections, SECTIONS);
  assert.equal(data.entries.length, 2);
  assert.equal(data.entries.find((e) => e.section === '미분류').note, '성명 확인필요');
});

test('registered roster admin works; grant is bound to its own email', async () => {
  const t = setup();
  const grant = await verified(t, 'clerk@ekodi.test');
  assert.equal((await t.call('', { email: 'clerk@ekodi.test', grant })).status, 200);
  assert.equal((await t.call('', { email: 'owner@ekodi.test', grant })).status, 401);
});

test('wrong code counts attempts and locks after five; codes are single use and expire', async () => {
  const t = setup();
  await t.call('/code', { method: 'POST' });
  const good = t.sent.at(-1).code;
  const bad = good === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await t.call('/verify', { method: 'POST', body: { code: bad } })).status, 400);
  assert.equal((await t.call('/verify', { method: 'POST', body: { code: good } })).status, 429);

  await t.call('/code', { method: 'POST' });
  const second = t.sent.at(-1).code;
  assert.equal((await t.call('/verify', { method: 'POST', body: { code: second } })).status, 200);
  assert.equal((await t.call('/verify', { method: 'POST', body: { code: second } })).status, 400);

  await t.call('/code', { method: 'POST' });
  const third = t.sent.at(-1).code;
  t.tick(CODE_TTL_MS + 1);
  assert.equal((await t.call('/verify', { method: 'POST', body: { code: third } })).status, 400);
});

test('grant expires after 30 minutes', async () => {
  const t = setup();
  const grant = await verified(t);
  t.tick(GRANT_TTL_MS + 1);
  assert.equal((await t.call('', { grant })).status, 401);
});

test('code requests are rate limited per email', async () => {
  const t = setup();
  for (let i = 0; i < 5; i++) assert.equal((await t.call('/code', { method: 'POST' })).status, 200);
  assert.equal((await t.call('/code', { method: 'POST' })).status, 429);
});

test('cross-origin POST is refused before any authority check', async () => {
  const t = setup();
  assert.equal((await t.call('/code', { method: 'POST', origin: 'https://evil.example' })).status, 403);
  assert.equal(t.sent.length, 0);
});

test('미분류 entries can be classified into a 시찰 with a valid grant only', async () => {
  const t = setup();
  const id = t.db.prepare("SELECT id FROM mokpo_presbytery_roster_entries WHERE section='미분류'").get().id;
  assert.equal((await t.call('/classify', { method: 'POST', body: { id, section: '함무' } })).status, 401);
  const grant = await verified(t);
  assert.equal((await t.call('/classify', { method: 'POST', grant, body: { id, section: '없는시찰' } })).status, 400);
  const r = await t.call('/classify', { method: 'POST', grant, body: { id, section: '함무' } });
  assert.equal(r.status, 200);
  const row = t.db.prepare('SELECT section,seq FROM mokpo_presbytery_roster_entries WHERE id=?').get(id);
  assert.deepEqual({ ...row }, { section: '함무', seq: 2 });
  assert.ok(t.db.prepare("SELECT 1 FROM mokpo_presbytery_roster_audit WHERE action='roster.classify'").get());
});

test('mail failure removes the pending code and real sender fails closed without secrets', async () => {
  const t = setup();
  const r = await handleRosterApi(new Request('https://ekodi.kr' + ROSTER_API_PREFIX + '/code', { method: 'POST', headers: { origin: 'https://ekodi.kr', authorization: 'Bearer x' } }),
    t.env, { principal: async () => ({ email: 'owner@ekodi.test' }), sendMail: async () => { throw new Error('boom'); } });
  assert.equal(r.status, 502);
  assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM mokpo_presbytery_roster_codes').get().n, 0);
  const n = await handleRosterApi(new Request('https://ekodi.kr' + ROSTER_API_PREFIX + '/code', { method: 'POST', headers: { origin: 'https://ekodi.kr', authorization: 'Bearer x' } }),
    t.env, { principal: async () => ({ email: 'owner@ekodi.test' }) });
  assert.equal(n.status, 503);
  assert.equal((await n.json()).code, 'MAIL_NOT_CONFIGURED');
});

test('helpers', () => {
  assert.equal(maskEmail('joseph@ekodi.kr'), 'jo****@ekodi.kr');
  for (let i = 0; i < 50; i++) assert.match(randomCode(), /^[0-9]{6}$/);
});

test('repository carries no roster personal data; page and worker are wired', () => {
  const files = ['mokpo-presbytery-roster-api.js', 'migrations/202611091000_mokpo_presbytery_roster.sql', 'sites/mokpo-presbytery/roster/index.html',
    'sites/mokpo-presbytery/roster/roster.js', 'supabase/migrations/20261109090000_mokpo_mission_department_roster.sql'];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /01[016789]-?\d{3,4}-?\d{4}/, f);
    assert.doesNotMatch(src, /(양동제일|안좌대리|윤여권|곽군용|김찬구)/, f);
  }
  const roster = readFileSync('sites/mokpo-presbytery/roster/roster.js', 'utf8');
  assert.doesNotMatch(roster, /innerHTML|insertAdjacentHTML|document\.write/);
  const router = readFileSync('platform-router-entry-worker.js', 'utf8');
  assert.match(router, /handleRosterApi\(request,env\)/);
  assert.match(router, /isRosterScript/);
  const headers = readFileSync('_headers', 'utf8');
  assert.match(headers, /\/mokpo-presbytery\/roster\/\*\n {2}! Content-Security-Policy\n {2}Content-Security-Policy: default-src 'none'; script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  const home = readFileSync('sites/mokpo-presbytery/index.html', 'utf8');
  assert.match(home, /href="\/mokpo-presbytery\/roster\/"/);
});

test('department roster migration: full for 부장·서기, names for 부원, refused otherwise', () => {
  const sql = readFileSync('supabase/migrations/20261109090000_mokpo_mission_department_roster.sql', 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.organization_department_roster from public, anon, authenticated/);
  assert.match(sql, /if v_role = 'chair' then v_full := true; elsif v_role is not null then v_names := true;/);
  assert.match(sql, /'scope', 'names', 'people', coalesce\(\(select jsonb_agg\(jsonb_build_object\('name', person_name, 'office', office\)/);
  assert.match(sql, /raise exception 'department_roster_access_required'/);
  assert.match(sql, /revoke all on function public\.organization_department_roster_set\(text,jsonb\) from public, anon;/);
  const site = readFileSync('sites/mokpo-presbytery/mission/site.js', 'utf8');
  assert.match(site, /organization_department_roster',\{p_slug:CFG\.slug,p_token:pinToken\|\|null\}/);
  const space = readFileSync('.github/workflows/deploy-space.yml', 'utf8');
  assert.match(space, /mokpo_dept_roster/);
  assert.match(space, /organization_department_roster served an anonymous caller/);
});
