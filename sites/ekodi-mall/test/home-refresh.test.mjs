import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMallHeader } from '../../../mall-shared-header.js';

const template = readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/home-refresh.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../assets/home-refresh.js', import.meta.url), 'utf8');
const mallHeader = renderMallHeader({ home: true });
const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));

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

test('category tabs show products without the home hero and persist on reload', () => {
  for (const marker of [
    'document.body.dataset.mallView = mode',
    'categoryFromUrl',
    'window.history.pushState',
    "window.addEventListener('popstate', syncView)",
    "window.addEventListener('hashchange', syncView)",
  ]) assert.ok(js.includes(marker), 'missing navigation contract ' + marker);
  assert.ok(css.includes('body[data-mall-view="catalog"] main#main > :not(#filters):not(#shop)'));
  assert.ok(css.includes('body[data-mall-view="recommend"] main#main > :not(#recommend)'));
  assert.doesNotMatch(js, /mallNavProductsGrid|cloneNode/);
  assert.ok(template.includes('id="mallRecommendSearchForm"'));
  assert.ok(template.includes('<a href="#top">홈</a>'));
});

test('buyer-facing payment copy matches the approved direct-sale-only production scope', () => {
  assert.equal(site.commerce.paymentsEnabled, true);
  assert.equal(site.notice, '', 'obsolete global banner must stay hidden');
  assert.match(site.commerce.betaMessage, /에코디비즈.*직접판매/);
  assert.match(site.commerce.betaMessage, /다른 판매자의 대금/);
  assert.match(readFileSync(new URL('../src/checkout.template.html', import.meta.url), 'utf8'), /\{\{BETA_MESSAGE\}\}/);
  assert.doesNotMatch(site.notice + site.commerce.betaMessage, /직접판매 온라인 결제는 활성화하지 않았습니다/);
});

test('phone catalog uses one contained product column to avoid clipped cards', () => {
  assert.ok(css.includes('@media(max-width:480px)'));

  assert.ok(css.includes('.mall-category-shortcuts~.shop .grid{grid-template-columns:minmax(0,1fr)}'));
  assert.ok(css.includes('.mall-category-shortcuts~.shop .card{min-width:0;max-width:100%}'));
  assert.ok(css.includes('body[data-mall-view="catalog"] main#main > :not(#filters):not(#shop)'));
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
  assert.ok(js.includes('button.click()'));

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
  for (const label of ['전체상품','여행·레저','쿠팡추천몰','로컬·특산물','식품·건강','생활·가전','책·배움','선물·기념품','이번 주 추천']) assert.ok(mallHeader.includes(label));
  assert.ok(!mallHeader.includes('>AI 추천</a>'));
  assert.match(affiliate, /assets\/home-refresh\.css/);
});

test('global search searches marketplace and live affiliate curator instead of a dead local-only filter', () => {
  assert.match(js, /EkodiContextCurator\.recommend\(term, false\)/);
  assert.match(js, /EkodiContextCurator\?\.recommend\(incomingQuery, false\)/);
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

test('all generated Mall section headers keep the same category labels and seller pill', () => {
  const canonical = renderMallHeader({ publicPrefix: '/ekodimall', home: false });
  const navLabels = markup => {
    const nav = markup.match(/<nav class="mall-primary-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
    return [...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(match => match[1]);
  };
  assert.deepEqual(navLabels(mallHeader), navLabels(canonical));
  for (const category of ['all', 'local', 'general', 'living', 'book', 'gift']) {
    assert.ok(canonical.includes('data-filter-target="' + category + '"'));
  }
  assert.match(canonical, /assets\/category-visibility\.js/);
  assert.match(css, /--mall-content-width:1080px/);
  assert.match(css, /\.mall-header \.seller-mini\{[\s\S]*?border-radius:999px/);
  assert.match(css, /body\[data-mall-view="catalog"\] main#main > #shop/);
  const affiliateCss = readFileSync(new URL('../assets/affiliate-hub.css', import.meta.url), 'utf8');
  assert.match(affiliateCss, /\.affiliate-hub\{[\s\S]*?--mall-content-width,1080px/);
});

test('book cards use concise copy and verified prices or an explicit unknown-price label', () => {
  const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const books = readFileSync(new URL('../assets/bookstore-live.js', import.meta.url), 'utf8');
  assert.match(build, /product\.category === 'book' \? 34 : 46/);
  assert.match(build, /'가격 확인 · '/);
  assert.match(build, /category-availability\.json/);
  assert.match(books, /const verifiedAmount = Number\(quote\.price\.amount\)/);
  assert.match(books, /released\.set\(book\.bookId, \{ \.\.\.book, price: verifiedAmount \}\)/);
  assert.match(books, /readyQuote\(quote, book\.bookId\)/);
  assert.match(books, /가격 확인 · 판매 상태 확인 필요/);
  assert.match(books, /const quote = await quoteFor\(book\.bookId\)/);
  assert.match(css, /\.card\[data-category="book"\] \.card-summary/);
  assert.match(css, /-webkit-line-clamp:2/);
});


test('Toss underwriting: buyer catalog precedes marketing hero and discloses bookstore login', () => {
  assert.ok(template.indexOf('class="shop" id="shop"') < template.indexOf('class="context-hero mall-premium-hero"'), 'sale-ready products must precede editorial hero');
  assert.ok(template.includes('id="top"'), 'home navigation anchor must remain valid');
  assert.match(template, /에코디서점 전자책은 로그인 후 구매/);
  assert.match(template, /판매 준비 중인 상품은 결제 버튼이 표시되지 않습니다/);
  assert.match(template, /상품 상세에서 확인합니다/);
});

test('Toss underwriting: confirmed empty nav is hidden, and uncertain catalog is not misclassified', () => {
  const visibility = readFileSync(new URL('../assets/category-visibility.js', import.meta.url), 'utf8');
  assert.match(visibility, /link.hidden=!available/);
  assert.match(visibility, /return data.products.length===0\?false:null/);
  assert.match(visibility, /card.dataset.bookstoreQuotePending!=='true'/);
  assert.match(css, /\.mall-primary-nav a\[data-filter-target\]\[hidden\]/);
  assert.match(css, /\.mall-category-shortcuts a\[data-filter-target\]\[hidden\]/);
});

test('Toss underwriting: an unverified bookstore quote cannot expose a sale card', () => {
  const builder = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
  const books = readFileSync(new URL('../assets/bookstore-live.js', import.meta.url), 'utf8');
  assert.match(builder, /data-bookstore-quote-pending/);
  assert.match(builder, /product.source\?\.system === 'ekodi-bookstore'/);
  assert.match(app, /card.dataset.bookstoreQuotePending !== 'true'/);
  assert.match(books, /if \(!readyQuote\(quote, book.bookId\)\)/);
  assert.match(books, /existing.dataset.bookstoreQuotePending = 'false'/);
  assert.match(books, /existing.dataset.bookstoreQuotePending = 'true'/);
  assert.match(css, /\.card\[data-bookstore-quote-pending="true"\]\{display:none!important\}/);
});
