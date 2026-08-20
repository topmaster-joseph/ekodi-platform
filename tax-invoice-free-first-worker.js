import authWorker from './auth-worker.js';
import taxInvoiceWorker from './tax-invoice-worker.js';

const ALLOWED_ORIGINS = new Set([
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr'
]);

function automationEnabled(env) {
  return String(env.TAX_INVOICE_AUTOMATION_ENABLED || '').toLowerCase() === 'true';
}

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
  try { return await request.json(); } catch { return {}; }
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
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email=?').bind(email).first();
  return row?.id || null;
}

async function audit(env, session, action, resource, detail = '') {
  const id = await adminId(env, session.email);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id,action,resource,detail,created_at)
    VALUES (?,?,?,?,?)`)
    .bind(id, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function event(env, invoiceId, action, fromStatus, toStatus, admin, detail = '') {
  await env.DB.prepare(`INSERT INTO tax_invoice_events
    (invoice_id,action,from_status,to_status,admin_id,detail,created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(invoiceId, action, fromStatus || '', toStatus || '', admin || null, String(detail).slice(0, 1000), new Date().toISOString()).run();
}

function cleanConfirmNum(value) {
  return String(value || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 24);
}

async function markManualIssued(request, env, id, origin) {
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;

  const row = await env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
  if (!row) return json({ error: '세금계산서를 찾을 수 없습니다.' }, 404, auth.response.headers, origin);
  if (!['APPROVED', 'FAILED', 'ISSUED'].includes(row.status)) {
    return json({ error: '승인된 세금계산서만 홈택스 발행완료로 기록할 수 있습니다.' }, 400, auth.response.headers, origin);
  }

  const body = await readJson(request);
  const ntsConfirmNum = cleanConfirmNum(body?.ntsConfirmNum);
  const nextStatus = ntsConfirmNum ? 'NTS_CONFIRMED' : 'ISSUED';
  const now = new Date().toISOString();
  const admin = await adminId(env, auth.session.email);
  const providerRecord = JSON.stringify({
    mode: 'FREE_FIRST',
    provider: 'HOMETAX_MANUAL',
    recordedAt: now,
    confirmationEntered: Boolean(ntsConfirmNum)
  });

  await env.DB.prepare(`UPDATE tax_invoices SET
    status=?,provider='HOMETAX_MANUAL',provider_state_code='MANUAL_HOMETAX',
    nts_confirm_num=?,provider_issue_dt=?,provider_response_json=?,last_error='',
    issued_at=COALESCE(issued_at,?),issued_by=COALESCE(issued_by,?),updated_at=?
    WHERE id=?`)
    .bind(nextStatus, ntsConfirmNum, now, providerRecord, now, admin, now, id).run();

  await event(env, id, 'hometax.manual.record', row.status, nextStatus, admin,
    ntsConfirmNum ? `ntsConfirmNum=${ntsConfirmNum}` : 'manual issue recorded without confirmation number');
  await audit(env, auth.session, 'finance.tax_invoice.hometax.manual.record', row.document_no,
    `invoice=${id};status=${nextStatus}`);

  const updated = await env.DB.prepare('SELECT * FROM tax_invoices WHERE id=?').bind(id).first();
  return json({
    ok: true,
    invoice: {
      id: updated.id,
      documentNo: updated.document_no,
      status: updated.status,
      provider: updated.provider,
      ntsConfirmNum: updated.nts_confirm_num || '',
      issuedAt: updated.issued_at
    }
  }, 200, auth.response.headers, origin);
}

async function decorateReadiness(request, env, ctx, origin) {
  const response = await taxInvoiceWorker.fetch(request, env, ctx);
  if (!response.ok) return response;
  const data = await response.clone().json();
  const autoEnabled = automationEnabled(env);
  const autoReady = Boolean(data.credentialsConfigured);
  const usePaidAutomation = autoEnabled && autoReady;
  return json({
    ...data,
    schemaVersion: 2,
    operationPolicy: 'FREE_FIRST',
    defaultChannel: 'HOMETAX_MANUAL',
    provider: usePaidAutomation ? 'POPBILL' : 'HOMETAX_MANUAL',
    paidAutomationProvider: 'POPBILL',
    automationEnabled: autoEnabled,
    automationReady: autoReady,
    liveEnabled: usePaidAutomation && Boolean(data.liveEnabled),
    hometaxUrl: 'https://www.hometax.go.kr',
    costMode: 'FREE_DEFAULT',
    humanApprovalRequired: true
  }, 200, response.headers, origin);
}

async function decorateDraft(request, env, ctx, origin) {
  const response = await taxInvoiceWorker.fetch(request, env, ctx);
  if (!response.ok || automationEnabled(env)) return response;
  const data = await response.clone().json();
  const id = Number(data?.invoice?.id || 0);
  if (id) {
    await env.DB.prepare(`UPDATE tax_invoices SET provider='HOMETAX_MANUAL',updated_at=? WHERE id=? AND status='DRAFT'`)
      .bind(new Date().toISOString(), id).run();
    data.invoice.provider = 'HOMETAX_MANUAL';
  }
  return json(data, response.status, response.headers, origin);
}

async function protectPaidIssue(request, env, ctx, origin) {
  if (!automationEnabled(env)) {
    return json({
      error: '무료 우선 정책으로 API 자동발행이 꺼져 있습니다. 홈택스 무료 발행을 사용하세요.',
      code: 'FREE_FIRST_AUTOMATION_DISABLED',
      defaultChannel: 'HOMETAX_MANUAL'
    }, 409, null, origin);
  }
  return taxInvoiceWorker.fetch(request, env, ctx);
}

async function protectManualSync(request, env, ctx, id, origin) {
  const row = await env.DB.prepare('SELECT provider,status,document_no,nts_confirm_num,issued_at FROM tax_invoices WHERE id=?').bind(id).first();
  if (row?.provider !== 'HOMETAX_MANUAL') return taxInvoiceWorker.fetch(request, env, ctx);
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  return json({
    invoice: {
      id,
      documentNo: row.document_no,
      status: row.status,
      provider: row.provider,
      ntsConfirmNum: row.nts_confirm_num || '',
      issuedAt: row.issued_at
    },
    manual: true,
    message: '홈택스 직접 발행 건은 외부 유료 API 상태조회가 필요하지 않습니다.'
  }, 200, auth.response.headers, origin);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: '허용되지 않은 요청입니다.' }, 403, null, origin);
    }
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/finance/tax-invoices/readiness') {
      return decorateReadiness(request, env, ctx, origin);
    }

    if (request.method === 'POST' && url.pathname === '/api/finance/tax-invoices') {
      return decorateDraft(request, env, ctx, origin);
    }

    const manualIssued = url.pathname.match(/^\/api\/finance\/tax-invoices\/(\d+)\/manual-issued$/);
    if (request.method === 'POST' && manualIssued) {
      return markManualIssued(request, env, Number(manualIssued[1]), origin);
    }

    const issue = url.pathname.match(/^\/api\/finance\/tax-invoices\/(\d+)\/issue$/);
    if (request.method === 'POST' && issue) {
      return protectPaidIssue(request, env, ctx, origin);
    }

    const sync = url.pathname.match(/^\/api\/finance\/tax-invoices\/(\d+)\/sync$/);
    if (request.method === 'POST' && sync) {
      return protectManualSync(request, env, ctx, Number(sync[1]), origin);
    }

    return taxInvoiceWorker.fetch(request, env, ctx);
  }
};
