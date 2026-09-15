import authWorker from './auth-worker.js';
import freeFirstWorker from './tax-invoice-free-first-worker.js';
import { parseTaxInvoiceNotice } from './tax-notice-intake.js';

const ALLOWED_ORIGINS = new Set([
  'https://ekodi.kr',
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr'
]);

function corsHeaders(origin) {
  const headers = new Headers({
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400', vary: 'Origin'
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function json(data, status = 200, baseHeaders = null, origin = '') {
  const headers = new Headers(baseHeaders || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  for (const [key, value] of corsHeaders(origin).entries()) headers.set(key, value);
  return new Response(JSON.stringify(data), { status, headers });
}
function clean(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function digits(value, max = 13) { return String(value ?? '').replace(/\D/g, '').slice(0, max); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }

async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session'; url.search = '';
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
  await env.DB.prepare('INSERT INTO audit_logs (admin_id,action,resource,detail,created_at) VALUES (?,?,?,?,?)')
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

function internalRequest(request, method, body) {
  const headers = new Headers(request.headers);
  headers.delete('origin'); headers.set('content-type', 'application/json');
  return new Request(request.url, { method, headers, body:JSON.stringify(body) });
}
function customerFromRow(row = {}) {
  return {
    id:Number(row.id) || null,
    organizationId:clean(row.organization_id || row.organizationId, 40),
    corpNum:digits(row.corp_num || row.corpNum, 10),
    taxRegId:digits(row.tax_reg_id || row.taxRegId, 4),
    corpName:clean(row.corp_name || row.corpName, 200),
    ceoName:clean(row.ceo_name || row.ceoName, 100),
    addr:clean(row.addr, 300), bizType:clean(row.biz_type || row.bizType, 100),
    bizClass:clean(row.biz_class || row.bizClass, 100), contactName:clean(row.contact_name || row.contactName, 100),
    tel:clean(row.tel, 20), hp:clean(row.hp, 20), email:clean(row.email, 100)
  };
}

function supplierFromRow(row = {}) {
  return {
    id:Number(row.id) || null, organizationId:clean(row.organization_id, 40),
    profileName:clean(row.profile_name, 100), corpNum:digits(row.corp_num, 10), taxRegId:digits(row.tax_reg_id, 4),
    corpName:clean(row.corp_name, 200), ceoName:clean(row.ceo_name, 100), addr:clean(row.addr, 300),
    bizType:clean(row.biz_type, 100), bizClass:clean(row.biz_class, 100), contactName:clean(row.contact_name, 100),
    tel:clean(row.tel, 20), email:clean(row.email, 100), isDefault:Boolean(Number(row.is_default || 0))
  };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function customerCandidates(env, organizationId, parsed) {
  const like = `%${parsed.buyerHint || '한국전력공사'}%`;
  const rows = await env.DB.prepare(`SELECT * FROM tax_customers
    WHERE organization_id=? AND active=1 AND (corp_name LIKE ? OR tax_reg_id=?)
    ORDER BY CASE WHEN tax_reg_id=? THEN 0 ELSE 1 END,corp_name,id LIMIT 20`)
    .bind(organizationId, like, parsed.buyerTaxRegId, parsed.buyerTaxRegId).all();
  return (rows.results || []).map(customerFromRow);
}

async function selectedSupplier(env, organizationId, id) {
  const row = id
    ? await env.DB.prepare('SELECT * FROM tax_supplier_profiles WHERE organization_id=? AND id=? AND active=1').bind(organizationId, id).first()
    : await env.DB.prepare('SELECT * FROM tax_supplier_profiles WHERE organization_id=? AND active=1 ORDER BY is_default DESC,id LIMIT 1').bind(organizationId).first();
  return row ? supplierFromRow(row) : null;
}

async function selectedCustomer(env, organizationId, id) {
  const row = await env.DB.prepare('SELECT * FROM tax_customers WHERE organization_id=? AND id=? AND active=1').bind(organizationId, id).first();
  return row ? customerFromRow(row) : null;
}

function supplierComplete(supplier) {
  return Boolean(supplier && /^\d{10}$/.test(supplier.corpNum) && supplier.corpName && supplier.ceoName);
}

function customerComplete(customer) {
  return Boolean(customer && /^\d{10}$/.test(customer.corpNum) && customer.corpName && customer.ceoName);
}
function memoFor(parsed) {
  const period = parsed.targetPeriod || '';
  const due = parsed.paymentDueDate || '';
  return [
    `${parsed.sender} 전력구입금액 안내`,
    `발전소 ${parsed.supplierHint || '-'} / 대상 ${period}`,
    `총구입량 ${Number(parsed.totalKwh || 0).toLocaleString('ko-KR')}kWh`,
    due ? `지급예정 ${due.slice(0,4)}-${due.slice(4,6)}-${due.slice(6,8)}` : '',
    parsed.deductionAmount ? `원격검침 수수료 ${Number(parsed.deductionAmount).toLocaleString('ko-KR')}원(VAT 포함) 지급 시 별도 차감` : '',
    `예상입금 ${Number(parsed.expectedReceiptAmount || 0).toLocaleString('ko-KR')}원`
  ].filter(Boolean).join(' · ');
}

function sourcePayload(parsed, channel) {
  return {
    provider:parsed.provider, sender:parsed.sender, supplierHint:parsed.supplierHint,
    targetPeriod:parsed.targetPeriod, totalKwh:parsed.totalKwh, unitPrice:parsed.unitPrice,
    supplyAmount:parsed.supplyAmount, taxAmount:parsed.taxAmount, totalAmount:parsed.totalAmount,
    deductionAmount:parsed.deductionAmount, expectedReceiptAmount:parsed.expectedReceiptAmount,
    paymentDueDate:parsed.paymentDueDate, buyerTaxRegId:parsed.buyerTaxRegId,
    recipientEmail:channel === 'other' ? parsed.emails.other : parsed.emails.homeTax,
    issuanceChannel:channel
  };
}
async function preview(request, env, auth, origin) {
  const body = await readJson(request);
  const organizationId = clean(body.organizationId || 'EKODIBIZ', 40);
  const parsed = parseTaxInvoiceNotice(body.message || '');
  if (!parsed.valid) return json({ preview:parsed }, 422, auth.response.headers, origin);
  const candidates = await customerCandidates(env, organizationId, parsed);
  const supplierRows = await env.DB.prepare(`SELECT * FROM tax_supplier_profiles
    WHERE organization_id=? AND active=1 ORDER BY is_default DESC,id`).bind(organizationId).all();
  const suppliers = (supplierRows.results || []).map(supplierFromRow);
  const preferredSupplier = suppliers.find(item => [item.profileName,item.corpName].some(value => value && parsed.supplierHint.includes(value))) ||
    suppliers.find(item => item.isDefault) || suppliers[0] || null;
  const preferredCustomer = candidates.find(item => item.taxRegId === parsed.buyerTaxRegId) || candidates[0] || null;
  return json({
    preview:parsed,
    suppliers,
    customerCandidates:candidates,
    preferredSupplierId:preferredSupplier?.id || null,
    preferredCustomerId:preferredCustomer?.id || null,
    humanApprovalRequired:true,
    createsDraftOnly:true
  }, 200, auth.response.headers, origin);
}
async function createDraft(request, env, ctx, auth, origin) {
  const body = await readJson(request);
  const organizationId = clean(body.organizationId || 'EKODIBIZ', 40);
  const businessUnitId = clean(body.businessUnitId || 'BIZ', 40) || null;
  const parsed = parseTaxInvoiceNotice(body.message || '');
  if (!parsed.valid) return json({ preview:parsed }, 422, auth.response.headers, origin);

  const supplier = await selectedSupplier(env, organizationId, Number(body.supplierProfileId || 0));
  if (!supplierComplete(supplier)) {
    return json({ error:'발전소에 사용할 공급자 사업자정보를 먼저 선택·완성해 주세요.', code:'TAX_NOTICE_SUPPLIER_REQUIRED', preview:parsed }, 409, auth.response.headers, origin);
  }
  const customer = await selectedCustomer(env, organizationId, Number(body.customerId || 0));
  if (!customerComplete(customer)) {
    return json({ error:'한국전력공사의 사업자번호·상호·대표자가 등록된 거래처를 선택해 주세요.', code:'TAX_NOTICE_CUSTOMER_REQUIRED', preview:parsed,
      customerCandidates:await customerCandidates(env, organizationId, parsed) }, 409, auth.response.headers, origin);
  }

  const channel = body.issuanceChannel === 'other' ? 'other' : 'hometax';
  const recipientEmail = channel === 'other' ? parsed.emails.other : parsed.emails.homeTax;
  const writeDate = /^\d{8}$/.test(digits(body.writeDate, 8)) ? digits(body.writeDate, 8) : parsed.suggestedWriteDate;
  const sourceHash = await sha256Hex([
    parsed.provider,
    supplier.corpNum,
    parsed.supplierHint,
    parsed.targetPeriod,
    parsed.buyerTaxRegId,
    parsed.totalAmount
  ].join('|'));
  const duplicate = await env.DB.prepare('SELECT id,document_no,status FROM tax_invoices WHERE source_hash=? LIMIT 1').bind(sourceHash).first();
  if (duplicate) {
    return json({ error:'같은 안내문으로 이미 만든 세금계산서가 있습니다.', code:'TAX_NOTICE_DUPLICATE',
      existing:{ id:duplicate.id, documentNo:duplicate.document_no, status:duplicate.status } }, 409, auth.response.headers, origin);
  }

  const invoicee = {
    ...customer,
    organizationId,
    taxRegId:parsed.buyerTaxRegId || customer.taxRegId,
    email:recipientEmail || customer.email
  };
  const draftBody = {
    organizationId, businessUnitId, projectId:clean(body.projectId, 80) || null,
    supplierProfileId:supplier.id, writeDate, purposeType:'청구', taxType:'과세',
    invoicee, items:[parsed.item], memo:memoFor(parsed),
    emailSubject:`${parsed.targetPeriod || ''} 전력구입 전자세금계산서`
  };
  const response = await freeFirstWorker.fetch(internalRequest(request, 'POST', draftBody), env, ctx);
  if (!response.ok) return response;
  const data = await response.clone().json();
  const invoiceId = Number(data?.invoice?.id || 0);
  if (!invoiceId) return json({ error:'세금계산서 초안 ID를 확인할 수 없습니다.' }, 500, auth.response.headers, origin);
  const now = new Date().toISOString();
  const payload = sourcePayload(parsed, channel);
  await env.DB.prepare(`UPDATE tax_invoices SET invoicer_json=?,source_type=?,source_hash=?,source_reference=?,
    source_payload_json=?,source_received_at=?,payment_due_date=?,deduction_amount=?,expected_receipt_amount=?,
    issuance_channel=?,updated_at=? WHERE id=? AND status='DRAFT'`)
    .bind(JSON.stringify(supplier), parsed.provider, sourceHash, `${parsed.supplierHint}:${parsed.targetPeriod}`,
      JSON.stringify(payload), now, parsed.paymentDueDate, parsed.deductionAmount, parsed.expectedReceiptAmount,
      channel === 'other' ? 'ASP_OTHER' : 'HOMETAX_MANUAL', now, invoiceId).run();
  const admin = await adminId(env, auth.session.email);
  await env.DB.prepare(`INSERT INTO tax_invoice_events
    (invoice_id,action,from_status,to_status,admin_id,detail,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(invoiceId, 'notice.intake', 'DRAFT', 'DRAFT', admin,
      `${parsed.provider};${parsed.targetPeriod};deduction=${parsed.deductionAmount};expected=${parsed.expectedReceiptAmount}`, now).run();
  await audit(env, auth.session, 'finance.tax_invoice.notice.intake', String(invoiceId), `${parsed.provider}:${parsed.targetPeriod}`);

  const detailRequest = new Request(request.url.replace(/\/intake\/draft(?:\?.*)?$/, `/${invoiceId}`), { method:'GET', headers:request.headers });
  const detailResponse = await freeFirstWorker.fetch(detailRequest, env, ctx);
  const detail = await detailResponse.json();
  return json({ ...detail, intake:{ preview:parsed, sourceHash, channel, humanApprovalRequired:true } }, 201, auth.response.headers, origin);
}
export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error:'허용되지 않은 요청입니다.' }, 403, null, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:corsHeaders(origin) });
    if (!env.DB) return json({ error:'D1 데이터베이스 연결이 없습니다.' }, 503, null, origin);
    const auth = await sessionCheck(request, env);
    if (!auth.session) return auth.response;
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/api/finance/tax-invoices/intake/preview') {
        return preview(request, env, auth, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/finance/tax-invoices/intake/draft') {
        return createDraft(request, env, ctx, auth, origin);
      }
      return json({ error:'Tax notice intake endpoint not found' }, 404, auth.response.headers, origin);
    } catch (error) {
      console.error('Tax notice intake error', error);
      const message = String(error?.message || '안내문 처리 중 오류가 발생했습니다.').slice(0, 500);
      const status = /이미|중복/.test(message) ? 409 : /입력|확인|선택|등록/.test(message) ? 400 : 500;
      return json({ error:message, code:'TAX_NOTICE_INTAKE_ERROR' }, status, auth.response.headers, origin);
    }
  }
};
