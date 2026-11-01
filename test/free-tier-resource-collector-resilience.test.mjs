// The free-tier dashboard went dark from 2026-10-14: collectAll used Promise.all,
// so one provider's HTTP 500 rejected the whole collection, wrote no SQL, and left
// provider_quota_snapshots frozen for seventeen days. The daily lane failed every
// night with one line — `HTTP_500` — naming neither the provider nor the status.
//
// These tests pin the two properties that failure asked for: a provider that fails
// does not take the others' readings with it, and a failure says which provider
// and what status, so the next one is diagnosable from a single line.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectAll, describeCollectorError, snapshotsToSql } from '../scripts/collect-free-tier-resource-usage.mjs';

const CLOUDFLARE_OK = Object.freeze({
  available: true,
  reason: '',
  reportState: 'fresh',
  snapshots: [
    { provider: 'cloudflare', metric: 'workers_requests_month', periodStart: '2026-11', observedValue: 1_110_434, freeLimit: 10_000_000, source: 'cloudflare-workers-analytics', observedAt: '2026-11-01T00:00:00.000Z' },
  ],
});

function githubFetch(url) {
  if (url.endsWith('/repos/owner/repo')) return { full_name: 'owner/repo', private: false };
  if (url.endsWith('/actions/cache/usage')) return { active_caches_size_in_bytes: 0 };
  if (url.includes('/actions/artifacts')) return { total_count: 1, artifacts: [{ size_in_bytes: 1_000, expired: false }] };
  throw new Error(`UNEXPECTED_URL ${url}`);
}

function httpError(status) {
  const error = new Error(`HTTP_${status}`);
  error.status = status;
  return error;
}

test('a provider that fails does not discard the providers that answered', async () => {
  const env = { GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'token', SUPABASE_ACCESS_TOKEN: 'supabase-token' };
  const result = await collectAll(env, {
    loadCloudflare: async () => CLOUDFLARE_OK,
    // Supabase is the one having a bad day; GitHub answers normally.
    fetchJson: async url => {
      if (url.includes('api.supabase.com')) throw httpError(500);
      return githubFetch(url);
    },
  });

  assert.ok(result.snapshots.length > 0, 'the readings that arrived must survive');
  const providers = new Set(result.snapshots.map(row => row.provider));
  assert.ok(providers.has('cloudflare'), 'Cloudflare reading kept');
  assert.ok(providers.has('github'), 'GitHub reading kept');
  assert.equal(result.supabase.available, false);
  assert.equal(result.supabase.reason, 'collector_error');

  // And the SQL actually written carries them, since that file is what reaches D1.
  const sql = snapshotsToSql(result.snapshots);
  assert.match(sql, /provider_quota_snapshots/);
  assert.match(sql, /workers_requests_month/);
});

test('the failure names the provider and the status, not just HTTP_500', async () => {
  const env = { GITHUB_REPOSITORY: 'owner/repo', SUPABASE_ACCESS_TOKEN: 'supabase-token' };
  const result = await collectAll(env, {
    loadCloudflare: async () => CLOUDFLARE_OK,
    fetchJson: async url => {
      if (url.includes('api.supabase.com')) throw httpError(500);
      return githubFetch(url);
    },
  });
  assert.deepEqual(result.failedProviders.map(item => item.provider), ['supabase']);
  assert.match(result.failedProviders[0].error, /HTTP 500/, 'the status must be in the recorded detail');
  assert.match(result.supabase.error, /HTTP 500/);
  // `HTTP_500` alone is what left seventeen days undiagnosed.
  assert.equal(describeCollectorError(httpError(503)), 'HTTP_503 (HTTP 503)');
  assert.equal(describeCollectorError(new Error('ECONNRESET')), 'ECONNRESET');
  assert.equal(describeCollectorError(undefined), 'unknown', 'a thrown non-error must still describe');
});

test('each provider fails independently, in any combination', async () => {
  const env = { GITHUB_REPOSITORY: 'owner/repo', SUPABASE_ACCESS_TOKEN: 'supabase-token' };

  // GitHub down, Supabase and Cloudflare fine.
  const githubDown = await collectAll(env, {
    loadCloudflare: async () => CLOUDFLARE_OK,
    fetchJson: async url => {
      if (url.includes('api.github.com')) throw httpError(502);
      if (url.endsWith('/organizations')) return [];
      if (url.endsWith('/projects')) return [];
      return [];
    },
  });
  assert.deepEqual(githubDown.failedProviders.map(item => item.provider), ['github']);
  assert.ok(githubDown.snapshots.some(row => row.provider === 'cloudflare'));

  // Cloudflare's report missing, the rest fine.
  const cloudflareDown = await collectAll(env, {
    loadCloudflare: async () => { throw new Error('ENOENT: quota report missing'); },
    fetchJson: async url => (url.includes('api.supabase.com') ? [] : githubFetch(url)),
  });
  assert.deepEqual(cloudflareDown.failedProviders.map(item => item.provider), ['cloudflare']);
  assert.equal(cloudflareDown.cloudflare.reportState, 'unavailable');
  assert.ok(cloudflareDown.snapshots.some(row => row.provider === 'github'));
});

test('a total blackout collects nothing, and is not mistaken for a healthy run', async () => {
  const env = { GITHUB_REPOSITORY: 'owner/repo', SUPABASE_ACCESS_TOKEN: 'supabase-token' };
  const result = await collectAll(env, {
    loadCloudflare: async () => { throw httpError(500); },
    fetchJson: async () => { throw httpError(500); },
  });
  assert.equal(result.snapshots.length, 0);
  assert.deepEqual(result.failedProviders.map(item => item.provider).sort(), ['cloudflare', 'github', 'supabase']);
  // main() turns an empty collection into a thrown error rather than a green lane;
  // the shell's `grep -Fq provider_quota_snapshots` would also refuse the empty file.
  assert.equal(snapshotsToSql(result.snapshots), '');
});

test('a missing credential is still reported as missing, not as a collector failure', async () => {
  // The two are different problems and must not be blurred: one needs a secret,
  // the other needs a provider to come back up.
  const result = await collectAll({ GITHUB_REPOSITORY: 'owner/repo' }, {
    loadCloudflare: async () => CLOUDFLARE_OK,
    fetchJson: async url => githubFetch(url),
  });
  assert.equal(result.supabase.reason, 'credential_missing');
  assert.deepEqual(result.failedProviders, [], 'a missing credential is not a provider outage');
});

test('collectAll is settled per provider rather than all-or-nothing', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../scripts/collect-free-tier-resource-usage.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function collectAll'));
  assert.match(body, /settleProvider\('supabase'/);
  assert.match(body, /settleProvider\('github'/);
  assert.match(body, /settleProvider\('cloudflare'/);
  // The regression was Promise.all over raw provider promises; every element here
  // is already caught, so the combinator can no longer reject the collection.
  assert.doesNotMatch(body, /Promise\.all\(\[\s*supabasePromise/, 'raw provider promises must not be combined again');
});

test('a provider outage names the call, not just the provider', async () => {
  // The first real failure after the resilience fix reported:
  //   github telemetry unavailable :: HTTP_500 (HTTP 500)
  // which named the provider but left three candidate endpoints — one of them
  // paginating through every artifact in the repository. The endpoint is the
  // difference between knowing and guessing.
  const failed = new Error('HTTP_500');
  failed.status = 500;
  failed.endpoint = 'api.github.com/repos/owner/repo/actions/artifacts';
  assert.equal(
    describeCollectorError(failed),
    'HTTP_500 (HTTP 500) at api.github.com/repos/owner/repo/actions/artifacts',
  );

  const env = { GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'token' };
  const result = await collectAll(env, {
    loadCloudflare: async () => CLOUDFLARE_OK,
    fetchJson: async url => {
      if (url.includes('/actions/artifacts')) {
        const error = new Error('HTTP_500');
        error.status = 500;
        error.endpoint = new URL(url).host + new URL(url).pathname;
        throw error;
      }
      return githubFetch(url);
    },
  });
  assert.match(result.failedProviders[0].error, /actions\/artifacts/, 'the failing call must reach the annotation');
  assert.ok(result.snapshots.some(row => row.provider === 'cloudflare'), 'and the rest still survives');
});

test('the endpoint carries no query string, because it reaches a public annotation', () => {
  // A query can hold a page cursor or a token; the annotation is world-readable.
  const source = fs.readFileSync(new URL('../scripts/collect-free-tier-resource-usage.mjs', import.meta.url), 'utf8');
  assert.match(source, /error\.endpoint=`\$\{target\.host\}\$\{target\.pathname\}`/);
  assert.doesNotMatch(source, /error\.endpoint=.*target\.search/);

  const withQuery = new Error('HTTP_500');
  withQuery.status = 500;
  withQuery.endpoint = 'api.github.com/repos/owner/repo/actions/artifacts';
  assert.ok(!describeCollectorError(withQuery).includes('?'), 'no query may appear in the described error');
});
