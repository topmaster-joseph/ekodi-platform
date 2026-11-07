import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const template = readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../assets/home-refresh.js', import.meta.url), 'utf8');

function themeAnchor(theme) {
  const anchors = [...template.matchAll(/<a\\b([^>]*\\bclass="mall-editorial-card[^"]*"[^>]*)>([\\s\\S]*?)<\\/a>/g)];
  return anchors.find(([, attrs]) => attrs.includes('mall-editorial-' + theme));
}

test('theme shopping cards deep-link to the matching product filter', () => {
  for (const [theme, category] of [['life','living'], ['gift','gift']]) {
    const match = themeAnchor(theme);
    assert.ok(match, 'missing ' + theme + ' editorial card');
    assert.match(match[1], /href="#shop"/);
    assert.ok(match[1].includes('data-filter-target="' + category + '"'), theme + ' does not open its matching category');
  }
});

test('regional settings card stays distinct from product catalog navigation', () => {
  const local = themeAnchor('local');
  assert.ok(local);
  assert.match(local[1], /href="#local"/);
  assert.doesNotMatch(local[1], /data-filter-target=/);
  assert.match(local[2], /지역 선택하기/);
  assert.ok(template.includes('id="localRegionSelect"'));
  assert.ok(template.includes('data-filter-target="local"'), 'quick nav to region-tagged products is preserved');
});

test('theme category links use existing Mall history and filter contract', () => {
  assert.match(nav, /document\\.querySelectorAll\\('a\\[data-filter-target\\]'\\)/);
  assert.match(nav, /navigate\\('#shop', category\\)/);
  assert.match(nav, /next\\.searchParams\\.set\\('category', category\\)/);
  assert.match(nav, /window\\.history\\.pushState/);
  assert.match(nav, /window\\.addEventListener\\('popstate', syncView\\)/);
  assert.match(nav, /window\\.addEventListener\\('hashchange', syncView\\)/);
});
