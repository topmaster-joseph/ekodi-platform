import { EKODI_INDEXNOW_KEY_PATH, ekodiIndexNowKeyResponse } from './platform-indexnow.js';
import { injectVerificationMeta } from './search-engine-verification.js';

const ORIGIN = 'https://ekodi.kr';
const SITE_PREFIX = '/seonammedi';
const API_PREFIX = '/api/seonammedi';
const DOMAIN_HOSTS = new Set(['seonammedi.kr', 'xn--3e0b8b58jw4co4mnpll3k.kr']);

function upstreamPath(pathname) {
  const path = pathname || '/';
  if (path === SITE_PREFIX || path.startsWith(SITE_PREFIX + '/')) return path;
  if (path === API_PREFIX || path.startsWith(API_PREFIX + '/')) return path;
  if (path === '/') return SITE_PREFIX + '/';
  return SITE_PREFIX + (path.startsWith('/') ? path : '/' + path);
}

function upstreamRequest(request, incoming) {
  const target = new URL(ORIGIN);
  target.pathname = upstreamPath(incoming.pathname);
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.set('x-ekodi-customer-domain', incoming.hostname);
  return new Request(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
}
function customerLocation(value, incoming) {
  if (!value) return value;
  try {
    const target = new URL(value, ORIGIN);
    if (target.hostname !== 'ekodi.kr') return value;
    if (target.pathname === SITE_PREFIX || target.pathname.startsWith(SITE_PREFIX + '/')) {
      target.hostname = incoming.hostname;
      target.pathname = target.pathname.slice(SITE_PREFIX.length) || '/';
      return target.toString();
    }
    if (target.pathname === API_PREFIX || target.pathname.startsWith(API_PREFIX + '/')) {
      target.hostname = incoming.hostname;
      return target.toString();
    }
  } catch {}
  return value;
}

function rewriteText(text, incoming, contentType) {
  let output = String(text || '');
  const customerOrigin = 'https://' + incoming.hostname;
  output = output.replaceAll('https://ekodi.kr/seonammedi/', customerOrigin + '/');
  output = output.replaceAll('https://ekodi.kr/seonammedi', customerOrigin);
  if (contentType.includes('text/html')) {
    // Normalize legacy canonical from proxied HTML only, never sign-in or content links.
    output = output.replace(/(<link\s+rel=["']canonical["']\s+href=["'])https:\/\/(?:seonammedi\.kr|xn--3e0b8b58jw4co4mnpll3k\.kr)/gi, '$1' + CANONICAL_ORIGIN);
    output = output.replaceAll('href="/seonammedi/', 'href="/');
    output = output.replaceAll('src="/seonammedi/', 'src="/');
    output = injectVerificationMeta(output, incoming.hostname);
  }
  return output;
}
// Search discovery: one Korean IDN canonical on both publicly reachable hosts.
// The English customer domain continues to serve its existing functionality.
const CANONICAL_ORIGIN = 'https://xn--3e0b8b58jw4co4mnpll3k.kr';
export const SEONAMMEDI_SITEMAP_PATHS = Object.freeze(['/', '/board/notices', '/board/voices']);
// Daum Webmaster Tool ownership line (public value issued for https://seonammedi.kr,
// owner-provided 2026-10-19). Daum has no IndexNow/API registration lane.
export const SEONAMMEDI_DAUM_WEBMASTER_LINE = '#DaumWebMasterTool:a7f0b97c1ebcf8625674b86e301ffba14c26b9e3e4949468608dcf0bec5643d2:1T0ZRs6bn/unEVfM5aXupg==';
export const SEONAMMEDI_ROBOTS_DISALLOW = Object.freeze(['/admin/', '/minutes/', '/api/', '/auth/', '/seonammedi/admin/']);

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]);
}

export function seonammediRobotsTxt() {
  return [
    SEONAMMEDI_DAUM_WEBMASTER_LINE,
    'User-agent: *',
    'Allow: /',
    ...SEONAMMEDI_ROBOTS_DISALLOW.map(path => 'Disallow: ' + path),
    '',
    'Sitemap: ' + CANONICAL_ORIGIN + '/sitemap.xml',
    '',
  ].join('\n');
}

// Only public, live independent-board notices belong in customer-domain discovery.
// The API itself selects status='published'; check the returned status again to
// fail closed if the API contract or upstream source changes.
export function seonammediPublicNoticeSitemapEntries(payload) {
  if (payload?.ok !== true || payload?.boardId !== 'seonammedi.notice' || !Array.isArray(payload.items)) return [];
  const seen = new Set();
  const items = [];
  for (const row of payload.items.slice(0, 100)) {
    const id = row?.id;
    if (!Number.isSafeInteger(id) || id < 1 || row.status !== 'published' || seen.has(id)) continue;
    seen.add(id);
    const rawDate = String(row.updatedAt || row.createdAt || '');
    const time = /^\\d{4}-\\d{2}-\\d{2}T/.test(rawDate) ? Date.parse(rawDate) : NaN;
    items.push({ path: '/board/notices/' + id, lastmod: Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '' });
  }
  return items;
}

export function seonammediSitemapXml(publishedNotices = []) {
  const base = SEONAMMEDI_SITEMAP_PATHS.map(path => {
    const priority = path === '/' ? '1.0' : '0.8';
    return '  <url><loc>' + xmlEscape(CANONICAL_ORIGIN + path) + '</loc><changefreq>daily</changefreq><priority>' + priority + '</priority></url>';
  });
  const details = publishedNotices.map(({ path, lastmod }) => {
    if (!/^\\/board\\/notices\\/[1-9]\\d*$/.test(String(path || ''))) return '';
    const lastmodXml = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(lastmod || '')) ? '<lastmod>' + lastmod + '</lastmod>' : '';
    return '  <url><loc>' + xmlEscape(CANONICAL_ORIGIN + path) + '</loc>' + lastmodXml + '<changefreq>weekly</changefreq><priority>0.7</priority></url>';
  }).filter(Boolean);
  return '<?xml version="1.0" encoding="UTF-8"?>\\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\\n' + [...base, ...details].join('\\n') + '\\n</urlset>\\n';
}

// The board's public endpoint is deliberately read-only and limits results.
// Never query admin/finance/voice endpoints or publish a draft, deleted post or
// user-submitted private data in the sitemap. On failure retain the three
// already indexed static pages rather than failing the whole sitemap.
export async function seonammediLiveSitemapXml(fetchPublic = fetch) {
  try {
    const response = await fetchPublic(ORIGIN + SITE_PREFIX + '/board/api/notices', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response?.ok) return seonammediSitemapXml();
    const payload = await response.json();
    return seonammediSitemapXml(seonammediPublicNoticeSitemapEntries(payload));
  } catch {
    return seonammediSitemapXml();
  }
}

function discoveryResponse(body, contentType, route, method) {
  return new Response(method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'x-ekodi-domain-mode': 'customer-domain-preserved',
      'x-ekodi-route': route,
    },
  });
}

export function seonammediDiscoveryResponse(request, incoming) {
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  if (incoming.pathname === '/robots.txt') return discoveryResponse(seonammediRobotsTxt(), 'text/plain; charset=utf-8', 'seonammedi-robots', request.method);
  if (incoming.pathname === '/sitemap.xml') return discoveryResponse(seonammediSitemapXml(), 'application/xml; charset=utf-8', 'seonammedi-sitemap', request.method);
  if (incoming.pathname === EKODI_INDEXNOW_KEY_PATH) return ekodiIndexNowKeyResponse();
  return null;
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (!DOMAIN_HOSTS.has(incoming.hostname.toLowerCase())) {
      return new Response('Not found', { status: 404 });
    }
    // Generate the live sitemap only on GET, after the protected domain gate.
    // HEAD remains a cheap, side-effect-free static discovery response.
    if (request.method === 'GET' && incoming.pathname === '/sitemap.xml') {
      const xml = await seonammediLiveSitemapXml();
      return discoveryResponse(xml, 'application/xml; charset=utf-8', 'seonammedi-sitemap', request.method);
    }
    const discovery = seonammediDiscoveryResponse(request, incoming);
    if (discovery) return discovery;

    const upstream = await fetch(upstreamRequest(request, incoming));
    const headers = new Headers(upstream.headers);
    const location = customerLocation(headers.get('location'), incoming);
    if (location) headers.set('location', location);
    headers.set('x-ekodi-domain-mode', 'customer-domain-preserved');
    headers.set('x-ekodi-upstream-path', upstreamPath(incoming.pathname));

    const contentType = String(headers.get('content-type') || '').toLowerCase();
    const rewritable = contentType.includes('text/html') ||
      contentType.includes('javascript') ||
      contentType.includes('application/json') ||
      contentType.includes('text/plain');

    if (!rewritable || request.method === 'HEAD') {
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    }
    const body = rewriteText(await upstream.text(), incoming, contentType);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
