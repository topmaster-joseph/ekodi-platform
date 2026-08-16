import authWorker, { isAllowedOrigin } from './auth-worker.js';

const PAID_PLANS = new Set(['plus','pro','auto','enterprise']);

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

async function overview(request, env) {
  const session = await adminSession(request, env);
  if (!session) return json({ error:'EKODI 관리자 인증이 필요합니다.' }, 401, request, env);

  const [subscriptionsResult, chargesResult, workspacesResult] = await Promise.all([
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
  ]);

  const subscriptions = subscriptionsResult.results || [];
  const charges = chargesResult.results || [];
  const workspaces = (workspacesResult.results || []).map(publicWorkspace);
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

  const cutoff30d = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const completed30d = charges.filter(row => String(row.status || '').toLowerCase() === 'done'
    && Number.isFinite(Date.parse(row.completed_at || row.created_at || ''))
    && Date.parse(row.completed_at || row.created_at || '') >= cutoff30d);

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
    },
    subscriptions,
    charges,
    workspaces,
    attention:attention.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 100),
    dataContracts:{
      subscriptions:'connected',
      billing:'connected',
      workspaces:'connected',
      campaigns:'not_connected',
      crm:'not_connected',
      channels:'not_connected',
      automation:'not_connected',
      approvals:'not_connected',
    },
    safety:{
      readOnly:true,
      customerPiiIncluded:false,
      externalExecution:false,
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
