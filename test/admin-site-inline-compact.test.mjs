import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [js, css] = await Promise.all([read('campus-actions.js'), read('campus-actions.css')]);

test('site admin home button opens the selected child admin below, never in another tab', () => {
  const start = js.indexOf('  function renderSiteAdmin(site) {');
  const end = js.indexOf('  function siteAdminFrame(site, fallback) {', start);
  assert.ok(start > 0 && end > start);
  const block = js.slice(start, end);
  assert.match(block, /element\('button', 'primary campus-row-action', '관리자 화면'\)/);
  assert.match(block, /open\.dataset\.inlineAdmin = site\.key/);
  assert.match(block, /if \(box\.dataset\.siteKey !== site\.key\) return/);
  assert.match(block, /siteAdminFrame\(site, target => renderSiteAdminLinks/);
  assert.match(block, /current\.replaceWith\(next\)/);
  assert.match(block, /next\.scrollIntoView\(\{ block: 'start', behavior: 'auto' \}\)/);
  assert.doesNotMatch(block, /open\.target = '_blank'/);
  assert.doesNotMatch(block, /makeButton\('Status',/);
});

test('existing origin and tenant authentication contracts are preserved', () => {
  assert.match(js, /adminPath: '\/pizzamaru\/admin'/);
  assert.match(js, /const src = new URL\(site\.adminRoot\.adminPath, location\.origin\)/);
  assert.match(js, /src\.searchParams\.set\('embedded', 'admin'\)/);
  assert.match(js, /frame\.referrerPolicy = 'same-origin'/);
  assert.match(js, /frame\.dataset\.siteAdminFrame = site\.key/);
  assert.match(js, /direct\.href = site\.adminRoot\.adminPath/);
  assert.match(js, /direct\.target = '_blank'/);
  assert.match(js, /direct\.rel = 'noopener'/);
});

test('selected site strips remain one horizontal row, while site actions are responsive', () => {
  assert.match(js, /owner: 'sites'/);
  assert.match(js, /ariaLabel: '사이트 선택'/);
  assert.ok(js.includes(`const activeButton = bar?.querySelector('[aria-selected="true"]')`));
  assert.ok(js.includes('bar.scrollLeft += itemRect.left'));
  assert.match(css, /admin-work-strip\[data-admin-strip-owner="sites"\]/);
  assert.match(css, /flex-wrap:nowrap!important;overflow-x:auto!important/);
  assert.match(css, /campus-site-admin-summary/);
  assert.match(css, /campus-site-admin-actions/);
  assert.match(css, /@media \(max-width:760px\)/);
});
