import authWorker from './auth-worker.js';
import freeFirstWorker from './tax-invoice-free-first-worker.js';

const ALLOWED_ORIGINS = new Set([
  'https://tax.ekodi.kr',
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr'
]);

function corsHeaders(origin) {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin'
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function json(data, status = 200, baseHeaders = null, origin = '') {
  const headers = new Headers(baseHeaders || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  for (const [key, value] of corsHeaders(origin).entries()) headers.set(key, value);
  return new Response(JSON.stringify(data), { status, headers });
}

function text(value, max = 300) { return String(value ?? '').trim().slice(0, max); }
function digits(value, max = 13) { return String(value ?? '').replace(/\D/g, '').slice(0, max); }
function parseJson(value, fallback = {}) { try { return JSON.parse(value); } catch { return fallback; } }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }

function normalizeProfile(input = {}) {
  return {
    id: Number(input.id) || null,
    organizationId: text(input.organizationId || input.organization_id || 'EKODIBIZ', 40),
    profileName: text(input.profileName || input.profile_name || input.corpName || input.corp_name || '공급자', 100),
    corpNum: digits(input.corpNum || input.corp_num, 10),
    taxRegId: digits(input.taxRegId || input.tax_reg_id, 4),
    corpName: text(input.corpName || input.corp_name, 200),
    ceoName: text(input.ceoName || input.ceo_name, 100),
    addr: text(input.addr, 300),
    bizType: text(input.bizType || input.biz_type, 100),
    bizClass: text(input.bizClass || input.biz_class, 100),
    contactName: text(input.contactName || input.contact_name, 100),
    tel: text(input.tel, 20),
    email: text(input.email, 100),
    isDefault: Boolean(Number(input.isDefault ?? input.is_default ?? 0)),
    active: input.active === undefined ? true : Boolean(Number(input.active))
  };
}

function profileComplete(profile) {
  return Boolean(profile && /^\d{10}$/.test(profile.corpNum) && profile.corpName && profile.ceoName);
}

function validateProfile(profile) {
  if (!profile.profileName) throw new Error('공급자 구분명을 입력해 주세요.');
  if (!/^\d{10}$/.test(profile.corpNum)) throw new Error('공급자 사업자번호 10자리를 입력해 주세요.');
  if (!profile.corpName || !profile.ceoName) throw new Error('공급자 상호와 대표자를 입력해 주세요.');
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method:'GET', headers:request.headers }), env);
  if (!response.ok) return { response };
  return { response, session:await response.clone().json() };
}

async function adminId(env, email) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email=?').bind(email).first();
  return row?.id || null;
}

async function audit(env, session, action, resource, detail = '') {
  const id = await adminId(env, session.email);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id,action,resource,detail,created_at) VALUES (?,?,?,?,?)`)
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function invoiceEvent(env, invoiceId, action, fromStatus, toStatus, admin, detail = '') {
  await env.DB.prepare(`INSERT INTO tax_invoice_events (invoice_id,action,from_status,to_status,admin_id,detail,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(invoiceId, action, fromStatus || '', toStatus || '', admin || null, String(detail).slice(0, 1000), new Date().toISOString()).run();
}

async function assertOrganization(env, organizationId) {
  const row = await env.DB.prepare('SELECT id FROM organizations WHERE id=? AND active=1').bind(organizationId).first();
  if (!row) throw new Error('유효한 조직을 선택해 주세요.');
}

async function profileById(env, organizationId, id, activeOnly = true) {
  const row = await env.DB.prepare(`SELECT * FROM tax_supplier_profiles WHERE organization_id=? AND id=?${activeOnly ? ' AND active=1' : ''}`)
    .bind(organizationId, Number(id)).first();
  return row ? normalizeProfile(row) : null;
}

async function listProfiles(env, organizationId, includeInactive = false) {
  const rows = await env.DB.prepare(`SELECT * FROM tax_supplier_profiles WHERE organization_id=?${includeInactive ? '' : ' AND active=1'} ORDER BY is_default DESC,profile_name,id`)
    .bind(organizationId).all();
  return (rows.results || []).map(normalizeProfile);
}

async function defaultProfile(env, organizationId) {
  const row = await env.DB.prepare(`SELECT * FROM tax_supplier_profiles WHERE organization_id=? AND active=1 ORDER BY is_default DESC,id LIMIT 1`)
    .bind(organizationId).first();
  if (row) return normalizeProfile(row);
  const legacy = await env.DB.prepare('SELECT * FROM tax_profiles WHERE organization_id=?').bind(organizationId).first();
  return legacy ? normalizeProfile({ ...legacy, profile_name:legacy.corp_name || '기본 공급자', is_default:1 }) : null;
}

async function resolveProfile(env, organizationId, id) {
  if (id) {
    const selected = await profileById(env, organizationId, id, true);
    if (!selected) throw new Error('선택한 공급자 정보를 찾을 수 없습니다.');
    return selected;
  }
  const fallback = await defaultProfile(env, organizationId);
  if (!fallback) throw new Error('공급자 정보를 먼저 등록해 주세요.');
  return fallback;
}

async function setDefault(env, organizationId, id, now = new Date().toISOString()) {
  const selected = await profileById(env, organizationId, id, true);
  if (!selected) throw new Error('기본 공급자로 지정할 정보를 찾을 수 없습니다.');
  await env.DB.batch([
    env.DB.prepare('UPDATE tax_supplier_profiles SET is_default=0,updated_at=? WHERE organization_id=?').bind(now, organizationId),
    env.DB.prepare('UPDATE tax_supplier_profiles SET is_default=1,updated_at=? WHERE id=? AND organization_id=? AND active=1').bind(now, id, organizationId)
  ]);
}

async function createProfile(request, env, auth, origin) {
  const body = await readJson(request);
  const profile = normalizeProfile(body);
  await assertOrganization(env, profile.organizationId);
  validateProfile(profile);
  const existing = await listProfiles(env, profile.organizationId);
  const first = existing.length === 0;
  const admin = await adminId(env, auth.session.email);
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`INSERT INTO tax_supplier_profiles
      (organization_id,profile_name,corp_num,tax_reg_id,corp_name,ceo_name,addr,biz_type,biz_class,contact_name,tel,email,is_default,active,created_at,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`)
      .bind(profile.organizationId, profile.profileName, profile.corpNum, profile.taxRegId, profile.corpName, profile.ceoName,
        profile.addr, profile.bizType, profile.bizClass, profile.contactName, profile.tel, profile.email, first ? 1 : 0, now, now, admin).run();
    const id = Number(result.meta?.last_row_id || 0);
    if (!first && body.isDefault === true) await setDefault(env, profile.organizationId, id, now);
    await audit(env, auth.session, 'finance.tax_supplier.create', String(id), `${profile.profileName}:${profile.corpName}`);
    return json({ profile:await profileById(env, profile.organizationId, id, false) }, 201, auth.response.headers, origin);
  } catch (error) {
    if (/UNIQUE/i.test(String(error?.message || ''))) throw new Error('같은 사업자번호와 종사업장번호의 공급자가 이미 등록되어 있습니다.');
    throw error;
  }
}

async function updateProfile(request, env, auth, origin, id) {
  const body = await readJson(request);
  const organizationId = text(body.organizationId || 'EKODIBIZ', 40);
  const current = await profileById(env, organizationId, id, false);
  if (!current) return json({ error:'공급자 정보를 찾을 수 없습니다.' }, 404, auth.response.headers, origin);
  const profile = normalizeProfile({ ...current, ...body, id });
  validateProfile(profile);
  const admin = await adminId(env, auth.session.email);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE tax_supplier_profiles SET profile_name=?,corp_num=?,tax_reg_id=?,corp_name=?,ceo_name=?,addr=?,biz_type=?,biz_class=?,contact_name=?,tel=?,email=?,active=1,updated_at=?,updated_by=? WHERE id=? AND organization_id=?`)
    .bind(profile.profileName, profile.corpNum, profile.taxRegId, profile.corpName, profile.ceoName, profile.addr, profile.bizType,
      profile.bizClass, profile.contactName, profile.tel, profile.email, now, admin, id, organizationId).run();
  if (body.isDefault === true) await setDefault(env, organizationId, id, now);
  await audit(env, auth.session, 'finance.tax_supplier.update', String(id), `${profile.profileName}:${profile.corpName}`);
  return json({ profile:await profileById(env, organizationId, id, false) }, 200, auth.response.headers, origin);
}

async function archiveProfile(request, env, auth, origin, id) {
  const body = await readJson(request);
  const organizationId = text(body.organizationId || 'EKODIBIZ', 40);
  const current = await profileById(env, organizationId, id, false);
  if (!current) return json({ error:'공급자 정보를 찾을 수 없습니다.' }, 404, auth.response.headers, origin);
  const active = await listProfiles(env, organizationId);
  if (active.length <= 1) return json({ error:'마지막 공급자 정보는 보관할 수 없습니다.' }, 409, auth.response.headers, origin);
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE tax_supplier_profiles SET active=0,is_default=0,updated_at=? WHERE id=? AND organization_id=?').bind(now, id, organizationId).run();
  if (current.isDefault) {
    const next = (await listProfiles(env, organizationId))[0];
    if (next) await setDefault(env, organizationId, next.id, now);
  }
  await audit(env, auth.session, 'finance.tax_supplier.archive', String(id), current.profileName);
  return json({ ok:true, profiles:await listProfiles(env, organizationId) }, 200, auth.response.headers, origin);
}

function internalRequest(request, options = {}) {
  const headers = new Headers(request.headers);
  headers.delete('origin');
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  return new Request(options.url || request.url, {
    method:options.method || request.method,
    headers,
    body:options.body === undefined ? (['GET','HEAD'].includes(options.method || request.method) ? undefined : request.clone().body) : JSON.stringify(options.body)
  });
}

async function delegate(request, env, ctx, options = {}) {
  return freeFirstWorker.fetch(internalRequest(request, options), env, ctx);
}

async function createDraft(request, env, ctx, auth, origin) {
  const body = await readJson(request);
  const organizationId = text(body.organizationId || 'EKODIBIZ', 40);
  const supplier = await resolveProfile(env, organizationId, Number(body.supplierProfileId || 0));
  const response = await delegate(request, env, ctx, { method:'POST', body });
  if (!response.ok) return response;
  const data = await response.clone().json();
  const invoiceId = Number(data?.invoice?.id || 0);
  if (invoiceId) {
    await env.DB.prepare(`UPDATE tax_invoices SET invoicer_json=?,updated_at=? WHERE id=? AND status='DRAFT'`)
      .bind(JSON.stringify(supplier), new Date().toISOString(), invoiceId).run();
    data.invoice.invoicer = supplier;
    await audit(env, auth.session, 'finance.tax_invoice.supplier.select', String(invoiceId), `${supplier.id || 'legacy'}:${supplier.profileName}`);
  }
  return json(data, response.status, auth.response.headers, origin);
}

async function approveDraft(request, env, ctx, auth, origin, id) {
  const row = await env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
  if (!row) return json({ error:'세금계산서를 찾을 수 없습니다.' }, 404, auth.response.headers, origin);
  if (row.status !== 'DRAFT') return json({ error:'초안 상태의 세금계산서만 승인할 수 있습니다.' }, 400, auth.response.headers, origin);
  let supplier = parseJson(row.invoicer_json, {});
  if (supplier?.id) supplier = await profileById(env, row.organization_id, supplier.id, true) || supplier;
  const invoicee = parseJson(row.invoicee_json, {});
  if (!profileComplete(supplier)) return json({ error:'선택한 공급자 사업자번호, 상호, 대표자 정보를 확인해 주세요.' }, 400, auth.response.headers, origin);
  if (!/^\d{10}$/.test(String(invoicee.corpNum || '')) || !invoicee.corpName || !invoicee.ceoName) {
    return json({ error:'공급받는자 사업자번호, 상호, 대표자 정보를 확인해 주세요.' }, 400, auth.response.headers, origin);
  }
  const admin = await adminId(env, auth.session.email);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE tax_invoices SET status='APPROVED',invoicer_json=?,approved_at=?,approved_by=?,last_error='',updated_at=? WHERE id=? AND status='DRAFT'`)
    .bind(JSON.stringify(supplier), now, admin, now, id).run();
  await invoiceEvent(env, id, 'approve', 'DRAFT', 'APPROVED', admin, `supplier=${supplier.profileName || supplier.corpName}`);
  await audit(env, auth.session, 'finance.tax_invoice.approve', row.document_no, `invoice:${id};supplier:${supplier.id || 'legacy'}`);
  const detailUrl = new URL(request.url); detailUrl.pathname = `/api/finance/tax-invoices/${id}`; detailUrl.search = '';
  const detail = await delegate(request, env, ctx, { method:'GET', url:detailUrl.toString() });
  const data = await detail.json();
  return json(data, detail.status, auth.response.headers, origin);
}

async function filteredInvoices(request, env, ctx, origin) {
  const url = new URL(request.url);
  const supplierProfileId = Number(url.searchParams.get('supplierProfileId') || 0);
  if (!supplierProfileId) return delegate(request, env, ctx);
  const requestedLimit = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 30)));
  url.searchParams.set('limit', '100');
  const response = await delegate(request, env, ctx, { method:'GET', url:url.toString() });
  if (!response.ok) return response;
  const data = await response.json();
  data.invoices = (data.invoices || []).filter(invoice => Number(invoice?.invoicer?.id || 0) === supplierProfileId).slice(0, requestedLimit);
  return json(data, 200, response.headers, origin);
}

async function decoratedReadiness(request, env, ctx, auth, origin) {
  const response = await delegate(request, env, ctx, { method:'GET' });
  if (!response.ok) return response;
  const data = await response.json();
  const url = new URL(request.url);
  const organizationId = text(url.searchParams.get('organizationId') || 'EKODIBIZ', 40);
  const profiles = await listProfiles(env, organizationId);
  const selected = profiles.find(profile => profile.isDefault) || profiles[0] || null;
  return json({ ...data, schemaVersion:3, multiSupplier:true, supplierProfilesCount:profiles.length, defaultSupplier:selected, profileComplete:profileComplete(selected) }, 200, auth.response.headers, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error:'허용되지 않은 요청입니다.' }, 403, null, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:corsHeaders(origin) });
    if (!env.DB) return json({ error:'D1 데이터베이스 연결이 없습니다.' }, 503, null, origin);
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/finance/tax-health') {
      const response = await delegate(request, env, ctx, { method:'GET' });
      if (!response.ok) return response;
      const data = await response.json();
      return json({ ...data, service:'ekodi-tax', multiSupplier:true, schemaVersion:3 }, 200, response.headers, origin);
    }

    const auth = await sessionCheck(request, env);
    if (!auth.session) return auth.response;

    try {
      if (request.method === 'GET' && url.pathname === '/api/finance/tax-profiles') {
        const organizationId = text(url.searchParams.get('organizationId') || 'EKODIBIZ', 40);
        return json({ profiles:await listProfiles(env, organizationId) }, 200, auth.response.headers, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/finance/tax-profiles') return createProfile(request, env, auth, origin);
      const profileRoute = url.pathname.match(/^\/api\/finance\/tax-profiles\/(\d+)$/);
      if (profileRoute && request.method === 'PUT') return updateProfile(request, env, auth, origin, Number(profileRoute[1]));
      if (profileRoute && request.method === 'DELETE') return archiveProfile(request, env, auth, origin, Number(profileRoute[1]));
      const defaultRoute = url.pathname.match(/^\/api\/finance\/tax-profiles\/(\d+)\/default$/);
      if (defaultRoute && request.method === 'POST') {
        const body = await readJson(request);
        const organizationId = text(body.organizationId || 'EKODIBIZ', 40);
        await setDefault(env, organizationId, Number(defaultRoute[1]));
        await audit(env, auth.session, 'finance.tax_supplier.default', String(defaultRoute[1]), organizationId);
        return json({ ok:true, profiles:await listProfiles(env, organizationId) }, 200, auth.response.headers, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/finance/tax-invoices/readiness') return decoratedReadiness(request, env, ctx, auth, origin);
      if (request.method === 'POST' && url.pathname === '/api/finance/tax-invoices') return createDraft(request, env, ctx, auth, origin);
      if (request.method === 'GET' && url.pathname === '/api/finance/tax-invoices') return filteredInvoices(request, env, ctx, origin);
      const approve = url.pathname.match(/^\/api\/finance\/tax-invoices\/(\d+)\/approve$/);
      if (approve && request.method === 'POST') return approveDraft(request, env, ctx, auth, origin, Number(approve[1]));
      return delegate(request, env, ctx);
    } catch (error) {
      console.error('EKODI Tax service error', error);
      const message = String(error?.message || '세금 서비스 처리 중 오류가 발생했습니다.').slice(0, 500);
      const status = /찾을 수 없습니다/.test(message) ? 404 : /입력|확인|선택|등록|지정|마지막|같은/.test(message) ? 400 : 500;
      return json({ error:message, code:'EKODI_TAX_SERVICE_ERROR' }, status, auth.response.headers, origin);
    }
  }
};
