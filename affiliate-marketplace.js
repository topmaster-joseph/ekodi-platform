import { listPublicOffers, upsertOffer } from './offer-registry.js';
import { normalizeGtin } from './product-identity.js';

export const MULTI_AFFILIATE_DISCLOSURE = '에코디몰에는 여러 외부 판매처의 상품이 함께 표시됩니다. 일부 구매 링크는 제휴 링크일 수 있으며, 제휴 링크를 통한 구매 시 에코디가 수수료를 받을 수 있습니다. 상품별 판매처는 구매 전에 표시됩니다.';
const FEED_PRICE_FRESH_MS = 24 * 60 * 60 * 1000;
const MANUAL_PRICE_FRESH_MS = 24 * 60 * 60 * 1000;

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function safeKey(value, max = 80) {
  return cleanText(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
}

function httpsUrl(value, { optional = false } = {}) {
  const text = cleanText(value, 2000);
  if (!text && optional) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function nonNegativeInt(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.trunc(number);
}

function metadataOf(offer) {
  const metadata = offer?.metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

function offerFreshness(metadata, updatedAt) {
  const sourceType = cleanText(metadata?.sourceType, 40);
  const verifiedAt = cleanText(metadata?.syncedAt || updatedAt, 80);
  if (!['json_feed_v1', 'manual'].includes(sourceType)) return { status: 'current', verifiedAt };
  const timestamp = Date.parse(verifiedAt);
  const ttl = sourceType === 'json_feed_v1' ? FEED_PRICE_FRESH_MS : MANUAL_PRICE_FRESH_MS;
  const fresh = Number.isFinite(timestamp) && Date.now() - timestamp <= ttl;
  return { status: fresh ? 'fresh' : 'stale', verifiedAt };
}

export async function ensureAffiliateMarketplaceSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS affiliate_link_clicks (
      link_id INTEGER NOT NULL, click_date TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL, PRIMARY KEY(link_id, click_date)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_affiliate_link_clicks_date ON affiliate_link_clicks(click_date DESC, link_id)'),
  ]);
}

export async function listMarketplaceProducts(request, env, limit = 100) {
  if (!env.DB?.prepare) return [];
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 100)));
  const offers = await listPublicOffers(env.DB, { offerType: 'product', excludeSourceProvider: 'coupang_partners', limit: safeLimit });
  const routeRows = await env.DB.prepare(`SELECT merchant_key, merchant_name, market_country, settlement_currency, affiliate_mode, network_key, network_name FROM affiliate_merchant_routes WHERE affiliate_status = 'active' AND tracking_status = 'ready' AND catalog_status IN ('manual_verified','feed_ready') AND recommendation_enabled = 1`).all().catch(() => ({ results: [] }));
  const routeByMerchant = new Map((routeRows.results || []).map(route => [route.merchant_key, route]));
  const baseUrl = new URL(request.url);
  return offers.map((offer, index) => {
    const route = routeByMerchant.get(offer.sourceProvider);
    if (!route) return null;
    const metadata = metadataOf(offer);
    const linkId = Number(metadata.linkId || 0);
    if (!linkId) return null;
    const providerName = cleanText(metadata.providerName, 120) || cleanText(offer.sourceProvider, 120) || '제휴 판매처';
    const clickUrl = new URL(`/api/affiliate/public/link/${linkId}`, baseUrl).toString();
    const freshness = offerFreshness(metadata, offer.updatedAt);
    const priceKrw = freshness.status === 'stale' ? 0 : Number(offer.priceAmount || 0);
    if (!(priceKrw > 0)) return null;
    return {
      id: `affiliate-${linkId}`,
      productId: cleanText(metadata.merchantSourceId, 160) || offer.sourceId,
      merchantSourceId: cleanText(metadata.merchantSourceId, 160),
      productName: offer.title,
      priceKrw,
      sourcePriceAmount: Number(metadata.sourcePriceAmount || 0),
      sourcePriceCurrency: cleanText(metadata.sourcePriceCurrency, 3).toUpperCase() || route.settlement_currency,
      priceFreshness: freshness.status,
      priceVerifiedAt: freshness.verifiedAt || null,
      imageUrl: httpsUrl(offer.imageUrl, { optional: true }) || '',
      clickUrl,
      category: offer.category || '추천',
      isRocket: false,
      isFreeShipping: Boolean(metadata.isFreeShipping),
      selectedAt: freshness.verifiedAt || offer.updatedAt || null,
      providerKey: offer.sourceProvider,
      providerName: cleanText(route.merchant_name, 120) || providerName,
      affiliateMode: route.affiliate_mode,
      affiliateNetworkKey: route.network_key || '',
      affiliateNetworkName: route.network_name || '',
      marketCountry: route.market_country,
      settlementCurrency: route.settlement_currency,
      recommendationEligible: true,
      buyLabel: `${cleanText(route.merchant_name, 120) || providerName}에서 구매`,
      disclosureText: cleanText(metadata.disclosureText, 1000) || MULTI_AFFILIATE_DISCLOSURE,
      productIdentityKey: cleanText(metadata.productIdentityKey, 160),
      gtin: cleanText(metadata.gtin, 32),
      brand: cleanText(metadata.brand, 120),
      model: cleanText(metadata.model, 160),
      popularityRank: 1000 + index,
    };
  }).filter(Boolean);
}

export async function publicMarketplaceClick(request, env, url) {
  const match = url.pathname.match(/^\/api\/affiliate\/public\/link\/(\d+)$/);
  if (!match || request.method !== 'GET') return null;
  if (!env.DB?.prepare) return new Response(null, { status: 503 });
  const row = await env.DB.prepare(`SELECT l.id, l.affiliate_url
    FROM affiliate_links l JOIN affiliate_accounts a ON a.id = l.account_id
    WHERE l.id = ? AND l.status = 'active' AND a.enabled = 1 LIMIT 1`).bind(Number(match[1])).first();
  const target = httpsUrl(row?.affiliate_url);
  if (!row || !target) return new Response(JSON.stringify({ error: '상품을 찾을 수 없습니다.' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } });

  const purpose = `${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''}`.toLowerCase();
  if (!purpose.includes('prefetch')) {
    await ensureAffiliateMarketplaceSchema(env.DB);
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO affiliate_link_clicks (link_id, click_date, clicks, updated_at) VALUES (?, ?, 1, ?)
      ON CONFLICT(link_id, click_date) DO UPDATE SET clicks = affiliate_link_clicks.clicks + 1, updated_at = excluded.updated_at`)
      .bind(row.id, today, now).run().catch(() => {});
  }
  const headers = new Headers({ location: target, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  return new Response(null, { status: 302, headers });
}

export async function registerMarketplaceProduct(env, input = {}, { createdBy = null, connectionMode = 'manual', stableSourceId = '' } = {}) {
  if (!env.DB?.prepare) return { ok: false, error: '제휴상품 데이터베이스 연결이 필요합니다.' };
  const providerKey = safeKey(input.providerKey);
  const providerName = cleanText(input.providerName, 120);
  const productName = cleanText(input.productName, 240);
  const affiliateUrl = httpsUrl(input.affiliateUrl);
  const destinationUrl = httpsUrl(input.destinationUrl, { optional: true });
  const imageUrl = httpsUrl(input.imageUrl, { optional: true });
  const priceKrw = nonNegativeInt(input.priceKrw);
  if (!providerKey || !providerName) return { ok: false, error: '제휴처 코드와 제휴처 이름이 필요합니다.' };
  if (providerKey === 'coupang_partners') return { ok: false, error: '쿠팡 상품은 쿠팡 파트너스 자동 연결을 사용해 주세요.' };
  if (!productName) return { ok: false, error: '상품명이 필요합니다.' };
  if (!affiliateUrl) return { ok: false, error: 'HTTPS 형식의 제휴 구매 링크가 필요합니다.' };
  if (destinationUrl === null) return { ok: false, error: '원본 상품 URL은 HTTPS 형식이어야 합니다.' };
  if (imageUrl === null) return { ok: false, error: '상품 이미지 URL은 HTTPS 형식이어야 합니다.' };
  if (priceKrw === null || priceKrw <= 0) return { ok: false, error: '추천 상품은 현재 검증된 1원 이상의 비교가격이 필요합니다.' };

  const now = new Date().toISOString();
  const accountId = safeKey(input.accountId, 80) || `${providerKey}-ekodibiz`;
  const category = cleanText(input.category, 120) || '추천';
  const disclosureText = cleanText(input.disclosureText, 1000) || MULTI_AFFILIATE_DISCLOSURE;
  const channel = cleanText(input.channel, 120) || 'EKODI Mall';
  const campaignName = cleanText(input.campaignName, 160);
  const merchantSourceId = cleanText(input.sourceId, 160);
  const normalizedConnectionMode = connectionMode === 'json_feed_v1' ? 'json_feed_v1' : 'manual';
  const stableOfferSourceId = cleanText(stableSourceId, 160);
  if (normalizedConnectionMode === 'json_feed_v1' && !stableOfferSourceId) return { ok: false, error: 'Feed products require a stable source id.' };
  const productIdentityKey = cleanText(input.productIdentityKey, 160);
  const rawGtin = cleanText(input.gtin || input.barcode, 32);
  const gtin = normalizeGtin(rawGtin);
  if (rawGtin && !gtin) return { ok: false, error: 'GTIN/???? ?????? ??? 8, 12, 13, 14?? ???? ???.' };
  const brand = cleanText(input.brand, 120);
  const model = cleanText(input.model, 160);
  const sourcePriceAmount = Number(input.sourcePriceAmount || 0);
  const sourcePriceCurrency = cleanText(input.sourcePriceCurrency || 'KRW', 3).toUpperCase();
  const safeSourcePriceAmount = Number.isFinite(sourcePriceAmount) && sourcePriceAmount >= 0 ? sourcePriceAmount : 0;
  const safeSourcePriceCurrency = /^[A-Z]{3}$/.test(sourcePriceCurrency) ? sourcePriceCurrency : 'KRW';
  const summary = cleanText(input.summary, 500) || `${providerName} · 에코디몰 제휴상품`;

  await env.DB.prepare(`INSERT INTO affiliate_providers (provider_key, display_name, provider_kind, connection_mode, enabled, created_at, updated_at)
    VALUES (?, ?, 'affiliate', ?, 1, ?, ?)
    ON CONFLICT(provider_key) DO UPDATE SET display_name = excluded.display_name, connection_mode = excluded.connection_mode, enabled = 1, updated_at = excluded.updated_at`)
    .bind(providerKey, providerName, normalizedConnectionMode, now, now).run();
  const accountStatus = normalizedConnectionMode === 'json_feed_v1' ? 'feed_ready' : 'manual_ready';
  await env.DB.prepare(`INSERT INTO affiliate_accounts (id, provider_key, owner_type, owner_key, display_name, account_label, status, connection_mode, default_channel, disclosure_text, enabled, created_at, updated_at)
    VALUES (?, ?, 'internal', 'ekodibiz', ?, 'EKODIBIZ', ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET provider_key = excluded.provider_key, display_name = excluded.display_name,
      connection_mode = excluded.connection_mode, default_channel = excluded.default_channel, disclosure_text = excluded.disclosure_text, enabled = 1, updated_at = excluded.updated_at`)
    .bind(accountId, providerKey, `에코디비즈 ${providerName}`, accountStatus, normalizedConnectionMode, channel, disclosureText, now, now).run();

  const offerSourceId = stableOfferSourceId ? `feed:${stableOfferSourceId}` : '';
  let linkId = 0;
  let created = true;
  if (offerSourceId) {
    const existingOffer = await env.DB.prepare(`SELECT metadata_json FROM ekodi_offers WHERE offer_type = 'product' AND source_provider = ? AND source_id = ? LIMIT 1`)
      .bind(providerKey, offerSourceId).first().catch(() => null);
    try { linkId = Number(JSON.parse(existingOffer?.metadata_json || '{}').linkId || 0); } catch { linkId = 0; }
    if (linkId) {
      const existingLink = await env.DB.prepare('SELECT id FROM affiliate_links WHERE id = ? LIMIT 1').bind(linkId).first().catch(() => null);
      if (!existingLink) linkId = 0;
    }
  }
  if (linkId) {
    created = false;
    await env.DB.prepare(`UPDATE affiliate_links SET product_name = ?, destination_url = ?, affiliate_url = ?, channel = ?, campaign_name = ?, status = 'active', updated_at = ? WHERE id = ?`)
      .bind(productName, destinationUrl || '', affiliateUrl, channel, campaignName, now, linkId).run();
  } else {
    const inserted = await env.DB.prepare(`INSERT INTO affiliate_links (account_id, tenant_slug, product_name, destination_url, affiliate_url, channel, campaign_name, status, created_by, created_at, updated_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
      .bind(accountId, productName, destinationUrl || '', affiliateUrl, channel, campaignName, createdBy, now, now).run();
    linkId = Number(inserted.meta?.last_row_id || 0);
  }
  if (!linkId) return { ok: false, error: 'Unable to persist affiliate product link.' };

  const offer = await upsertOffer(env.DB, {
    offerType: 'product', ownerType: 'business', ownerKey: 'ekodibiz', sourceProvider: providerKey,
    sourceId: offerSourceId || `link:${linkId}`, title: productName, summary, category, priceAmount: priceKrw,
    canonicalUrl: `https://api.ekodi.kr/api/affiliate/public/link/${linkId}`, imageUrl: imageUrl || '',
    actionKind: 'external_purchase', visibility: 'public', status: 'active',
    discoveryKeywords: [providerName, category, productName, '에코디몰'],
    metadata: { storefront: 'ekodi-mall', providerName, accountId, linkId, merchantSourceId, productIdentityKey, gtin, brand, model, sourcePriceAmount: safeSourcePriceAmount, sourcePriceCurrency: safeSourcePriceCurrency, destinationUrl: destinationUrl || '', disclosureText, channel, campaignName, sourceType: normalizedConnectionMode, syncedAt: now },
  });
  return { ok: true, linkId, accountId, providerKey, providerName, productIdentityKey, gtin, brand, model, connectionMode: normalizedConnectionMode, stableSourceId: stableOfferSourceId, created, offer };
}

export async function archiveMarketplaceOffer(db, linkId) {
  const row = await db.prepare(`SELECT l.id, a.provider_key FROM affiliate_links l JOIN affiliate_accounts a ON a.id = l.account_id WHERE l.id = ? LIMIT 1`).bind(Number(linkId)).first();
  if (!row) return false;
  await db.prepare(`UPDATE ekodi_offers SET status = 'inactive', updated_at = ? WHERE offer_type = 'product' AND source_provider = ? AND (source_id = ? OR metadata_json LIKE ?)`)
    .bind(new Date().toISOString(), row.provider_key, `link:${row.id}`, `%"linkId":${row.id},%`).run().catch(() => {});
  return true;
}
