import fs from 'node:fs';

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const ALLOWED_TARGETS = new Set(['ekodi-platform']);
const APPLY_CONFIRMATION = 'DISCONNECT_EKODI_PLATFORM_BUILDS';

export function validateRequest({ target, mode, confirm }) {
  if (!ALLOWED_TARGETS.has(target)) {
    throw new Error(`Target is not allowlisted: ${target || '(empty)'}`);
  }
  if (!['plan', 'apply'].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode || '(empty)'}`);
  }
  if (mode === 'apply' && confirm !== APPLY_CONFIRMATION) {
    throw new Error(`Apply requires exact confirmation: ${APPLY_CONFIRMATION}`);
  }
  return { target, mode };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { target: '', mode: 'plan', confirm: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--target') out.target = value || '';
    if (key === '--mode') out.mode = value || '';
    if (key === '--confirm') out.confirm = value || '';
    if (key.startsWith('--')) i += 1;
  }
  return out;
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function cfRequest({ accountId, token, path, method = 'GET' }) {
  const response = await fetch(`${API_ROOT}/accounts/${accountId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || body?.success === false) {
    const errors = Array.isArray(body?.errors)
      ? body.errors.map((item) => item?.message || item?.code).filter(Boolean).join('; ')
      : '';
    throw new Error(`Cloudflare API ${method} ${path} failed with HTTP ${response.status}${errors ? `: ${errors}` : ''}`);
  }
  return body;
}

function writeAudit({ target, mode, preCount, postCount, status, note }) {
  const audit = {
    schema: 'ekodi.cloud-control.audit.v1',
    operation: 'workers-builds-trigger-disconnect',
    target,
    mode,
    preCount,
    postCount,
    status,
    note,
    githubRunId: process.env.GITHUB_RUN_ID || null,
    githubSha: process.env.GITHUB_SHA || null,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync('cloud-control-audit.json', `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return audit;
}

export async function run({ target, mode, confirm }, env = process.env) {
  validateRequest({ target, mode, confirm });
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_BUILDS_ADMIN_TOKEN || '').trim();
  if (!accountId) throw new Error('Missing required environment variable: CLOUDFLARE_ACCOUNT_ID');
  if (!token) throw new Error('Missing required environment variable: CLOUDFLARE_BUILDS_ADMIN_TOKEN');

  const workers = await cfRequest({ accountId, token, path: '/workers/scripts' });
  const worker = (workers?.result || []).find((item) => item?.id === target);
  if (!worker?.tag) {
    const audit = writeAudit({ target, mode, preCount: 0, postCount: 0, status: 'noop', note: 'Worker not found; nothing changed.' });
    console.log(JSON.stringify(audit));
    return audit;
  }

  const triggersBefore = await cfRequest({
    accountId,
    token,
    path: `/builds/workers/${encodeURIComponent(worker.tag)}/triggers`,
  });
  const triggers = Array.isArray(triggersBefore?.result) ? triggersBefore.result : [];

  if (mode === 'plan') {
    const audit = writeAudit({
      target,
      mode,
      preCount: triggers.length,
      postCount: triggers.length,
      status: 'planned',
      note: triggers.length ? 'Disconnect is available; no mutation performed.' : 'No Workers Builds trigger is present.',
    });
    console.log(JSON.stringify(audit));
    return audit;
  }

  for (const trigger of triggers) {
    const triggerUuid = trigger?.trigger_uuid;
    if (!triggerUuid) throw new Error('Cloudflare returned a trigger without trigger_uuid; refusing mutation.');
    await cfRequest({
      accountId,
      token,
      path: `/builds/triggers/${encodeURIComponent(triggerUuid)}`,
      method: 'DELETE',
    });
  }

  const triggersAfter = await cfRequest({
    accountId,
    token,
    path: `/builds/workers/${encodeURIComponent(worker.tag)}/triggers`,
  });
  const remaining = Array.isArray(triggersAfter?.result) ? triggersAfter.result.length : 0;
  if (remaining !== 0) {
    throw new Error(`Post-condition failed: ${remaining} Workers Builds trigger(s) remain.`);
  }

  const audit = writeAudit({
    target,
    mode,
    preCount: triggers.length,
    postCount: remaining,
    status: triggers.length ? 'completed' : 'noop',
    note: triggers.length ? 'Workers Builds trigger(s) disconnected and absence verified.' : 'No trigger existed; nothing changed.',
  });
  console.log(JSON.stringify(audit));
  return audit;
}

async function main() {
  const request = parseArgs();
  await run(request);
}

if (process.argv[1]?.endsWith('cloud-control-workers-builds.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
