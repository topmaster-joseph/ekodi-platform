import { authorizeJubileeSelection, runJubileePolicyGate } from './jubilee-policy-gate.js';

const MALL_SCOPES = new Set(['ekodi_catalog', 'open_market']);
const EKODI_AFFILIATE_DISCLOSURE = 'EKODI may receive an affiliate or referral benefit when this connected product is purchased.';

/**
 * Jubilee adapter for EKODI Mall recommendations.
 *
 * `ekodi_catalog` means the user has explicitly chosen to compare only products
 * currently connected to EKODI Mall. Results must be described as catalog-scoped,
 * never as the best product in the whole market.
 *
 * `open_market` means the request is a general recommendation. In that mode, an
 * internal-only candidate set is deliberately non-actionable until external
 * alternatives have been discovered and included.
 */
export async function evaluateMallJubileeRecommendation(input = {}, options = {}) {
  const scope = normalizeScope(input.scope);
  const internalProducts = Array.isArray(input.products) ? input.products : [];
  const externalProducts = Array.isArray(input.externalProducts) ? input.externalProducts : [];

  const candidates = [
    ...internalProducts.map(product => toMallCandidate(product, 'ekodi')),
    ...externalProducts.map(product => toMallCandidate(product, 'external')),
  ];

  const gate = await runJubileePolicyGate({
    workspace_id: input.workspaceId,
    purpose: 'mall_recommendation',
    context: input.context && typeof input.context === 'object' ? input.context : {},
    market: {
      externalAlternativesKnown: scope === 'open_market',
    },
    candidates,
  }, options);

  return Object.freeze({
    scope,
    scopeDisclosure: scope === 'ekodi_catalog'
      ? 'Results are limited to products currently connected to EKODI Mall and are not a claim about the best option in the whole market.'
      : 'Open-market recommendation compares EKODI-connected products with available external alternatives.',
    ...gate,
  });
}

export function authorizeMallJubileeChoice(evaluation, productId) {
  return authorizeJubileeSelection(evaluation, productId);
}

function toMallCandidate(product, source) {
  const item = product && typeof product === 'object' ? product : {};
  const id = String(item.id || item.productId || '').trim();
  if (!id) throw new Error('mall_jubilee_product_id_required');

  const commercialRelationship = source === 'ekodi'
    ? true
    : Boolean(item.commercialRelationship);

  const commercialDisclosure = source === 'ekodi'
    ? String(item.commercialDisclosure || EKODI_AFFILIATE_DISCLOSURE).trim()
    : String(item.commercialDisclosure || '').trim();

  return Object.freeze({
    id,
    source,
    userFit: bounded(item.userFit ?? item.fit),
    affordability: bounded(item.affordability),
    accessibility: bounded(item.accessibility),
    serviceQuality: bounded(item.serviceQuality),
    continuity: bounded(item.continuity),
    communityBenefit: bounded(item.communityBenefit),
    providerIndependence: source === 'external' ? 1 : bounded(item.providerIndependence),
    commercialRelationship,
    commercialDisclosure,
    viable: item.viable !== false,
    metadata: {
      productName: safeText(item.productName || item.name, 160),
      category: safeText(item.category, 80),
      priceKrw: safeNumber(item.priceKrw ?? item.productPrice),
    },
  });
}

function normalizeScope(value) {
  const scope = String(value || 'open_market').trim();
  if (!MALL_SCOPES.has(scope)) throw new Error('invalid_mall_jubilee_scope');
  return scope;
}

function bounded(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function safeText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

export const MALL_JUBILEE_DEFAULTS = Object.freeze({
  defaultScope: 'open_market',
  catalogScope: 'ekodi_catalog',
  affiliateDisclosure: EKODI_AFFILIATE_DISCLOSURE,
});
