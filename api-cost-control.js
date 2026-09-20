import authWorker from './auth-worker.js';
import { apiCostPolicy, ensureApiUsageSchema, getSponsoredAiAllowance } from './api-usage-meter.js';
import { FREE_TIER_THRESHOLDS, FREE_TIER_RETRY_STOP_SIGNALS } from './free-tier-quota-guard.js';
import { buildFreeTierResourceGovernor, FREE_TIER_RESOURCE_CATALOG } from './free-tier-resource-governor.js';

const PATH = '/api/control/api-cost';
const REFERENCE_DATE = '2026-09-20';

function json(data, status = 200, sourceHeaders = new Headers()) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  for (const name of ['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-max-age', 'vary']) {
    const value = sourceHeaders.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

function dollars(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1_000_000) / 1_000_000 : 0;
}

async function cloudflareTraffic(db) {
  try {
    const [latest, state] = await Promise.all([
      db.prepare(`SELECT day, requests, bandwidth_bytes, cached_requests, cached_bytes, unique_visitors, threats, collected_at
        FROM system_usage_daily WHERE source='cloudflare' ORDER BY day DESC LIMIT 1`).first(),
      db.prepare(`SELECT status, last_attempt_at, last_success_at, message
        FROM system_usage_state WHERE source='cloudflare' LIMIT 1`).first(),
    ]);
    return {
      available: Boolean(latest),
      latest: latest ? {
        day: latest.day,
        requests: Number(latest.requests || 0),
        bandwidthBytes: Number(latest.bandwidth_bytes || 0),
        cachedRequests: Number(latest.cached_requests || 0),
        cachedBytes: Number(latest.cached_bytes || 0),
        uniqueVisitors: latest.unique_visitors == null ? null : Number(latest.unique_visitors),
        threats: Number(latest.threats || 0),
        collectedAt: latest.collected_at || null,
      } : null,
      state: state || null,
    };
  } catch {
    return { available: false, latest: null, state: null };
  }
}

async function aiSeries(db) {
  const result = await db.prepare(`SELECT substr(created_at,1,10) day,
      COUNT(*) calls,
      COALESCE(SUM(input_tokens),0) input_tokens,
      COALESCE(SUM(cached_input_tokens),0) cached_input_tokens,
      COALESCE(SUM(output_tokens),0) output_tokens,
      COALESCE(SUM(estimated_cost_microusd),0) cost
    FROM api_usage_events
    WHERE funding='ekodi-sponsored' AND created_at >= datetime('now','-30 day')
    GROUP BY substr(created_at,1,10)
    ORDER BY day ASC`).all();
  return (result.results || []).map(row => ({
    day: row.day,
    calls: Number(row.calls || 0),
    inputTokens: Number(row.input_tokens || 0),
    cachedInputTokens: Number(row.cached_input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    estimatedCostUsd: dollars(Number(row.cost || 0) / 1_000_000),
  }));
}

async function resourceQuotaLedger(db) {
  try {
    const [snapshotRows,stateRows]=await Promise.all([
      db.prepare(`SELECT provider,metric,period_start,observed_value,free_limit,usage_percent,source,observed_at
        FROM provider_quota_snapshots ORDER BY observed_at DESC LIMIT 500`).all(),
      db.prepare(`SELECT provider,state,highest_usage_percent,last_error_code,circuit_open,source,observed_at
        FROM provider_quota_state ORDER BY observed_at DESC`).all(),
    ]);
    return { available:true, snapshots:snapshotRows.results||[], states:stateRows.results||[] };
  } catch {
    return { available:false, snapshots:[], states:[] };
  }
}

function providerResource(governor,id){
  return governor?.providers?.[id]||null;
}

function providerCards(allowance, traffic, env, governor) {
  const policy = apiCostPolicy(env);
  const openAi = {
    id: 'openai',
    name: 'OpenAI · EKODI AI Gateway',
    connection: 'metered',
    status: allowance.status,
    comparisonEligible: true,
    usage: {
      dailyCalls: allowance.dailyCalls,
      monthlyCalls: allowance.monthlyCalls,
      monthlyCostUsd: dollars(allowance.monthlyCostUsd),
      inputTokens: allowance.monthlyTokens?.input || 0,
      cachedInputTokens: allowance.monthlyTokens?.cachedInput || 0,
      outputTokens: allowance.monthlyTokens?.output || 0,
      percent: allowance.percent,
    },
    limit: {
      dailyCalls: policy.dailyMaxCalls,
      monthlyCalls: policy.monthlyMaxCalls,
      monthlyBudgetUsd: policy.monthlyBudgetUsd,
    },
    note: allowance.allowed
      ? '실제 provider 응답 usage를 EKODI D1에 집계합니다.'
      : '유료 AI 한도에 도달해 EKODI Core/fallback으로 전환됩니다.',
  };

  const workers = {
    id: 'cloudflare-workers',
    name: 'Cloudflare Workers',
    connection: traffic.available ? 'partial' : 'needs-connection',
    status: traffic.state?.status === 'error' ? 'warning' : traffic.available ? 'stable' : 'unknown',
    comparisonEligible: false,
    usage: traffic.latest ? { zoneRequests: traffic.latest.requests, day: traffic.latest.day, collectedAt: traffic.latest.collectedAt } : null,
    limit: { freeRequestsPerDay: 100_000 },
    note: traffic.available
      ? '현재 값은 Zone Analytics 운영 추세이며 Workers 과금 지표와 동일하지 않아 한도 비율 계산에는 사용하지 않습니다.'
      : 'Cloudflare Analytics 집계 연결이 필요합니다.',
    resourceGovernor: providerResource(governor,'cloudflare'),
  };

  return [
    openAi,
    workers,
    {
      id: 'cloudflare-d1', name: 'Cloudflare D1', connection: 'needs-connection', status: 'unknown', comparisonEligible: false,
      usage: null, limit: { readsPerDay: 5_000_000, writesPerDay: 100_000, storageGb: 5 },
      note: 'D1은 quota ledger에 실제 측정값이 들어온 경우에만 사용률을 계산합니다.',
      resourceGovernor: providerResource(governor,'cloudflare'),
    },
    {
      id: 'cloudflare-kv', name: 'Cloudflare KV', connection: 'needs-connection', status: 'unknown', comparisonEligible: false,
      usage: null, limit: { readsPerDay: 100_000, writesPerDay: 1_000, deletesPerDay: 1_000, listsPerDay: 1_000, storageGb: 1 },
      note: 'KV write는 무료 한도가 작으므로 heartbeat/log 원장으로 사용하지 않습니다.',
      resourceGovernor: providerResource(governor,'cloudflare'),
    },
    {
      id: 'cloudflare-r2', name: 'Cloudflare R2 Standard', connection: 'needs-connection', status: 'unknown', comparisonEligible: false,
      usage: null, limit: { storageGbMonth: 10, classAMonth: 1_000_000, classBMonth: 10_000_000, egress: 'free' },
      note: 'R2는 임시·배포·고속 객체용이며 장기 공식 자료는 Google Workspace Shared Drive가 기준입니다.',
      resourceGovernor: providerResource(governor,'cloudflare'),
    },
    {
      id: 'google-drive', name: 'Google Drive / Workspace API', connection: 'needs-connection', status: 'unknown', comparisonEligible: false,
      usage: null, limit: null,
      note: '실제 Google Cloud quota/billing 수집 연결 전까지 임의 사용량을 표시하지 않습니다.',
    },
    {
      id: 'supabase', name: 'Supabase Free', connection: providerResource(governor,'supabase')?.telemetryStatus || 'needs-connection',
      status: providerResource(governor,'supabase')?.state || 'unknown', comparisonEligible: false,
      usage: providerResource(governor,'supabase')?.metrics || null,
      limit: FREE_TIER_RESOURCE_CATALOG.supabase,
      resourceGovernor: providerResource(governor,'supabase'),
      note: '조직/프로젝트 실제 측정값만 사용합니다. 프로젝트 수 한도는 기존 서비스 차단이 아니라 신규 프로젝트 생성만 막습니다.',
    },
    {
      id: 'github-actions', name: 'GitHub Actions', connection: 'policy-known', status: providerResource(governor,'github')?.state || 'normal', comparisonEligible: false,
      usage: providerResource(governor,'github')?.metrics || null,
      limit: FREE_TIER_RESOURCE_CATALOG.github,
      resourceGovernor: providerResource(governor,'github'),
      note: '현재 저장소는 public 기준으로 표준 GitHub-hosted runner 실행시간을 비용 병목으로 보지 않고 중복 실행·artifact/cache 저장량을 우선 최적화합니다.',
    },
  ];
}

export async function handleApiCostControl(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;
  if (request.method !== 'GET') return json({ error: 'GET 요청만 지원합니다.', code: 'METHOD_NOT_ALLOWED' }, 405);

  const auth = await sessionCheck(request, env);
  if (!auth.session?.authenticated) return auth.response;
  if (!env.DB?.prepare) return json({ error: 'API 비용 계측 D1이 연결되지 않았습니다.', code: 'API_COST_DB_REQUIRED' }, 503, auth.response.headers);

  try {
    await ensureApiUsageSchema(env.DB);
    const [allowance, traffic, series, quotaLedger] = await Promise.all([
      getSponsoredAiAllowance(env),
      cloudflareTraffic(env.DB),
      aiSeries(env.DB),
      resourceQuotaLedger(env.DB),
    ]);
    const resourceGovernor=buildFreeTierResourceGovernor({
      snapshots:quotaLedger.snapshots,
      states:quotaLedger.states,
    });
    const providers = providerCards(allowance, traffic, env, resourceGovernor);
    return json({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      referenceDate: REFERENCE_DATE,
      thresholds: allowance.policy.thresholds,
      freeTierProtection: {
        policyId: 'EKODI-FREE-TIER-001',
        thresholds: FREE_TIER_THRESHOLDS,
        retryStopSignals: FREE_TIER_RETRY_STOP_SIGNALS,
        automaticPaidUpgrade: false,
        sourceOfTruthRequired: true,
      },
      sponsoredAi: allowance,
      resourceGovernor: { ...resourceGovernor, ledgerAvailable: quotaLedger.available, catalog: FREE_TIER_RESOURCE_CATALOG },
      providers,
      series,
      policy: {
        providerIndependent: true,
        coreProtected: true,
        hardCapScope: 'ekodi-sponsored-ai-only',
        secretsExposed: false,
        unknownUsageLabel: '연결 필요',
      },
    }, 200, auth.response.headers);
  } catch (error) {
    console.error('API cost control error', error);
    return json({ error: 'API 비용 정보를 읽지 못했습니다.', code: 'API_COST_READ_ERROR' }, 500, auth.response.headers);
  }
}
