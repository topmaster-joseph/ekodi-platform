import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  EKODIBIZ_HOMEPAGE_SERVICE_URL, EKODIBIZ_HOMEPAGE_CONTACT_SOURCE, HOMEPAGE_PRICING, HOMEPAGE_TYPES, HOMEPAGE_AUDIENCES,
  estimateHomepageSubscription as est, ekodiBizHomepageServiceHtml, ekodiBizHomepageServiceResponse, isEkodiBizHomepageServicePath,
} from '../ekodibiz-homepage-service-page.js';

const P = HOMEPAGE_PRICING;

test('path matcher accepts only canonical homepage-service paths', () => {
  for (const p of ['/ekodibiz/homepage', '/ekodibiz/homepage/', '/ekodibiz/homepage-service', '/EKODIBIZ/Homepage', '/ekodibiz/web-subscription'])
    assert.equal(isEkodiBizHomepageServicePath(p), true, p);
  for (const p of ['/homepage', '/ekodibiz', '/ekodibiz/homepage/x', '/ekodibiz/api/homepage', ''])
    assert.equal(isEkodiBizHomepageServicePath(p), false, p);
});

test('regular monthly prices include tax and all standard plans have zero setup', () => {
  assert.deepEqual(Object.values(P.plans).map((p) => [p.id, p.setup, p.monthly]),
    [['S1', 0, 9900], ['S2', 0, 19900], ['S3', 0, 29900], ['S4', 0, 49900]]);
});


test('9900 is the actual tax-inclusive monthly entry cost without any commitment surcharge', () => {
  assert.equal(P.taxIncluded, true);
  for (const p of Object.values(P.plans)) {
    for (const contract of [undefined, 'monthly', '12']) {
      const e = est(P, { plan: p.id, contract });
      assert.equal(e.setup, 0);
      assert.equal(e.monthly, p.monthly);
      assert.equal(e.firstPayment, p.monthly);
      assert.equal(e.yearly, p.monthly * 12);
    }
  }
  assert.equal(est(P, {}).firstPayment, 9900);
  assert.equal(est(P, {}).yearly, 118800);
  for (const plan of ['__proto__', 'constructor', 'toString']) {
    assert.equal(est(P, { plan }).firstPayment, 9900);
  }
  const annual = est(P, { plan: 'S1', contract: 'annual' });
  assert.equal(annual.firstPayment, 99000);
  assert.equal(annual.monthly, 8250);
  const html = ekodiBizHomepageServiceHtml();
  assert.ok(html.indexOf('id="plans"') < html.indexOf('id="types"'));
  assert.ok(html.includes('처음 내는 금액 9,900원'));
  assert.ok(html.includes('12개월 이용 합계 118,800원'));
  assert.ok(html.includes('<option value="monthly">월납 · 표시 요금 그대로</option>'));
  assert.ok(html.includes("$('plan').value='S1';update();"));
  assert.ok(!html.includes('부가세 별도'));
  assert.ok(!html.includes('+30%'));
  assert.ok(!html.includes('12개월 약정'));
  assert.ok(!html.includes('30% 위약금'));
});


test('audience choices make the entry plan available to people, institutions and groups with two required fields', () => {
  assert.deepEqual(HOMEPAGE_AUDIENCES.map(a => a.id), ['personal', 'business', 'institution', 'community', 'organization', 'event']);
  const html = ekodiBizHomepageServiceHtml();
  for (const a of HOMEPAGE_AUDIENCES) {
    assert.ok(html.includes(a.name));
    assert.ok(html.includes(a.examples));
    assert.ok(html.includes('name="audience" value="' + a.id + '"'));
  }
  for (const id of ['business', 'email', 'consent']) assert.match(html, new RegExp('id="' + id + '"[^>]*required'));
  for (const id of ['name', 'phone']) assert.doesNotMatch(html, new RegExp('id="' + id + '"[^>]*required'));
  assert.ok(html.includes("if(v('phone')&&!/"));
  assert.ok(html.includes("name:v('name')||v('business')"));
  assert.ok(html.indexOf('id="apply"') < html.indexOf('id="plansPanel"'), 'apply tab is first');
});

test('page is split into four screen tabs with the application tab open first', () => {
  const html = ekodiBizHomepageServiceHtml();
  const page = html.split('id="pageTabs"')[1].split('</div>')[0];
  assert.deepEqual([...page.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1]), ['apply', 'plansPanel', 'typesPanel', 'rulesPanel']);
  assert.match(page, /id="ptab-apply" aria-controls="apply" aria-selected="true"/);
  for (const id of ['plansPanel', 'typesPanel', 'rulesPanel']) assert.match(html, new RegExp('id="' + id + '" class="page-panel" role="tabpanel"[^>]* hidden>'));
  assert.doesNotMatch(html, /id="apply" class="page-panel" role="tabpanel"[^>]* hidden>/);
});

test('application flows type -> plan with description -> payment/add-ons -> consult or subscribe', () => {
  const html = ekodiBizHomepageServiceHtml();
  const order = ['유형 선택', '요금제 선택', '결제 방식 · 추가 선택', '신청자 정보'].map((t) => html.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'steps in order');
  for (const p of Object.values(P.plans)) {
    assert.ok(html.includes('name="planChoice" value="' + p.id + '"'), p.id);
    const info = html.split('class="plan-info" data-plan="' + p.id + '"')[1].split('</div>')[0];
    for (const f of p.scope.split(/,\s*/)) assert.ok(info.includes(f), p.id + ' ' + f);
  }
  assert.equal((html.match(/class="plan-info" data-plan="S\d" hidden>/g) || []).length, 3, 'only selected plan description visible');
  assert.match(html, /id="send" type="submit" data-mode="consult"/);
  assert.match(html, /id="subscribe" type="submit" data-mode="subscribe"/);
  assert.ok(html.includes("if(sub&&!v('phone'))"), 'subscribe needs phone');
  assert.ok(html.includes("if(sub&&!$('terms').checked)"), 'subscribe needs terms check');
  assert.ok(html.includes('[홈페이지 바로 구독 신청]') && html.includes('[홈페이지 구독 상담 신청]'));
  assert.ok(html.includes('결제 전까지 요금은 청구되지 않습니다'));
});

test('estimate: base, add-ons, included features, discounts and contract terms', () => {
  assert.equal(est(P, { plan: 'S1' }).monthly, 9900);
  assert.equal(est(P, { plan: 'S2', social: 1, booking: true, pages: 2 }).monthly, 19900 + 5000 + 5000 + 4000);
  // S3 includes booking + 1 social; only the 2nd channel is charged
  assert.equal(est(P, { plan: 'S3', booking: true, social: 2 }).monthly, 29900 + 5000);
  // S4 includes payment and 1 language
  assert.equal(est(P, { plan: 'S4', payment: true, lang: 2 }).monthly, 49900 + 5000);
  // largest discount only, rounded to 100
  assert.equal(est(P, { plan: 'S2', member: true }).monthly, 15900);
  assert.equal(est(P, { plan: 'S2', member: true, nonprofit: true }).monthly, 13900);
  assert.equal(est(P, { plan: 'S2', contract: 'monthly' }).monthly, 19900);
  const annual = est(P, { plan: 'S2', contract: 'annual' });
  assert.equal(annual.yearly, 199000);
  assert.equal(annual.firstPayment, 199000);
  const once = est(P, { plan: 'S3', logo: true, photo: true });
  assert.equal(once.setup, 50000 + 50000);
  assert.equal(once.firstPayment, once.setup + 29900);
  // hostile input is clamped, unknown plan/contract fall back safely
  const bad = est(P, { plan: 'X', pages: -5, social: 'abc', contract: '__proto__' });
  assert.equal(bad.plan, 'S1'); assert.equal(bad.contract, 'monthly'); assert.equal(bad.monthly, 9900);
  assert.equal(est(P, { plan: 'S1', pages: 9999 }).monthly, 9900 + 50 * 2000);
});

test('page shows type tabs with features and the live calculator', () => {
  const html = ekodiBizHomepageServiceHtml();
  assert.ok(html.includes(`<link rel="canonical" href="${EKODIBIZ_HOMEPAGE_SERVICE_URL}">`));
  assert.equal((html.match(/role="tab"/g) || []).length, HOMEPAGE_TYPES.length + 4);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, HOMEPAGE_TYPES.length + 4);
  assert.equal((html.match(/class="panel" role="tabpanel"[^>]* hidden>/g) || []).length, HOMEPAGE_TYPES.length - 1, 'only first type panel visible');
  for (const t of HOMEPAGE_TYPES) {
    assert.ok(html.includes(t.name), t.name);
    for (const f of t.features) assert.ok(html.includes(f), f);
  }
  for (const needle of ['프랜차이즈형', '음식업종형', '건축·인테리어형', '9,900원', '49,900원', '월 예상 구독료', 'id="calcMonthly"',
    '신청이 정상 접수되었습니다', '010-3501-8542', 'joseph@ekodibiz.kr', '213-13-01959', '/mail/api/contact', EKODIBIZ_HOMEPAGE_CONTACT_SOURCE])
    assert.ok(html.includes(needle), needle);
  assert.match(html, /id="consent" type="checkbox" required/);
  assert.match(html, /class="trap"[^>]*>Website <input id="website"/);
});

test('tab recommended prices come from the same estimator', () => {
  const html = ekodiBizHomepageServiceHtml();
  const expect = { franchise: 24900, brand: 29900, food: 24900, build: 29900, service: 24900, farm: 49900, nonprofit: 13900 };
  for (const t of HOMEPAGE_TYPES) {
    const m = est(P, { contract: '12', ...t.preset }).monthly;
    assert.equal(m, expect[t.id], t.id);
    const panel = html.split(`id="panel-${t.id}"`)[1].split('</div>')[0];
    assert.ok(panel.includes(`${m.toLocaleString('ko-KR')}원`), `${t.id} shows ${m}`);
  }
});

test('browser script is valid and embeds the canonical estimator verbatim', () => {
  const html = ekodiBizHomepageServiceHtml();
  const js = html.split('<script>')[1].split('</script>')[0];
  assert.doesNotThrow(() => new vm.Script(js));
  assert.ok(js.includes(est.toString()));
  const pricing = JSON.parse(js.match(/var PRICING=(\{.*?\});\n/s)[1]);
  assert.deepEqual(pricing, JSON.parse(JSON.stringify(P)));
});

test('serialized estimator executes without nested function name helpers from Worker bundling', () => {
  const source = est.toString();
  assert.equal((source.match(/\bfunction\s*(?:[\w$]+\s*)?\(/g) || []).length, 1, 'no nested functions for keepNames to wrap');
  assert.ok(!source.includes('=>'), 'no nested arrows for keepNames to wrap');
  const browserEstimator = vm.runInNewContext('(' + source + ')');
  assert.equal(browserEstimator(P, { plan: 'S1' }).firstPayment, 9900);
  assert.equal(browserEstimator(P, { plan: 'S1', contract: 'annual' }).firstPayment, 99000);
  assert.equal(browserEstimator(P, { plan: 'S1', pages: Infinity }).monthly, 109900);
});

test('response is public HTML with an own restrictive CSP and HEAD support', async () => {
  const res = ekodiBizHomepageServiceResponse();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-ekodi-route'), 'ekodibiz-homepage-service');
  assert.ok((await res.text()).length > 2000);
  assert.equal(ekodiBizHomepageServiceResponse({ head: true }).body, null);
});

test('router serves the page', async () => {
  const src = await readFile(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/ekodibiz-homepage-service-page\.js'/);
  assert.match(src, /isEkodiBizHomepageServicePath\(url\.pathname\)\)return ekodiBizHomepageServiceResponse/);
});

test('form submission contract matches the shared contact API', async () => {
  const { handleMailContactApi } = await import('../mail-contact.js');
  const req = (origin, body) => new Request('https://ekodi.kr/mail/api/contact', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await handleMailContactApi(req('https://evil.example', {}), { ENVIRONMENT: 'test' })).status, 403);
  assert.equal((await handleMailContactApi(req('https://ekodi.kr', { website: 'bot', email: 'a@b.kr', subject: 's', message: 'm', source: EKODIBIZ_HOMEPAGE_CONTACT_SOURCE }), { ENVIRONMENT: 'test' })).status, 200);
  assert.equal((await handleMailContactApi(req('https://ekodi.kr', { email: 'not-an-email', subject: 's', message: 'm' }), { ENVIRONMENT: 'test' })).status, 400);
});


