import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { preparePromotionItems, filterPromotionItems, promotionPage, PROMOTION_MAX_ITEMS } from '../promotion-core.js';

const entry = (id, type = 'notice', extra = {}) => ({ id, type, url: 'https://ekodi.kr/ekodimission/posts/' + id, name: '공개 소식 ' + id, description: '함께 나누는 소식', siteId: 'ekodimission', ...extra });

test('only approved registry content and HTTPS canonical host are shown', () => {
  const registry = { resources: [
    entry('yes', 'event'),
    entry('hidden', 'notice', { visibility: 'hidden' }),
    entry('private', 'notice', { url: 'https://ekodi.kr/admin/private' }),
    entry('api', 'notice', { url: 'https://ekodi.kr/api/posts' }),
    entry('foreign', 'notice', { url: 'https://other.example/posts' }),
    entry('credential', 'notice', { url: 'https://user:pass@ekodi.kr/notice' }),
    entry('query', 'notice', { url: 'https://ekodi.kr/notice?secret=1' }),
    entry('page', 'page'),
    entry('url-only', 'notice', { url: 'https://ekodi.kr/' }),
    entry('duplicate', 'event', { url: 'https://ekodi.kr/ekodimission/posts/yes' }),
  ] };
  const result = preparePromotionItems(registry);
  assert.deepEqual(result.map(item => item.id), ['yes']);
  assert.equal(result[0].category, 'event');
  assert.equal(result[0].url, 'https://ekodi.kr/ekodimission/posts/yes');
});

test('event/notice/product categories and tenant filtering stay read-only', () => {
  const items = preparePromotionItems({ resources: [
    entry('one', 'event'),
    entry('two', 'post'),
    entry('three', 'product', { siteId: 'ekodimall' }),
    entry('four', 'service'),
  ] });
  assert.equal(filterPromotionItems(items, { category: 'event' }).length, 1);
  assert.equal(filterPromotionItems(items, { category: 'notice' }).length, 2);
  assert.equal(filterPromotionItems(items, { category: 'product' }).length, 1);
  assert.equal(filterPromotionItems(items, { siteId: 'ekodimall' }).length, 1);
  assert.equal(items.length, 4);
});

test('banner rotation wraps without losing entries and caps response size', () => {
  const items = preparePromotionItems({ resources: Array.from({ length: 100 }, (_, i) => entry(String(i))) });
  assert.equal(items.length, PROMOTION_MAX_ITEMS);
  assert.equal(promotionPage(items, 0, 5).items.length, 5);
  assert.equal(promotionPage(items, 12, 5).page, 0);
  assert.deepEqual(promotionPage([], 5, 5), { items: [], page: 0, pages: 0 });
});

test('the public board ships external scripts and accessible actions', async () => {
  const html = await readFile(new URL('../promotion.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../promotion.css', import.meta.url), 'utf8');
  const js = await readFile(new URL('../promotion.js', import.meta.url), 'utf8');
  assert.match(html, /lang="ko"/);
  assert.match(html, /src="\/promotion.js"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /id="promotionBoard"/);
  assert.match(css, /word-break:keep-all/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(js, /fetch\('\/public-registry.json'/);
  assert.doesNotMatch(js, /innerHTML/);
});
