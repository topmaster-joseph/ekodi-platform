import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const admin = read('marketing-ai-admin.js');
const channels = read('marketing-ai-channel-manager.js');
const layout = read('admin-menu-layout.js');
const routes = read('admin-canonical-routes.js');

// 2026-10-24 production: /admin/services/marketing-ai showed the panel but KPI "—",
// "관리 데이터를 불러오는 중입니다." forever, and the 게시 · 홍보 tab froze the page.
test('admin shell activates sections on path routes through ekodi-admin-section-changed', () => {
  assert.match(layout, /new CustomEvent\('ekodi-admin-section-changed',\{detail:\{section\}\}\)/);
  assert.match(layout, /\['marketing-ai','marketing'\]/, 'marketing-ai section is demand-loaded via the marketing feature');
  assert.match(routes, /'marketing-ai':'services'/, 'canonical path /admin/services/marketing-ai');
});

test('MarketingAI admin loads data when the shell activates its path route (not only #marketing-ai)', () => {
  assert.match(admin, /window\.addEventListener\('ekodi-admin-section-changed', event => \{\s*if \(String\(event\.detail\?\.section \|\| ''\) === 'marketing-ai'\) activateFromShell\(\);/);
  assert.match(admin, /function activateFromShell\(\) \{[\s\S]*?refreshData\(\);[\s\S]*?\}/);
  assert.match(admin, /sectionFromLocation\?\.\(location\) === 'marketing-ai'/, 'direct load of the canonical path is recognised');
  assert.match(admin, /token\(\) && \(routeActive\(\) \|\| panelVisible\(\)\)/, 'install() loads data when the panel is already the active route');
  assert.match(admin, /else if \(routeActive\(\) && !state\.data\) activateFromShell\(\);/, 'post-auth #app reveal also covers the path route');
  // The hash route keeps working, and show() no longer rewrites a canonical path back to a hash.
  assert.match(admin, /if \(location\.hash === '#marketing-ai' && token\(\)\) setTimeout\(show,0\);/);
  assert.match(admin, /navigationTarget\?\.\('marketing-ai', location\) \|\| '#marketing-ai'/);
  assert.doesNotMatch(admin, /history\.replaceState\(null,'','#marketing-ai'\)/);
});

test('extension tabs (포스팅 현황) move the console tab state so Approvals/Reports panels do not re-mount over them', () => {
  assert.match(admin, /if \(extra && !TABS\.some\(\(\[key\]\) => key === extra\.dataset\.marketingTab\)\) state\.tab = extra\.dataset\.marketingTab;/);
  assert.match(admin, /state\.tab === 'approvals' && !view\.querySelector\('\.marketing-ai-studio-review'\)/);
  assert.match(admin, /state\.tab === 'reports' && !view\.querySelector\('\.marketing-ai-performance'\)/);
});

test('게시 · 홍보 channel manager builds a valid same-origin URL and cannot self-trigger a render loop', () => {
  assert.match(channels, /new URL\(`\$\{API\}\$\{path\}`, location\.origin\)/, 'relative API path needs a base URL');
  assert.doesNotMatch(channels, /new URL\(`\$\{API\}\$\{path\}`\);/);
  assert.doesNotMatch(channels, /queueMicrotask\(renderManager\)/, 'microtask re-render starved the main thread');
  assert.match(channels, /!view\.querySelector\('\[data-growth-manager\]'\)\) setTimeout\(renderManager,0\)/);
  // Every manager output (loading, hub, error) carries the marker so its own mutations are ignored.
  assert.equal((channels.match(/data-growth-manager/g) || []).length >= 4, true);
  assert.match(channels, /class="growth-hub" data-growth-hub data-growth-manager/);
  assert.match(channels, /class="growth-platform-alert" data-growth-manager>게시·홍보 연결센터를 불러오지 못했습니다/);
  for (const provider of ['meta', 'threads', 'youtube']) assert.match(channels, new RegExp(`data-connect="${provider}"`));
});
