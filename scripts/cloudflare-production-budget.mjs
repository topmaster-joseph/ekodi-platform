import fs from 'node:fs/promises';
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  assertProductionAccountBoundary,
  classifyQuotaState,
  detectWorkersPaidPlan,
  cloudflareUsageWindow
} from './cloudflare-quota-guard-lib.mjs';
import { buildAdaptiveInfrastructureDecision } from '../adaptive-resource-orchestrator.js';

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

async function cloudflareJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? {'content-type':'application/json'} : {}),
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    const error = new Error(`Cloudflare HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function detectWorkersPlan() {
  try {
    const payload = await cloudflareJson(
      `https://api.cloudflare.com/client/v4/accounts/${productionAccountId}/subscriptions`
    );
    const subscriptions = Array.isArray(payload?.result) ? payload.result : [];
    return {
      paid: detectWorkersPaidPlan(subscriptions),
      readable: true,
      source: 'cloudflare-billing-api'
    };
  } catch (error) {
    const ownerConfirmed = String(config.planDetection?.ownerConfirmedWorkersPlan || '').toLowerCase() === 'paid';
    if (ownerConfirmed) {
      return {
        paid: true,
        readable: false,
        source: 'owner-confirmed-config'
      };
    }
    return {
      paid: false,
      readable: false,
      source: 'billing-api-unavailable-free-safe'
    };
  }
}

async function graphql(query, variables) {
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.errors?.length) {
    const detail = payload?.errors?.[0]?.message || `Cloudflare HTTP ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return payload;
}

const plan = await detectWorkersPlan();
const window = cloudflareUsageWindow({ paid: plan.paid, now: new Date() });
const workersLimit = plan.paid
  ? Number(config.paidPlan?.workersRequestsIncludedPerMonth || 10_000_000)
  : Number(config.dailyRequestLimit || config.freePlan?.workersRequestsPerDay || 100_000);

const workersQuery = `query Usage($accountTag: string, $start: string, $end: string) {
  viewer {
    accounts(filter:{accountTag:$accountTag}) {
      workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:$start, datetime_leq:$end}) {
        sum { requests }
      }
    }
  }
}`;

const workersPayload = await graphql(workersQuery, {
  accountTag: productionAccountId,
  start: window.start,
  end: window.end
});
const workerRows = workersPayload?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
const requests = workerRows.reduce((sum, row) => sum + Number(row?.sum?.requests || 0), 0);
const quota = classifyQuotaState({
  requests,
  limit: workersLimit,
  warningRatio: config.warningRatio,
  protectRatio: config.protectRatio
});

let d1 = {
  available: false,
  periodKind: window.periodKind,
  rowsRead: null,
  rowsWritten: null,
  readLimit: plan.paid
    ? Number(config.paidPlan?.d1RowsReadIncludedPerMonth || 25_000_000_000)
    : Number(config.freePlan?.d1RowsReadPerDay || 5_000_000),
  writeLimit: plan.paid
    ? Number(config.paidPlan?.d1RowsWrittenIncludedPerMonth || 50_000_000)
    : Number(config.freePlan?.d1RowsWrittenPerDay || 100_000),
  source: 'cloudflare-d1-analytics'
};

try {
  const d1Query = `query D1Usage($accountTag: string, $startDate: Date, $endDate: Date) {
    viewer {
      accounts(filter:{accountTag:$accountTag}) {
        d1AnalyticsAdaptiveGroups(
          limit:10000
          filter:{date_geq:$startDate, date_leq:$endDate}
        ) {
          sum { rowsRead rowsWritten }
        }
      }
    }
  }`;
  const d1Payload = await graphql(d1Query, {
    accountTag: productionAccountId,
    startDate: window.startDate,
    endDate: window.endDate
  });
  const rows = d1Payload?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || [];
  const rowsRead = rows.reduce((sum, row) => sum + Number(row?.sum?.rowsRead || 0), 0);
  const rowsWritten = rows.reduce((sum, row) => sum + Number(row?.sum?.rowsWritten || 0), 0);
  const readQuota = classifyQuotaState({
    requests: rowsRead,
    limit: d1.readLimit,
    warningRatio: config.warningRatio,
    protectRatio: config.protectRatio
  });
  const writeQuota = classifyQuotaState({
    requests: rowsWritten,
    limit: d1.writeLimit,
    warningRatio: config.warningRatio,
    protectRatio: config.protectRatio
  });
  d1 = {
    ...d1,
    available: true,
    rowsRead,
    rowsWritten,
    readQuota,
    writeQuota
  };
} catch (error) {
  d1 = {
    ...d1,
    error: String(error?.message || error).slice(0, 240)
  };
}

const adaptiveMetrics = [
  {
    provider:'cloudflare',
    metric:plan.paid ? 'workers_requests_month' : 'workers_requests_daily',
    usagePercent:quota.percent,
    measured:true,
    stale:false,
    scope:'consumption',
    periodStart:window.periodKind==='month' ? window.start.slice(0,7) : window.start.slice(0,10)
  },
  ...(d1.available ? [
    {
      provider:'cloudflare',
      metric:plan.paid ? 'd1_rows_read_month' : 'd1_rows_read_daily',
      usagePercent:d1.readQuota?.percent,
      measured:true,
      stale:false,
      scope:'consumption',
      periodStart:window.periodKind==='month' ? window.start.slice(0,7) : window.start.slice(0,10)
    },
    {
      provider:'cloudflare',
      metric:plan.paid ? 'd1_rows_written_month' : 'd1_rows_written_daily',
      usagePercent:d1.writeQuota?.percent,
      measured:true,
      stale:false,
      scope:'consumption',
      periodStart:window.periodKind==='month' ? window.start.slice(0,7) : window.start.slice(0,10)
    }
  ] : [])
];
const adaptive = buildAdaptiveInfrastructureDecision({
  metrics: adaptiveMetrics,
  now: Date.parse(window.end)
});
const skipNonessential = Boolean(
  quota.skipNonessential ||
  d1.readQuota?.skipNonessential ||
  d1.writeQuota?.skipNonessential ||
  adaptive.blockNonessential
);
const report = {
  schemaVersion: 2,
  policyId: config.policyId,
  generatedAt: new Date().toISOString(),
  window: { start: window.start, end: window.end },
  periodKind: window.periodKind,
  plan: {
    workers: plan.paid ? 'paid' : (plan.readable ? 'free' : 'free_or_unverified'),
    verified: plan.readable,
    source: plan.source,
    automaticPurchase: false
  },
  account: 'PROD',
  accountIdMasked: `${productionAccountId.slice(0, 4)}...${productionAccountId.slice(-4)}`,
  ...quota,
  skipNonessential,
  adaptive,
  d1
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
    skip_nonessential: String(report.skipNonessential),
    plan_mode: report.plan.workers,
    period_kind: report.periodKind,
    d1_rows_read: report.d1.rowsRead ?? '',
    d1_rows_written: report.d1.rowsWritten ?? '',
    adaptive_mode: report.adaptive.mode,
    adaptive_burn_rate: report.adaptive.highestBurnRate ?? '',
    adaptive_cache_profile: report.adaptive.cacheProfile,
    adaptive_background_mode: report.adaptive.backgroundMode
  };
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
    'utf8'
  );
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const d1Summary = report.d1.available
    ? `- D1 rows read: **${report.d1.rowsRead.toLocaleString()} / ${report.d1.readLimit.toLocaleString()}**\n- D1 rows written: **${report.d1.rowsWritten.toLocaleString()} / ${report.d1.writeLimit.toLocaleString()}**\n`
    : `- D1 telemetry: **unavailable (runtime remains free-safe)**\n`;
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `### Cloudflare Production quota\n- Workers plan: **${report.plan.workers}** (${report.plan.source})\n- Window: **${report.periodKind}** · ${report.window.start} → ${report.window.end}\n- Worker requests: **${report.requests.toLocaleString()} / ${report.limit.toLocaleString()} (${report.percent}%)**\n${d1Summary}- State: **${report.state}**\n- Adaptive mode: **${report.adaptive.mode}** · burn rate **${report.adaptive.highestBurnRate ?? 'n/a'}** · cache **${report.adaptive.cacheProfile}**\n- Nonessential work: **${report.skipNonessential ? 'blocked' : 'allowed'}**\n`,
    'utf8'
  );
}
console.log(JSON.stringify(report, null, 2));
