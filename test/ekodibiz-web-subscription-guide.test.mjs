import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { EKODIBIZ_HOMEPAGE_SERVICE_PATH, HOMEPAGE_PRICING, ekodiBizHomepageServiceHtml } from '../ekodibiz-homepage-service-page.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('homepage subscription is one business card linking directly to its native child route', async () => {
  const html = await read('ekodibiz/index.html');
  const cards = html.split('<div class="cards" id="businessCards">')[1].split('</div>')[0];
  const card = cards.match(/<a class="business-card" href="([^\"]+)" data-service="homepage">([\s\S]*?)<\/a>/);
  assert.ok(card, 'homepage subscription appears alongside the other business areas');
  assert.equal(card[1], EKODIBIZ_HOMEPAGE_SERVICE_PATH);
  assert.ok(card[2].includes('홈페이지 제작·구독 안내'));
  assert.equal((cards.match(/class="business-card"/g) || []).length, 9);
  for (const slug of ['software', 'solar', 'mall', 'consulting', 'trade', 'publishing', 'ai-ops', 'marketing']) {
    assert.ok(cards.includes('href="#business/' + slug + '"'), slug);
  }
  const hero = html.split('<section class="hero">')[1].split('</section>')[0];
  assert.ok(!hero.includes('data-service="homepage"'));
  assert.ok(!hero.includes('홈페이지 제작·구독 안내'));
});

test('root remains an overview while detailed pricing and application belong to the child page', async () => {
  const html = await read('ekodibiz/index.html');
  assert.ok(!html.includes('id="web-development"'));
  assert.ok(!html.includes('class="webdev-plan'));
  assert.ok(!html.includes('id="hpForm"'));
  for (const obsolete of ['39,900원', '79,900원', '149,000원', '299,000원', '부가세 별도']) {
    assert.ok(!html.includes(obsolete), obsolete);
  }
  const detail = ekodiBizHomepageServiceHtml();
  assert.ok(detail.includes('<form id="hpForm"'));
  assert.ok(detail.includes('id="apply"'));
  assert.ok(detail.includes('id="calcMonthly"'));
  assert.equal(HOMEPAGE_PRICING.plans.S1.monthly, 9900);
  assert.equal(HOMEPAGE_PRICING.plans.S1.setup, 0);
  assert.equal(HOMEPAGE_PRICING.taxIncluded, true);
});

test('business overview retains mission, merchant information and public footer', async () => {
  const html = await read('ekodibiz/index.html');
  assert.ok(html.includes('data-ekodi-mission="biz"'));
  assert.ok(html.includes('data-merchant-review="intangible-service"'));
  assert.ok(html.includes('https://ekodi.kr/ekodibiz/refund'));
  assert.ok(html.includes('href="tel:+821035018542"'));
  assert.equal((html.match(/data-site-shell="header"/g) || []).length, 1);
  assert.equal((html.match(/data-site-shell="footer"/g) || []).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/ekodibiz">/);
});

test('new business card uses the existing six-locale dictionary without altering internal business routing', async () => {
  const script = await read('ekodibiz/site.js');
  const dictionaries = vm.runInNewContext(script.slice(script.indexOf('const TEXT='), script.indexOf('const SUPPORTED')) + '\nTEXT;');
  assert.deepEqual(Object.keys(dictionaries), ['ko-KR', 'en', 'zh-CN', 'ja', 'ne', 'vi']);
  for (const locale of Object.keys(dictionaries)) {
    assert.ok(dictionaries[locale].businessHomepage, locale);
    assert.ok(dictionaries[locale].businessHomepageSummary, locale);
  }
  assert.ok(script.includes("if(type==='trade')return scopedLogin('trade','https://ekodi.kr/ekodibiz/trade')"));
  const css = await read('ekodibiz/style.css');
  assert.ok(!css.includes('.webdev-plans'));
  assert.ok(css.includes('.business-card'));
  assert.ok(css.includes('.hero .ekodi-mission-statement'));
});
