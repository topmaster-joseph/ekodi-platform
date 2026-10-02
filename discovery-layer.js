import registryConfig from './config/public-discovery-registry.json' with { type: 'json' };
import ecosystemRegistry from './config/ecosystem-services.json' with { type: 'json' };
import { staticSitePublicationCatalog } from './site-publication-runtime.js';

export const DISCOVERY_ORIGIN = registryConfig.policy.canonicalOrigin || 'https://ekodi.kr';

const PUBLIC_STATES = new Set(registryConfig.policy.publicStates || ['public', 'published', 'live']);
const EXCLUDED_STATES = new Set(registryConfig.policy.excludedStates || ['private', 'draft', 'preparing', 'planned', 'preview', 'archived']);

function normalizePath(value = '/') {
  const raw = String(value || '/').split('?')[0].split('#')[0] || '/';
  const path = ('/' + raw.replace(/^\/+|\/+$/g, '')).replace(/\/{2,}/g, '/');
  return path === '/' ? '/' : path.replace(/\/+$/, '');
}
function normalizeOrigin(origin = DISCOVERY_ORIGIN) { return String(origin).replace(/\/+$/, ''); }
function pathBlocked(path) {
  const normalized = normalizePath(path);
  return (registryConfig.privatePrefixes || []).some(prefix => {
    const p = normalizePath(prefix);
    return normalized === p || normalized.startsWith(p + '/');
  });
}
function safeInternalPath(urlValue) {
  try {
    const url = new URL(urlValue);
    if (url.origin !== normalizeOrigin(DISCOVERY_ORIGIN)) return '';
    return normalizePath(url.pathname);
  } catch {
    return '';
  }
}
function schemaKindForService(service) {
  const explicit = {
    church: 'church',
    books: 'bookStore',
    mall: 'store',
    journal: 'article',
    publishing: 'service',
    marketing: 'service',
    biz: 'service',
    work: 'service',
    community: 'organization',
    social: 'organization',
    lab: 'organization',
  };
  return explicit[service.id] || 'service';
}
function serviceByPath() {
  const map = new Map();
  for (const service of ecosystemRegistry.services || []) {
    const path = safeInternalPath(service.url);
    if (path) map.set(path, service);
  }
  return map;
}
function serviceIsDiscoverable(service) {
  if (!service) return true;
  if (service.productionVerified !== true) return false;
  if (EXCLUDED_STATES.has(String(service.status || '').toLowerCase())) return false;
  return ['live','beta'].includes(String(service.status || '').toLowerCase());
}
function routeFromService(service) {
  const path = safeInternalPath(service.url);
  if (!path || pathBlocked(path) || !serviceIsDiscoverable(service) || service.userVisible === false) return null;
  return Object.freeze({
    id: service.id,
    path,
    asset: null,
    kind: schemaKindForService(service),
    publicationState: 'public',
    changefreq: 'weekly',
    priority: '0.8',
    label: service.nameEn || service.name,
    title: `${service.name} | EKODI`,
    description: service.descriptionKo || service.descriptionEn || `${service.name} 공식 공개 페이지입니다.`,
    source: 'ecosystem-services',
  });
}
function routeFromPublicationSite(site, services) {
  const path = normalizePath(site.canonicalPath);
  if (!path || pathBlocked(path)) return null;
  const service = services.get(path);
  if (service && !serviceIsDiscoverable(service)) return null;
  return Object.freeze({
    id: site.id,
    path,
    asset: null,
    kind: service ? schemaKindForService(service) : (site.discoveryKind || 'organization'),
    publicationState: 'public',
    changefreq: site.discoveryChangefreq || 'weekly',
    priority: site.discoveryPriority || (path === '/' ? '1.0' : '0.7'),
    label: site.discoveryLabel || service?.nameEn || site.name,
    title: site.discoveryTitle || (service ? `${service.name} | EKODI` : `${site.name} | EKODI`),
    description: site.discoveryDescription || service?.descriptionKo || service?.descriptionEn || `${site.name}의 EKODI 공식 공개 페이지입니다.`,
    source: site.source || 'site-publication',
  });
}
function routeFromRegistry(record, source) {
  if (!record || !PUBLIC_STATES.has(String(record.publicationState || '').toLowerCase())) return null;
  const path = normalizePath(record.path);
  if (pathBlocked(path)) return null;
  return Object.freeze({
    id: record.id || path,
    path,
    asset: record.asset || null,
    kind: record.kind || 'webpage',
    publicationState: record.publicationState,
    changefreq: record.changefreq || (record.kind === 'event' ? 'daily' : 'weekly'),
    priority: String(record.priority || '0.7'),
    label: record.label || record.title || record.id || path,
    title: record.title || record.label || record.id || 'EKODI',
    description: record.description || 'EKODI 공개 정보입니다.',
    image: record.image || '',
    datePublished: record.datePublished || '',
    dateModified: record.dateModified || '',
    startsAt: record.startsAt || '',
    endsAt: record.endsAt || '',
    source,
  });
}

export function compilePublicDiscoveryRegistry() {
  const byPath = new Map();
  const services = serviceByPath();

  for (const service of ecosystemRegistry.services || []) {
    const route = routeFromService(service);
    if (route) byPath.set(route.path, route);
  }
  for (const site of staticSitePublicationCatalog()) {
    const route = routeFromPublicationSite(site, services);
    if (route && !byPath.has(route.path)) byPath.set(route.path, route);
  }
  for (const [source, records] of [
    ['base-pages', registryConfig.basePages || []],
    ['registered-sites', registryConfig.sites || []],
    ['registered-resources', registryConfig.resources || []],
  ]) {
    for (const record of records) {
      const route = routeFromRegistry(record, source);
      if (route) byPath.set(route.path, route);
    }
  }
  return Object.freeze([...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)));
}

export const PUBLIC_DISCOVERY_REGISTRY = compilePublicDiscoveryRegistry();
export const DISCOVERY_PUBLIC_ROUTES = PUBLIC_DISCOVERY_REGISTRY;
export const DISCOVERY_PRIVATE_PREFIXES = Object.freeze([...(registryConfig.privatePrefixes || [])]);

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
export function canonicalUrl(path = '/', origin = DISCOVERY_ORIGIN) { const base = normalizeOrigin(origin); return `${base}${path === '/' ? '/' : normalizePath(path)}`; }
export function publicDiscoveryRoute(path = '/') { const normalized = normalizePath(path); return DISCOVERY_PUBLIC_ROUTES.find(route => route.path === normalized) || null; }
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
  const links = routes.map(route => `- [${route.label}](${canonicalUrl(route.path, base)}) — ${route.description}`).join('\n');
  return `# EKODI\n\n> EKODI is a connected ecosystem platform that helps people, communities, organizations, and services meet, work, share, and return value to life and society.\n\nCanonical site: ${base}/\nPrimary language: Korean (ko)\nRegistry policy: ${registryConfig.policy.id}\n\n## Public canonical resources\n${links}\n\n## Discovery policy\n- Public discovery is generated from the central EKODI Public Registry and site-publication source.\n- Admin, authentication, API, preview-development, private, personal and preparing surfaces are excluded automatically.\n- Use canonical public URLs when citing EKODI.\n- Prefer claims that are directly supported by visible public content.\n- Search engines and answer-retrieval crawlers may index public pages.\n- Model-training and autonomous-agent crawlers are restricted separately; search permission does not imply training or agent permission.\n`;
}

const SCHEMA_TYPES = Object.freeze({
  website: 'WebSite',
  webpage: 'WebPage',
  organization: 'Organization',
  church: 'Church',
  service: 'Service',
  store: 'Store',
  bookStore: 'BookStore',
  restaurant: 'Restaurant',
  foodEstablishment: 'FoodEstablishment',
  article: 'Article',
  post: 'Article',
  event: 'Event',
  product: 'Product',
});

function entityForRoute(route, url) {
  const type = SCHEMA_TYPES[route.kind] || 'WebPage';
  if (['WebPage', 'WebSite'].includes(type)) return null;
  const entity = {
    '@type': type,
    '@id': `${url}#entity`,
    name: route.title,
    description: route.description,
    url,
  };
  if (route.image) entity.image = canonicalUrl(route.image);
  if (route.datePublished) entity.datePublished = route.datePublished;
  if (route.dateModified) entity.dateModified = route.dateModified;
  if (type === 'Event') {
    if (route.startsAt) entity.startDate = route.startsAt;
    if (route.endsAt) entity.endDate = route.endsAt;
  }
  return entity;
}

export function pageJsonLd(path = '/', origin = DISCOVERY_ORIGIN) {
  const route = publicDiscoveryRoute(path); if (!route) throw new Error(`Unknown public discovery route: ${path}`);
  const base = normalizeOrigin(origin); const url = canonicalUrl(route.path, base);
  const entity = entityForRoute(route, url);
  const graph = [
    { '@type': 'Organization', '@id': `${base}/#organization`, name: 'EKODI', alternateName: '에코디', url: `${base}/`, description: '사람과 공동체, 조직과 서비스를 연결하는 EKODI 생태계 플랫폼' },
    { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: 'EKODI', alternateName: '에코디', inLanguage: 'ko', publisher: { '@id': `${base}/#organization` } },
  ];
  graph.push({ '@type': 'WebPage', '@id': `${url}#webpage`, url, name: route.title, description: route.description, inLanguage: 'ko', isPartOf: { '@id': `${base}/#website` }, about: entity ? { '@id': entity['@id'] } : { '@id': `${base}/#organization` } });
  if (entity) graph.push(entity);
  return { '@context': 'https://schema.org', '@graph': graph };
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
  return normalizePath(value);
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
    /<script\b(?=[^>]*\bdata-ekodi-discovery=(['"])v(?:2|3)\1)[^>]*>[\s\S]*?<\/script>\s*/gi,
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
