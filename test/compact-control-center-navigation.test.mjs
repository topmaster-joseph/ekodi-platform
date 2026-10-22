import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const registry = await readFile(new URL('../admin-menu-registry.js', import.meta.url), 'utf8');

test('current Admin navigation exposes the canonical English work-area labels', () => {
  for (const label of [
    'Home','Site Registry','AI Operations','Services & Engines','Finance','Operations & Reliability','Settings & Integrations','Accounts & Security',
    'Platform Overview','AI Operations Center','Releases & Incidents','Security & Audit','Site Tools (moving to site admin)',
    'All Sites','Administrator Accounts & Access','Security & Identity Records','Execution Infrastructure','Overall Operational Health',
  ]) assert.ok(registry.includes(label), `missing current navigation label: ${label}`);
  assert.doesNotMatch(registry, /Domains & DNS|Activity Logs/);
  // The AI operations center is no longer mislabeled as the incidents screen.
  assert.doesNotMatch(registry, /Incidents, Errors & Warnings/);
});
