import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  EKODIBIZ_HOMEPAGE_SERVICE_URL, EKODIBIZ_HOMEPAGE_CONTACT_SOURCE, HOMEPAGE_PRICING, HOMEPAGE_TYPES,
  estimateHomepageSubscription as est, ekodiBizHomepageServiceHtml, ekodiBizHomepageServiceResponse, isEkodiBizHomepageServicePath,
} from '../ekodibiz-homepage-service-page.js';
import { handleMailContactApi } from '../mail-contact.js';

const P = HOMEPAGE_PRICING;

test('path matcher accepts only canonical homepage-service paths', () => {
  for (const p of ['/ekodibiz/homepage', '/ekodibiz/homepage/', '/ekodibiz/homepage-service', '/EKODIBIZ/Homepage', '/ekodibiz/web-subscription'])
    assert.equal(isEkodiBizHomepageServicePath(p), true, p);
  for (const p of ['/homepage', '/ekodibiz', '/ekodibiz/homepage/x', '/ekodibiz/api/homepage', ''])
    assert.equal(isEkodiBizHomepageServicePath(p), false, p);
});

test('prices are lowered: S1 9,900 ~ S4 79,000 a month, setup at most 149,000', () => {
  assert.deepEqual(Object.values(P.plans).map((p) => [p.id, p.setup, p.monthly]),
    [['S1', 0, 9900], ['S2', 49000, 19900], ['S3', 99000, 39900], ['S4', 149000, 79000]]);
});

test('estimate: base, add-ons, included features, discounts and contract terms', () => {
  assert.equal(est(P, { plan: 'S1' }).monthly, 9900);
  assert.equal(est(P, { plan: 'S2', social: 1, booking: true, pages: 2 }).monthly, 19900 + 5000 + 5000 + 4000);
  // S3 includes booking + 1 social; only the 2nd channel is charged
  assert.equal(est(P, { plan: 'S3', booking: true, social: 2 }).monthly, 39900 + 5000);
  // S4 includes payment and 1 language
  assert.equal(est(P, { plan: 'S4', payment: true, lang: 2 }).monthly, 79000 + 5000);
  // largest discount only, rounded to 100
  assert.equal(est(P, { plan: 'S2', member: true }).monthly, 15900);
  assert.equal(est(P, { plan: 'S2', member: true, nonprofit: true }).monthly, 13900);
  assert.equal(est(P, { plan: 'S2', contract: 'monthly' }).monthly, 25900);
  const annual = est(P, { plan: 'S2', contract: 'annual' });
  assert.equal(annual.yearly, 199000);
  assert.equal(annual.firstPayment, 49000 + 199000);
  const once = est(P, { plan: 'S3', logo: true, photo: true });
  assert.equal(once.setup, 99000 + 50000 + 50000);
  assert.equal(once.firstPayment, once.setup + 39900);
  // hostile input is clamped, unknown plan/contract fall back safely
  const bad = est(P, { plan: 'X', pages: -5, social: 'abc', contract: '__proto__' });
  assert.equal(bad.plan, 'S2'); assert.equal(bad.contract, '12'); assert.equal(bad.monthly, 19900);
  assert.equal(est(P, { plan: 'S1', pages: 9999 }).monthly, 9900 + 50 * 2000);
});

test('page shows type tabs with features and the live calculator', () => {
  const html = ekodiBizHomepageServiceHtml();
  assert.ok(html.includes(`<link rel="canonical" href="${EKODIBIZ_HOMEPAGE_SERVICE_URL}">`));
  assert.equal((html.match(/role="tab"/g) || []).length, HOMEPAGE_TYPES.length);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, HOMEPAGE_TYPES.length);
  assert.equal((html.match(/role="tabpanel"[^>]* hidden>/g) || []).length, HOMEPAGE_TYPES.length - 1, 'only first panel visible');
  for (const t of HOMEPAGE_TYPES) {
    assert.ok(html.includes(t.name), t.name);
    for (const f of t.features) assert.ok(html.includes(f), f);
  }
  for (const needle of ['프랜차이즈형', '음식업종형', '건축·인테리어형', '9,900원', '79,000원', '월 예상 구독료', 'id="calcMonthly"',
    '신청이 정상 접수되었습니다', '010-3501-8542', 'joseph@ekodibiz.kr', '213-13-01959', '/mail/api/contact', EKODIBIZ_HOMEPAGE_CONTACT_SOURCE])
    assert.ok(html.includes(needle), needle);
  assert.match(html, /id="consent" type="checkbox" required/);
  assert.match(html, /class="trap"[^>]*>Website <input id="website"/);
});

test('tab recommended prices come from the same estimator', () => {
  const html = ekodiBizHomepageServiceHtml();
  const expect = { franchise: 24900, brand: 39900, food: 24900, build: 39900, service: 24900, farm: 79000, nonprofit: 13900 };
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
  const req = (origin, body) => new Request('https://ekodi.kr/mail/api/contact', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await handleMailContactApi(req('https://evil.example', {}), { ENVIRONMENT: 'test' })).status, 403);
  assert.equal((await handleMailContactApi(req('https://ekodi.kr', { website: 'bot', email: 'a@b.kr', subject: 's', message: 'm', source: EKODIBIZ_HOMEPAGE_CONTACT_SOURCE }), { ENVIRONMENT: 'test' })).status, 200);
  assert.equal((await handleMailContactApi(req('https://ekodi.kr', { email: 'not-an-email', subject: 's', message: 'm' }), { ENVIRONMENT: 'test' })).status, 400);
});
