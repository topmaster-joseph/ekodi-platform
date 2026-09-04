import { bootstrapAffiliateOffersFromCatalog } from './coupang-partners-automation.js';

export async function bootstrapOfferSources(env = {}, { offerType = '' } = {}) {
  const results = {};
  if (!offerType || offerType === 'product') {
    try {
      results.coupangPartners = await bootstrapAffiliateOffersFromCatalog(env);
    } catch (error) {
      console.error('EKODI Offer source bootstrap failed', String(error?.message || error));
      results.coupangPartners = { ok: false, status: 'failed' };
    }
  }
  return results;
}