import { listPublicOffers } from './offer-registry.js';
import { bootstrapOfferSources } from './offer-registry-sources.js';

const PREFIX = '/api/offers';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'x-content-type-options': 'nosniff',
    },
  });
}

function cleanText(value, max = 120) {
  return String(value ?? '').trim().slice(0, max);
}

export async function handleOfferRegistryRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  if (request.method === 'OPTIONS') return json({ ok: true }, 204);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!env.DB?.prepare) return json({ error: 'Offer Registry database is unavailable.' }, 503);

  if (url.pathname === `${PREFIX}/discover`) {
    const query = cleanText(url.searchParams.get('q'));
    const requestedType = cleanText(url.searchParams.get('type') || url.searchParams.get('kind'), 40);
    const offerType = new Set(['product', 'service', 'program', 'provider', 'common_service']).has(requestedType) ? requestedType : '';
    const limit = Math.max(1, Math.min(50, Math.trunc(Number(url.searchParams.get('limit')) || 20)));
    const sourceProvider = cleanText(url.searchParams.get('provider'), 120);
    await bootstrapOfferSources(env, { offerType });
    const offers = await listPublicOffers(env.DB, { query, offerType, sourceProvider, limit });
    return json({
      registry: 'ekodi-offer-registry',
      version: 'v1',
      query,
      offerType: offerType || 'all',
      sourceProvider: sourceProvider || 'all',
      count: offers.length,
      offers,
    });
  }

  return json({ error: 'Offer Registry endpoint not found' }, 404);
}
