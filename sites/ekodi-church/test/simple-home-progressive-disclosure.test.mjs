import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../church-refresh.css', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../church-homepage-layout.css', import.meta.url), 'utf8');
const devotion = readFileSync(new URL('../devotion/index.html', import.meta.url), 'utf8');

test('church homepage starts simple while preserving every primary destination', () => {
  const destinations = [
    ['#about', '우리의 정체성'],
    ['/ekodichurch/devotion/', '매일묵상'],
    ['#community', '공동체 활동'],
    ['#worship', '예배'],
    ['#online', '라이브 방송'],
    ['#partner-news', '협력 소식'],
    ['#location', '함께하기'],
  ];

  for (const [href, label] of destinations) {
    assert.ok(html.includes(`href="${href}"`), `missing destination ${href}`);
    assert.ok(html.includes(`<strong>${label}</strong>`), `missing intuitive label ${label}`);
  }

  assert.ok(css.includes('/* Progressive disclosure · simple first view'));
  assert.ok(css.includes('.hero .hero-focus,.hero .hero-copy,.hero .scroll-cue{display:none!important}'));
  assert.ok(css.includes('.hero .overview-grid a span,.hero .overview-grid a small{display:none!important}'));
  assert.ok(css.includes('#about,#worship,#message,#life-hub,#community,#partner-news,#online,#location{display:none!important}'));
  assert.ok(css.includes('#online:has(:target)'));
  assert.ok(css.includes('.church-live-entry{display:none!important}'));
});


test('daily devotion has one canonical main navigation link and an explicit EKODI heading', () => {
  const nav = html.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.match(nav, /href="\/ekodichurch\/devotion\/">매일묵상<\/a>/);
  assert.equal((nav.match(/매일묵상/g) || []).length, 1, 'do not duplicate daily devotion in the main nav');
  assert.doesNotMatch(html, /<strong>오늘의 삶<\/strong>/);
  assert.match(devotion, /<h1>에코디 오늘의 매일묵상<\/h1>/);
});

test('mobile hero is content-first instead of adding a viewport-height blank band', () => {
  const mobile = layout.slice(layout.indexOf('@media(max-width:800px)'));
  assert.match(mobile, /\.hero\s*\{[^}]*display:block!important;[^}]*height:auto!important;[^}]*min-height:0!important;/);
  assert.match(mobile, /\.hero-content\{[^}]*padding:0!important/);
  assert.match(layout, /overflow-wrap:normal!important;word-break:keep-all!important/);
});
