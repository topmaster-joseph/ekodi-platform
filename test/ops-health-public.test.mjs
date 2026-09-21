import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOpsHealthDocument, emitOpsHealthAsset } from '../scripts/ops-health-build.mjs';
import { allowOpsHealthForTrainingCrawlers, OPS_HEALTH_PATH } from '../scripts/discovery-build.mjs';
import { DISCOVERY_CRAWLER_POLICY, renderRobotsTxt } from '../discovery-layer.js';

test('public health document exposes deployment evidence and Cloud First policy without secrets', () => {
  const document = buildOpsHealthDocument({
    GITHUB_REPOSITORY: 'topmaster-joseph/ekodi-platform',
    GITHUB_SHA: 'abc123',
    GITHUB_REF_NAME: 'main',
    GITHUB_WORKFLOW: 'Deploy EKODI Shared Site Core',
    GITHUB_RUN_ID: '98765',
    GITHUB_RUN_ATTEMPT: '2',
    CLOUDFLARE_API_TOKEN: 'do-not-leak-cloudflare',
    OPENAI_API_KEY: 'do-not-leak-openai',
  }, new Date('2026-09-16T00:00:00.000Z'));

  assert.equal(document.schema_version, '1.0.0');
  assert.equal(document.status, 'ok');
  assert.equal(document.deploy.commit_sha, 'abc123');
  assert.equal(document.deploy.workflow_url, 'https://github.com/topmaster-joseph/ekodi-platform/actions/runs/98765');
  assert.equal(document.cloud_first.strategy, 'cloud_first_provider_independent');
  assert.equal(document.cloud_first.automatic_failover, true);
  assert.equal(document.cloud_first.usage_aware_failover, true);
  assert.equal(document.cloud_first.remote_desktop.skip_when_quota_remaining_percent_at_or_below, 0);
  assert.equal(document.cloud_first.remote_desktop.quota_evasion_with_another_device_allowed, false);

  const serialized = JSON.stringify(document);
  assert.equal(serialized.includes('do-not-leak-cloudflare'), false);
  assert.equal(serialized.includes('do-not-leak-openai'), false);
  assert.deepEqual(document.exposure, {
    credentials: false,
    tokens: false,
    personal_data: false,
    internal_logs: false,
  });
});

test('public health artifact is emitted at the canonical ops path', async () => {
  const output = await mkdtemp(join(tmpdir(), 'ekodi-ops-health-'));
  try {
    await emitOpsHealthAsset(output, { GITHUB_SHA: 'feedbeef', GITHUB_REF_NAME: 'main' }, new Date('2026-09-16T01:00:00.000Z'));
    const parsed = JSON.parse(await readFile(join(output, 'ops', 'health.json'), 'utf8'));
    assert.equal(parsed.deploy.commit_sha, 'feedbeef');
    assert.equal(parsed.generated_at, '2026-09-16T01:00:00.000Z');
    assert.equal(parsed.source, 'deployment-artifact');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('public health static header replaces the inherited cache policy with no-store', async () => {
  const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');
  const block = headers.match(/^\/ops\/health\.json\n((?:[ \t].*(?:\n|$))*)/m);
  assert.ok(block, 'missing /ops/health.json header block');
  assert.match(block[1], /^\s+! Cache-Control$/m);
  assert.match(block[1], /^\s+Cache-Control: no-store$/m);
  assert.match(block[1], /^\s+Access-Control-Allow-Origin: \*$/m);
});

test('training crawlers get only the public health exception while user-requested agents retain public access', () => {
  const robots = allowOpsHealthForTrainingCrawlers(renderRobotsTxt());
  for (const crawler of DISCOVERY_CRAWLER_POLICY.training) {
    assert.ok(robots.includes(`User-agent: ${crawler}\nAllow: ${OPS_HEALTH_PATH}\nDisallow: /`));
  }
  for (const crawler of DISCOVERY_CRAWLER_POLICY.agent) {
    assert.ok(robots.includes(`User-agent: ${crawler}\nAllow: /`));
  }
  assert.ok(robots.includes('User-agent: ChatGPT-User\nAllow: /'));
  assert.equal(OPS_HEALTH_PATH, '/ops/health.json');
});
