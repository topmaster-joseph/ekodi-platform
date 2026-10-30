import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rateLimitDecision, isIntegrationScopeRefusal, staleWorkflowFiles, staleBaseRemedy, RECOVERY_RATE_WAIT_CAP_MS
} from '../scripts/lib/recovery-github-errors.mjs';

const NOW = Date.UTC(2026, 9, 30, 3, 32, 0);
const headers = obj => new Headers(obj);

test('primary rate limit 403 waits until reset when within the job budget', () => {
  const reset = Math.floor((NOW + 90_000) / 1000);
  const d = rateLimitDecision({ status: 403, headers: headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }),
    body: { message: 'API rate limit exceeded' }, nowMs: NOW });
  assert.equal(d.limited, true);
  assert.equal(d.reason, 'primary_rate_limit');
  assert.equal(d.retry, true);
  assert.ok(d.waitMs >= 60_000 && d.waitMs <= RECOVERY_RATE_WAIT_CAP_MS);
});

test('a reset beyond the job budget is recorded, not slept on', () => {
  const reset = Math.floor((NOW + 50 * 60_000) / 1000);
  const d = rateLimitDecision({ status: 403, headers: headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }),
    body: {}, nowMs: NOW });
  assert.equal(d.limited, true);
  assert.equal(d.retry, false);
  assert.equal(d.retryAt, reset * 1000);
});

test('secondary rate limit and 429 are quota, a permission 403 is not', () => {
  assert.equal(rateLimitDecision({ status: 403, headers: headers({ 'x-ratelimit-remaining': '4000' }),
    body: { message: 'You have exceeded a secondary rate limit' }, nowMs: NOW }).limited, true);
  assert.equal(rateLimitDecision({ status: 429, headers: headers({ 'retry-after': '30' }), body: {}, nowMs: NOW }).limited, true);
  assert.equal(rateLimitDecision({ status: 403, headers: headers({ 'x-ratelimit-remaining': '4000' }),
    body: { message: 'Resource not accessible by integration' }, nowMs: NOW }).limited, false);
  assert.equal(rateLimitDecision({ status: 200, headers: headers({}), body: {}, nowMs: NOW }).limited, false);
});

test('integration scope refusal is recognized only for 403 with the GitHub message', () => {
  assert.equal(isIntegrationScopeRefusal(403, { message: 'Resource not accessible by integration' }), true);
  assert.equal(isIntegrationScopeRefusal(403, { message: 'API rate limit exceeded' }), false);
  assert.equal(isIntegrationScopeRefusal(422, { message: 'Reference already exists' }), false);
});

test('stale workflow files are detected from a compare payload and named in the remedy', () => {
  const files = staleWorkflowFiles({ files: [
    { filename: 'invest-broker-readonly-snapshot.js' },
    { filename: '.github/workflows/deploy-my.yml' },
    { filename: '.github/workflows/ci.yml' },
  ] });
  assert.deepEqual(files, ['.github/workflows/deploy-my.yml', '.github/workflows/ci.yml']);
  assert.deepEqual(staleWorkflowFiles({ files: [{ filename: 'a.js' }] }), []);
  assert.deepEqual(staleWorkflowFiles(null), []);
  const remedy = staleBaseRemedy({ prNumber: 6998, headSha: '03dd22b181c82fb0cc88105fc46a53a0aaab7e30', files });
  assert.match(remedy, /03dd22b181c8/);
  assert.match(remedy, /#6998/);
  assert.match(remedy, /deploy-my\.yml/);
  assert.match(remedy, /Re-issue the same change on current main/);
  assert.ok(remedy.length < 480, 'fits the dead-letter column');
});

test('recovery script routes every GitHub call through the bounded rate-limit retry and diagnoses stale bases', () => {
  const src = fs.readFileSync(new URL('../scripts/recover-release-provenance.mjs', import.meta.url), 'utf8');
  assert.match(src, /from '\.\/lib\/recovery-github-errors\.mjs'/);
  assert.match(src, /async function github\(path,options=\{\}\)\{\n  const first=await githubOnce\(path,options\);/);
  assert.match(src, /isIntegrationScopeRefusal\(ref\.response\.status,ref\.data\)/);
  assert.match(src, /compare\/\$\{headSha\}\.\.\.main/);
  // The exact-SHA rule is unchanged: no generic 403 bypass, mismatched branches still fail.
  assert.match(src, /existing recovery branch does not match the exact approved source SHA/);
  assert.doesNotMatch(src, /workflows:\s*write/);
});
