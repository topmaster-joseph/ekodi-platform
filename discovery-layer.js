import {
  GENERATED_DISCOVERY_EXTERNAL_RESOURCES,
  GENERATED_DISCOVERY_OFFICIAL_ORIGINS,
  GENERATED_DISCOVERY_PUBLIC_ROUTES,
} from './discovery-registry.generated.js';

export const DISCOVERY_ORIGIN = 'https://ekodi.kr';
export const DISCOVERY_PUBLIC_ROUTES = GENERATED_DISCOVERY_PUBLIC_ROUTES;
export const DISCOVERY_EXTERNAL_RESOURCES = GENERATED_DISCOVERY_EXTERNAL_RESOURCES;
export const DISCOVERY_OFFICIAL_ORIGINS = GENERATED_DISCOVERY_OFFICIAL_ORIGINS;

export const DISCOVERY_PRIVATE_PREFIXES = Object.freeze([
  '/admin', '/api/', '/auth/', '/oauth/', '/cgma/oauth/', '/my', '/member', '/workspace-admin', '/preview/dev',
  '/ekodibiz/ekodimall/admin', '/ekodibiz/ekodimall/api', '/ekodibiz/ekodimall/verification-ops',
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
  const discoveryCrawlers = [
    ...DISCOVERY_CRAWLER_POLICY.searchIndex,
    ...DISCOVERY_CRAWLER_POLICY.answerRetrieval,
    ...DISCOVERY_CRAWLER_POLICY.agent,
  ];
  const groups = [
    publicRobotGroup('*'),
    ...discoveryCrawlers.map(publicRobotGroup),
    ...DISCOVERY_CRAWLER_POLICY.training.map(deniedRobotGroup),
  ];
  return `${groups.join('\n\n')}\n\nSitemap: ${normalizeOrigin(origin)}/sitemap.xml\n`;
}

export function renderSitemapXml(origin = DISCOVERY_ORIGIN, routes = DISCOVERY_PUBLIC_ROUTES) {
  const expectedOrigin = normalizeOrigin(origin);
  const urls = routes
    .filter(route => canonicalUrl(route.path, expectedOrigin).startsWith(`${expectedOrigin}/`))
    .map(route => ['  <url>', `    <loc>${xmlEscape(canonicalUrl(route.path, expectedOrigin))}</loc>`, `    <changefreq>${xmlEscape(route.changefreq)}</changefreq>`, `    <priority>${xmlEscape(route.priority)}</priority>`, '  </url>'].join('\n'))
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderLlmsTxt(origin = DISCOVERY_ORIGIN, routes = DISCOVERY_PUBLIC_ROUTES, externalResources = DISCOVERY_EXTERNAL_RESOURCES) {
  const base = normalizeOrigin(origin);
  const links = routes.map(route => `- [${route.label}](${canonicalUrl(route.path, base)})`).join('\n');
  const externalLinks = externalResources.length
    ? `\n\n## Official EKODI resources on other origins\n${externalResources.map(resource => `- [${resource.label}](${resource.url}) — ${resource.description}`).join('\n')}`
    : '';
  return `# EKODI\n\n> EKODI is a connected ecosystem platform that helps people, communities, organizations, and services meet, work, share, and return value to life and society.\n\nCanonical site: ${base}/\nPrimary language: Korean (ko)\nOfficial origins: ${DISCOVERY_OFFICIAL_ORIGINS.join(', ')}\n\n## Public canonical resources\n${links}${externalLinks}\n\n## Discovery policy\n- Use canonical public URLs when citing EKODI.\n- Do not treat admin, authentication, API, personal, preview-development, tenant-private, or operational pages as public sources.\n- Prefer claims that are directly supported by visible public content.\n- Search engines, answer-retrieval crawlers, and user-requested assistants may access public pages.\n- Model-training crawlers are restricted separately; search or user-agent permission does not imply training permission.\n`;
}

function pageEntity(route, url) {
  if (!route?.schemaType || route.schemaType === 'WebPage') return null;
  return {
    '@type': route.schemaType,
    '@id': `${url}#entity`,
    name: route.title.replace(/\s*\|\s*EKODI\s*$/, ''),
    url,
    description: route.description,
  };
}

export function pageJsonLd(path = '/', origin = DISCOVERY_ORIGIN) {
  const route = publicDiscoveryRoute(path); if (!route) throw new Error(`Unknown public discovery route: ${path}`);
  const base = normalizeOrigin(origin); const url = canonicalUrl(route.path, base);
  const entity = pageEntity(route, url);
  const page = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: route.title,
    description: route.description,
    inLanguage: 'ko',
    isPartOf: { '@id': `${base}/#website` },
    about: entity ? { '@id': entity['@id'] } : { '@id': `${base}/#organization` },
    ...(entity ? { mainEntity: { '@id': entity['@id'] } } : {}),
  };
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${base}/#organization`, name: 'EKODI', alternateName: '에코디', url: `${base}/`, description: '사람과 공동체, 조직과 서비스를 연결하는 EKODI 생태계 플랫폼' },
    { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: 'EKODI', alternateName: '에코디', inLanguage: 'ko', publisher: { '@id': `${base}/#organization` } },
    page,
    ...(entity ? [entity] : []),
  ] };
}

export function organizationJsonLd(origin = DISCOVERY_ORIGIN) { const graph = pageJsonLd('/', origin)['@graph']; return { '@context': 'https://schema.org', '@graph': graph.slice(0, 2) }; }

export function renderDiscoveryHead(path = '/', origin = DISCOVERY_ORIGIN) {
  const route = publicDiscoveryRoute(path); if (!route) throw new Error(`Unknown public discovery route: ${path}`);
  const url = canonicalUrl(route.path, origin); const jsonLd = JSON.stringify(pageJsonLd(route.path, origin)).replaceAll('<', '\\u003c');
  return [
    '<meta name="robots" content="index, follow">', '<meta property="og:type" content="website">', '<meta property="og:site_name" content="EKODI">',
    `<meta property="og:title" content="${route.title}">`, `<meta property="og:description" content="${route.description}">`, `<meta property="og:url" content="${url}">`,
    '<meta name="twitter:card" content="summary">', `<script type="application/ld+json" data-ekodi-discovery="v3" data-ekodi-path="${route.path}">${jsonLd}</script>`,
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
    /<script\b(?=[^>]*\bdata-ekodi-discovery=(['"])v[23]\1)[^>]*>[\s\S]*?<\/script>\s*/gi,
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
