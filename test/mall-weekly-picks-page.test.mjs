import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMallHeader } from '../mall-shared-header.js';
import { isMallPicksPath, loadMallPicks, renderMallPicksHtml, mallPicksResponse, pickReason, clickUrl, MALL_PICKS_CANONICAL } from '../mall-weekly-picks-page.js';

const row = (id, extra = {}) => ({ id, product_name:`상품 ${id}`, price_krw:10000 + id, category:'생활', provider_rank:1, is_rocket:1, is_free_shipping:0, ...extra });

function fakeDb({ board = [], catalog = [], fail = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        binds: [],
        bind(...args) { this.binds = args; return this; },
        async all() {
          calls.push({ sql, binds: this.binds });
          if (fail) throw new Error('db down');
          if (/affiliate_promotion_weekly_products/.test(sql)) return { results: board };
          return { results: catalog };
        },
        async first() { throw new Error('picks page must not use first()'); },
        async run() { throw new Error('picks page must be read-only'); },
      };
    },
  };
}

test('path matcher accepts only /ekodimall/picks with optional slash', () => {
  assert.equal(isMallPicksPath('/ekodimall/picks'), true);
  assert.equal(isMallPicksPath('/ekodimall/picks/'), true);
  assert.equal(isMallPicksPath('/ekodimall/picks/x'), false);
  assert.equal(isMallPicksPath('/ekodimall'), false);
});

test('weekly board items come first, only active products, and catalog fills short boards without duplicates', async () => {
  const db = fakeDb({ board:[row(1), row(2)], catalog:[row(2), row(3), row(4), row(5), row(6), row(7)] });
  const data = await loadMallPicks({ DB: db }, new Date('2026-10-21T00:00:00Z'));
  assert.deepEqual(data.items.map(item => item.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(data.source, 'weekly-board+catalog');
  assert.equal(data.week.weekKey, '2026-W43');
  for (const call of db.calls) assert.match(call.sql, /p\.status='active'/);
  assert.equal(db.calls[0].binds[0], '2026-W43');
});

test('full board is used without catalog query; DB failure degrades to empty page', async () => {
  const full = fakeDb({ board: Array.from({ length: 8 }, (_, i) => row(i + 1)) });
  const data = await loadMallPicks({ DB: full });
  assert.equal(data.items.length, 8);
  assert.equal(full.calls.length, 1);
  const broken = await loadMallPicks({ DB: fakeDb({ fail: true }) });
  assert.deepEqual(broken.items, []);
  const none = await loadMallPicks({});
  assert.equal(none.source, 'unavailable');
});

test('rendered HTML is crawlable, discloses affiliation statically and marks links sponsored', () => {
  const html = renderMallPicksHtml({ items:[row(11, { product_name:'<script>alert(1)</script> 보틀' })], generatedAt:new Date('2026-10-21T00:00:00Z') });
  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/ekodimall\/picks">/);
  assert.ok(html.includes('쿠팡 파트너스 활동의 일환으로'));
  assert.ok(html.includes('rel="sponsored nofollow noopener"'));
  assert.ok(html.includes(clickUrl(11)));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html, /"@type":"ItemList"/);
  assert.ok(!/https:\/\/(api|marketing-connect-api)\.ekodi\.kr/.test(html));
  assert.ok(html.includes('2026-10-21 09:00 (KST)'));
});

test('empty state still renders disclosure and a path to the curator', () => {
  const html = renderMallPicksHtml({ items: [] });
  assert.ok(html.includes('이번 주 추천 상품을 준비하고 있습니다'));
  assert.ok(html.includes('쿠팡 파트너스 활동의 일환으로'));
});

test('pick reason uses stored attributes only', () => {
  assert.equal(pickReason(row(1)), '생활 분야 · 쿠팡 검색 상위 노출 · 로켓배송');
  assert.equal(pickReason({}), '에코디 큐레이션');
});

test('response is cacheable HTML with source diagnostics', async () => {
  const response = await mallPicksResponse({ DB: fakeDb({ board:[row(1)], catalog:[row(2)] }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('x-ekodi-picks-count'), '2');
  assert.ok(MALL_PICKS_CANONICAL.startsWith('https://ekodi.kr/'));
});

test('site-worker routes /ekodimall/picks before the Pages proxy', () => {
  const source = readFileSync(new URL('../site-worker.js', import.meta.url), 'utf8');
  const picks = source.indexOf('isMallPicksPath(url.pathname)');
  const proxy = source.indexOf('if (isMallPath(url.pathname)) return proxyMallService(request);');
  assert.ok(picks > 0 && proxy > picks);
});

test('weekly-picks shares Mall buyer header and uses canonical shell footer', () => {
  const html = renderMallPicksHtml({ items: [] });
  const header = renderMallHeader({ publicPrefix: '/ekodimall', home: false });
  assert.ok(html.includes(header));
  assert.match(html, /class="header buyer-header mall-header"/);
  assert.match(html, /href="\/ekodimall\/travel\/stay\/"/);
  assert.match(html, /href="\/ekodimall\/picks"/);
  assert.match(html, /assets\/home-refresh\.css/);
  assert.doesNotMatch(html, /<footer\b/); // shell adds the single shared footer
});
