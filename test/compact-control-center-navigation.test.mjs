import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('current Admin navigation exposes the canonical English work-area labels', () => {
  for (const label of [
    'Integrated Overview','Services','Sites','Users & Access','Content & Operations','Status & Releases','Settings & Records',
    'All Sites','Administrator Settings','Access & Identity Records','Incidents, Errors & Warnings','Execution Infrastructure','Platform, Site & Engine Health',
  ]) assert.ok(registry.includes(label), `missing current navigation label: ${label}`);
  assert.doesNotMatch(registry, /Domains & DNS|Activity Logs/);
});
