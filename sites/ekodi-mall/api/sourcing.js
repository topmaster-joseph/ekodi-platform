const VALID_STOCK = new Set(['unknown', 'in_stock', 'out_of_stock']);
const VALID_FEE_RATES = new Set([7, 8, 9, 10]);

export const SOURCING_PHASES = Object.freeze([
  Object.freeze({ id: 1, key: 'external_reference', label: '외부 제휴·참고 소싱', status: 'available' }),
  Object.freeze({ id: 2, key: 'supplier_dropship', label: '계약 공급자 직배송', status: 'contract_required' }),
  Object.freeze({ id: 3, key: 'auto_source', label: '복수 공급처 Auto Source', status: 'dry_run' }),
  Object.freeze({ id: 4, key: 'auto_order', label: '승인 API 자동발주', status: 'disabled_until_approved' })
]);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const randomId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const amount = (value, nullable = false) => {
  if ((value === '' || value === null || value === undefined) && nullable) return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : nullable ? null : 0;
};
const percent = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : 0;
};
const httpsUrl = (value) => {
  try {
    const url = new URL(clean(value, 1600));
    return url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
};
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

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function ensureSeller(env, user) {
  const now = nowIso();
  const meta = user?.user_metadata || {};
  const display = clean(meta.full_name || meta.name || String(user?.email || '').split('@')[0] || '판매자', 100);
  await env.DB.prepare(`INSERT INTO seller_profiles
    (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at)
    VALUES (?,?,?,'individual','google_verified','pending',?,?)
    ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,updated_at=excluded.updated_at`)
    .bind(user.id, clean(user.email, 240), display, now, now).run();
}

export function sourceDefaults(providerType = '') {
  if (providerType === 'retail_reference') return {
    fulfillmentMode: 'reference_only', rightsStatus: 'reference_only', orderPermission: 'none', piiPermission: 'none'
  };
  if (providerType === 'affiliate') return {
    fulfillmentMode: 'external_affiliate', rightsStatus: 'external_affiliate', orderPermission: 'external_checkout', piiPermission: 'none'
  };
  return {
    fulfillmentMode: 'supplier_dropship', rightsStatus: 'contract_pending', orderPermission: 'none', piiPermission: 'none'
  };
}

export function computeSourceEconomics({ saleAmount = 0, costAmount = 0, shippingAmount = 0, feeRatePercent = 9, minMarginAmount = 0, minMarginPercent = 0 } = {}) {
  const sale = amount(saleAmount);
  const cost = amount(costAmount);
  const shipping = amount(shippingAmount);
  const rate = VALID_FEE_RATES.has(Math.trunc(Number(feeRatePercent))) ? Math.trunc(Number(feeRatePercent)) : 9;
  const platformFeeAmount = Math.floor((sale * rate) / 100);
  const landedCost = cost + shipping;
  const contributionMargin = sale - platformFeeAmount - landedCost;
  const contributionMarginPercent = sale > 0 ? Math.round((contributionMargin / sale) * 10000) / 100 : 0;
  const floorAmount = amount(minMarginAmount);
  const floorPercent = percent(minMarginPercent);
  return {
    saleAmount: sale,
    costAmount: cost,
    shippingAmount: shipping,
    landedCost,
    feeRatePercent: rate,
    platformFeeAmount,
    contributionMargin,
    contributionMarginPercent,
    economicallyEligible: sale > 0 && contributionMargin > 0 && contributionMargin >= floorAmount && contributionMarginPercent >= floorPercent
  };
}

export function sourceExecution(source = {}, env = {}) {
  if (!source.active || source.stock_state === 'out_of_stock') return { mode: 'blocked', reason: 'inactive-or-out-of-stock' };
  if (source.fulfillment_mode === 'reference_only') return { mode: 'blocked', reason: 'reference-only-provider' };
  if (source.fulfillment_mode === 'external_affiliate') return { mode: 'external_checkout', reason: 'customer-checks-out-at-provider' };
  if (source.rights_status !== 'contract_verified' && source.rights_status !== 'licensed') return { mode: 'manual_review', reason: 'supplier-contract-not-verified' };
  if (source.pii_permission !== 'contracted_processor') return { mode: 'manual_review', reason: 'customer-pii-transfer-not-approved' };
  if (source.order_permission === 'manual_contract') return { mode: 'manual_forward', reason: 'approved-contract-supplier' };
  const providerAllowsAuto = Boolean(source.provider_auto_order_enabled);
  const environmentAllowsAuto = enabled(env.SOURCING_AUTO_ORDER_ENABLED);
  if (source.order_permission === 'api_approved' && providerAllowsAuto && environmentAllowsAuto) return { mode: 'api_order', reason: 'approved-api-order' };
  if (source.order_permission === 'api_approved') return { mode: 'manual_review', reason: 'auto-order-global-gate-disabled' };
  return { mode: 'manual_review', reason: 'supplier-order-permission-pending' };
}

export async function sourcingSchemaReady(env) {
  if (!env?.DB) return false;
  try {
    const rows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sourcing_providers','sourcing_sources','product_source_links','procurement_decisions')").all();
    return new Set((rows.results || []).map((row) => row.name)).size === 4;
  } catch { return false; }
}

async function providerList(env) {
  const rows = await env.DB.prepare(`SELECT id,display_name AS displayName,provider_type AS providerType,integration_mode AS integrationMode,
    connection_status AS connectionStatus,catalog_policy AS catalogPolicy,order_mode AS orderMode,
    auto_order_enabled AS autoOrderEnabled,customer_pii_allowed AS customerPiiAllowed
    FROM sourcing_providers ORDER BY CASE id WHEN 'external-affiliate' THEN 1 WHEN 'contract-supplier' THEN 2 WHEN 'auction-reference' THEN 3 ELSE 4 END`).all();
  return (rows.results || []).map((row) => ({ ...row, autoOrderEnabled: Boolean(row.autoOrderEnabled), customerPiiAllowed: Boolean(row.customerPiiAllowed) }));
}

function sourceView(row) {
  if (!row) return null;
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
    checkedAt: row.checked_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    providerAutoOrderEnabled: Boolean(row.provider_auto_order_enabled)
  };
}

const SOURCE_SELECT = `SELECT ss.*,sp.display_name AS provider_name,sp.provider_type,sp.auto_order_enabled AS provider_auto_order_enabled
  FROM sourcing_sources ss JOIN sourcing_providers sp ON sp.id=ss.provider_id`;

async function listSources(env, sellerId) {
  const result = await env.DB.prepare(`${SOURCE_SELECT} WHERE ss.seller_id=? ORDER BY ss.updated_at DESC LIMIT 200`).bind(sellerId).all();
  return (result.results || []).map(sourceView);
}

async function createSource(env, user, body = {}) {
  const providerId = clean(body.providerId, 80);
  const provider = await env.DB.prepare('SELECT * FROM sourcing_providers WHERE id=?').bind(providerId).first();
  if (!provider) return { status: 400, body: { error: '지원되는 소싱 공급처 유형을 선택해 주세요.' } };
  const url = httpsUrl(body.sourceUrl);
  if (!url) return { status: 400, body: { error: 'HTTPS 원본/공급처 URL이 필요합니다.' } };
  const defaults = sourceDefaults(provider.provider_type);
  const id = randomId('src');
  const now = nowIso();
  await ensureSeller(env, user);
  await env.DB.prepare(`INSERT INTO sourcing_sources
    (id,seller_id,provider_id,source_url,source_ref,internal_label,cost_amount,shipping_amount,stock_state,fulfillment_mode,rights_status,order_permission,pii_permission,active,checked_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`)
    .bind(id,user.id,providerId,url,clean(body.sourceRef,160),clean(body.internalLabel,160),amount(body.costAmount,true),amount(body.shippingAmount),
      VALID_STOCK.has(body.stockState) ? body.stockState : 'unknown',defaults.fulfillmentMode,defaults.rightsStatus,defaults.orderPermission,defaults.piiPermission,
      now,now,now).run();
  const row = await env.DB.prepare(`${SOURCE_SELECT} WHERE ss.id=? AND ss.seller_id=?`).bind(id,user.id).first();
  return { status: 201, body: { source: sourceView(row), notice: provider.provider_type === 'retail_reference'
    ? '일반 쇼핑몰 정보는 참조용으로만 등록됩니다. EKODI가 해당 몰의 상품정보를 복제·저장하거나 자동주문하지 않습니다.'
    : provider.provider_type === 'affiliate' ? '고객 결제는 외부 제휴몰에서 진행합니다.' : '직배송은 공급계약·개인정보 처리 승인 후에만 활성화됩니다.' } };
}

async function deleteSource(env, sellerId, id) {
  const row = await env.DB.prepare('SELECT id FROM sourcing_sources WHERE id=? AND seller_id=?').bind(id,sellerId).first();
  if (!row) return { status: 404, body: { error: '소싱 항목을 찾을 수 없습니다.' } };
  await env.DB.prepare('DELETE FROM sourcing_sources WHERE id=? AND seller_id=?').bind(id,sellerId).run();
  return { status: 200, body: { ok: true } };
}

async function ownedProduct(env, sellerId, productId) {
  return env.DB.prepare('SELECT id,name,price,seller_id FROM products WHERE id=? AND seller_id=?').bind(productId,sellerId).first();
}

async function linkSource(env, sellerId, productId, body = {}) {
  const product = await ownedProduct(env,sellerId,productId);
  if (!product) return { status: 404, body: { error: '본인 상품을 찾을 수 없습니다.' } };
  const sourceId = clean(body.sourceId,80);
  const source = await env.DB.prepare('SELECT id FROM sourcing_sources WHERE id=? AND seller_id=?').bind(sourceId,sellerId).first();
  if (!source) return { status: 404, body: { error: '본인 소싱 항목을 찾을 수 없습니다.' } };
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO product_source_links
    (product_id,source_id,priority,min_margin_amount,min_margin_percent,active,created_at,updated_at)
    VALUES (?,?,?,?,?,1,?,?)
    ON CONFLICT(product_id,source_id) DO UPDATE SET priority=excluded.priority,min_margin_amount=excluded.min_margin_amount,
      min_margin_percent=excluded.min_margin_percent,active=1,updated_at=excluded.updated_at`)
    .bind(productId,sourceId,Math.max(1,Math.min(999,Math.trunc(Number(body.priority)||100))),amount(body.minMarginAmount),percent(body.minMarginPercent),now,now).run();
  return { status: 200, body: { ok: true, productId, sourceId } };
}

async function linkedSources(env, sellerId, productId) {
  const product = await ownedProduct(env,sellerId,productId);
  if (!product) return { status: 404, body: { error: '본인 상품을 찾을 수 없습니다.' } };
  const rows = await env.DB.prepare(`${SOURCE_SELECT} JOIN product_source_links psl ON psl.source_id=ss.id
    WHERE psl.product_id=? AND ss.seller_id=? AND psl.active=1
    ORDER BY psl.priority ASC,ss.updated_at DESC`).bind(productId,sellerId).all();
  return { status: 200, body: { product: { id: product.id, name: product.name, price: product.price }, sources: (rows.results || []).map(sourceView) } };
}

async function planSources(env, sellerId, productId, body = {}) {
  const product = await ownedProduct(env,sellerId,productId);
  if (!product) return { status: 404, body: { error: '본인 상품을 찾을 수 없습니다.' } };
  if (!Number.isInteger(product.price) || product.price <= 0) return { status: 409, body: { error: 'Auto Source 비교를 하려면 EKODI 판매가격을 먼저 확정해 주세요.' } };
  const feeRatePercent = VALID_FEE_RATES.has(Math.trunc(Number(body.feeRatePercent))) ? Math.trunc(Number(body.feeRatePercent)) : 9;
  const rows = await env.DB.prepare(`${SOURCE_SELECT},product_source_links psl
    WHERE psl.source_id=ss.id AND psl.product_id=? AND ss.seller_id=? AND psl.active=1 AND ss.active=1
    ORDER BY psl.priority ASC,ss.updated_at DESC`).bind(productId,sellerId).all();
  const candidates = [];
  for (const row of rows.results || []) {
    const source = sourceView(row);
    const execution = sourceExecution({
      ...row,
      provider_auto_order_enabled: row.provider_auto_order_enabled
    }, env);
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
      reason = '최소 마진 기준 미달';
    } else {
      eligible = execution.mode === 'manual_forward' || execution.mode === 'api_order';
      if (!eligible) reason = execution.reason;
    }
    candidates.push({ source, execution, economics, eligible, reason });
  }
  const ranked = candidates.slice().sort((a,b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    const am = a.economics?.contributionMargin ?? -1;
    const bm = b.economics?.contributionMargin ?? -1;
    return bm - am;
  });
  const selected = ranked.find((item) => item.eligible) || null;
  const decision = selected ? selected : ranked[0] || null;
  if (decision) {
    const e = decision.economics || computeSourceEconomics({ saleAmount: product.price, feeRatePercent });
    await env.DB.prepare(`INSERT INTO procurement_decisions
      (id,product_id,seller_id,source_id,fee_rate_percent,sale_amount,landed_cost,platform_fee_amount,contribution_margin,contribution_margin_percent,execution_mode,decision_status,reason,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(randomId('dec'),productId,sellerId,decision.source.id,feeRatePercent,e.saleAmount,e.landedCost,e.platformFeeAmount,e.contributionMargin,e.contributionMarginPercent,
        decision.execution.mode,decision.eligible ? 'dry_run' : 'blocked',clean(decision.reason,500),nowIso()).run();
  }
  return { status: 200, body: {
    mode: 'dry_run', autoOrderEnabled: enabled(env.SOURCING_AUTO_ORDER_ENABLED), product: { id: product.id, name: product.name, saleAmount: product.price },
    feeRatePercent, selected, candidates: ranked,
    note: 'Auto Source는 현재 후보선정과 마진검증만 수행합니다. 승인되지 않은 일반 쇼핑몰 자동구매나 고객 개인정보 전달은 실행하지 않습니다.'
  } };
}

async function approveSource(env, id, body = {}) {
  const token = clean(body.token || '',400);
  const expected = clean(env.SOURCING_INTERNAL_TOKEN,400);
  if (!expected || token !== expected) return { status: 403, body: { error: '소싱 계약 승인 권한이 없습니다.' } };
  const row = await env.DB.prepare(`${SOURCE_SELECT} WHERE ss.id=?`).bind(id).first();
  if (!row) return { status: 404, body: { error: '소싱 항목을 찾을 수 없습니다.' } };
  if (!['contract_supplier','supplier_api'].includes(row.provider_type)) return { status: 409, body: { error: '계약 공급자만 승인할 수 있습니다.' } };
  const permission = row.provider_type === 'supplier_api' ? 'api_approved' : 'manual_contract';
  await env.DB.prepare("UPDATE sourcing_sources SET rights_status='contract_verified',order_permission=?,pii_permission='contracted_processor',updated_at=? WHERE id=?")
    .bind(permission,nowIso(),id).run();
  const updated = await env.DB.prepare(`${SOURCE_SELECT} WHERE ss.id=?`).bind(id).first();
  return { status: 200, body: { source: sourceView(updated), autoOrderEnabled: false, note: '계약 승인은 저장됐지만 API 자동발주는 별도 전역 게이트가 켜질 때까지 실행되지 않습니다.' } };
}

export async function handleSourcingRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/sourcing/') && !path.startsWith('/api/internal/sourcing/')) return null;
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };

  if (path.startsWith('/api/internal/sourcing/')) {
    const match = path.match(/^\/api\/internal\/sourcing\/sources\/(src_[a-f0-9]{32})\/approve$/i);
    if (request.method === 'POST' && match) {
      const supplied = request.headers.get('x-ekodi-mall-internal-token') || '';
      return approveSource(env,match[1],{ token: supplied });
    }
    return { status: 404, body: { error: 'Sourcing internal route not found.' } };
  }

  const user = await authenticate(request,env);
  if (!user) return { status: 401, body: { error: 'Google 판매자 로그인이 필요합니다.', code: 'SELLER_AUTH_REQUIRED' } };

  if (request.method === 'GET' && path === '/api/sourcing/policy') return { status: 200, body: {
    phases: SOURCING_PHASES,
    principles: {
      retailMarketplace: 'reference-or-external-only',
      persistentCatalogCopy: false,
      contractedDropship: true,
      autoSource: 'dry-run',
      autoOrder: enabled(env.SOURCING_AUTO_ORDER_ENABLED),
      customerPiiTransfer: 'contracted-processors-only'
    }
  } };
  if (request.method === 'GET' && path === '/api/sourcing/providers') return { status: 200, body: { providers: await providerList(env), phases: SOURCING_PHASES } };
  if (request.method === 'GET' && path === '/api/sourcing/sources') return { status: 200, body: { sources: await listSources(env,user.id) } };
  if (request.method === 'POST' && path === '/api/sourcing/sources') {
    const body = await readJson(request);
    return body ? createSource(env,user,body) : { status: 400, body: { error: 'Invalid JSON' } };
  }
  const sourceDelete = path.match(/^\/api\/sourcing\/sources\/(src_[a-f0-9]{32})$/i);
  if (sourceDelete && request.method === 'DELETE') return deleteSource(env,user.id,sourceDelete[1]);

  const productSources = path.match(/^\/api\/sourcing\/products\/(prd_[a-f0-9]{32})\/sources$/i);
  if (productSources && request.method === 'GET') return linkedSources(env,user.id,productSources[1]);
  if (productSources && request.method === 'POST') {
    const body = await readJson(request);
    return body ? linkSource(env,user.id,productSources[1],body) : { status: 400, body: { error: 'Invalid JSON' } };
  }
  const productPlan = path.match(/^\/api\/sourcing\/products\/(prd_[a-f0-9]{32})\/plan$/i);
  if (productPlan && request.method === 'POST') {
    const body = await readJson(request);
    return planSources(env,user.id,productPlan[1],body || {});
  }
  return { status: 404, body: { error: 'Sourcing route not found.' } };
}
