import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const js = readFileSync(new URL('../marketing-ai-admin-live-ops.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../marketing-admin-control.js', import.meta.url), 'utf8');

test('Marketing operations exposes only aggregate social performance and no raw customer identity fields', () => {
  assert.match(js, /loadPerformance/);
  assert.match(js, /views/);
  assert.match(js, /clicks/);
  assert.match(js, /conversions/);
  assert.match(admin, /customerPiiIncluded:false/);
  assert.doesNotMatch(js, /customer\.phone|customer\.email|customer\.name|customerKey|customer_key/);
});

test('Human-gated campaign ledger remains separate from direct social provider execution', () => {
  assert.match(js, /\/api\/control\/social\/posts/);
  assert.match(js, /\/api\/control\/social\/oauth\//);
  assert.doesNotMatch(js, /\/api\/marketing\/ledger\/.*(?:publish|approve|execute)/);
  assert.doesNotMatch(js, /fetch\([^)]*\/api\/marketing\/ledger[^)]*,\s*\{[^}]*method:\s*['"]POST/s);
});
