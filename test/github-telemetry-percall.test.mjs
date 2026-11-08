// Every nightly governor run from 2026-11-02 to 2026-11-08 failed the same way,
// and once the collector named its endpoint the cause was no longer a guess:
//
//   github telemetry unavailable: HTTP_500 (HTTP 500)
//     at api.github.com/repos/<repo>/actions/artifacts
//
// The paginated artifact walk is what 500s. That call's metric carries no free
// limit and evaluate-free-tier-resource-proof.mjs does not require it, while
// cache_storage_bytes has a real 10 GB limit and is required. An unlimited extra
// was dragging the limited essential down with it, so the platform could not
// read its own ceiling for a week over a number nothing compares against.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectAll, collectGitHub } from '../scripts/collect-free-tier-resource-usage.mjs';
import { evaluateMeasuredProof } from '../scripts/evaluate-free-tier-resource-proof.mjs';

const REPO = 'topmaster-joseph/ekodi-platform';

function httpError(status, endpoint) {
  const error = new Error(`HTTP_${status}`);
  error.status = status;
  error.endpoint = endpoint;
  return error;
}

// The failure exactly as production reports it.
function fetchWithArtifacts500(url) {
  if (url.includes('/actions/artifacts')) {
    throw httpError(500, `api.github.com/repos/${REPO}/actions/artifacts`);
  }
  if (url.endsWith('/actions/cache/usage')) return { active_caches_size_in_bytes: 1_234_567 };
  if (url.endsWith(`/repos/${REPO}`)) return { visibility: 'private', private: true };
  throw new Error(`UNEXPECTED_URL ${url}`);
}

test('the artifact walk failing no longer costs the metric that has a limit', async () => {
  const result = await collectGitHub({ repository: REPO, fetchJson: async url => fetchWithArtifacts500(url) });
  const cache = result.snapshots.find(row => row.metric === 'cache_storage_bytes');
  assert.ok(cache, 'cache_storage_bytes is the required metric and must survive');
  assert.equal(cache.observedValue, 1_234_567);
  assert.equal(cache.freeLimit, 10 * 1024 * 1024 * 1024);
  assert.equal(result.degraded, true);
  assert.match(result.callFailures[0].call, /artifacts page 1/);
  assert.match(result.callFailures[0].error, /actions\/artifacts/);
});

test('an incomplete walk reports no artifact number at all, not a floor', async () => {
  // A partial sum dropped into a series of totals reads as storage shrinking.
  // 2026-10-14 recorded 502,405,356 bytes complete; a partial would look like a
  // collapse that never happened.
  const result = await collectGitHub({ repository: REPO, fetchJson: async url => fetchWithArtifacts500(url) });
  assert.equal(result.snapshots.find(row => row.metric === 'artifact_storage_bytes'), undefined,
    'a gap that says it is a gap beats a number that lies');
});

test('a walk that completes still reports the artifact total as before', async () => {
  const result = await collectGitHub({
    repository: REPO,
    fetchJson: async url => {
      if (url.includes('/actions/artifacts')) {
        return { artifacts: [{ size_in_bytes: 400, expired: false }, { size_in_bytes: 100, expired: true }] };
      }
      if (url.endsWith('/actions/cache/usage')) return { active_caches_size_in_bytes: 7 };
      return { visibility: 'public', private: false };
    },
  });
  const artifacts = result.snapshots.find(row => row.metric === 'artifact_storage_bytes');
  assert.equal(artifacts.observedValue, 400, 'expired artifacts are still excluded');
  assert.equal(artifacts.source, 'github-rest-artifacts');
  assert.equal(result.degraded, false);
  assert.deepEqual(result.callFailures, []);
});

test('losing the cache call does not quietly fabricate a zero', async () => {
  // Reporting 0 bytes used would read as "plenty of headroom" — the opposite of
  // "we could not measure".
  const result = await collectGitHub({
    repository: REPO,
    fetchJson: async url => {
      if (url.endsWith('/actions/cache/usage')) throw httpError(503, 'api.github.com/actions/cache/usage');
      if (url.includes('/actions/artifacts')) return { artifacts: [] };
      return { visibility: 'private', private: true };
    },
  });
  assert.equal(result.snapshots.find(row => row.metric === 'cache_storage_bytes'), undefined);
  assert.match(result.callFailures[0].call, /cache usage/);
});

test('the governor lane goes green again, and for the right reason', async () => {
  // The proof step is what has been red since 2026-11-02. It requires the
  // Cloudflare workers metric, the Supabase active-projects metric and GitHub's
  // cache metric — not the artifact metric. With the artifact walk settled, a
  // run in which only that call fails now satisfies the proof.
  const observedAt = new Date().toISOString();
  const day = observedAt.slice(0, 10);
  const github = await collectGitHub({ repository: REPO, observedAt, fetchJson: async url => fetchWithArtifacts500(url) });
  const rows = [
    ...github.snapshots,
    { provider: 'cloudflare', metric: 'workers_requests_month', periodStart: day.slice(0, 7), observedValue: 18_954, freeLimit: 10_000_000, source: 'cloudflare-workers-analytics', observedAt },
    { provider: 'supabase', metric: 'active_projects', periodStart: day, observedValue: 0, freeLimit: 2, source: 'supabase-management-api', observedAt },
  ].map(row => ({
    provider: row.provider, metric: row.metric, period_start: row.periodStart,
    observed_value: row.observedValue, free_limit: row.freeLimit, source: row.source, observed_at: row.observedAt,
  }));
  const proof = evaluateMeasuredProof(rows);
  assert.ok(proof, 'the proof must now evaluate rather than assert');
});

test('the summary tells a degraded run apart from a failed one', async () => {
  const result = await collectAll(
    { GITHUB_REPOSITORY: REPO, GITHUB_TOKEN: 'token' },
    {
      loadCloudflare: async () => ({ available: true, reason: '', reportState: 'fresh', snapshots: [
        { provider: 'cloudflare', metric: 'workers_requests_month', periodStart: '2026-11', observedValue: 1, freeLimit: 10, source: 's', observedAt: '2026-11-08T00:00:00.000Z' },
      ] }),
      fetchJson: async url => fetchWithArtifacts500(url),
    },
  );
  // Not a provider outage: GitHub answered, in part.
  assert.deepEqual(result.failedProviders, [], 'a degraded provider is not a failed provider');
  assert.equal(result.degradedCalls.length, 1);
  assert.equal(result.degradedCalls[0].provider, 'github');
  assert.match(result.degradedCalls[0].error, /actions\/artifacts/);
  assert.ok(result.snapshots.some(row => row.metric === 'cache_storage_bytes'));
});

test('a provider that fails outright is still a failed provider', async () => {
  // The distinction only helps if it stays a distinction.
  const result = await collectAll(
    { GITHUB_REPOSITORY: REPO },
    {
      loadCloudflare: async () => { throw httpError(500, 'quota.report'); },
      fetchJson: async url => (url.includes('api.github.com') ? fetchWithArtifacts500(url) : []),
    },
  );
  assert.deepEqual(result.failedProviders.map(item => item.provider), ['cloudflare']);
  assert.equal(result.degradedCalls.filter(item => item.provider === 'github').length, 1);
});

test('each GitHub call is settled on its own, not wrapped in one try', () => {
  const source = fs.readFileSync(new URL('../scripts/collect-free-tier-resource-usage.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function collectGitHub'), source.indexOf('export function snapshotsToSql'));
  assert.ok(body.length > 200, 'the slice must actually cover collectGitHub');
  assert.match(body, /settleGitHubCall\('repository'/);
  assert.match(body, /settleGitHubCall\('cache usage'/);
  assert.match(body, /artifactWalkComplete=false/);
  // The regression shape: awaiting the three calls bare, so the first throw ends the function.
  assert.doesNotMatch(body, /const repo=await fetchJson\(/, 'the repository call must not be awaited bare again');
  assert.doesNotMatch(body, /const cache=await fetchJson\(/, 'the cache call must not be awaited bare again');
});
