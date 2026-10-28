import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../scripts/verify-admin-production-ui-e2e.mjs', import.meta.url), 'utf8');

test('postdeploy Admin boot failure captures bounded credential-free evidence without weakening the gate', () => {
  assert.ok(source.includes('[PROD-E2E] admin-shell-timeout'));
  assert.ok(source.includes('admin-boot-timeout.png'));
  assert.ok(source.includes('sessionRouteHits += 1'));
  assert.ok(source.includes('httpErrors:adminHttpErrors.slice(-10)'));
  assert.ok(source.includes("hasToken:Boolean(sessionStorage.getItem('ekodi-auth-token'))"));
  assert.ok(source.includes('throw error;'));
  assert.ok(!source.includes('console.log(SYNTHETIC_TOKEN)'));
});

// CF-QUOTA-001: synthetic production verification must not burn quota to hide 429.
test('stop-on-first-quota circuit rejects Admin entry and degraded-shell reload 429 without retry', () => {
  assert.match(source,/CF-QUOTA-001 circuit open on Admin entry: HTTP 429; no retry/);
  assert.match(source,/CF-QUOTA-001 circuit open on Admin shell reload: HTTP 429; no retry/);
  assert.doesNotMatch(source,/gotoAdminWith429Backoff|retryAfterMs/);
});
