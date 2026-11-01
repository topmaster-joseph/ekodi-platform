import { probeDomeggookLogin } from './domeggook-order.js';

const PROVIDER_ID = 'domemae-official';
const ENDPOINT = 'https://www.domeggook.com/ssl/api/';
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const flag = (value) => String(value || '').toLowerCase() === 'true';
const nowIso = () => new Date().toISOString();
const randomId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;

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
  if (env.MALL_OPERATIONS_TOKEN && supplied && supplied === env.MALL_OPERATIONS_TOKEN) return { ok: true, actor: 'mall-ops:service-token' };
  const user = await authenticate(request, env);
  if (!user) return { ok: false, status: 401, error: 'Mall 운영자 Google 로그인이 필요합니다.' };
  const email = clean(user.email, 240).toLowerCase();
  const allow = allowedOpsEmails(env);
  if (!allow.size) return { ok: false, status: 503, error: 'Mall 운영자 이메일 allowlist가 구성되지 않았습니다.' };
  if (!allow.has(email)) return { ok: false, status: 403, error: '이 Google 계정은 공급망 커넥터 권한이 없습니다.' };
  return { ok: true, actor: `mall-ops:${email}` };
}

function configured(env) {
  return {
    apiKeyConfigured: Boolean(env.DOMEMAE_API_KEY),
    userIdConfigured: Boolean(env.DOMEMAE_USER_ID),
    sessionConfigured: Boolean(env.DOMEMAE_SESSION_ID),
    passwordConfigured: Boolean(env.DOMEMAE_PASSWORD),
    approvedMemberConfigured: Boolean(env.DOMEMAE_APPROVED_MEMBER_ID),
    approvedMemberBindingReady: Boolean(env.DOMEMAE_APPROVED_MEMBER_ID) && String(env.DOMEMAE_APPROVED_MEMBER_ID).trim() === String(env.DOMEMAE_USER_ID || '').trim(),
    readOnlyProbeEnabled: flag(env.DOMEGGOOK_READONLY_AUTH_PROBE_ENABLED),
    lookupEnabled: flag(env.DOMEMAE_LOOKUP_ENABLED),
    orderEnabled: false,
    autoOrderEnabled: false,
    customerPiiReleaseEnabled: false
  };
}

function safeItemNo(value) {
  const text = clean(value, 30);
  return /^\d{1,15}$/.test(text) ? text : '';
}

function findFirst(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return obj[key];
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findFirst(value, keys);
      if (found != null) return found;
    }
  }
  return undefined;
}

export function normalizeDomemaeItem(payload, requestedItemNo) {
  const title = clean(findFirst(payload, ['title', 'itemTitle']), 240);
  const status = clean(findFirst(payload, ['status', 'itemStatus']), 80);
  const section = clean(findFirst(payload, ['section', 'itemSection']), 80);
  const market = clean(findFirst(payload, ['market']), 40);
  const sellerId = clean(findFirst(payload, ['sellerId']), 120);
  const itemNo = clean(findFirst(payload, ['no', 'itemNo']), 30) || requestedItemNo;
  return { itemNo, title, status, section, market, sellerId };
}

async function recordCheck(env, type, externalRef, resultStatus, metadata = {}) {
  if (!env.DB) return;
  await env.DB.prepare(`INSERT INTO supplier_connector_checks
    (id,provider_id,check_type,external_ref,result_status,metadata_json,checked_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(randomId('chk'), PROVIDER_ID, type, clean(externalRef, 120), resultStatus, JSON.stringify(metadata).slice(0, 3000), nowIso()).run();
}

export async function domemaeConnectorReady(env) {
  if (!env?.DB) return false;
  try {
    const row = await env.DB.prepare(`SELECT id,provider_type,integration_mode,connection_status,catalog_policy,order_mode,auto_order_enabled,customer_pii_allowed
      FROM sourcing_providers WHERE id=?`).bind(PROVIDER_ID).first();
    return Boolean(row && row.provider_type === 'supplier_api' && row.integration_mode === 'api' && row.catalog_policy === 'reference_only'
      && row.order_mode === 'api_order' && Number(row.auto_order_enabled) === 0 && Number(row.customer_pii_allowed) === 0);
  } catch { return false; }
}

/** Explicit whitelist: never return raw vendor JSON, supplier identifiers or secrets. */
function safeAuthEvidence(input) {
  if (!input || typeof input !== 'object') return null;
  const resultTypes = new Set(['success','false','other','missing']);
  const modes = new Set(['loopback-fallback','loopback-configured','configured']);
  return {
    httpStatus: Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599 ? input.httpStatus : null,
    jsonParsed: input.jsonParsed === true,
    supplierResult: resultTypes.has(input.supplierResult) ? input.supplierResult : 'missing',
    clientIpMode: modes.has(input.clientIpMode) ? input.clientIpMode : 'unknown'
  };
}

async function readOnlyAuthProbeStatus(env) {
  const row = await env.DB.prepare("SELECT result_status,checked_at,metadata_json FROM supplier_connector_checks WHERE provider_id=? AND external_ref='probe:login' ORDER BY checked_at DESC LIMIT 1")
    .bind(PROVIDER_ID).first().catch(() => null);
  let meta = {};
  try { meta = JSON.parse(row?.metadata_json || '{}'); } catch {}
  const allowed = new Set(['MEMBER_ERROR', 'LOGIN_FAILED', 'ASSET_PROBE_FAILED', 'ACCOUNT_BINDING_MISMATCH', 'SNS_PASSWORD_REQUIRED', 'PASSWORD_REJECTED', 'LOGIN_REJECTED', 'PRIVATE_API_PERMISSION', 'CLIENT_IP_REJECTED']);
  return {
    enabled: flag(env.DOMEGGOOK_READONLY_AUTH_PROBE_ENABLED),
    result: row?.result_status === 'ok' ? 'ok' : row?.result_status === 'failed' ? 'failed' : 'not-checked',
    checkedAt: /^\d{4}-\d{2}-\d{2}T/.test(String(row?.checked_at || '')) ? row.checked_at : null,
    login: meta.login === 'ok' ? 'ok' : meta.login === 'failed' ? 'failed' : 'unknown',
    asset: meta.asset === 'ok' ? 'ok' : meta.asset === 'failed' ? 'failed' : 'unknown',
    loginIdMatchesConfigured: typeof meta.loginIdMatchesConfigured === 'boolean' ? meta.loginIdMatchesConfigured : null,
    errorCode: allowed.has(meta.errorCode) ? meta.errorCode : null,
    diagnostic: safeAuthEvidence(meta.diagnostic)
  };
}

async function readiness(env, actor) {
  const cfg = configured(env);
  const providerReady = await domemaeConnectorReady(env);
  const readOnlyAuthProbe = await readOnlyAuthProbeStatus(env);
  const body = {
    providerId: PROVIDER_ID,
    providerReady,
    readOnlyAuthProbe,
    credentials: {
      apiKeyConfigured: cfg.apiKeyConfigured,
      userIdConfigured: cfg.userIdConfigured,
      sessionConfigured: cfg.sessionConfigured,
      passwordConfigured: cfg.passwordConfigured,
      approvedMemberConfigured: cfg.approvedMemberConfigured,
      approvedMemberBindingReady: cfg.approvedMemberBindingReady
    },
    capabilities: {
      itemLookup: cfg.lookupEnabled && cfg.apiKeyConfigured,
      orderPrepare: cfg.apiKeyConfigured && cfg.userIdConfigured && cfg.passwordConfigured && cfg.approvedMemberBindingReady,
      orderExecute: false,
      cancellationExecute: false,
      autoOrder: false,
      buyerPiiRelease: false
    },
    gates: {
      lookupEnabled: cfg.lookupEnabled,
      readOnlyAuthProbeEnabled: cfg.readOnlyProbeEnabled,
      approvedMemberBindingReady: cfg.approvedMemberBindingReady,
      orderEnabled: false,
      autoOrderEnabled: false,
      customerPiiReleaseEnabled: false
    },
    nextRequired: [
      !cfg.apiKeyConfigured ? 'DOMEMAE_API_KEY secret' : null,
      !cfg.userIdConfigured ? 'DOMEMAE_USER_ID secret' : null,
      !cfg.passwordConfigured ? 'DOMEMAE_PASSWORD secret for on-demand login' : null,
      !cfg.approvedMemberConfigured ? 'DOMEMAE_APPROVED_MEMBER_ID: 공급사 승인 계정 Secret 설정' : !cfg.approvedMemberBindingReady ? '공급사 승인 회원과 로그인 회원이 일치하지 않습니다' : null,
      !cfg.lookupEnabled ? 'DOMEMAE_LOOKUP_ENABLED staging approval' : null,
      'private/order permission review, e-money test, cancellation/idempotency and PII Vault validation before order execution'
    ].filter(Boolean)
  };
  await recordCheck(env, 'readiness', '', providerReady ? 'ok' : 'blocked', { actor, ...body.gates, credentials: body.credentials });
  return body;
}

async function itemLookup(env, actor, body) {
  const itemNo = safeItemNo(body?.itemNo);
  if (!itemNo) return { status: 400, body: { error: '숫자 상품번호(itemNo)가 필요합니다.' } };
  const cfg = configured(env);
  if (!cfg.lookupEnabled) return { status: 409, body: { error: '도매매 공식 상품조회 gate가 아직 OFF입니다.', code: 'DOMEMAE_LOOKUP_DISABLED' } };
  if (!cfg.apiKeyConfigured) return { status: 503, body: { error: '도매매 API KEY secret이 구성되지 않았습니다.', code: 'DOMEMAE_API_KEY_MISSING' } };

  const params = new URLSearchParams({ ver: '4.6', mode: 'getItemView', aid: env.DOMEMAE_API_KEY, no: itemNo, om: 'json' });
  let response;
  try {
    response = await fetch(`${ENDPOINT}?${params.toString()}`, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error' });
  } catch {
    await recordCheck(env, 'item_lookup', itemNo, 'failed', { actor, reason: 'network' });
    return { status: 502, body: { error: '도매매 공식 API 연결에 실패했습니다.', code: 'DOMEMAE_NETWORK_ERROR' } };
  }
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch {}
  if (!response.ok || !payload) {
    await recordCheck(env, 'item_lookup', itemNo, 'failed', { actor, httpStatus: response.status, json: Boolean(payload) });
    return { status: 502, body: { error: '도매매 공식 API가 유효한 JSON 상품정보를 반환하지 않았습니다.', code: 'DOMEMAE_BAD_RESPONSE', httpStatus: response.status } };
  }
  const item = normalizeDomemaeItem(payload, itemNo);
  const useful = Boolean(item.title || item.status || item.section || item.market);
  await recordCheck(env, 'item_lookup', itemNo, useful ? 'ok' : 'failed', { actor, status: item.status, section: item.section, market: item.market });
  if (!useful) return { status: 502, body: { error: '공식 API 응답에서 상품 기본정보를 확인하지 못했습니다.', code: 'DOMEMAE_ITEM_UNREADABLE' } };
  return {
    status: 200,
    body: {
      providerId: PROVIDER_ID,
      item,
      storagePolicy: 'minimal-live-check-only',
      rawPayloadStored: false,
      orderExecutionEnabled: false,
      note: '이 조회는 후보·가격·재고 검증을 위한 공식 API 확인 단계이며 주문을 생성하지 않습니다.'
    }
  };
}

export async function handleDomemaeRequest(request, env, { runAuthProbe = probeDomeggookLogin } = {}) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/internal/connectors/domemae')) return null;
  if (!env.DB) return { status: 503, body: { error: 'Mall 전용 데이터베이스 연결이 없습니다.' } };
  const auth = await authorizeOperations(request, env);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (request.method === 'GET' && path === '/api/internal/connectors/domemae/readiness') {
    return { status: 200, body: { readiness: await readiness(env, auth.actor), actor: auth.actor } };
  }
  if (request.method === 'POST' && path === '/api/internal/connectors/domemae/auth-probe') {
    // Operator-only and throttled. No setOrder, setOrdDeny or customer/PII request.
    const result = await runAuthProbe(env, fetch, { operatorRetry: true });
    const codes = new Set(['SNS_PASSWORD_REQUIRED', 'PASSWORD_REJECTED', 'LOGIN_REJECTED', 'LOGIN_FAILED',
      'MEMBER_ERROR', 'PRIVATE_API_PERMISSION', 'CLIENT_IP_REJECTED', 'ACCOUNT_BINDING_MISMATCH', 'ASSET_PROBE_FAILED']);
    return { status: 200, body: { probe: {
      ok: result.ok === true,
      skipped: ['recent', 'disabled-or-no-credentials'].includes(result.skipped) ? result.skipped : null,
      nextEligibleAt: typeof result.nextEligibleAt === 'string' && /^\d{4}-/.test(result.nextEligibleAt) ? result.nextEligibleAt : null,
      errorCode: codes.has(result.errorCode) ? result.errorCode : null,
      login: result.login === 'ok' ? 'ok' : result.login === 'failed' ? 'failed' : 'unknown',
      asset: result.asset === 'ok' ? 'ok' : result.asset === 'failed' ? 'failed' : 'unknown',
      diagnostic: safeAuthEvidence(result.diagnostic)
    } } };
  }
  if (request.method === 'POST' && path === '/api/internal/connectors/domemae/item-lookup') {
    const body = await readJson(request);
    return body ? itemLookup(env, auth.actor, body) : { status: 400, body: { error: 'Invalid JSON' } };
  }
  if (request.method === 'POST' && path === '/api/internal/connectors/domemae/order-dry-run') {
    const body = await readJson(request);
    const itemNo = safeItemNo(body?.itemNo);
    const quantity = Math.max(1, Math.min(99, Math.trunc(Number(body?.quantity) || 1)));
    if (!itemNo) return { status: 400, body: { error: '숫자 상품번호(itemNo)가 필요합니다.' } };
    const cfg = configured(env);
    await recordCheck(env, 'order_readiness', itemNo, 'blocked', { actor: auth.actor, quantity, credentialsReady: cfg.apiKeyConfigured && cfg.userIdConfigured && cfg.passwordConfigured && cfg.approvedMemberBindingReady });
    return {
      status: 200,
      body: {
        dryRun: { itemNo, quantity, credentialsReady: cfg.apiKeyConfigured && cfg.userIdConfigured && cfg.passwordConfigured && cfg.approvedMemberBindingReady },
        executionAllowed: false,
        blockers: ['DOMEMAE_ORDER_EXECUTION_NOT_IMPLEMENTED', 'PII_VAULT_RELEASE_REQUIRED', 'E_MONEY_AND_CANCEL_FLOW_TEST_REQUIRED', 'SUPPLIER_API_V1_PILOT_LOCKED'],
        note: '공식 setOrder 호출은 아직 구현하지 않았습니다. 샌드박스가 없어 실거래 계정에서 별도 승인된 파일럿 검증 후에만 추가합니다.'
      }
    };
  }
  return { status: 404, body: { error: 'Domemae connector route not found.' } };
}
