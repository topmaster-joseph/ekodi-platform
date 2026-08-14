import { computeSourceEconomics, sourceExecution } from './sourcing.js';

const VALID_FEE_RATES = new Set([7,8,9,10]);
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const randomId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const enabled = (value) => String(value || '').toLowerCase() === 'true';

async function authenticate(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ') || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const response = await fetch(`${String(env.SUPABASE_URL).replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization }
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

async function readJson(request) { try { return await request.json(); } catch { return {}; } }

function sourceView(row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name || '',
    providerType: row.provider_type || '',
    sourceUrl: row.source_url,
    sourceRef: row.source_ref || '',
    internalLabel: row.internal_label || '',
    costAmount: row.cost_amount,
    shippingAmount: row.shipping_amount,
    stockState: row.stock_state,
    fulfillmentMode: row.fulfillment_mode,
    rightsStatus: row.rights_status,
    orderPermission: row.order_permission,
    piiPermission: row.pii_permission,
    active: Boolean(row.active),
    providerAutoOrderEnabled: Boolean(row.provider_auto_order_enabled),
    priority: row.priority,
    minMarginAmount: row.min_margin_amount,
    minMarginPercent: row.min_margin_percent
  };
}

export async function handleSourcingPlanRequest(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/sourcing\/products\/(prd_[a-f0-9]{32})\/plan$/i);
  if (!match || request.method !== 'POST') return null;
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };
  const user = await authenticate(request,env);
  if (!user) return { status: 401, body: { error: 'Google 판매자 로그인이 필요합니다.', code: 'SELLER_AUTH_REQUIRED' } };

  const product = await env.DB.prepare('SELECT id,name,price FROM products WHERE id=? AND seller_id=?').bind(match[1],user.id).first();
  if (!product) return { status: 404, body: { error: '본인 상품을 찾을 수 없습니다.' } };
  if (!Number.isInteger(product.price) || product.price <= 0) return { status: 409, body: { error: 'Auto Source 비교를 하려면 EKODI 판매가격을 먼저 확정해 주세요.' } };
  const body = await readJson(request);
  const requestedRate = Math.trunc(Number(body.feeRatePercent));
  const feeRatePercent = VALID_FEE_RATES.has(requestedRate) ? requestedRate : 9;

  const rows = await env.DB.prepare(`SELECT ss.*,sp.display_name AS provider_name,sp.provider_type,
    sp.auto_order_enabled AS provider_auto_order_enabled,psl.priority,psl.min_margin_amount,psl.min_margin_percent
    FROM product_source_links psl
    JOIN sourcing_sources ss ON ss.id=psl.source_id
    JOIN sourcing_providers sp ON sp.id=ss.provider_id
    WHERE psl.product_id=? AND ss.seller_id=? AND psl.active=1 AND ss.active=1
    ORDER BY psl.priority ASC,ss.updated_at DESC`).bind(product.id,user.id).all();

  const candidates = [];
  for (const row of rows.results || []) {
    const source = sourceView(row);
    const execution = sourceExecution(row,env);
    const economics = row.cost_amount === null ? null : computeSourceEconomics({
      saleAmount: product.price,
      costAmount: row.cost_amount,
      shippingAmount: row.shipping_amount,
      feeRatePercent,
      minMarginAmount: row.min_margin_amount,
      minMarginPercent: row.min_margin_percent
    });
    let eligible = false;
    let reason = execution.reason;
    if (execution.mode === 'external_checkout') {
      eligible = true;
      reason = '외부몰에서 고객이 직접 결제하는 제휴경로';
    } else if (execution.mode === 'blocked') {
      eligible = false;
    } else if (!economics) {
      reason = '공급원가가 없어 마진검증 불가';
    } else if (!economics.economicallyEligible) {
      reason = `최소 마진 기준 미달 · ${row.min_margin_amount || 0}원 / ${row.min_margin_percent || 0}%`;
    } else {
      eligible = execution.mode === 'manual_forward' || execution.mode === 'api_order';
      if (!eligible) reason = execution.reason;
    }
    candidates.push({ source,execution,economics,eligible,reason });
  }

  const ranked = candidates.slice().sort((a,b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    const am = a.economics?.contributionMargin ?? -1;
    const bm = b.economics?.contributionMargin ?? -1;
    if (bm !== am) return bm - am;
    return (a.source.priority || 100) - (b.source.priority || 100);
  });
  const selected = ranked.find((item) => item.eligible) || null;
  const decision = selected || ranked[0] || null;
  if (decision) {
    const e = decision.economics || computeSourceEconomics({ saleAmount: product.price,feeRatePercent });
    await env.DB.prepare(`INSERT INTO procurement_decisions
      (id,product_id,seller_id,source_id,fee_rate_percent,sale_amount,landed_cost,platform_fee_amount,contribution_margin,contribution_margin_percent,execution_mode,decision_status,reason,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(randomId('dec'),product.id,user.id,decision.source.id,feeRatePercent,e.saleAmount,e.landedCost,e.platformFeeAmount,e.contributionMargin,e.contributionMarginPercent,
        decision.execution.mode,decision.eligible ? 'dry_run' : 'blocked',clean(decision.reason,500),nowIso()).run();
  }
  return { status: 200, body: {
    mode: 'dry_run',
    autoOrderEnabled: enabled(env.SOURCING_AUTO_ORDER_ENABLED),
    product: { id: product.id,name: product.name,saleAmount: product.price },
    feeRatePercent,
    selected,
    candidates: ranked,
    note: 'Auto Source는 상품별 최소마진과 계약·개인정보·발주권한을 함께 검증합니다. 자동발주는 별도 승인 전까지 실행하지 않습니다.'
  } };
}
