import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../scripts/verify-admin-production-ui-e2e.mjs', import.meta.url), 'utf8');

test('postdeploy Admin boot failure captures bounded, credential-free evidence without weakening the gate', () => {
  assert.match(source, /\[PROD-E2E\] admin-shell-timeout/);
  assert.match(source, /admin-boot-timeout\\.png/);
  assert.match(source, /sessionRouteHits \+= 1/);
  assert.match(source, /httpErrors:adminHttpErrors\\.slice\\(-10\\)/);
  assert.match(source, /hasToken:Boolean\\(sessionStorage\\.getItem/);
  assert.match(source, /throw error;/);
  assert.doesNotMatch(source, /console\\.(?:log|error)\\([^\\n]*(?:SYNTHETIC_TOKEN|sessionStorage\\.getItem\\('ekodi-auth-token'\\))/);
});
