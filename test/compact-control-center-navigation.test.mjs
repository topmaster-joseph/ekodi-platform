import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('current Admin navigation exposes the canonical English work-area labels', () => {
  for (const label of [
    'Site Management','Work','Mail & Live','Spaces & Files','Organizations','Customer Sites',
    'Administrators & Access','Life AI','Community','Books & Publishing','Social','AI Operations',
    'Marketing AI','Finance & Accounting','Storage','API & Cost','System Health','Security','Remote Work',
  ]) assert.ok(registry.includes(label), `missing current navigation label: ${label}`);
  assert.doesNotMatch(registry, /Domains & DNS|Activity Logs/);
});
