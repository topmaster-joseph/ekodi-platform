import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOUD_CONNECTION_POLICY } from '../cloud-connection-runtime.js';

const defaultOutput = fileURLToPath(new URL('../dist/', import.meta.url));
const DEFAULT_REPOSITORY = 'topmaster-joseph/ekodi-platform';

function clean(value, fallback = null) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function buildOpsHealthDocument(env = process.env, now = new Date()) {
  const repository = clean(env.GITHUB_REPOSITORY, DEFAULT_REPOSITORY);
  const commitSha = clean(env.GITHUB_SHA, 'local');
  const runId = clean(env.GITHUB_RUN_ID);
  const runAttempt = clean(env.GITHUB_RUN_ATTEMPT);
  const workflow = clean(env.GITHUB_WORKFLOW, 'local-build');
  const ref = clean(env.GITHUB_REF_NAME, clean(env.GITHUB_REF, 'local'));
  const githubBase = `https://github.com/${repository}`;

  return Object.freeze({
    schema_version: '1.0.0',
    service: 'ekodi',
    surface: 'public-operations-health',
    status: 'ok',
    generated_at: now.toISOString(),
    source: 'deployment-artifact',
    deploy: Object.freeze({
      repository,
      commit_sha: commitSha,
      ref,
      workflow,
      run_id: runId,
      run_attempt: runAttempt,
      commit_url: commitSha === 'local' ? null : `${githubBase}/commit/${commitSha}`,
      workflow_url: runId ? `${githubBase}/actions/runs/${runId}` : null,
    }),
    cloud_first: Object.freeze({
      policy_version: CLOUD_CONNECTION_POLICY.version,
      strategy: CLOUD_CONNECTION_POLICY.strategy,
      automatic_failover: CLOUD_CONNECTION_POLICY.automaticFailover,
      usage_aware_failover: CLOUD_CONNECTION_POLICY.usageAwareFailover,
      priority: [...CLOUD_CONNECTION_POLICY.priority],
      remote_desktop: Object.freeze({
        role: CLOUD_CONNECTION_POLICY.remoteDesktop.role,
        prefer_bundled_operations: CLOUD_CONNECTION_POLICY.remoteDesktop.preferBundledOperations,
        skip_when_quota_remaining_percent_at_or_below: CLOUD_CONNECTION_POLICY.remoteDesktop.skipWhenQuotaRemainingPercentAtOrBelow,
        quota_evasion_with_another_device_allowed: !CLOUD_CONNECTION_POLICY.remoteDesktop.doNotEvadeAccountQuotaWithAnotherDevice,
      }),
    }),
    exposure: Object.freeze({
      credentials: false,
      tokens: false,
      personal_data: false,
      internal_logs: false,
    }),
  });
}

export async function emitOpsHealthAsset(outputDir = defaultOutput, env = process.env, now = new Date()) {
  const opsDir = resolve(outputDir, 'ops');
  await mkdir(opsDir, { recursive: true });
  const document = buildOpsHealthDocument(env, now);
  await writeFile(resolve(opsDir, 'health.json'), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return document;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await emitOpsHealthAsset();
}
