import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sidebar = readFileSync(new URL('../admin-sidebar.js', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../admin-menu-layout.js', import.meta.url), 'utf8');

test('audit-records remains an explicit security-audit detail with an AI Ops panel', () => {
  assert.match(registry, /id: 'audit-records', group: 'security-audit'.*delegateSection: 'aiops'/);
  assert.match(layout, /if\(requestedSection!==section\)return;/);
});

test('detail click is isolated and cannot accidentally activate enclosing security work area', () => {
  const start = sidebar.indexOf("const detail = event.target.closest('[data-admin-detail-section]')");
  const end = sidebar.indexOf("const global = event.target.closest('[data-admin-global-group]')", start);
  assert.ok(start > 0 && end > start);
  const body = sidebar.slice(start, end);
  assert.match(body, /event\.preventDefault\(\)/);
  assert.match(body, /event\.stopImmediatePropagation\(\)/);
  assert.match(body, /const accepted = activateSection\(nav, section\)/);
  assert.match(body, /section === 'audit-records' && accepted/);
  assert.match(body, /serial !== detailClickSerial/);
  assert.match(body, /current === fallback && routed === fallback/);
  assert.match(body, /activateSection\(nav, section\)/);
  assert.doesNotMatch(body, /\.hidden\s*=\s*false|\.classList\.remove\('hidden-panel'\)|auth.*=.*true/);
});

test('stale audit recovery is bounded and never overrides later navigation', () => {
  assert.match(sidebar, /const serial = \+\+detailClickSerial/);
  assert.match(sidebar, /for \(const delay of \[0, 650\]\)/);
  assert.match(sidebar, /const fallback = getAdminMenuGroupDefault\('security-audit'\)/);
  assert.doesNotMatch(sidebar, /setInterval\([^)]*activateSection/);
});
