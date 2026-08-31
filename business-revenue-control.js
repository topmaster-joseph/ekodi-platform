import authWorker, { isAllowedOrigin } from './auth-worker.js';
import { handleAgentMissionControl } from './ai-agent-control.js';

const PREFIX = '/api/business/v1';
const BUSINESS_TYPES = new Set(['service_b2b', 'food_b2c', 'affiliate_commerce']);
const MAX_TEXT = 2000;

function text(value, max = MAX_TEXT) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function json(data, status = 200, request = null, env = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const origin = request?.headers?.get('origin');
  if (origin && isAllowedOrigin(origin, env)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  }), env);
  if (!response.ok) return { response, session: null };
  const session = await response.clone().json().catch(() => null);
  if (!session?.authenticated) return { response: json({ error: '관리자 인증이 필요합니다.', code: 'AUTH_REQUIRED' }, 401, request, env), session: null };
  return { response, session };
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export function normalizeBusinessType(value) {
  const type = text(value, 80).toLowerCase();
  return BUSINESS_TYPES.has(type) ? type : 'service_b2b';
}

export function normalizeWorkspaceKey(value) {
  return text(value, 120);
}

function defaultChannel(type) {
  if (type === 'food_b2c') return 'local_social';
  if (type === 'affiliate_commerce') return 'content_commerce';
  return 'owned_and_social';
}

function defaultAudience(type) {
  if (type === 'food_b2c') return '현재 상권에서 구매 가능성이 높은 신규·재방문 고객';
  if (type === 'affiliate_commerce') return '구매 의도가 있는 검색·콘텐츠 유입 고객';
  return '문제가 명확하고 상담 가능성이 높은 소상공인·사업 고객';
}

function defaultOffer(type, goal) {
  if (type === 'food_b2c') return `방문·주문 행동을 만들 수 있는 시간대·메뉴 중심 제안: ${goal}`;
  if (type === 'affiliate_commerce') return `구매 이유가 분명한 추천·비교 콘텐츠와 전환 경로: ${goal}`;
  return `진단에서 상담·계약으로 이어지는 실행형 서비스 제안: ${goal}`;
}

export function buildCampaignPlan(input = {}) {
  const workspaceKey = normalizeWorkspaceKey(input.workspaceKey || input.workspaceId);
  const businessType = normalizeBusinessType(input.businessType);
  const goal = text(input.goal);
  if (!workspaceKey) throw new Error('workspace_required');
  if (!goal) throw new Error('goal_required');

  const context = input.context && typeof input.context === 'object' && !Array.isArray(input.context) ? input.context : {};
  const channel = text(context.preferredChannel, 100) || defaultChannel(businessType);
  const audience = text(context.audience, 500) || defaultAudience(businessType);
  const offerSummary = text(context.offerSummary, 800) || defaultOffer(businessType, goal);
  const name = text(input.name, 160) || `${workspaceKey} 수익화 캠페인`;

  return Object.freeze({
    workspaceKey,
    businessType,
    name,
    goal,
    objective: goal,
    audience,
    channel,
    offerSummary,
    planningMode: 'rules-first',
    approvalRequired: true,
    actions: Object.freeze([
      Object.freeze({ step: 'discover', label: '고객·기회 정리', mode: 'automatic' }),
      Object.freeze({ step: 'message', label: '핵심 제안·CTA 구성', mode: 'automatic' }),
      Object.freeze({ step: 'content', label: '채널용 콘텐츠 초안', mode: 'automatic' }),
      Object.freeze({ step: 'publish', label: '외부 채널 실행', mode: 'human_gate' }),
      Object.freeze({ step: 'measure', label: '문의·주문·매출 측정', mode: 'automatic_after_input' }),
      Object.freeze({ step: 'learn', label: '성과 기반 다음 제안', mode: 'automatic' }),
    ]),
  });
}

export function summarizeRevenueReport(campaigns = [], outcomes = []) {
  const totalRevenueKrw = outcomes.reduce((sum, row) => sum + Number(row.revenue_krw || row.revenueKrw || 0), 0);
  const totalCostKrw = outcomes.reduce((sum, row) => sum + Number(row.cost_krw || row.costKrw || 0), 0);
  const conversions = outcomes.reduce((sum, row) => sum + Number(row.conversions || 0), 0);
  const inquiries = outcomes.reduce((sum, row) => sum + Number(row.inquiries || 0), 0);
  const roiPercent = totalCostKrw > 0 ? Math.round(((totalRevenueKrw - totalCostKrw) / totalCostKrw) * 10000) / 100 : null;
  const completed = campaigns.filter(row => ['completed', 'measured'].includes(String(row.status || ''))).length;
  return Object.freeze({
    campaigns: campaigns.length,
    completed,
    inquiries,
    conversions,
    totalRevenueKrw,
    totalCostKrw,
    roiPercent,
  });
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS business_revenue_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_key TEXT NOT NULL,
      business_type TEXT NOT NULL,
      name TEXT NOT NULL,
      goal TEXT NOT NULL,
      objective TEXT NOT NULL,
      audience TEXT NOT NULL,
      channel TEXT NOT NULL,
      offer_summary TEXT NOT NULL,
      planning_mode TEXT NOT NULL DEFAULT 'rules-first',
      status TEXT NOT NULL DEFAULT 'draft',
      approval_action_id INTEGER,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_business_revenue_campaigns_workspace ON business_revenue_campaigns(workspace_key, updated_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_business_revenue_campaigns_status ON business_revenue_campaigns(status, updated_at DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS business_revenue_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      workspace_key TEXT NOT NULL,
      inquiries INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      revenue_krw INTEGER NOT NULL DEFAULT 0,
      cost_krw INTEGER NOT NULL DEFAULT 0,
      metric_type TEXT NOT NULL DEFAULT 'manual',
      note TEXT NOT NULL DEFAULT '',
      occurred_at TEXT NOT NULL,
      recorded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_business_revenue_outcomes_campaign ON business_revenue_outcomes(campaign_id, occurred_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_business_revenue_outcomes_workspace ON business_revenue_outcomes(workspace_key, occurred_at DESC)'),
  ]);
}

function publicCampaign(row) {
  return {
    id: Number(row.id),
    workspaceKey: String(row.workspace_key || ''),
    businessType: String(row.business_type || ''),
    name: String(row.name || ''),
    goal: String(row.goal || ''),
    objective: String(row.objective || ''),
    audience: String(row.audience || ''),
    channel: String(row.channel || ''),
    offerSummary: String(row.offer_summary || ''),
    planningMode: String(row.planning_mode || 'rules-first'),
    status: String(row.status || ''),
    approvalActionId: row.approval_action_id ? Number(row.approval_action_id) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function createPlan(request, env, session) {
  const body = await readJson(request);
  if (!body) return json({ error: '유효한 JSON 요청이 필요합니다.', code: 'INVALID_JSON' }, 400, request, env);
  let plan;
  try { plan = buildCampaignPlan(body); }
  catch (error) {
    const code = String(error?.message || 'invalid_request');
    return json({ error: code === 'workspace_required' ? 'workspaceKey가 필요합니다.' : 'goal이 필요합니다.', code: code.toUpperCase() }, 400, request, env);
  }

  const now = new Date().toISOString();
  const row = await env.DB.prepare(`INSERT INTO business_revenue_campaigns
    (workspace_key,business_type,name,goal,objective,audience,channel,offer_summary,planning_mode,status,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?,?) RETURNING id`)
    .bind(plan.workspaceKey, plan.businessType, plan.name, plan.goal, plan.objective, plan.audience, plan.channel, plan.offerSummary, plan.planningMode, String(session.email || 'unknown'), now, now).first();

  return json({ ok: true, campaign: { id: Number(row?.id), ...plan, status: 'draft', createdAt: now, updatedAt: now } }, 201, request, env);
}

async function executePlan(request, env, session) {
  const body = await readJson(request);
  if (!body) return json({ error: '유효한 JSON 요청이 필요합니다.', code: 'INVALID_JSON' }, 400, request, env);
  const workspaceKey = normalizeWorkspaceKey(body.workspaceKey || body.workspaceId);
  if (!workspaceKey) return json({ error: 'workspaceKey가 필요합니다.', code: 'WORKSPACE_REQUIRED' }, 400, request, env);
  const campaignId = Number(body.campaignId);
  if (!Number.isInteger(campaignId) || campaignId < 1) return json({ error: '유효한 campaignId가 필요합니다.', code: 'CAMPAIGN_ID_REQUIRED' }, 400, request, env);

  const campaign = await env.DB.prepare('SELECT * FROM business_revenue_campaigns WHERE id = ? AND workspace_key = ?').bind(campaignId, workspaceKey).first();
  if (!campaign) return json({ error: '캠페인을 찾을 수 없습니다.', code: 'CAMPAIGN_NOT_FOUND' }, 404, request, env);
  if (['awaiting_human', 'approved_pending_executor', 'running', 'completed', 'measured'].includes(String(campaign.status || ''))) {
    return json({ ok: true, campaign: publicCampaign(campaign), idempotent: true }, 200, request, env);
  }

  const action = {
    agentId: 'marketing',
    actionType: 'marketing.campaign_publish',
    area: 'external_publication',
    target: `${campaign.workspace_key}:campaign:${campaign.id}`,
    rationale: `수익화 캠페인 외부 실행 승인 요청: ${campaign.name}`,
    payload: {
      campaignId: Number(campaign.id),
      workspaceKey: campaign.workspace_key,
      businessType: campaign.business_type,
      channel: campaign.channel,
      objective: campaign.objective,
      audience: campaign.audience,
      offerSummary: campaign.offer_summary,
    },
    reversible: false,
    delegated: false,
    preflightVerified: true,
  };

  const url = new URL(request.url);
  url.pathname = '/api/control/ai/actions';
  url.search = '';
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  const missionResponse = await handleAgentMissionControl(new Request(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify(action),
  }), env);
  const mission = await missionResponse.clone().json().catch(() => null);
  if (!missionResponse.ok && missionResponse.status !== 202) return missionResponse;

  const status = String(mission?.status || 'awaiting_human');
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE business_revenue_campaigns SET status=?,approval_action_id=?,updated_at=? WHERE id=? AND workspace_key=?`)
    .bind(status, mission?.id || null, now, campaignId, workspaceKey).run();

  return json({ ok: true, campaignId, workspaceKey, status, approvalActionId: mission?.id || null, decision: mission?.decision || null, requestedBy: String(session.email || 'unknown') }, 202, request, env);
}

async function recordOutcome(request, env, session) {
  const body = await readJson(request);
  if (!body) return json({ error: '유효한 JSON 요청이 필요합니다.', code: 'INVALID_JSON' }, 400, request, env);
  const workspaceKey = normalizeWorkspaceKey(body.workspaceKey || body.workspaceId);
  if (!workspaceKey) return json({ error: 'workspaceKey가 필요합니다.', code: 'WORKSPACE_REQUIRED' }, 400, request, env);
  const campaignId = Number(body.campaignId);
  if (!Number.isInteger(campaignId) || campaignId < 1) return json({ error: '유효한 campaignId가 필요합니다.', code: 'CAMPAIGN_ID_REQUIRED' }, 400, request, env);
  const campaign = await env.DB.prepare('SELECT id,workspace_key FROM business_revenue_campaigns WHERE id=? AND workspace_key=?').bind(campaignId, workspaceKey).first();
  if (!campaign) return json({ error: '캠페인을 찾을 수 없습니다.', code: 'CAMPAIGN_NOT_FOUND' }, 404, request, env);

  const inquiries = Math.max(0, Number.parseInt(body.inquiries || 0, 10) || 0);
  const conversions = Math.max(0, Number.parseInt(body.conversions || 0, 10) || 0);
  const revenueKrw = Math.max(0, Math.round(Number(body.revenueKrw || 0) || 0));
  const costKrw = Math.max(0, Math.round(Number(body.costKrw || 0) || 0));
  const metricType = text(body.metricType, 80) || 'manual';
  const note = text(body.note, 1000);
  const occurredAt = text(body.occurredAt, 80) || new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) return json({ error: 'occurredAt 날짜 형식이 올바르지 않습니다.', code: 'INVALID_OCCURRED_AT' }, 400, request, env);
  const now = new Date().toISOString();

  const row = await env.DB.prepare(`INSERT INTO business_revenue_outcomes
    (campaign_id,workspace_key,inquiries,conversions,revenue_krw,cost_krw,metric_type,note,occurred_at,recorded_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(campaignId, campaign.workspace_key, inquiries, conversions, revenueKrw, costKrw, metricType, note, occurredAt, String(session.email || 'unknown'), now).first();
  await env.DB.prepare(`UPDATE business_revenue_campaigns SET status='measured',updated_at=? WHERE id=? AND workspace_key=?`).bind(now, campaignId, workspaceKey).run();

  return json({ ok: true, outcome: { id: Number(row?.id), campaignId, workspaceKey: campaign.workspace_key, inquiries, conversions, revenueKrw, costKrw, metricType, note, occurredAt } }, 201, request, env);
}

async function report(request, env) {
  const url = new URL(request.url);
  const workspaceKey = normalizeWorkspaceKey(url.searchParams.get('workspaceKey'));
  if (!workspaceKey) return json({ error: 'workspaceKey가 필요합니다.', code: 'WORKSPACE_REQUIRED' }, 400, request, env);
  const campaignsResult = await env.DB.prepare('SELECT * FROM business_revenue_campaigns WHERE workspace_key = ? ORDER BY updated_at DESC LIMIT 200').bind(workspaceKey).all();
  const outcomesResult = await env.DB.prepare('SELECT * FROM business_revenue_outcomes WHERE workspace_key = ? ORDER BY occurred_at DESC LIMIT 2000').bind(workspaceKey).all();
  const campaigns = campaignsResult.results || [];
  const outcomes = outcomesResult.results || [];
  const summary = summarizeRevenueReport(campaigns, outcomes);
  const byCampaign = new Map();
  for (const row of outcomes) {
    const id = Number(row.campaign_id);
    if (!byCampaign.has(id)) byCampaign.set(id, []);
    byCampaign.get(id).push(row);
  }
  const items = campaigns.map(row => ({
    ...publicCampaign(row),
    summary: summarizeRevenueReport([row], byCampaign.get(Number(row.id)) || []),
  }));
  return json({ ok: true, workspaceKey, summary, campaigns: items }, 200, request, env);
}

export async function handleBusinessRevenueControl(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-max-age': '86400',
    });
    const origin = request.headers.get('origin');
    if (origin && isAllowedOrigin(origin, env)) {
      headers.set('access-control-allow-origin', origin);
      headers.set('vary', 'Origin');
    }
    return new Response(null, { status: 204, headers });
  }
  if (!env.DB?.prepare) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.', code: 'DB_NOT_CONFIGURED' }, 503, request, env);
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  await ensureSchema(env.DB);

  if (request.method === 'POST' && url.pathname === `${PREFIX}/plan`) return createPlan(request, env, auth.session);
  if (request.method === 'POST' && url.pathname === `${PREFIX}/execute`) return executePlan(request, env, auth.session);
  if (request.method === 'POST' && url.pathname === `${PREFIX}/outcome`) return recordOutcome(request, env, auth.session);
  if (request.method === 'GET' && url.pathname === `${PREFIX}/report`) return report(request, env);
  if (request.method === 'GET' && url.pathname === `${PREFIX}/health`) return json({ ok: true, service: 'business-revenue-engine', version: 1, mode: 'closed-loop-mvp' }, 200, request, env);

  return json({ error: 'Revenue Engine 경로를 찾을 수 없습니다.', code: 'REVENUE_ROUTE_NOT_FOUND' }, 404, request, env);
}
