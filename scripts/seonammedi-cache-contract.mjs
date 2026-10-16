// Canonical live cache rules are enforced by applySeonamMediCachePolicy
// in platform-router-entry-worker.js. Private admin assets are NEVER public/immutable.
export function assertSeonamMediAssetCachePolicy(key, headers) {
  const name = String(key || '');
  const cache = String(headers?.get?.('cache-control') || '').toLowerCase();
  const robots = String(headers?.get?.('x-robots-tag') || '').toLowerCase();
  if (name.startsWith('admin/')) {
    if (!/\bno-store\b/.test(cache) || /\bpublic\b|immutable/.test(cache)) {
      throw new Error('asset_cache_policy_' + name + '_' + cache);
    }
    if (!/noindex/.test(robots)) {
      throw new Error('asset_robots_policy_' + name + '_' + robots);
    }
    return 'private';
  }
  if (!/max-age=31536000/.test(cache) || !/immutable/.test(cache)) {
    throw new Error('asset_cache_policy_' + name + '_' + cache);
  }
  return 'immutable';
}
