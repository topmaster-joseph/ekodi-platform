import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../sites/seonammedi/public/index.html', import.meta.url), 'utf8');

test('SeonamMedi public header uses flat five-item navigation without dropdown controls', () => {
  const nav = html.match(/<nav class="ekodi-six-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, 'five-item navigation must exist');
  assert.equal((nav.match(/<a\s/g) || []).length, 5);
  assert.doesNotMatch(nav, /<button|nav-group|nav-submenu|dropdown/i);
  for (const label of ['공지', '활동이력', '관련소식', '시민의견', '조직']) {
    assert.ok(nav.includes(label), 'missing navigation label: ' + label);
  }
});

test('central category panel and menu script are present', () => {
  assert.match(html, /id="central-category-panel"/);
  assert.match(html, /id="central-category-buttons"/);
  assert.match(html, /<script src="\.\/central-category-runtime\.js" defer><\/script>/);
});

test('no literal escaped newline text immediately follows the body tag', () => {
  assert.doesNotMatch(html, /<body[^>]*>\s*(?:\\[nrt]\s*)+/);
});

test('mobile hero is contained and not overlaid by category menus', () => {
  assert.match(html, /id="seonammedi-central-navigation-hero-fix"/);
  assert.match(html, /\.campaign-hero-image\{[^}]*width:100%/);
  assert.match(html, /\.central-category-panel\{[^}]*position:relative/);
});
