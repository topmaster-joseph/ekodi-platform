function cleanText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

const MAX_PRODUCT_IDENTITY_ALIASES = 512;

function safeProviderKey(value) {
  const key = cleanText(value, 80).toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(key) ? key : '';
}

function safeAliasIdentity(value) {
  const key = cleanText(value, 160).toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(key) ? key : '';
}

function safeSourceId(value) {
  const source = cleanText(value, 160);
  return /^[A-Za-z0-9._:-]+$/.test(source) ? source : '';
}

function parseAliasConfig(raw) {
  if (!raw) return [];
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function canonical(value) {
  return cleanText(value, 500).toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]+/gi, '');
}

export function normalizeGtin(value) {
  const digits = cleanText(value, 32).replace(/\D+/g, '');
  if (![8, 12, 13, 14].includes(digits.length)) return '';
  const checkDigit = Number(digits.at(-1));
  let sum = 0;
  for (let index = digits.length - 2, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(digits[index]) * (position % 2 === 0 ? 3 : 1);
  }
  return ((10 - (sum % 10)) % 10) === checkDigit ? digits : '';
}

function explicitIdentity(value) {
  return cleanText(value, 160).toLocaleLowerCase('en-US').replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function getProductIdentityAliases(env = {}) {
  const rows = parseAliasConfig(env.AFFILIATE_PRODUCT_IDENTITY_ALIASES_JSON).slice(0, MAX_PRODUCT_IDENTITY_ALIASES);
  const aliases = new Map();
  const conflicts = new Set();
  for (const row of rows) {
    const providerKey = safeProviderKey(row?.providerKey);
    const sourceId = safeSourceId(row?.sourceId ?? row?.productId ?? row?.merchantSourceId);
    const productIdentityKey = safeAliasIdentity(row?.productIdentityKey ?? row?.identityKey);
    if (!providerKey || !sourceId || !productIdentityKey) continue;
    const lookupKey = `${providerKey}:${sourceId}`;
    if (conflicts.has(lookupKey)) continue;
    const existing = aliases.get(lookupKey);
    if (existing && existing.productIdentityKey !== productIdentityKey) {
      aliases.delete(lookupKey);
      conflicts.add(lookupKey);
      continue;
    }
    aliases.set(lookupKey, { providerKey, sourceId, productIdentityKey });
  }
  return [...aliases.values()];
}

export function applyProductIdentityAliases(offers = [], env = {}) {
  const aliasMap = new Map(getProductIdentityAliases(env).map(alias => [`${alias.providerKey}:${alias.sourceId}`, alias.productIdentityKey]));
  return (Array.isArray(offers) ? offers : []).map(offer => {
    if (!offer || typeof offer !== 'object' || offer.productIdentityKey || offer.identityKey) return offer;
    const providerKey = safeProviderKey(offer.providerKey);
    const sourceIds = [offer.merchantSourceId, offer.productId, offer.sourceId, offer.id].map(safeSourceId).filter(Boolean);
    const productIdentityKey = sourceIds.map(sourceId => aliasMap.get(`${providerKey}:${sourceId}`)).find(Boolean);
    return productIdentityKey ? { ...offer, productIdentityKey } : offer;
  });
}

function exactTitleKey(offer) {
  const title = canonical(offer?.productName || offer?.name);
  if (title.length < 12 || title.split(/\d+/).join('').length < 6) return '';
  return `title:${title}`;
}

export function productIdentityKey(offer = {}, index = 0) {
  const explicit = explicitIdentity(offer.productIdentityKey || offer.identityKey);
  if (explicit) return { key: `explicit:${explicit}`, basis: 'explicit', confidence: 'verified' };
  const gtin = normalizeGtin(offer.gtin || offer.barcode);
  if (gtin) return { key: `gtin:${gtin}`, basis: 'gtin', confidence: 'verified' };
  const brand = canonical(offer.brand);
  const model = canonical(offer.model);
  if (brand && model) return { key: `model:${brand}:${model}`, basis: 'brand_model', confidence: 'strong' };
  const title = exactTitleKey(offer);
  if (title) return { key: title, basis: 'exact_title', confidence: 'conservative' };
  const provider = canonical(offer.providerKey) || 'unknown';
  const source = canonical(offer.productId || offer.id) || String(index);
  return { key: `offer:${provider}:${source}`, basis: 'isolated', confidence: 'isolated' };
}

function priceOf(offer) {
  const price = Number(offer?.priceKrw || 0);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function preferredName(group, offer) {
  const current = cleanText(group?.name, 240);
  const candidate = cleanText(offer?.productName || offer?.name, 240);
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate.length < current.length ? candidate : current;
}

export function groupProductOffers(offers = []) {
  const groups = new Map();
  for (const [index, raw] of (Array.isArray(offers) ? offers : []).entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const identity = productIdentityKey(raw, index);
    if (!groups.has(identity.key)) {
      groups.set(identity.key, {
        productIdentityId: identity.key,
        identityBasis: identity.basis,
        identityConfidence: identity.confidence,
        name: cleanText(raw.productName || raw.name, 240),
        category: cleanText(raw.category, 120) || 'recommend',
        offers: [],
      });
    }
    const group = groups.get(identity.key);
    group.name = preferredName(group, raw);
    group.offers.push(raw);
  }
  return [...groups.values()].map(group => {
    const offersSorted = [...group.offers].sort((a, b) => {
      const aPrice = priceOf(a) || Number.MAX_SAFE_INTEGER;
      const bPrice = priceOf(b) || Number.MAX_SAFE_INTEGER;
      return aPrice - bPrice;
    });
    const providers = new Set(offersSorted.map(offer => cleanText(offer.providerKey, 120)).filter(Boolean));
    const bestPriceKrw = offersSorted.reduce((best, offer) => {
      const price = priceOf(offer);
      return price > 0 && (!best || price < best) ? price : best;
    }, 0);
    return { ...group, offers: offersSorted, providerCount: providers.size, bestPriceKrw };
  });
}
