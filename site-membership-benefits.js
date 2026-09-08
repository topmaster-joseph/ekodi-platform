import { channelAutomationActor } from './channel-automation-subject.js';
import { TENANT_ADMIN_CAPABILITIES, tenantAdminCan } from './tenant-admin-policy.js';

export const DEFAULT_FREE_MEMBER_BENEFITS = Object.freeze([
  Object.freeze({ id:'favorites-and-saved', label:'즐겨찾기 · 저장', description:'관심 콘텐츠와 항목을 계정에 저장합니다.', enabled:true, displayOrder:10 }),
  Object.freeze({ id:'personalized-updates', label:'맞춤 소식', description:'관심사와 이용 맥락에 맞춘 기본 소식을 받습니다.', enabled:true, displayOrder:20 }),
  Object.freeze({ id:'participation-history', label:'참여 기록', description:'내 참여·신청·활동 기록을 이어서 확인합니다.', enabled:true, displayOrder:30 }),
]);

const BILLING_PERIODS = new Set(['monthly','yearly','one_time','custom']);
const PACKAGE_KINDS = new Set(['feature','addon','package','service','organization_plan']);
const MAX_FREE_BENEFITS = 30;
const MAX_PAID_PACKAGES = 20;
const MAX_FEATURES = 30;

function clean(value, max = 160) { return String(value ?? '').trim().slice(0, max); }
function slug(value, fallback = '') {
  const normalized = clean(value, 80).toLowerCase().replace(/[^a-z0-9가-힣-]+/g,'-').replace(/^-+|-+$/g,'');
  return normalized || fallback;
}
function bool(value, fallback = true) { return value === undefined ? fallback : Boolean(value); }
function integer(value, fallback = 0, min = 0, max = 1_000_000_000) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function uniqueId(value, fallback, seen) {
  const base = slug(value, fallback).slice(0, 64) || fallback;
  let id = base;
  let suffix = 2;
  while (seen.has(id)) id = `${base.slice(0, 56)}-${suffix++}`;
  seen.add(id);
  return id;
}

function normalizeFreeBenefits(input) {
  const rows = Array.isArray(input) ? input.slice(0, MAX_FREE_BENEFITS) : DEFAULT_FREE_MEMBER_BENEFITS;
  const seen = new Set();
  return rows.map((item, index) => ({
    id:uniqueId(item?.id || item?.label, `benefit-${index + 1}`, seen),
    label:clean(item?.label, 80) || `무료 혜택 ${index + 1}`,
    description:clean(item?.description, 280),
    enabled:bool(item?.enabled, true),
    displayOrder:(index + 1) * 10,
  }));
}

function normalizeFeatures(input) {
  const values = Array.isArray(input) ? input : String(input || '').split(/\r?\n/);
  return [...new Set(values.map(value => clean(value, 120)).filter(Boolean))].slice(0, MAX_FEATURES);
}
function normalizePaidPackages(input) {
  const rows = Array.isArray(input) ? input.slice(0, MAX_PAID_PACKAGES) : [];
  const seen = new Set();
  return rows.map((item, index) => {
    const kind = PACKAGE_KINDS.has(String(item?.kind || 'package')) ? String(item.kind) : 'package';
    const billingPeriod = BILLING_PERIODS.has(String(item?.billingPeriod || 'monthly')) ? String(item.billingPeriod) : 'monthly';
    return {
      id:uniqueId(item?.id || item?.name, `package-${index + 1}`, seen),
      name:clean(item?.name, 80) || `유료 패키지 ${index + 1}`,
      description:clean(item?.description, 320),
      kind,
      priceKrw:integer(item?.priceKrw, 0),
      billingPeriod,
      features:normalizeFeatures(item?.features),
      enabled:bool(item?.enabled, true),
      displayOrder:(index + 1) * 10,
    };
  });
}

export function normalizeSiteBenefitPayload(input = {}) {
  return {
    freeBenefits:normalizeFreeBenefits(input.freeBenefits),
    paidPackages:normalizePaidPackages(input.paidPackages),
  };
}
const READY_DATABASES = new WeakSet();
async function ensureSchema(db) {
  if (READY_DATABASES.has(db)) return;
  await db.prepare('SELECT workspace_id FROM site_membership_benefit_profiles LIMIT 0').first();
  await db.prepare('SELECT id FROM site_membership_benefit_audit LIMIT 0').first();
  READY_DATABASES.add(db);
}
function publicInvariant() {
  return {
    mode:'public',
    immutable:true,
    membershipRequiredForPublicContent:false,
    exceptions:['administrator_surface','private_personal_data','private_workspace_data','security_sensitive_action'],
  };
}

function parseProfile(row) {
  if (!row) return normalizeSiteBenefitPayload({});
  let freeBenefits = [], paidPackages = [];
  try { freeBenefits = JSON.parse(row.free_benefits_json || '[]'); } catch {}
  try { paidPackages = JSON.parse(row.paid_packages_json || '[]'); } catch {}
  return normalizeSiteBenefitPayload({ freeBenefits, paidPackages });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  }});
}

function requestScope(url) {
  return { workspace:clean(url.searchParams.get('workspace'), 120).toLowerCase(), service:slug(url.searchParams.get('service'), '') };
}
async function readProfile(db, workspace, service) {
  await ensureSchema(db);
  return db.prepare(`SELECT workspace_id,workspace_slug,service_id,free_benefits_json,paid_packages_json,updated_at,updated_by
    FROM site_membership_benefit_profiles WHERE workspace_slug=? AND service_id=? LIMIT 1`)
    .bind(workspace, service).first();
}
async function readProfileByWorkspaceId(db, workspaceId, service) {
  await ensureSchema(db);
  return db.prepare(`SELECT workspace_id,workspace_slug,service_id,free_benefits_json,paid_packages_json,updated_at,updated_by
    FROM site_membership_benefit_profiles WHERE workspace_id=? AND service_id=? LIMIT 1`)
    .bind(workspaceId, service).first();
}

function actorContext(actor, workspace) {
  const key = clean(workspace, 120).toLowerCase();
  return (actor?.contexts || []).find(item =>
    String(item.workspaceId || '').toLowerCase() === key ||
    String(item.workspaceKey || '').toLowerCase() === key ||
    String(item.workspaceSlug || '').toLowerCase() === key
  ) || null;
}

async function requireSiteAdmin(request, env, workspace) {
  const actor = await channelAutomationActor(request, env);
  if (!actor) return { error:json({ error:'로그인이 필요합니다.', code:'AUTH_REQUIRED' }, 401) };
  const context = actorContext(actor, workspace);
  if (!context) return { error:json({ error:'이 운영공간에 접근할 권한이 없습니다.', code:'WORKSPACE_ACCESS_REQUIRED' }, 403) };
  if (!tenantAdminCan(context.authorizationRole, TENANT_ADMIN_CAPABILITIES.membershipBenefits)) {
    return { error:json({ error:'회원·혜택 관리 권한이 없습니다.', code:'MEMBERSHIP_BENEFITS_MANAGE_REQUIRED' }, 403) };
  }
  return { actor, context };
}
async function publicGet(request, env, scope) {
  if (!scope.workspace) return json({ error:'workspace가 필요합니다.', code:'WORKSPACE_REQUIRED' }, 400);
  const row = await readProfile(env.DB, scope.workspace, scope.service);
  const profile = parseProfile(row);
  return json({
    workspace:scope.workspace,
    service:scope.service || null,
    publicAccess:publicInvariant(),
    ...profile,
    configured:Boolean(row),
    updatedAt:row?.updated_at || null,
  });
}

async function adminGet(request, env, scope) {
  const auth = await requireSiteAdmin(request, env, scope.workspace);
  if (auth.error) return auth.error;
  const row = await readProfileByWorkspaceId(env.DB, auth.context.workspaceId, scope.service);
  return json({
    workspace:auth.context.workspaceSlug,
    workspaceId:auth.context.workspaceId,
    service:scope.service || null,
    role:auth.context.authorizationRole,
    publicAccess:publicInvariant(),
    ...parseProfile(row),
    configured:Boolean(row),
    updatedAt:row?.updated_at || null,
    updatedBy:row?.updated_by || null,
  });
}
async function adminPut(request, env, scope) {
  const auth = await requireSiteAdmin(request, env, scope.workspace);
  if (auth.error) return auth.error;
  let body = null;
  try { body = await request.json(); } catch {}
  if (!body || typeof body !== 'object') return json({ error:'혜택 설정을 확인해 주세요.', code:'INVALID_BODY' }, 400);
  const next = normalizeSiteBenefitPayload(body);
  await ensureSchema(env.DB);
  const previous = await readProfileByWorkspaceId(env.DB, auth.context.workspaceId, scope.service);
  const before = parseProfile(previous);
  const now = new Date().toISOString();
  const email = clean(auth.actor.email, 254) || 'unknown';
  await env.DB.prepare(`INSERT INTO site_membership_benefit_profiles
    (workspace_id,workspace_slug,service_id,free_benefits_json,paid_packages_json,updated_at,updated_by)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(workspace_id,service_id) DO UPDATE SET workspace_slug=excluded.workspace_slug,
    free_benefits_json=excluded.free_benefits_json,paid_packages_json=excluded.paid_packages_json,
    updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(auth.context.workspaceId, auth.context.workspaceSlug, scope.service, JSON.stringify(next.freeBenefits), JSON.stringify(next.paidPackages), now, email).run();
  await env.DB.prepare(`INSERT INTO site_membership_benefit_audit
    (workspace_id,workspace_slug,service_id,actor_email,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)`)
    .bind(auth.context.workspaceId, auth.context.workspaceSlug, scope.service, email, JSON.stringify(before), JSON.stringify(next), now).run();
  return json({
    ok:true,
    workspace:auth.context.workspaceSlug,
    service:scope.service || null,
    publicAccess:publicInvariant(),
    ...next,
    updatedAt:now,
    updatedBy:email,
  });
}

export async function handleSiteMembershipBenefits(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/membership/site-benefits' && url.pathname !== '/api/membership/site-benefits/admin') return null;
  if (!env.DB) return json({ error:'데이터베이스 연결이 설정되지 않았습니다.', code:'DATABASE_UNAVAILABLE' }, 503);
  const scope = requestScope(url);
  if (!scope.workspace) return json({ error:'workspace가 필요합니다.', code:'WORKSPACE_REQUIRED' }, 400);
  try {
    if (request.method === 'GET' && url.pathname.endsWith('/admin')) return adminGet(request, env, scope);
    if (request.method === 'GET') return publicGet(request, env, scope);
    if (request.method === 'PUT' && url.pathname.endsWith('/admin')) return adminPut(request, env, scope);
    return json({ error:'지원하지 않는 요청입니다.', code:'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) {
    console.error('site membership benefits', error);
    return json({ error:'회원·혜택 설정을 처리하지 못했습니다.', code:'SITE_MEMBERSHIP_BENEFITS_ERROR' }, 500);
  }
}
