import { handleAdminSessionFastPath } from './admin-session-fastpath.js';

const PUBLIC_PATH = '/api/service-demands';
const ADMIN_PREFIX = '/api/control/service-demands';
const VALID_STATUS = new Set(['new','reviewing','planned','integrating','launched','declined','archived']);
const VALID_IMPLEMENTATION = new Set(['','existing','new','external']);
const VALID_SEGMENTS = new Set(['general','person','business','store','church','organization','institution','creator']);
const SERVICE_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const INTENT_RULES = [
  ['tax-accounting', /(세무|세금|부가세|종합소득|소득세|회계|장부|tax|vat)/i],
  ['cost-inventory', /(원가|재고|발주|식자재|inventory|stock)/i],
  ['translation', /(통역|번역|외국어|translation|interpreter)/i],
  ['marketing', /(홍보|마케팅|광고|sns|콘텐츠|marketing|advertis)/i],
  ['publishing', /(출판|전자책|책\s*만들|원고|epub|publish)/i],
  ['career', /(취업|채용|진로|이력서|면접|career|job)/i],
  ['energy', /(전기|전기료|전기세|에너지|energy|전력)/i],
  ['education', /(교육|학습|강의|수업|education|learn)/i],
  ['ministry', /(교회|사역|예배|성경|말씀|church|ministry)/i],
  ['commerce', /(판매|쇼핑몰|상품|결제|주문|commerce|shop|mall)/i],
];

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    ...extra,
  }});
}

function allowedOrigin(request, env = {}) {
  const origin = String(request.headers.get('origin') || '').trim();
  if (!origin) return '';
  const allowed = new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean));
  return allowed.has(origin) ? origin : null;
}
function corsHeaders(request, env = {}) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    'access-control-allow-origin':origin,
    'access-control-allow-methods':'POST, OPTIONS',
    'access-control-allow-headers':'content-type',
    'access-control-max-age':'86400',
    'vary':'Origin',
  } : {};
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS service_demands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_key TEXT NOT NULL UNIQUE,
      intent TEXT NOT NULL DEFAULT 'other',
      requested_capability TEXT NOT NULL,
      user_segment TEXT NOT NULL DEFAULT 'general',
      related_service_id TEXT NOT NULL DEFAULT '',
      request_count INTEGER NOT NULL DEFAULT 1,
      urgency_score INTEGER NOT NULL DEFAULT 0 CHECK (urgency_score BETWEEN 0 AND 100),
      business_value_score INTEGER NOT NULL DEFAULT 0 CHECK (business_value_score BETWEEN 0 AND 100),
      mission_fit_score INTEGER NOT NULL DEFAULT 0 CHECK (mission_fit_score BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','planned','integrating','launched','declined','archived')),
      implementation_type TEXT NOT NULL DEFAULT '' CHECK (implementation_type IN ('','existing','new','external')),
      admin_note TEXT NOT NULL DEFAULT '',
      first_requested_at TEXT NOT NULL,
      last_requested_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by INTEGER
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_service_demands_status_priority ON service_demands(status, request_count DESC, last_requested_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_service_demands_intent ON service_demands(intent, last_requested_at DESC)'),
  ]);
}

function cleanText(value, max = 500) {
  return String(value || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function inferIntent(text, supplied = '') {
  const explicit = cleanText(supplied, 48).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (explicit && explicit !== 'other') return explicit;
  return INTENT_RULES.find(([, re]) => re.test(text))?.[0] || 'other';
}
function normalizeKey(text, intent) {
  if (intent && intent !== 'other') return `intent:${intent}`;
  const tokens = cleanText(text, 220).toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, ' ')
    .split(/\s+/).filter(token => token.length > 1)
    .filter(token => !['하고','싶어요','원해요','필요해요','해주세요','서비스','기능','도와줘','도와주세요','please','want','need','service'].includes(token))
    .slice(0, 8).sort();
  return `need:${tokens.join('-').slice(0, 120) || 'other'}`;
}
function urgencyFrom(text) {
  if (/(오늘|당장|급해|긴급|마감|내일|즉시|urgent|asap)/i.test(text)) return 70;
  if (/(이번주|곧|빨리|soon)/i.test(text)) return 45;
  return 20;
}
function priority(row) {
  const count = Math.min(45, Math.max(0, Number(row.request_count || 0)) * 6);
  const scored = Number(row.urgency_score || 0) * .2 + Number(row.business_value_score || 0) * .2 + Number(row.mission_fit_score || 0) * .15;
  const ageHours = Math.max(0, (Date.now() - new Date(row.last_requested_at || 0).getTime()) / 3600000);
  const recency = ageHours <= 24 ? 15 : ageHours <= 168 ? 10 : ageHours <= 720 ? 5 : 0;
  return Math.min(100, Math.round(count + scored + recency));
}
function rowOut(row) {
  return {
    id:Number(row.id), key:row.normalized_key, intent:row.intent,
    requestedCapability:row.requested_capability, userSegment:row.user_segment,
    relatedServiceId:row.related_service_id || '', requestCount:Number(row.request_count || 0),
    urgencyScore:Number(row.urgency_score || 0), businessValueScore:Number(row.business_value_score || 0),
    missionFitScore:Number(row.mission_fit_score || 0), priorityScore:priority(row),
    status:row.status, implementationType:row.implementation_type || '', adminNote:row.admin_note || '',
    firstRequestedAt:row.first_requested_at, lastRequestedAt:row.last_requested_at,
    reviewedAt:row.reviewed_at || null,
  };
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session'; url.search = '';
  const probe = new Request(url.toString(), { method:'GET', headers:request.headers });
  const response = await handleAdminSessionFastPath(probe, env);
  if (!response?.ok) return { response:response || json({error:'관리자 인증이 필요합니다.'},401) };
  return { response, session:await response.clone().json() };
}
async function adminId(env, session) {
  const email = cleanText(session?.email, 254).toLowerCase();
  if (!email) return null;
  return (await env.DB.prepare('SELECT id FROM admins WHERE lower(email)=?').bind(email).first())?.id || null;
}
async function audit(env, session, action, detail) {
  const id = await adminId(env, session);
  await env.DB.prepare('INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, action, 'service-demand-radar', cleanText(detail, 500), new Date().toISOString()).run();
}

async function recordDemand(request, env) {
  if (!env.DB) return json({error:'수요 저장소를 사용할 수 없습니다.',code:'DEMAND_DB_UNAVAILABLE'},503,corsHeaders(request,env));
  const origin = allowedOrigin(request, env);
  if (origin === null) return json({error:'허용되지 않은 Origin입니다.',code:'ORIGIN_FORBIDDEN'},403);
  let body = null;
  try { body = await request.json(); } catch {}
  const text = cleanText(body?.requestText ?? body?.requestedCapability, 500);
  if (text.length < 2) return json({error:'원하는 일을 조금 더 구체적으로 입력해 주세요.',code:'DEMAND_TEXT_REQUIRED'},400,corsHeaders(request,env));
  const intent = inferIntent(text, body?.intent);
  const key = normalizeKey(text, intent);
  const segmentRaw = cleanText(body?.userSegment, 24).toLowerCase();
  const segment = VALID_SEGMENTS.has(segmentRaw) ? segmentRaw : 'general';
  const related = cleanText(body?.relatedServiceId, 64).toLowerCase();
  const relatedService = SERVICE_ID_RE.test(related) ? related : '';
  const now = new Date().toISOString();
  await ensureSchema(env.DB);
  await env.DB.prepare(`INSERT INTO service_demands
    (normalized_key,intent,requested_capability,user_segment,related_service_id,request_count,urgency_score,first_requested_at,last_requested_at)
    VALUES (?,?,?,?,?,1,?,?,?)
    ON CONFLICT(normalized_key) DO UPDATE SET
      request_count=service_demands.request_count+1,
      requested_capability=excluded.requested_capability,
      user_segment=CASE WHEN service_demands.user_segment='general' THEN excluded.user_segment ELSE service_demands.user_segment END,
      related_service_id=CASE WHEN service_demands.related_service_id='' THEN excluded.related_service_id ELSE service_demands.related_service_id END,
      urgency_score=MAX(service_demands.urgency_score,excluded.urgency_score),
      last_requested_at=excluded.last_requested_at`)
    .bind(key,intent,text,segment,relatedService,urgencyFrom(text),now,now).run();
  const row = await env.DB.prepare('SELECT * FROM service_demands WHERE normalized_key=?').bind(key).first();
  return json({ok:true,recorded:true,demand:{key,intent,status:row?.status || 'new'},message:'요청하신 필요를 기록했습니다. 현재 가능한 가까운 방법을 함께 찾고, 서비스가 준비되면 다시 발견할 수 있도록 연결합니다.'},202,corsHeaders(request,env));
}

async function listDemands(request, env, sessionResponse) {
  const url = new URL(request.url);
  const status = cleanText(url.searchParams.get('status'),24).toLowerCase();
  const limit = Math.max(1,Math.min(200,Math.trunc(Number(url.searchParams.get('limit')) || 100)));
  const where = VALID_STATUS.has(status) ? 'WHERE status=?' : '';
  const query = `SELECT * FROM service_demands ${where} ORDER BY request_count DESC, last_requested_at DESC LIMIT ?`;
  const rows = VALID_STATUS.has(status)
    ? await env.DB.prepare(query).bind(status,limit).all()
    : await env.DB.prepare(query).bind(limit).all();
  const counts = await env.DB.prepare(`SELECT status, COUNT(*) AS topics, COALESCE(SUM(request_count),0) AS requests FROM service_demands GROUP BY status`).all();
  const summary = {topics:0,requests:0,byStatus:{}};
  for (const item of counts.results || []) {
    const data={topics:Number(item.topics||0),requests:Number(item.requests||0)};
    summary.byStatus[item.status]=data; summary.topics+=data.topics; summary.requests+=data.requests;
  }
  return json({schemaVersion:1,generatedAt:new Date().toISOString(),summary,demands:(rows.results||[]).map(rowOut)},200,Object.fromEntries(['access-control-allow-origin','vary'].map(name=>[name,sessionResponse.headers.get(name)]).filter(([,v])=>v)));
}

async function updateDemand(request, env, session, sessionResponse, id) {
  let body=null; try{body=await request.json();}catch{}
  if (!body || typeof body !== 'object') return json({error:'수요 검토 형식을 확인해 주세요.'},400);
  const current=await env.DB.prepare('SELECT * FROM service_demands WHERE id=?').bind(id).first();
  if (!current) return json({error:'해당 서비스 수요를 찾을 수 없습니다.'},404);
  const status=cleanText(body.status ?? current.status,24).toLowerCase();
  const implementation=cleanText(body.implementationType ?? current.implementation_type,24).toLowerCase();
  if(!VALID_STATUS.has(status))return json({error:'수요 상태 값이 올바르지 않습니다.'},400);
  if(!VALID_IMPLEMENTATION.has(implementation))return json({error:'구현 방식은 existing, new, external 중 하나여야 합니다.'},400);
  const score=(value,fallback)=>Math.max(0,Math.min(100,Math.round(Number.isFinite(Number(value))?Number(value):Number(fallback||0))));
  const urgency=score(body.urgencyScore,current.urgency_score);
  const business=score(body.businessValueScore,current.business_value_score);
  const mission=score(body.missionFitScore,current.mission_fit_score);
  const note=cleanText(body.adminNote ?? current.admin_note,500);
  const reviewer=await adminId(env,session);
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE service_demands SET status=?,implementation_type=?,urgency_score=?,business_value_score=?,mission_fit_score=?,admin_note=?,reviewed_at=?,reviewed_by=? WHERE id=?`)
    .bind(status,implementation,urgency,business,mission,note,now,reviewer,id).run();
  await audit(env,session,'service-demand.update',JSON.stringify({id,status,implementation,urgency,business,mission}));
  const updated=await env.DB.prepare('SELECT * FROM service_demands WHERE id=?').bind(id).first();
  return json({ok:true,demand:rowOut(updated)},200,Object.fromEntries(['access-control-allow-origin','vary'].map(name=>[name,sessionResponse.headers.get(name)]).filter(([,v])=>v)));
}

export async function handleServiceDemandRequest(request, env) {
  const url=new URL(request.url); const path=url.pathname;
  if (path===PUBLIC_PATH && request.method==='OPTIONS') {
    const origin=allowedOrigin(request,env);
    if(origin===null)return json({error:'허용되지 않은 Origin입니다.'},403);
    return new Response(null,{status:204,headers:corsHeaders(request,env)});
  }
  if (path===PUBLIC_PATH && request.method==='POST') return recordDemand(request,env);
  if (!path.startsWith(ADMIN_PREFIX)) return null;
  if (!env.DB) return json({error:'수요 저장소를 사용할 수 없습니다.'},503);
  const auth=await adminSession(request,env);
  if(!auth.session)return auth.response;
  await ensureSchema(env.DB);
  if(path===ADMIN_PREFIX && request.method==='GET')return listDemands(request,env,auth.response);
  const match=path.match(/^\/api\/control\/service-demands\/(\d+)$/);
  if(match && request.method==='PUT')return updateDemand(request,env,auth.session,auth.response,Number(match[1]));
  return json({error:'Service Demand endpoint not found'},404);
}

export const serviceDemandInternals=Object.freeze({inferIntent,normalizeKey,urgencyFrom});
