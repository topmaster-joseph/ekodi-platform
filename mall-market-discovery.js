const DEFAULT_TIMEOUT_MS = 4500;
const MAX_PROVIDERS = 6;
const MAX_RESULTS_PER_PROVIDER = 12;

/**
 * Vendor-neutral external product discovery port for EKODI Mall.
 *
 * A provider is an injected adapter:
 *   { id, search({ query, context, limit, signal }) }
 *
 * The core never knows whether that adapter targets Naver Shopping, a merchant
 * catalog, a cooperative marketplace, an open commerce API, or a future source.
 * Provider failures degrade to an incomplete discovery result. Jubilee decides
 * whether that incomplete market view is actionable.
 */
export function createMallMarketDiscovery(config = {}) {
  const providers = normalizeProviders(config.providers);
  const timeoutMs = boundedTimeout(config.timeoutMs);

  return Object.freeze({
    providerCount: providers.length,
    async discover(input = {}) {
      const query = safeText(input.query, 500);
      const context = input.context && typeof input.context === 'object' ? input.context : {};
      const limit = Math.max(1, Math.min(30, Number(input.limit) || 12));

      if (!query && Object.keys(context).length === 0) {
        return freezeResult([], providers.length, 0, ['market_discovery_context_required']);
      }
      if (providers.length === 0) {
        return freezeResult([], 0, 0, ['market_discovery_provider_unavailable']);
      }

      const outcomes = await Promise.all(providers.map(provider => discoverFromProvider(provider, {
        query,
        context,
        limit: Math.min(limit, MAX_RESULTS_PER_PROVIDER),
        timeoutMs,
      })));

      const successful = outcomes.filter(outcome => outcome.ok);
      const warnings = outcomes.flatMap(outcome => outcome.warning ? [outcome.warning] : []);
      const candidates = dedupeCandidates(successful.flatMap(outcome => outcome.products)).slice(0, limit);
      if (candidates.length === 0) warnings.push('market_discovery_no_external_candidates');

      return freezeResult(candidates, providers.length, successful.length, warnings);
    },
  });
}

async function discoverFromProvider(provider, input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), input.timeoutMs);
  try {
    const raw = await provider.search({
      query: input.query,
      context: input.context,
      limit: input.limit,
      signal: controller.signal,
    });
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.products) ? raw.products : [];
    const products = rows.slice(0, MAX_RESULTS_PER_PROVIDER)
      .map(item => normalizeExternalProduct(item, provider))
      .filter(Boolean);
    return { ok: true, products, warning: null };
  } catch (error) {
    const code = controller.signal.aborted ? 'timeout' : safeErrorCode(error);
    return { ok: false, products: [], warning: `market_provider_failed:${provider.id}:${code}` };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeProviders(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const seen = new Set();
  const providers = [];
  for (const raw of value.slice(0, MAX_PROVIDERS)) {
    const id = String(raw?.id || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id) || seen.has(id) || typeof raw?.search !== 'function') continue;
    seen.add(id);
    providers.push(Object.freeze({
      id,
      search: raw.search,
      commercialRelationship: Boolean(raw.commercialRelationship),
      commercialDisclosure: safeText(raw.commercialDisclosure, 300),
    }));
  }
  return Object.freeze(providers);
}

function normalizeExternalProduct(raw, provider) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const rawId = safeText(item.id || item.productId, 160);
  if (!rawId) return null;
  const productUrl = safeHttpsUrl(item.productUrl || item.url);
  if (!productUrl) return null;

  const commercialRelationship = item.commercialRelationship === undefined
    ? provider.commercialRelationship
    : Boolean(item.commercialRelationship);
  const commercialDisclosure = safeText(
    item.commercialDisclosure || provider.commercialDisclosure,
    300,
  );
  if (commercialRelationship && !commercialDisclosure) return null;

  return Object.freeze({
    id: `external:${provider.id}:${rawId}`,
    externalProductId: rawId,
    providerId: provider.id,
    source: 'external',
    productName: safeText(item.productName || item.name, 180),
    category: safeText(item.category, 80),
    priceKrw: safeMoney(item.priceKrw ?? item.productPrice),
    productUrl,
    userFit: boundedScore(item.userFit ?? item.fit),
    affordability: boundedScore(item.affordability),
    accessibility: boundedScore(item.accessibility),
    serviceQuality: boundedScore(item.serviceQuality),
    continuity: boundedScore(item.continuity),
    communityBenefit: boundedScore(item.communityBenefit),
    providerIndependence: 1,
    commercialRelationship,
    commercialDisclosure,
    viable: item.viable !== false,
  });
}

function dedupeCandidates(products) {
  const seen = new Set();
  const result = [];
  for (const item of products) {
    const key = `${item.providerId}:${item.externalProductId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function freezeResult(products, providerCount, successfulProviderCount, warnings) {
  const uniqueWarnings = [...new Set(warnings.filter(Boolean))];
  return Object.freeze({
    complete: products.length > 0 && successfulProviderCount > 0,
    products: Object.freeze(products),
    providerCount,
    successfulProviderCount,
    warnings: Object.freeze(uniqueWarnings),
  });
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function safeText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function safeMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function boundedScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function boundedTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_TIMEOUT_MS;
  return Math.max(500, Math.min(15000, Math.trunc(number)));
}

function safeErrorCode(error) {
  const text = String(error?.code || error?.name || 'error').toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(text) ? text : 'error';
}

export const MALL_MARKET_DISCOVERY_DEFAULTS = Object.freeze({
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxProviders: MAX_PROVIDERS,
  maxResultsPerProvider: MAX_RESULTS_PER_PROVIDER,
});
