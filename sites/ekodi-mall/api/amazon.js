import { authorizeVerificationOperations } from './verification.js';

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const flag = (value) => String(value || '').toLowerCase() === 'true';
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const id = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const SCOPE = 'ekodimall';

const SELLER_RESOURCES = Object.freeze([
  'catalog',
  'listings',
  'pricing',
  'inventory',
  'orders',
  'fulfillment',
  'reports'
]);

export const AMAZON_COST_LEVELS = Object.freeze([
  Object.freeze({ level:0, key:'free-only', label:'무료 전용', rule:'예상 유료비용이 있으면 실행 차단' }),
  Object.freeze({ level:1, key:'free-tier', label:'무료 한도', rule:'무료 한도 안에서만 실행' }),
  Object.freeze({ level:2, key:'credit', label:'크레딧', rule:'승인된 AWS 크레딧 범위 안에서만 실행' }),
  Object.freeze({ level:3, key:'micro-paid', label:'소액 유료', rule:'정책상 승인된 소액 한도에서만 실행' }),
  Object.freeze({ level:4, key:'monthly-paid', label:'월 유료', rule:'관리자 승인 필수' }),
  Object.freeze({ level:5, key:'persistent-paid', label:'지속 과금', rule:'최고관리자 승인 필수' })
]);

function configured(env) {
  return Boolean(
    clean(env?.AMAZON_SP_API_CLIENT_ID, 300) &&
    clean(env?.AMAZON_SP_API_CLIENT_SECRET, 300) &&
    clean(env?.AMAZON_SP_API_REFRESH_TOKEN, 1200)
  );
}

function awsConfigured(env) {
  return Boolean(
    clean(env?.AWS_REGION, 100) &&
    clean(env?.AWS_ACCESS_KEY_ID, 300) &&
    clean(env?.AWS_SECRET_ACCESS_KEY, 300)
  );
}

export async function amazonCostSchemaReady(env) {
  if (!env?.DB) return false;
  try {
    const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('amazon_cost_policy','amazon_usage_snapshots','amazon_cost_approvals')").all();
    return new Set((result.results || []).map((row) => row.name)).size === 3;
  } catch { return false; }
}

async function readCostPolicy(env) {
  const fallback = {
    scope:SCOPE,
    freeFirstEnabled:true,
    monthlyBudgetUsd:0,
    autoStopPercent:90,
    approvalThresholdUsd:0,
    paidAwsEnabled:false,
    sellerPaidPlanEnabled:false,
    fbaEnabled:false,
    bedrockPaidEnabled:false,
    updatedBy:'default',
    updatedAt:null
  };
  if (!env?.DB || !(await amazonCostSchemaReady(env))) return fallback;
  const row = await env.DB.prepare(`SELECT scope,free_first_enabled AS freeFirstEnabled,monthly_budget_usd AS monthlyBudgetUsd,
    auto_stop_percent AS autoStopPercent,approval_threshold_usd AS approvalThresholdUsd,paid_aws_enabled AS paidAwsEnabled,
    seller_paid_plan_enabled AS sellerPaidPlanEnabled,fba_enabled AS fbaEnabled,bedrock_paid_enabled AS bedrockPaidEnabled,
    updated_by AS updatedBy,updated_at AS updatedAt FROM amazon_cost_policy WHERE scope=?`).bind(SCOPE).first();
  if (!row) return fallback;
  for (const key of ['freeFirstEnabled','paidAwsEnabled','sellerPaidPlanEnabled','fbaEnabled','bedrockPaidEnabled']) row[key]=Boolean(row[key]);
  return row;
}

async function latestUsage(env) {
  if (!env?.DB || !(await amazonCostSchemaReady(env))) return [];
  const result = await env.DB.prepare(`SELECT service_key AS serviceKey,period_key AS periodKey,usage_value AS usageValue,
    usage_unit AS usageUnit,free_allowance_value AS freeAllowanceValue,free_remaining_percent AS freeRemainingPercent,
    estimated_cost_usd AS estimatedCostUsd,source,recorded_at AS recordedAt
    FROM amazon_usage_snapshots WHERE scope=?
    AND id IN (SELECT id FROM amazon_usage_snapshots u2 WHERE u2.scope=amazon_usage_snapshots.scope
      AND u2.service_key=amazon_usage_snapshots.service_key ORDER BY recorded_at DESC LIMIT 1)
    ORDER BY service_key`).bind(SCOPE).all();
  return result.results || [];
}

async function activeApproval(env, featureKey) {
  if (!env?.DB || !(await amazonCostSchemaReady(env))) return null;
  return env.DB.prepare(`SELECT id,feature_key AS featureKey,status,amount_limit_usd AS amountLimitUsd,approved_by AS approvedBy,
    reason,expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt
    FROM amazon_cost_approvals WHERE scope=? AND feature_key=? AND status='approved'
      AND (expires_at IS NULL OR expires_at>?)
    ORDER BY updated_at DESC LIMIT 1`).bind(SCOPE,clean(featureKey,120),nowIso()).first();
}

export async function evaluateAmazonCostPolicy(env, {
  featureKey='aws-generic',
  estimatedIncrementalCostUsd=0,
  freeRemainingPercent=null
} = {}) {
  const policy = await readCostPolicy(env);
  const estimated = num(estimatedIncrementalCostUsd);
  const freeRemaining = freeRemainingPercent === null ? null : Math.max(0,Math.min(100,num(freeRemainingPercent)));
  const approval = await activeApproval(env,featureKey);
  const explicitSwitch = featureKey==='seller-paid-plan' ? policy.sellerPaidPlanEnabled
    : featureKey==='fba' ? policy.fbaEnabled
    : featureKey==='bedrock-paid' ? policy.bedrockPaidEnabled
    : policy.paidAwsEnabled;

  if (policy.freeFirstEnabled && estimated <= 0) return { allowed:true, level:freeRemaining===null?0:1, reason:'free-path', policy, approval:null };
  if (policy.freeFirstEnabled && freeRemaining !== null && freeRemaining > (100-policy.autoStopPercent) && estimated <= policy.approvalThresholdUsd) {
    return { allowed:true, level:1, reason:'within-free-budget', policy, approval:null };
  }
  if (!explicitSwitch) return { allowed:false, level:4, reason:'paid-feature-disabled', policy, approval };
  if (!approval) return { allowed:false, level:4, reason:'approval-required', policy, approval:null };
  if (estimated > num(approval.amountLimitUsd)) return { allowed:false, level:5, reason:'approval-limit-exceeded', policy, approval };
  if (policy.monthlyBudgetUsd <= 0 && estimated > 0) return { allowed:false, level:5, reason:'monthly-budget-zero', policy, approval };
  return { allowed:true, level:estimated <= policy.approvalThresholdUsd ? 3 : 4, reason:'approved-paid-path', policy, approval };
}

export function amazonConnectorStatus(env = {}) {
  const seller = configured(env);
  const aws = awsConfigured(env);
  return {
    provider: 'amazon',
    mode: seller ? 'configured' : 'setup-required',
    sellerCentral: {
      configured: seller,
      marketplaceId: clean(env.AMAZON_MARKETPLACE_ID, 80) || null,
      endpoint: clean(env.AMAZON_SP_API_ENDPOINT, 300) || 'https://sellingpartnerapi-fe.amazon.com',
      resources: SELLER_RESOURCES
    },
    aws: {
      configured: aws,
      region: clean(env.AWS_REGION, 100) || null,
      optional: true
    },
    amazonPay: {
      configured: Boolean(clean(env.AMAZON_PAY_PUBLIC_KEY_ID, 300) && clean(env.AMAZON_PAY_PRIVATE_KEY, 2000)),
      optional: true
    },
    policy: {
      canonicalAdminPath: '/ekodimall/admin/amazon',
      sharedConnector: true,
      tenantScoped: true,
      secretsNeverReturned: true,
      freeFirstDefault: true,
      mutationsRequireExplicitCredentialSetup: true,
      paidFeaturesRequireApproval: true
    }
  };
}

async function costDashboard(env) {
  const policy = await readCostPolicy(env);
  const usage = await latestUsage(env);
  const estimatedMonthUsd = usage.reduce((sum,row)=>sum+num(row.estimatedCostUsd),0);
  const freeServices = usage.filter((row)=>num(row.estimatedCostUsd)===0).length;
  const warnings = [];
  if (estimatedMonthUsd > 0 && policy.monthlyBudgetUsd <= 0) warnings.push('paid-cost-detected-with-zero-budget');
  if (policy.monthlyBudgetUsd > 0 && estimatedMonthUsd >= policy.monthlyBudgetUsd*(policy.autoStopPercent/100)) warnings.push('budget-auto-stop-threshold');
  for (const row of usage) {
    if (row.freeRemainingPercent !== null && Number(row.freeRemainingPercent) <= (100-policy.autoStopPercent)) warnings.push(`free-tier-low:${row.serviceKey}`);
  }
  return { policy, usage, estimatedMonthUsd, freeServices, warnings, levels:AMAZON_COST_LEVELS };
}

async function updatePolicy(request, env, actor) {
  const body = await request.json().catch(()=>null);
  if (!body) return { status:400, body:{ error:'INVALID_JSON' } };
  const current = await readCostPolicy(env);
  const next = {
    freeFirstEnabled: body.freeFirstEnabled === undefined ? current.freeFirstEnabled : Boolean(body.freeFirstEnabled),
    monthlyBudgetUsd: num(body.monthlyBudgetUsd,current.monthlyBudgetUsd),
    autoStopPercent: Math.max(1,Math.min(100,Math.trunc(num(body.autoStopPercent,current.autoStopPercent)))),
    approvalThresholdUsd: num(body.approvalThresholdUsd,current.approvalThresholdUsd),
    paidAwsEnabled: body.paidAwsEnabled === undefined ? current.paidAwsEnabled : Boolean(body.paidAwsEnabled),
    sellerPaidPlanEnabled: body.sellerPaidPlanEnabled === undefined ? current.sellerPaidPlanEnabled : Boolean(body.sellerPaidPlanEnabled),
    fbaEnabled: body.fbaEnabled === undefined ? current.fbaEnabled : Boolean(body.fbaEnabled),
    bedrockPaidEnabled: body.bedrockPaidEnabled === undefined ? current.bedrockPaidEnabled : Boolean(body.bedrockPaidEnabled)
  };
  await env.DB.prepare(`INSERT INTO amazon_cost_policy
    (scope,free_first_enabled,monthly_budget_usd,auto_stop_percent,approval_threshold_usd,paid_aws_enabled,seller_paid_plan_enabled,fba_enabled,bedrock_paid_enabled,updated_by,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(scope) DO UPDATE SET free_first_enabled=excluded.free_first_enabled,monthly_budget_usd=excluded.monthly_budget_usd,
    auto_stop_percent=excluded.auto_stop_percent,approval_threshold_usd=excluded.approval_threshold_usd,
    paid_aws_enabled=excluded.paid_aws_enabled,seller_paid_plan_enabled=excluded.seller_paid_plan_enabled,fba_enabled=excluded.fba_enabled,
    bedrock_paid_enabled=excluded.bedrock_paid_enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(SCOPE,next.freeFirstEnabled?1:0,next.monthlyBudgetUsd,next.autoStopPercent,next.approvalThresholdUsd,next.paidAwsEnabled?1:0,
      next.sellerPaidPlanEnabled?1:0,next.fbaEnabled?1:0,next.bedrockPaidEnabled?1:0,clean(actor,160),nowIso()).run();
  return { status:200, body:{ policy:await readCostPolicy(env) } };
}

async function recordUsage(request, env, actor) {
  const body = await request.json().catch(()=>null);
  if (!body) return { status:400, body:{ error:'INVALID_JSON' } };
  const serviceKey = clean(body.serviceKey,120);
  const periodKey = clean(body.periodKey,40);
  if (!serviceKey || !periodKey) return { status:400, body:{ error:'serviceKey와 periodKey가 필요합니다.' } };
  const freeRemaining = body.freeRemainingPercent === null || body.freeRemainingPercent === undefined ? null : Math.max(0,Math.min(100,num(body.freeRemainingPercent)));
  await env.DB.prepare(`INSERT INTO amazon_usage_snapshots
    (id,scope,service_key,period_key,usage_value,usage_unit,free_allowance_value,free_remaining_percent,estimated_cost_usd,source,recorded_by,recorded_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id('aus'),SCOPE,serviceKey,periodKey,num(body.usageValue),clean(body.usageUnit,40),
      body.freeAllowanceValue===null||body.freeAllowanceValue===undefined?null:num(body.freeAllowanceValue),freeRemaining,
      num(body.estimatedCostUsd),clean(body.source||'normalized',80),clean(actor,160),nowIso()).run();
  return { status:201, body:await costDashboard(env) };
}

async function approveFeature(request, env, actor) {
  const body = await request.json().catch(()=>null);
  if (!body) return { status:400, body:{ error:'INVALID_JSON' } };
  const featureKey = clean(body.featureKey,120);
  if (!featureKey) return { status:400, body:{ error:'featureKey가 필요합니다.' } };
  await env.DB.prepare(`UPDATE amazon_cost_approvals SET status='revoked',updated_at=? WHERE scope=? AND feature_key=? AND status='approved'`)
    .bind(nowIso(),SCOPE,featureKey).run();
  const approvalId=id('aca'),now=nowIso();
  await env.DB.prepare(`INSERT INTO amazon_cost_approvals
    (id,scope,feature_key,status,amount_limit_usd,approved_by,reason,expires_at,created_at,updated_at)
    VALUES (?,? ,?,'approved',?,?,?,?,?,?)`)
    .bind(approvalId,SCOPE,featureKey,num(body.amountLimitUsd),clean(actor,160),clean(body.reason,1000),clean(body.expiresAt,80)||null,now,now).run();
  return { status:201, body:{ approval:await activeApproval(env,featureKey) } };
}

export async function handleAmazonRequest(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/amazon/')) return null;

  if (request.method === 'GET' && url.pathname === '/api/amazon/status') {
    return { status: 200, body: { ...amazonConnectorStatus(env), cost:await costDashboard(env) } };
  }

  if (request.method === 'GET' && url.pathname === '/api/amazon/capabilities') {
    return {
      status: 200,
      body: {
        provider: 'amazon',
        resources: SELLER_RESOURCES,
        syncDirections: ['ekodi-to-amazon','amazon-to-ekodi'],
        fulfillment: ['merchant','fba'],
        costLevels: AMAZON_COST_LEVELS,
        readiness: amazonConnectorStatus(env)
      }
    };
  }

  if (request.method === 'GET' && url.pathname === '/api/amazon/cost-policy') {
    return { status:200, body:await costDashboard(env) };
  }

  if (url.pathname === '/api/amazon/cost-policy' && request.method === 'PUT') {
    if (!env.DB || !(await amazonCostSchemaReady(env))) return { status:503, body:{ error:'AMAZON_COST_SCHEMA_NOT_READY' } };
    const auth=await authorizeVerificationOperations(request,env);
    if(!auth.ok)return { status:auth.status, body:{ error:auth.error } };
    return updatePolicy(request,env,auth.actor);
  }

  if (url.pathname === '/api/amazon/usage' && request.method === 'POST') {
    if (!env.DB || !(await amazonCostSchemaReady(env))) return { status:503, body:{ error:'AMAZON_COST_SCHEMA_NOT_READY' } };
    const auth=await authorizeVerificationOperations(request,env);
    if(!auth.ok)return { status:auth.status, body:{ error:auth.error } };
    return recordUsage(request,env,auth.actor);
  }

  if (url.pathname === '/api/amazon/approvals' && request.method === 'POST') {
    if (!env.DB || !(await amazonCostSchemaReady(env))) return { status:503, body:{ error:'AMAZON_COST_SCHEMA_NOT_READY' } };
    const auth=await authorizeVerificationOperations(request,env);
    if(!auth.ok)return { status:auth.status, body:{ error:auth.error } };
    return approveFeature(request,env,auth.actor);
  }

  if (request.method === 'POST' && url.pathname === '/api/amazon/sync') {
    if (!configured(env)) {
      return {
        status: 409,
        body: {
          error: 'AMAZON_SETUP_REQUIRED',
          message: 'Seller Central 자격정보를 먼저 등록해야 동기화를 실행할 수 있습니다.',
          adminPath: '/ekodimall/admin/amazon'
        }
      };
    }
    const estimate=num(request.headers.get('x-ekodi-estimated-cost-usd'));
    const decision=await evaluateAmazonCostPolicy(env,{ featureKey:'seller-sync', estimatedIncrementalCostUsd:estimate });
    if(!decision.allowed)return { status:402, body:{ error:'AMAZON_COST_POLICY_BLOCKED', reason:decision.reason, level:decision.level } };
    if (!flag(env.AMAZON_LIVE_SYNC_ENABLED)) {
      return {
        status: 501,
        body: {
          error: 'AMAZON_LIVE_SYNC_NOT_ENABLED',
          message: '자격정보와 비용정책은 준비되었지만 검증된 SP-API 실행 어댑터가 활성화된 뒤에만 운영 동기화를 실행합니다.'
        }
      };
    }
    return { status:501, body:{ error:'AMAZON_SP_API_EXECUTION_ADAPTER_PENDING' } };
  }

  return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
}
