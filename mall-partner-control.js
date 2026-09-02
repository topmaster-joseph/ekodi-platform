import authWorker from './auth-worker.js';
import {
  decryptMallPartnerCredential,
  encryptMallPartnerCredential,
  mallPartnerFingerprint,
  mallPartnerVaultReady,
} from './mall-partner-vault.js';

const ADMIN_PREFIX = '/api/mall/admin/providers';
const PUBLIC_PATH = '/api/mall/providers/search';
const ALLOWED_ORIGINS = new Set(['https://ekodi.kr', 'https://admin.ekodi.kr']);
const KINDS = new Set(['affiliate', 'supplier', 'direct_partner']);
const AUTH_MODES = new Set(['none', 'bearer', 'header']);
const RESERVED_IDS = new Set(['ekodi', 'coupang', 'naver', 'linkprice', 'aliexpress', 'amazon']);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
async function requestBody(request) {
  try { return await request.json(); } catch { return null; }
}
function cors(request) {
  const origin = String(request.headers.get('origin') || '');
  const headers = new Headers({
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  });  if (ALLOWED_ORIGINS.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}
function json(request, data, status = 200, cache = 'no-store') {
  const headers = cors(request);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', cache);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}
function providerId(value) {
  const id = clean(value, 64).toLowerCase().normalize('NFKC')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return /^[a-z][a-z0-9-]{1,63}$/.test(id) ? id : '';
}
function paramName(value, fallback) {
  const name = clean(value || fallback, 40);
  return /^[A-Za-z0-9_.-]{1,40}$/.test(name) ? name : fallback;
}
function fieldPath(value, max = 80) {
  const path = clean(value, max);
  return !path || /^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+){0,5}$/.test(path) ? path : '';
}
function headerName(value) {
  const name = clean(value, 80);
  if (!name || !/^[A-Za-z0-9-]{1,80}$/.test(name)) return '';
  const lower = name.toLowerCase();
  if (['host', 'cookie', 'set-cookie', 'content-length', 'connection'].includes(lower)) return '';
  if (lower.startsWith('cf-') || lower.startsWith('x-forwarded-')) return '';
  return name;
}function safeFeedUrl(value) {
  let url;
  try { url = new URL(clean(value, 1200)); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
  if (host.endsWith('.internal') || host === 'metadata.google.internal' || host.includes(':')) return null;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some(value => value > 255)) return null;
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return null;
    if (a === 100 && b >= 64 && b <= 127) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
  }
  url.hash = '';
  return url;
}
function readPath(value, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((current, key) =>
    current && typeof current === 'object' ? current[key] : undefined, value);
}
function firstValue(raw, paths) {
  for (const path of paths) {
    const value = readPath(raw, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}function parseTags(value) {
  if (Array.isArray(value)) return value.map(item => clean(item, 80)).filter(Boolean).slice(0, 20);
  return clean(value, 600).split(',').map(item => clean(item, 80)).filter(Boolean).slice(0, 20);
}
function parseStoredJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}
function parseMapping(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const key of ['id', 'name', 'price', 'originalPrice', 'url', 'image', 'category', 'rating', 'reviewCount', 'tags']) {
    const path = fieldPath(source[key]);
    if (path) result[key] = path;
  }
  return result;
}
function providerConfig(row) {
  return {
    id: row.id,
    name: row.display_name,
    kind: row.kind,
    feedUrl: row.feed_url,
    queryParam: row.query_param,
    limitParam: row.limit_param,
    itemPath: row.item_path,
    authMode: row.auth_mode,
    authHeaderName: row.auth_header_name,
    mapping: parseStoredJson(row.mapping_json, {}),
    disclosure: row.disclosure_text,
    commercialTerms: row.commercial_terms,
    credentialConfigured: Boolean(row.credential_ciphertext),
  };
}
async function fingerprint(row) {
  return mallPartnerFingerprint(providerConfig(row));
}function providerView(row) {
  return {
    id: row.id,
    name: row.display_name,
    kind: row.kind,
    status: row.status,
    feedUrl: row.feed_url,
    queryParam: row.query_param,
    limitParam: row.limit_param,
    itemPath: row.item_path,
    authMode: row.auth_mode,
    authHeaderName: row.auth_header_name,
    mapping: parseStoredJson(row.mapping_json, {}),
    disclosure: row.disclosure_text || '',
    commercialTerms: row.commercial_terms || '',
    credentialConfigured: Boolean(row.credential_ciphertext),
    lastTestAt: row.last_test_at || null,
    lastTestStatus: row.last_test_status || 'never',
    lastTestCount: Number(row.last_test_count || 0),
    lastTestLatencyMs: Number(row.last_test_latency_ms || 0),
    lastError: row.last_error || '',
    testedCurrentConfig: Boolean(row.test_fingerprint && row.test_fingerprint === row.current_fingerprint),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS mall_partner_providers(
      id TEXT PRIMARY KEY,display_name TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'direct_partner',feed_url TEXT NOT NULL,
      query_param TEXT NOT NULL DEFAULT 'q',limit_param TEXT NOT NULL DEFAULT 'limit',item_path TEXT NOT NULL DEFAULT '',
      auth_mode TEXT NOT NULL DEFAULT 'none',auth_header_name TEXT NOT NULL DEFAULT '',credential_ciphertext TEXT NOT NULL DEFAULT '',
      credential_iv TEXT NOT NULL DEFAULT '',mapping_json TEXT NOT NULL DEFAULT '{}',disclosure_text TEXT NOT NULL DEFAULT '',
      commercial_terms TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'inactive',last_test_at TEXT NOT NULL DEFAULT '',
      last_test_status TEXT NOT NULL DEFAULT 'never',last_test_count INTEGER NOT NULL DEFAULT 0,last_test_latency_ms INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',test_fingerprint TEXT NOT NULL DEFAULT '',current_fingerprint TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_mall_partner_status ON mall_partner_providers(status,updated_at DESC)'),
  ]);
}async function sessionCheck(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url, { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  const session = await response.clone().json().catch(() => null);
  return session?.authenticated && session?.email ? { response, session } : { response };
}
async function adminId(env, email) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE lower(trim(email))=?')
    .bind(clean(email, 320).toLowerCase()).first();
  return row?.id || null;
}
async function audit(env, session, action, resource, detail = '') {
  const id = await adminId(env, session.email);
  await env.DB.prepare('INSERT INTO audit_logs(admin_id,action,resource,detail,created_at) VALUES(?,?,?,?,?)')
    .bind(id, action, resource, clean(detail, 700), new Date().toISOString()).run();
}
function normalizeInput(input, current = {}) {
  const name = clean(input.name ?? current.display_name, 160);
  const kind = clean(input.kind ?? current.kind ?? 'direct_partner', 30);
  const feed = safeFeedUrl(input.feedUrl ?? current.feed_url);
  const authMode = clean(input.authMode ?? current.auth_mode ?? 'none', 20);
  const authHeader = headerName(input.authHeaderName ?? current.auth_header_name);
  const rawItemPath = clean(input.itemPath ?? current.item_path, 120);
  const itemPath = fieldPath(rawItemPath, 120);
  if (!name) throw new Error('PROVIDER_NAME_REQUIRED');
  if (!KINDS.has(kind)) throw new Error('PROVIDER_KIND_INVALID');
  if (!feed) throw new Error('PROVIDER_FEED_URL_INVALID');
  if (!AUTH_MODES.has(authMode)) throw new Error('PROVIDER_AUTH_MODE_INVALID');
  if (authMode === 'header' && !authHeader) throw new Error('PROVIDER_AUTH_HEADER_INVALID');
  if (rawItemPath && !itemPath) throw new Error('PROVIDER_ITEM_PATH_INVALID');
  return {
    name, kind, feedUrl: feed.toString(),
    queryParam: paramName(input.queryParam ?? current.query_param, 'q'),
    limitParam: paramName(input.limitParam ?? current.limit_param, 'limit'),
    itemPath, authMode, authHeaderName: authMode === 'header' ? authHeader : '',
    mapping: parseMapping(input.mapping ?? parseStoredJson(current.mapping_json, {})),
    disclosure: clean(input.disclosure ?? current.disclosure_text, 700),
    commercialTerms: clean(input.commercialTerms ?? current.commercial_terms, 700),
  };
}async function saveProvider(request, env, session, id, input, current = null) {
  let value;
  try { value = normalizeInput(input, current || {}); }
  catch (error) { return json(request, { error: '제휴처 설정값을 확인해 주세요.', code: error.message }, 400); }
  const now = new Date().toISOString();
  const actor = clean(session.email, 320).toLowerCase();
  let ciphertext = current?.credential_ciphertext || '';
  let iv = current?.credential_iv || '';
  if (input.clearCredential === true) {
    ciphertext = '';
    iv = '';
  } else if (Object.prototype.hasOwnProperty.call(input, 'credential')) {
    const credential = clean(input.credential, 4000);
    if (credential) {
      if (!mallPartnerVaultReady(env)) {
        return json(request, { error: '제휴처 비밀정보 Vault가 준비되지 않았습니다.', code: 'MALL_PARTNER_VAULT_NOT_READY' }, 503);
      }
      const encrypted = await encryptMallPartnerCredential(env, credential);
      ciphertext = encrypted.ciphertext;
      iv = encrypted.iv;
    }
  }
  const configRow = {
    id, display_name: value.name, kind: value.kind, feed_url: value.feedUrl,
    query_param: value.queryParam, limit_param: value.limitParam, item_path: value.itemPath,
    auth_mode: value.authMode, auth_header_name: value.authHeaderName,
    credential_ciphertext: ciphertext, mapping_json: JSON.stringify(value.mapping),
    disclosure_text: value.disclosure, commercial_terms: value.commercialTerms,
  };
  const currentFingerprint = await fingerprint(configRow);
  await env.DB.prepare(`INSERT INTO mall_partner_providers(
    id,display_name,kind,feed_url,query_param,limit_param,item_path,auth_mode,auth_header_name,credential_ciphertext,credential_iv,
    mapping_json,disclosure_text,commercial_terms,status,last_test_at,last_test_status,last_test_count,last_test_latency_ms,last_error,
    test_fingerprint,current_fingerprint,updated_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'inactive','','never',0,0,'','',?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,kind=excluded.kind,feed_url=excluded.feed_url,
    query_param=excluded.query_param,limit_param=excluded.limit_param,item_path=excluded.item_path,auth_mode=excluded.auth_mode,
    auth_header_name=excluded.auth_header_name,credential_ciphertext=excluded.credential_ciphertext,credential_iv=excluded.credential_iv,
    mapping_json=excluded.mapping_json,disclosure_text=excluded.disclosure_text,commercial_terms=excluded.commercial_terms,status='inactive',
    last_test_status='needs_test',last_error='',test_fingerprint='',current_fingerprint=excluded.current_fingerprint,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(id, value.name, value.kind, value.feedUrl, value.queryParam, value.limitParam, value.itemPath,
      value.authMode, value.authHeaderName, ciphertext, iv, JSON.stringify(value.mapping), value.disclosure,
      value.commercialTerms, currentFingerprint, actor, current?.created_at || now, now).run();  await audit(env, session, current ? 'mall.provider.update' : 'mall.provider.create', id,
    JSON.stringify({ kind: value.kind, authMode: value.authMode, status: 'inactive' }));
  const saved = await env.DB.prepare('SELECT * FROM mall_partner_providers WHERE id=?').bind(id).first();
  return json(request, { provider: providerView(saved) });
}
async function readLimitedText(response, maxBytes = 2_000_000) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('PROVIDER_RESPONSE_TOO_LARGE');
  if (!response.body) return '';
  const reader = response.body.getReader();
  let total = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error('PROVIDER_RESPONSE_TOO_LARGE');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(output);
}
function extractItems(payload, row) {
  if (row.item_path) {
    const found = readPath(payload, row.item_path);
    return Array.isArray(found) ? found : [];
  }
  if (Array.isArray(payload)) return payload;
  for (const key of ['products', 'items', 'data', 'results']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}function normalizeProduct(row, raw, index) {
  const mapping = parseStoredJson(row.mapping_json, {});
  const get = (key, fallbacks) => firstValue(raw, [mapping[key], ...fallbacks].filter(Boolean));
  const name = clean(get('name', ['name', 'title', 'productName']), 240);
  const sourceUrl = clean(get('url', ['sourceUrl', 'url', 'link', 'productUrl']), 1400);
  if (!name || !sourceUrl) return null;
  let parsed;
  try { parsed = new URL(sourceUrl); } catch { return null; }
  if (parsed.protocol !== 'https:') return null;
  const rawId = clean(get('id', ['id', 'productId', 'itemId']) ?? index, 160);
  const price = Number(get('price', ['price', 'salePrice', 'productPrice']) || 0) || 0;
  const original = Number(get('originalPrice', ['original', 'originalPrice', 'listPrice']) || 0) || 0;
  return {
    id: `${row.id}:${rawId || index}`,
    providerId: row.id,
    providerName: row.display_name,
    name,
    category: clean(get('category', ['category', 'categoryName']), 100) || 'all',
    categoryLabel: 'PARTNER',
    price,
    original: original > price ? original : 0,
    image: clean(get('image', ['image', 'imageUrl', 'thumbnail']), 1400),
    saleMode: 'external',
    sourceType: 'managed-partner',
    sourceUrl: parsed.toString(),
    rating: Number(get('rating', ['rating']) || 0) || 0,
    reviewCount: Number(get('reviewCount', ['reviewCount', 'reviews']) || 0) || 0,
    tags: parseTags(get('tags', ['tags', 'keywords'])),
    affiliate: row.kind === 'affiliate' || row.kind === 'direct_partner',
  };
}
async function fetchProvider(env, row, keyword, limit) {
  const start = Date.now();
  const url = safeFeedUrl(row.feed_url);
  if (!url) throw new Error('PROVIDER_FEED_URL_INVALID');
  url.searchParams.set(row.query_param || 'q', clean(keyword, 100) || '선물');
  url.searchParams.set(row.limit_param || 'limit', String(limit));
  const headers = new Headers({ accept: 'application/json' });  const credential = await decryptMallPartnerCredential(env, row);
  if (row.auth_mode === 'bearer') {
    if (!credential) throw new Error('PROVIDER_CREDENTIAL_REQUIRED');
    headers.set('authorization', `Bearer ${credential}`);
  } else if (row.auth_mode === 'header') {
    if (!credential) throw new Error('PROVIDER_CREDENTIAL_REQUIRED');
    headers.set(row.auth_header_name, credential);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  let response;
  try {
    response = await fetch(url.toString(), { headers, redirect: 'manual', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 300 && response.status < 400) throw new Error('PROVIDER_REDIRECT_NOT_ALLOWED');
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('json')) throw new Error('PROVIDER_RESPONSE_NOT_JSON');
  const text = await readLimitedText(response);
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('PROVIDER_JSON_INVALID'); }
  const items = extractItems(payload, row);
  const products = items.slice(0, limit).map((item, index) => normalizeProduct(row, item, index)).filter(Boolean);
  return { products, count: products.length, latencyMs: Date.now() - start };
}
async function testProvider(request, env, session, id) {
  const row = await env.DB.prepare('SELECT * FROM mall_partner_providers WHERE id=?').bind(id).first();
  if (!row) return json(request, { error: '제휴처를 찾을 수 없습니다.', code: 'MALL_PROVIDER_NOT_FOUND' }, 404);
  const input = await requestBody(request) || {};
  const query = clean(input.query, 100) || '선물';
  let result;
  let status = 'ok';
  let error = '';
  try {
    result = await fetchProvider(env, row, query, 5);
    if (!result.count) { status = 'empty'; error = '상품 형식과 필드 매핑을 확인해 주세요.'; }
  } catch (caught) {
    status = 'failed';
    error = clean(caught?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : caught?.message || caught, 300);
    result = { count: 0, latencyMs: 0, products: [] };
  }  const now = new Date().toISOString();
  const currentFingerprint = await fingerprint(row);
  await env.DB.prepare(`UPDATE mall_partner_providers SET last_test_at=?,last_test_status=?,last_test_count=?,
    last_test_latency_ms=?,last_error=?,test_fingerprint=? WHERE id=?`)
    .bind(now, status, result.count, result.latencyMs, error, status === 'ok' ? currentFingerprint : '', id).run();
  await audit(env, session, 'mall.provider.test', id,
    JSON.stringify({ status, count: result.count, latencyMs: result.latencyMs, error }));
  return json(request, {
    test: {
      status,
      count: result.count,
      latencyMs: result.latencyMs,
      error,
      samples: result.products.slice(0, 3).map(product => ({
        name: product.name,
        price: product.price,
        sourceUrl: product.sourceUrl,
      })),
    },
  }, status === 'failed' ? 422 : 200);
}
async function setStatus(request, env, session, id, target) {
  const row = await env.DB.prepare('SELECT * FROM mall_partner_providers WHERE id=?').bind(id).first();
  if (!row) return json(request, { error: '제휴처를 찾을 수 없습니다.', code: 'MALL_PROVIDER_NOT_FOUND' }, 404);
  if (target === 'active') {
    const currentFingerprint = await fingerprint(row);
    if (row.last_test_status !== 'ok' || !row.test_fingerprint || row.test_fingerprint !== currentFingerprint) {
      return json(request, {
        error: '현재 설정으로 연결 테스트를 통과한 뒤 활성화할 수 있습니다.',
        code: 'MALL_PROVIDER_TEST_REQUIRED',
      }, 409);
    }
  }
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE mall_partner_providers SET status=?,updated_by=?,updated_at=? WHERE id=?')
    .bind(target, clean(session.email, 320).toLowerCase(), now, id).run();
  await audit(env, session, `mall.provider.${target === 'active' ? 'activate' : 'deactivate'}`, id);
  const saved = await env.DB.prepare('SELECT * FROM mall_partner_providers WHERE id=?').bind(id).first();
  return json(request, { provider: providerView(saved) });
}async function handleAdmin(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  const auth = await sessionCheck(request, env);
  if (!auth.session) return auth.response;
  await ensureSchema(env.DB);
  const path = url.pathname;
  if (request.method === 'GET' && path === ADMIN_PREFIX) {
    const rows = await env.DB.prepare('SELECT * FROM mall_partner_providers ORDER BY status DESC,display_name ASC').all();
    return json(request, {
      providers: (rows.results || []).map(providerView),
      vaultReady: mallPartnerVaultReady(env),
    });
  }
  if (request.method === 'POST' && path === ADMIN_PREFIX) {
    const input = await requestBody(request);
    if (!input) return json(request, { error: '올바른 JSON 요청이 필요합니다.', code: 'MALL_PROVIDER_JSON_REQUIRED' }, 400);
    const id = providerId(input.id || input.name);
    if (!id || RESERVED_IDS.has(id)) {
      return json(request, { error: '제휴처 식별자가 유효하지 않거나 예약되어 있습니다.', code: 'MALL_PROVIDER_ID_INVALID' }, 400);
    }
    const exists = await env.DB.prepare('SELECT id FROM mall_partner_providers WHERE id=?').bind(id).first();
    if (exists) return json(request, { error: '같은 식별자의 제휴처가 이미 있습니다.', code: 'MALL_PROVIDER_EXISTS' }, 409);
    return saveProvider(request, env, auth.session, id, input, null);
  }
  const match = path.match(/^\/api\/mall\/admin\/providers\/([a-z0-9-]+)$/);
  if (match && request.method === 'PUT') {
    const current = await env.DB.prepare('SELECT * FROM mall_partner_providers WHERE id=?').bind(match[1]).first();
    if (!current) return json(request, { error: '제휴처를 찾을 수 없습니다.', code: 'MALL_PROVIDER_NOT_FOUND' }, 404);
    const input = await requestBody(request);
    if (!input) return json(request, { error: '올바른 JSON 요청이 필요합니다.', code: 'MALL_PROVIDER_JSON_REQUIRED' }, 400);
    return saveProvider(request, env, auth.session, match[1], input, current);
  }
  const action = path.match(/^\/api\/mall\/admin\/providers\/([a-z0-9-]+)\/(test|activate|deactivate)$/);
  if (action && request.method === 'POST') {
    if (action[2] === 'test') return testProvider(request, env, auth.session, action[1]);
    return setStatus(request, env, auth.session, action[1], action[2] === 'activate' ? 'active' : 'inactive');
  }
  return json(request, { error: 'Mall Provider Admin API endpoint not found', code: 'MALL_PROVIDER_ADMIN_NOT_FOUND' }, 404);
}async function handlePublic(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'GET' || url.pathname !== PUBLIC_PATH) {
    return json(request, { error: 'Mall Provider API endpoint not found', code: 'MALL_PROVIDER_NOT_FOUND' }, 404);
  }
  await ensureSchema(env.DB);
  const keyword = clean(url.searchParams.get('q') || url.searchParams.get('keyword'), 100) || '선물';
  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 20, 40));
  const rows = await env.DB.prepare("SELECT * FROM mall_partner_providers WHERE status='active' ORDER BY display_name ASC LIMIT 20").all();
  const results = await Promise.all((rows.results || []).map(async row => {
    try {
      const result = await fetchProvider(env, row, keyword, limit);
      return { id: row.id, name: row.display_name, configured: true, count: result.count, products: result.products };
    } catch (error) {
      return {
        id: row.id,
        name: row.display_name,
        configured: true,
        count: 0,
        error: clean(error?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : error?.message || error, 160),
        products: [],
      };
    }
  }));
  return json(request, {
    query: keyword,
    registryMode: 'managed-federated-live',
    providers: results.map(({ products, ...provider }) => provider),
    products: results.flatMap(item => item.products).slice(0, limit),
    generatedAt: new Date().toISOString(),
  }, 200, 'public, max-age=60, stale-while-revalidate=120');
}

export async function handleMallPartnerRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== PUBLIC_PATH && !url.pathname.startsWith(ADMIN_PREFIX)) return null;
  if (!env.DB) {
    return json(request, { error: 'EKODI Core 데이터베이스 연결이 필요합니다.', code: 'MALL_PROVIDER_DATABASE_UNAVAILABLE' }, 503);
  }
  if (url.pathname.startsWith(ADMIN_PREFIX)) return handleAdmin(request, env, url);
  return handlePublic(request, env, url);
}
