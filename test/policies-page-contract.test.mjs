import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [registry, layout] = await Promise.all([
  readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin-menu-layout.js', import.meta.url), 'utf8'),
]);

test('Policies is an internal Admin capability routed through AI Ops rather than a legacy panel', () => {
  assert.match(registry, /id: 'policies'[\s\S]*internal: true/);
  assert.match(layout, /#policies:policies/);
  assert.ok(layout.includes("const INTERNAL=new Set(['services','deployments','policies']);"));
  assert.ok(layout.includes("function routeInternal(){dc=false;requestedSection='aiops'"));
});
