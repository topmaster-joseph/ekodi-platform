import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMallHeader } from '../../../mall-shared-header.js';

const template = readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/home-refresh.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../assets/home-refresh.js', import.meta.url), 'utf8');
const mallHeader = renderMallHeader({ home: true });

test('premium home renders navigation and retains core commerce entrypoints', () => {
  for (const id of ['mallGlobalSearch','contextForm','contextInput','contextResults','filters','shop','grid','wishBtn','wishDialog','localRegionSelect']) {
    assert.ok((template + mallHeader).includes('id="' + id + '"'), 'missing required anchor ' + id);
  }
  for (const file of ['/assets/home-refresh.css','/assets/home-refresh.js','/assets/context-curator.js','/assets/commerce.js','/assets/marketplace-live.js']) {
    assert.ok(template.includes(file), 'missing script or stylesheet ' + file);
  }
  assert.ok(template.indexOf('mall-category-shortcuts') < template.indexOf('context-recommend'));
  assert.ok(template.indexOf('class="shop"') < template.indexOf('affiliate-gates'));
  assert.ok(template.indexOf('class="shop"') > template.indexOf('mall-category-shortcuts'));
  assert.ok(template.indexOf('class="shop"') < template.indexOf('mall-editorial'));
  assert.ok(template.indexOf('class="shop"') < template.indexOf('context-recommend'));
  assert.ok(css.includes('@media(min-width:641px)'));
  assert.ok(css.includes('.mall-category-shortcuts{display:none}'));
});

test('category shortcuts map only to existing filters and destinations', () => {
  const known = new Set(['all','general','living','book','gift','local']);
  for (const [,category] of template.matchAll(/data-filter-target="([^"]+)"/g)) {
    assert.ok(known.has(category), 'unknown filter target ' + category);
  }
  for (const href of ['/travel/stay/','/picks','#local','#recommend','#shop','#discover']) {
    assert.ok((template + mallHeader).includes('href="' + href + '"'), 'missing target ' + href);
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

test('real portrait has a separate slot and suppresses only the Mall landing mascot', () => {
  assert.match(template, /data-ekodi-character="off"/);
  assert.match(template, /class="mall-hero-person"/);
  assert.match(template, /pexels-photo-6347572\.jpeg/);
  assert.doesNotMatch(template, /pexels-photo-35760987\.jpeg/);
  assert.match(css, /mall-hero-person\{position:absolute;top:-90px/);
  assert.match(css, /mall-photo-hero\{margin-top:96px/);
  assert.match(css, /@media\(max-width:390px\)/);
});

test('home and affiliate travel page use the same generated buyer header', () => {
  const affiliate = readFileSync(new URL('../src/affiliate-hub.template.html', import.meta.url), 'utf8');
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  for (const html of [template,affiliate]) assert.ok(html.includes('{{MALL_HEADER}}'));
  assert.match(build, /renderMallHeader\(\{ home: true/);
  assert.match(build, /renderMallHeader\(\{ home: false/);
  for (const label of ['전체상품','여행·레저','AI 추천','이번 주 추천']) assert.ok(mallHeader.includes(label));
  assert.match(affiliate, /assets\/home-refresh\.css/);
});

test('global search searches marketplace and live affiliate curator instead of a dead local-only filter', () => {
  assert.match(js, /EkodiContextCurator\.recommend\(term, true\)/);
  assert.match(js, /EkodiContextCurator\?\.recommend\(incomingQuery, true\)/);
  assert.match(js, /if \(!search \|\| !shop\) return;\s*event\.preventDefault\(\)/);
  assert.match(mallHeader, /role="search"/);
  assert.match(mallHeader, /method="get"/);
  const travelHeader = renderMallHeader({ publicPrefix: '/ekodimall', home: false });
  assert.match(travelHeader, /action="\/ekodimall\/"/);
  assert.match(travelHeader, /name="q"/);
});

test('all Mall pages center their header to the same width as the EKODI user footer', () => {
  assert.match(mallHeader, /class="mall-header-inner"/);
  assert.match(css, /--ekodi-user-content-inline-size,var\(--ekodi-user-canvas-max,1240px\)/);
  assert.match(css, /\.mall-header \.mall-header-inner/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /\.mall-premium-hero \[data-ekodi-user-character\]/);
  const character = readFileSync(new URL('../../../shell/user-character.js', import.meta.url), 'utf8');
  assert.match(character, /serviceId\(\)!=='mall'/);
});

test('legacy product, store, seller, checkout and policy headers match canonical EKODI footer width', () => {
  const shared = readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');
  for (const name of ['product','store','seller','checkout','page']) {
    const html = readFileSync(new URL('../src/' + name + '.template.html', import.meta.url), 'utf8');
    assert.match(html, /class="header"/);
  }
  assert.match(shared, /\.header:not\(\.mall-header\)/);
  assert.match(shared, /--ekodi-user-content-inline-size,var\(--ekodi-user-canvas-max,1240px\)/);
  assert.match(shared, /@media\(max-width:720px\)/);
});
