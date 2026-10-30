// IndexNow must publish the URLs that the live, public Korean IDN sitemap
// actually advertises; never inspect private boards, admin or other domains.
export const SEONAMMEDI_CANONICAL_ORIGIN = 'https://xn--3e0b8b58jw4co4mnpll3k.kr';
export const SEONAMMEDI_REQUIRED_PUBLIC_PATHS = Object.freeze(['/', '/board/notices', '/board/voices']);
const PUBLIC_PATH = /^\/(?:$|board\/(?:notices|voices)$|board\/notices\/[1-9]\d*$)/;

export function canonicalIndexNowUrlsFromSitemap(xml, { limit = 150 } = {}) {
  if (typeof xml !== 'string' || xml.length > 1024 * 1024 || !/<urlset\b/.test(xml)) {
    throw new Error('Invalid public sitemap XML');
  }
  const locs = [...xml.matchAll(/<loc>\s*([^<>]+?)\s*<\/loc>/g)];
  if (!locs.length || locs.length > limit) throw new Error('Invalid public sitemap URL count');
  const result = [], seen = new Set();
  for (const [, rawValue] of locs) {
    const raw = rawValue.trim();
    // Reject ambiguous or escaped URL text; only exact ASCII canonical links.
    if (raw.includes('&') || raw.includes('#') || raw.includes('?')) {
      throw new Error('Unexpected canonical sitemap URL encoding');
    }
    let url;
    try { url = new URL(raw); } catch { throw new Error('Invalid canonical URL in sitemap'); }
    if (url.origin !== SEONAMMEDI_CANONICAL_ORIGIN || url.username || url.password
      || !PUBLIC_PATH.test(url.pathname) || url.href !== raw) {
      throw new Error('Disallowed public URL in sitemap: ' + raw.slice(0, 160));
    }
    if (!seen.has(raw)) {
      seen.add(raw);
      result.push(raw);
    }
  }
  for (const path of SEONAMMEDI_REQUIRED_PUBLIC_PATHS) {
    if (!seen.has(SEONAMMEDI_CANONICAL_ORIGIN + path)) {
      throw new Error('Required public URL missing from sitemap: ' + path);
    }
  }
  return result;
}
