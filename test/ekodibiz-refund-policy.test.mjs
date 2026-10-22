import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EKODIBIZ_REFUND_POLICY_URL,
  ekodiBizRefundPolicyHtml,
  ekodiBizRefundPolicyResponse,
  isEkodiBizRefundPolicyPath,
} from '../ekodibiz-refund-policy-page.js';
import { EKODI_USER_FOOTER, renderEkodiUserFooter } from '../config/user-footer.js';
import { DISCOVERY_PUBLIC_ROUTES, renderSitemapXml } from '../discovery-layer.js';

test('refund policy path matcher accepts only the canonical EKODIBIZ paths', () => {
  for (const path of ['/ekodibiz/refund', '/ekodibiz/refund/', '/ekodibiz/refund-policy', '/EKODIBIZ/Refund']) {
    assert.equal(isEkodiBizRefundPolicyPath(path), true, path);
  }
  for (const path of ['/refund', '/ekodibiz', '/ekodibiz/refund/x', '/ekodibiz/refunds', '/ekodibiz/api/refund', '']) {
    assert.equal(isEkodiBizRefundPolicyPath(path), false, path);
  }
});

test('refund policy carries the statutory periods, refund deadline and operator facts', () => {
  const html = ekodiBizRefundPolicyHtml();
  assert.ok(html.includes(`<link rel="canonical" href="${EKODIBIZ_REFUND_POLICY_URL}">`));
  assert.equal(EKODIBIZ_REFUND_POLICY_URL, 'https://ekodi.kr/ekodibiz/refund');
  for (const needle of ['7일 이내', '3개월 이내', '30일 이내', '3영업일 이내', '지연배상금', '1372', 'ecmc.or.kr',
    '213-13-01959', '2023-전남무안-0153', 'joseph@ekodibiz.kr', '백련동1길 17-4']) {
    assert.ok(html.includes(needle), needle);
  }
  assert.doesNotMatch(html, /<script/i, 'legal page stays static and script-free');
  assert.doesNotMatch(html, /ekodibiz@gmail\.com/, 'refund support contact uses business email only');
  assert.equal((html.match(/<header\b/g) || []).length, 1, 'single EKODIBIZ header');
  assert.equal((html.match(/<footer\b/g) || []).length, 1, 'single EKODIBIZ footer');
  assert.match(html, /<header class="topbar" data-site-shell="header" role="banner">/);
  assert.match(html, /<footer class="footer" data-site-shell="footer"/);
  assert.match(html, /href="\/ekodibiz\/#business"/, 'service-local business navigation works from refund path');
  assert.match(html, /href="mailto:joseph@ekodibiz\.kr"/, 'support email link is actionable');
  assert.equal((html.match(/<a\b[^>]*aria-current="page"/g) || []).length, 2, 'active refund nav in header and footer');
});

test('refund policy response is cacheable HTML and HEAD has no body', async () => {
  const res = ekodiBizRefundPolicyResponse();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(await res.text(), /환불정책/);
  const head = ekodiBizRefundPolicyResponse({ head: true });
  assert.equal(await head.text(), '');
});

test('refund policy is linked from shared footer, EKODIBIZ footer, terms and sitemap', async () => {
  assert.ok(EKODI_USER_FOOTER.legalLinks.some(link => link.href === EKODIBIZ_REFUND_POLICY_URL));
  assert.ok(renderEkodiUserFooter().includes('>환불정책</a>'));
  const [bizHtml, bizJs, terms, router] = await Promise.all([
    readFile(new URL('../ekodibiz/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../ekodibiz/site.js', import.meta.url), 'utf8'),
    readFile(new URL('../terms.html', import.meta.url), 'utf8'),
    readFile(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(bizHtml.includes('href="https://ekodi.kr/ekodibiz/refund" data-i18n="refund"'));
  assert.equal((bizJs.match(/refund:'/g) || []).length, 6, 'every EKODIBIZ locale labels the refund link');
  assert.ok(terms.includes('href="/ekodibiz/refund"'));
  assert.ok(router.includes('isEkodiBizRefundPolicyPath(url.pathname)'));
  assert.ok(DISCOVERY_PUBLIC_ROUTES.some(route => route.path === '/ekodibiz/refund'));
  assert.ok(renderSitemapXml().includes(EKODIBIZ_REFUND_POLICY_URL));
});
