import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const base = readFileSync(new URL('../marketing-ai-admin.js', import.meta.url), 'utf8');
const posting = readFileSync(new URL('../marketing-ai-admin-posting-status.js', import.meta.url), 'utf8');
const live = readFileSync(new URL('../marketing-ai-admin-live-ops.js', import.meta.url), 'utf8');
const channels = readFileSync(new URL('../marketing-ai-channel-manager.js', import.meta.url), 'utf8');

test('every visible Marketing AI submenu resolves to a deliberate view', () => {
  for (const tab of ['overview','customers','workspaces','campaigns','crm','channels','automation','approvals','billing','reports']) {
    assert.match(base, new RegExp(`['\"]${tab}['\"]`));
  }
  assert.match(posting, /TAB_KEY = 'publications'/);
  assert.match(posting, /포스팅 현황/);
  assert.match(live, /LIVE_TABS = new Set\(\['campaigns','crm','channels','automation','approvals'\]\)/);
  assert.match(channels, /TAB_KEY = 'channels'/);
  assert.match(channels, /tab\.textContent = '게시 · 홍보'/);
});

test('submenu clicks have shareable routes and restore through browser history', () => {
  assert.match(posting, /const PARAM = 'marketing_tab'/);
  assert.match(posting, /const ROOT_HASH = '#marketing-ai'/);
  assert.match(posting, /history\[replace \? 'replaceState' : 'pushState'\]/);
  assert.match(posting, /button\.dataset\.marketingRoute = routeFor\(tab\)/);
  assert.match(posting, /window\.addEventListener\('popstate'/);
  assert.match(posting, /ekodi-admin-section-changed/);
  assert.match(posting, /tabButton\(requested\) \|\| tabButton\(DEFAULT_TAB\)/);
  assert.match(posting, /requested !== resolved/);
});

test('dynamic posting tab participates in the same route contract before channel management', () => {
  assert.match(posting, /channels\.insertAdjacentElement\('beforebegin', button\)/);
  assert.match(posting, /host\.dataset\.submenuRoutes = 'deterministic-v1'/);
  assert.match(posting, /querySelectorAll\('\[data-marketing-tab\]'\)/);
});

test('route bridge source remains valid JavaScript', () => {
  const path = fileURLToPath(new URL('../marketing-ai-admin-posting-status.js', import.meta.url));
  const result = spawnSync(process.execPath, ['--check', path], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
