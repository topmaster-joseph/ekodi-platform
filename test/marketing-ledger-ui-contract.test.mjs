import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const js = readFileSync(new URL('../marketing-ai-admin-live-ops.js', import.meta.url), 'utf8');

test('Marketing CRM admin renders aggregates, not raw identity fields', () => {
  assert.match(js, /CRM RELATIONSHIP LEDGER/);
  assert.match(js, /totalCustomers/);
  assert.match(js, /segments/);
  assert.doesNotMatch(js, /customer\.phone|customer\.email|customer\.name|customerKey/);
});

test('Campaign admin is observation-only', () => {
  assert.match(js, /CAMPAIGN LEDGER/);
  assert.match(js, /외부 게시·발송을 실행하지 않습니다/);
  assert.doesNotMatch(js, /fetch\([^)]*campaigns[^)]*,\s*\{[^}]*method:\s*['"]POST/s);
});
