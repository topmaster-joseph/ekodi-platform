import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../church-refresh.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('church hero eight shortcuts use centered readable labels on desktop and mobile', () => {
  const menu = html.match(/<div class="overview-grid"[\s\S]*?<\/div>/)?.[0];
  assert.ok(menu, 'overview menu must exist');
  assert.equal((menu.match(/<a href=/g) || []).length, 8, 'there must be eight shortcuts');
  assert.match(css, /\.hero \.overview-grid a\{[\s\S]*?place-items:center/);
  assert.match(css, /\.hero \.overview-grid a strong\{[^}]*font-size:18px;[^}]*text-align:center;/);
  assert.match(css, /@media\(max-width:800px\)\{[\s\S]*?\.hero \.overview-grid a strong\{font-size:17px\}/);
  assert.match(css, /@media\(max-width:480px\)\{[\s\S]*?\.hero \.overview-grid a strong\{font-size:16px\}/);
});

test('partner news is hidden until selected, including direct deep links', () => {
  assert.match(css, /#community,#partner-news,#online,#location\{display:none!important\}/);
  assert.match(css, /#partner-news:target/);
  assert.match(css, /\.hero:has\(~ #partner-news:target\)/);
  assert.match(css, /\.hero:has\(~ #partner-news :target\)/);
});

test('main navigation links to the shared QTIN group-order page for the church', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const html = await rf(new URL('../index.html', import.meta.url), 'utf8');
  const nav = html.slice(html.indexOf('<nav id="main-nav"'), html.indexOf('</nav>', html.indexOf('<nav id="main-nav"')));
  assert.ok(nav.includes('<a class="nav-qtin" href="/qtin/church">큐티인 신청</a>'));
  assert.ok(nav.indexOf('nav-qtin') < nav.indexOf('shell-my'), 'QTIN link sits before My Page');
});

test('the runtime header (script.js) keeps the QTIN group-order link, translated in all nine languages', () => {
  const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
  assert.ok(script.includes("{ href: '/qtin/church', label: '큐티인 신청', className: 'nav-qtin' }"));
  assert.ok(script.indexOf("'/qtin/church'") < script.indexOf("'/ekodichurch/my/'"));
  const ext = readFileSync(new URL('../church-i18n-extended.js', import.meta.url), 'utf8');
  assert.ok(ext.includes("add('큐티인 신청',"));
  const base = readFileSync(new URL('../church-i18n.js', import.meta.url), 'utf8');
  assert.ok(base.includes("'큐티인 신청':{en:"));
});
