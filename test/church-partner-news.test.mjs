// CHURCH-PARTNER-NEWS-001
//
// 교회 홈 06 구역('함께 걷는 이들의 소식')이 부르던 /api/partner-news/public 은
// 구현이 없었다. 2026-11-12 운영 측정(교회 역량증명 실행 43225492451 liveRequests):
//   {"status": 404, "url": "/api/partner-news/public"}
// 캐시 없는 방문자는 "잠시 후 다시 확인해 주세요" 를 봤다 — 되지 않을 일을
// 기다리라는 안내였다.
//
// 구역이 스스로 적어둔 약속이 사양이다: "확인·승인된 내용만 나눕니다."
// 그래서 다음을 실제로 실행해 확인한다. 소스 문자열 대조가 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_ORGS,
  handlePartnerNewsAdmin,
  handlePartnerNewsPublic,
  refreshPartnerNewsDrafts,
  safeSourceUrl,
} from '../church-partner-news.js';

// ── 최소 D1 모사 ────────────────────────────────────────────────────────────
// 규칙을 여기서 다시 구현하면 구현이 틀려도 통과한다(실제로 첫 회차에 자동 초안이
// 스스로 공개하는 변이와 승인 경계를 지우는 변이가 잡히지 않았다). 그래서 상태·
// 조건·중복 방지는 모사가 판단하지 않고 **전달된 SQL에서 읽어** 적용한다.

// WHERE 절의 col='value' 조건을 뽑는다. 조건이 사라지면 그만큼 느슨해져서
// 테스트가 깨지도록 하는 것이 목적이다.
function sqlEqualityFilters(sql) {
  const where = /WHERE([\s\S]*?)(?:ORDER BY|LIMIT|$)/i.exec(sql);
  if (!where) return [];
  return [...where[1].matchAll(/([a-z_]+)\s*=\s*'([^']*)'/gi)].map(m => [m[1], m[2]]);
}

// INSERT ... VALUES (...) 의 상태·출처 리터럴을 읽는다.
function insertLiterals(sql) {
  const values = /VALUES\s*\(([\s\S]*?)\)/i.exec(sql);
  const literals = values ? [...values[1].matchAll(/'([^']*)'/g)].map(m => m[1]) : [];
  return { status: literals[0] ?? null, origin: literals[1] ?? null };
}
function fakeDb({ rows = [], ministry = [], notices = [], missing = new Set(), fail = null } = {}) {
  const store = rows.map(r => ({ ...r }));
  const calls = [];
  return {
    store,
    calls,
    prepare(sql) {
      const binding = [];
      const api = {
        bind(...args) { binding.push(...args); return api; },
        async all() {
          calls.push({ sql, binding: [...binding] });
          if (fail) throw new Error(fail);
          // 출처 조건은 SQL 에서 읽어 적용한다. 조건이 지워지면 승인되지 않은
          // 행까지 통과하고, 그 결과로 테스트가 깨진다.
          const applyWhere = source => {
            const filters = sqlEqualityFilters(sql);
            return source.filter(r => filters.every(([col, value]) => String(r[col]) === value));
          };
          if (/FROM ministry_news_items/.test(sql)) {
            if (missing.has('ministry_news_items')) throw new Error('D1_ERROR: no such table: ministry_news_items');
            return { results: applyWhere(ministry) };
          }
          if (/FROM seonammedi_notices/.test(sql)) {
            if (missing.has('seonammedi_notices')) throw new Error('D1_ERROR: no such table: seonammedi_notices');
            return { results: applyWhere(notices) };
          }
          if (missing.has('church_partner_news')) throw new Error('D1_ERROR: no such table: church_partner_news');
          const tenant = binding[0];
          let found = store.filter(r => r.tenant === tenant);
          if (/status='published'/.test(sql)) found = found.filter(r => r.status === 'published');
          found.sort((a, b) => String(b.news_date).localeCompare(String(a.news_date)));
          const limit = /LIMIT \?/.test(sql) ? Number(binding[1]) : 200;
          return { results: found.slice(0, limit) };
        },
        async run() {
          calls.push({ sql, binding: [...binding] });
          if (fail) throw new Error(fail);
          if (missing.has('church_partner_news')) throw new Error('D1_ERROR: no such table: church_partner_news');
          if (/^INSERT INTO church_partner_news/.test(sql.trim())) {
            const [id, tenant, orgKey, orgName, title, summary, sourceUrl, newsDate] = binding;
            // 상태·출처는 SQL 의 리터럴을 그대로 쓴다. 'draft' 를 'published' 로
            // 바꾸는 변이가 여기서 드러나야 한다.
            const { status, origin } = insertLiterals(sql);
            const sourceRef = origin === 'auto' ? binding[8] : null;
            // 중복 방지도 SQL 이 말할 때만 적용한다.
            const dedupes = /ON CONFLICT[\s\S]*DO NOTHING/i.test(sql);
            if (dedupes && sourceRef && store.some(r => r.tenant === tenant && r.source_ref === sourceRef)) return { meta: { changes: 0 } };
            // 실제 SQLite 처럼 기본키 중복은 거부한다. ON CONFLICT 를 지우면 조용히
            // 중복되는 것이 아니라 오류가 되는 것이 현실이다.
            if (store.some(r => r.id === id)) throw new Error('D1_ERROR: UNIQUE constraint failed: church_partner_news.id');
            store.push({
              id, tenant, org_key: orgKey, org_name: orgName, title, summary,
              source_url: sourceUrl, image_url: null, news_date: newsDate,
              status, origin, source_ref: sourceRef,
              edited_by_admin: origin === 'auto' ? 0 : 1, created_at: 'now', updated_at: 'now',
              updated_by: 'x', published_at: null, published_by: '',
            });
            return { meta: { changes: 1 } };
          }
          if (/^UPDATE church_partner_news/.test(sql.trim())) {
            const id = binding[binding.length - (/status<>\?/.test(sql) ? 2 : 1)];
            const tenant = binding[binding.length - (/status<>\?/.test(sql) ? 3 : 2)];
            const row = store.find(r => r.id === id && r.tenant === tenant);
            if (!row) return { meta: { changes: 0 } };
            if (/status='published'/.test(sql)) {
              if (row.status === 'published') return { meta: { changes: 0 } };
              row.status = 'published';
              row.published_at = binding[0];
              row.published_by = binding[1];
              return { meta: { changes: 1 } };
            }
            if (/SET status=\?/.test(sql)) {
              const next = binding[0];
              if (row.status === next) return { meta: { changes: 0 } };
              row.status = next;
              row.published_at = null;
              return { meta: { changes: 1 } };
            }
            // 편집
            const sets = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(' WHERE')).split(',').map(s => s.trim());
            let i = 0;
            for (const set of sets) {
              const column = set.slice(0, set.indexOf('='));
              if (set.endsWith('=?')) { row[column] = binding[i]; i += 1; } else row[column] = 1;
            }
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return api;
    },
  };
}

const PUBLIC = 'https://ekodi.kr/api/partner-news/public?tenant=ekodi-church&service=church&limit=6';
const get = (url = PUBLIC) => new Request(url);
const row = (over = {}) => ({
  id: 'cpn-1', tenant: 'ekodi-church', org_key: 'ekodi-mission', org_name: '에코디선교회',
  title: '소식 제목', summary: '두 줄 요약', source_url: null, image_url: null,
  news_date: '2026-11-20', status: 'published', origin: 'auto', source_ref: 'ministry:1',
  edited_by_admin: 0, created_at: 'c', updated_at: 'u', updated_by: '', published_at: '2026-11-21T00:00:00Z', published_by: 'a',
  ...over,
});

test('공개 응답이 교회 페이지가 기대하는 모양이다', async () => {
  // 페이지는 contract.publicState==='PUBLISHED' 를 확인하고 item.status==='PUBLISHED'
  // 만 그린다. 둘 중 하나라도 어긋나면 화면이 오류 문구로 떨어진다.
  const env = { DB: fakeDb({ rows: [row()] }) };
  const response = await handlePartnerNewsPublic(get(), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.contract.publicState, 'PUBLISHED');
  assert.equal(data.items.length, 1);
  const item = data.items[0];
  assert.equal(item.status, 'PUBLISHED');
  assert.equal(item.partnerName, '에코디선교회');
  assert.equal(item.title, '소식 제목');
  assert.equal(item.publishedOn, '2026-11-20');
  assert.equal(item.summary, '두 줄 요약');
});

test('초안은 공개 응답에 절대 섞이지 않는다', async () => {
  // 이 한 줄이 무너지면 승인 전 내용이 교회 홈에 뜬다.
  const env = { DB: fakeDb({ rows: [
    row({ id: 'd1', status: 'draft', title: '승인 안 된 초안' }),
    row({ id: 'a1', status: 'archived', title: '보관된 소식' }),
    row({ id: 'p1', status: 'published', title: '공개된 소식' }),
  ] }) };
  const data = await (await handlePartnerNewsPublic(get(), env)).json();
  assert.deepEqual(data.items.map(x => x.title), ['공개된 소식']);
});

test('공개된 것이 없으면 빈 목록으로 정직하게 답한다', async () => {
  // 교회 페이지는 이때 "공개된 협력 소식이 준비되면 이곳에 안내합니다." 를 보여준다.
  const data = await (await handlePartnerNewsPublic(get(), { DB: fakeDb({ rows: [row({ status: 'draft' })] }) })).json();
  assert.equal(data.contract.publicState, 'PUBLISHED');
  assert.deepEqual(data.items, []);
});

test('저장소가 아직 없으면 빈 목록, 그 밖의 장애는 503', async () => {
  // 전자는 "공개된 소식이 없다" 와 같다. 후자를 빈 목록으로 덮으면 장애가 숨는다.
  const absent = await handlePartnerNewsPublic(get(), { DB: fakeDb({ missing: new Set(['church_partner_news']) }) });
  assert.equal(absent.status, 200);
  assert.deepEqual((await absent.json()).items, []);
  const broken = await handlePartnerNewsPublic(get(), { DB: fakeDb({ fail: 'D1_ERROR: disk I/O error' }) });
  assert.equal(broken.status, 503);
  const noDb = await handlePartnerNewsPublic(get(), {});
  assert.equal(noDb.status, 503);
});

test('공개 조회는 읽기 전용이다', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const response = await handlePartnerNewsPublic(new Request(PUBLIC, { method }), { DB: fakeDb() });
    assert.equal(response.status, 405, `${method} 는 거부돼야 한다`);
  }
  assert.equal((await handlePartnerNewsPublic(new Request(PUBLIC, { method: 'OPTIONS' }), { DB: fakeDb() })).status, 204);
  assert.equal(await handlePartnerNewsPublic(get('https://ekodi.kr/api/other'), { DB: fakeDb() }), null);
});

test('limit 은 상한이 있고 쓰레기 값에 흔들리지 않는다', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => row({ id: 'p' + i, news_date: '2026-11-' + String((i % 28) + 1).padStart(2, '0') }));
  for (const [raw, expected] of [['6', 6], ['999', 24], ['0', 6], ['-3', 6], ['abc', 6], ['', 6], ['2.7', 2]]) {
    const url = `https://ekodi.kr/api/partner-news/public?limit=${raw}`;
    const data = await (await handlePartnerNewsPublic(get(url), { DB: fakeDb({ rows }) })).json();
    assert.equal(data.items.length, expected, `limit=${raw}`);
  }
});

test('자동 초안은 공개 승인된 출처에서만 만들어지고 스스로 공개하지 않는다', async () => {
  const db = fakeDb({
    ministry: [
      { id: 'm1', org: 'mission', visibility: 'public', status: 'active', title: '선교회 공개 소식', summary: '요약', body: '', event_date: '2026-11-10' },
      { id: 'm2', org: 'mission', visibility: 'partners', status: 'active', title: '후원자 전용', summary: '요약', body: '', event_date: '2026-11-11' },
      { id: 'm3', org: 'church', visibility: 'public', status: 'active', title: '교회 자신의 소식', summary: '요약', body: '', event_date: '2026-11-12' },
      { id: 'm4', org: 'mission', visibility: 'public', status: 'archived', title: '보관됨', summary: '요약', body: '', event_date: '2026-11-13' },
    ],
    notices: [
      { id: 7, status: 'published', title: '의대 공지', body: '<p>본문 <b>강조</b></p>', published_at: '2026-11-15', updated_at: '2026-11-16' },
      { id: 8, status: 'draft', title: '의대 초안', body: '본문', published_at: null, updated_at: '2026-11-17' },
    ],
  });
  const result = await refreshPartnerNewsDrafts({ DB: db });
  assert.equal(result.ok, true);
  assert.equal(result.created, 2, '공개 승인된 두 건만 초안이 된다');
  assert.deepEqual(db.store.map(r => r.status), ['draft', 'draft'], '자동 초안은 절대 공개 상태가 아니다');
  assert.deepEqual(db.store.map(r => r.title).sort(), ['선교회 공개 소식', '의대 공지']);
  const notice = db.store.find(r => r.org_key === 'seonammedi');
  assert.equal(notice.summary, '본문 강조', 'HTML 태그는 벗겨서 적는다');
  assert.equal(notice.source_url, 'https://seonammedi.kr/');
  // 공개 응답에는 아직 아무것도 나오지 않는다.
  assert.deepEqual((await (await handlePartnerNewsPublic(get(), { DB: db })).json()).items, []);
});

test('자동 갱신을 두 번 돌려도 중복되지 않고 관리자의 수정을 덮지 않는다', async () => {
  const ministry = [{ id: 'm1', org: 'mission', visibility: 'public', status: 'active', title: '원래 제목', summary: '원래 요약', body: '', event_date: '2026-11-10' }];
  const db = fakeDb({ ministry, notices: [] });
  await refreshPartnerNewsDrafts({ DB: db });
  assert.equal(db.store.length, 1);
  // 관리자가 제목을 고치고 공개했다고 하자.
  db.store[0].title = '관리자가 고친 제목';
  db.store[0].status = 'published';
  db.store[0].edited_by_admin = 1;
  // 출처의 제목이 바뀐 뒤 다시 갱신해도 되돌리지 않는다.
  ministry[0].title = '출처에서 바뀐 제목';
  const again = await refreshPartnerNewsDrafts({ DB: db });
  assert.equal(again.created, 0);
  assert.equal(db.store.length, 1, '중복 생성 금지');
  assert.equal(db.store[0].title, '관리자가 고친 제목', '관리자의 수정이 보존돼야 한다');
  assert.equal(db.store[0].status, 'published', '공개 상태도 보존돼야 한다');
});

test('출처 테이블이 없는 환경도 나머지를 계속 처리한다', async () => {
  const db = fakeDb({
    missing: new Set(['ministry_news_items']),
    notices: [{ id: 1, status: 'published', title: '의대 공지', body: '본문', published_at: '2026-11-15', updated_at: '2026-11-15' }],
  });
  const result = await refreshPartnerNewsDrafts({ DB: db });
  assert.equal(result.ok, true);
  assert.deepEqual(result.unavailable, ['ministry']);
  assert.equal(result.created, 1);
});

test('관리 경로는 로그인과 권한을 요구한다', async () => {
  const env = { DB: fakeDb(), MY_SUPABASE_URL: 'https://x.supabase.co', MY_SUPABASE_PUBLISHABLE_KEY: 'k' };
  const noAuth = await handlePartnerNewsAdmin(new Request('https://ekodi.kr/api/partner-news/admin/items'), env);
  assert.equal(noAuth.status, 401);
  const unconfigured = await handlePartnerNewsAdmin(
    new Request('https://ekodi.kr/api/partner-news/admin/items', { headers: { authorization: 'Bearer t' } }), { DB: fakeDb() });
  assert.equal(unconfigured.status, 503);
  assert.equal(await handlePartnerNewsAdmin(new Request('https://ekodi.kr/api/other'), env), null);
});

test('사이트관리자와 최고관리자 둘 다 공개할 수 있고 감사에 남는다', async () => {
  const audits = [];
  for (const [role, expected] of [['senior_pastor', 'site_admin'], ['platform_admin', 'super_admin'], ['tenant_admin', 'site_admin']]) {
    const db = fakeDb({ rows: [row({ id: 'cpn-x', status: 'draft' })] });
    const env = {
      DB: db, MY_SUPABASE_URL: 'https://x.supabase.co', MY_SUPABASE_PUBLISHABLE_KEY: 'k',
      fetchStub: true,
    };
    globalThis.fetch = async () => new Response(JSON.stringify({ authenticated: true, status: 'active', role, email: role + '@ekodi.kr' }), { status: 200 });
    const response = await handlePartnerNewsAdmin(
      new Request('https://ekodi.kr/api/partner-news/admin/items/cpn-x/publish', { method: 'POST', headers: { authorization: 'Bearer t' } }),
      env, { onAudit: p => { audits.push(p); } });
    assert.equal(response.status, 200, role);
    assert.equal((await response.json()).status, 'published', role);
    assert.equal(db.store[0].status, 'published', role);
    assert.equal(audits.at(-1).authority, expected, role + ' 의 권한 기록');
    assert.equal(audits.at(-1).action, 'partner_news.publish');
  }
  assert.equal(audits.length, 3);
});

test('허용되지 않은 역할과 비활성 계정은 거부된다', async () => {
  const env = { DB: fakeDb(), MY_SUPABASE_URL: 'https://x.supabase.co', MY_SUPABASE_PUBLISHABLE_KEY: 'k' };
  for (const payload of [
    { authenticated: true, status: 'active', role: 'member' },
    { authenticated: true, status: 'active', role: 'guest' },
    { authenticated: false, status: 'active', role: 'platform_admin' },
    { authenticated: true, status: 'suspended', role: 'platform_admin' },
    { authenticated: true, status: 'active', role: '' },
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
    const response = await handlePartnerNewsAdmin(
      new Request('https://ekodi.kr/api/partner-news/admin/items/cpn-x/publish', { method: 'POST', headers: { authorization: 'Bearer t' } }), env);
    assert.equal(response.status, 403, JSON.stringify(payload));
  }
});

test('관리자가 확인·수정할 수 있고 수정 경로로는 공개되지 않는다', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ authenticated: true, status: 'active', role: 'senior_pastor', email: 'p@ekodi.kr' }), { status: 200 });
  const db = fakeDb({ rows: [row({ id: 'cpn-x', status: 'draft', title: '자동 초안 제목' })] });
  const env = { DB: db, MY_SUPABASE_URL: 'https://x.supabase.co', MY_SUPABASE_PUBLISHABLE_KEY: 'k' };
  const put = body => handlePartnerNewsAdmin(new Request('https://ekodi.kr/api/partner-news/admin/items/cpn-x', {
    method: 'PUT', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env);

  const ok = await put({ title: '  목사님이  고친 제목 ', summary: '요약 수정', newsDate: '2026-11-25', orgKey: 'cheonggye-merchants' });
  assert.equal(ok.status, 200);
  assert.equal(db.store[0].title, '목사님이 고친 제목', '공백은 정리된다');
  assert.equal(db.store[0].org_name, '청계면상인회', '단체는 목록에서 고른 이름으로 바뀐다');
  assert.equal(db.store[0].edited_by_admin, 1);
  assert.equal(db.store[0].status, 'draft', '수정만으로 공개되어서는 안 된다');

  assert.equal((await put({ orgKey: '사칭 단체' })).status, 400, '목록 밖 단체는 거부');
  assert.equal((await put({ title: '   ' })).status, 400, '빈 제목은 거부');
  assert.equal((await put({ newsDate: '2026-02-30' })).status, 400, '달력에 없는 날짜는 거부');
  assert.equal((await put({})).status, 400, '바꿀 것이 없으면 거부');
  assert.equal((await put({ status: 'published' })).status, 400, 'status 는 수정 경로의 필드가 아니다');
});

test('공개 회수와 보관이 동작한다', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ authenticated: true, status: 'active', role: 'platform_admin', email: 's@ekodi.kr' }), { status: 200 });
  const db = fakeDb({ rows: [row({ id: 'cpn-x', status: 'published' })] });
  const env = { DB: db, MY_SUPABASE_URL: 'https://x.supabase.co', MY_SUPABASE_PUBLISHABLE_KEY: 'k' };
  const act = action => handlePartnerNewsAdmin(new Request('https://ekodi.kr/api/partner-news/admin/items/cpn-x/' + action, {
    method: 'POST', headers: { authorization: 'Bearer t' },
  }), env);
  assert.equal((await act('unpublish')).status, 200);
  assert.equal(db.store[0].status, 'draft');
  assert.deepEqual((await (await handlePartnerNewsPublic(get(), { DB: db })).json()).items, [], '회수하면 즉시 홈에서 사라진다');
  assert.equal((await act('archive')).status, 200);
  assert.equal(db.store[0].status, 'archived');
  assert.equal((await act('archive')).status, 404, '같은 상태로 두 번은 변화 없음');
});

test('원문 링크는 https 만 받는다', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'http://ekodi.kr/', 'file:///etc/passwd', '  ', 'not a url', null, undefined]) {
    assert.equal(safeSourceUrl(bad), null, String(bad));
  }
  assert.equal(safeSourceUrl('https://seonammedi.kr/notice/1'), 'https://seonammedi.kr/notice/1');
});

test('단체 목록은 고정이고 비어 있지 않다', () => {
  const keys = Object.keys(PARTNER_ORGS);
  assert.ok(keys.length >= 8, '협력 기관 목록이 있어야 한다');
  assert.ok(Object.isFrozen(PARTNER_ORGS), '실행 중에 바뀌어서는 안 된다');
  for (const key of keys) {
    assert.match(key, /^[a-z][a-z0-9-]*$/, key);
    assert.ok(PARTNER_ORGS[key].trim().length > 0, key);
  }
});
