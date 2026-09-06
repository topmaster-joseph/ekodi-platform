import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('current Admin navigation exposes the canonical English work-area labels', () => {
  for (const label of [
    'Structure & Channels','Core & Identity','Common Services','Vertical Services','Operating Spaces','Operations Center',
    'Site Structure','Security & Identity','Personal Finance','Capability Center','AI & Agents','Execution Infrastructure','Health & Observability',
  ]) assert.ok(registry.includes(label), `missing current navigation label: ${label}`);
  assert.doesNotMatch(registry, /Domains & DNS|Activity Logs/);
});
