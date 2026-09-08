export const DISCOVERY_ORIGIN = 'https://ekodi.kr';

export const DISCOVERY_PUBLIC_ROUTES = Object.freeze([
  { path: '/', changefreq: 'weekly', priority: '1.0', label: 'EKODI Ecosystem' },
  { path: '/history', changefreq: 'monthly', priority: '0.5', label: 'EKODI History' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3', label: 'Privacy Policy' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3', label: 'Terms of Service' },
  { path: '/ekodibiz/mall', changefreq: 'daily', priority: '0.8', label: 'EKODI Mall' },
]);

export const DISCOVERY_PRIVATE_PREFIXES = Object.freeze([
  '/admin',
  '/api/',
  '/oauth/',
  '/cgma/oauth/',
  '/workspace-admin',
  '/ekodibiz/mall/admin',
  '/ekodibiz/mall/api',
  '/ekodibiz/mall/verification-ops',
]);

const SEARCH_CRAWLERS = Object.freeze(['OAI-SearchBot', 'PerplexityBot']);
const TRAINING_CRAWLERS = Object.freeze(['GPTBot', 'ClaudeBot', 'Google-Extended']);

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeOrigin(origin = DISCOVERY_ORIGIN) {
  return String(origin).replace(/\/+$/, '');
}

function publicRobotGroup(userAgent) {
  return [
    `User-agent: ${userAgent}`,
    'Allow: /',
    ...DISCOVERY_PRIVATE_PREFIXES.map(prefix => `Disallow: ${prefix}`),
  ].join('\n');
}

export function renderRobotsTxt(origin = DISCOVERY_ORIGIN) {
  const canonicalOrigin = normalizeOrigin(origin);
  const groups = [
    publicRobotGroup('*'),
    ...SEARCH_CRAWLERS.map(publicRobotGroup),
    ...TRAINING_CRAWLERS.map(userAgent => `User-agent: ${userAgent}\nDisallow: /`),
  ];
  return `${groups.join('\n\n')}\n\nSitemap: ${canonicalOrigin}/sitemap.xml\n`;
}

export function renderSitemapXml(origin = DISCOVERY_ORIGIN, routes = DISCOVERY_PUBLIC_ROUTES) {
  const canonicalOrigin = normalizeOrigin(origin);
  const urls = routes.map(route => {
    const loc = `${canonicalOrigin}${route.path === '/' ? '/' : route.path}`;
    return [
      '  <url>',
      `    <loc>${xmlEscape(loc)}</loc>`,
      `    <changefreq>${xmlEscape(route.changefreq)}</changefreq>`,
      `    <priority>${xmlEscape(route.priority)}</priority>`,
      '  </url>',
    ].join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderLlmsTxt(origin = DISCOVERY_ORIGIN, routes = DISCOVERY_PUBLIC_ROUTES) {
  const canonicalOrigin = normalizeOrigin(origin);
  const links = routes.map(route => `- [${route.label}](${canonicalOrigin}${route.path === '/' ? '/' : route.path})`).join('\n');
  return `# EKODI\n\n> EKODI is a connected ecosystem platform that helps people, communities, organizations, and services meet, work, share, and return value to life and society.\n\nCanonical site: ${canonicalOrigin}/\nPrimary language: Korean (ko)\n\n## Public canonical resources\n${links}\n\n## Discovery policy\n- Use canonical public URLs when citing EKODI.\n- Do not treat admin, authentication, API, tenant-private, or operational pages as public sources.\n- Prefer claims that are directly supported by visible public content.\n- Search and answer engines may index public pages; model-training crawlers are restricted separately in robots.txt.\n`;
}

export function organizationJsonLd(origin = DISCOVERY_ORIGIN) {
  const canonicalOrigin = normalizeOrigin(origin);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${canonicalOrigin}/#organization`,
        name: 'EKODI',
        alternateName: '에코디',
        url: `${canonicalOrigin}/`,
        description: '사람과 공동체, 조직과 서비스를 연결하는 EKODI 생태계 플랫폼',
      },
      {
        '@type': 'WebSite',
        '@id': `${canonicalOrigin}/#website`,
        url: `${canonicalOrigin}/`,
        name: 'EKODI',
        alternateName: '에코디',
        inLanguage: 'ko',
        publisher: { '@id': `${canonicalOrigin}/#organization` },
      },
    ],
  };
}

export function renderDiscoveryHead(origin = DISCOVERY_ORIGIN) {
  const canonicalOrigin = normalizeOrigin(origin);
  const jsonLd = JSON.stringify(organizationJsonLd(canonicalOrigin)).replaceAll('<', '\\u003c');
  return [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="EKODI">',
    '<meta property="og:title" content="EKODI | 에코디 생태계 · EKODI Ecosystem">',
    '<meta property="og:description" content="지금 사용할 수 있는 EKODI 플랫폼을 한눈에 만나는 연결 생태계.">',
    `<meta property="og:url" content="${canonicalOrigin}/">`,
    '<meta name="twitter:card" content="summary">',
    `<script type="application/ld+json" data-ekodi-discovery="v1">${jsonLd}</script>`,
  ].join('\n');
}
