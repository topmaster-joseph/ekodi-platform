#!/usr/bin/env node
import { appendFile } from 'node:fs/promises';
import { evaluateAccountProtection } from '../account-protection-policy.js';

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const API_BASE = 'https://api.cloudflare.com/client/v4';

function hasFlag(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function numericEnv(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

async function cloudflareJson(url, { token, method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Cloudflare returned non-JSON HTTP ${response.status}.`);
  }
  if (!response.ok || json?.success === false || (Array.isArray(json?.errors) && json.errors.length)) {
    const detail = Array.isArray(json?.errors) && json.errors.length
      ? json.errors.map(error => error?.message || error?.code).filter(Boolean).join('; ')
      : `HTTP ${response.status}`;
    throw new Error(`Cloudflare API request failed: ${detail}`);
  }
  return json;
}

async function queryUsage({ accountId, token }) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  const query = `query Usage($accountTag: string, $datetimeStart: string, $datetimeEnd: string) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd }) {
          dimensions { scriptName status }
          sum { requests subrequests errors }
        }
      }
    }
  }`;
  const json = await cloudflareJson(GRAPHQL_ENDPOINT, {
    token,
    method: 'POST',
    body: {
      query,
      variables: {
        accountTag: accountId,
        datetimeStart: start.toISOString(),
        datetimeEnd: end.toISOString()
      }
    }
  });
  const rows = json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
  const scripts = new Map();
  let requests = 0;
  let subrequests = 0;
  let errors = 0;
  for (const row of rows) {
    const rowRequests = Number(row?.sum?.requests || 0);
    const rowSubrequests = Number(row?.sum?.subrequests || 0);
    const rowErrors = Number(row?.sum?.errors || 0);
    requests += rowRequests;
    subrequests += rowSubrequests;
    errors += rowErrors;
    const name = String(row?.dimensions?.scriptName || 'unknown');
    const current = scripts.get(name) || { requests: 0, errors: 0 };
    current.requests += rowRequests;
    current.errors += rowErrors;
    scripts.set(name, current);
  }
  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    requests,
    subrequests,
    errors,
    scripts: [...scripts.entries()]
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.requests - a.requests)
  };
}

async function listWorkerScripts({ accountId, token }) {
  const json = await cloudflareJson(`${API_BASE}/accounts/${accountId}/workers/scripts`, { token });
  return Array.isArray(json?.result) ? json.result.map(item => String(item?.id || '')).filter(Boolean) : [];
}

async function getScriptSettings({ accountId, token, scriptName }) {
  const json = await cloudflareJson(`${API_BASE}/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/script-settings`, { token });
  return json?.result || {};
}

async function reduceScriptObservability({ accountId, token, scriptName, targetSampling }) {
  const settings = await getScriptSettings({ accountId, token, scriptName });
  const observability = settings?.observability;
  if (!observability?.enabled) return { scriptName, changed: false, reason: 'observability-disabled' };
  const currentSampling = Number.isFinite(Number(observability.head_sampling_rate))
    ? Number(observability.head_sampling_rate)
    : 1;
  if (currentSampling <= targetSampling) {
    return { scriptName, changed: false, reason: 'already-protected', currentSampling };
  }
  await cloudflareJson(`${API_BASE}/accounts/${accountId}/workers/scripts/${encodeURIComponent(scriptName)}/script-settings`, {
    token,
    method: 'PATCH',
    body: {
      observability: {
        enabled: true,
        head_sampling_rate: targetSampling
      }
    }
  });
  return { scriptName, changed: true, currentSampling, targetSampling };
}

async function applyObservabilityProtection({ accountId, token, state }) {
  if (state.mode === 'normal') return { attempted: 0, changed: 0, skipped: 0, failures: [] };
  const excludes = new Set(String(process.env.PROTECTION_OBSERVABILITY_EXCLUDE || '')
    .split(',').map(value => value.trim()).filter(Boolean));
  const scripts = await listWorkerScripts({ accountId, token });
  const result = { attempted: 0, changed: 0, skipped: 0, failures: [] };
  for (const scriptName of scripts) {
    if (excludes.has(scriptName)) {
      result.skipped += 1;
      continue;
    }
    result.attempted += 1;
    try {
      const change = await reduceScriptObservability({
        accountId,
        token,
        scriptName,
        targetSampling: state.actions.observabilitySampling
      });
      if (change.changed) result.changed += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failures.push({ scriptName, error: String(error?.message || error) });
    }
  }
  return result;
}

async function writeGithubMetadata({ accountLabel, state, usage, mutation }) {
  const output = [
    `mode=${state.mode}`,
    `percent=${state.percent}`,
    `requests=${state.requests}`,
    `budget=${state.budget}`,
    `remaining=${state.remaining}`,
    `observability_sampling=${state.actions.observabilitySampling}`,
    `development_deploy_allowed=${state.actions.allowDevelopmentDeploy}`
  ].join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `## Cloudflare ${accountLabel} 보호모드`,
      '',
      `- 상태: **${state.label} (${state.mode})**`,
      `- UTC 오늘 요청: **${state.requests.toLocaleString()} / ${state.budget.toLocaleString()} (${state.percent}%)**`,
      `- 잔여 예산: **${state.remaining.toLocaleString()}**`,
      `- 오류: **${usage.errors.toLocaleString()}**`,
      `- Observability 목표 샘플링: **${state.actions.observabilitySampling}**`,
      `- 개발 배포 허용: **${state.actions.allowDevelopmentDeploy ? '예' : '아니오'}**`,
      mutation ? `- 자동 조정: **${mutation.changed}/${mutation.attempted} Workers 변경**, 실패 ${mutation.failures.length}` : '- 자동 조정: 미실행',
      ''
    ];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
  }
}

async function main() {
  const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
  const token = requiredEnv('CLOUDFLARE_API_TOKEN');
  const budget = numericEnv('WORKERS_DAILY_REQUEST_BUDGET', 100_000);
  const accountLabel = argValue('--account-label', process.env.EKODI_ACCOUNT_LABEL || 'account');
  const apply = hasFlag('--apply-observability');
  const guardDevelopmentDeploy = hasFlag('--guard-development-deploy');
  const usage = await queryUsage({ accountId, token });
  const state = evaluateAccountProtection({ requests: usage.requests, budget });

  console.log(`[${accountLabel}] ${state.label}/${state.mode}: ${state.requests}/${state.budget} requests (${state.percent}%), remaining ${state.remaining}`);
  for (const script of usage.scripts.slice(0, 10)) {
    console.log(`  ${script.requests} requests | ${script.errors} errors | ${script.name}`);
  }

  let mutation = null;
  if (apply) {
    mutation = await applyObservabilityProtection({ accountId, token, state });
    console.log(`[${accountLabel}] observability protection: changed=${mutation.changed}, attempted=${mutation.attempted}, failures=${mutation.failures.length}`);
    for (const failure of mutation.failures) console.error(`::error::${failure.scriptName}: ${failure.error}`);
  }

  await writeGithubMetadata({ accountLabel, state, usage, mutation });

  if (apply && mutation?.failures?.length) {
    throw new Error(`Protection enforcement failed for ${mutation.failures.length} Worker script(s).`);
  }

  if (guardDevelopmentDeploy && !state.actions.allowDevelopmentDeploy) {
    if (String(process.env.EKODI_PROTECTION_DEPLOY_OVERRIDE || '') === '1') {
      console.warn(`::warning::Development deployment override accepted while ${state.mode} mode is active.`);
    } else {
      console.error(`::error::Development deployment blocked by ${state.label} mode at ${state.percent}% daily request usage.`);
      process.exitCode = 78;
    }
  }
}

main().catch(error => {
  console.error(`::error::Cloudflare account protection failed: ${error?.message || error}`);
  process.exitCode = 1;
});
