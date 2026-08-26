import { isAllowedOrigin } from './auth-worker.js';
import { executeRegisteredExternalAiModule } from './external-ai-module-gateway.js';

const PREFIX = '/api/marketing/ai/v1';
const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CAPABILITIES = new Set([
  'content.generate','campaign.plan','audience.segment',
  'channel.optimize','analytics.report','publish.execute',
]);
const PLAN_ORDER = ['free','basic','flex','plus','pro','auto','enterprise'];
const SECRET_KEY_RE = /(password|secret|token|api.?key|authorization|cookie|credential|card|payment|billing|resident|rrn|passport)/i;

function cors(origin, env = {}) {
  const headers = {
    'access-control-allow-headers':'content-type, authorization',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-max-age':'86400', vary:'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(request.headers.get('origin'), env)},
  });
}

function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}
function safeJson(value, fallback) { try { return JSON.parse(value ?? ''); } catch { return fallback; } }
function normalizeSlug(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(text) ? text : '';
}
function normalizeStoreId(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text) ? text : '';
}
function normalizeCapability(value) {
  const text = String(value || '').trim().toLowerCase();
  return CAPABILITIES.has(text) ? text : '';
}
function clampText(value, max = 8000) { return String(value ?? '').slice(0, max); }

export function sanitizeMarketingAiInput(value, depth = 0) {
  if (depth > 6) return '[truncated]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return clampText(value);
  if (Array.isArray(value)) return value.slice(0, 60).map(item => sanitizeMarketingAiInput(item, depth + 1));
  if (!value || typeof value !== 'object') return clampText(value);
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    if (SECRET_KEY_RE.test(key)) continue;
    result[clampText(key, 80)] = sanitizeMarketingAiInput(item, depth + 1);
  }
  return result;
}

async function identityWithWorkspaces(request) {
  const token = bearerToken(request);
  if (!token || token.length > 8192) return null;
  const [userResponse, workspaceResponse] = await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${token}` } }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/current_site_workspaces`, {
      method:'POST',
      headers:{ apikey:SUPABASE_PUBLISHABLE_KEY, authorization:`Bearer ${token}`,'content-type':'application/json' },
      body:JSON.stringify({ p_site_key:'marketing' }),
    }),
  ]);
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const workspaces = workspaceResponse.ok ? await workspaceResponse.json() : [];
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { id:String(user.id), email, workspaces:Array.isArray(workspaces) ? workspaces : [] };
}

async function readBody(request) { try { return await request.json(); } catch { return null; } }
function requestScopeValues(request, body = {}) {
  const url = new URL(request.url);
  return {
    tenant:normalizeSlug(body.tenant || url.searchParams.get('tenant')),
    storeId:normalizeStoreId(body.storeId || url.searchParams.get('storeId')),
  };
}

async function resolveSubject(request, identity, body = {}) {
  const { tenant, storeId } = requestScopeValues(request, body);
  if (storeId) {
    const workspace = identity.workspaces.find(row =>
      String(row?.store_id || '').toLowerCase() === storeId
      && String(row?.workspace_key || '') === `store:${storeId}`);
    if (!workspace) return null;
    return {
      type:'store', key:storeId, tenantSlug:normalizeSlug(workspace.tenant),
      role:String(workspace.role || ''), basePlan:String(workspace.plan || '').toLowerCase(),
      spaceId:`store:${storeId}`,
    };
  }
  if (tenant) {
    const workspace = identity.workspaces.find(row => String(row?.tenant || '').toLowerCase() === tenant);
    if (!workspace) return null;
    return {
      type:'tenant', key:tenant, tenantSlug:tenant, role:String(workspace.role || ''),
      basePlan:String(workspace.plan || '').toLowerCase(), spaceId:`tenant:${tenant}`,
    };
  }
  return { type:'person', key:identity.id, tenantSlug:'', role:'member', basePlan:'free', spaceId:`person:${identity.id}` };
}

function effectivePlan(row, basePlan = 'free') {
  const plan = String(row?.plan_id || '').toLowerCase();
  const status = String(row?.status || '').toLowerCase();
  if (plan && ['active','free'].includes(status) && PLAN_ORDER.includes(plan)) return plan;
  const base = String(basePlan || '').toLowerCase();
  return PLAN_ORDER.includes(base) ? base : 'free';
}

async function subscriptionFor(env, subject) {
  if (subject.type === 'store') {
    if (subject.tenantSlug) {
      const row = await env.DB.prepare(`SELECT plan_id,status,current_period_start,current_period_end
        FROM service_subscriptions WHERE subject_type='tenant' AND subject_key=? AND site='marketing' LIMIT 1`)
        .bind(subject.tenantSlug).first();
      return { row, planId:effectivePlan(row, subject.basePlan) };
    }
    return { row:null, planId:effectivePlan(null, subject.basePlan) };
  }
  const row = await env.DB.prepare(`SELECT plan_id,status,current_period_start,current_period_end
    FROM service_subscriptions WHERE subject_type=? AND subject_key=? AND site='marketing' LIMIT 1`)
    .bind(subject.type, subject.key).first();
  return { row, planId:effectivePlan(row, subject.basePlan) };
}

async function subjectScopeFor(env, subject) {
  let row = await env.DB.prepare(`SELECT subject_scope FROM marketing_ai_subject_profiles
    WHERE subject_type=? AND subject_key=? LIMIT 1`).bind(subject.type, subject.key).first();
  if (!row && subject.type === 'store' && subject.tenantSlug) {
    row = await env.DB.prepare(`SELECT subject_scope FROM marketing_ai_subject_profiles
      WHERE subject_type='tenant' AND subject_key=? LIMIT 1`).bind(subject.tenantSlug).first();
  }
  if (row?.subject_scope) return String(row.subject_scope);
  return subject.type === 'person' ? 'individual' : 'organization';
}

async function entitlementFor(env, scope, planId) {
  const row = await env.DB.prepare(`SELECT * FROM marketing_ai_entitlement_policies
    WHERE subject_scope=? AND plan_id=? AND enabled=1 LIMIT 1`).bind(scope, planId).first();
  if (!row) return null;
  return {
    scope, planId,
    capabilities:safeJson(row.capabilities_json, []),
    providerSelector:safeJson(row.provider_selector_json, 'ekodi-default'),
    quota:{ period:row.quota_period || null, requests:Number(row.quota_requests ?? 0), units:Number(row.quota_units ?? 0) },
    rateLimit:{ requests:Number(row.rate_limit_requests ?? 0), windowSeconds:Number(row.rate_limit_window_seconds ?? 0) },
    features:safeJson(row.features_json, []), constraints:safeJson(row.constraints_json, {}),
  };
}

function quotaPeriodStart(period, subscription) {
  const now = new Date();
  if (period === 'day') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  if (period === 'billing-cycle' && subscription?.row?.current_period_start) return subscription.row.current_period_start;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function usageState(env, subject, entitlement, subscription) {
  const start = quotaPeriodStart(entitlement.quota.period, subscription);
  const totals = await env.DB.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(units),0) AS units
    FROM marketing_ai_usage_ledger WHERE subject_type=? AND subject_key=? AND created_at>=?
      AND status IN ('success','degraded')`).bind(subject.type, subject.key, start).first();
  const rateStart = new Date(Date.now() - Math.max(1, entitlement.rateLimit.windowSeconds) * 1000).toISOString();
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS requests FROM marketing_ai_usage_ledger
    WHERE subject_type=? AND subject_key=? AND created_at>=?`).bind(subject.type, subject.key, rateStart).first();
  return { periodStart:start, requests:Number(totals?.requests || 0), units:Number(totals?.units || 0), recentRequests:Number(recent?.requests || 0) };
}

function quotaAllowed(entitlement, usage) {
  if (entitlement.quota.requests > 0 && usage.requests >= entitlement.quota.requests) return false;
  if (entitlement.quota.units > 0 && usage.units >= entitlement.quota.units) return false;
  if (entitlement.rateLimit.requests > 0 && usage.recentRequests >= entitlement.rateLimit.requests) return false;
  return true;
}

function providerSupports(row, capability, entitlement, planId) {
  const caps = safeJson(row.capabilities_json, []);
  if (!caps.includes(capability)) return false;
  const policy = safeJson(row.data_policy_json, {});
  const constraints = entitlement.constraints || {};
  if (constraints.training_use_allowed === false && policy.training_use === true) return false;
  if (constraints.payload_persistence_allowed === false && policy.persists_payload === true) return false;
  if (constraints.sensitive_data_allowed === false && policy.sensitive_data_allowed === true) return false;
  const pricing = safeJson(row.pricing_model_json, {});
  if (['free','basic','flex'].includes(planId) && !['free','external-contract'].includes(String(pricing.type || 'free'))) return false;
  return true;
}

function selectorIds(selector) {
  if (Array.isArray(selector)) return selector.map(value => String(value || '').toLowerCase());
  const text = String(selector || '').toLowerCase();
  if (text.startsWith('provider:')) return [text.slice(9)];
  return [];
}

async function providerCandidates(env, capability, entitlement, planId) {
  const result = await env.DB.prepare(`SELECT * FROM marketing_ai_providers
    WHERE status='certified' AND enabled=1 ORDER BY priority ASC, provider_id ASC`).all();
  let rows = (result.results || []).filter(row => providerSupports(row, capability, entitlement, planId));
  const selector = entitlement.providerSelector;
  const ids = selectorIds(selector);
  if (ids.length) rows = ids.map(id => rows.find(row => row.provider_id === id)).filter(Boolean);
  else if (selector === 'ekodi-default') rows = rows.filter(row => Number(row.is_default) === 1);
  return rows;
}

async function approvalVerified(env, capability, body) {
  if (capability !== 'publish.execute') return true;
  const id = Number(body?.approvalActionId || 0);
  if (!Number.isInteger(id) || id < 1) return false;
  const row = await env.DB.prepare(`SELECT decision_tier,status,area,action_type FROM ai_agent_actions WHERE id=? LIMIT 1`).bind(id).first();
  if (!row || row.decision_tier !== 'human_gate' || row.status !== 'approved_pending_executor') return false;
  return /(marketing|campaign|publish|social|channel)/i.test(`${row.area || ''} ${row.action_type || ''}`);
}

function coreFallback(capability, input, reason = 'provider_unavailable') {
  return {
    mode:'core-only', capability, reason, inputAccepted:Boolean(input),
    nextActions:['Verify the goal and available data.','Prepare a human-reviewable next action.','Do not perform external execution before approval.'],
  };
}

async function recordUsage(env, data) {
  await env.DB.prepare(`INSERT OR REPLACE INTO marketing_ai_usage_ledger
    (request_id,subject_type,subject_key,subject_scope,plan_id,capability,provider_id,route_mode,funding_mode,status,units,selection_reason,error_code,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(data.requestId,data.subject.type,data.subject.key,data.scope,data.planId,data.capability,data.providerId || null,data.routeMode,
      data.fundingMode || 'none',data.status,Number(data.units || 0),data.reason || '',data.errorCode || '',new Date().toISOString()).run();
}

function fundingModeFor(row, planId) {
  if (!row || row.adapter_type === 'internal') return 'none';
  const pricing = safeJson(row.pricing_model_json, {});
  if (pricing.type === 'external-contract') return 'external-contract';
  return ['plus','pro','auto','enterprise'].includes(planId) ? 'ekodi-sponsored' : 'none';
}
function usageUnits(execution) {
  const value = Number(execution?.usage?.units ?? execution?.usage?.total_tokens ?? execution?.usage?.totalTokens ?? 1);
  return Number.isFinite(value) ? Math.max(0, Math.min(1000000, Math.ceil(value))) : 1;
}

async function executeProvider(env, row, context) {
  if (row.adapter_type === 'internal') {
    return { requestId:crypto.randomUUID(), output:coreFallback(context.capability,context.input,'ekodi_core'), usage:{ units:0 } };
  }
  return executeRegisteredExternalAiModule({
    env, moduleId:row.provider_id, capability:context.capability,
    context:{ spaceId:context.subject.spaceId, serviceId:'marketing-ai', actorId:context.identity.id, role:context.subject.role, capabilities:context.entitlement.capabilities },
    input:context.input,
  });
}

async function resolveContext(request, env, body = {}) {
  const identity = await identityWithWorkspaces(request);
  if (!identity) return { error:'EKODI login is required.', status:401 };
  const subject = await resolveSubject(request, identity, body);
  if (!subject) return { error:'You do not have access to this Marketing AI workspace.', status:403 };
  const subscription = await subscriptionFor(env, subject);
  const scope = await subjectScopeFor(env, subject);
  const entitlement = await entitlementFor(env, scope, subscription.planId);
  if (!entitlement) return { error:'No Marketing AI entitlement is configured for this membership plan.', status:403 };
  const usage = await usageState(env, subject, entitlement, subscription);
  return { identity, subject, subscription, scope, entitlement, usage };
}

async function me(request, env) {
  const ctx = await resolveContext(request, env, {});
  if (ctx.error) return json({ error:ctx.error }, ctx.status, request, env);
  return json({
    product:'에코디 마케팅AI',
    subject:{ type:ctx.subject.type,key:ctx.subject.key,scope:ctx.scope,spaceId:ctx.subject.spaceId },
    planId:ctx.subscription.planId, capabilities:ctx.entitlement.capabilities,
    quota:ctx.entitlement.quota, usage:ctx.usage, features:ctx.entitlement.features,
    providerSelector:ctx.entitlement.providerSelector,
  }, 200, request, env);
}

async function execute(request, env) {
  const body = await readBody(request);
  if (!body) return json({ error:'A JSON request body is required.' }, 400, request, env);
  const capability = normalizeCapability(body.capability);
  if (!capability) return json({ error:'Unsupported Marketing AI capability.' }, 400, request, env);
  const ctx = await resolveContext(request, env, body);
  if (ctx.error) return json({ error:ctx.error }, ctx.status, request, env);
  if (!ctx.entitlement.capabilities.includes(capability)) {
    return json({ error:'This capability is not available in the current membership plan.', code:'MARKETING_AI_ENTITLEMENT_REQUIRED' }, 403, request, env);
  }
  if (!quotaAllowed(ctx.entitlement, ctx.usage)) {
    return json({ error:'The current Marketing AI usage limit has been reached.', code:'MARKETING_AI_QUOTA_EXCEEDED', usage:ctx.usage, quota:ctx.entitlement.quota }, 429, request, env);
  }
  if (!(await approvalVerified(env, capability, body))) {
    return json({ error:'A verified human approval record is required for this action.', code:'MARKETING_AI_HUMAN_APPROVAL_REQUIRED' }, 403, request, env);
  }
  const input = sanitizeMarketingAiInput(body.input);
  const providers = await providerCandidates(env, capability, ctx.entitlement, ctx.subscription.planId);
  const failures = [];
  for (const provider of providers) {
    try {
      const execution = await executeProvider(env, provider, { capability, subject:ctx.subject, identity:ctx.identity, entitlement:ctx.entitlement, input });
      const units = usageUnits(execution);
      const degraded = provider.adapter_type === 'internal';
      await recordUsage(env, {
        requestId:execution.requestId, subject:ctx.subject, scope:ctx.scope, planId:ctx.subscription.planId, capability,
        providerId:provider.provider_id, routeMode:degraded?'core-only':'provider', fundingMode:fundingModeFor(provider, ctx.subscription.planId),
        status:degraded?'degraded':'success', units, reason:degraded?'ekodi-core-fallback':'certified-provider',
      });
      return json({ ok:true, product:'에코디 마케팅AI', requestId:execution.requestId, capability, provider:provider.provider_id, degraded, output:execution.output, usage:execution.usage || { units } }, 200, request, env);
    } catch (error) {
      failures.push({ provider:provider.provider_id, code:String(error?.message || 'PROVIDER_FAILED').split(':')[0] });
    }
  }
  if (capability !== 'publish.execute' && ctx.entitlement.features.includes('core-fallback')) {
    const requestId = crypto.randomUUID();
    const output = coreFallback(capability, input, failures.length ? 'providers_failed' : 'no_provider');
    await recordUsage(env, {
      requestId, subject:ctx.subject, scope:ctx.scope, planId:ctx.subscription.planId, capability,
      routeMode:'core-only', fundingMode:'none', status:'degraded', units:0,
      reason:failures.length?'all-providers-failed':'no-eligible-provider', errorCode:failures[0]?.code || '',
    });
    return json({ ok:true, product:'에코디 마케팅AI', requestId, capability, provider:null, degraded:true, output, failures }, 200, request, env);
  }
  const requestId = crypto.randomUUID();
  await recordUsage(env, {
    requestId, subject:ctx.subject, scope:ctx.scope, planId:ctx.subscription.planId, capability,
    routeMode:'core-only', status:'failed', reason:'no-provider-route', errorCode:failures[0]?.code || 'MARKETING_AI_PROVIDER_UNAVAILABLE',
  });
  return json({ error:'No eligible Marketing AI provider is currently available for this capability.', code:'MARKETING_AI_PROVIDER_UNAVAILABLE', failures }, 503, request, env);
}

export async function handleMarketingAiRuntime(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (!env.DB) return json({ error:'Database binding is not configured.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error:'Origin is not allowed.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin, env) });
  if (request.method === 'GET' && url.pathname === `${PREFIX}/health`) {
    const providers = await env.DB.prepare(`SELECT provider_id,status,enabled,adapter_type,priority FROM marketing_ai_providers ORDER BY priority,provider_id`).all();
    return json({ ok:true, product:'에코디 마케팅AI', contractVersion:'1.0', providers:providers.results || [], coreIndependent:true }, 200, request, env);
  }
  if (request.method === 'GET' && url.pathname === `${PREFIX}/me`) return me(request, env);
  if (request.method === 'POST' && url.pathname === `${PREFIX}/execute`) return execute(request, env);
  return json({ error:'Marketing AI endpoint not found', code:'MARKETING_AI_NOT_FOUND' }, 404, request, env);
}

export async function getMarketingAiAdminSnapshot(env = {}) {
  const [providers, entitlements, usage, stores, templates] = await Promise.all([
    env.DB.prepare(`SELECT provider_id,display_name,status,adapter_type,capabilities_json,pricing_model_json,data_policy_json,priority,is_default,enabled,updated_at FROM marketing_ai_providers ORDER BY priority,provider_id`).all(),
    env.DB.prepare(`SELECT subject_scope,plan_id,enabled,capabilities_json,provider_selector_json,quota_period,quota_requests,quota_units,features_json,updated_at FROM marketing_ai_entitlement_policies ORDER BY subject_scope,plan_id`).all(),
    env.DB.prepare(`SELECT provider_id,status,COUNT(*) AS requests,COALESCE(SUM(units),0) AS units FROM marketing_ai_usage_ledger WHERE created_at>=datetime('now','-30 days') GROUP BY provider_id,status`).all(),
    env.DB.prepare(`SELECT w.store_id,w.tenant_slug,w.canonical_domain,w.status,COALESCE(s.plan_id,'free') AS plan_id FROM marketing_store_workspaces w LEFT JOIN service_subscriptions s ON s.subject_type='tenant' AND s.subject_key=w.tenant_slug AND s.site='marketing' ORDER BY w.updated_at DESC`).all(),
    env.DB.prepare(`SELECT workspace_type,workspace_key,tenant_slug,store_id,template_key,updated_at FROM marketing_workspace_templates ORDER BY updated_at DESC`).all(),
  ]);
  const templateRows = templates.results || [];
  const storeRows = stores.results || [];
  const connections = [
    { id:'marketing-hub', name:'에코디 마케팅AI', domain:'marketing.ekodi.kr', consumerType:'shared-hub', connected:true },
    { id:'ekodibiz', name:'에코디비즈', domain:'biz.ekodi.kr', consumerType:'organization', connected:templateRows.some(row => row.workspace_type === 'tenant' && row.workspace_key === 'ekodibiz') },
    ...storeRows.map(row => ({ id:`store:${row.store_id}`, name:row.tenant_slug || row.store_id, domain:row.canonical_domain || '', consumerType:'store', connected:row.status === 'active', status:row.status, planId:row.plan_id || 'free' })),
  ];
  return {
    generatedAt:new Date().toISOString(), product:'에코디 마케팅AI',
    providers:(providers.results || []).map(row => ({ ...row, capabilities:safeJson(row.capabilities_json,[]), pricing:safeJson(row.pricing_model_json,{}), dataPolicy:safeJson(row.data_policy_json,{}) })),
    entitlements:(entitlements.results || []).map(row => ({ ...row, capabilities:safeJson(row.capabilities_json,[]), providerSelector:safeJson(row.provider_selector_json,'ekodi-default'), features:safeJson(row.features_json,[]) })),
    usage30d:usage.results || [], connections,
  };
}

export const MARKETING_AI_RUNTIME_CONTRACT = Object.freeze({
  version:'1.0', prefix:PREFIX, product:'에코디 마케팅AI',
  consumers:['individual','institution','organization'], vendorNeutral:true, coreSurvivesWithoutExternalProvider:true,
});
