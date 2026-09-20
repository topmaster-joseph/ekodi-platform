import fs from 'node:fs/promises';
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  assertProductionAccountBoundary,
  classifyQuotaState
} from './cloudflare-quota-guard-lib.mjs';

const configPath = fileURLToPath(new URL('../config/cloudflare-production-quota-guard.json', import.meta.url));
const config = JSON.parse(await readFile(configPath, 'utf8'));
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : 'true'];
}));

const productionAccountId = String(process.env[config.productionAccountEnv] || '').trim();
const developmentAccountId = String(process.env[config.developmentAccountEnv] || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
assertProductionAccountBoundary({
  productionAccountId,
  developmentAccountId,
  knownDevelopmentAccountIds: config.knownDevelopmentAccountIds
});
if (!token) throw new Error('Missing CLOUDFLARE_API_TOKEN');

const end = new Date();
const start = new Date(end);
start.setUTCHours(0, 0, 0, 0);

const query = `query Usage($accountTag: string, $start: string, $end: string) {
  viewer {
    accounts(filter:{accountTag:$accountTag}) {
      workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:$start, datetime_leq:$end}) {
        sum { requests }
      }
    }
  }
}`;

const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    query,
    variables: {
      accountTag: productionAccountId,
      start: start.toISOString(),
      end: end.toISOString()
    }
  })
});
const payload = await response.json().catch(() => null);
if (!response.ok || payload?.errors?.length) {
  const detail = payload?.errors?.[0]?.message || `Cloudflare HTTP ${response.status}`;
  throw new Error(`Production quota Source of Truth unavailable: ${detail}`);
}

const rows = payload?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
const requests = rows.reduce((sum, row) => sum + Number(row?.sum?.requests || 0), 0);
const quota = classifyQuotaState({
  requests,
  limit: config.dailyRequestLimit,
  warningRatio: config.warningRatio,
  protectRatio: config.protectRatio
});
const report = {
  schemaVersion: 1,
  policyId: config.policyId,
  generatedAt: new Date().toISOString(),
  window: { start: start.toISOString(), end: end.toISOString() },
  account: 'PROD',
  accountIdMasked: `${productionAccountId.slice(0, 4)}...${productionAccountId.slice(-4)}`,
  ...quota
};

const output = args.get('output');
if (output) await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (process.env.GITHUB_OUTPUT) {
  const values = {
    requests: report.requests,
    limit: report.limit,
    percent: report.percent,
    state: report.state,
    remaining: report.remaining,
    skip_nonessential: String(report.skipNonessential)
  };
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', 'utf8');
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Cloudflare Production quota\n- Source: Cloudflare Workers Analytics\n- UTC window: ${report.window.start} → ${report.window.end}\n- Usage: **${report.requests.toLocaleString()} / ${report.limit.toLocaleString()} (${report.percent}%)**\n- State: **${report.state}**\n- Nonessential probes: **${report.skipNonessential ? 'blocked' : 'allowed'}**\n`,
    'utf8'
  );
}
console.log(JSON.stringify(report, null, 2));
