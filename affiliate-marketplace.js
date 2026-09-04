import { listPublicOffers, upsertOffer } from './offer-registry.js';

export const MULTI_AFFILIATE_DISCLOSURE = '에코디몰에는 에코디 및 제휴 판매처의 상품이 함께 표시됩니다. 제휴 링크를 통한 구매 시 에코디가 수수료를 받을 수 있으며, 상품별 판매처는 구매 전에 표시됩니다.';

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
  const offers = await listPublicOffers(env.DB, { offerType: 'product', limit: safeLimit });
  const baseUrl = new URL(request.url);
  return offers.filter(offer => offer.sourceProvider !== 'coupang_partners').map((offer, index) => {
    const metadata = metadataOf(offer);
    const linkId = Number(metadata.linkId || 0);
    if (!linkId) return null;
    const providerName = cleanText(metadata.providerName, 120) || cleanText(offer.sourceProvider, 120) || '제휴 판매처';
    const clickUrl = new URL(`/api/affiliate/public/link/${linkId}`, baseUrl).toString();
    return {
      id: `affiliate-${linkId}`,
      productId: offer.sourceId,
      productName: offer.title,
      priceKrw: Number(offer.priceAmount || 0),
      imageUrl: httpsUrl(offer.imageUrl, { optional: true }) || '',
      clickUrl,
      category: offer.category || '추천',
      isRocket: false,
      isFreeShipping: Boolean(metadata.isFreeShipping),
      selectedAt: offer.updatedAt || null,
      providerKey: offer.sourceProvider,
      providerName,
      buyLabel: `${providerName}에서 구매`,
      disclosureText: cleanText(metadata.disclosureText, 1000) || MULTI_AFFILIATE_DISCLOSURE,
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

export async function registerMarketplaceProduct(env, input = {}, { createdBy = null } = {}) {
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
  if (priceKrw === null) return { ok: false, error: '가격은 0 이상의 숫자여야 합니다.' };

  const now = new Date().toISOString();
  const accountId = safeKey(input.accountId, 80) || `${providerKey}-ekodibiz`;
  const category = cleanText(input.category, 120) || '추천';
  const disclosureText = cleanText(input.disclosureText, 1000) || MULTI_AFFILIATE_DISCLOSURE;
  const channel = cleanText(input.channel, 120) || 'EKODI Mall';
  const campaignName = cleanText(input.campaignName, 160);
  const merchantSourceId = cleanText(input.sourceId, 160);
  const summary = cleanText(input.summary, 500) || `${providerName} · 에코디몰 제휴상품`;

  await env.DB.prepare(`INSERT INTO affiliate_providers (provider_key, display_name, provider_kind, connection_mode, enabled, created_at, updated_at)
    VALUES (?, ?, 'affiliate', 'manual', 1, ?, ?)
    ON CONFLICT(provider_key) DO UPDATE SET display_name = excluded.display_name, enabled = 1, updated_at = excluded.updated_at`)
    .bind(providerKey, providerName, now, now).run();
  await env.DB.prepare(`INSERT INTO affiliate_accounts (id, provider_key, owner_type, owner_key, display_name, account_label, status, connection_mode, default_channel, disclosure_text, enabled, created_at, updated_at)
    VALUES (?, ?, 'internal', 'ekodibiz', ?, 'EKODIBIZ', 'manual_ready', 'manual', ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET provider_key = excluded.provider_key, display_name = excluded.display_name,
      default_channel = excluded.default_channel, disclosure_text = excluded.disclosure_text, enabled = 1, updated_at = excluded.updated_at`)
    .bind(accountId, providerKey, `에코디비즈 ${providerName}`, channel, disclosureText, now, now).run();

  const inserted = await env.DB.prepare(`INSERT INTO affiliate_links (account_id, tenant_slug, product_name, destination_url, affiliate_url, channel, campaign_name, status, created_by, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
    .bind(accountId, productName, destinationUrl || '', affiliateUrl, channel, campaignName, createdBy, now, now).run();
  const linkId = Number(inserted.meta?.last_row_id || 0);
  if (!linkId) return { ok: false, error: '제휴상품 링크를 등록하지 못했습니다.' };

  const offer = await upsertOffer(env.DB, {
    offerType: 'product', ownerType: 'business', ownerKey: 'ekodibiz', sourceProvider: providerKey,
    sourceId: `link:${linkId}`, title: productName, summary, category, priceAmount: priceKrw,
    canonicalUrl: `https://api.ekodi.kr/api/affiliate/public/link/${linkId}`, imageUrl: imageUrl || '',
    actionKind: 'external_purchase', visibility: 'public', status: 'active',
    discoveryKeywords: [providerName, category, productName, '에코디몰'],
    metadata: { storefront: 'ekodi-mall', providerName, accountId, linkId, merchantSourceId, destinationUrl: destinationUrl || '', disclosureText, channel, campaignName },
  });
  return { ok: true, linkId, accountId, providerKey, providerName, offer };
}

export async function archiveMarketplaceOffer(db, linkId) {
  const row = await db.prepare(`SELECT l.id, a.provider_key FROM affiliate_links l JOIN affiliate_accounts a ON a.id = l.account_id WHERE l.id = ? LIMIT 1`).bind(Number(linkId)).first();
  if (!row) return false;
  await db.prepare(`UPDATE ekodi_offers SET status = 'inactive', updated_at = ? WHERE offer_type = 'product' AND source_provider = ? AND source_id = ?`)
    .bind(new Date().toISOString(), row.provider_key, `link:${row.id}`).run().catch(() => {});
  return true;
}