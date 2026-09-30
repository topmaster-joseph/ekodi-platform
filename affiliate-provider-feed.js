import { registerMarketplaceProduct } from './affiliate-marketplace.js';
import { normalizeGtin } from './product-identity.js';

const MAX_FEEDS = 16;
const MAX_ITEMS = 200;

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function safeKey(value, max = 80) {
  return cleanText(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
}

function httpsUrl(value) {
  try {
    const url = new URL(cleanText(value, 2000));
    return url.protocol === 'https:' ? url.toString() : '';
  } catch { return ''; }
}

function safeFeedUrl(value) {
  const parsed = httpsUrl(value);
  if (!parsed) return '';
  const url = new URL(parsed);
  if (url.username || url.password) return '';
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '[::1]' || host.endsWith('.local')) return '';
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (match) {
    const parts = match.slice(1).map(Number);
    if (parts.some(part => part > 255)) return '';
    if (parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)) return '';
  }
  return url.toString();
}

function safeHeaderName(value) {
  const name = cleanText(value || 'Authorization', 80);
  return /^[A-Za-z0-9-]+$/.test(name) ? name : 'Authorization';
}
function parseConfig(raw) {
  if (!raw) return [];
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function getProviderFeedConfigs(env = {}) {
  const configs = parseConfig(env.AFFILIATE_PROVIDER_FEEDS_JSON).map(entry => {
    const providerKey = safeKey(entry?.providerKey || entry?.id);
    const providerName = cleanText(entry?.providerName || entry?.name, 120);
    const url = safeFeedUrl(entry?.url || entry?.feedUrl);
    const tokenEnv = cleanText(entry?.tokenEnv, 120);
    const tokenPrefixRaw = entry?.tokenPrefix !== undefined ? String(entry.tokenPrefix) : '';
    if (!providerKey || providerKey === 'coupang_partners' || !providerName || !url) return null;
    if (tokenEnv && !/^[A-Z][A-Z0-9_]{1,119}$/.test(tokenEnv)) return null;
    if (/[\r\n]/.test(tokenPrefixRaw)) return null;
    return {
      providerKey,
      providerName,
      url,
      tokenEnv,
      headerName: safeHeaderName(entry?.headerName),
      tokenPrefix: entry?.tokenPrefix !== undefined ? tokenPrefixRaw.slice(0, 40) : (entry?.headerName ? '' : 'Bearer '),
      disclosureText: cleanText(entry?.disclosureText, 1000),
      marketCountry: /^[A-Z]{2}$/.test(cleanText(entry?.marketCountry || 'KR', 2).toUpperCase()) ? cleanText(entry?.marketCountry || 'KR', 2).toUpperCase() : 'KR',
      priceCurrency: /^[A-Z]{3}$/.test(cleanText(entry?.priceCurrency || 'KRW', 3).toUpperCase()) ? cleanText(entry?.priceCurrency || 'KRW', 3).toUpperCase() : 'KRW',
      affiliateMode: cleanText(entry?.affiliateMode || 'direct', 20) === 'network' ? 'network' : 'direct',
      networkKey: safeKey(entry?.networkKey),
      networkName: cleanText(entry?.networkName, 120),
      enabled: entry?.enabled !== false,
    };
  }).filter(Boolean);
  const unique = [...new Map(configs.map(config => [config.providerKey, config])).values()];
  return unique.slice(0, MAX_FEEDS);
}
export function listProviderFeedDescriptors(env = {}) {
  return getProviderFeedConfigs(env).map(config => ({
    providerKey: config.providerKey,
    providerName: config.providerName,
    connectionMode: 'json_feed_v1',
    endpointHost: new URL(config.url).hostname,
    marketCountry: config.marketCountry,
    priceCurrency: config.priceCurrency,
    affiliateMode: config.affiliateMode,
    networkKey: config.networkKey,
    networkName: config.networkName,
    enabled: config.enabled,
    secretRequired: Boolean(config.tokenEnv),
    secretConfigured: Boolean(config.tokenEnv ? env[config.tokenEnv] : true),
  }));
}

function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const key of ['products', 'items', 'offers', 'results']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return null;
}

export function normalizeProviderFeedItem(item = {}, config = {}) {
  const sourceId = cleanText(item.sourceId ?? item.productId ?? item.id ?? item.sku, 160);
  const productName = cleanText(item.productName ?? item.title ?? item.name, 240);
  const affiliateUrl = httpsUrl(item.affiliateUrl ?? item.clickUrl ?? item.url ?? item.productUrl);
  if (!sourceId || !productName || !affiliateUrl) return null;
  const sourcePrice = Number(item.priceAmount ?? item.price ?? item.priceKrw ?? 0);
  const sourcePriceCurrency = cleanText(item.priceCurrency ?? item.currency ?? config.priceCurrency ?? 'KRW', 3).toUpperCase();
  const explicitKrw = Number(item.priceKrw);
  const priceKrw = Number.isFinite(explicitKrw) && explicitKrw >= 0 ? Math.trunc(explicitKrw) : (sourcePriceCurrency === 'KRW' && Number.isFinite(sourcePrice) && sourcePrice >= 0 ? Math.trunc(sourcePrice) : 0);
  const rawGtin = cleanText(item.gtin ?? item.barcode, 32);
  const gtin = rawGtin ? normalizeGtin(rawGtin) : '';
  return {
    providerKey: config.providerKey,
    providerName: config.providerName,
    sourceId,
    productName,
    affiliateUrl,
    destinationUrl: httpsUrl(item.destinationUrl ?? item.originalUrl ?? item.productUrl),
    imageUrl: httpsUrl(item.imageUrl ?? item.image ?? item.thumbnailUrl),
    priceKrw,
    sourcePriceAmount: Number.isFinite(sourcePrice) && sourcePrice >= 0 ? sourcePrice : 0,
    sourcePriceCurrency: /^[A-Z]{3}$/.test(sourcePriceCurrency) ? sourcePriceCurrency : config.priceCurrency || 'KRW',
    marketCountry: config.marketCountry || 'KR',
    affiliateMode: config.affiliateMode || 'direct',
    affiliateNetworkKey: config.networkKey || '',
    affiliateNetworkName: config.networkName || '',
    category: cleanText(item.category, 120) || '추천',
    disclosureText: cleanText(item.disclosureText, 1000) || cleanText(config.disclosureText, 1000),
    productIdentityKey: cleanText(item.productIdentityKey, 160),
    gtin,
    brand: cleanText(item.brand, 120),
    model: cleanText(item.model ?? item.modelName, 160),
  };
}

async function ensureFeedRegistration(env, config) {
  if (!env.DB?.prepare || !config) return;
  const now = new Date().toISOString();
  const accountId = `${config.providerKey}-ekodibiz`;
  await env.DB.prepare(`INSERT INTO affiliate_providers (provider_key, display_name, provider_kind, connection_mode, enabled, created_at, updated_at)
    VALUES (?, ?, 'affiliate', 'json_feed_v1', 1, ?, ?)
    ON CONFLICT(provider_key) DO UPDATE SET display_name = excluded.display_name, connection_mode = 'json_feed_v1', enabled = 1, updated_at = excluded.updated_at`)
    .bind(config.providerKey, config.providerName, now, now).run();
  await env.DB.prepare(`INSERT INTO affiliate_accounts (id, provider_key, owner_type, owner_key, display_name, account_label, status, connection_mode, default_channel, disclosure_text, enabled, created_at, updated_at)
    VALUES (?, ?, 'internal', 'ekodibiz', ?, 'EKODIBIZ', 'feed_ready', 'json_feed_v1', 'EKODI Mall', ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET provider_key = excluded.provider_key, display_name = excluded.display_name, connection_mode = 'json_feed_v1', disclosure_text = excluded.disclosure_text, enabled = 1, updated_at = excluded.updated_at`)
    .bind(accountId, config.providerKey, `에코디비즈 ${config.providerName}`, config.disclosureText || '', now, now).run();
}

async function retireMissingFeedProducts(db, providerKey, activeSourceIds) {
  if (!db?.prepare) return 0;
  const rows = await db.prepare(`SELECT source_id, metadata_json FROM ekodi_offers WHERE offer_type = 'product' AND source_provider = ? AND source_id LIKE 'feed:%' AND status = 'active'`).bind(providerKey).all();
  const active = new Set(activeSourceIds);
  let retired = 0;
  for (const row of rows.results || []) {
    if (active.has(row.source_id)) continue;
    await db.prepare(`UPDATE ekodi_offers SET status = 'inactive', updated_at = ? WHERE offer_type = 'product' AND source_provider = ? AND source_id = ?`).bind(new Date().toISOString(), providerKey, row.source_id).run();
    let linkId = 0; try { linkId = Number(JSON.parse(row.metadata_json || '{}').linkId || 0); } catch {}
    if (linkId) await db.prepare(`UPDATE affiliate_links SET status = 'archived', updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), linkId).run().catch(() => {});
    retired += 1;
  }
  return retired;
}
export async function readProviderFeed(env, providerKey, { fetchImpl = fetch } = {}) {
  const config = getProviderFeedConfigs(env).find(item => item.providerKey === safeKey(providerKey));
  if (!config || !config.enabled) return { ok: false, status: 'not_configured', products: [] };
  const headers = new Headers({ accept: 'application/json' });
  if (config.tokenEnv) {
    const secret = cleanText(env[config.tokenEnv], 4000);
    if (!secret) return { ok: false, status: 'secret_required', products: [] };
    if (/[\r\n]/.test(secret)) return { ok: false, status: 'secret_invalid', products: [] };
    headers.set(config.headerName, `${config.tokenPrefix}${secret}`);
  }
  let response;
  try { response = await fetchImpl(config.url, { headers }); }
  catch (error) { return { ok: false, status: 'fetch_error', error: cleanText(error?.message, 180), products: [] }; }
  if (!response?.ok) {
    return { ok: false, status: 'upstream_error', upstreamStatus: Number(response?.status || 0), products: [] };
  }
  let payload;
  try { payload = await response.json(); }
  catch { return { ok: false, status: 'invalid_json', products: [] }; }
  const picked = pickArray(payload);
  if (!picked) return { ok: false, status: 'unsupported_shape', products: [] };
  const rawItems = picked.slice(0, MAX_ITEMS);
  const products = rawItems.map(item => normalizeProviderFeedItem(item, config)).filter(Boolean);
  return {
    ok: true,
    status: 'ready',
    providerKey: config.providerKey,
    providerName: config.providerName,
    received: rawItems.length,
    products,
  };
}
export async function syncProviderFeed(env, providerKey, { fetchImpl = fetch } = {}) {
  const config = getProviderFeedConfigs(env).find(item => item.providerKey === safeKey(providerKey));
  if (!config || !config.enabled) return { ok: false, status: 'not_configured', products: [] };
  await ensureFeedRegistration(env, config);
  const read = await readProviderFeed(env, providerKey, { fetchImpl });
  const accountId = `${config.providerKey}-ekodibiz`;
  const now = new Date().toISOString();
  if (!read.ok) {
    if (env.DB?.prepare) {
      const failureStatus = read.status === 'secret_required' || read.status === 'secret_invalid' ? read.status : 'degraded';
      await env.DB.prepare(`UPDATE affiliate_accounts SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`)
        .bind(failureStatus, cleanText(read.status || read.error, 300), now, accountId).run().catch(() => {});
    }
    return read;
  }
  let synced = 0;
  const errors = [];
  for (const product of read.products) {
    const result = await registerMarketplaceProduct(env, product, {
      connectionMode: 'json_feed_v1',
      stableSourceId: product.sourceId,
    });
    if (result.ok) synced += 1;
    else errors.push({ sourceId: product.sourceId, error: cleanText(result.error, 180) });
  }
  const activeSourceIds = read.products.map(product => `feed:${product.sourceId}`);
  const retired = errors.length ? 0 : await retireMissingFeedProducts(env.DB, read.providerKey, activeSourceIds);
  const status = errors.length ? (synced ? 'degraded' : 'failed') : 'live';
  if (env.DB?.prepare) {
    await env.DB.prepare(`UPDATE affiliate_accounts SET status = ?, last_synced_at = ?, last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(status, now, errors[0]?.error || '', now, accountId).run().catch(() => {});
  }
  return {
    ok: synced > 0 || read.products.length === 0,
    status,
    providerKey: read.providerKey,
    providerName: read.providerName,
    received: read.received,
    valid: read.products.length,
    synced,
    retired,
    errors: errors.slice(0, 10),
    syncedAt: now,
  };
}

export function mixProductsByProvider(products = [], limit = 100) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 100)));
  const buckets = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    if (!product || typeof product !== 'object') continue;
    const providerKey = cleanText(product.providerKey, 120) || 'unknown';
    if (!buckets.has(providerKey)) buckets.set(providerKey, []);
    buckets.get(providerKey).push(product);
  }
  const queues = [...buckets.values()];
  const mixed = [];
  for (let index = 0; mixed.length < safeLimit; index += 1) {
    let added = false;
    for (const queue of queues) {
      if (queue[index]) {
        mixed.push(queue[index]);
        added = true;
        if (mixed.length >= safeLimit) break;
      }
    }
    if (!added) break;
  }
  return mixed;
}
