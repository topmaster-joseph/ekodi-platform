const encoder = new TextEncoder();

const DEFAULT_ORIGINS = [
  'https://admin.ekodi.kr',
  'https://admin.biz.ekodi.kr',
  'https://admin.church.ekodi.kr',
  'https://admin.lab.ekodi.kr',
  'https://admin.trade.ekodi.kr',
];

const SERVICE_SEED = Object.freeze([
  ['root', 'EKODI Root', 'ekodi.kr', 'core', null, null, 'critical'],
  ['admin', 'EKODI Admin', 'admin.ekodi.kr', 'core', null, null, 'critical'],
  ['auth', 'Auth API', 'api.ekodi.kr', 'core', null, null, 'critical'],
  ['ops', 'Ops API', 'ops-api.ekodi.kr', 'core', null, null, 'critical'],
  ['pay', 'EKODI Pay', 'pay.ekodi.kr', 'finance', 'EKODIBIZ', 'PAY', 'critical'],
  ['mail', 'EKODI Mail', 'mail.ekodi.kr', 'communication', null, null, 'normal'],
  ['live', 'EKODI Live', 'live.ekodi.kr', 'communication', null, null, 'normal'],
  ['cloud', 'EKODI Cloud', 'cloud.ekodi.kr', 'workspace', null, null, 'normal'],
  ['biz', 'EKODI Biz', 'biz.ekodi.kr', 'organization', 'EKODIBIZ', 'BIZ', 'critical'],
  ['mall', 'EKODI Mall', 'mall.ekodi.kr', 'commerce', 'EKODIBIZ', 'MALL', 'normal'],
  ['trade', 'EKODI Trading', 'trade.ekodi.kr', 'commerce', 'EKODIBIZ', 'TRADE', 'critical'],
  ['books', 'EKODI Books', 'books.ekodi.kr', 'publishing', 'EKODIBIZ', 'BOOKS', 'normal'],
  ['marketing', 'Marketing AI', 'marketing.ekodi.kr', 'workspace', 'EKODIBIZ', 'MARKETING', 'normal'],
  ['church', 'EKODI Church', 'church.ekodi.kr', 'organization', 'EKODICHURCH', 'CHURCH', 'critical'],
  ['lab', 'EKODI Lab', 'lab.ekodi.kr', 'organization', 'EKODILAB', 'LAB', 'normal'],
  ['cgma', 'Cheonggye Market', 'cgma.ekodi.kr', 'community', 'CGMA', 'CGMA', 'normal'],
]);

const ORG_SEED = Object.freeze([
  ['EKODIBIZ', '에코디비즈', '에코디비즈', 'business'],
  ['EKODICHURCH', '에코디교회', '에코디교회', 'church'],
  ['EKODILAB', '에코디연구소', '에코디연구소', 'research'],
  ['CGMA', '청계면상인회', '청계면상인회', 'association'],
]);

const UNIT_SEED = Object.freeze([
  ['BIZ', 'EKODIBIZ', '에코디비즈 본부', 'biz.ekodi.kr', 'business'],
  ['PAY', 'EKODIBIZ', '결제 허브', 'pay.ekodi.kr', 'payment'],
  ['MALL', 'EKODIBIZ', '에코디몰', 'mall.ekodi.kr', 'commerce'],
  ['TRADE', 'EKODIBIZ', '글로벌 무역', 'trade.ekodi.kr', 'trade'],
  ['BOOKS', 'EKODIBIZ', '에코디북스', 'books.ekodi.kr', 'publishing'],
  ['MARKETING', 'EKODIBIZ', '마케팅 AI', 'marketing.ekodi.kr', 'marketing'],
  ['CHURCH', 'EKODICHURCH', '교회 사역', 'church.ekodi.kr', 'ministry'],
  ['LAB', 'EKODILAB', '연구·교육', 'lab.ekodi.kr', 'research'],
  ['CGMA', 'CGMA', '상권 운영', 'cgma.ekodi.kr', 'community'],
]);

function configuredOrigins(env = {}) {
  return new Set(String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));
}

function cors(origin, env = {}) {
  const headers = {
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && configuredOrigins(env).has(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(data, status = 200, origin = null, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(origin, env),
    },
  });
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function authenticate(request, db) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;
  const tokenHash = await sha256(authorization.slice(7));
  return db.prepare(`SELECT admins.id, admins.email, admins.role, sessions.expires_at
    FROM sessions JOIN admins ON admins.id = sessions.admin_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, new Date().toISOString()).first();
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function audit(db, adminId, action, resource, detail = '') {
  await db.prepare('INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(adminId || null, action, resource, String(detail).slice(0, 500), new Date().toISOString()).run();
}

async function seedRegistry(db) {
  const now = new Date().toISOString();
  const org = db.prepare(`INSERT OR IGNORE INTO organizations
    (id, name, legal_name, kind, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`);
  await db.batch(ORG_SEED.map(row => org.bind(...row, now, now)));

  const unit = db.prepare(`INSERT OR IGNORE INTO business_units
    (id, organization_id, name, source_domain, kind, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`);
  await db.batch(UNIT_SEED.map(row => unit.bind(...row, now, now)));

  const service = db.prepare(`INSERT OR IGNORE INTO service_registry_v4
    (id, name, domain, category, organization_id, business_unit_id, criticality, monitor_enabled, note, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, '', ?)`);
  await db.batch(SERVICE_SEED.map(row => service.bind(...row, now)));
}

function serviceStatus(httpStatus, responseTime) {
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 400) return 'offline';
  return responseTime > 2500 ? 'degraded' : 'online';
}

async function checkService(service) {
  const started = performance.now();
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(`https://${service.domain}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'EKODI-Ops/4.0' },
    });
    await response.body?.cancel();
    const responseTime = Math.round(performance.now() - started);
    return {
      ...service,
      status: serviceStatus(response.status, responseTime),
      httpStatus: response.status,
      responseTime,
      checkedAt,
      error: null,
    };
  } catch (error) {
    return {
      ...service,
      status: 'offline',
      httpStatus: null,
      responseTime: Math.round(performance.now() - started),
      checkedAt,
      error: error?.name === 'TimeoutError' ? 'timeout' : String(error?.message || error),
    };
  }
}

async function tossQuery(env, paymentKey, orderId) {
  if (!env.TOSS_SECRET_KEY) throw new Error('TOSS_SECRET_KEY_NOT_CONFIGURED');
  const identifier = paymentKey
    ? `/v1/payments/${encodeURIComponent(paymentKey)}`
    : `/v1/payments/orders/${encodeURIComponent(orderId)}`;
  const authorization = btoa(`${env.TOSS_SECRET_KEY}:`);
  const response = await fetch(`https://api.tosspayments.com${identifier}`, {
    method: 'GET',
    headers: { authorization: `Basic ${authorization}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code || data.message || `TOSS_${response.status}`);
  return data;
}

async function paymentRoute(db, orderId) {
  const order = await db.prepare(`SELECT organization_id, business_unit_id, project_id, source_domain
    FROM payment_orders WHERE order_id = ?`).bind(orderId).first();
  if (order) return order;
  return { organization_id: 'EKODIBIZ', business_unit_id: 'PAY', project_id: null, source_domain: 'pay.ekodi.kr' };
}

function paymentMetadata(payment) {
  return JSON.stringify({
    type: payment.type || '',
    mId: payment.mId || '',
    method: payment.method || '',
    status: payment.status || '',
    requestedAt: payment.requestedAt || null,
    approvedAt: payment.approvedAt || null,
    cancelCount: Array.isArray(payment.cancels) ? payment.cancels.length : 0,
  });
}

async function upsertPayment(db, payment) {
  if (!payment?.paymentKey || !payment?.orderId) throw new Error('INVALID_PAYMENT_OBJECT');
  const route = await paymentRoute(db, payment.orderId);
  const verifiedAt = new Date().toISOString();
  const gross = Number(payment.totalAmount ?? payment.balanceAmount ?? 0) || 0;
  const vat = Number.isFinite(Number(payment.vat)) ? Number(payment.vat) : null;
  await db.prepare(`INSERT INTO payments
    (provider, payment_key, order_id, organization_id, business_unit_id, project_id, source_domain,
     status, method, currency, gross_amount, vat_amount, fee_amount, net_amount, requested_at,
     approved_at, last_verified_at, metadata_json, created_at, updated_at)
    VALUES ('TOSS', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(payment_key) DO UPDATE SET
      status=excluded.status, method=excluded.method, currency=excluded.currency,
      gross_amount=excluded.gross_amount, vat_amount=excluded.vat_amount,
      requested_at=excluded.requested_at, approved_at=excluded.approved_at,
      last_verified_at=excluded.last_verified_at, metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at`)
    .bind(
      payment.paymentKey,
      payment.orderId,
      route.organization_id,
      route.business_unit_id,
      route.project_id,
      route.source_domain,
      String(payment.status || 'UNKNOWN'),
      String(payment.method || ''),
      String(payment.currency || 'KRW'),
      gross,
      vat,
      payment.requestedAt || null,
      payment.approvedAt || null,
      verifiedAt,
      paymentMetadata(payment),
      verifiedAt,
      verifiedAt,
    ).run();

  await db.prepare(`UPDATE payment_orders SET status=?, updated_at=? WHERE order_id=?`)
    .bind(String(payment.status || 'UNKNOWN'), verifiedAt, payment.orderId).run();
  return { ...route, grossAmount: gross, status: payment.status || 'UNKNOWN' };
}

async function overview(db, env) {
  const [orgs, units, projects, paymentStats, ledgerStats, integrationStats] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM organizations WHERE active=1').first(),
    db.prepare('SELECT COUNT(*) AS count FROM business_units WHERE active=1').first(),
    db.prepare('SELECT COUNT(*) AS count FROM projects WHERE active=1').first(),
    db.prepare(`SELECT COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN status IN ('DONE','PARTIAL_CANCELED') THEN gross_amount ELSE 0 END),0) AS gross,
      COALESCE(SUM(CASE WHEN approved_at >= datetime('now','start of month') AND status IN ('DONE','PARTIAL_CANCELED') THEN gross_amount ELSE 0 END),0) AS month_gross
      FROM payments`).first(),
    db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN entry_type='revenue' THEN amount ELSE 0 END),0) AS revenue,
      COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END),0) AS expense,
      COUNT(*) AS count
      FROM accounting_entries WHERE entry_date >= date('now','start of month')`).first(),
    db.prepare(`SELECT COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed
      FROM integration_events WHERE received_at >= datetime('now','-7 day')`).first(),
  ]);
  return {
    organizations: Number(orgs.count || 0),
    businessUnits: Number(units.count || 0),
    projects: Number(projects.count || 0),
    payments: {
      count: Number(paymentStats.count || 0),
      gross: Number(paymentStats.gross || 0),
      monthGross: Number(paymentStats.month_gross || 0),
    },
    accounting: {
      monthRevenue: Number(ledgerStats.revenue || 0),
      monthExpense: Number(ledgerStats.expense || 0),
      entries: Number(ledgerStats.count || 0),
    },
    integrations: {
      events7d: Number(integrationStats.count || 0),
      failed7d: Number(integrationStats.failed || 0),
    },
    readiness: {
      tossSecretConfigured: Boolean(env.TOSS_SECRET_KEY),
      tossLiveKey: String(env.TOSS_SECRET_KEY || '').startsWith('live_'),
      tossMidConfigured: Boolean(env.TOSS_MID),
      webhookUrl: 'https://ops-api.ekodi.kr/webhooks/toss',
    },
    generatedAt: new Date().toISOString(),
  };
}

async function structure(db) {
  const [organizations, units, projects] = await Promise.all([
    db.prepare('SELECT id, name, legal_name, kind, active FROM organizations ORDER BY id').all(),
    db.prepare('SELECT id, organization_id, name, source_domain, kind, active FROM business_units ORDER BY organization_id, id').all(),
    db.prepare('SELECT id, organization_id, business_unit_id, code, name, active FROM projects ORDER BY code').all(),
  ]);
  return { organizations: organizations.results, businessUnits: units.results, projects: projects.results };
}

async function services(db) {
  const result = await db.prepare(`SELECT id, name, domain, category, organization_id AS organizationId,
    business_unit_id AS businessUnitId, criticality FROM service_registry_v4
    WHERE monitor_enabled=1 ORDER BY CASE criticality WHEN 'critical' THEN 0 ELSE 1 END, id`).all();
  const checks = await Promise.all(result.results.map(checkService));
  return {
    summary: {
      total: checks.length,
      online: checks.filter(item => item.status === 'online').length,
      degraded: checks.filter(item => item.status === 'degraded').length,
      offline: checks.filter(item => item.status === 'offline').length,
    },
    services: checks,
    generatedAt: new Date().toISOString(),
  };
}

async function payments(db, limit) {
  const result = await db.prepare(`SELECT id, provider, payment_key AS paymentKey, order_id AS orderId,
    organization_id AS organizationId, business_unit_id AS businessUnitId, project_id AS projectId,
    source_domain AS sourceDomain, status, method, currency, gross_amount AS grossAmount,
    vat_amount AS vatAmount, fee_amount AS feeAmount, net_amount AS netAmount,
    approved_at AS approvedAt, last_verified_at AS lastVerifiedAt
    FROM payments ORDER BY COALESCE(approved_at, created_at) DESC LIMIT ?`).bind(limit).all();
  return result.results;
}

async function accountingSummary(db) {
  const totals = await db.prepare(`SELECT organization_id AS organizationId, business_unit_id AS businessUnitId,
    COALESCE(SUM(CASE WHEN entry_type='revenue' THEN amount ELSE 0 END),0) AS revenue,
    COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount ELSE 0 END),0) AS expense,
    COUNT(*) AS entries
    FROM accounting_entries
    WHERE entry_date >= date('now','start of month')
    GROUP BY organization_id, business_unit_id
    ORDER BY organization_id, business_unit_id`).all();
  return { period: 'month', rows: totals.results, generatedAt: new Date().toISOString() };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    if (origin && !configuredOrigins(env).has(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403, origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'ekodi-ops-api', version: 4 }, 200, origin, env);
    }
    if (!env.DB) return json({ error: 'D1 데이터베이스 연결이 없습니다.' }, 503, origin, env);

    try {
      await seedRegistry(env.DB);

      if (request.method === 'POST' && url.pathname === '/webhooks/toss') {
        if (!env.TOSS_SECRET_KEY) return json({ error: 'Toss 라이브 시크릿 키가 아직 연결되지 않았습니다.' }, 503, origin, env);
        const body = await readBody(request);
        if (!body) return json({ error: 'Invalid JSON' }, 400, origin, env);
        const data = body.data || body;
        const paymentKey = data.paymentKey || null;
        const orderId = data.orderId || null;
        const transmissionId = request.headers.get('tosspayments-webhook-transmission-id') || `${body.eventType || 'PAYMENT'}:${paymentKey || orderId || crypto.randomUUID()}`;
        if (!paymentKey && !orderId) return json({ ok: true, ignored: true }, 200, origin, env);

        try {
          const verified = await tossQuery(env, paymentKey, orderId);
          const route = await upsertPayment(env.DB, verified);
          await env.DB.prepare(`INSERT INTO integration_events
            (provider, external_id, event_type, status, received_at, processed_at, detail)
            VALUES ('TOSS', ?, ?, 'processed', ?, ?, ?)
            ON CONFLICT(provider, external_id) DO UPDATE SET status='processed', processed_at=excluded.processed_at, detail=excluded.detail`)
            .bind(transmissionId, String(body.eventType || 'PAYMENT_STATUS_CHANGED'), new Date().toISOString(), new Date().toISOString(), JSON.stringify({ orderId: verified.orderId, status: verified.status, businessUnitId: route.business_unit_id })).run();
          return json({ ok: true }, 200, origin, env);
        } catch (error) {
          await env.DB.prepare(`INSERT INTO integration_events
            (provider, external_id, event_type, status, received_at, detail)
            VALUES ('TOSS', ?, ?, 'failed', ?, ?)
            ON CONFLICT(provider, external_id) DO UPDATE SET status='failed', detail=excluded.detail`)
            .bind(transmissionId, String(body.eventType || 'PAYMENT_STATUS_CHANGED'), new Date().toISOString(), String(error.message).slice(0, 240)).run();
          return json({ error: '결제 상태 재검증에 실패했습니다.' }, 502, origin, env);
        }
      }

      const admin = await authenticate(request, env.DB);
      if (!admin) return json({ error: '관리자 인증이 필요합니다.' }, 401, origin, env);

      if (request.method === 'GET' && url.pathname === '/api/overview') {
        return json(await overview(env.DB, env), 200, origin, env);
      }
      if (request.method === 'GET' && url.pathname === '/api/readiness') {
        return json({
          database: true,
          tossSecretConfigured: Boolean(env.TOSS_SECRET_KEY),
          tossLiveKey: String(env.TOSS_SECRET_KEY || '').startsWith('live_'),
          tossMidConfigured: Boolean(env.TOSS_MID),
          webhookUrl: 'https://ops-api.ekodi.kr/webhooks/toss',
          paymentDomain: 'https://pay.ekodi.kr',
          accountingModel: 'organization > business_unit > project',
        }, 200, origin, env);
      }
      if (request.method === 'GET' && url.pathname === '/api/structure') {
        return json(await structure(env.DB), 200, origin, env);
      }
      if (request.method === 'GET' && url.pathname === '/api/services/health') {
        return json(await services(env.DB), 200, origin, env);
      }
      if (request.method === 'GET' && url.pathname === '/api/payments') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
        return json({ payments: await payments(env.DB, limit) }, 200, origin, env);
      }
      if (request.method === 'GET' && url.pathname === '/api/accounting/summary') {
        return json(await accountingSummary(env.DB), 200, origin, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/accounting/entries') {
        const body = await readBody(request);
        const validTypes = new Set(['revenue','expense','asset','liability','equity','tax','transfer']);
        const validDirections = new Set(['debit','credit']);
        const amount = Math.trunc(Number(body?.amount));
        if (!body || !body.organizationId || !body.entryDate || !body.accountCode || !body.accountName || !validTypes.has(body.entryType) || !validDirections.has(body.direction) || !Number.isFinite(amount) || amount < 0) {
          return json({ error: '회계전표 입력값을 확인해 주세요.' }, 400, origin, env);
        }
        await env.DB.prepare(`INSERT INTO accounting_entries
          (entry_date, organization_id, business_unit_id, project_id, entry_type, account_code, account_name,
           direction, amount, source_type, source_id, evidence_ref, memo, created_at, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', '', ?, ?, ?, ?)`)
          .bind(body.entryDate, body.organizationId, body.businessUnitId || null, body.projectId || null,
            body.entryType, body.accountCode, body.accountName, body.direction, amount,
            String(body.evidenceRef || '').slice(0, 240), String(body.memo || '').slice(0, 500),
            new Date().toISOString(), admin.id).run();
        await audit(env.DB, admin.id, 'accounting.entry.create', body.organizationId, `${body.accountCode}:${amount}`);
        return json({ ok: true }, 201, origin, env);
      }
      if (request.method === 'PUT' && url.pathname.match(/^\/api\/payments\/\d+\/classification$/)) {
        const paymentId = Number(url.pathname.split('/')[3]);
        const body = await readBody(request);
        if (!body?.organizationId || !body?.businessUnitId) return json({ error: '조직과 사업부를 지정해 주세요.' }, 400, origin, env);
        await env.DB.prepare(`UPDATE payments SET organization_id=?, business_unit_id=?, project_id=?, updated_at=? WHERE id=?`)
          .bind(body.organizationId, body.businessUnitId, body.projectId || null, new Date().toISOString(), paymentId).run();
        await audit(env.DB, admin.id, 'payment.classification.update', String(paymentId), JSON.stringify(body));
        return json({ ok: true }, 200, origin, env);
      }

      return json({ error: 'Not found' }, 404, origin, env);
    } catch (error) {
      console.error('EKODI Ops API error', error);
      return json({ error: '운영 API 내부 오류가 발생했습니다.', code: 'OPS_API_ERROR' }, 500, origin, env);
    }
  },
};
