import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [registry, layout, css, build] = await Promise.all([
  readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-compact.css', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
]);

test('Admin navigation is grouped into eight distinct EKODI areas', () => {
  for (const id of ['home','sites','ai','services','finance','ops','settings','accounts']) {
    assert.match(registry, new RegExp(`id: '${id}'`));
  }
  assert.match(registry, /id: 'sites-all'[^\n]*en: 'All Sites'/);
  assert.match(registry, /id: 'admins'[^\n]*group: 'accounts'[^\n]*en: 'Administrator Accounts & Access'/);
});

test('internal technical sections stay hidden from the human menu and route through AI Ops', () => {
  assert.match(registry, /id: 'services'[\s\S]*internal: true/);
  assert.match(registry, /id: 'deployments'[^\n]*group: 'ops'/);
  assert.match(registry, /id: 'aiops'[^\n]*group: 'ai'[^\n]*ko: 'AI 운영센터'/);
  assert.match(registry, /id: 'policies'[\s\S]*internal: true/);
  assert.ok(layout.includes("const INTERNAL=new Set(['services','policies']);"));
  assert.ok(layout.includes("function routeInternal(){dc=false;requestedSection='aiops'"));
});

test('compact shell styling and production build use the current runtime modules', () => {
  assert.match(css, /sidebar/);
  assert.match(build, /'admin-menu-layout.js'/);
  assert.match(build, /'admin-demand-loader.js'/);
  assert.match(build, /'admin-compact.css'/);
});
