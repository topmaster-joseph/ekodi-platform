// EKODI Invest: server-only, read-only broker balance adapter.
//
// Default is MOCK data, always labelled "미연결 · 모의 데이터". Real KIS read-only
// inquiry runs only when ALL of these hold:
//  - INVEST_BROKER_READONLY_KIS is 'paper' or 'live' (operator switch, server env)
//  - KIS_APP_KEY / KIS_APP_SECRET / KIS_ACCOUNT_NO are Worker secrets (server vault)
//  - the caller passed owner + step-up (checked by the runtime) AND Supabase TOTP AAL2
// Requests go only to the canonical GET target approved by invest-broker-readonly-contract.js.
// The only non-GET call is the fixed KIS OAuth token endpoint; no order endpoint exists here.
// The account number never leaves this module: callers see an opaque UUID account reference.
import { checkBrokerReadOnlyRequest, READONLY_BROKER_TARGETS } from './invest-broker-readonly-contract.js';
import { normalizeBrokerReadOnlySnapshot } from './invest-broker-readonly-snapshot.js';

export const BROKER_VIEW_SCHEMA = 'ekodi.invest.broker-readonly-view.v1';
const KIS_TR_ID = Object.freeze({ paper: 'VTTC8434R', live: 'TTTC8434R' });
const KIS_PAGE_LIMIT = 5;
const TOKEN_MIN_REISSUE_MS = 61_000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

// --- mock -------------------------------------------------------------------
// Fictional holdings for UI and validation testing. Not anyone's account.
const MOCK_ACCOUNT_REF = '6f1c2b6e-0b8a-4c3e-9d2a-7e5f00000001';
const MOCK_POSITIONS = Object.freeze([
  { symbol: '069500', name: '(모의) 국내 대표지수 ETF', quantity: '12', marketValue: '450000' },
  { symbol: '360750', name: '(모의) 미국 대표지수 ETF', quantity: '20', marketValue: '380000' },
  { symbol: '148070', name: '(모의) 국고채 ETF', quantity: '3', marketValue: '330000' },
]);
const MOCK_CASH = '1840000';

export function mockBrokerSnapshot({ brokerId, now = Date.now(), snapshotRef = crypto.randomUUID() }) {
  const environment = brokerId === 'kis' ? 'paper' : 'live';
  const holdings = MOCK_POSITIONS.reduce((sum, p) => sum + BigInt(p.marketValue), 0n);
  return {
    raw: {
      brokerId, environment, accountRef: MOCK_ACCOUNT_REF, snapshotRef,
      capturedAt: new Date(now).toISOString(), currency: 'KRW', cashAmount: MOCK_CASH,
      reportedTotal: (BigInt(MOCK_CASH) + holdings).toString(),
      positions: MOCK_POSITIONS.map(p => ({ symbol: p.symbol, market: 'KR', currency: 'KRW', quantity: p.quantity, marketValue: p.marketValue })),
    },
    names: Object.fromEntries(MOCK_POSITIONS.map(p => [p.symbol, p.name])),
  };
}

// --- configuration ------------------------------------------------------------
export function kisReadOnlyConfig(env = {}) {
  const environment = String(env.INVEST_BROKER_READONLY_KIS || '').trim();
  if (!['paper', 'live'].includes(environment)) return { enabled: false, reason: 'KIS_READONLY_SWITCH_OFF' };
  const appKey = String(env.KIS_APP_KEY || '').trim();
  const appSecret = String(env.KIS_APP_SECRET || '').trim();
  const account = String(env.KIS_ACCOUNT_NO || '').replace(/\s+/g, '');
  if (!appKey || !appSecret) return { enabled: false, reason: 'KIS_VAULT_CREDENTIAL_MISSING', environment };
  const m = account.match(/^(\d{8})-?(\d{2})$/);
  if (!m) return { enabled: false, reason: 'KIS_ACCOUNT_REFERENCE_INVALID', environment };
  return { enabled: true, environment, appKey, appSecret, cano: m[1], productCode: m[2] };
}

// Opaque, stable account reference (UUID v8 layout) so the account number never leaves the server.
export async function opaqueAccountRef(parts) {
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(parts.join(':'))))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) & 3]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// --- encrypted token cache (D1) ---------------------------------------------------
async function cacheKey(appSecret) {
  const base = await crypto.subtle.importKey('raw', enc.encode(appSecret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('ekodi-invest-kis-token-cache'), info: enc.encode('v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function readCachedToken(db, cfg, now) {
  const row = await db.prepare(`SELECT token_cipher,token_iv,expires_at,issued_at FROM investment_broker_token_cache WHERE cache_key=?`)
    .bind('kis:' + cfg.environment).first();
  if (!row) return { token: null, issuedAt: 0 };
  const issuedAt = Date.parse(row.issued_at || '') || 0;
  const expires = Date.parse(row.expires_at || '');
  if (!row.token_cipher || !Number.isFinite(expires) || expires - TOKEN_REFRESH_MARGIN_MS <= now) return { token: null, issuedAt };
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.token_iv) }, await cacheKey(cfg.appSecret), unb64(row.token_cipher));
    return { token: dec.decode(plain), issuedAt };
  } catch { return { token: null, issuedAt } }
}

async function storeToken(db, cfg, token, expiresAt, issuedAt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cacheKey(cfg.appSecret), enc.encode(token));
  await db.prepare(`INSERT INTO investment_broker_token_cache(cache_key,token_cipher,token_iv,expires_at,issued_at,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET token_cipher=excluded.token_cipher,token_iv=excluded.token_iv,
    expires_at=excluded.expires_at,issued_at=excluded.issued_at,updated_at=excluded.updated_at`)
    .bind('kis:' + cfg.environment, b64(cipher), b64(iv), expiresAt, issuedAt, new Date().toISOString()).run();
}

async function clearToken(db, cfg) {
  await db.prepare(`UPDATE investment_broker_token_cache SET token_cipher='',token_iv='' WHERE cache_key=?`).bind('kis:' + cfg.environment).run();
}

// KIS returns "YYYY-MM-DD HH:MM:SS" in KST.
function kisExpiry(data, now) {
  const text = String(data?.access_token_token_expired || '');
  const m = text.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)$/);
  if (m) { const t = Date.parse(`${m[1]}T${m[2]}+09:00`); if (Number.isFinite(t)) return t; }
  const seconds = Number(data?.expires_in);
  return Number.isFinite(seconds) && seconds > 0 ? now + seconds * 1000 : now + 12 * 3600_000;
}

class BrokerError extends Error { constructor(code) { super(code); this.code = code; } }

async function kisAccessToken({ db, cfg, fetchImpl, now, force = false }) {
  const cached = force ? { token: null, issuedAt: 0 } : await readCachedToken(db, cfg, now);
  if (cached.token) return cached.token;
  const last = force ? (await readCachedToken(db, cfg, now)).issuedAt : cached.issuedAt;
  if (last && now - last < TOKEN_MIN_REISSUE_MS) throw new BrokerError('KIS_TOKEN_REISSUE_TOO_SOON');
  const origin = READONLY_BROKER_TARGETS.kis[cfg.environment].origin;
  const response = await fetchImpl(origin + '/oauth2/tokenP', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: cfg.appKey, appsecret: cfg.appSecret }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data?.access_token !== 'string' || data.access_token.length < 20) throw new BrokerError('KIS_TOKEN_REFUSED');
  await storeToken(db, cfg, data.access_token, new Date(kisExpiry(data, now)).toISOString(), new Date(now).toISOString());
  return data.access_token;
}

const KIS_QUERY = Object.freeze({
  AFHR_FLPR_YN: 'N', OFL_YN: '', INQR_DVSN: '02', UNPR_DVSN: '01', FUND_STTL_ICLD_YN: 'N',
  FNCG_AMT_AUTO_RDPT_YN: 'N', PRCS_DVSN: '00',
});
const digits = v => { const s = String(v ?? '').trim(); return /^\d{1,15}$/.test(s) ? BigInt(s).toString() : null; };
const qty = v => { const s = String(v ?? '').trim(); return /^\d{1,10}$/.test(s) ? BigInt(s).toString() : null; };

async function kisBalancePages({ cfg, token, fetchImpl }) {
  const target = checkBrokerReadOnlyRequest({
    brokerId: 'kis', environment: cfg.environment, operation: 'holdings', method: 'GET',
    requestedUrl: READONLY_BROKER_TARGETS.kis[cfg.environment].origin + READONLY_BROKER_TARGETS.kis[cfg.environment].operations.holdings,
  });
  if (!target.allowed) throw new BrokerError('BROKER_TARGET_REFUSED');
  const rows = []; let summary = null; let fk = '', nk = '', cont = '';
  for (let page = 0; page < KIS_PAGE_LIMIT; page++) {
    const url = new URL(target.canonicalUrl);
    const query = { CANO: cfg.cano, ACNT_PRDT_CD: cfg.productCode, ...KIS_QUERY, CTX_AREA_FK100: fk, CTX_AREA_NK100: nk };
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + token,
        appkey: cfg.appKey, appsecret: cfg.appSecret, tr_id: KIS_TR_ID[cfg.environment], custtype: 'P', tr_cont: cont,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || data?.msg_cd === 'EGW00121' || data?.msg_cd === 'EGW00123') throw new BrokerError('KIS_TOKEN_EXPIRED');
    if (!response.ok || String(data?.rt_cd) !== '0') throw new BrokerError('KIS_BALANCE_REFUSED');
    for (const row of Array.isArray(data.output1) ? data.output1 : []) rows.push(row);
    if (Array.isArray(data.output2) && data.output2[0]) summary = data.output2[0];
    const more = String(response.headers.get('tr_cont') || '').trim();
    if (more !== 'F' && more !== 'M') break;
    fk = String(data.ctx_area_fk100 || ''); nk = String(data.ctx_area_nk100 || ''); cont = 'N';
    if (page === KIS_PAGE_LIMIT - 1) throw new BrokerError('KIS_TOO_MANY_PAGES');
  }
  return { rows, summary };
}

export function kisRowsToRawSnapshot({ rows, summary, environment, accountRef, snapshotRef, now }) {
  const positions = []; const names = {};
  for (const row of rows) {
    const quantity = qty(row?.hldg_qty);
    if (quantity === null) throw new BrokerError('KIS_ROW_INVALID');
    if (quantity === '0') continue;
    const value = digits(row?.evlu_amt);
    const symbol = String(row?.pdno || '').trim();
    if (value === null || !/^[A-Z0-9]{1,12}$/.test(symbol)) throw new BrokerError('KIS_ROW_INVALID');
    positions.push({ symbol, market: 'KR', currency: 'KRW', quantity, marketValue: value });
    names[symbol] = String(row?.prdt_name || '').slice(0, 60);
  }
  const cash = digits(summary?.dnca_tot_amt);
  if (cash === null) throw new BrokerError('KIS_SUMMARY_INVALID');
  // KIS tot_evlu_amt follows its own settlement rules, so no reportedTotal is asserted here.
  return { raw: { brokerId: 'kis', environment, accountRef, snapshotRef, capturedAt: new Date(now).toISOString(), currency: 'KRW', cashAmount: cash, positions }, names };
}

// --- validation summary ----------------------------------------------------------
const CHECKS = Object.freeze([
  ['schema', '허용된 항목만 포함 (민감정보·임의 필드 거부)', ['UNEXPECTED_SNAPSHOT_FIELDS', 'UNEXPECTED_POSITION_FIELDS', 'OPAQUE_REFERENCES_REQUIRED']],
  ['environment', '허용된 증권사·환경 (실전·모의 분리)', ['BROKER_ENVIRONMENT_NOT_ALLOWED']],
  ['freshness', '기준 시각 5분 이내 (오래되거나 미래 시각 거부)', ['INVALID_CAPTURE_TIME', 'STALE_OR_FUTURE_SNAPSHOT']],
  ['currency', '단일 통화 (통화 혼합 거부)', ['UNSUPPORTED_CURRENCY', 'CROSS_CURRENCY_SNAPSHOT']],
  ['instruments', '종목·수량·금액 형식', ['INVALID_INSTRUMENT', 'INVALID_QUANTITY', 'INVALID_MARKET_VALUE', 'INVALID_CASH_AMOUNT', 'INVALID_POSITION_COUNT']],
  ['duplicates', '종목 중복 없음', ['DUPLICATE_POSITION']],
  ['total', '현금 + 보유자산 = 총액', ['BROKER_TOTAL_MISMATCH']],
]);
export function validationSummary(normalized) {
  const error = normalized?.accepted === true ? null : String(normalized?.error || 'SNAPSHOT_REJECTED');
  return {
    accepted: !error, error,
    checks: CHECKS.map(([id, label, codes]) => ({ id, label, status: !error ? 'pass' : (codes.includes(error) ? 'fail' : 'unverified') })),
    sourceAuthenticated: false, ownerBindingVerified: false,
  };
}

// --- public entry -------------------------------------------------------------------
const LABEL = {
  mock: '미연결 · 모의 데이터',
  'kis-paper': '연결됨 · 조회 전용 (KIS 모의투자 서버)',
  'kis-live': '연결됨 · 조회 전용 (KIS 실전 서버)',
};

function view({ brokerId, dataMode, connection, normalized, names, notice, blockers = [], error = null }) {
  const accepted = normalized?.accepted === true;
  return {
    schema: BROKER_VIEW_SCHEMA, brokerId, dataMode, connection,
    label: LABEL[dataMode] || '미연결',
    notice, blockers, error,
    snapshot: accepted ? {
      capturedAt: normalized.capturedAt, currency: normalized.currency, environment: normalized.environment,
      accountRef: normalized.accountRef, cashMinor: normalized.cashMinor, holdingsMinor: normalized.holdingsMinor,
      totalMinor: normalized.totalMinor,
      positions: normalized.positions.map(p => ({ ...p, name: names?.[p.symbol] || '' })),
    } : null,
    validation: normalized ? validationSummary(normalized) : null,
    readOnly: true, liveOrdersEnabled: false, orderExecutionPerformed: false, credentialsIncluded: false,
  };
}

export async function buildBrokerReadOnlyView({ brokerId, env = {}, db, fetchImpl = fetch, now = Date.now(), strongMfaVerified = false }) {
  const mock = () => {
    const m = mockBrokerSnapshot({ brokerId, now });
    return { normalized: normalizeBrokerReadOnlySnapshot(m.raw, { now }), names: m.names };
  };
  const cfg = brokerId === 'kis' ? kisReadOnlyConfig(env) : { enabled: false, reason: 'BROKER_READONLY_ADAPTER_NOT_RELEASED' };
  if (!cfg.enabled || !strongMfaVerified || !db) {
    const blockers = [cfg.enabled ? null : cfg.reason, strongMfaVerified ? null : 'STRONG_MFA_AAL2_REQUIRED', db ? null : 'DATABASE_UNAVAILABLE'].filter(Boolean);
    const m = mock();
    return view({ brokerId, dataMode: 'mock', connection: 'disconnected', ...m, blockers,
      notice: '실제 계좌가 아닌 모의 데이터입니다. 증권사 조회 연결이 승인·검증되기 전까지 실제 잔고를 표시하지 않습니다.' });
  }
  const dataMode = 'kis-' + cfg.environment;
  try {
    const accountRef = await opaqueAccountRef(['kis', cfg.environment, cfg.cano, cfg.productCode]);
    let token = await kisAccessToken({ db, cfg, fetchImpl, now });
    let pages;
    try { pages = await kisBalancePages({ cfg, token, fetchImpl }); }
    catch (e) {
      if (e?.code !== 'KIS_TOKEN_EXPIRED') throw e;
      await clearToken(db, cfg);
      token = await kisAccessToken({ db, cfg, fetchImpl, now, force: true });
      pages = await kisBalancePages({ cfg, token, fetchImpl });
    }
    const built = kisRowsToRawSnapshot({ ...pages, environment: cfg.environment, accountRef, snapshotRef: crypto.randomUUID(), now });
    const normalized = normalizeBrokerReadOnlySnapshot(built.raw, { now });
    return view({ brokerId, dataMode, connection: normalized.accepted ? 'connected-readonly' : 'error', normalized, names: built.names,
      notice: '증권사 공식 API에서 조회만 했습니다. 주문·이체 기능은 없습니다.' });
  } catch (e) {
    return view({ brokerId, dataMode, connection: 'error', normalized: null, names: null, error: String(e?.code || 'KIS_READONLY_UNAVAILABLE'),
      notice: '증권사 조회에 실패했습니다. 실제 잔고를 대신해 모의 데이터를 보여주지 않습니다.' });
  }
}
