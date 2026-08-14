const PARTNER_TRANSITIONS = Object.freeze({
  candidate: new Set(['due_diligence','rejected']),
  due_diligence: new Set(['contracted','rejected','suspended']),
  contracted: new Set(['pilot_ready','suspended']),
  pilot_ready: new Set(['pilot_active','suspended']),
  pilot_active: new Set(['active','suspended']),
  active: new Set(['suspended']),
  suspended: new Set(['due_diligence','contracted','pilot_ready','pilot_active','active']),
  rejected: new Set()
});
const VALID_PROVIDER_TYPES = new Set(['contract_supplier','supplier_api']);
const VALID_STOCK = new Set(['unknown','in_stock','out_of_stock']);
const VALID_CS_OWNER = new Set(['seller','supplier','ekodi','shared']);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const randomId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const amount = (value) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
};
const percent = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
};
const priority = (value) => Math.max(1, Math.min(999, Math.trunc(Number(value) || 100)));

async function readJson(request) { try { return await request.json(); } catch { return null; } }

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

function allowedOpsEmails(env) {
  return new Set(clean(env.MALL_OPERATIONS_EMAILS, 2000).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
}

async function authorizeOperations(request, env) {
  const supplied = request.headers.get('x-ekodi-mall-ops-token') || '';
  if (env.MALL_OPERATIONS_TOKEN && supplied && supplied === env.MALL_OPERATIONS_TOKEN) {
    return { ok: true, actor: 'mall-ops:service-token' };
  }
  const user = await authenticate(request, env);
  if (!user) return { ok: false, status: 401, error: 'Mall 운영자 Google 로그인이 필요합니다.' };
  const email = clean(user.email, 240).toLowerCase();
  const allow = allowedOpsEmails(env);
  if (!allow.size) return { ok: false, status: 503, error: 'Mall 운영자 이메일 allowlist가 구성되지 않았습니다.' };
  if (!allow.has(email)) return { ok: false, status: 403, error: '이 Google 계정은 Supplier Ops 권한이 없습니다.' };
  return { ok: true, actor: `mall-ops:${email}`, user };
}

export function supplierPartnerTransitionAllowed(fromStatus, toStatus) {
  return Boolean(PARTNER_TRANSITIONS[fromStatus]?.has(toStatus));
}

export function supplierPartnerContractReady(partner = {}) {
  return Boolean(clean(partner.business_verification_ref || partner.businessVerificationRef, 240)
    && clean(partner.master_contract_ref || partner.masterContractRef, 240)
    && clean(partner.pii_processor_ref || partner.piiProcessorRef, 240)
    && clean(partner.returns_policy_ref || partner.returnsPolicyRef, 240)
    && clean(partner.cs_policy_ref || partner.csPolicyRef, 240));
}

export async function supplierPilotSchemaReady(env) {
  if (!env?.DB) return false;
  try {
    const rows = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (
      'supplier_partners','supplier_partner_sources','supplier_skus','supplier_sku_product_links','supplier_partner_events'
    )`).all();
    return new Set((rows.results || []).map((row) => row.name)).size === 5;
  } catch { return false; }
}

async function audit(env, actor, action, { partnerId = null, sourceId = null, skuId = null, productId = null, metadata = {} } = {}) {
  await env.DB.prepare(`INSERT INTO supplier_partner_events
    (partner_id,source_id,supplier_sku_id,product_id,actor,action,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(partnerId, sourceId, skuId, productId, clean(actor, 240), clean(action, 120), JSON.stringify(metadata || {}).slice(0, 5000), nowIso()).run();
}

function partnerView(row) {
  if (!row) return null;
  return {
    id: row.id, partnerCode: row.partner_code, displayName: row.display_name, legalName: row.legal_name || '',
    providerType: row.provider_type, onboardingStatus: row.onboarding_status,
    businessVerificationRef: row.business_verification_ref || '', masterContractRef: row.master_contract_ref || '',
    piiProcessorRef: row.pii_processor_ref || '', returnsPolicyRef: row.returns_policy_ref || '', csPolicyRef: row.cs_policy_ref || '',
    pilotEvidenceRef: row.pilot_evidence_ref || '', statusNote: row.status_note || '', autoOrderAllowed: Boolean(row.auto_order_allowed),
    contractReady: supplierPartnerContractReady(row), sourceCount: Number(row.source_count || 0), verifiedSourceCount: Number(row.verified_source_count || 0),
    skuCount: Number(row.sku_count || 0), productMappingCount: Number(row.product_mapping_count || 0),
    createdAt: row.created_at, updatedAt: row.updated_at, verifiedAt: row.verified_at || null, activatedAt: row.activated_at || null
  };
}

const PARTNER_SELECT = `SELECT sp.*,
  (SELECT COUNT(*) FROM supplier_partner_sources sps WHERE sps.partner_id=sp.id) AS source_count,
  (SELECT COUNT(*) FROM supplier_partner_sources sps WHERE sps.partner_id=sp.id AND sps.mapping_status IN ('contract_verified','pilot','active')) AS verified_source_count,
  (SELECT COUNT(*) FROM supplier_skus ss WHERE ss.partner_id=sp.id AND ss.active=1) AS sku_count,
  (SELECT COUNT(*) FROM supplier_sku_product_links spl JOIN supplier_skus ss ON ss.id=spl.supplier_sku_id WHERE ss.partner_id=sp.id AND spl.mapping_status IN ('pilot','active')) AS product_mapping_count
  FROM supplier_partners sp`;

async function getPartner(env, id) { return env.DB.prepare(`${PARTNER_SELECT} WHERE sp.id=?`).bind(id).first(); }

async function listContext(env) {
  const partners = await env.DB.prepare(`${PARTNER_SELECT} ORDER BY sp.updated_at DESC LIMIT 100`).all();
  const sources = await env.DB.prepare(`SELECT ss.id,ss.seller_id AS sellerId,ss.provider_id AS providerId,ss.source_ref AS sourceRef,ss.internal_label AS internalLabel,
    ss.cost_amount AS costAmount,ss.shipping_amount AS shippingAmount,ss.stock_state AS stockState,ss.rights_status AS rightsStatus,
    ss.order_permission AS orderPermission,ss.pii_permission AS piiPermission,ss.active,sp.display_name AS providerName,sp.provider_type AS providerType,
    seller.email AS sellerEmail,seller.display_name AS sellerDisplayName,sps.partner_id AS partnerId,sps.mapping_status AS partnerMappingStatus
    FROM sourcing_sources ss JOIN sourcing_providers sp ON sp.id=ss.provider_id JOIN seller_profiles seller ON seller.user_id=ss.seller_id
    LEFT JOIN supplier_partner_sources sps ON sps.source_id=ss.id
    WHERE sp.provider_type IN ('contract_supplier','supplier_api') ORDER BY ss.updated_at DESC LIMIT 250`).all();
  const products = await env.DB.prepare(`SELECT p.id,p.seller_id AS sellerId,p.name,p.status,p.sale_type AS saleType,p.price,
    seller.email AS sellerEmail,seller.display_name AS sellerDisplayName FROM products p JOIN seller_profiles seller ON seller.user_id=p.seller_id
    WHERE p.sale_type='direct' ORDER BY p.updated_at DESC LIMIT 250`).all();
  const skus = await env.DB.prepare(`SELECT sk.id,sk.partner_id AS partnerId,sk.source_id AS sourceId,sk.sku_code AS skuCode,sk.display_name AS displayName,
    sk.cost_amount AS costAmount,sk.shipping_amount AS shippingAmount,sk.stock_state AS stockState,sk.checked_at AS checkedAt,sk.active,
    ss.seller_id AS sellerId,(SELECT COUNT(*) FROM supplier_sku_product_links spl WHERE spl.supplier_sku_id=sk.id) AS productMappingCount
    FROM supplier_skus sk JOIN sourcing_sources ss ON ss.id=sk.source_id ORDER BY sk.updated_at DESC LIMIT 300`).all();
  const mappings = await env.DB.prepare(`SELECT spl.supplier_sku_id AS supplierSkuId,spl.product_id AS productId,spl.seller_id AS sellerId,spl.source_id AS sourceId,
    spl.mapping_status AS mappingStatus,spl.priority,spl.min_margin_amount AS minMarginAmount,spl.min_margin_percent AS minMarginPercent,p.name AS productName
    FROM supplier_sku_product_links spl JOIN products p ON p.id=spl.product_id ORDER BY spl.updated_at DESC LIMIT 500`).all();
  return {
    partners: (partners.results || []).map(partnerView), sources: sources.results || [], products: products.results || [], skus: skus.results || [], mappings: mappings.results || [],
    gates: { paymentsEnabled: false, buyerPiiReleaseEnabled: false, supplierForwardEnabled: false, autoOrderEnabled: false, supplierPayoutExecutionEnabled: false }
  };
}

async function createPartner(env, actor, body = {}) {
  const displayName = clean(body.displayName, 160);
  const partnerCode = clean(body.partnerCode, 80).toLowerCase();
  const providerType = VALID_PROVIDER_TYPES.has(body.providerType) ? body.providerType : 'contract_supplier';
  if (!displayName) return { status: 400, body: { error: '공급자 표시명이 필요합니다.' } };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(partnerCode)) return { status: 400, body: { error: 'partnerCode는 영문 소문자·숫자·하이픈 형식이어야 합니다.' } };
  const id = randomId('sup'); const now = nowIso();
  try {
    await env.DB.prepare(`INSERT INTO supplier_partners
      (id,partner_code,display_name,legal_name,provider_type,onboarding_status,status_note,auto_order_allowed,created_at,updated_at)
      VALUES (?,?,?,?,?,'candidate',?,0,?,?)`).bind(id, partnerCode, displayName, clean(body.legalName, 200), providerType, clean(body.statusNote, 1200), now, now).run();
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return { status: 409, body: { error: '이미 사용 중인 supplier partner code입니다.' } };
    throw error;
  }
  await audit(env, actor, 'supplier_partner.created', { partnerId: id, metadata: { providerType } });
  return { status: 201, body: { partner: partnerView(await getPartner(env, id)) } };
}

async function savePartnerDetails(env, actor, id, body = {}) {
  const current = await getPartner(env, id);
  if (!current) return { status: 404, body: { error: '공급자 Partner를 찾을 수 없습니다.' } };
  const now = nowIso();
  await env.DB.prepare(`UPDATE supplier_partners SET display_name=?,legal_name=?,business_verification_ref=?,master_contract_ref=?,
    pii_processor_ref=?,returns_policy_ref=?,cs_policy_ref=?,pilot_evidence_ref=?,status_note=?,updated_at=? WHERE id=?`)
    .bind(clean(body.displayName,160) || current.display_name, clean(body.legalName,200), clean(body.businessVerificationRef,240),
      clean(body.masterContractRef,240), clean(body.piiProcessorRef,240), clean(body.returnsPolicyRef,240), clean(body.csPolicyRef,240),
      clean(body.pilotEvidenceRef,240), clean(body.statusNote,1200), now, id).run();
  await audit(env, actor, 'supplier_partner.details_updated', { partnerId: id, metadata: { contractReady: supplierPartnerContractReady(body) } });
  return { status: 200, body: { partner: partnerView(await getPartner(env, id)) } };
}

async function transitionPartner(env, actor, id, body = {}) {
  const partner = await getPartner(env, id);
  if (!partner) return { status: 404, body: { error: '공급자 Partner를 찾을 수 없습니다.' } };
  const next = clean(body.status, 40);
  if (!supplierPartnerTransitionAllowed(partner.onboarding_status, next)) return { status: 409, body: { error: `허용되지 않은 공급자 상태전이입니다: ${partner.onboarding_status} -> ${next}` } };
  if (['contracted','pilot_ready','pilot_active','active'].includes(next) && !supplierPartnerContractReady(partner)) {
    return { status: 409, body: { error: '사업자 검증·계약·개인정보 처리·반품·CS 정책 참조가 모두 있어야 계약단계 이상으로 전환할 수 있습니다.' } };
  }
  if (next === 'pilot_active' && (Number(partner.verified_source_count || 0) < 1 || Number(partner.product_mapping_count || 0) < 1)) {
    return { status: 409, body: { error: '파일럿 활성화 전에 검증된 source 1개 이상과 SKU→상품 매핑 1개 이상이 필요합니다.' } };
  }
  if (next === 'active' && !clean(partner.pilot_evidence_ref, 240)) return { status: 409, body: { error: '정식 활성화에는 파일럿 완료 근거 참조값이 필요합니다.' } };
  const now = nowIso();
  const verifiedAt = ['contracted','pilot_ready','pilot_active','active'].includes(next) ? partner.verified_at || now : partner.verified_at;
  const activatedAt = next === 'active' ? now : partner.activated_at;
  await env.DB.prepare(`UPDATE supplier_partners SET onboarding_status=?,status_note=?,verified_at=?,activated_at=?,auto_order_allowed=0,updated_at=? WHERE id=?`)
    .bind(next, clean(body.note,1200) || partner.status_note || '', verifiedAt, activatedAt, now, id).run();
  await audit(env, actor, 'supplier_partner.transition', { partnerId: id, metadata: { from: partner.onboarding_status, to: next } });
  return { status: 200, body: { partner: partnerView(await getPartner(env, id)), autoOrderEnabled: false } };
}

async function attachSource(env, actor, partnerId, body = {}) {
  const partner = await getPartner(env, partnerId);
  if (!partner) return { status: 404, body: { error: '공급자 Partner를 찾을 수 없습니다.' } };
  const sourceId = clean(body.sourceId, 80);
  const source = await env.DB.prepare(`SELECT ss.*,sp.provider_type FROM sourcing_sources ss JOIN sourcing_providers sp ON sp.id=ss.provider_id WHERE ss.id=?`).bind(sourceId).first();
  if (!source || !VALID_PROVIDER_TYPES.has(source.provider_type)) return { status: 409, body: { error: '계약 공급자 또는 Supplier API source만 연결할 수 있습니다.' } };
  const existing = await env.DB.prepare('SELECT partner_id FROM supplier_partner_sources WHERE source_id=?').bind(sourceId).first();
  if (existing && existing.partner_id !== partnerId) return { status: 409, body: { error: '이 source는 이미 다른 Supplier Partner에 연결되어 있습니다.' } };
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO supplier_partner_sources (partner_id,source_id,seller_id,mapping_status,created_at,updated_at)
    VALUES (?,?,?,'mapped',?,?) ON CONFLICT(partner_id,source_id) DO UPDATE SET updated_at=excluded.updated_at`)
    .bind(partnerId, sourceId, source.seller_id, now, now).run();
  await audit(env, actor, 'supplier_partner.source_attached', { partnerId, sourceId, metadata: { sellerId: source.seller_id } });
  return { status: 200, body: { partner: partnerView(await getPartner(env, partnerId)), sourceId } };
}

async function verifySourceContract(env, actor, partnerId, sourceId, body = {}) {
  const partner = await getPartner(env, partnerId);
  if (!partner || !['contracted','pilot_ready','pilot_active','active'].includes(partner.onboarding_status) || !supplierPartnerContractReady(partner)) {
    return { status: 409, body: { error: '계약 준비가 완료된 Supplier Partner가 필요합니다.' } };
  }
  const mapped = await env.DB.prepare(`SELECT sps.*,ss.provider_id,sp.provider_type FROM supplier_partner_sources sps
    JOIN sourcing_sources ss ON ss.id=sps.source_id JOIN sourcing_providers sp ON sp.id=ss.provider_id
    WHERE sps.partner_id=? AND sps.source_id=?`).bind(partnerId, sourceId).first();
  if (!mapped) return { status: 404, body: { error: 'Partner에 연결된 source를 찾을 수 없습니다.' } };
  const csOwner = VALID_CS_OWNER.has(body.csOwner) ? body.csOwner : 'shared';
  const shippingSlaDays = body.shippingSlaDays === '' || body.shippingSlaDays == null ? null : Math.max(0, Math.min(30, Math.trunc(Number(body.shippingSlaDays) || 0)));
  const now = nowIso(); const existing = await env.DB.prepare('SELECT id FROM supplier_contracts WHERE source_id=?').bind(sourceId).first();
  const contractId = existing?.id || randomId('ctr');
  const orderPermission = mapped.provider_type === 'supplier_api' ? 'api_approved' : 'manual_contract';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO supplier_contracts
      (id,source_id,seller_id,status,contract_ref,pii_processor_ref,returns_policy_ref,cs_owner,shipping_sla_days,effective_at,expires_at,approved_at,created_at,updated_at)
      VALUES (?,?,?,'verified',?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET status='verified',contract_ref=excluded.contract_ref,pii_processor_ref=excluded.pii_processor_ref,
      returns_policy_ref=excluded.returns_policy_ref,cs_owner=excluded.cs_owner,shipping_sla_days=excluded.shipping_sla_days,effective_at=excluded.effective_at,
      expires_at=excluded.expires_at,approved_at=excluded.approved_at,updated_at=excluded.updated_at`)
      .bind(contractId, sourceId, mapped.seller_id, partner.master_contract_ref, partner.pii_processor_ref, partner.returns_policy_ref, csOwner,
        shippingSlaDays, clean(body.effectiveAt,40) || now, clean(body.expiresAt,40) || null, now, now, now),
    env.DB.prepare(`UPDATE sourcing_sources SET rights_status='contract_verified',order_permission=?,pii_permission='contracted_processor',updated_at=? WHERE id=?`)
      .bind(orderPermission, now, sourceId),
    env.DB.prepare(`UPDATE supplier_partner_sources SET mapping_status='contract_verified',updated_at=? WHERE partner_id=? AND source_id=?`).bind(now, partnerId, sourceId)
  ]);
  await audit(env, actor, 'supplier_partner.source_contract_verified', { partnerId, sourceId, metadata: { contractId, orderPermission, globalPiiReleaseEnabled: false, autoOrderEnabled: false } });
  return { status: 200, body: { contract: { id: contractId, sourceId, status: 'verified', orderPermission }, buyerPiiReleaseEnabled: false, autoOrderEnabled: false } };
}

async function createSku(env, actor, partnerId, body = {}) {
  const partner = await getPartner(env, partnerId);
  if (!partner) return { status: 404, body: { error: '공급자 Partner를 찾을 수 없습니다.' } };
  const sourceId = clean(body.sourceId, 80); const skuCode = clean(body.skuCode, 120); const displayName = clean(body.displayName, 200);
  const costAmount = amount(body.costAmount); const shippingAmount = amount(body.shippingAmount ?? 0);
  if (!sourceId || !skuCode || !displayName || costAmount == null || shippingAmount == null) return { status: 400, body: { error: 'sourceId, SKU 코드, SKU명, 확정 공급가·배송비가 필요합니다.' } };
  const mapped = await env.DB.prepare('SELECT seller_id FROM supplier_partner_sources WHERE partner_id=? AND source_id=?').bind(partnerId, sourceId).first();
  if (!mapped) return { status: 409, body: { error: '먼저 Partner와 source를 연결해 주세요.' } };
  const stockState = VALID_STOCK.has(body.stockState) ? body.stockState : 'unknown'; const now = nowIso(); const id = randomId('sku');
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO supplier_skus
        (id,partner_id,source_id,sku_code,display_name,cost_amount,shipping_amount,stock_state,checked_at,active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`).bind(id, partnerId, sourceId, skuCode, displayName, costAmount, shippingAmount, stockState, now, now, now),
      env.DB.prepare(`UPDATE sourcing_sources SET source_ref=?,internal_label=?,cost_amount=?,shipping_amount=?,stock_state=?,checked_at=?,updated_at=? WHERE id=?`)
        .bind(skuCode, displayName, costAmount, shippingAmount, stockState, now, now, sourceId)
    ]);
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return { status: 409, body: { error: '동일 Partner의 SKU 코드 또는 source가 이미 등록되어 있습니다.' } };
    throw error;
  }
  await audit(env, actor, 'supplier_partner.sku_created', { partnerId, sourceId, skuId: id, metadata: { skuCode, costAmount, shippingAmount } });
  return { status: 201, body: { sku: { id, partnerId, sourceId, skuCode, displayName, costAmount, shippingAmount, stockState } } };
}

async function mapSkuProduct(env, actor, skuId, body = {}) {
  const sku = await env.DB.prepare(`SELECT sk.*,sps.seller_id FROM supplier_skus sk JOIN supplier_partner_sources sps ON sps.source_id=sk.source_id AND sps.partner_id=sk.partner_id WHERE sk.id=? AND sk.active=1`).bind(skuId).first();
  if (!sku) return { status: 404, body: { error: '활성 Supplier SKU를 찾을 수 없습니다.' } };
  const productId = clean(body.productId,80); const product = await env.DB.prepare('SELECT id,seller_id,sale_type,status FROM products WHERE id=?').bind(productId).first();
  if (!product || product.seller_id !== sku.seller_id) return { status: 409, body: { error: 'SKU source와 동일 판매자 소유의 상품만 매핑할 수 있습니다.' } };
  if (product.sale_type !== 'direct') return { status: 409, body: { error: 'Supplier SKU는 EKODI 직접판매 상품에만 매핑합니다.' } };
  const p = priority(body.priority); const minMarginAmount = amount(body.minMarginAmount ?? 0); const minMarginPercent = percent(body.minMarginPercent); const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO supplier_sku_product_links
      (supplier_sku_id,product_id,seller_id,source_id,mapping_status,priority,min_margin_amount,min_margin_percent,created_at,updated_at)
      VALUES (?,?,?,?,'pilot',?,?,?,?,?)
      ON CONFLICT(supplier_sku_id,product_id) DO UPDATE SET mapping_status='pilot',priority=excluded.priority,min_margin_amount=excluded.min_margin_amount,
      min_margin_percent=excluded.min_margin_percent,updated_at=excluded.updated_at`)
      .bind(skuId, productId, sku.seller_id, sku.source_id, p, minMarginAmount ?? 0, minMarginPercent, now, now),
    env.DB.prepare(`INSERT INTO product_source_links (product_id,source_id,priority,min_margin_amount,min_margin_percent,active,created_at,updated_at)
      VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(product_id,source_id) DO UPDATE SET priority=excluded.priority,min_margin_amount=excluded.min_margin_amount,
      min_margin_percent=excluded.min_margin_percent,active=1,updated_at=excluded.updated_at`)
      .bind(productId, sku.source_id, p, minMarginAmount ?? 0, minMarginPercent, now, now),
    env.DB.prepare(`UPDATE supplier_partner_sources SET mapping_status=CASE WHEN mapping_status='contract_verified' THEN 'pilot' ELSE mapping_status END,updated_at=? WHERE partner_id=? AND source_id=?`)
      .bind(now, sku.partner_id, sku.source_id)
  ]);
  await audit(env, actor, 'supplier_partner.sku_product_mapped', { partnerId: sku.partner_id, sourceId: sku.source_id, skuId, productId, metadata: { priority: p, minMarginAmount: minMarginAmount ?? 0, minMarginPercent } });
  return { status: 200, body: { mapping: { supplierSkuId: skuId, productId, sourceId: sku.source_id, status: 'pilot', priority: p, minMarginAmount: minMarginAmount ?? 0, minMarginPercent }, autoOrderEnabled: false } };
}

export async function handleSupplierPilotRequest(request, env) {
  const url = new URL(request.url); const path = url.pathname;
  if (!path.startsWith('/api/internal/supplier-')) return null;
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };
  const auth = await authorizeOperations(request, env);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (request.method === 'GET' && path === '/api/internal/supplier-pilot/context') return { status: 200, body: { context: await listContext(env), actor: auth.actor } };
  if (request.method === 'POST' && path === '/api/internal/supplier-partners') {
    const body = await readJson(request); return body ? createPartner(env, auth.actor, body) : { status: 400, body: { error: 'Invalid JSON' } };
  }
  const details = path.match(/^\/api\/internal\/supplier-partners\/(sup_[a-f0-9]{32})\/details$/i);
  if (request.method === 'POST' && details) { const body = await readJson(request); return body ? savePartnerDetails(env, auth.actor, details[1], body) : { status: 400, body: { error: 'Invalid JSON' } }; }
  const transition = path.match(/^\/api\/internal\/supplier-partners\/(sup_[a-f0-9]{32})\/transition$/i);
  if (request.method === 'POST' && transition) { const body = await readJson(request); return body ? transitionPartner(env, auth.actor, transition[1], body) : { status: 400, body: { error: 'Invalid JSON' } }; }
  const sourceAttach = path.match(/^\/api\/internal\/supplier-partners\/(sup_[a-f0-9]{32})\/sources$/i);
  if (request.method === 'POST' && sourceAttach) { const body = await readJson(request); return body ? attachSource(env, auth.actor, sourceAttach[1], body) : { status: 400, body: { error: 'Invalid JSON' } }; }
  const contract = path.match(/^\/api\/internal\/supplier-partners\/(sup_[a-f0-9]{32})\/sources\/(src_[a-f0-9]{32})\/verify-contract$/i);
  if (request.method === 'POST' && contract) { const body = await readJson(request); return verifySourceContract(env, auth.actor, contract[1], contract[2], body || {}); }
  const sku = path.match(/^\/api\/internal\/supplier-partners\/(sup_[a-f0-9]{32})\/skus$/i);
  if (request.method === 'POST' && sku) { const body = await readJson(request); return body ? createSku(env, auth.actor, sku[1], body) : { status: 400, body: { error: 'Invalid JSON' } }; }
  const skuProduct = path.match(/^\/api\/internal\/supplier-skus\/(sku_[a-f0-9]{32})\/products$/i);
  if (request.method === 'POST' && skuProduct) { const body = await readJson(request); return body ? mapSkuProduct(env, auth.actor, skuProduct[1], body) : { status: 400, body: { error: 'Invalid JSON' } }; }
  return { status: 404, body: { error: 'Supplier pilot route not found.' } };
}
