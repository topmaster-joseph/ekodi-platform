import fs from 'node:fs';

const API = 'https://api.cloudflare.com/client/v4';
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const project = String(process.env.CF_PROJECT || 'ekodi-mall').trim();
const expectedOwner = String(process.env.EKODI_MALL_LEGACY_GIT_OWNER || 'topmaster-joseph').trim();
const expectedRepo = String(process.env.EKODI_MALL_LEGACY_GIT_REPO || 'ekodi-mall').trim();

function requireValue(value, name) {
  if (!value) throw new Error(`${name}_REQUIRED`);
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok || body?.success === false) {
    const errors = Array.isArray(body?.errors) ? body.errors.map(x => x?.message || x?.code).filter(Boolean).join('; ') : '';
    throw new Error(`CLOUDFLARE_PAGES_API_FAILED status=${response.status}${errors ? ` errors=${errors}` : ''}`);
  }
  return body?.result ?? body;
}

function editableSource(source) {
  const config = source?.config || {};
  const allowed = [
    'owner',
    'owner_id',
    'repo_name',
    'repo_id',
    'production_branch',
    'preview_branch_includes',
    'preview_branch_excludes',
    'path_includes',
    'path_excludes'
  ];
  const next = {};
  for (const key of allowed) {
    if (config[key] !== undefined && config[key] !== null) next[key] = config[key];
  }
  next.production_deployments_enabled = false;
  next.preview_deployment_setting = 'none';
  next.pr_comments_enabled = false;
  return { type: source.type, config: next };
}

function summaryLine(message) {
  console.log(message);
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) {
    fs.appendFileSync(file, `${message}\n`);
  }
}

requireValue(accountId, 'CLOUDFLARE_ACCOUNT_ID');
requireValue(token, 'CLOUDFLARE_API_TOKEN');
requireValue(project, 'CF_PROJECT');

const path = `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}`;
const before = await cloudflare(path);
const source = before?.source || null;

if (!source) {
  summaryLine('- Mall Pages Git auto-deploy guard: no Git source is attached; canonical direct-upload CI remains sole owner.');
  process.exit(0);
}

if (source.type !== 'github') {
  throw new Error(`UNEXPECTED_PAGES_SOURCE_TYPE expected=github actual=${String(source.type || 'unknown')}`);
}

const owner = String(source.config?.owner || '');
const repo = String(source.config?.repo_name || '');
if (owner !== expectedOwner || repo !== expectedRepo) {
  throw new Error(`UNEXPECTED_PAGES_GIT_SOURCE expected=${expectedOwner}/${expectedRepo} actual=${owner || '?'}/${repo || '?'}`);
}

const alreadyDisabled =
  source.config?.production_deployments_enabled === false &&
  source.config?.preview_deployment_setting === 'none';

if (!alreadyDisabled) {
  await cloudflare(path, {
    method: 'PATCH',
    body: JSON.stringify({ source: editableSource(source) })
  });
}

const after = await cloudflare(path);
const finalSource = after?.source || null;
if (!finalSource) {
  summaryLine('- Mall Pages Git auto-deploy guard: Git source was detached; canonical direct-upload CI remains sole owner.');
  process.exit(0);
}

if (
  finalSource.type !== 'github' ||
  String(finalSource.config?.owner || '') !== expectedOwner ||
  String(finalSource.config?.repo_name || '') !== expectedRepo
) {
  throw new Error('PAGES_SOURCE_CHANGED_DURING_GUARD');
}

if (finalSource.config?.production_deployments_enabled !== false) {
  throw new Error('PAGES_PRODUCTION_GIT_AUTODEPLOY_STILL_ENABLED');
}
if (finalSource.config?.preview_deployment_setting !== 'none') {
  throw new Error('PAGES_PREVIEW_GIT_AUTODEPLOY_STILL_ENABLED');
}

summaryLine(`- Mall Pages Git auto-deploy guard: disabled for ${expectedOwner}/${expectedRepo}; production remains owned by ekodi-platform direct-upload CI.`);
