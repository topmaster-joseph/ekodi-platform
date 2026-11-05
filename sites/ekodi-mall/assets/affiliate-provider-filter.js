// Only an approved provider/merchant identity may enter an affiliate hub.
// Never trust a substring in merchant display text or a product's title.
const normalized = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export function providerMatches(item, keys = []) {
  const allowed = new Set(keys.flatMap((key) => {
    const id = normalized(key);
    return id === 'coupangpartners' ? ['coupangpartners', 'coupang'] : [id];
  }).filter(Boolean));
  // Network programs can route Agoda under a network provider; merchantKey wins.
  const source = normalized(item?.merchantKey || item?.providerKey);
  return Boolean(source && allowed.has(source));
}

export function safeAffiliateHttps(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
