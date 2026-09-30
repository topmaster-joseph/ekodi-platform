import authWorker from './auth-worker.js';

const ALLOWED_ORIGINS = new Set([
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr'
]);
const PURPOSE_TYPES = new Set(['영수', '청구', '없음']);
const TAX_TYPES = new Set(['과세', '영세', '면세']);
const TOKEN_CACHE = new Map();

function corsHeaders(origin) {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
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

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), {
    method: 'GET', headers: request.headers
  }), env);
  if (!response.ok) return { response };
  return { response, session: await response.clone().json() };
}

async function adminId(env, email) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
  return row?.id || null;
}

async function audit(env, session, action, resource, detail = '') {
  const id = await adminId(env, session.email);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function event(env, invoiceId, action, fromStatus, toStatus, admin, detail = '') {
  await env.DB.prepare(`INSERT INTO tax_invoice_events
    (invoice_id,action,from_status,to_status,admin_id,detail,created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(invoiceId, action, fromStatus || '', toStatus || '', admin || null, String(detail).slice(0, 1000), new Date().toISOString()).run();
}

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function digits(value, max = 13) {
  return String(value ?? '').replace(/\D/g, '').slice(0, max);
}

function positiveInt(value, field) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} 금액을 확인해 주세요.`);
  return number;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeProfile(input = {}) {
  return {
    organizationId: text(input.organizationId || input.organization_id || 'EKODIBIZ', 40),
    corpNum: digits(input.corpNum || input.corp_num, 10),
    taxRegId: digits(input.taxRegId || input.tax_reg_id, 4),
    corpName: text(input.corpName || input.corp_name, 200),
    ceoName: text(input.ceoName || input.ceo_name, 100),
    addr: text(input.addr, 300),
    bizType: text(input.bizType || input.biz_type, 100),
    bizClass: text(input.bizClass || input.biz_class, 100),
    contactName: text(input.contactName || input.contact_name, 100),
    tel: text(input.tel, 20),
    email: text(input.email, 100)
  };
}

function normalizeCustomer(input = {}) {
  return {
    id: Number(input.id) || null,
    organizationId: text(input.organizationId || input.organization_id || 'EKODIBIZ', 40),
    corpNum: digits(input.corpNum || input.corp_num, 10),
    taxRegId: digits(input.taxRegId || input.tax_reg_id, 4),
    corpName: text(input.corpName || input.corp_name, 200),
    ceoName: text(input.ceoName || input.ceo_name, 100),
    addr: text(input.addr, 300),
    bizType: text(input.bizType || input.biz_type, 100),
    bizClass: text(input.bizClass || input.biz_class, 100),
    contactName: text(input.contactName || input.contact_name, 100),
    tel: text(input.tel, 20),
    hp: text(input.hp, 20),
    email: text(input.email, 100)
  };
}

function profileComplete(profile) {
  return Boolean(profile && /^\d{10}$/.test(profile.corpNum) && profile.corpName && profile.ceoName);
}

function customerComplete(customer) {
  return Boolean(customer && /^\d{10}$/.test(customer.corpNum) && customer.corpName && customer.ceoName);
}

function normalizeItems(rawItems, taxType) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new Error('품목을 한 개 이상 입력해 주세요.');
  if (rawItems.length > 99) throw new Error('품목은 최대 99개까지 입력할 수 있습니다.');
  return rawItems.map((raw, index) => {
    const supplyCost = positiveInt(raw?.supplyCost, `${index + 1}번째 공급가액`);
    const tax = taxType === '과세'
      ? (raw?.tax === undefined || raw?.tax === null || raw?.tax === '' ? Math.floor(supplyCost * 0.1) : positiveInt(raw.tax, `${index + 1}번째 세액`))
      : 0;
    return {
      serialNum: index + 1,
      purchaseDT: text(raw?.purchaseDT, 8),
      itemName: text(raw?.itemName, 100),
      spec: text(raw?.spec, 60),
      qty: text(raw?.qty || '1', 12),
      unitCost: text(raw?.unitCost || String(supplyCost), 18),
      supplyCost,
      tax,
      remark: text(raw?.remark, 100)
    };
  });
}

function normalizeWriteDate(value) {
  const writeDate = digits(value, 8);
  if (!/^\d{8}$/.test(writeDate)) throw new Error('작성일자는 YYYYMMDD 형식으로 입력해 주세요.');
  return writeDate;
}

function makeDocumentNo(writeDate) {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `E${writeDate.slice(2)}-${suffix}`;
}

function normalizeDocumentNo(value, writeDate) {
  const documentNo = text(value || makeDocumentNo(writeDate), 24);
  if (!/^[A-Za-z0-9_-]{1,24}$/.test(documentNo)) throw new Error('문서번호는 영문, 숫자, -, _ 조합 24자 이내여야 합니다.');
  return documentNo;
}

function invoiceFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    businessUnitId: row.business_unit_id,
    projectId: row.project_id,
    documentNo: row.document_no,
    writeDate: row.write_date,
    purposeType: row.purpose_type,
    taxType: row.tax_type,
    status: row.status,
    provider: row.provider,
    customerId: row.customer_id,
    supplyAmount: Number(row.supply_amount || 0),
    taxAmount: Number(row.tax_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    invoicer: parseJson(row.invoicer_json, {}),
    invoicee: parseJson(row.invoicee_json, {}),
    items: parseJson(row.items_json, []),
    memo: row.memo || '',
    emailSubject: row.email_subject || '',
    ntsConfirmNum: row.nts_confirm_num || '',
    providerStateCode: row.provider_state_code || '',
    providerIssueDt: row.provider_issue_dt || '',
    lastError: row.last_error || '',
    approvedAt: row.approved_at,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function profileFor(env, organizationId) {
  const row = await env.DB.prepare(`SELECT organization_id,corp_num,tax_reg_id,corp_name,ceo_name,addr,biz_type,biz_class,contact_name,tel,email
    FROM tax_profiles WHERE organization_id=?`).bind(organizationId).first();
  return row ? normalizeProfile(row) : normalizeProfile({ organizationId });
}

async function upsertCustomer(env, customer) {
  if (!/^\d{10}$/.test(customer.corpNum) || !customer.corpName) throw new Error('거래처 사업자번호 10자리와 상호를 입력해 주세요.');
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO tax_customers
    (organization_id,corp_num,tax_reg_id,corp_name,ceo_name,addr,biz_type,biz_class,contact_name,tel,hp,email,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
    ON CONFLICT(organization_id,corp_num,tax_reg_id) DO UPDATE SET
      corp_name=excluded.corp_name,ceo_name=excluded.ceo_name,addr=excluded.addr,biz_type=excluded.biz_type,
      biz_class=excluded.biz_class,contact_name=excluded.contact_name,tel=excluded.tel,hp=excluded.hp,email=excluded.email,
      active=1,updated_at=excluded.updated_at`)
    .bind(customer.organizationId, customer.corpNum, customer.taxRegId, customer.corpName, customer.ceoName,
      customer.addr, customer.bizType, customer.bizClass, customer.contactName, customer.tel, customer.hp, customer.email, now, now).run();
  return env.DB.prepare(`SELECT id,organization_id,corp_num,tax_reg_id,corp_name,ceo_name,addr,biz_type,biz_class,contact_name,tel,hp,email
    FROM tax_customers WHERE organization_id=? AND corp_num=? AND tax_reg_id=?`)
    .bind(customer.organizationId, customer.corpNum, customer.taxRegId).first();
}

async function assertScope(env, organizationId, businessUnitId, projectId) {
  const organization = await env.DB.prepare('SELECT id FROM organizations WHERE id=? AND active=1').bind(organizationId).first();
  if (!organization) throw new Error('유효한 조직을 선택해 주세요.');
  if (businessUnitId) {
    const unit = await env.DB.prepare('SELECT id FROM business_units WHERE id=? AND organization_id=? AND active=1').bind(businessUnitId, organizationId).first();
    if (!unit) throw new Error('선택한 사업부가 조직에 속하지 않습니다.');
  }
  if (projectId) {
    const project = await env.DB.prepare('SELECT id FROM projects WHERE id=? AND organization_id=? AND active=1').bind(projectId, organizationId).first();
    if (!project) throw new Error('선택한 프로젝트가 조직에 속하지 않습니다.');
  }
}

async function saveDraft(env, session, body) {
  const organizationId = text(body?.organizationId || 'EKODIBIZ', 40);
  const businessUnitId = text(body?.businessUnitId || 'BIZ', 40) || null;
  const projectId = text(body?.projectId, 80) || null;
  await assertScope(env, organizationId, businessUnitId, projectId);
  const writeDate = normalizeWriteDate(body?.writeDate);
  const purposeType = PURPOSE_TYPES.has(body?.purposeType) ? body.purposeType : '청구';
  const taxType = TAX_TYPES.has(body?.taxType) ? body.taxType : '과세';
  const documentNo = normalizeDocumentNo(body?.documentNo, writeDate);
  const items = normalizeItems(body?.items, taxType);
  const supplyAmount = items.reduce((sum, item) => sum + item.supplyCost, 0);
  const taxAmount = items.reduce((sum, item) => sum + item.tax, 0);
  const invoicee = normalizeCustomer({ ...(body?.invoicee || {}), organizationId });
  const customerRow = await upsertCustomer(env, invoicee);
  const customer = normalizeCustomer(customerRow);
  const invoicer = await profileFor(env, organizationId);
  const admin = await adminId(env, session.email);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO tax_invoices
    (organization_id,business_unit_id,project_id,document_no,write_date,purpose_type,tax_type,status,provider,customer_id,
     supply_amount,tax_amount,total_amount,invoicer_json,invoicee_json,items_json,memo,email_subject,created_at,created_by,updated_at)
    VALUES (?,?,?,?,?,?,?,'DRAFT','POPBILL',?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(organizationId, businessUnitId, projectId, documentNo, writeDate, purposeType, taxType, customerRow.id,
      supplyAmount, taxAmount, supplyAmount + taxAmount, JSON.stringify(invoicer), JSON.stringify(customer), JSON.stringify(items),
      text(body?.memo, 200), text(body?.emailSubject, 300), now, admin, now).run();
  const invoiceId = Number(result.meta?.last_row_id || 0);
  await event(env, invoiceId, 'draft.create', '', 'DRAFT', admin, `${documentNo}:${supplyAmount + taxAmount}`);
  await audit(env, session, 'finance.tax_invoice.draft.create', documentNo, `${customer.corpName}:${supplyAmount + taxAmount}`);
  return env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(invoiceId).first();
}

async function listInvoices(env, url) {
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 30)));
  const status = text(url.searchParams.get('status'), 30);
  const organizationId = text(url.searchParams.get('organizationId') || 'EKODIBIZ', 40);
  const query = status
    ? `SELECT * FROM tax_invoices WHERE organization_id=? AND status=? ORDER BY write_date DESC,id DESC LIMIT ?`
    : `SELECT * FROM tax_invoices WHERE organization_id=? ORDER BY write_date DESC,id DESC LIMIT ?`;
  const result = status
    ? await env.DB.prepare(query).bind(organizationId, status, limit).all()
    : await env.DB.prepare(query).bind(organizationId, limit).all();
  return result.results.map(invoiceFromRow);
}

async function invoiceDetail(env, id) {
  const row = await env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
  if (!row) return null;
  const events = await env.DB.prepare(`SELECT action,from_status AS fromStatus,to_status AS toStatus,detail,created_at AS createdAt
    FROM tax_invoice_events WHERE invoice_id=? ORDER BY created_at DESC,id DESC`).bind(id).all();
  return { ...invoiceFromRow(row), events: events.results };
}

async function approveInvoice(env, session, id) {
  const row = await env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
  if (!row) throw new Error('세금계산서를 찾을 수 없습니다.');
  if (row.status !== 'DRAFT') throw new Error('초안 상태의 세금계산서만 승인할 수 있습니다.');
  const invoicer = await profileFor(env, row.organization_id);
  const invoicee = parseJson(row.invoicee_json, {});
  if (!profileComplete(invoicer)) throw new Error('공급자 사업자번호, 상호, 대표자 정보를 먼저 완성해 주세요.');
  if (!customerComplete(invoicee)) throw new Error('공급받는자 사업자번호, 상호, 대표자 정보를 확인해 주세요.');
  const admin = await adminId(env, session.email);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE tax_invoices SET status='APPROVED',invoicer_json=?,approved_at=?,approved_by=?,last_error='',updated_at=? WHERE id=? AND status='DRAFT'`)
    .bind(JSON.stringify(invoicer), now, admin, now, id).run();
  await event(env, id, 'approve', 'DRAFT', 'APPROVED', admin, '관리자 발행 승인');
  await audit(env, session, 'finance.tax_invoice.approve', row.document_no, `invoice:${id}`);
  return env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bytesToBase64(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

async function sha256Base64(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64(digest);
}

async function hmacBase64(secretBase64, value) {
  const key = await crypto.subtle.importKey('raw', base64ToBytes(secretBase64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64(signature);
}

function popbillEnvironment(env) {
  const production = String(env.TAX_INVOICE_ENV || '').toLowerCase() === 'production';
  return {
    production,
    serviceId: production ? 'POPBILL' : 'POPBILL_TEST',
    apiBase: production ? 'https://popbill.linkhub.co.kr' : 'https://popbill-test.linkhub.co.kr'
  };
}

function providerConfigured(env) {
  return Boolean(env.POPBILL_LINK_ID && env.POPBILL_SECRET_KEY);
}

async function popbillToken(env, corpNum) {
  if (!providerConfigured(env)) throw new Error('팝빌 API 키가 아직 연결되지 않았습니다.');
  const target = popbillEnvironment(env);
  const cacheKey = `${target.serviceId}:${corpNum}`;
  const cached = TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const body = JSON.stringify({ access_id: corpNum, scope: ['110', 'member'] });
  const bodyDigest = await sha256Base64(body);
  const requestDT = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const forwarded = text(env.POPBILL_FORWARDED_IP || '*', 80) || '*';
  const version = '2.0';
  const resource = `/${target.serviceId}/Token`;
  const stringToSign = ['POST', bodyDigest, requestDT, forwarded, version, resource].join('\n');
  const signature = await hmacBase64(String(env.POPBILL_SECRET_KEY), stringToSign);
  const response = await fetch(`https://auth.linkhub.co.kr${resource}`, {
    method: 'POST',
    headers: {
      authorization: `LINKHUB ${env.POPBILL_LINK_ID} ${signature}`,
      'content-type': 'application/json',
      'x-lh-forwarded': forwarded,
      'x-lh-date': requestDT,
      'x-lh-version': version
    },
    body
  });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok || !result.session_token) throw new Error(result.message || result.error || `팝빌 인증 실패 (${response.status})`);
  const expiration = Date.parse(result.expiration || '');
  TOKEN_CACHE.set(cacheKey, { token: result.session_token, expiresAt: Number.isFinite(expiration) ? expiration : Date.now() + 25 * 60_000 });
  return result.session_token;
}

function popbillPayload(invoice) {
  const invoicer = invoice.invoicer;
  const invoicee = invoice.invoicee;
  return {
    issueType: '정발행',
    taxType: invoice.taxType,
    chargeDirection: '정과금',
    writeDate: invoice.writeDate,
    purposeType: invoice.purposeType,
    supplyCostTotal: String(invoice.supplyAmount),
    taxTotal: String(invoice.taxAmount),
    totalAmount: String(invoice.totalAmount),
    invoicerMgtKey: invoice.documentNo,
    invoicerCorpNum: invoicer.corpNum,
    invoicerTaxRegID: invoicer.taxRegId || undefined,
    invoicerCorpName: invoicer.corpName,
    invoicerCEOName: invoicer.ceoName,
    invoicerAddr: invoicer.addr || undefined,
    invoicerBizType: invoicer.bizType || undefined,
    invoicerBizClass: invoicer.bizClass || undefined,
    invoicerContactName: invoicer.contactName || undefined,
    invoicerTEL: invoicer.tel || undefined,
    invoicerEmail: invoicer.email || undefined,
    invoicerSMSSendYN: false,
    invoiceeType: '사업자',
    invoiceeCorpNum: invoicee.corpNum,
    invoiceeTaxRegID: invoicee.taxRegId || undefined,
    invoiceeCorpName: invoicee.corpName,
    invoiceeCEOName: invoicee.ceoName,
    invoiceeAddr: invoicee.addr || undefined,
    invoiceeBizType: invoicee.bizType || undefined,
    invoiceeBizClass: invoicee.bizClass || undefined,
    invoiceeContactName1: invoicee.contactName || undefined,
    invoiceeTEL1: invoicee.tel || undefined,
    invoiceeHP1: invoicee.hp || undefined,
    invoiceeEmail1: invoicee.email || undefined,
    invoiceeSMSSendYN: false,
    detailList: invoice.items.map(item => ({
      serialNum: item.serialNum,
      purchaseDT: item.purchaseDT || invoice.writeDate,
      itemName: item.itemName,
      spec: item.spec || '',
      qty: item.qty || '1',
      unitCost: item.unitCost || String(item.supplyCost),
      supplyCost: String(item.supplyCost),
      tax: String(item.tax),
      remark: item.remark || ''
    })),
    memo: invoice.memo || undefined,
    emailSubject: invoice.emailSubject || undefined,
    writeSpecification: false,
    forceIssue: false
  };
}

function compactObject(value) {
  if (Array.isArray(value)) return value.map(compactObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && item !== '')
    .map(([key, item]) => [key, compactObject(item)]));
}

async function popbillIssue(env, invoice) {
  const profileCorpNum = invoice.invoicer?.corpNum || '';
  const configuredCorpNum = digits(env.POPBILL_CORP_NUM, 10);
  if (configuredCorpNum && configuredCorpNum !== profileCorpNum) throw new Error('팝빌 회원 사업자번호와 공급자 프로필 사업자번호가 일치하지 않습니다.');
  const corpNum = configuredCorpNum || profileCorpNum;
  if (!/^\d{10}$/.test(corpNum)) throw new Error('팝빌 발행 사업자번호가 설정되지 않았습니다.');
  const token = await popbillToken(env, corpNum);
  const target = popbillEnvironment(env);
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'accept-language': 'ko-KR',
    'x-http-method-override': 'ISSUE'
  };
  if (env.POPBILL_USER_ID) headers['x-pb-userid'] = String(env.POPBILL_USER_ID);
  const payload = compactObject(popbillPayload(invoice));
  const response = await fetch(`${target.apiBase}/Taxinvoice`, { method: 'POST', headers, body: JSON.stringify(payload) });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok || Number(result.code || 0) < 0) throw new Error(result.message || `팝빌 발행 실패 (${response.status})`);
  return result;
}

async function popbillInfo(env, invoice) {
  const profileCorpNum = invoice.invoicer?.corpNum || '';
  const configuredCorpNum = digits(env.POPBILL_CORP_NUM, 10);
  const corpNum = configuredCorpNum || profileCorpNum;
  if (!/^\d{10}$/.test(corpNum)) throw new Error('팝빌 발행 사업자번호가 설정되지 않았습니다.');
  const token = await popbillToken(env, corpNum);
  const target = popbillEnvironment(env);
  const headers = { authorization: `Bearer ${token}`, 'accept-language': 'ko-KR' };
  if (env.POPBILL_USER_ID) headers['x-pb-userid'] = String(env.POPBILL_USER_ID);
  const response = await fetch(`${target.apiBase}/Taxinvoice/SELL/${encodeURIComponent(invoice.documentNo)}`, { headers });
  let result = {};
  try { result = await response.json(); } catch {}
  if (!response.ok) throw new Error(result.message || `팝빌 상태조회 실패 (${response.status})`);
  return Array.isArray(result) ? (result[0] || {}) : result;
}

async function issueInvoice(env, session, id) {
  const row = await env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
  if (!row) throw new Error('세금계산서를 찾을 수 없습니다.');
  if (row.status !== 'APPROVED') throw new Error('관리자 승인이 완료된 세금계산서만 발행할 수 있습니다.');
  const invoice = invoiceFromRow(row);
  if (!profileComplete(invoice.invoicer) || !customerComplete(invoice.invoicee)) throw new Error('발행에 필요한 공급자·공급받는자 정보를 확인해 주세요.');
  const target = popbillEnvironment(env);
  if (target.production && String(env.TAX_INVOICE_LIVE_ENABLED || '').toLowerCase() !== 'true') {
    throw new Error('운영 발행 잠금이 켜져 있습니다. TAX_INVOICE_LIVE_ENABLED가 활성화되어야 합니다.');
  }
  if (!providerConfigured(env)) throw new Error('팝빌 API 키가 아직 연결되지 않았습니다. 초안과 승인 기능은 계속 사용할 수 있습니다.');

  const admin = await adminId(env, session.email);
  const startedAt = new Date().toISOString();
  await env.DB.prepare(`UPDATE tax_invoices SET status='ISSUING',last_error='',updated_at=? WHERE id=? AND status='APPROVED'`)
    .bind(startedAt, id).run();
  await event(env, id, 'issue.start', 'APPROVED', 'ISSUING', admin, target.production ? 'production' : 'sandbox');
  try {
    const result = await popbillIssue(env, invoice);
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE tax_invoices SET status='ISSUED',nts_confirm_num=?,provider_state_code='300',provider_issue_dt=?,provider_response_json=?,issued_at=?,issued_by=?,updated_at=? WHERE id=?`)
      .bind(text(result.ntsConfirmNum || result.ntsconfirmNum, 24), text(result.issueDT, 14), JSON.stringify(result).slice(0, 4000), now, admin, now, id).run();
    await event(env, id, 'issue.success', 'ISSUING', 'ISSUED', admin, text(result.ntsConfirmNum || result.ntsconfirmNum, 24));
    await audit(env, session, 'finance.tax_invoice.issue', row.document_no, `provider=POPBILL;env=${target.production ? 'production' : 'sandbox'}`);
  } catch (error) {
    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE tax_invoices SET status='FAILED',last_error=?,updated_at=? WHERE id=?`)
      .bind(String(error.message).slice(0, 500), now, id).run();
    await event(env, id, 'issue.failed', 'ISSUING', 'FAILED', admin, error.message);
    throw error;
  }
  return env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
}

async function syncInvoice(env, session, id) {
  const row = await env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
  if (!row) throw new Error('세금계산서를 찾을 수 없습니다.');
  if (row.status === 'DRAFT' || row.status === 'APPROVED') throw new Error('아직 외부 발행을 시도하지 않은 세금계산서입니다.');
  const invoice = invoiceFromRow(row);
  const result = await popbillInfo(env, invoice);
  const stateCode = Number(result.stateCode || 0);
  let nextStatus = row.status;
  if (stateCode === 304) nextStatus = 'NTS_CONFIRMED';
  else if (stateCode === 305) nextStatus = 'FAILED';
  else if (stateCode === 600) nextStatus = 'CANCELED';
  else if (stateCode >= 300 && stateCode <= 303) nextStatus = 'ISSUED';
  const admin = await adminId(env, session.email);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE tax_invoices SET status=?,provider_state_code=?,nts_confirm_num=?,provider_response_json=?,last_error=?,updated_at=? WHERE id=?`)
    .bind(nextStatus, String(stateCode || ''), text(result.ntsconfirmNum || result.ntsConfirmNum || row.nts_confirm_num, 24),
      JSON.stringify(result).slice(0, 4000), stateCode === 305 ? text(result.ntssendErrCode || result.ntsresult || '국세청 전송 실패', 500) : '', now, id).run();
  await event(env, id, 'provider.sync', row.status, nextStatus, admin, `stateCode=${stateCode || 'unknown'}`);
  await audit(env, session, 'finance.tax_invoice.sync', row.document_no, `stateCode=${stateCode || 'unknown'}`);
  return env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
}

async function summary(env, organizationId) {
  const rows = await env.DB.prepare(`SELECT status,COUNT(*) AS count,COALESCE(SUM(total_amount),0) AS amount
    FROM tax_invoices WHERE organization_id=? AND write_date >= strftime('%Y%m01','now') GROUP BY status`).bind(organizationId).all();
  const counts = {};
  let monthAmount = 0;
  for (const row of rows.results) {
    counts[row.status] = Number(row.count || 0);
    if (['ISSUED', 'NTS_CONFIRMED'].includes(row.status)) monthAmount += Number(row.amount || 0);
  }
  return { monthAmount, counts };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403, null, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (!env.DB) return json({ error: 'D1 데이터베이스 연결이 없습니다.' }, 503, null, origin);

    const auth = await sessionCheck(request, env);
    if (!auth.session) return auth.response;
    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && url.pathname === '/api/finance/tax-invoices/readiness') {
        const organizationId = text(url.searchParams.get('organizationId') || 'EKODIBIZ', 40);
        const profile = await profileFor(env, organizationId);
        const target = popbillEnvironment(env);
        return json({
          schemaVersion: 1,
          provider: 'POPBILL',
          environment: target.production ? 'production' : 'sandbox',
          credentialsConfigured: providerConfigured(env),
          liveEnabled: !target.production || String(env.TAX_INVOICE_LIVE_ENABLED || '').toLowerCase() === 'true',
          profileComplete: profileComplete(profile),
          humanApprovalRequired: true,
          ...await summary(env, organizationId)
        }, 200, auth.response.headers, origin);
      }

      if (request.method === 'GET' && url.pathname === '/api/finance/tax-profile') {
        const organizationId = text(url.searchParams.get('organizationId') || 'EKODIBIZ', 40);
        return json({ profile: await profileFor(env, organizationId) }, 200, auth.response.headers, origin);
      }

      if (request.method === 'PUT' && url.pathname === '/api/finance/tax-profile') {
        const body = await readJson(request);
        if (!body) return json({ error: '입력값을 확인해 주세요.' }, 400, auth.response.headers, origin);
        const profile = normalizeProfile(body);
        await assertScope(env, profile.organizationId, null, null);
        const admin = await adminId(env, auth.session.email);
        const now = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO tax_profiles
          (organization_id,corp_num,tax_reg_id,corp_name,ceo_name,addr,biz_type,biz_class,contact_name,tel,email,updated_at,updated_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(organization_id) DO UPDATE SET corp_num=excluded.corp_num,tax_reg_id=excluded.tax_reg_id,corp_name=excluded.corp_name,
            ceo_name=excluded.ceo_name,addr=excluded.addr,biz_type=excluded.biz_type,biz_class=excluded.biz_class,contact_name=excluded.contact_name,
            tel=excluded.tel,email=excluded.email,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
          .bind(profile.organizationId, profile.corpNum, profile.taxRegId, profile.corpName, profile.ceoName, profile.addr, profile.bizType,
            profile.bizClass, profile.contactName, profile.tel, profile.email, now, admin).run();
        await audit(env, auth.session, 'finance.tax_profile.update', profile.organizationId, `${profile.corpName}:${profile.corpNum ? 'corp-set' : 'corp-empty'}`);
        return json({ ok: true, profile: await profileFor(env, profile.organizationId) }, 200, auth.response.headers, origin);
      }

      if (request.method === 'GET' && url.pathname === '/api/finance/tax-customers') {
        const organizationId = text(url.searchParams.get('organizationId') || 'EKODIBIZ', 40);
        const q = text(url.searchParams.get('q'), 100);
        const limit = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 50)));
        const result = q
          ? await env.DB.prepare(`SELECT * FROM tax_customers WHERE organization_id=? AND active=1 AND (corp_name LIKE ? OR corp_num LIKE ?) ORDER BY corp_name LIMIT ?`).bind(organizationId, `%${q}%`, `%${digits(q, 10)}%`, limit).all()
          : await env.DB.prepare(`SELECT * FROM tax_customers WHERE organization_id=? AND active=1 ORDER BY corp_name LIMIT ?`).bind(organizationId, limit).all();
        return json({ customers: result.results.map(normalizeCustomer) }, 200, auth.response.headers, origin);
      }

      if (request.method === 'POST' && url.pathname === '/api/finance/tax-customers') {
        const body = await readJson(request);
        const customer = normalizeCustomer(body || {});
        await assertScope(env, customer.organizationId, null, null);
        const saved = await upsertCustomer(env, customer);
        await audit(env, auth.session, 'finance.tax_customer.upsert', customer.corpNum, customer.corpName);
        return json({ customer: normalizeCustomer(saved) }, 201, auth.response.headers, origin);
      }

      if (request.method === 'GET' && url.pathname === '/api/finance/tax-invoices') {
        return json({ invoices: await listInvoices(env, url) }, 200, auth.response.headers, origin);
      }

      if (request.method === 'POST' && url.pathname === '/api/finance/tax-invoices') {
        const body = await readJson(request);
        if (!body) return json({ error: '입력값을 확인해 주세요.' }, 400, auth.response.headers, origin);
        const row = await saveDraft(env, auth.session, body);
        return json({ invoice: invoiceFromRow(row) }, 201, auth.response.headers, origin);
      }

      const detail = url.pathname.match(/^\/api\/finance\/tax-invoices\/(\d+)$/);
      if (detail && request.method === 'GET') {
        const invoice = await invoiceDetail(env, Number(detail[1]));
        return invoice ? json({ invoice }, 200, auth.response.headers, origin) : json({ error: '세금계산서를 찾을 수 없습니다.' }, 404, auth.response.headers, origin);
      }

      const approve = url.pathname.match(/^\/api\/finance\/tax-invoices\/(\d+)\/approve$/);
      if (approve && request.method === 'POST') {
        const row = await approveInvoice(env, auth.session, Number(approve[1]));
        return json({ invoice: invoiceFromRow(row) }, 200, auth.response.headers, origin);
      }

      const issue = url.pathname.match(/^\/api\/finance\/tax-invoices\/(\d+)\/issue$/);
      if (issue && request.method === 'POST') {
        const row = await issueInvoice(env, auth.session, Number(issue[1]));
        return json({ invoice: invoiceFromRow(row) }, 200, auth.response.headers, origin);
      }

      const sync = url.pathname.match(/^\/api\/finance\/tax-invoices\/(\d+)\/sync$/);
      if (sync && request.method === 'POST') {
        const row = await syncInvoice(env, auth.session, Number(sync[1]));
        return json({ invoice: invoiceFromRow(row) }, 200, auth.response.headers, origin);
      }

      return json({ error: 'Tax invoice endpoint not found' }, 404, auth.response.headers, origin);
    } catch (error) {
      console.error('Tax invoice API error', error);
      const message = String(error?.message || '세금계산서 처리 중 오류가 발생했습니다.').slice(0, 500);
      const status = /찾을 수 없습니다/.test(message) ? 404 : /입력|확인|선택|승인|설정|연결|잠금|상태/.test(message) ? 400 : 500;
      return json({ error: message, code: 'TAX_INVOICE_API_ERROR' }, status, auth.response.headers, origin);
    }
  }
};
