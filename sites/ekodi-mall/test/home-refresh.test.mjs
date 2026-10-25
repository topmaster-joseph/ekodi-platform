import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const template = readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/home-refresh.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../assets/home-refresh.js', import.meta.url), 'utf8');

test('premium home renders navigation and retains core commerce entrypoints', () => {
  for (const id of ['mallGlobalSearch','contextForm','contextInput','contextResults','filters','shop','grid','wishBtn','wishDialog','localRegionSelect']) {
    assert.ok(template.includes('id="' + id + '"'), 'missing required anchor ' + id);
  }
  for (const file of ['/assets/home-refresh.css','/assets/home-refresh.js','/assets/context-curator.js','/assets/commerce.js','/assets/marketplace-live.js']) {
    assert.ok(template.includes(file), 'missing script or stylesheet ' + file);
  }
  assert.ok(template.indexOf('mall-category-shortcuts') < template.indexOf('context-recommend'));
  assert.ok(template.indexOf('class="shop"') < template.indexOf('affiliate-gates'));
  assert.ok(template.indexOf('class="shop"') > template.indexOf('context-recommend'));
});

test('category shortcuts map only to existing filters and destinations', () => {
  const known = new Set(['all','general','living','book','gift','local']);
  for (const [,category] of template.matchAll(/data-filter-target="([^"]+)"/g)) {
    assert.ok(known.has(category), 'unknown filter target ' + category);
  }
  for (const href of ['/travel/stay/','/picks','#local','#recommend','#shop','#discover']) {
    assert.ok(template.includes('href="' + href + '"'), 'missing target ' + href);
  }
  assert.match(js, /dispatchEvent\(new Event\('input'/);
  assert.match(js, /button\?\.click\(\)/);
});

test('responsive storefront does not change payments or disclose false sales claims', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(template, /\d+%\s*할인|무료배송|누적 판매|베스트셀러/);
  assert.doesNotMatch(js, /checkout|payment|localStorage|fetch\(/);
});
