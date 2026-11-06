// EKODIBIZ AI purchase-agency intake and payment contract.
// Customer prices are never accepted from browser input; live charging fails closed.
import { readiness, activeProfileId, merchantKeys, confirmPayment } from './ekodipay-core.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const MAX_BODY = 8192;
const MAX_FEE = 5000000;
const MAX_SUPPLIER = 10000000;
const ALLOWED = new Set(['individual', 'institution']);

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function fault(code, status = 400) { return reply({ ok: false, error: code }, status); }
function text(v, limit = 200) { return String(v || '').trim().slice(0, limit); }
function integer(v, max) { return Number.isSafeInteger(v) && v >= 0 && v <= max ? v : null; }
function constantTimeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}
async function digest(value) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
}
function adminAuthorized(request, env) {
  const key = text(env.AGENCY_ADMIN_KEY, 500);
  const header = text(request.headers.get('x-ekodibiz-agency-admin'), 500);
  return key.length >= 32 && constantTimeEqual(key, header);
}
function gates(env, totalSupplier) {
  const profile = activeProfileId(env);
  const pg = readiness(env, { profileId: profile });
  const mode = pg.mode;
  const scopeApproved = env.AGENCY_PG_SCOPE_VERIFIED === 'true';
  const supplierApproved = totalSupplier === 0 || env.AGENCY_SUPPLIER_COLLECTION_VERIFIED === 'true';
  return { ok: pg.ready && pg.widget && scopeApproved && supplierApproved && (mode === 'test' || (mode === 'live' && env.AGENCY_LIVE_ENABLED === 'true')), mode, profile, pg, clientKey: merchantKeys(env, profile).clientKey };
}
async function store(env, pathname, body) {
  if (!env.REVENUE_STORE) throw new Error('store_unavailable');
  const id = env.REVENUE_STORE.idFromName('ekodibiz-global');
  const stub = env.REVENUE_STORE.get(id);
  const response = await stub.fetch('https://revenue-store.internal' + pathname, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'store_failed'), { status: response.status });
  return data;
}
function publicRecord(record) {
  return { id:record.id, type:record.type, provider:record.provider, service:record.service,
    months:record.months, status:record.status, feeAmount:record.feeAmount,
    supplierAmount:record.supplierAmount, totalAmount:record.totalAmount,
    issuedAt:record.issuedAt, quoteAt:record.quoteAt || null,
    acceptedAt:record.acceptedAt || null, paidAt:record.paidAt || null, activatedAt:record.activatedAt || null,
    expiresAt:record.expiresAt || null, guidance:record.guidance || '',
    cycleCount:Array.isArray(record.monthlyRecords)?record.monthlyRecords.length:0,
    renewalStopRecorded:!!record.renewalStopReceipt };
}
function activeStatus(record) {
  if (record.status === 'paid_pending_fulfillment' || record.status === 'active') {
    if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return 'expired';
  }
  return record.status;
}
export async function agencyApi(request, url, env) {
  const path = url.pathname.replace(/^\/ekodibiz(?=\/)/, '');
  if (!path.startsWith('/api/agency/')) return null;
  if (path === '/api/agency/health' && request.method === 'GET') {
    return reply({ ok: true, service:'ai-purchase-agency', realPaymentsEnabled: gates(env, 0).ok && gates(env, 0).mode === 'live',
      agencyScope:'approval-gated', plans:['individual-1-month','institution-3-months'] });
  }
  if (request.method !== 'POST') return fault('method_not_allowed', 405);
  if (!(request.headers.get('content-type') || '').includes('application/json')) return fault('content_type_required', 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return fault('body_too_large', 413);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin && origin !== 'https://ekodi.kr') return fault('origin_mismatch', 403);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return fault('body_too_large', 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
  } catch { return fault('invalid_json'); }
  try {
    if (path === '/api/agency/apply') {
      const type = text(body.type, 20), provider = text(body.provider, 80),
        service = text(body.service, 120), customer = text(body.customer, 80),
        email = text(body.email, 150), organization = text(body.organization, 100),
        description = text(body.description, 600);
      if (!ALLOWED.has(type) || !provider || !service || !customer ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
          (type === 'institution' && !organization) || body.consent !== true || body.terms !== true)
        return fault('application_incomplete', 422);
      if (body.cardNumber || body.password || body.apiKey) return fault('credentials_forbidden', 422);
      const id = 'EBAI-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase();
      const token = crypto.randomUUID() + crypto.randomUUID();
      const record = { id, type, months:type==='institution'?3:1, provider, service, customer,
        email, organization, description, tokenHash: await digest(token),
        status:'awaiting_quote', feeAmount:null, supplierAmount:null, totalAmount:null,
        termsVersion:'2026-11-06-v1', issuedAt:new Date().toISOString(),
        consentAt:new Date().toISOString(), audit:[{ at:new Date().toISOString(), action:'submitted' }] };
      await store(env, '/agency/create', { record });
      return reply({ ok:true, id, receiptToken:token, status:record.status, months:record.months }, 201);
    }
    if (path === '/api/agency/status' || path === '/api/agency/accept' || path === '/api/agency/checkout' || path === '/api/agency/confirm') {
      const id = text(body.id, 64), tokenHash = await digest(text(body.receiptToken, 180));
      if (!/^EBAI-[A-Z0-9]{24}$/.test(id)) return fault('invalid_receipt', 404);
      const { record } = await store(env, '/agency/load', { id, tokenHash });
      record.status = activeStatus(record);
      if (path === '/api/agency/status') return reply({ ok:true, record:publicRecord(record) });
      if (path === '/api/agency/accept') {
        if (record.status !== 'quoted' || body.accepted !== true) return fault('quote_not_ready', 409);
        const result = await store(env, '/agency/accept', { id, tokenHash });
        return reply({ ok:true, record:publicRecord(result.record) });
      }
      if (path === '/api/agency/checkout') {
        if (record.status !== 'accepted') return fault('contract_not_accepted', 409);
        const gate = gates(env, record.supplierAmount);
        if (!gate.ok) return fault('pg_or_supplier_scope_not_enabled', 503);
        const clientKey = gate.clientKey;
        if (!clientKey || !Number.isSafeInteger(record.totalAmount) || record.totalAmount < 100) return fault('price_not_ready', 409);
        return reply({ ok:true, orderId:record.id, orderName:'에코디비즈 AI 서비스 구매위탁',
          amount:record.totalAmount, clientKey, mode:gate.mode,
          customerKey:'ANONYMOUS' });
      }
      if (path === '/api/agency/confirm') {
        if (record.status === 'paid_pending_fulfillment' || record.status === 'active') return reply({ ok:true, record:publicRecord(record) });
        if (record.status !== 'accepted') return fault('contract_not_accepted', 409);
        const gate = gates(env, record.supplierAmount);
        if (!gate.ok) return fault('pg_or_supplier_scope_not_enabled', 503);
        if (body.orderId !== record.id || Number(body.amount) !== record.totalAmount ||
            !/^[A-Za-z0-9_-]{6,200}$/.test(text(body.paymentKey, 210))) return fault('payment_mismatch', 409);
        const result = await confirmPayment(env, gate.profile,
          { paymentKey:body.paymentKey, orderId:record.id, amount:record.totalAmount },
          'ai-agency-' + record.id);
        if (result.orderId !== record.id || Number(result.totalAmount) !== record.totalAmount ||
            result.status !== 'DONE') return fault('pg_confirmation_mismatch', 502);
        const saved = await store(env, '/agency/settle', { id, paymentKey:result.paymentKey, totalAmount:record.totalAmount });
        return reply({ ok:true, record:publicRecord(saved.record) });
      }
    }
    if (['/api/agency/admin/list','/api/agency/admin/quote','/api/agency/admin/activate',
      '/api/agency/admin/record-cycle','/api/agency/admin/stop-renewal','/api/agency/admin/settlement'].includes(path)) {
      if (!adminAuthorized(request, env)) return fault('admin_access_denied', 403);
      if (path === '/api/agency/admin/list') return reply({ ok:true, ...(await store(env, '/agency/admin/list', {})) });
      if (['/api/agency/admin/record-cycle','/api/agency/admin/stop-renewal','/api/agency/admin/settlement'].includes(path)) {
        const id = text(body.id,64);
        if (!/^EBAI-[A-Z0-9]{24}$/.test(id)) return fault('invalid_receipt',404);
        // Accounting evidence only. These endpoints cannot charge or cancel any provider plan.
        if (body.password || body.otp || body.cardNumber || body.apiKey || body.chatContent)
          return fault('credentials_forbidden',422);
        if (path === '/api/agency/admin/settlement') {
          return reply({ok:true,...(await store(env,'/agency/admin/settlement',{id}))});
        }
        if (body.confirmed !== true) return fault('operator_confirmation_required',422);
        if (path === '/api/agency/admin/record-cycle') {
          const cycle = integer(body.cycle,3), amount = integer(body.amount,MAX_SUPPLIER);
          const receiptRef = text(body.receiptRef,80), paidOn = text(body.paidOn,10);
          if (cycle===null || cycle<1 || amount===null || amount<1 ||
              !/^[A-Za-z0-9][A-Za-z0-9._:\/-]{5,79}$/.test(receiptRef) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn)) ||
              new Date(paidOn+'T00:00:00Z').toISOString().slice(0,10)!==paidOn ||
              Date.parse(paidOn+'T00:00:00Z')>Date.now())
            return fault('cycle_evidence_invalid',422);
          return reply({ok:true,...(await store(env,'/agency/admin/record-cycle',
            {id,cycle,amount,paidOn,receiptRef}))});
        }
        const cancellationRef = text(body.cancellationRef,80);
        if (!/^[A-Za-z0-9][A-Za-z0-9._:\/-]{5,79}$/.test(cancellationRef) || body.personalAccountKept !== true)
          return fault('renewal_stop_evidence_invalid',422);
        return reply({ok:true,...(await store(env,'/agency/admin/stop-renewal',{id,cancellationRef,personalAccountKept:true}))});
      }
      if (path === '/api/agency/admin/activate') {
        const id = text(body.id, 64);
        if (!/^EBAI-[A-Z0-9]{24}$/.test(id) || body.confirmed !== true) return fault('activation_confirmation_required', 422);
        const result = await store(env, '/agency/admin/activate', { id });
        return reply({ ok:true, record:publicRecord(result.record) });
      }
      const id = text(body.id, 64), fee = integer(body.feeAmount, MAX_FEE), supplier = integer(body.supplierAmount, MAX_SUPPLIER);
      if (!/^EBAI-[A-Z0-9]{24}$/.test(id) || fee === null || supplier === null ||
          fee + supplier < 100 || (supplier > 0 && env.AGENCY_SUPPLIER_COLLECTION_VERIFIED !== 'true'))
        return fault('invalid_quote_or_supplier_scope', 422);
      const result = await store(env, '/agency/admin/quote', {
        id, feeAmount:fee, supplierAmount:supplier, guidance:text(body.guidance, 400)
      });
      return reply({ ok:true, record:publicRecord(result.record) });
    }
    return fault('not_found', 404);
  } catch (e) {
    const status = e?.status || (e.message==='store_unavailable' ? 503 : 500);
    return fault(status === 500 ? 'internal_error' : e.message, status);
  }
}
function addMonths(dateString, months) {
  const d = new Date(dateString);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}
export async function agencyStore(request, storage) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/agency/')) return null;
  if (request.method !== 'POST') return fault('method_not_allowed', 405);
  const data = await request.json();
  if (url.pathname === '/agency/create') {
    const r = data.record;
    if (await storage.get('agency:' + r.id)) return fault('already_exists', 409);
    const rateKey = 'rate:agency:' + new Date().toISOString().slice(0, 10) + ':' + await digest(r.email.toLowerCase());
    const count = Number(await storage.get(rateKey) || 0);
    if (count >= 3) return fault('rate_limited', 429);
    await storage.put('agency:' + r.id, r);
    await storage.put(rateKey, count + 1);
    return reply({ ok:true });
  }
  if (url.pathname === '/agency/expire') {
    const records = await storage.list({ prefix:'agency:' });
    let expired = 0;
    for (const [key, record] of records) {
      if (record.status !== 'active' || activeStatus(record) !== 'expired') continue;
      record.status = 'expired';
      record.audit.push({ at:new Date().toISOString(), action:'agency_management_expired' });
      await storage.put(key, record);
      expired++;
    }
    return reply({ ok:true, expired });
  }
  if (url.pathname === '/agency/admin/list') {
    const items = [...(await storage.list({ prefix:'agency:' })).values()]
      .sort((a,b)=>String(b.issuedAt).localeCompare(String(a.issuedAt))).slice(0, 100)
      .map(r=>({ ...publicRecord({ ...r, status:activeStatus(r) }), customer:r.customer, email:r.email, organization:r.organization }));
    return reply({ ok:true, items });
  }
  const r = await storage.get('agency:' + text(data.id, 64));
  if (!r) return fault('not_found', 404);
  if (url.pathname === '/agency/load') {
    if (!constantTimeEqual(r.tokenHash, data.tokenHash)) return fault('not_found', 404);
    return reply({ ok:true, record:r });
  }
  // Read-only operator settlement of already received institutional funds.
  // A handwritten reference is not proof of external payment or cancellation.
  if (url.pathname === '/agency/admin/settlement') {
    if (r.type !== 'institution' || r.months !== 3) return fault('institution_only',409);
    const cycleRecords=Array.isArray(r.monthlyRecords)?r.monthlyRecords:[];
    const recordedTotal=cycleRecords.reduce((sum,item)=>sum+item.amount,0);
    const budget=Number.isSafeInteger(r.supplierAmount)?r.supplierAmount:0;
    return reply({ok:true,settlement:{
      id:r.id,organization:r.organization,months:3,contractStatus:activeStatus(r),
      serviceFee:r.feeAmount,providerBudget:budget,
      recordedSupplierSpending:recordedTotal,unallocatedProviderBudget:budget-recordedTotal,
      cycles:cycleRecords.map(item=>({...item})),
      renewalStopRecorded:!!r.renewalStopReceipt,
      renewalStopReceipt:r.renewalStopReceipt || null,
      accountKeptAttested:r.accountKeptAttested===true,
      limitation:'수동 기재 증빙이며 실제 은행 이체·공급사 청구·해지를 독립 검증한 결과는 아닙니다.'
    }});
  }
  if (url.pathname === '/agency/admin/record-cycle') {
    if (r.type !== 'institution' || r.months !== 3) return fault('institution_only',409);
    if (!['active','expired'].includes(activeStatus(r))) return fault('service_not_active',409);
    if (!Number.isSafeInteger(r.supplierAmount) || r.supplierAmount<=0) return fault('no_provider_budget',409);
    const {cycle,amount,paidOn,receiptRef}=data;
    if (!Number.isSafeInteger(cycle)||cycle<1||cycle>3||!Number.isSafeInteger(amount)||amount<=0||
        typeof receiptRef!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:\/-]{5,79}$/.test(receiptRef) ||
        typeof paidOn!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) ||
        Number.isNaN(Date.parse(paidOn)) || new Date(paidOn+'T00:00:00Z').toISOString().slice(0,10)!==paidOn ||
        Date.parse(paidOn+'T00:00:00Z')>Date.now()) return fault('cycle_evidence_invalid',422);
    const cycles=Array.isArray(r.monthlyRecords)?r.monthlyRecords:[];
    if (cycles.some(item=>item.cycle===cycle || item.receiptRef===receiptRef))
      return fault('cycle_already_recorded',409);
    const sum=cycles.reduce((amount,item)=>amount+item.amount,0)+amount;
    if (!Number.isSafeInteger(sum)||sum>r.supplierAmount) return fault('supplier_budget_exceeded',409);
    const at=new Date().toISOString();
    r.monthlyRecords=[...cycles,{cycle,amount,paidOn,receiptRef,recordedAt:at}].sort((a,b)=>a.cycle-b.cycle);
    r.audit.push({at,action:'manual_supplier_payment_evidence_recorded',cycle});
  } else if (url.pathname === '/agency/admin/stop-renewal') {
    if (r.type !== 'institution' || r.months !== 3) return fault('institution_only',409);
    if (!['active','expired'].includes(activeStatus(r))) return fault('service_not_active',409);
    const ref=data.cancellationRef;
    if (typeof ref!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:\/-]{5,79}$/.test(ref)||
      data.personalAccountKept!==true) return fault('renewal_stop_evidence_invalid',422);
    if (r.renewalStopReceipt) return fault('renewal_stop_already_recorded',409);
    const at=new Date().toISOString();
    r.renewalStopReceipt={receiptRef:ref,recordedAt:at};
    r.accountKeptAttested=true;
    r.audit.push({at,action:'manual_provider_renewal_stop_evidence_recorded'});
  } else if (url.pathname === '/agency/admin/quote') {
    if (!['awaiting_quote', 'quoted'].includes(r.status)) return fault('invalid_state', 409);
    r.feeAmount=data.feeAmount;r.supplierAmount=data.supplierAmount;
    r.totalAmount=data.feeAmount + data.supplierAmount;
    r.guidance=data.guidance;r.quoteAt=new Date().toISOString();r.status='quoted';
    r.audit.push({ at:r.quoteAt, action:'quoted' });
  } else if (url.pathname === '/agency/accept') {
    if (!constantTimeEqual(r.tokenHash, data.tokenHash)) return fault('not_found', 404);
    if (r.status!=='quoted') return fault('invalid_state', 409);
    r.acceptedAt=new Date().toISOString();r.status='accepted';
    r.audit.push({at:r.acceptedAt,action:'quote_accepted'});
  } else if (url.pathname === '/agency/settle') {
    // Only the outer worker calls this after an authenticated Toss confirmation.
    if (r.status === 'paid_pending_fulfillment' || r.status === 'active') return reply({ ok:true, record:r });
    if (r.status!=='accepted' || r.totalAmount!==data.totalAmount) return fault('invalid_state', 409);
    r.paymentKey=data.paymentKey;r.paidAt=new Date().toISOString();
    // Paid is not supplied: the three/one-month service clock starts on verified activation.
    r.status='paid_pending_fulfillment';
    r.audit.push({at:r.paidAt,action:'pg_confirmed'});
  } else if (url.pathname === '/agency/admin/activate') {
    if (r.status !== 'paid_pending_fulfillment') return fault('invalid_state', 409);
    r.activatedAt = new Date().toISOString();
    r.expiresAt = addMonths(r.activatedAt, r.months);
    r.status = 'active';
    r.audit.push({at:r.activatedAt,action:'supplier_activation_verified'});
  } else return fault('not_found', 404);
  await storage.put('agency:' + r.id, r);
  return reply({ok:true,record:r});
}
