import fs from 'node:fs/promises';
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isQuotaCircuitBreak } from './cloudflare-quota-guard-lib.mjs';

const configPath = fileURLToPath(new URL('../config/cloudflare-production-quota-guard.json', import.meta.url));
const config = JSON.parse(await readFile(configPath, 'utf8'));
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : 'true'];
}));
const scope = args.get('scope') || 'full';
const quotaState = String(process.env.EKODI_CF_QUOTA_STATE || 'unknown').toLowerCase();
const skipNonessential = ['protect', 'exhausted', 'unknown'].includes(quotaState);
const checks = scope === 'admin-monitor'
  ? (skipNonessential ? [] : config.canary.essential.filter(check => check.id === 'admin'))
  : [...config.canary.essential, ...(skipNonessential ? [] : config.canary.nonessential)];

const report = {
  schemaVersion: 1,
  policyId: config.policyId,
  generatedAt: new Date().toISOString(),
  scope,
  quotaState,
  skipNonessential,
  circuitOpen: false,
  skipped: checks.length === 0,
  checks: []
};

for (const check of checks) {
  const started = performance.now();
  let response;
  let body = '';
  try {
    response = await fetch(check.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: {
        'user-agent': scope === 'admin-monitor'
          ? 'EKODI-quota-aware-monitor/1.0'
          : 'EKODI-post-deploy-canary/1.0',
        'cache-control': 'no-cache'
      }
    });
    body = await response.text();
  } catch (error) {
    report.checks.push({
      id: check.id,
      url: check.url,
      ok: false,
      status: null,
      durationMs: Math.round(performance.now() - started),
      error: String(error?.message || error)
    });
    break;
  }

  const circuitBreak = isQuotaCircuitBreak({
    status: response.status,
    body,
    config: config.circuitBreaker
  });
  if (circuitBreak) {
    report.circuitOpen = true;
    report.checks.push({
      id: check.id,
      url: check.url,
      ok: false,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      circuitBreak: true
    });
    break;
  }

  const headerOk = !check.header
    || String(response.headers.get(check.header.name) || '').toLowerCase().includes(String(check.header.contains || '').toLowerCase());
  const textOk = !check.text || body.includes(check.text);
  const ok = response.status === check.status && headerOk && textOk;
  report.checks.push({
    id: check.id,
    url: check.url,
    ok,
    status: response.status,
    durationMs: Math.round(performance.now() - started),
    headerOk,
    textOk
  });
  if (!ok) break;
}

report.ok = report.skipped || (!report.circuitOpen && report.checks.length === checks.length && report.checks.every(check => check.ok));
const output = args.get('output');
if (output) await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT,
    `ok=${report.ok}\ncircuit_open=${report.circuitOpen}\nskipped=${report.skipped}\n`,
    'utf8'
  );
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = report.checks.length
    ? report.checks.map(item => `| ${item.id} | ${item.status ?? 'network'} | ${item.ok ? 'PASS' : item.circuitBreak ? 'CIRCUIT OPEN' : 'FAIL'} |`).join('\n')
    : '| none | - | quota protection skipped scheduled endpoint probes |';
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Quota-aware production canary\n- Quota state: **${quotaState}**\n- Nonessential probes: **${skipNonessential ? 'blocked' : 'enabled'}**\n- Circuit: **${report.circuitOpen ? 'open' : 'closed'}**\n\n| Check | HTTP | Result |\n|---|---:|---|\n${rows}\n`,
    'utf8'
  );
}
console.log(JSON.stringify(report, null, 2));
if (report.circuitOpen) process.exit(2);
if (!report.ok) process.exit(1);
