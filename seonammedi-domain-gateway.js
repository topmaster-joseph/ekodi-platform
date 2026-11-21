import { EKODI_INDEXNOW_KEY_PATH, ekodiIndexNowKeyResponse } from './platform-indexnow.js';
import { injectVerificationMeta } from './search-engine-verification.js';
import { withFooterTraffic } from './footer-traffic-guarantee.js';
import { withEdgeTrafficShield } from './edge-traffic-shield.js';

const ORIGIN = 'https://ekodi.kr';
const SITE_PREFIX = '/seonammedi';
const API_PREFIX = '/api/seonammedi';
const DOMAIN_HOSTS = new Set(['seonammedi.kr', 'xn--3e0b8b58jw4co4mnpll3k.kr']);
// Naver Search Advisor: owner-issued HTML upload verification for the Korean IDN.
// Explicitly scope this root file to its issued host; never alter other hosts.
export const SEONAMMEDI_NAVER_FILE_PATH = '/naver2d4965e691c1cb3786d93044f2ad2f01.html';
export const SEONAMMEDI_NAVER_FILE_BODY = 'naver-site-verification: naver2d4965e691c1cb3786d93044f2ad2f01.html';

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
  // HOST-PRESERVING-LINKS-20261105: the Korean domain links stay on the Korean
  // domain and the English domain stays on the English domain. Only the
  // canonical tag follows the same host so each Daum/Naver registration owns
  // its own pages (owner decision 2026-11-05).
  for (const host of DOMAIN_HOSTS) {
    if (host === incoming.hostname.toLowerCase()) continue;
    output = output.replace(new RegExp('https://' + host.replaceAll('.', '\\.') + '(?=[/"\'<\\s?#]|$)', 'gi'), customerOrigin);
  }
  if (contentType.includes('text/html')) {
    // Normalize legacy canonical from proxied HTML only, never sign-in or content links.
    output = output.replace(/(<link\s+rel=["']canonical["']\s+href=["'])https:\/\/(?:seonammedi\.kr|xn--3e0b8b58jw4co4mnpll3k\.kr)/gi, '$1' + customerOrigin);
    output = output.replaceAll('href="/seonammedi/', 'href="/');
    output = output.replaceAll('src="/seonammedi/', 'src="/');
    output = injectVerificationMeta(output, incoming.hostname);
  }
  return output;
}
// Search discovery: one Korean IDN canonical on both publicly reachable hosts.
// The English customer domain continues to serve its existing functionality.
const CANONICAL_ORIGIN = 'https://xn--3e0b8b58jw4co4mnpll3k.kr';
// Naver Search Advisor owner-issued 2026-10-30 for the English alias only.
export const SEONAMMEDI_ENGLISH_NAVER_FILE_PATH = '/navera1df00235ac98ccb6796021cd7feb55a.html';
export const SEONAMMEDI_ENGLISH_NAVER_FILE_BODY = 'naver-site-verification: navera1df00235ac98ccb6796021cd7feb55a.html';
export const SEONAMMEDI_SITEMAP_PATHS = Object.freeze(['/', '/board/notices', '/board/voices']);
// Daum Webmaster Tool ownership line (public value issued for https://seonammedi.kr,
// owner-provided 2026-10-19). Daum has no IndexNow/API registration lane.
export const SEONAMMEDI_DAUM_WEBMASTER_LINE = '#DaumWebMasterTool:a7f0b97c1ebcf8625674b86e301ffba14c26b9e3e4949468608dcf0bec5643d2:1T0ZRs6bn/unEVfM5aXupg==';
// Daum Webmaster Tool ownership line issued for the Korean IDN
// (https://xn--3e0b8b58jw4co4mnpll3k.kr), owner-provided 2026-11-03.
export const SEONAMMEDI_IDN_DAUM_WEBMASTER_LINE = '#DaumWebMasterTool:09aaba3a7d5c249941e4d1c1ff4a0218067951fde4fb5cfdee13efe08fbe2f76:e72ZaETHYmtl8bFrs60rSQ==';
// Each Daum line is served only on the host it was issued for.
export function seonammediDaumWebmasterLine(host = 'seonammedi.kr') {
  return String(host || '').toLowerCase() === 'xn--3e0b8b58jw4co4mnpll3k.kr'
    ? SEONAMMEDI_IDN_DAUM_WEBMASTER_LINE
    : SEONAMMEDI_DAUM_WEBMASTER_LINE;
}
export const SEONAMMEDI_ROBOTS_DISALLOW = Object.freeze(['/admin/', '/minutes/', '/api/', '/auth/', '/seonammedi/admin/']);

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[ch]);
}

// Each customer domain advertises its own sitemap and URLs (host-preserving).
export function seonammediHostOrigin(host) {
  const value = String(host || '').toLowerCase();
  return DOMAIN_HOSTS.has(value) ? 'https://' + value : CANONICAL_ORIGIN;
}

export function seonammediRobotsTxt(host = 'seonammedi.kr') {
  return [
    seonammediDaumWebmasterLine(host),
    'User-agent: *',
    'Allow: /',
    ...SEONAMMEDI_ROBOTS_DISALLOW.map(path => 'Disallow: ' + path),
    '',
    'Sitemap: ' + seonammediHostOrigin(host) + '/sitemap.xml',
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
    const time = /^\d{4}-\d{2}-\d{2}T/.test(rawDate) ? Date.parse(rawDate) : NaN;
    items.push({ path: '/board/notices/' + id, lastmod: Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '' });
  }
  return items;
}

export function seonammediSitemapXml(publishedNotices = [], host = '') {
  const origin = seonammediHostOrigin(host);
  const base = SEONAMMEDI_SITEMAP_PATHS.map(path => {
    const priority = path === '/' ? '1.0' : '0.8';
    return '  <url><loc>' + xmlEscape(origin + path) + '</loc><changefreq>daily</changefreq><priority>' + priority + '</priority></url>';
  });
  const details = publishedNotices.map(({ path, lastmod }) => {
    if (!/^\/board\/notices\/[1-9]\d*$/.test(String(path || ''))) return '';
    const lastmodXml = /^\d{4}-\d{2}-\d{2}$/.test(String(lastmod || '')) ? '<lastmod>' + lastmod + '</lastmod>' : '';
    return '  <url><loc>' + xmlEscape(origin + path) + '</loc>' + lastmodXml + '<changefreq>weekly</changefreq><priority>0.7</priority></url>';
  }).filter(Boolean);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...base, ...details].join('\n') + '\n</urlset>\n';
}

// The board's public endpoint is deliberately read-only and limits results.
// Never query admin/finance/voice endpoints or publish a draft, deleted post or
// user-submitted private data in the sitemap. On failure retain the three
// already indexed static pages rather than failing the whole sitemap.
export async function seonammediLiveSitemapXml(fetchPublic = fetch, host = '') {
  try {
    const response = await fetchPublic(ORIGIN + SITE_PREFIX + '/board/api/notices', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response?.ok) return seonammediSitemapXml([], host);
    const payload = await response.json();
    return seonammediSitemapXml(seonammediPublicNoticeSitemapEntries(payload), host);
  } catch {
    return seonammediSitemapXml([], host);
  }
}

// RSS 2.0 feed of published notices for Naver Search Advisor "RSS 제출".
// Same read-only public notices endpoint and fail-closed filter as the sitemap.
function rssText(value, max, stripTags = false) {
  const raw = String(value ?? '');
  const text = (stripTags ? raw.replace(/<[^>]*>/g, ' ') : raw).replace(/\s+/g, ' ').trim();
  return max && text.length > max ? text.slice(0, max - 1) + '…' : text;
}
export function seonammediRssXml(payload, host = '') {
  const origin = seonammediHostOrigin(host);
  const items = [];
  if (payload?.ok === true && payload?.boardId === 'seonammedi.notice' && Array.isArray(payload.items)) {
    const seen = new Set();
    for (const row of payload.items.slice(0, 50)) {
      const id = row?.id;
      if (!Number.isSafeInteger(id) || id < 1 || row.status !== 'published' || seen.has(id)) continue;
      seen.add(id);
      const link = origin + '/board/notices/' + id;
      const rawDate = String(row.publishedAt || row.createdAt || row.updatedAt || '');
      const time = /^\d{4}-\d{2}-\d{2}T/.test(rawDate) ? Date.parse(rawDate) : NaN;
      const title = rssText(row.title, 200) || '서남권국립의대 공지';
      const description = rssText(row.excerpt || row.summary || row.body, 300, true);
      items.push('    <item><title>' + xmlEscape(title) + '</title><link>' + xmlEscape(link) + '</link><guid isPermaLink="true">' + xmlEscape(link) + '</guid>' +
        (Number.isFinite(time) ? '<pubDate>' + new Date(time).toUTCString() + '</pubDate>' : '') +
        (description ? '<description>' + xmlEscape(description) + '</description>' : '') + '</item>');
    }
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n' +
    '    <title>서남권국립의대</title>\n    <link>' + xmlEscape(origin + '/') + '</link>\n' +
    '    <description>서남권국립의대 공지와 활동소식</description>\n    <language>ko</language>\n' +
    (items.length ? items.join('\n') + '\n' : '') + '  </channel>\n</rss>\n';
}
export async function seonammediLiveRssXml(fetchPublic = fetch, host = '') {
  try {
    const response = await fetchPublic(ORIGIN + SITE_PREFIX + '/board/api/notices', { method: 'GET', headers: { accept: 'application/json' } });
    if (!response?.ok) return seonammediRssXml(null, host);
    return seonammediRssXml(await response.json(), host);
  } catch {
    return seonammediRssXml(null, host);
  }
}

// ROUTE-META-20261121: every SPA route used to serve the home page's title,
// description and a canonical pointing at '/'. Bing Webmaster flagged the
// duplicate/short metadata, and a canonical of '/' tells engines every board
// URL is a copy of the home page — a direct cause of near-zero indexing.
// Serve crawler-visible per-route <title>, meta description and canonical.
const SEONAMMEDI_SITE_NAME = '서남권국립의대 비상대책위원회';
export function seonammediRouteMeta(pathname, payload = null) {
  const path = String(pathname || '');
  if (path === '/board/voices') {
    return {
      path,
      title: '시민의견 | ' + SEONAMMEDI_SITE_NAME,
      description: '서남권 국립의대 설립에 대한 시민 여러분의 의견을 나누는 공간입니다. 의견을 남기고 다른 시민들의 목소리를 확인해 보세요.',
    };
  }
  const detail = path.match(/^\/board\/notices\/([1-9]\d*)$/);
  if (path !== '/board/notices' && !detail) return null;
  let title = '공지사항 | ' + SEONAMMEDI_SITE_NAME;
  let description = '서남권국립의대 비상대책위원회 공지사항 게시판 — 성명서, 집회·행사 안내와 공식 발표, 활동 소식을 확인할 수 있습니다.';
  if (detail && payload?.ok === true && payload?.boardId === 'seonammedi.notice' && Array.isArray(payload.items)) {
    const id = Number(detail[1]);
    const row = payload.items.find(r => r?.id === id && r?.status === 'published');
    if (row) {
      const postTitle = rssText(row.title, 60);
      const postBody = rssText(row.excerpt || row.summary || row.body, 150, true);
      if (postTitle) title = postTitle + ' | ' + SEONAMMEDI_SITE_NAME;
      if (postBody) description = postBody;
    }
  }
  return { path, title, description };
}

export function seonammediApplyRouteMeta(html, meta, host = '') {
  if (!meta) return String(html || '');
  const origin = seonammediHostOrigin(host);
  const title = xmlEscape(meta.title);
  const description = xmlEscape(meta.description);
  const canonical = xmlEscape(origin + meta.path);
  let out = String(html || '');
  out = out.replace(/<title>[^<]*<\/title>/i, '<title>' + title + '</title>');
  out = out.replace(/(<meta\s+name=["']description["']\s+content=["'])[^"']*(["'])/i, '$1' + description + '$2');
  out = out.replace(/(<meta\s+property=["']og:title["']\s+content=["'])[^"']*(["'])/i, '$1' + title + '$2');
  out = out.replace(/(<meta\s+property=["']og:description["']\s+content=["'])[^"']*(["'])/i, '$1' + description + '$2');
  out = out.replace(/(<link\s+rel=["']canonical["']\s+href=["'])[^"']*(["'])/i, '$1' + canonical + '$2');
  return out;
}

// Fetch the public notices list only for a notice-detail HTML request, and
// fail closed to the static section metadata on any upstream problem.
export async function seonammediLiveRouteMeta(pathname, fetchPublic = fetch) {
  const path = String(pathname || '');
  if (!/^\/board\/notices\/[1-9]\d*$/.test(path)) return seonammediRouteMeta(path);
  try {
    const response = await fetchPublic(ORIGIN + SITE_PREFIX + '/board/api/notices', { method: 'GET', headers: { accept: 'application/json' } });
    if (!response?.ok) return seonammediRouteMeta(path);
    return seonammediRouteMeta(path, await response.json());
  } catch {
    return seonammediRouteMeta(path);
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
  if (incoming.hostname.toLowerCase() === 'seonammedi.kr' &&
      incoming.pathname === SEONAMMEDI_ENGLISH_NAVER_FILE_PATH) {
    return discoveryResponse(SEONAMMEDI_ENGLISH_NAVER_FILE_BODY, 'text/html; charset=utf-8', 'seonammedi-english-naver-ownership', request.method);
  }
  if (incoming.hostname.toLowerCase() === 'xn--3e0b8b58jw4co4mnpll3k.kr' &&
      incoming.pathname === SEONAMMEDI_NAVER_FILE_PATH) {
    return discoveryResponse(SEONAMMEDI_NAVER_FILE_BODY, 'text/html; charset=utf-8', 'seonammedi-naver-ownership', request.method);
  }
  if (incoming.pathname === '/robots.txt') return discoveryResponse(seonammediRobotsTxt(incoming.hostname), 'text/plain; charset=utf-8', 'seonammedi-robots', request.method);
  if (incoming.pathname === '/sitemap.xml') return discoveryResponse(seonammediSitemapXml([], incoming.hostname), 'application/xml; charset=utf-8', 'seonammedi-sitemap', request.method);
  if (incoming.pathname === '/rss.xml') return discoveryResponse(seonammediRssXml(null, incoming.hostname), 'application/rss+xml; charset=utf-8', 'seonammedi-rss', request.method);
  if (incoming.pathname === EKODI_INDEXNOW_KEY_PATH) return ekodiIndexNowKeyResponse();
  return null;
}

const ekodiWorkerEntry={
  async fetch(request) {
    const incoming = new URL(request.url);
    if (!DOMAIN_HOSTS.has(incoming.hostname.toLowerCase())) {
      return new Response('Not found', { status: 404 });
    }
    // Generate the live sitemap only on GET, after the protected domain gate.
    // HEAD remains a cheap, side-effect-free static discovery response.
    if (request.method === 'GET' && incoming.pathname === '/sitemap.xml') {
      const xml = await seonammediLiveSitemapXml(fetch, incoming.hostname);
      return discoveryResponse(xml, 'application/xml; charset=utf-8', 'seonammedi-sitemap', request.method);
    }
    if (request.method === 'GET' && incoming.pathname === '/rss.xml') {
      const xml = await seonammediLiveRssXml(fetch, incoming.hostname);
      return discoveryResponse(xml, 'application/rss+xml; charset=utf-8', 'seonammedi-rss', request.method);
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
    let body = rewriteText(await upstream.text(), incoming, contentType);
    if (contentType.includes('text/html') && upstream.status === 200) {
      const routeMeta = await seonammediLiveRouteMeta(incoming.pathname, fetch);
      if (routeMeta) body = seonammediApplyRouteMeta(body, routeMeta, incoming.hostname);
    }
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
// FOOTER-TRAFFIC-GUARANTEE: public HTML from this route always carries footer visit stats.
// EKODI-EDGE-TRAFFIC-SHIELD-001: this apex route bypasses the Shared Site guard, so it carries its own.
export default withEdgeTrafficShield(withFooterTraffic(ekodiWorkerEntry),{service:'seonammedi-domain'});
