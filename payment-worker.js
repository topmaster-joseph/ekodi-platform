const PAY_ORIGINS = new Set([
  'https://pay.ekodi.kr',
  'https://pay.biz.ekodi.kr'
]);

const TEST_AMOUNT = 1000;
const TEST_ORDER_NAME = 'EKODI Pay 테스트 결제';

function corsHeaders(origin) {
  const headers = new Headers({
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin'
  });
  if (origin && PAY_ORIGINS.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function json(data, status = 200, origin = '') {
  const headers = corsHeaders(origin);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function secretMode(env) {
  const secret = String(env.TOSS_SECRET_KEY || '');
  if (secret.startsWith('test_')) return 'test';
  if (secret.startsWith('live_')) return 'live';
  return secret ? 'unknown' : 'unconfigured';
}

function makeOrderId() {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 24);
  return `EKODI_TEST_${random}`;
}

async function createTestOrder(env) {
  const orderId = makeOrderId();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO payment_orders
    (order_id,organization_id,business_unit_id,project_id,source_domain,amount,currency,status,created_at,updated_at)
    VALUES (?,'EKODIBIZ','PAY',NULL,'pay.ekodi.kr',?,'KRW','CREATED',?,?)`)
    .bind(orderId, TEST_AMOUNT, now, now).run();
  return { orderId, amount: TEST_AMOUNT, currency: 'KRW', orderName: TEST_ORDER_NAME };
}

async function storedOrder(env, orderId) {
  return env.DB.prepare(`SELECT order_id AS orderId, organization_id AS organizationId,
    business_unit_id AS businessUnitId, project_id AS projectId, source_domain AS sourceDomain,
    amount, currency, status FROM payment_orders WHERE order_id = ?`).bind(orderId).first();
}

async function tossConfirm(env, paymentKey, orderId, amount) {
  const secret = String(env.TOSS_SECRET_KEY || '');
  if (!secret) throw new Error('TOSS_SECRET_KEY_NOT_CONFIGURED');
  const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${secret}:`)}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ paymentKey, orderId, amount })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('TOSS_CONFIRM_FAILED');
    error.providerCode = String(body.code || 'TOSS_CONFIRM_FAILED');
    error.providerMessage = String(body.message || '결제 승인에 실패했습니다.').slice(0, 200);
    throw error;
  }
  return body;
}

async function upsertPayment(env, payment, order) {
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
      payment.paymentKey, payment.orderId, order.organizationId, order.businessUnitId, order.projectId || null,
      order.sourceDomain, String(payment.status || 'UNKNOWN'), String(payment.method || ''),
      String(payment.currency || 'KRW'), gross, vat, payment.requestedAt || null, payment.approvedAt || null,
      now, metadata, now, now
    ).run();

  await env.DB.prepare('UPDATE payment_orders SET status = ?, updated_at = ? WHERE order_id = ?')
    .bind(String(payment.status || 'UNKNOWN'), now, payment.orderId).run();

  const externalId = `confirm:${payment.paymentKey}`;
  await env.DB.prepare(`INSERT INTO integration_events
    (provider,external_id,event_type,status,received_at,processed_at,detail)
    VALUES ('TOSS',?,'PAYMENT_CONFIRMED','processed',?,?,?)
    ON CONFLICT(provider,external_id) DO UPDATE SET status='processed',processed_at=excluded.processed_at,detail=excluded.detail`)
    .bind(externalId, now, now, JSON.stringify({ orderId: payment.orderId, status: payment.status })).run();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (origin && !PAY_ORIGINS.has(origin)) return json({ error: '허용되지 않은 결제 요청입니다.' }, 403, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (!env.DB) return json({ error: '결제 데이터베이스 연결이 없습니다.' }, 503, origin);

    const url = new URL(request.url);
    const mode = secretMode(env);

    if (request.method === 'GET' && url.pathname === '/api/payments/status') {
      return json({
        ready: mode === 'test' || mode === 'live',
        mode,
        midConfigured: Boolean(env.TOSS_MID),
        testAmount: TEST_AMOUNT
      }, 200, origin);
    }

    if (request.method === 'POST' && url.pathname === '/api/payments/test-order') {
      if (mode === 'unconfigured') return json({ error: 'Toss 서버키가 아직 연결되지 않았습니다.' }, 503, origin);
      if (mode !== 'test') return json({ error: '테스트 주문은 테스트 시크릿 키에서만 생성됩니다.' }, 409, origin);
      return json(await createTestOrder(env), 201, origin);
    }

    if (request.method === 'POST' && url.pathname === '/api/payments/confirm') {
      const body = await readJson(request);
      const paymentKey = String(body?.paymentKey || '');
      const orderId = String(body?.orderId || '');
      const amount = Math.trunc(Number(body?.amount));
      if (!paymentKey || !orderId || !Number.isFinite(amount) || amount <= 0) {
        return json({ error: '결제 승인값을 확인해 주세요.' }, 400, origin);
      }

      const order = await storedOrder(env, orderId);
      if (!order || !PAY_ORIGINS.has(`https://${order.sourceDomain}`)) {
        return json({ error: '등록되지 않은 결제 주문입니다.' }, 404, origin);
      }
      if (String(order.currency || 'KRW') !== 'KRW' || Number(order.amount) !== amount) {
        return json({ error: '결제 금액 검증에 실패했습니다.' }, 409, origin);
      }

      try {
        const payment = await tossConfirm(env, paymentKey, orderId, Number(order.amount));
        if (payment.orderId !== orderId || Number(payment.totalAmount) !== Number(order.amount)) {
          return json({ error: '토스 승인 결과 검증에 실패했습니다.' }, 409, origin);
        }
        await upsertPayment(env, payment, order);
        return json({
          ok: true,
          mode,
          payment: {
            paymentKey: payment.paymentKey,
            orderId: payment.orderId,
            status: payment.status,
            method: payment.method || '',
            totalAmount: Number(payment.totalAmount || 0),
            approvedAt: payment.approvedAt || null
          }
        }, 200, origin);
      } catch (error) {
        const now = new Date().toISOString();
        const externalId = `confirm-failed:${orderId}:${paymentKey.slice(0, 48)}`;
        await env.DB.prepare(`INSERT INTO integration_events
          (provider,external_id,event_type,status,received_at,detail)
          VALUES ('TOSS',?,'PAYMENT_CONFIRM','failed',?,?)
          ON CONFLICT(provider,external_id) DO UPDATE SET status='failed',detail=excluded.detail`)
          .bind(externalId, now, JSON.stringify({ orderId, code: error.providerCode || error.message })).run();
        return json({
          error: '토스 결제 승인에 실패했습니다.',
          code: error.providerCode || 'TOSS_CONFIRM_FAILED',
          message: error.providerMessage || '잠시 후 다시 시도해 주세요.'
        }, 502, origin);
      }
    }

    return json({ error: 'Payment API endpoint not found' }, 404, origin);
  }
};
