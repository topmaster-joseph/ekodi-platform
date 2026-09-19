import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/production-gate.yml','utf8');
const canary = fs.readFileSync('scripts/post-deploy-canary.mjs','utf8');
const quotaLib = fs.readFileSync('scripts/cloudflare-quota-guard-lib.mjs','utf8');
const quotaConfig = JSON.parse(fs.readFileSync('config/cloudflare-production-quota-guard.json','utf8'));

test('production verification delegates to a fail-fast canary with no retry storm', () => {
  assert.match(workflow, /post-deploy-canary\.mjs --scope=full/);
  assert.doesNotMatch(workflow, /--retry/);
  assert.doesNotMatch(canary, /--retry|retry-all-errors|for attempt/i);
  assert.match(canary, /isQuotaCircuitBreak/);
  assert.match(canary, /if \(report\.circuitOpen\) process\.exit\(2\)/);
});

test('429 and Cloudflare Error 1027 are explicit circuit-break conditions', () => {
  assert.deepEqual(quotaConfig.circuitBreaker.statuses, [429]);
  assert.ok(quotaConfig.circuitBreaker.bodyMarkers.includes('Error 1027'));
  assert.ok(quotaConfig.circuitBreaker.bodyMarkers.includes('temporarily rate limited'));
  assert.match(quotaLib, /statuses\.includes\(Number\(status\)\)/);
  assert.match(quotaLib, /bodyMarkers/);
});
