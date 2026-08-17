import authWorker, { isAllowedOrigin } from './auth-worker.js';

const PAID_PLANS = new Set(['plus','pro','auto','enterprise']);
const MARKETING_ACTION_RE = /(marketing|campaign|social|channel|crm|review|advert|promotion)/i;
const MARKETING_TARGET_RE = /(marketing\.ekodi\.kr|\.ai\.ekodi\.kr|jadam|pizzamaru|yogurt|cgma)/i;

function cors(origin, env = {}) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && isAllowedOrigin(origin, env)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(request.headers.get('origin'), env),
    },
  });
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return null;
  return response.json();
}

function publicWorkspace(row) {
  return {
    id:Number(row.id),
    storeId:String(row.store_id || ''),
    tenantSlug:String(row.tenant_slug || ''),
    slug:String(row.workspace_slug || ''),
    canonicalDomain:String(row.canonical_domain || ''),
    canonicalUrl:row.canonical_domain ? `https://${row.canonical_domain}${row.landing_path && row.landing_path !== '/' ? row.landing_path : ''}` : null,
    status:String(row.status || 'unknown'),
    planId:String(row.plan_id || 'free'),
    subscriptionStatus:String(row.subscription_status || 'free'),
    monthlyFee:Number(row.monthly_fee || 0),
    cancelAtPeriodEnd:Boolean(row.cancel_at_period_end),
    currentPeriodEnd:row.current_period_end || null,
    updatedAt:row.updated_at || null,
  };
}

function customerKey(row) {
  return `${String(row.subject_type || '')}:${String(row.subject_key || '')}`;
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function safeMarketingTarget(value) {
  const target = String(value || '').trim().slice(0, 240);
  return MARKETING_TARGET_RE.test(target) ? target : '';
}

function publicAiAction(row) {
  return {
    id:Number(row.id),
    agentId:String(row.agent_id || ''),
    agentName:String(row.agent_name || ''),
    actionType:String(row.action_type || ''),
    area:String(row.area || ''),
    target:safeMarketingTarget(row.target),
    decisionTier:String(row.decision_tier || ''),
    status:String(row.status || ''),
    createdAt:row.created_at || null,
    decidedAt:row.decided_at || null,
    verifiedAt:row.verified_at || null,
  };
}

function isMarketingAction(row) {
  const scope = [row.area,row.action_type,row.agent_id,row.agent_name].map(value => String(value || '')).join(' ');
  return MARKETING_ACTION_RE.test(scope) || MARKETING_TARGET_RE.test(String(row.target || ''));
}

function readChannelRegistry(row) {
  const registry = safeJson(row?.registry_json, { organizations:[] });
  const organizations = Array.isArray(registry.organizations) ? registry.organizations : [];
  const result = [];
  for (const org of organizations) {
    if (org?.isActive === false) continue;
    const channels = Array.isArray(org?.channels) ? org.channels : [];
    for (const channel of channels) {
      if (channel?.isActive === false) continue;
      result.push({
        organizationId:String(org?.id || ''),
        organizationName:String(org?.name || org?.shortName || ''),
        website:String(org?.website || ''),
        channelId:String(channel?.id || ''),
        provider:String(channel?.provider || 'other'),
        label:String(channel?.label || channel?.provider || 'Channel'),
        handle:String(channel?.handle || ''),
        url:String(channel?.url || ''),
        description:String(channel?.description || '').slice(0, 240),
      });
    }
  }
  return {
    revision:Number(row?.revision || 0),
    updatedAt:row?.updated_at || null,
    channels:result,
  };
}

function lifecycle(row) {
  const value = safeJson(row?.lifecycle_json, []);
  return Array.isArray(value) ? value.map(String) : [];
}

function templateKey(row) { return `${row.workspace_type}:${row.workspace_key}`; }
function publicCampaign(row) {
  return {
    id:Number(row.id),
    workspaceType:String(row.workspace_type || ''),
    workspaceKey:String(row.workspace_key || ''),
    tenantSlug:String(row.tenant_slug || ''),
    storeId:row.store_id || null,
    name:String(row.name || ''),
    objective:String(row.objective || ''),
    audienceSegment:String(row.audience_segment || ''),
    channel:String(row.channel || ''),
    offerSummary:String(row.offer_summary || ''),
    status:String(row.status || ''),
    approvalActionId:row.approval_action_id ? Number(row.approval_action_id) : null,
    approvalStatus:String(row.approval_status || ''),
    scheduledAt:row.scheduled_at || null,
    startedAt:row.started_at || null,
    completedAt:row.completed_at || null,
    createdAt:row.created_at || null,
    updatedAt:row.updated_at || null,
  };
}

function crmAggregate(template, rows) {
  const customers = new Map();
  let anonymousEvents = 0;
  let totalValueKrw = 0;
  let lastEventAt = null;
  for (const row of rows) {
    totalValueKrw += Number(row.value_krw || 0);
    if (!lastEventAt || String(row.occurred_at || '') > lastEventAt) lastEventAt = row.occurred_at || null;
    if (!row.customer_key) { anonymousEvents += 1; continue; }
    if (!customers.has(row.customer_key)) customers.set(row.customer_key, []);
    customers.get(row.customer_key).push(row);
  }

  const segments = {};
  if (template.template_key === 'food_b2c') {
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
  } else if (template.template_key === 'service_b2b') {
    for (const stage of lifecycle(template)) segments[stage] = 0;
    segments.other = 0;
    for (const events of customers.values()) {
      events.sort((a,b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
      const latest = [...events].reverse().find(row => Object.hasOwn(segments, row.event_type));
      if (latest) segments[latest.event_type] += 1; else segments.other += 1;
    }
  } else {
    segments.known = customers.size;
  }

  return {
    workspaceType:template.workspace_type,
    workspaceKey:template.workspace_key,
    tenantSlug:template.tenant_slug,
    storeId:template.store_id || null,
    templateKey:template.template_key,
    lifecycle:lifecycle(template),
    customers:customers.size,
    events:rows.length,
    anonymousEvents,
    totalValueKrw,
    lastEventAt,
    segments,
  };
}

async function overview(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error:'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);

  const [subscriptionsResult, chargesResult, workspacesResult, aiActionsResult, socialRegistryRow, templatesResult, campaignsResult, marketingEventsResult] = await Promise.all([
    env.DB.prepare(`SELECT id,subject_type,subject_key,site,plan_id,status,monthly_fee,provider,
      current_period_start,current_period_end,next_billing_at,cancel_at_period_end,created_at,updated_at
      FROM service_subscriptions
      WHERE site='marketing'
      ORDER BY updated_at DESC LIMIT 500`).all(),
    env.DB.prepare(`SELECT c.id,c.subscription_id,c.amount,c.status,c.detail,c.created_at,c.completed_at,
      s.subject_type,s.subject_key,s.plan_id
      FROM billing_charge_events c
      JOIN service_subscriptions s ON s.id=c.subscription_id
      WHERE s.site='marketing'
      ORDER BY c.created_at DESC LIMIT 300`).all(),
    env.DB.prepare(`SELECT w.id,w.store_id,w.tenant_slug,w.workspace_slug,w.canonical_domain,w.landing_path,
      w.status,w.created_at,w.updated_at,
      s.plan_id,s.status AS subscription_status,s.monthly_fee,s.cancel_at_period_end,s.current_period_end
      FROM marketing_store_workspaces w
      LEFT JOIN service_subscriptions s
        ON s.subject_type='store' AND s.subject_key=w.store_id AND s.site='marketing'
      ORDER BY w.updated_at DESC LIMIT 300`).all(),
    env.DB.prepare(`SELECT id,agent_id,agent_name,action_type,area,target,decision_tier,status,created_at,decided_at,verified_at
      FROM ai_agent_actions ORDER BY id DESC LIMIT 250`).all(),
    env.DB.prepare('SELECT registry_json,revision,updated_at FROM social_registry_config WHERE id=1').first(),
    env.DB.prepare(`SELECT workspace_type,workspace_key,tenant_slug,store_id,template_key,lifecycle_json,created_at,updated_at
      FROM marketing_workspace_templates ORDER BY updated_at DESC LIMIT 300`).all(),
    env.DB.prepare(`SELECT c.id,c.workspace_type,c.workspace_key,c.tenant_slug,c.store_id,c.name,c.objective,c.audience_segment,c.channel,c.offer_summary,
      c.status,c.approval_action_id,c.scheduled_at,c.started_at,c.completed_at,c.created_at,c.updated_at,a.status AS approval_status
      FROM marketing_campaigns c LEFT JOIN ai_agent_actions a ON a.id=c.approval_action_id
      ORDER BY c.updated_at DESC LIMIT 500`).all(),
    env.DB.prepare(`SELECT workspace_type,workspace_key,customer_key,event_type,value_krw,occurred_at
      FROM marketing_events ORDER BY occurred_at DESC LIMIT 10000`).all(),
  ]);

  const subscriptions = subscriptionsResult.results || [];
  const charges = chargesResult.results || [];
  const workspaces = (workspacesResult.results || []).map(publicWorkspace);
  const templates = templatesResult.results || [];
  const campaigns = (campaignsResult.results || []).map(publicCampaign);
  const marketingEvents = marketingEventsResult.results || [];
  const activePaid = subscriptions.filter(row => String(row.status || '').toLowerCase() === 'active'
    && Number(row.monthly_fee || 0) > 0);
  const activeWorkspaces = workspaces.filter(row => row.status === 'active');
  const customerCount = new Set(subscriptions.map(customerKey)).size;
  const activeWorkspaceStoreIds = new Set(activeWorkspaces.map(row => row.storeId));
  const attention = [];

  for (const row of subscriptions) {
    const status = String(row.status || '').toLowerCase();
    const plan = String(row.plan_id || '').toLowerCase();
    if (status === 'past_due') {
      attention.push({
        kind:'billing', severity:'high', code:'past_due',
        subjectType:row.subject_type, subjectKey:row.subject_key,
        title:'결제 확인 필요', detail:`${String(row.plan_id || 'plan').toUpperCase()} 구독이 past_due 상태입니다.`,
        updatedAt:row.updated_at || null,
      });
    }
    if (Number(row.cancel_at_period_end) === 1 && status === 'active') {
      attention.push({
        kind:'billing', severity:'medium', code:'cancel_scheduled',
        subjectType:row.subject_type, subjectKey:row.subject_key,
        title:'구독 종료 예정', detail:'현재 결제기간 종료 시 해지 예정입니다.',
        updatedAt:row.updated_at || null,
      });
    }
    if (String(row.subject_type || '').toLowerCase() === 'store'
      && status === 'active' && PAID_PLANS.has(plan) && !activeWorkspaceStoreIds.has(String(row.subject_key || ''))) {
      attention.push({
        kind:'workspace', severity:'medium', code:'workspace_missing',
        subjectType:row.subject_type, subjectKey:row.subject_key,
        title:'전용 Workspace 확인 필요', detail:'Plus 이상 활성 구독이지만 활성 전용 Workspace가 없습니다.',
        updatedAt:row.updated_at || null,
      });
    }
  }

  for (const workspace of workspaces) {
    if (workspace.status !== 'active') {
      attention.push({
        kind:'workspace', severity:workspace.status === 'suspended' ? 'high' : 'medium', code:`workspace_${workspace.status}`,
        subjectType:'store', subjectKey:workspace.storeId,
        title:'Workspace 상태 확인', detail:`${workspace.canonicalDomain || workspace.slug || workspace.storeId} · ${workspace.status}`,
        updatedAt:workspace.updatedAt,
      });
    }
  }

  const aiActions = (aiActionsResult.results || []).filter(isMarketingAction).map(publicAiAction);
  const approvals = aiActions.filter(row => row.decisionTier === 'human_gate' || ['awaiting_human','approved_pending_executor','rejected'].includes(row.status));
  for (const row of approvals.filter(item => item.status === 'awaiting_human')) {
    attention.push({
      kind:'approval', severity:'high', code:'ai_human_gate',
      subjectType:'ai_action', subjectKey:String(row.id),
      title:'사람의 결정 대기', detail:`${row.agentName || row.agentId} · ${row.actionType} · ${row.target || row.area}`,
      updatedAt:row.createdAt,
    });
  }

  const eventGroups = new Map();
  for (const row of marketingEvents) {
    const key = templateKey(row);
    if (!eventGroups.has(key)) eventGroups.set(key, []);
    eventGroups.get(key).push(row);
  }
  const crm = templates.map(template => crmAggregate(template, eventGroups.get(templateKey(template)) || []));

  const channelRegistry = readChannelRegistry(socialRegistryRow);
  const cutoff30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const completed30d = charges.filter(row => String(row.status || '').toLowerCase() === 'done'
    && Number.isFinite(Date.parse(row.completed_at || row.created_at || ''))
    && Date.parse(row.completed_at || row.created_at || '') >= cutoff30d);
  const activeCampaigns = campaigns.filter(row => ['review','approved','scheduled','running'].includes(row.status));

  return json({
    generatedAt:new Date().toISOString(),
    summary:{
      customers:customerCount,
      subscriptions:subscriptions.length,
      paidSubscriptions:activePaid.length,
      mrr:activePaid.reduce((sum, row) => sum + Number(row.monthly_fee || 0), 0),
      workspaces:workspaces.length,
      activeWorkspaces:activeWorkspaces.length,
      attention:attention.length,
      charges30d:completed30d.length,
      revenue30d:completed30d.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      channels:channelRegistry.channels.length,
      automationActions:aiActions.length,
      pendingApprovals:approvals.filter(row => row.status === 'awaiting_human').length,
      campaigns:campaigns.length,
      activeCampaigns:activeCampaigns.length,
      crmCustomers:crm.reduce((sum, row) => sum + Number(row.customers || 0), 0),
      marketingEvents:crm.reduce((sum, row) => sum + Number(row.events || 0), 0),
    },
    subscriptions,
    charges,
    workspaces,
    campaigns,
    crm,
    channels:channelRegistry.channels,
    channelRegistry:{ revision:channelRegistry.revision, updatedAt:channelRegistry.updatedAt },
    automationActions:aiActions,
    approvals,
    attention:attention.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 100),
    dataContracts:{
      subscriptions:'connected',
      billing:'connected',
      workspaces:'connected',
      campaigns:'connected',
      crm:'connected',
      channels:'connected',
      automation:'connected',
      approvals:'connected',
    },
    safety:{
      readOnly:true,
      customerPiiIncluded:false,
      customerKeysIncluded:false,
      externalExecution:false,
      approvalDecisionEndpointExposedHere:false,
    },
  }, 200, request, env);
}

export async function handleMarketingAdminControl(request, env) {
  if (!env.DB) return json({ error:'데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const origin = request.headers.get('origin');
  if (origin && !isAllowedOrigin(origin, env)) return json({ error:'허용되지 않은 요청입니다.' }, 403, request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin, env) });
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/marketing/admin/overview') return overview(request, env);
  return null;
}
