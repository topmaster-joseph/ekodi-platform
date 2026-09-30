const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const STORE_MANAGER_ROLES = new Set(['store_owner','tenant_admin','platform_admin','hq_manager','client_admin','accounting_manager']);
const TENANT_MANAGER_ROLES = new Set(['tenant_admin','platform_admin','hq_manager','client_admin','accounting_manager']);
const CAMPAIGN_EVENT_TYPES = new Set(['campaign_view','campaign_click','campaign_conversion']);
const FOOD_EVENTS = new Set(['first_visit','order','repeat_order','coupon_redeemed','review','dormant','reactivated','message_opt_in','message_opt_out',...CAMPAIGN_EVENT_TYPES]);
const SERVICE_EVENTS = new Set(['inquiry','consultation','proposal','contract','onboarding','active','renewal','churn','follow_up','message_opt_in','message_opt_out',...CAMPAIGN_EVENT_TYPES]);
const GENERIC_EVENTS = new Set(['visit','conversion','follow_up','message_opt_in','message_opt_out',...CAMPAIGN_EVENT_TYPES]);
const CONSENT_SCOPES = new Set(['unknown','none','transactional','marketing']);
const CAMPAIGN_SEGMENTS = new Set([
  'all_marketing_opt_in','new','returning','loyal','dormant','reactivated',
  'inquiry','consultation','proposal','contract','onboarding','active','renewal','follow_up',
]);
const encoder = new TextEncoder();

function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}
function normalizeStoreId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : '';
}
function normalizeSlug(value, max = 80) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(text) ? text.slice(0, max) : '';
}
function normalizeChannel(value) { return normalizeSlug(value || 'unknown', 60) || 'unknown'; }
function normalizeSource(value) { return normalizeSlug(value || 'manual', 60) || 'manual'; }
function boundedText(value, max) { return String(value || '').trim().slice(0, max); }
function originAllowed(origin, env = {}) {
  if (!origin) return true;
  const configured = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
  if (configured.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (/^[a-z0-9-]+\.ai\.ekodi\.kr$/i.test(url.hostname) || url.hostname === 'business.ekodi.kr');
  } catch { return false; }
}
function cors(origin, allowed) {
  const headers = {
    'access-control-allow-headers':'content-type, authorization',
    'access-control-allow-methods':'GET, POST, OPTIONS',
    'access-control-max-age':'86400',
    vary:'Origin',
  };
  if (origin && allowed) headers['access-control-allow-origin'] = origin;
  return headers;
}
function json(data, status, request, allowed) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{ 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...cors(request.headers.get('origin'), allowed) },
  });
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
function normalizedCustomerRef(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '').slice(0, 320);
}

async function supabaseIdentity(request) {
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
  if (!userResponse.ok || !workspaceResponse.ok) return null;
  const [user, workspaces] = await Promise.all([userResponse.json(), workspaceResponse.json()]);
  const email = String(user?.email || '').trim().toLowerCase();
  if (!user?.id || !email || !user?.email_confirmed_at) return null;
  return { userId:user.id, email, workspaces:Array.isArray(workspaces) ? workspaces : [] };
}

async function templateFor(env, workspaceType, workspaceKey) {
  return env.DB.prepare(`SELECT workspace_type,workspace_key,tenant_slug,store_id,template_key,lifecycle_json,identity_salt
    FROM marketing_workspace_templates WHERE workspace_type=? AND workspace_key=? LIMIT 1`)
    .bind(workspaceType, workspaceKey).first();
}
async function resolveScope(request, env, { write = false } = {}) {
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await readJson(request) : null;
  const workspaceType = String(body?.workspaceType || url.searchParams.get('workspaceType') || '').trim().toLowerCase();
  let workspaceKey = String(body?.workspaceKey || url.searchParams.get('workspaceKey') || '').trim().toLowerCase();
  if (workspaceType === 'store') workspaceKey = normalizeStoreId(workspaceKey);
  if (workspaceType === 'tenant') workspaceKey = normalizeSlug(workspaceKey);
  if (!['store','tenant'].includes(workspaceType) || !workspaceKey) return { error:'유효한 Marketing workspace가 필요합니다.', status:400, body };

  const template = await templateFor(env, workspaceType, workspaceKey);
  if (!template) return { error:'이 workspace의 Marketing CRM 템플릿이 아직 활성화되지 않았습니다.', status:404, body };
  const identity = await supabaseIdentity(request);
  if (!identity) return { error:'EKODI 로그인과 Marketing workspace 권한이 필요합니다.', status:401, body };

  let access = null;
  if (workspaceType === 'store') {
    access = identity.workspaces.find(row => String(row?.store_id || '').toLowerCase() === workspaceKey && String(row?.workspace_key || '') === `store:${workspaceKey}`);
    if (!access || (write && !STORE_MANAGER_ROLES.has(String(access.role || '')))) return { error:'이 점포의 Marketing CRM을 관리할 권한이 없습니다.', status:403, body };
  } else {
    access = identity.workspaces.find(row => String(row?.tenant || '').toLowerCase() === workspaceKey && TENANT_MANAGER_ROLES.has(String(row?.role || '')));
    if (!access) return { error:'이 조직의 Marketing CRM을 관리할 권한이 없습니다.', status:403, body };
  }
  return { workspaceType, workspaceKey, template, identity, access, body };
}

function allowedEvents(templateKey) {
  if (templateKey === 'food_b2c') return FOOD_EVENTS;
  if (templateKey === 'service_b2b') return SERVICE_EVENTS;
  return GENERIC_EVENTS;
}
function lifecycle(template) {
  try { const value = JSON.parse(template?.lifecycle_json || '[]'); return Array.isArray(value) ? value.map(String) : []; } catch { return []; }
}
async function customerKey(template, customerRef) {
  const ref = normalizedCustomerRef(customerRef);
  if (!ref) return '';
  return sha256(`${String(template.identity_salt || '')}\0${ref}`);
}
function validOccurredAt(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  const now = Date.now();
  if (date.getTime() < Date.UTC(2020,0,1) || date.getTime() > now + 5 * 60 * 1000) return null;
  return date.toISOString();
}
function publicCampaign(row) {
  return {
    id:Number(row.id), name:String(row.name || ''), objective:String(row.objective || ''), audienceSegment:String(row.audience_segment || ''),
    channel:String(row.channel || ''), offerSummary:String(row.offer_summary || ''), status:String(row.status || ''),
    approvalActionId:row.approval_action_id ? Number(row.approval_action_id) : null,
    approvalStatus:String(row.approval_status || ''), scheduledAt:row.scheduled_at || null, startedAt:row.started_at || null,
    completedAt:row.completed_at || null, createdAt:row.created_at || null, updatedAt:row.updated_at || null,
  };
}

function deriveCrm(template, rows) {
  const templateKey = String(template?.template_key || 'generic');
  const customers = new Map();
  let anonymousEvents = 0;
  let totalValueKrw = 0;
  let lastEventAt = null;
  for (const row of rows) {
    totalValueKrw += Number(row.value_krw || 0);
    if (!lastEventAt || String(row.occurred_at) > lastEventAt) lastEventAt = row.occurred_at;
    if (!row.customer_key) { anonymousEvents += 1; continue; }
    if (!customers.has(row.customer_key)) customers.set(row.customer_key, []);
    customers.get(row.customer_key).push(row);
  }
  const segments = {};
  if (templateKey === 'food_b2c') {
    Object.assign(segments, { new:0, returning:0, loyal:0, dormant:0, reactivated:0 });
    for (const events of customers.values()) {
      events.sort((a,b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
      const latest = events.at(-1)?.event_type;
      const orderCount = events.filter(row => ['order','repeat_order'].includes(row.event_type)).length;
      if (latest === 'dormant') segments.dormant += 1;
      else if (events.some(row => row.event_type === 'reactivated')) segments.reactivated += 1;
      else if (orderCount >= 3) segments.loyal += 1;
      else if (orderCount >= 2) segments.returning += 1;
      else segments.new += 1;
    }
  } else if (templateKey === 'service_b2b') {
    for (const stage of lifecycle(template)) segments[stage] = 0;
    segments.other = 0;
    for (const events of customers.values()) {
      events.sort((a,b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
      const latestLifecycle = [...events].reverse().find(row => Object.hasOwn(segments, row.event_type));
      if (latestLifecycle) segments[latestLifecycle.event_type] += 1; else segments.other += 1;
    }
  } else {
    segments.known = customers.size;
  }
  return { customers:customers.size, events:rows.length, anonymousEvents, totalValueKrw, lastEventAt, segments };
}

async function ledgerOverview(request, env, allowed) {
  const scope = await resolveScope(request, env);
  if (scope.error) return json({ error:scope.error }, scope.status, request, allowed);
  const [campaignResult, eventResult] = await Promise.all([
    env.DB.prepare(`SELECT c.id,c.name,c.objective,c.audience_segment,c.channel,c.offer_summary,c.status,c.approval_action_id,
      c.scheduled_at,c.started_at,c.completed_at,c.created_at,c.updated_at,a.status AS approval_status
      FROM marketing_campaigns c LEFT JOIN ai_agent_actions a ON a.id=c.approval_action_id
      WHERE c.workspace_type=? AND c.workspace_key=? ORDER BY c.updated_at DESC LIMIT 100`)
      .bind(scope.workspaceType, scope.workspaceKey).all(),
    env.DB.prepare(`SELECT customer_key,event_type,channel,campaign_id,value_krw,quantity,consent_scope,source,occurred_at
      FROM marketing_events WHERE workspace_type=? AND workspace_key=? ORDER BY occurred_at DESC LIMIT 3000`)
      .bind(scope.workspaceType, scope.workspaceKey).all(),
  ]);
  const events = eventResult.results || [];
  const crm = deriveCrm(scope.template, events);
  const recentEvents = events.slice(0,50).map(row => ({
    eventType:row.event_type, channel:row.channel, campaignId:row.campaign_id ? Number(row.campaign_id) : null,
    valueKrw:Number(row.value_krw || 0), quantity:Number(row.quantity || 0), consentScope:row.consent_scope,
    source:row.source, occurredAt:row.occurred_at,
  }));
  return json({
    generatedAt:new Date().toISOString(),
    workspace:{ type:scope.workspaceType,key:scope.workspaceKey,tenantSlug:scope.template.tenant_slug,storeId:scope.template.store_id || null },
    template:{ key:scope.template.template_key,lifecycle:lifecycle(scope.template) },
    campaigns:(campaignResult.results || []).map(publicCampaign),
    crm,
    recentEvents,
    safety:{ customerPiiIncluded:false,customerKeysExposed:false,externalExecution:false,humanGateRequiredForCampaignReview:true },
  }, 200, request, allowed);
}

async function createEvent(request, env, allowed) {
  const scope = await resolveScope(request, env, { write:true });
  if (scope.error) return json({ error:scope.error }, scope.status, request, allowed);
  const body = scope.body || {};
  const eventType = normalizeSlug(body.eventType, 64);
  if (!eventType || !allowedEvents(scope.template.template_key).has(eventType)) return json({ error:'이 workspace 템플릿에서 허용되지 않은 이벤트입니다.' }, 400, request, allowed);
  const occurredAt = validOccurredAt(body.occurredAt);
  if (!occurredAt) return json({ error:'이벤트 시각이 유효하지 않습니다.' }, 400, request, allowed);
  const valueKrw = Math.max(0, Math.min(1000000000, Math.floor(Number(body.valueKrw || 0))));
  const quantity = Math.max(0, Math.min(100000, Math.floor(Number(body.quantity ?? 1))));
  const consentScope = CONSENT_SCOPES.has(String(body.consentScope || 'unknown')) ? String(body.consentScope || 'unknown') : 'unknown';
  const source = normalizeSource(body.source);
  const externalRef = boundedText(body.externalRef, 180) || null;
  const channel = normalizeChannel(body.channel);
  const campaignId = body.campaignId ? Math.max(1, Math.floor(Number(body.campaignId))) : null;
  if (campaignId) {
    const campaign = await env.DB.prepare('SELECT id FROM marketing_campaigns WHERE id=? AND workspace_type=? AND workspace_key=?')
      .bind(campaignId, scope.workspaceType, scope.workspaceKey).first();
    if (!campaign) return json({ error:'이 workspace의 캠페인을 찾을 수 없습니다.' }, 404, request, allowed);
  }
  const pseudonym = await customerKey(scope.template, body.customerRef);
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`INSERT INTO marketing_events
      (workspace_type,workspace_key,tenant_slug,store_id,customer_key,event_type,channel,campaign_id,value_krw,quantity,consent_scope,source,external_ref,metadata_json,occurred_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'{}',?,?)`)
      .bind(scope.workspaceType,scope.workspaceKey,scope.template.tenant_slug,scope.template.store_id || null,pseudonym,eventType,channel,campaignId,valueKrw,quantity,consentScope,source,externalRef,occurredAt,now).run();
    return json({ ok:true,event:{ id:Number(result.meta?.last_row_id || 0),eventType,occurredAt },safety:{ rawCustomerIdentityStored:false,externalExecution:false } }, 201, request, allowed);
  } catch (error) {
    if (externalRef && /UNIQUE constraint failed/i.test(String(error?.message || ''))) return json({ ok:true,deduplicated:true }, 200, request, allowed);
    throw error;
  }
}

async function createCampaign(request, env, allowed) {
  const scope = await resolveScope(request, env, { write:true });
  if (scope.error) return json({ error:scope.error }, scope.status, request, allowed);
  const body = scope.body || {};
  const name = boundedText(body.name, 120);
  const objective = boundedText(body.objective, 280);
  const audienceSegment = normalizeSlug(body.audienceSegment, 64);
  const channel = normalizeChannel(body.channel);
  const offerSummary = boundedText(body.offerSummary, 500);
  if (!name || !objective || !audienceSegment || !CAMPAIGN_SEGMENTS.has(audienceSegment)) {
    return json({ error:'캠페인 이름·목표·허용된 고객 세그먼트를 입력해 주세요.' }, 400, request, allowed);
  }
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO marketing_campaigns
    (workspace_type,workspace_key,tenant_slug,store_id,name,objective,audience_segment,channel,offer_summary,status,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?,?)`)
    .bind(scope.workspaceType,scope.workspaceKey,scope.template.tenant_slug,scope.template.store_id || null,name,objective,audienceSegment,channel,offerSummary,scope.identity.email,now,now).run();
  return json({ ok:true,campaign:{ id:Number(result.meta?.last_row_id || 0),name,status:'draft' },externalExecution:false }, 201, request, allowed);
}

async function requestCampaignReview(request, env, allowed, campaignId) {
  const scope = await resolveScope(request, env, { write:true });
  if (scope.error) return json({ error:scope.error }, scope.status, request, allowed);
  const id = Math.max(1, Math.floor(Number(campaignId)));
  const campaign = await env.DB.prepare(`SELECT id,name,objective,audience_segment,channel,offer_summary,status,approval_action_id
    FROM marketing_campaigns WHERE id=? AND workspace_type=? AND workspace_key=?`)
    .bind(id, scope.workspaceType, scope.workspaceKey).first();
  if (!campaign) return json({ error:'캠페인을 찾을 수 없습니다.' }, 404, request, allowed);
  if (campaign.approval_action_id) return json({ ok:true,campaignId:id,approvalActionId:Number(campaign.approval_action_id),status:campaign.status }, 200, request, allowed);
  if (campaign.status !== 'draft') return json({ error:'초안 상태의 캠페인만 검수 요청할 수 있습니다.' }, 409, request, allowed);
  const now = new Date().toISOString();
  const target = scope.workspaceType === 'store'
    ? String((await env.DB.prepare('SELECT canonical_domain FROM marketing_store_workspaces WHERE store_id=? LIMIT 1').bind(scope.workspaceKey).first())?.canonical_domain || `marketing.ekodi.kr/store/${scope.workspaceKey}`)
    : `marketing.ekodi.kr/tenant/${scope.workspaceKey}`;
  const payload = JSON.stringify({ campaignId:id,workspaceType:scope.workspaceType,workspaceKey:scope.workspaceKey,objective:campaign.objective,audienceSegment:campaign.audience_segment,channel:campaign.channel,offerSummary:campaign.offer_summary });
  const action = await env.DB.prepare(`INSERT INTO ai_agent_actions
    (agent_id,agent_name,action_type,area,target,rationale,payload_json,decision_tier,decision_reason,status,requested_by,created_at)
    VALUES ('marketing-campaign-ai','Marketing Campaign AI','campaign_publish','marketing',?,? ,?,'human_gate',?,'awaiting_human',?,?)`)
    .bind(target,'캠페인 외부 게시 또는 고객 접촉 전 사람의 명시적 검수가 필요합니다.',payload,'고객 접촉·게시·광고 실행은 Human Gate를 통과해야 합니다.',scope.identity.email,now).run();
  const actionId = Number(action.meta?.last_row_id || 0);
  await env.DB.prepare(`UPDATE marketing_campaigns SET status='review',approval_action_id=?,updated_at=? WHERE id=?`).bind(actionId,now,id).run();
  return json({ ok:true,campaignId:id,status:'review',approvalActionId:actionId,humanGate:'awaiting_human',externalExecution:false }, 202, request, allowed);
}

export async function handleMarketingLedgerControl(request, env) {
  if (!env.DB) return json({ error:'Marketing 원장 데이터베이스가 준비되지 않았습니다.' }, 503, request, false);
  const origin = request.headers.get('origin');
  const allowed = originAllowed(origin, env);
  if (origin && !allowed) return json({ error:'허용되지 않은 요청입니다.' }, 403, request, false);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin, allowed) });
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/marketing/ledger/overview') return ledgerOverview(request, env, allowed);
  if (request.method === 'POST' && path === '/api/marketing/ledger/events') return createEvent(request, env, allowed);
  if (request.method === 'POST' && path === '/api/marketing/ledger/campaigns') return createCampaign(request, env, allowed);
  const reviewMatch = path.match(/^\/api\/marketing\/ledger\/campaigns\/(\d+)\/review$/);
  if (request.method === 'POST' && reviewMatch) return requestCampaignReview(request, env, allowed, reviewMatch[1]);
  return null;
}
