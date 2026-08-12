import authWorker from './auth-worker.js';

const ALLOWED_ORIGINS = new Set([
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr'
]);

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
  const cors = corsHeaders(origin);
  for (const [key, value] of cors.entries()) headers.set(key, value);
  return new Response(JSON.stringify(data), { status, headers });
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

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function tossPayment(env, paymentKey, orderId) {
  if (!env.TOSS_SECRET_KEY) throw new Error('TOSS_SECRET_KEY_NOT_CONFIGURED');
  const path = paymentKey
    ? `/v1/payments/${encodeURIComponent(paymentKey)}`
    : `/v1/payments/orders/${encodeURIComponent(orderId)}`;
  const response = await fetch(`https://api.tosspayments.com${path}`, {
    headers: { authorization: `Basic ${btoa(`${env.TOSS_SECRET_KEY}:`)}` }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.code || body.message || `TOSS_${response.status}`);
  return body;
}

async function routeForOrder(env, orderId) {
  const order = await env.DB.prepare(`SELECT organization_id, business_unit_id, project_id, source_domain
    FROM payment_orders WHERE order_id = ?`).bind(orderId).first();
  return order || {
    organization_id: 'EKODIBIZ',
    business_unit_id: 'PAY',
    project_id: null,
    source_domain: 'pay.ekodi.kr'
  };
}

async function upsertPayment(env, payment) {
  if (!payment?.paymentKey || !payment?.orderId) throw new Error('INVALID_PAYMENT');
  const route = await routeForOrder(env, payment.orderId);
  const now = new Date().toISOString();
  const gross = Math.trunc(Number(payment.totalAmount ?? payment.balanceAmount ?? 0) || 0);
  const vat = Number.isFinite(Number(payment.vat)) ? Math.trunc(Number(payment.vat)) : null;
  const metadata = JSON.stringify({
    type: payment.type || '',
    mId: payment.mId || '',
    status: payment.status || '',
    method: payment.method || '',
    requestedAt: payment.requestedAt || null,
    approvedAt: payment.approvedAt || null,
    cancelCount: Array.isArray(payment.cancels) ? payment.cancels.length : 0
  });

  await env.DB.prepare(`INSERT INTO payments
    (provider,payment_key,order_id,organization_id,business_unit_id,project_id,source_domain,status,method,currency,
     gross_amount,vat_amount,fee_amount,net_amount,requested_at,approved_at,last_verified_at,metadata_json,created_at,updated_at)
    VALUES ('TOSS',?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?,?,?)
    ON CONFLICT(payment_key) DO UPDATE SET
      status=excluded.status, method=excluded.method, currency=excluded.currency,
      gross_amount=excluded.gross_amount, vat_amount=excluded.vat_amount,
      requested_at=excluded.requested_at, approved_at=excluded.approved_at,
      last_verified_at=excluded.last_verified_at, metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at`)
    .bind(
      payment.paymentKey, payment.orderId, route.organization_id, route.business_unit_id, route.project_id,
      route.source_domain, String(payment.status || 'UNKNOWN'), String(payment.method || ''),
      String(payment.currency || 'KRW'), gross, vat, payment.requestedAt || null, payment.approvedAt || null,
      now, metadata, now, now
    ).run();

  await env.DB.prepare('UPDATE payment_orders SET status = ?, updated_at = ? WHERE order_id = ?')
    .bind(String(payment.status || 'UNKNOWN'), now, payment.orderId).run();
  return route;
}

async function financeOverview(env) {
  const [payments, accounting, integrations, orgs, units, projects] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN status IN ('DONE','PARTIAL_CANCELED') THEN gross_amount ELSE 0 END),0) AS gross,
      COALESCE(SUM(CASE WHEN approved_at >= datetime('now','start of month') AND status IN ('DONE','PARTIAL_CANCELED') THEN gross_amount ELSE 0 END),0) AS month_gross
      FROM payments`).first(),
    env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN entry_type='revenue' THEN amount ELSE 0 END),0) AS revenue,
      COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END),0) AS expense,
      COUNT(*) AS entries
      FROM accounting_entries WHERE entry_date >= date('now','start of month')`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS events,
      COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed
      FROM integration_events WHERE received_at >= datetime('now','-7 day')`).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM organizations WHERE active=1').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM business_units WHERE active=1').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM projects WHERE active=1').first()
  ]);
  return {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    payments: {
      count: Number(payments.count || 0), gross: Number(payments.gross || 0), monthGross: Number(payments.month_gross || 0)
    },
    accounting: {
      monthRevenue: Number(accounting.revenue || 0), monthExpense: Number(accounting.expense || 0), entries: Number(accounting.entries || 0)
    },
    integrations: { events7d: Number(integrations.events || 0), failed7d: Number(integrations.failed || 0) },
    structure: { organizations: Number(orgs.count || 0), businessUnits: Number(units.count || 0), projects: Number(projects.count || 0) },
    readiness: {
      database: true,
      tossSecretConfigured: Boolean(env.TOSS_SECRET_KEY),
      tossLiveKey: String(env.TOSS_SECRET_KEY || '').startsWith('live_'),
      tossMidConfigured: Boolean(env.TOSS_MID),
      paymentDomain: 'https://pay.ekodi.kr',
      webhookUrl: 'https://finance-api.ekodi.kr/webhooks/toss'
    }
  };
}

async function recentPayments(env, limit) {
  const rows = await env.DB.prepare(`SELECT id,provider,payment_key AS paymentKey,order_id AS orderId,
    organization_id AS organizationId,business_unit_id AS businessUnitId,project_id AS projectId,
    source_domain AS sourceDomain,status,method,currency,gross_amount AS grossAmount,vat_amount AS vatAmount,
    fee_amount AS feeAmount,net_amount AS netAmount,approved_at AS approvedAt,last_verified_at AS lastVerifiedAt
    FROM payments ORDER BY COALESCE(approved_at,created_at) DESC LIMIT ?`).bind(limit).all();
  return rows.results;
}

async function accountingSummary(env) {
  const rows = await env.DB.prepare(`SELECT organization_id AS organizationId,business_unit_id AS businessUnitId,
    COALESCE(SUM(CASE WHEN entry_type='revenue' THEN amount ELSE 0 END),0) AS revenue,
    COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END),0) AS expense,
    COUNT(*) AS entries
    FROM accounting_entries WHERE entry_date >= date('now','start of month')
    GROUP BY organization_id,business_unit_id ORDER BY organization_id,business_unit_id`).all();
  return { period: 'month', rows: rows.results, generatedAt: new Date().toISOString() };
}

async function structure(env) {
  const [organizations, businessUnits, projects] = await Promise.all([
    env.DB.prepare('SELECT id,name,legal_name AS legalName,kind,active FROM organizations ORDER BY id').all(),
    env.DB.prepare('SELECT id,organization_id AS organizationId,name,source_domain AS sourceDomain,kind,active FROM business_units ORDER BY organization_id,id').all(),
    env.DB.prepare('SELECT id,organization_id AS organizationId,business_unit_id AS businessUnitId,code,name,active FROM projects ORDER BY code').all()
  ]);
  return { organizations: organizations.results, businessUnits: businessUnits.results, projects: projects.results };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403, null, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'ekodi-finance-api', version: 4 }, 200, null, origin);
    }
    if (!env.DB) return json({ error: 'D1 데이터베이스 연결이 없습니다.' }, 503, null, origin);

    if (request.method === 'POST' && url.pathname === '/webhooks/toss') {
      if (!env.TOSS_SECRET_KEY) return json({ error: 'Toss 서버키가 아직 연결되지 않았습니다.' }, 503, null, origin);
      const body = await readJson(request);
      if (!body) return json({ error: 'Invalid JSON' }, 400, null, origin);
      const data = body.data || body;
      const paymentKey = data.paymentKey || null;
      const orderId = data.orderId || null;
      if (!paymentKey && !orderId) return json({ ok: true, ignored: true }, 200, null, origin);
      const externalId = request.headers.get('tosspayments-webhook-transmission-id') ||
        `${body.eventType || 'PAYMENT'}:${paymentKey || orderId}:${data.status || ''}`;
      const now = new Date().toISOString();
      try {
        const verified = await tossPayment(env, paymentKey, orderId);
        const route = await upsertPayment(env, verified);
        await env.DB.prepare(`INSERT INTO integration_events
          (provider,external_id,event_type,status,received_at,processed_at,detail)
          VALUES ('TOSS',?,?,'processed',?,?,?)
          ON CONFLICT(provider,external_id) DO UPDATE SET status='processed',processed_at=excluded.processed_at,detail=excluded.detail`)
          .bind(externalId, String(body.eventType || 'PAYMENT_STATUS_CHANGED'), now, now,
            JSON.stringify({ orderId: verified.orderId, status: verified.status, organizationId: route.organization_id, businessUnitId: route.business_unit_id })).run();
        return json({ ok: true }, 200, null, origin);
      } catch (error) {
        await env.DB.prepare(`INSERT INTO integration_events
          (provider,external_id,event_type,status,received_at,detail)
          VALUES ('TOSS',?,?,'failed',?,?)
          ON CONFLICT(provider,external_id) DO UPDATE SET status='failed',detail=excluded.detail`)
          .bind(externalId, String(body.eventType || 'PAYMENT_STATUS_CHANGED'), now, String(error.message).slice(0,240)).run();
        return json({ error: '결제 상태 재검증에 실패했습니다.' }, 502, null, origin);
      }
    }

    const auth = await sessionCheck(request, env);
    if (!auth.session) return auth.response;

    try {
      if (request.method === 'GET' && url.pathname === '/api/finance/overview') {
        return json(await financeOverview(env), 200, auth.response.headers, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/finance/payments') {
        const limit = Math.min(100, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 30)));
        return json({ payments: await recentPayments(env, limit) }, 200, auth.response.headers, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/finance/accounting') {
        return json(await accountingSummary(env), 200, auth.response.headers, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/finance/structure') {
        return json(await structure(env), 200, auth.response.headers, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/finance/orders') {
        const body = await readJson(request);
        const amount = Math.trunc(Number(body?.amount));
        if (!body?.orderId || !body?.organizationId || !body?.businessUnitId || !body?.sourceDomain || !Number.isFinite(amount) || amount < 0) {
          return json({ error: '주문 분류값을 확인해 주세요.' }, 400, auth.response.headers, origin);
        }
        const now = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO payment_orders
          (order_id,organization_id,business_unit_id,project_id,source_domain,amount,currency,status,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,'CREATED',?,?)
          ON CONFLICT(order_id) DO UPDATE SET organization_id=excluded.organization_id,business_unit_id=excluded.business_unit_id,
            project_id=excluded.project_id,source_domain=excluded.source_domain,amount=excluded.amount,currency=excluded.currency,updated_at=excluded.updated_at`)
          .bind(String(body.orderId), String(body.organizationId), String(body.businessUnitId), body.projectId || null,
            String(body.sourceDomain), amount, String(body.currency || 'KRW'), now, now).run();
        await audit(env, auth.session, 'finance.order.classify', String(body.orderId), JSON.stringify({ organizationId: body.organizationId, businessUnitId: body.businessUnitId, projectId: body.projectId || null }));
        return json({ ok: true }, 201, auth.response.headers, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/finance/entries') {
        const body = await readJson(request);
        const types = new Set(['revenue','expense','asset','liability','equity','tax','transfer']);
        const directions = new Set(['debit','credit']);
        const amount = Math.trunc(Number(body?.amount));
        if (!body?.entryDate || !body?.organizationId || !body?.accountCode || !body?.accountName || !types.has(body.entryType) || !directions.has(body.direction) || !Number.isFinite(amount) || amount < 0) {
          return json({ error: '회계전표 입력값을 확인해 주세요.' }, 400, auth.response.headers, origin);
        }
        const id = await adminId(env, auth.session.email);
        await env.DB.prepare(`INSERT INTO accounting_entries
          (entry_date,organization_id,business_unit_id,project_id,entry_type,account_code,account_name,direction,amount,
           source_type,source_id,evidence_ref,memo,created_at,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,'manual','',?,?,?,?)`)
          .bind(body.entryDate, body.organizationId, body.businessUnitId || null, body.projectId || null, body.entryType,
            body.accountCode, body.accountName, body.direction, amount, String(body.evidenceRef || '').slice(0,240),
            String(body.memo || '').slice(0,500), new Date().toISOString(), id).run();
        await audit(env, auth.session, 'finance.entry.create', body.organizationId, `${body.accountCode}:${amount}`);
        return json({ ok: true }, 201, auth.response.headers, origin);
      }
      const classify = url.pathname.match(/^\/api\/finance\/payments\/(\d+)\/classification$/);
      if (classify && request.method === 'PUT') {
        const body = await readJson(request);
        if (!body?.organizationId || !body?.businessUnitId) return json({ error: '조직과 사업부를 지정해 주세요.' }, 400, auth.response.headers, origin);
        await env.DB.prepare(`UPDATE payments SET organization_id=?,business_unit_id=?,project_id=?,updated_at=? WHERE id=?`)
          .bind(body.organizationId, body.businessUnitId, body.projectId || null, new Date().toISOString(), Number(classify[1])).run();
        await audit(env, auth.session, 'finance.payment.reclassify', classify[1], JSON.stringify(body));
        return json({ ok: true }, 200, auth.response.headers, origin);
      }
      return json({ error: 'Finance API endpoint not found' }, 404, auth.response.headers, origin);
    } catch (error) {
      console.error('Finance API error', error);
      return json({ error: '결제·회계 API 처리 중 오류가 발생했습니다.', code: 'FINANCE_API_ERROR' }, 500, auth.response.headers, origin);
    }
  }
};
