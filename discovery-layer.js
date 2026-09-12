export const DISCOVERY_ORIGIN = 'https://ekodi.kr';

export const DISCOVERY_PUBLIC_ROUTES = Object.freeze([
  { path: '/', asset: 'index.html', changefreq: 'weekly', priority: '1.0', label: 'EKODI Ecosystem', title: 'EKODI | 에코디 생태계 · EKODI Ecosystem', description: '지금 사용할 수 있는 EKODI 플랫폼을 한눈에 만나는 연결 생태계.' },
  { path: '/history', asset: 'history.html', changefreq: 'monthly', priority: '0.5', label: 'EKODI History', title: 'EKODI History | 에코디 연혁', description: 'EKODI 생태계의 주요 흐름과 발전 과정을 확인합니다.' },
  { path: '/privacy', asset: 'privacy.html', changefreq: 'yearly', priority: '0.3', label: 'Privacy Policy', title: '개인정보처리방침 | EKODI', description: 'EKODI 서비스의 개인정보 처리 원칙과 정책을 안내합니다.' },
  { path: '/terms', asset: 'terms.html', changefreq: 'yearly', priority: '0.3', label: 'Terms of Service', title: '이용약관 | EKODI', description: 'EKODI 서비스 이용약관을 안내합니다.' },
  { path: '/cmpmyi', asset: null, changefreq: 'weekly', priority: '0.8', label: 'Mokpo Store Gateway', title: '목포대점 통합 게이트 | EKODI', description: '자담치킨, 피자마루, 요거트퍼플 목포대점을 한 화면에서 선택합니다.' },
  { path: '/jadam', asset: null, changefreq: 'weekly', priority: '0.8', label: 'Jadam Chicken Mokpo', title: '자담치킨 목포대점 | EKODI', description: '자담치킨 목포대점 매장·메뉴·주문·배달 안내.' },
  { path: '/pizzamaru', asset: null, changefreq: 'weekly', priority: '0.8', label: 'PizzaMaru Mokpo', title: '피자마루 목포대점 | EKODI', description: '피자마루 목포대점 매장·메뉴·주문·배달 안내.' },
  { path: '/yogurt', asset: null, changefreq: 'weekly', priority: '0.8', label: 'Yogurt Purple Mokpo', title: '요거트퍼플 목포대점 | EKODI', description: '요거트퍼플 목포대점 매장·메뉴·주문·배달 안내.' },
  { path: '/ekodibiz/mall', asset: null, changefreq: 'daily', priority: '0.8', label: 'EKODI Mall', title: 'EKODI Mall | 에코디몰', description: 'EKODI 생태계의 상품과 서비스를 만나는 공용 몰입니다.' },
]);

export const DISCOVERY_PRIVATE_PREFIXES = Object.freeze([
  '/admin', '/api/', '/auth/', '/oauth/', '/cgma/oauth/', '/workspace-admin', '/preview/dev',
  '/ekodibiz/mall/admin', '/ekodibiz/mall/api', '/ekodibiz/mall/verification-ops',
]);

export const DISCOVERY_CRAWLER_POLICY = Object.freeze({
  searchIndex: Object.freeze(['Googlebot', 'bingbot']),
  answerRetrieval: Object.freeze(['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Applebot']),
  training: Object.freeze([
    'GPTBot', 'ClaudeBot', 'Google-Extended', 'Google-CloudVertexBot', 'Bytespider', 'CCBot',
    'meta-externalagent', 'FacebookBot', 'Amazonbot',
  ]),
  agent: Object.freeze([
    'ChatGPT-User', 'Claude-User', 'Perplexity-User', 'meta-externalfetcher', 'DuckAssistBot', 'MistralAI-User',
  ]),
});

function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function normalizeOrigin(origin = DISCOVERY_ORIGIN) { return String(origin).replace(/\/+$/, ''); }
export function canonicalUrl(path = '/', origin = DISCOVERY_ORIGIN) { const base = normalizeOrigin(origin); return `${base}${path === '/' ? '/' : path}`; }
export function publicDiscoveryRoute(path = '/') { return DISCOVERY_PUBLIC_ROUTES.find(route => route.path === path) || null; }
function publicRobotGroup(userAgent) { return [`User-agent: ${userAgent}`, 'Allow: /', ...DISCOVERY_PRIVATE_PREFIXES.map(prefix => `Disallow: ${prefix}`)].join('\n'); }
function deniedRobotGroup(userAgent) { return `User-agent: ${userAgent}\nDisallow: /`; }

export function renderRobotsTxt(origin = DISCOVERY_ORIGIN) {
  const discoveryCrawlers = [...DISCOVERY_CRAWLER_POLICY.searchIndex, ...DISCOVERY_CRAWLER_POLICY.answerRetrieval];
  const restrictedCrawlers = [...DISCOVERY_CRAWLER_POLICY.training, ...DISCOVERY_CRAWLER_POLICY.agent];
  const groups = [
    publicRobotGroup('*'),
    ...discoveryCrawlers.map(publicRobotGroup),
    ...restrictedCrawlers.map(deniedRobotGroup),
  ];
  return `${groups.join('\n\n')}\n\nSitemap: ${normalizeOrigin(origin)}/sitemap.xml\n`;
}

export function renderSitemapXml(origin = DISCOVERY_ORIGIN, routes = DISCOVERY_PUBLIC_ROUTES) {
  const urls = routes.map(route => ['  <url>', `    <loc>${xmlEscape(canonicalUrl(route.path, origin))}</loc>`, `    <changefreq>${xmlEscape(route.changefreq)}</changefreq>`, `    <priority>${xmlEscape(route.priority)}</priority>`, '  </url>'].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderLlmsTxt(origin = DISCOVERY_ORIGIN, routes = DISCOVERY_PUBLIC_ROUTES) {
  const base = normalizeOrigin(origin);
  const links = routes.map(route => `- [${route.label}](${canonicalUrl(route.path, base)})`).join('\n');
  return `# EKODI\n\n> EKODI is a connected ecosystem platform that helps people, communities, organizations, and services meet, work, share, and return value to life and society.\n\nCanonical site: ${base}/\nPrimary language: Korean (ko)\n\n## Public canonical resources\n${links}\n\n## Discovery policy\n- Use canonical public URLs when citing EKODI.\n- Do not treat admin, authentication, API, preview-development, tenant-private, or operational pages as public sources.\n- Prefer claims that are directly supported by visible public content.\n- Search engines and answer-retrieval crawlers may index public pages.\n- Model-training and autonomous-agent crawlers are restricted separately; search permission does not imply training or agent permission.\n`;
}

export function pageJsonLd(path = '/', origin = DISCOVERY_ORIGIN) {
  const route = publicDiscoveryRoute(path); if (!route) throw new Error(`Unknown public discovery route: ${path}`);
  const base = normalizeOrigin(origin); const url = canonicalUrl(route.path, base);
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${base}/#organization`, name: 'EKODI', alternateName: '에코디', url: `${base}/`, description: '사람과 공동체, 조직과 서비스를 연결하는 EKODI 생태계 플랫폼' },
    { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: 'EKODI', alternateName: '에코디', inLanguage: 'ko', publisher: { '@id': `${base}/#organization` } },
    { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: route.title, description: route.description, inLanguage: 'ko', isPartOf: { '@id': `${base}/#website` }, about: { '@id': `${base}/#organization` } },
  ] };
}

export function organizationJsonLd(origin = DISCOVERY_ORIGIN) { const graph = pageJsonLd('/', origin)['@graph']; return { '@context': 'https://schema.org', '@graph': graph.slice(0, 2) }; }

export function renderDiscoveryHead(path = '/', origin = DISCOVERY_ORIGIN) {
  const route = publicDiscoveryRoute(path); if (!route) throw new Error(`Unknown public discovery route: ${path}`);
  const url = canonicalUrl(route.path, origin); const jsonLd = JSON.stringify(pageJsonLd(route.path, origin)).replaceAll('<', '\\u003c');
  return [
    '<meta name="robots" content="index, follow">', '<meta property="og:type" content="website">', '<meta property="og:site_name" content="EKODI">',
    `<meta property="og:title" content="${route.title}">`, `<meta property="og:description" content="${route.description}">`, `<meta property="og:url" content="${url}">`,
    '<meta name="twitter:card" content="summary">', `<script type="application/ld+json" data-ekodi-discovery="v2" data-ekodi-path="${route.path}">${jsonLd}</script>`,
  ].join('\n');
}

function insertDiscoveryHead(html, replacement) {
  if (!html.includes('</head>')) return html;
  return html.replace('</head>', `${replacement}\n</head>`);
}

function upsertDiscoveryHeadTag(html, pattern, replacement) {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return insertDiscoveryHead(html, replacement);
}

export function normalizeDiscoveryPath(pathname = '/') {
  const value = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  return value.length > 1 ? value.replace(/\/+$/, '') : '/';
}

export function decorateDiscoveryHtml(html, pathname = '/', origin = DISCOVERY_ORIGIN) {
  const path = normalizeDiscoveryPath(pathname);
  const route = publicDiscoveryRoute(path);
  let output = String(html || '');
  if (!route || !output.includes('</head>')) return output;

  const canonical = canonicalUrl(route.path, origin);
  output = upsertDiscoveryHeadTag(output, /<link\b(?=[^>]*\brel=(['"])canonical\1)[^>]*>/i, `<link rel="canonical" href="${canonical}">`);
  output = upsertDiscoveryHeadTag(output, /<meta\b(?=[^>]*\bname=(['"])description\1)[^>]*>/i, `<meta name="description" content="${route.description}">`);

  const managed = [
    /<meta\b(?=[^>]*\bname=(['"])robots\1)[^>]*>\s*/gi,
    /<meta\b(?=[^>]*\bproperty=(['"])og:(?:type|site_name|title|description|url)\1)[^>]*>\s*/gi,
    /<meta\b(?=[^>]*\bname=(['"])twitter:card\1)[^>]*>\s*/gi,
    /<script\b(?=[^>]*\bdata-ekodi-discovery=(['"])v2\1)[^>]*>[\s\S]*?<\/script>\s*/gi,
  ];
  for (const pattern of managed) output = output.replace(pattern, '');
  return insertDiscoveryHead(output, renderDiscoveryHead(route.path, origin));
}

export async function decorateDiscoveryResponse(response, pathname = '/', origin = DISCOVERY_ORIGIN) {
  const path = normalizeDiscoveryPath(pathname);
  if (!publicDiscoveryRoute(path)) return response;
  const type = String(response?.headers?.get?.('content-type') || '');
  if (!type.toLowerCase().includes('text/html')) return response;
  const headers = new Headers(response.headers);
  const html = await response.text();
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  return new Response(decorateDiscoveryHtml(html, path, origin), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
