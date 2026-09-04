const OFFER_TYPES = new Set(['product', 'service', 'program', 'provider', 'common_service']);
const VISIBILITY = new Set(['public', 'private']);
const STATUS = new Set(['active', 'inactive']);

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function jsonArray(values, maxItems = 24) {
  const items = Array.isArray(values) ? values : [];
  return JSON.stringify([...new Set(items.map(value => cleanText(value, 120)).filter(Boolean))].slice(0, maxItems));
}

function jsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  try {
    const text = JSON.stringify(value);
    return text.length <= 12_000 ? text : JSON.stringify({ truncated: true });
  } catch { return '{}'; }
}

function stableOfferId(type, provider, sourceId) {
  return `${type}:${provider}:${sourceId}`.replace(/[^a-zA-Z0-9:_-]/g, '-').slice(0, 240);
}

export async function ensureOfferRegistrySchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ekodi_offers (
      offer_id TEXT PRIMARY KEY, offer_type TEXT NOT NULL, owner_type TEXT NOT NULL DEFAULT 'platform',
      owner_key TEXT NOT NULL DEFAULT '', source_provider TEXT NOT NULL, source_id TEXT NOT NULL,
      title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
      price_amount INTEGER NOT NULL DEFAULT 0, price_currency TEXT NOT NULL DEFAULT 'KRW',
      canonical_url TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', action_kind TEXT NOT NULL DEFAULT 'view',
      visibility TEXT NOT NULL DEFAULT 'public', status TEXT NOT NULL DEFAULT 'active',
      discovery_keywords_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}',
      first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(offer_type, source_provider, source_id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ekodi_offers_public_discovery ON ekodi_offers(visibility, status, offer_type, updated_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ekodi_offers_owner ON ekodi_offers(owner_type, owner_key, status, updated_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ekodi_offers_source ON ekodi_offers(source_provider, source_id, status)'),
  ]);
}

export function normalizeOffer(input = {}) {
  const offerType = OFFER_TYPES.has(input.offerType) ? input.offerType : 'product';
  const sourceProvider = cleanText(input.sourceProvider, 120);
  const sourceId = cleanText(input.sourceId, 160);
  const title = cleanText(input.title, 240);
  if (!sourceProvider || !sourceId || !title) return null;
  const price = Number(input.priceAmount || 0);
  return {
    offerId: cleanText(input.offerId, 240) || stableOfferId(offerType, sourceProvider, sourceId),
    offerType,
    ownerType: cleanText(input.ownerType, 60) || 'platform',
    ownerKey: cleanText(input.ownerKey, 120),
    sourceProvider,
    sourceId,
    title,
    summary: cleanText(input.summary, 500),
    category: cleanText(input.category, 120),
    priceAmount: Number.isFinite(price) && price >= 0 ? Math.trunc(price) : 0,
    priceCurrency: cleanText(input.priceCurrency, 12) || 'KRW',
    canonicalUrl: cleanText(input.canonicalUrl, 1000),
    imageUrl: cleanText(input.imageUrl, 1000),
    actionKind: cleanText(input.actionKind, 60) || 'view',
    visibility: VISIBILITY.has(input.visibility) ? input.visibility : 'public',
    status: STATUS.has(input.status) ? input.status : 'active',
    discoveryKeywordsJson: jsonArray(input.discoveryKeywords),
    metadataJson: jsonObject(input.metadata),
  };
}

export async function upsertOffer(db, input) {
  const offer = normalizeOffer(input);
  if (!offer) return null;
  await ensureOfferRegistrySchema(db);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO ekodi_offers (
    offer_id, offer_type, owner_type, owner_key, source_provider, source_id, title, summary, category,
    price_amount, price_currency, canonical_url, image_url, action_kind, visibility, status,
    discovery_keywords_json, metadata_json, first_seen_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(offer_type, source_provider, source_id) DO UPDATE SET
    owner_type=excluded.owner_type, owner_key=excluded.owner_key, title=excluded.title, summary=excluded.summary,
    category=excluded.category, price_amount=excluded.price_amount, price_currency=excluded.price_currency,
    canonical_url=excluded.canonical_url, image_url=excluded.image_url, action_kind=excluded.action_kind,
    visibility=excluded.visibility, status=excluded.status, discovery_keywords_json=excluded.discovery_keywords_json,
    metadata_json=excluded.metadata_json, updated_at=excluded.updated_at`)
    .bind(offer.offerId, offer.offerType, offer.ownerType, offer.ownerKey, offer.sourceProvider, offer.sourceId,
      offer.title, offer.summary, offer.category, offer.priceAmount, offer.priceCurrency, offer.canonicalUrl,
      offer.imageUrl, offer.actionKind, offer.visibility, offer.status, offer.discoveryKeywordsJson,
      offer.metadataJson, now, now).run();
  return offer;
}

export function affiliateProductOffer(product = {}) {
  const sourceKeyword = cleanText(product.keyword || product.sourceKeyword, 120);
  const category = cleanText(product.category, 120) || '추천';
  return normalizeOffer({
    offerType: 'product',
    ownerType: 'business',
    ownerKey: 'ekodibiz',
    sourceProvider: 'coupang_partners',
    sourceId: product.productId,
    title: product.productName,
    summary: `${category} · 에코디몰 연동 상품`,
    category,
    priceAmount: product.productPrice,
    canonicalUrl: `https://ekodi.kr/ekodibiz/mall?product=${encodeURIComponent(cleanText(product.productId, 160))}`,
    imageUrl: product.productImage,
    actionKind: 'external_purchase',
    discoveryKeywords: [sourceKeyword, category, '에코디몰'].filter(Boolean),
    metadata: {
      storefront: 'ekodi-mall',
      sourceKeyword,
      selectionSource: cleanText(product.selectionSource, 60),
      isRocket: Boolean(product.isRocket),
      isFreeShipping: Boolean(product.isFreeShipping),
    },
  });
}

export async function listPublicOffers(db, { query = '', offerType = '', sourceProvider = '', limit = 20 } = {}) {
  await ensureOfferRegistrySchema(db);
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit) || 20)));
  const type = OFFER_TYPES.has(offerType) ? offerType : '';
  const needle = cleanText(query, 120);
  const provider = cleanText(sourceProvider, 120);
  const clauses = ["visibility = 'public'", "status = 'active'"];
  const binds = [];
  if (type) { clauses.push('offer_type = ?'); binds.push(type); }
  if (provider) { clauses.push('source_provider = ?'); binds.push(provider); }
  if (needle) {
    clauses.push('(title LIKE ? OR summary LIKE ? OR category LIKE ? OR discovery_keywords_json LIKE ?)');
    const like = `%${needle.replace(/[%_]/g, '')}%`;
    binds.push(like, like, like, like);
  }
  const rows = await db.prepare(`SELECT * FROM ekodi_offers WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`)
    .bind(...binds, safeLimit).all();
  return (rows.results || []).map(row => ({
    offerId: row.offer_id, offerType: row.offer_type, ownerType: row.owner_type, ownerKey: row.owner_key,
    sourceProvider: row.source_provider, sourceId: row.source_id, title: row.title, summary: row.summary,
    category: row.category, priceAmount: Number(row.price_amount || 0), priceCurrency: row.price_currency,
    canonicalUrl: row.canonical_url, imageUrl: row.image_url, actionKind: row.action_kind, updatedAt: row.updated_at,
    metadata: (() => { try { const value = JSON.parse(row.metadata_json || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } })(),
  }));
}
