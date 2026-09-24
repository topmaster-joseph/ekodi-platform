import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('current Admin navigation exposes the canonical English work-area labels', () => {
  for (const label of [
    'Platform Overview','Sites & Brands','Users, Admins & Access','Services & AI','Content, Events & Communication','Operations, Releases & Incidents','Settings, Security & Audit',
    'All Sites','Administrator Accounts & Access','Security & Identity Records','Incidents, Errors & Warnings','Execution Infrastructure','Overall Operational Health',
  ]) assert.ok(registry.includes(label), `missing current navigation label: ${label}`);
  assert.doesNotMatch(registry, /Domains & DNS|Activity Logs/);
});
