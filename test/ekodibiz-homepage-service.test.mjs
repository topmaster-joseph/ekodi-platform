import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EKODIBIZ_HOMEPAGE_SERVICE_URL, EKODIBIZ_HOMEPAGE_CONTACT_SOURCE, HOMEPAGE_PLANS, HOMEPAGE_TYPES,
  ekodiBizHomepageServiceHtml, ekodiBizHomepageServiceResponse, isEkodiBizHomepageServicePath,
} from '../ekodibiz-homepage-service-page.js';
import { handleMailContactApi } from '../mail-contact.js';

test('path matcher accepts only canonical homepage-service paths', () => {
  for (const p of ['/ekodibiz/homepage', '/ekodibiz/homepage/', '/ekodibiz/homepage-service', '/EKODIBIZ/Homepage', '/ekodibiz/web-subscription'])
    assert.equal(isEkodiBizHomepageServicePath(p), true, p);
  for (const p of ['/homepage', '/ekodibiz', '/ekodibiz/homepage/x', '/ekodibiz/api/homepage', ''])
    assert.equal(isEkodiBizHomepageServicePath(p), false, p);
});

test('page carries all plans, types, policy, operator and a completion message', () => {
  const html = ekodiBizHomepageServiceHtml();
  assert.ok(html.includes(`<link rel="canonical" href="${EKODIBIZ_HOMEPAGE_SERVICE_URL}">`));
  assert.equal(HOMEPAGE_PLANS.length, 4);
  for (const p of HOMEPAGE_PLANS) assert.ok(html.includes(p.name) && html.includes(p.monthly.toLocaleString('ko-KR')), p.id);
  for (const [t] of HOMEPAGE_TYPES) assert.ok(html.includes(t), t);
  for (const needle of ['프랜차이즈형', '음식업종형', '건축·인테리어형', '19,000원', '149,000원', '부가세 별도', '12개월',
    '신청이 정상 접수되었습니다', '010-3501-8542', 'joseph@ekodibiz.kr', '213-13-01959', '/mail/api/contact', EKODIBIZ_HOMEPAGE_CONTACT_SOURCE])
    assert.ok(html.includes(needle), needle);
  assert.match(html, /id="consent" type="checkbox" required/);
  assert.match(html, /class="trap"[^>]*>Website <input id="website"/, 'spam trap present');
});

test('setup fees stay low relative to the monthly subscription model', () => {
  for (const p of HOMEPAGE_PLANS) assert.ok(p.setup <= 300000 && p.monthly > 0, p.id);
  const sorted = [...HOMEPAGE_PLANS].sort((a, b) => a.monthly - b.monthly).map((p) => p.id);
  assert.deepEqual(sorted, ['S1', 'S2', 'S3', 'S4']);
});

test('response is cacheable public HTML with an own restrictive CSP and HEAD support', async () => {
  const res = ekodiBizHomepageServiceResponse();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-ekodi-route'), 'ekodibiz-homepage-service');
  assert.ok((await res.text()).length > 2000);
  assert.equal(ekodiBizHomepageServiceResponse({ head: true }).body, null);
});

test('router serves the page next to the refund policy', async () => {
  const src = await readFile(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/ekodibiz-homepage-service-page\.js'/);
  assert.match(src, /isEkodiBizHomepageServicePath\(url\.pathname\)\)return ekodiBizHomepageServiceResponse/);
});

test('form submission contract matches the shared contact API (origin enforced, spam trap silently accepted)', async () => {
  const foreign = await handleMailContactApi(new Request('https://ekodi.kr/mail/api/contact', {
    method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }), { ENVIRONMENT: 'test' });
  assert.equal(foreign.status, 403);
  const trap = await handleMailContactApi(new Request('https://ekodi.kr/mail/api/contact', {
    method: 'POST', headers: { origin: 'https://ekodi.kr', 'content-type': 'application/json' },
    body: JSON.stringify({ website: 'bot', email: 'a@b.kr', subject: 's', message: 'm', source: EKODIBIZ_HOMEPAGE_CONTACT_SOURCE }) }), { ENVIRONMENT: 'test' });
  assert.equal(trap.status, 200);
  const missing = await handleMailContactApi(new Request('https://ekodi.kr/mail/api/contact', {
    method: 'POST', headers: { origin: 'https://ekodi.kr', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', subject: 's', message: 'm' }) }), { ENVIRONMENT: 'test' });
  assert.equal(missing.status, 400);
});
