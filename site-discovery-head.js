// SEARCH-EXPOSURE-ALL-001: search-engine head baseline for every public EKODI
// user site. Runs at the end of the platform router for responses whose site
// the publication guard already resolved as public. It only ADDS tags that are
// missing; site-specific canonical/robots/description/og tags always win.
// Private, maintenance, admin/auth/api, non-HTML, non-200 and noindex
// responses are left untouched (EKODI-SITE-PUBLICATION-001 stays the SoT).

export const SITE_DISCOVERY_HEAD_POLICY = 'EKODI-SEARCH-EXPOSURE-ALL-001';
const CANONICAL_HOST = 'ekodi.kr';
const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Owner consent (EKODI AI consultation #5353): the platform owner approved
// search exposure for every public user site on 2026-10-19. A tenant that
// declines search exposure is listed here (code-reviewed change) and gets
// `x-robots-tag: noindex` while staying publicly reachable.
export const SEARCH_EXPOSURE_OPT_OUT_SITES = Object.freeze(new Set([]));

export function searchExposureOptedOut(site, optOut = SEARCH_EXPOSURE_OPT_OUT_SITES) {
  return Boolean(site && optOut.has(String(site.id || '').toLowerCase()));
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function headSection(html) {
  const open = html.search(/<head\b[^>]*>/i);
  const close = html.search(/<\/head>/i);
  if (open < 0 || close < 0 || close < open) return null;
  return html.slice(open, close);
}

const has = {
  canonical: head => /<link\b(?=[^>]*\brel=(['"]?)canonical\1)[^>]*>/i.test(head),
  robots: head => /<meta\b(?=[^>]*\bname=(['"]?)(?:robots|googlebot)\1)[^>]*>/i.test(head),
  description: head => /<meta\b(?=[^>]*\bname=(['"]?)description\1)[^>]*>/i.test(head),
  ogUrl: head => /<meta\b(?=[^>]*\bproperty=(['"]?)og:url\1)[^>]*>/i.test(head),
  ogSiteName: head => /<meta\b(?=[^>]*\bproperty=(['"]?)og:site_name\1)[^>]*>/i.test(head),
};

// Self-referencing canonical on the canonical host only; query/hash dropped.
export function canonicalSelfUrl(requestUrl) {
  let url;
  try { url = new URL(String(requestUrl)); } catch { return ''; }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== CANONICAL_HOST) return '';
  const path = ('/' + url.pathname.replace(/^\/+/, '')).replace(/\/{2,}/g, '/');
  return `https://${CANONICAL_HOST}${path}`;
}

export function siteDiscoveryTags(head, { canonical = '', siteName = '' } = {}) {
  const tags = [];
  if (!has.robots(head)) tags.push('<meta name="robots" content="index, follow, max-image-preview:large">');
  if (canonical && !has.canonical(head)) tags.push(`<link rel="canonical" href="${escapeAttr(canonical)}">`);
  if (siteName && !has.description(head)) tags.push(`<meta name="description" content="${escapeAttr(siteName)} — EKODI 플랫폼 공개 사이트">`);
  if (canonical && !has.ogUrl(head)) tags.push(`<meta property="og:url" content="${escapeAttr(canonical)}">`);
  if (!has.ogSiteName(head)) tags.push('<meta property="og:site_name" content="EKODI">');
  return tags;
}

export function decorateSiteDiscoveryHtml(html, options = {}) {
  const text = String(html || '');
  const head = headSection(text);
  if (head === null) return text;
  if (/<meta\b(?=[^>]*\bname=(['"]?)robots\1)(?=[^>]*\bcontent=(['"]?)[^'">]*noindex)[^>]*>/i.test(head)) return text;
  const tags = siteDiscoveryTags(head, options);
  if (!tags.length) return text;
  return text.replace(/<\/head>/i, `${tags.join('')}<!--${SITE_DISCOVERY_HEAD_POLICY}--></head>`);
}

export function siteDiscoveryApplies(request, response, site) {
  if (!site || !response || request?.method !== 'GET') return false;
  if (response.status !== 200) return false;
  const type = String(response.headers?.get?.('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return false;
  if (/noindex|none/i.test(String(response.headers.get('x-robots-tag') || ''))) return false;
  if (response.headers.get('content-encoding')) return false;
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_HTML_BYTES) return false;
  return true;
}

export async function ensureSiteDiscoveryHead(request, response, site, { optOut = SEARCH_EXPOSURE_OPT_OUT_SITES } = {}) {
  if (!siteDiscoveryApplies(request, response, site)) return response;
  if (searchExposureOptedOut(site, optOut)) {
    const headers = new Headers(response.headers);
    headers.set('x-robots-tag', 'noindex, nofollow');
    headers.set('x-ekodi-search-exposure', 'opted-out');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  let html;
  try { html = await response.clone().text(); } catch { return response; }
  if (html.length > MAX_HTML_BYTES) return response;
  const decorated = decorateSiteDiscoveryHtml(html, { canonical: canonicalSelfUrl(request.url), siteName: site.name || '' });
  if (decorated === html) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('x-ekodi-search-exposure', 'site-head-v1');
  return new Response(decorated, { status: response.status, statusText: response.statusText, headers });
}
