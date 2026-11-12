// CHURCH-PARTNER-NEWS-404-001
//
// 2026-11-12 운영 측정(실행 43225492451 의 liveRequests):
//   {"status": 404, "url": "/api/partner-news/public"}
// 교회 홈의 '함께 걷는 이들의 소식' 구역은 그 주소를 부르고, 404 면 캐시가 없는
// 방문자에게 "협력 소식을 지금 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." 를
// 보여줬다. 서버에 그 경로가 없으므로 '잠시 후'에도 되지 않는다 — 거짓을 말한 것이다.
//
// 404·410 은 "아직 공개되지 않았다" 는 뜻이고, 5xx·네트워크 실패는 "일시적 장애" 다.
// 둘을 구분한다. 구역을 숨기지도 않고 내용을 꾸며내지도 않는다.
//
// 소스 문자열이 아니라 실제 동작을 본다. 문구만 고정하면 분기를 지워도 통과한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../sites/ekodi-church/partner-news.js', import.meta.url), 'utf8');
const ERROR_COPY = '협력 소식을 지금 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
const EMPTY_COPY = '공개된 협력 소식이 준비되면 이곳에 안내합니다.';

function makeNode(extra = {}) {
  return { innerHTML: '', textContent: '', hidden: false, querySelector: () => null, ...extra };
}

async function run({ status = 200, body = null, throws = false, cache = null }) {
  const host = makeNode();
  const statusEl = makeNode();
  const section = makeNode({ querySelector: () => null });
  const store = new Map();
  if (cache) store.set('ekodi:church:partner-news:v1', JSON.stringify({ items: cache }));
  const warnings = [];
  const context = {
    document: {
      documentElement: { lang: 'ko-KR' },
      getElementById: id => ({
        'partner-news-feed': host,
        'partner-news-status': statusEl,
        'partner-news': section,
      }[id] || null),
      querySelector: () => null,
    },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: k => store.delete(k),
    },
    console: { warn: (...a) => warnings.push(a.map(String).join(' ')) },
    fetch: async () => {
      if (throws) throw new TypeError('network down');
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    },
    setTimeout, clearTimeout, Date, JSON, Array, String, Number, Object, Error, TypeError, Math,
  };
  context.globalThis = context;
  context.window = context;
  vm.runInNewContext(SRC, context);
  // load() 는 await 되지 않으므로 몇 틱 기다린다.
  for (let i = 0; i < 20 && host.innerHTML.includes('불러오고 있습니다'); i++) {
    await new Promise(r => setTimeout(r, 0));
  }
  await new Promise(r => setTimeout(r, 0));
  return { host, statusEl, warnings };
}

test('404 는 공개 전으로 안내한다 — 거짓 재시도 안내를 하지 않는다', async () => {
  const { host, statusEl } = await run({ status: 404 });
  assert.ok(host.innerHTML.includes(EMPTY_COPY), `준비 중 문구가 보여야 한다: ${host.innerHTML}`);
  assert.ok(!host.innerHTML.includes(ERROR_COPY), '오류 문구가 보여서는 안 된다');
  assert.equal(statusEl.textContent, EMPTY_COPY, '상태 표시도 같은 뜻이어야 한다');
  assert.equal(statusEl.hidden, false, '상태를 숨기면 안내가 사라진다');
});

test('410 도 같다', async () => {
  const { host } = await run({ status: 410 });
  assert.ok(host.innerHTML.includes(EMPTY_COPY));
  assert.ok(!host.innerHTML.includes(ERROR_COPY));
});

test('5xx 는 여전히 일시적 장애로 안내한다', async () => {
  // 이 구분이 무너지면 진짜 장애를 '준비 중' 으로 덮어버린다.
  for (const status of [500, 502, 503]) {
    const { host } = await run({ status });
    assert.ok(host.innerHTML.includes(ERROR_COPY), `${status} 는 오류 문구여야 한다`);
    assert.ok(!host.innerHTML.includes(EMPTY_COPY), `${status} 를 준비 중으로 덮어서는 안 된다`);
  }
});

test('네트워크 실패도 일시적 장애다', async () => {
  const { host } = await run({ throws: true });
  assert.ok(host.innerHTML.includes(ERROR_COPY));
  assert.ok(!host.innerHTML.includes(EMPTY_COPY));
});

test('공개된 소식이 있으면 그대로 보여준다', async () => {
  const { host } = await run({
    status: 200,
    body: { contract: { publicState: 'PUBLISHED' }, items: [{ status: 'PUBLISHED', title: '청계면 협력 소식' }] },
  });
  assert.ok(host.innerHTML.includes('청계면 협력 소식'), `실제 소식이 렌더링돼야 한다: ${host.innerHTML}`);
  assert.ok(!host.innerHTML.includes(ERROR_COPY));
  assert.ok(!host.innerHTML.includes(EMPTY_COPY));
});

test('404 라도 캐시가 있으면 캐시를 보여준다', async () => {
  // 공개됐다가 경로가 잠시 사라진 경우에 빈 화면으로 되돌리지 않는다.
  const { host } = await run({ status: 404, cache: [{ status: 'PUBLISHED', title: '지난 협력 소식' }] });
  assert.ok(host.innerHTML.includes('지난 협력 소식'), `캐시가 우선이어야 한다: ${host.innerHTML}`);
  assert.ok(!host.innerHTML.includes(EMPTY_COPY));
});

test('공개 계약이 어긋나면 일시적 장애로 다룬다', async () => {
  // publicState 가 PUBLISHED 가 아니면 승인되지 않은 내용이다. 준비 중으로
  // 안내해 버리면 그 구분이 흐려진다.
  const { host } = await run({ status: 200, body: { contract: { publicState: 'DRAFT' }, items: [] } });
  assert.ok(host.innerHTML.includes(ERROR_COPY));
});
