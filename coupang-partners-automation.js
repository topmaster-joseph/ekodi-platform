import { createOpenAiProvider } from './openai-provider-adapter.js';
import { affiliateProductOffer, ensureOfferRegistrySchema, upsertOffer } from './offer-registry.js';

const COUPANG_HOST = 'https://api-gateway.coupang.com';
const SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
const LEGACY_SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search';
const DEEPLINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
const ACCOUNT_ID = 'coupang-ekodibiz';
const STOREFRONT = 'ekodi-mall';
const TARGET_PRODUCTS = 24;
const REFRESH_MS = 4 * 60 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const ON_DEMAND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const BASE_SEEDS = Object.freeze([
  { keyword: '생필품', category: '생활' },
  { keyword: '주방용품', category: '주방' },
  { keyword: '간편식', category: '식품' },
  { keyword: '건강용품', category: '건강' },
  { keyword: '디지털 액세서리', category: '디지털' },
]);

const GIFT_SEEDS = Object.freeze([
  { keyword: '감사 선물세트', category: '선물' },
  { keyword: '홍삼 선물세트', category: '선물' },
  { keyword: '건강 선물세트', category: '선물' },
]);

const SEASONAL_SEEDS = Object.freeze({
  1: [{ keyword: '겨울용품', category: '계절' }, { keyword: '보온용품', category: '계절' }],
  2: [{ keyword: '신학기 준비물', category: '계절' }],
  3: [{ keyword: '봄 청소용품', category: '생활' }],
  4: [{ keyword: '봄 나들이용품', category: '계절' }],
  5: [{ keyword: '가정의달 선물', category: '선물' }],
  6: [{ keyword: '장마용품', category: '계절' }],
  7: [{ keyword: '여름용품', category: '계절' }, { keyword: '휴대용 선풍기', category: '디지털' }],
  8: [{ keyword: '여름용품', category: '계절' }, { keyword: '휴대용 선풍기', category: '디지털' }],
  9: [{ keyword: '가을 나들이용품', category: '계절' }],
  10: [{ keyword: '환절기 건강용품', category: '건강' }],
  11: [{ keyword: '겨울 준비용품', category: '계절' }],
  12: [{ keyword: '연말 선물', category: '선물' }],
});

function cleanText(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function configured(env = {}) {
  return Boolean(cleanText(env.COUPANG_PARTNERS_ACCESS_KEY, 500) && cleanText(env.COUPANG_PARTNERS_SECRET_KEY, 500));
}

function isoNow() {
  return new Date().toISOString();
}

function signedDate(now = new Date()) {
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yy}${mo}${dd}T${hh}${mm}${ss}Z`;
}

async function hmacHex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authorization(method, path, query, env) {
  const date = signedDate();
  const accessKey = cleanText(env.COUPANG_PARTNERS_ACCESS_KEY, 500);
  const secretKey = cleanText(env.COUPANG_PARTNERS_SECRET_KEY, 500);
  const message = `${date}${method}${path}${query}`;
  const signature = await hmacHex(secretKey, message);
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${date}, signature=${signature}`;
}

async function coupangRequest(env, { method = 'GET', path, query = new URLSearchParams(), body = null } = {}) {
  const queryText = query instanceof URLSearchParams ? query.toString() : String(query || '').replace(/^\?/, '');
  const url = `${COUPANG_HOST}${path}${queryText ? `?${queryText}` : ''}`;
  const auth = await authorization(method, path, queryText, env);
  const response = await fetch(url, {
    method,
    headers: {
      authorization: auth,
      'content-type': 'application/json;charset=UTF-8',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(`COUPANG_HTTP_${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  if (data && Object.prototype.hasOwnProperty.call(data, 'rCode') && String(data.rCode) !== '0') {
    const error = new Error(`COUPANG_RCODE_${cleanText(data.rCode, 40) || 'UNKNOWN'}`);
    error.data = data;
    throw error;
  }
  return data || {};
}

function seedsForNow(now = new Date()) {
  return [...BASE_SEEDS, ...GIFT_SEEDS, ...(SEASONAL_SEEDS[now.getUTCMonth() + 1] || [])];
}

async function searchSeed(env, seed) {
  const query = new URLSearchParams();
  query.set('keyword', seed.keyword);
  query.set('limit', '10');
  query.set('imageSize', '512x512');
  query.set('srpLinkOnly', 'false');
  const subId = cleanText(env.COUPANG_PARTNERS_SUB_ID, 80);
  if (subId) query.set('subId', subId);

  const explicitPath = cleanText(env.COUPANG_PARTNERS_SEARCH_PATH, 300);
  const primaryPath = explicitPath || SEARCH_PATH;
  let data;
  try {
    data = await coupangRequest(env, { method: 'GET', path: primaryPath, query });
  } catch (error) {
    if (explicitPath || Number(error?.status) !== 404) throw error;
    data = await coupangRequest(env, { method: 'GET', path: LEGACY_SEARCH_PATH, query });
  }
  const products = Array.isArray(data?.data?.productData) ? data.data.productData : [];
  return products.map(item => normalizeCandidate(item, seed)).filter(Boolean);
}

function normalizeCandidate(item, seed) {
  const productId = cleanText(item?.productId, 100);
  const productName = cleanText(item?.productName, 240);
  const productUrl = cleanText(item?.productUrl, 2000);
  if (!productId || !productName || !productUrl) return null;
  const price = Number(item?.productPrice || 0);
  const rank = Math.max(1, Math.trunc(Number(item?.rank || 99)));
  return Object.freeze({
    productId,
    productName,
    productUrl,
    productImage: cleanText(item?.productImage, 2000),
    productPrice: Number.isFinite(price) && price >= 0 ? Math.trunc(price) : 0,
    isRocket: Boolean(item?.isRocket),
    isFreeShipping: Boolean(item?.isFreeShipping),
    rank,
    keyword: seed.keyword,
    category: seed.category,
  });
}

function baseScore(product) {
  let score = Math.max(0, 120 - (product.rank * 4));
  if (product.isRocket) score += 10;
  if (product.isFreeShipping) score += 6;
  if (product.productPrice >= 5_000 && product.productPrice <= 100_000) score += 4;
  if (product.productImage) score += 3;
  return score;
}

function balancedRules(candidates, limit = TARGET_PRODUCTS) {
  const scored = candidates
    .map(product => ({ ...product, selectionScore: baseScore(product) }))
    .sort((a, b) => b.selectionScore - a.selectionScore || a.rank - b.rank || a.productName.localeCompare(b.productName, 'ko'));
  const counts = new Map();
  const keywordCounts = new Map();
  const selected = [];
  for (const product of scored) {
    const count = counts.get(product.category) || 0;
    const keywordCount = keywordCounts.get(product.keyword) || 0;
    if (count >= 6 || keywordCount >= 2) continue;
    selected.push(product);
    counts.set(product.category, count + 1);
    keywordCounts.set(product.keyword, keywordCount + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    for (const product of scored) {
      if (selected.some(item => item.productId === product.productId)) continue;
      selected.push(product);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

function parseJsonObject(text) {
  const source = cleanText(text, 20_000);
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(source.slice(start, end + 1)); } catch { return null; }
}

async function aiSelect(env, candidates) {
  const provider = createOpenAiProvider(env);
  if (!provider.available) return { mode: 'rules', model: '', ids: [] };
  const shortlist = balancedRules(candidates, TARGET_PRODUCTS);
  const compact = shortlist.map(item => ({
    id: item.productId,
    name: item.productName.slice(0, 52),
    category: item.category,
    price: item.productPrice,
    rank: item.rank,
    rocket: item.isRocket,
    freeShipping: item.isFreeShipping,
  }));
  const message = [
    '에코디몰 공개 상품 24개를 고르세요.',
    '조건: 과장 없이 실용성, 카테고리 균형, 다양한 가격대를 우선합니다.',
    '입력에 없는 상품은 절대 만들지 마세요.',
    'JSON만 반환: {"selectedProductIds":["..."]}',
    JSON.stringify(compact),
  ].join('\n');
  try {
    const result = await provider.invoke({
      taskName: 'affiliate-product-selection',
      context: { message, page: { section: 'affiliate', title: 'EKODI Mall automatic curation', pathname: '/api/affiliate/automation' } },
    });
    const parsed = parseJsonObject(result.text);
    const validIds = new Set(shortlist.map(item => item.productId));
    const ids = Array.isArray(parsed?.selectedProductIds)
      ? [...new Set(parsed.selectedProductIds.map(value => cleanText(value, 100)).filter(value => validIds.has(value)))].slice(0, TARGET_PRODUCTS)
      : [];
    return { mode: ids.length ? 'ai' : 'rules', model: ids.length ? cleanText(result.model, 120) : '', ids };
  } catch (error) {
    console.error('EKODI Mall AI selection fallback', String(error?.message || error));
    return { mode: 'rules', model: '', ids: [] };
  }
}

function applyOrder(candidates, ai) {
  const rules = balancedRules(candidates, TARGET_PRODUCTS);
  const byId = new Map(rules.map(item => [item.productId, item]));
  const ordered = [];
  for (const id of ai.ids || []) {
    const item = byId.get(id);
    if (item) ordered.push({ ...item, selectionSource: 'ai' });
  }
  for (const item of rules) {
    if (ordered.some(product => product.productId === item.productId)) continue;
    ordered.push({ ...item, selectionSource: ai.mode === 'ai' ? 'rules-fill' : 'rules' });
    if (ordered.length >= TARGET_PRODUCTS) break;
  }
  return ordered.slice(0, TARGET_PRODUCTS);
}

function isPartnerUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'link.coupang.com' || host === 'coupa.ng';
  } catch { return false; }
}

async function issuePartnerLinks(env, products) {
  const ready = products.map(item => ({ ...item, affiliateUrl: isPartnerUrl(item.productUrl) ? item.productUrl : '' }));
  const pending = ready.filter(item => !item.affiliateUrl).slice(0, 50);
  if (!pending.length) return ready;
  const body = { coupangUrls: pending.map(item => item.productUrl) };
  const subId = cleanText(env.COUPANG_PARTNERS_SUB_ID, 80);
  if (subId) body.subId = subId;
  const path = cleanText(env.COUPANG_PARTNERS_DEEPLINK_PATH, 300) || DEEPLINK_PATH;
  const data = await coupangRequest(env, { method: 'POST', path, body });
  const links = Array.isArray(data?.data) ? data.data : [];
  const mapped = new Map();
  for (const link of links) {
    const originalUrl = cleanText(link?.originalUrl, 2000);
    const affiliateUrl = cleanText(link?.shortenUrl || link?.landingUrl, 2000);
    if (originalUrl && isPartnerUrl(affiliateUrl)) mapped.set(originalUrl, affiliateUrl);
  }
  return ready.map(item => ({ ...item, affiliateUrl: item.affiliateUrl || mapped.get(item.productUrl) || '' }));
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_storefront_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      storefront_slug TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      price_krw INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '',
      affiliate_url TEXT NOT NULL,
      source_keyword TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '추천',
      provider_rank INTEGER NOT NULL DEFAULT 0,
      selection_score REAL NOT NULL DEFAULT 0,
      selection_source TEXT NOT NULL DEFAULT 'rules',
      is_rocket INTEGER NOT NULL DEFAULT 0,
      is_free_shipping INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      selected_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      UNIQUE(account_id, storefront_slug, product_id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_storefront_active ON affiliate_storefront_products(account_id, storefront_slug, status, selection_score DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_storefront_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_row_id INTEGER NOT NULL,
      click_date TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(product_row_id, click_date)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_storefront_clicks_date ON affiliate_storefront_clicks(click_date DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_recommendation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storefront_slug TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      ai_mode TEXT NOT NULL DEFAULT 'rules',
      ai_model TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      candidate_count INTEGER NOT NULL DEFAULT 0,
      selected_count INTEGER NOT NULL DEFAULT 0,
      error_text TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      finished_at TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_recommendation_runs_storefront ON affiliate_recommendation_runs(storefront_slug, id DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_automation_locks (
      storefront_slug TEXT PRIMARY KEY,
      owner_token TEXT NOT NULL,
      locked_until TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
  ]);
}

async function acquireLock(db) {
  const owner = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const now = isoNow();
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  await db.prepare(`INSERT INTO affiliate_automation_locks (storefront_slug, owner_token, locked_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(storefront_slug) DO UPDATE SET owner_token = excluded.owner_token, locked_until = excluded.locked_until, updated_at = excluded.updated_at
    WHERE affiliate_automation_locks.locked_until < ?`)
    .bind(STOREFRONT, owner, until, now, now).run();
  const row = await db.prepare('SELECT owner_token FROM affiliate_automation_locks WHERE storefront_slug = ?').bind(STOREFRONT).first();
  return row?.owner_token === owner ? owner : '';
}

async function releaseLock(db, owner) {
  if (!owner) return;
  await db.prepare('DELETE FROM affiliate_automation_locks WHERE storefront_slug = ? AND owner_token = ?').bind(STOREFRONT, owner).run().catch(() => {});
}

async function lastRun(db) {
  try {
    return await db.prepare('SELECT * FROM affiliate_recommendation_runs WHERE storefront_slug = ? ORDER BY id DESC LIMIT 1').bind(STOREFRONT).first();
  } catch { return null; }
}

function runIsFresh(row, now = new Date()) {
  if (!row || row.status !== 'success' || !row.finished_at) return false;
  const timestamp = Date.parse(row.finished_at);
  if (!Number.isFinite(timestamp) || (now.getTime() - timestamp) >= REFRESH_MS) return false;
  let previousKeywords = [];
  try { previousKeywords = JSON.parse(row.keywords_json || '[]'); } catch {}
  const expectedKeywords = seedsForNow(now).map(seed => seed.keyword);
  return Array.isArray(previousKeywords) && previousKeywords.length === expectedKeywords.length
    && expectedKeywords.every((keyword, index) => previousKeywords[index] === keyword);
}

export async function getAffiliateAutomationStatus(env = {}) {
  const status = {
    configured: configured(env),
    storefront: STOREFRONT,
    activeProducts: 0,
    status: configured(env) ? 'warming' : 'setup_required',
    lastRunAt: null,
    aiMode: 'rules',
    aiModel: '',
    candidateCount: 0,
    selectedCount: 0,
    needsRefresh: true,
  };
  if (!env.DB?.prepare) return status;
  try {
    const [count, run] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM affiliate_storefront_products WHERE account_id = ? AND storefront_slug = ? AND status = 'active'").bind(ACCOUNT_ID, STOREFRONT).first(),
      lastRun(env.DB),
    ]);
    status.activeProducts = Number(count?.count || 0);
    if (run) {
      status.status = cleanText(run.status, 40) || status.status;
      status.lastRunAt = run.finished_at || run.started_at || null;
      status.aiMode = cleanText(run.ai_mode, 40) || 'rules';
      status.aiModel = cleanText(run.ai_model, 120);
      status.candidateCount = Number(run.candidate_count || 0);
      status.selectedCount = Number(run.selected_count || 0);
    }
    status.needsRefresh = !runIsFresh(run) || status.activeProducts === 0;
    if (status.activeProducts > 0 && status.status !== 'failed') status.status = 'ready';
  } catch {}
  return status;
}

export async function runAffiliateAutomation(env = {}, { force = false, reason = 'automatic' } = {}) {
  if (!env.DB?.prepare) return { ok: false, status: 'database_required', selectedCount: 0 };
  await ensureSchema(env.DB);
  const previous = await lastRun(env.DB);
  if (!force && runIsFresh(previous)) {
    const status = await getAffiliateAutomationStatus(env);
    return { ok: true, status: 'fresh', skipped: true, selectedCount: status.activeProducts, aiMode: status.aiMode };
  }

  const owner = await acquireLock(env.DB);
  if (!owner) return { ok: true, status: 'already_running', skipped: true, selectedCount: 0 };

  const startedAt = isoNow();
  let runId = null;
  try {
    const start = await env.DB.prepare(`INSERT INTO affiliate_recommendation_runs (storefront_slug, status, reason, ai_mode, ai_model, keywords_json, candidate_count, selected_count, error_text, started_at, finished_at)
      VALUES (?, 'running', ?, 'rules', '', '[]', 0, 0, '', ?, NULL)`).bind(STOREFRONT, cleanText(reason, 80), startedAt).run();
    runId = start.meta?.last_row_id || null;

    if (!configured(env)) {
      if (runId) await env.DB.prepare("UPDATE affiliate_recommendation_runs SET status = 'setup_required', finished_at = ? WHERE id = ?").bind(isoNow(), runId).run();
      return { ok: false, status: 'setup_required', selectedCount: 0 };
    }

    const seeds = seedsForNow();
    const candidates = [];
    for (const seed of seeds) {
      const items = await searchSeed(env, seed);
      candidates.push(...items);
    }
    const deduped = [...new Map(candidates.map(item => [item.productId, item])).values()];
    if (!deduped.length) throw new Error('COUPANG_NO_PRODUCTS');

    const ai = await aiSelect(env, deduped);
    const ordered = applyOrder(deduped, ai);
    const linked = (await issuePartnerLinks(env, ordered)).filter(item => isPartnerUrl(item.affiliateUrl));
    if (!linked.length) throw new Error('COUPANG_NO_PARTNER_LINKS');

    const now = isoNow();
    const onDemandCutoff = new Date(Date.now() - ON_DEMAND_TTL_MS).toISOString();
    const statements = [
      env.DB.prepare("UPDATE affiliate_storefront_products SET status = 'inactive', last_seen_at = ? WHERE account_id = ? AND storefront_slug = ? AND status = 'active' AND selection_source <> 'on-demand'").bind(now, ACCOUNT_ID, STOREFRONT),
      env.DB.prepare("UPDATE affiliate_storefront_products SET status = 'inactive' WHERE account_id = ? AND storefront_slug = ? AND status = 'active' AND selection_source = 'on-demand' AND last_seen_at < ?").bind(ACCOUNT_ID, STOREFRONT, onDemandCutoff),
    ];
    for (const item of linked) {
      statements.push(env.DB.prepare(`INSERT INTO affiliate_storefront_products (
        account_id, storefront_slug, product_id, product_name, price_krw, image_url, affiliate_url, source_keyword, category,
        provider_rank, selection_score, selection_source, is_rocket, is_free_shipping, status, selected_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(account_id, storefront_slug, product_id) DO UPDATE SET
        product_name = excluded.product_name,
        price_krw = excluded.price_krw,
        image_url = excluded.image_url,
        affiliate_url = excluded.affiliate_url,
        source_keyword = excluded.source_keyword,
        category = excluded.category,
        provider_rank = excluded.provider_rank,
        selection_score = excluded.selection_score,
        selection_source = excluded.selection_source,
        is_rocket = excluded.is_rocket,
        is_free_shipping = excluded.is_free_shipping,
        status = 'active',
        selected_at = excluded.selected_at,
        last_seen_at = excluded.last_seen_at`)
        .bind(ACCOUNT_ID, STOREFRONT, item.productId, item.productName, item.productPrice, item.productImage, item.affiliateUrl, item.keyword, item.category,
          item.rank, item.selectionScore, item.selectionSource, item.isRocket ? 1 : 0, item.isFreeShipping ? 1 : 0, now, now));
    }
    await env.DB.batch(statements);
    for (const item of linked) {
      const offer = affiliateProductOffer(item);
      if (offer) await upsertOffer(env.DB, offer);
    }
    await env.DB.prepare(`UPDATE ekodi_offers SET status = 'inactive', updated_at = ?
      WHERE offer_type = 'product' AND source_provider = 'coupang_partners' AND owner_type = 'business' AND owner_key = 'ekodibiz'
        AND source_id NOT IN (SELECT product_id FROM affiliate_storefront_products WHERE account_id = ? AND storefront_slug = ? AND status = 'active')`)
      .bind(now, ACCOUNT_ID, STOREFRONT).run();

    const mode = ai?.mode || 'rules';
    if (runId) {
      await env.DB.prepare(`UPDATE affiliate_recommendation_runs SET status = 'success', ai_mode = ?, ai_model = ?, keywords_json = ?, candidate_count = ?, selected_count = ?, error_text = '', finished_at = ? WHERE id = ?`)
        .bind(mode, cleanText(ai?.model, 120), JSON.stringify(seeds.map(seed => seed.keyword)), deduped.length, linked.length, isoNow(), runId).run();
    }
    return { ok: true, status: 'success', selectedCount: linked.length, candidateCount: deduped.length, aiMode: mode, aiModel: cleanText(ai?.model, 120) };
  } catch (error) {
    const message = cleanText(error?.message || error, 500) || 'AFFILIATE_AUTOMATION_FAILED';
    if (runId) {
      await env.DB.prepare("UPDATE affiliate_recommendation_runs SET status = 'failed', error_text = ?, finished_at = ? WHERE id = ?").bind(message, isoNow(), runId).run().catch(() => {});
    }
    console.error('EKODI Mall automatic curation failed', message);
    return { ok: false, status: 'failed', selectedCount: 0, error: message };
  } finally {
    await releaseLock(env.DB, owner);
  }
}

export async function bootstrapAffiliateOffersFromCatalog(env = {}) {
  if (!env.DB?.prepare) return { ok: false, status: 'database_required', projectedCount: 0, deactivatedCount: 0 };
  await ensureSchema(env.DB);
  await ensureOfferRegistrySchema(env.DB);

  const rows = await env.DB.prepare(`SELECT p.product_id, p.product_name, p.price_krw, p.image_url, p.source_keyword, p.category,
      p.provider_rank, p.selection_score, p.selection_source, p.is_rocket, p.is_free_shipping
    FROM affiliate_storefront_products p
    LEFT JOIN ekodi_offers o
      ON o.offer_type = 'product' AND o.source_provider = 'coupang_partners' AND o.source_id = p.product_id AND o.status = 'active'
    WHERE p.account_id = ? AND p.storefront_slug = ? AND p.status = 'active' AND o.offer_id IS NULL
    ORDER BY p.selection_score DESC, p.id DESC
    LIMIT 200`).bind(ACCOUNT_ID, STOREFRONT).all();

  let projectedCount = 0;
  for (const row of rows.results || []) {
    const offer = affiliateProductOffer({
      productId: row.product_id,
      productName: row.product_name,
      productPrice: Number(row.price_krw || 0),
      productImage: row.image_url,
      keyword: row.source_keyword,
      category: row.category,
      rank: Number(row.provider_rank || 0),
      selectionScore: Number(row.selection_score || 0),
      selectionSource: row.selection_source,
      isRocket: Boolean(row.is_rocket),
      isFreeShipping: Boolean(row.is_free_shipping),
    });
    if (offer && await upsertOffer(env.DB, offer)) projectedCount += 1;
  }

  const stale = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ekodi_offers o
    WHERE o.offer_type = 'product' AND o.source_provider = 'coupang_partners'
      AND o.owner_type = 'business' AND o.owner_key = 'ekodibiz' AND o.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM affiliate_storefront_products p
        WHERE p.account_id = ? AND p.storefront_slug = ? AND p.status = 'active' AND p.product_id = o.source_id
      )`).bind(ACCOUNT_ID, STOREFRONT).first();
  const deactivatedCount = Number(stale?.count || 0);
  if (deactivatedCount > 0) {
    await env.DB.prepare(`UPDATE ekodi_offers SET status = 'inactive', updated_at = ?
      WHERE offer_type = 'product' AND source_provider = 'coupang_partners'
        AND owner_type = 'business' AND owner_key = 'ekodibiz' AND status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM affiliate_storefront_products p
          WHERE p.account_id = ? AND p.storefront_slug = ? AND p.status = 'active' AND p.product_id = ekodi_offers.source_id
        )`).bind(isoNow(), ACCOUNT_ID, STOREFRONT).run();
  }

  return { ok: true, status: projectedCount || deactivatedCount ? 'synchronized' : 'current', projectedCount, deactivatedCount };
}
export async function ingestAffiliateProductsOnDemand(env = {}, { query = '', category = '추천', limit = 3, reason = 'on-demand' } = {}) {
  if (!env.DB?.prepare) return { ok: false, status: 'database_required', selectedCount: 0, products: [], offers: [] };
  await ensureSchema(env.DB);
  if (!configured(env)) return { ok: false, status: 'setup_required', selectedCount: 0, products: [], offers: [] };
  const keyword = cleanText(query, 120);
  if (keyword.length < 2) return { ok: false, status: 'invalid_query', selectedCount: 0, products: [], offers: [] };
  const safeLimit = Math.max(1, Math.min(5, Math.trunc(Number(limit) || 3)));
  const safeCategory = cleanText(category, 80) || '추천';
  try {
    const candidates = await searchSeed(env, { keyword, category: safeCategory });
    const deduped = [...new Map(candidates.map(item => [item.productId, item])).values()]
      .sort((a, b) => baseScore(b) - baseScore(a) || a.rank - b.rank);
    const selected = deduped.slice(0, safeLimit).map(item => ({
      ...item,
      selectionScore: baseScore(item) + 20,
      selectionSource: 'on-demand',
    }));
    const linked = (await issuePartnerLinks(env, selected)).filter(item => isPartnerUrl(item.affiliateUrl));
    if (!linked.length) return { ok: true, status: 'empty', selectedCount: 0, products: [], offers: [] };
    const now = isoNow();
    const statements = linked.map(item => env.DB.prepare(`INSERT INTO affiliate_storefront_products (
      account_id, storefront_slug, product_id, product_name, price_krw, image_url, affiliate_url, source_keyword, category,
      provider_rank, selection_score, selection_source, is_rocket, is_free_shipping, status, selected_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(account_id, storefront_slug, product_id) DO UPDATE SET
      product_name=excluded.product_name, price_krw=excluded.price_krw, image_url=excluded.image_url,
      affiliate_url=excluded.affiliate_url, source_keyword=excluded.source_keyword, category=excluded.category,
      provider_rank=excluded.provider_rank, selection_score=excluded.selection_score,
      selection_source='on-demand', is_rocket=excluded.is_rocket, is_free_shipping=excluded.is_free_shipping,
      status='active', last_seen_at=excluded.last_seen_at`)
      .bind(ACCOUNT_ID, STOREFRONT, item.productId, item.productName, item.productPrice, item.productImage,
        item.affiliateUrl, item.keyword, item.category, item.rank, item.selectionScore, item.selectionSource,
        item.isRocket ? 1 : 0, item.isFreeShipping ? 1 : 0, now, now));
    await env.DB.batch(statements);
    const offers = [];
    for (const item of linked) {
      const offer = affiliateProductOffer(item);
      if (offer) offers.push(await upsertOffer(env.DB, offer));
    }
    return { ok: true, status: 'success', reason: cleanText(reason, 80), query: keyword, selectedCount: linked.length, products: linked, offers: offers.filter(Boolean) };
  } catch (error) {
    return { ok: false, status: 'failed', selectedCount: 0, products: [], offers: [], error: cleanText(error?.message || error, 500) };
  }
}

export const AFFILIATE_AUTOMATION_DEFAULTS = Object.freeze({
  accountId: ACCOUNT_ID,
  storefront: STOREFRONT,
  targetProducts: TARGET_PRODUCTS,
  refreshMs: REFRESH_MS,
  onDemandTtlMs: ON_DEMAND_TTL_MS,
  searchPath: SEARCH_PATH,
  deepLinkPath: DEEPLINK_PATH,
});
