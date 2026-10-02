import { DISCOVERY_ORIGIN, DISCOVERY_PUBLIC_ROUTES, canonicalUrl, renderLlmsTxt, renderSitemapXml } from './discovery-layer.js';

const CACHE_TTL_MS = 60_000;
let memoryCache = { expiresAt: 0, records: [] };

function clean(value, max = 4000) { return String(value ?? '').trim().slice(0, max); }
function xml(value) { return clean(value, 8000).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;'); }
function html(value) { return clean(value, 8000).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function base(env) { return clean(env?.MY_SUPABASE_URL || env?.SUPABASE_URL).replace(/\/+$/,''); }
function apiKey(env) { return clean(env?.MY_SUPABASE_PUBLISHABLE_KEY || env?.SUPABASE_PUBLISHABLE_KEY, 4096); }
function normalizedPath(value = '/') {
  const raw = String(value || '/').split('?')[0].split('#')[0] || '/';
  const path = ('/' + raw.replace(/^\/+|\/+$/g,'')).replace(/\/{2,}/g,'/');
  return path === '/' ? '/' : path.replace(/\/+$/,'');
}
function recordPath(record) {
  try {
    const url = new URL(record?.canonical_url || '');
    if (url.origin !== DISCOVERY_ORIGIN) return '';
    return normalizedPath(url.pathname);
  } catch { return ''; }
}
function routeFromRecord(record) {
  const path = recordPath(record);
  if (!path) return null;
  return {
    id: `db:${clean(record.source_type,40)}:${clean(record.source_key,200)}`,
    path,
    asset: null,
    kind: clean(record.schema_type,80) || 'WebPage',
    publicationState: 'published',
    changefreq: ['event','product'].includes(record.source_type) ? 'daily' : 'weekly',
    priority: record.source_type === 'site' ? '0.8' : '0.7',
    label: clean(record.title,240),
    title: clean(record.title,240),
    description: clean(record.description,1000) || 'EKODI 공개 정보입니다.',
    image: clean(record.image_url,2048),
    datePublished: clean(record.published_at,80),
    dateModified: clean(record.modified_at,80),
    source: 'public-discovery-registry',
    record,
  };
}
function mergeRoutes(records) {
  const byPath = new Map(DISCOVERY_PUBLIC_ROUTES.map(route => [route.path, route]));
  for (const record of records) {
    const route = routeFromRecord(record);
    if (route) byPath.set(route.path, route);
  }
  return [...byPath.values()].sort((a,b)=>a.path.localeCompare(b.path));
}

export async function fetchPublicDiscoveryRecords(env, { force = false } = {}) {
  const now = Date.now();
  if (!force && memoryCache.expiresAt > now) return memoryCache.records;
  const endpoint = base(env), key = apiKey(env);
  if (!endpoint || !key) return memoryCache.records;
  const url = new URL(endpoint + '/rest/v1/public_discovery_registry');
  url.searchParams.set('select','source_type,source_key,canonical_url,parent_url,title,description,schema_type,language,image_url,published_at,modified_at,public_payload');
  url.searchParams.set('publication_status','eq.published');
  url.searchParams.set('order','modified_at.desc');
  url.searchParams.set('limit','5000');
  try {
    const response = await fetch(url, {
      headers: { apikey: key, accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return memoryCache.records;
    const rows = await response.json();
    const records = Array.isArray(rows) ? rows.filter(item => recordPath(item)) : [];
    memoryCache = { expiresAt: now + CACHE_TTL_MS, records };
    return records;
  } catch {
    return memoryCache.records;
  }
}

function runtimeSitemap(records) {
  const routes = mergeRoutes(records);
  const staticPaths = new Set(DISCOVERY_PUBLIC_ROUTES.map(route => route.path));
  const urls = routes.map(route => {
    const lines = ['  <url>', `    <loc>${xml(canonicalUrl(route.path))}</loc>`];
    if (!staticPaths.has(route.path) && route.dateModified) lines.push(`    <lastmod>${xml(route.dateModified)}</lastmod>`);
    lines.push(`    <changefreq>${xml(route.changefreq || 'weekly')}</changefreq>`);
    lines.push(`    <priority>${xml(route.priority || '0.7')}</priority>`, '  </url>');
    return lines.join('\n');
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
function runtimeLlms(records) {
  const staticText = renderLlmsTxt();
  if (!records.length) return staticText;
  const links = records
    .filter(record => recordPath(record))
    .map(record => `- [${clean(record.title,240)}](${clean(record.canonical_url,2048)}) — ${clean(record.description,1000) || 'EKODI 공개 정보'}`)
    .join('\n');
  return `${staticText.trim()}\n\n## Live Public Registry\n${links}\n`;
}
function registryJson(records) {
  return JSON.stringify({
    schema_version: '1.0',
    policy: 'EKODI-DISCOVERY-001',
    generated_at: new Date().toISOString(),
    canonical_origin: DISCOVERY_ORIGIN,
    count: records.length,
    records,
  }, null, 2) + '\n';
}
function projectionResponse(body, contentType, request) {
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      'x-content-type-options': 'nosniff',
      'x-ekodi-discovery-projection': 'registry-v1',
    },
  });
}

export async function handleRuntimeDiscoveryProjection(request, env) {
  if (!['GET','HEAD'].includes(request.method)) return null;
  const path = normalizedPath(new URL(request.url).pathname);
  if (!['/sitemap.xml','/llms.txt','/.well-known/public-discovery.json'].includes(path)) return null;
  const records = await fetchPublicDiscoveryRecords(env);
  if (path === '/sitemap.xml') return projectionResponse(runtimeSitemap(records), 'application/xml; charset=utf-8', request);
  if (path === '/llms.txt') return projectionResponse(runtimeLlms(records), 'text/plain; charset=utf-8', request);
  return projectionResponse(registryJson(records), 'application/json; charset=utf-8', request);
}

function jsonLdForRecord(record) {
  const url = clean(record.canonical_url,2048);
  const type = clean(record.schema_type,80) || 'WebPage';
  const payload = record.public_payload && typeof record.public_payload === 'object' && !Array.isArray(record.public_payload) ? record.public_payload : {};
  const entity = {
    '@type': type,
    '@id': url + '#entity',
    name: clean(record.title,240),
    description: clean(record.description,1000),
    url,
  };
  if (record.image_url) entity.image = clean(record.image_url,2048);
  if (record.published_at) entity.datePublished = record.published_at;
  if (record.modified_at) entity.dateModified = record.modified_at;
  for (const key of ['startDate','endDate','location','sku','brand','model','address','telephone']) {
    if (payload[key] != null && payload[key] !== '') entity[key] = payload[key];
  }
  if (type === 'Product' && payload.price != null) {
    entity.offers = {
      '@type': 'Offer',
      price: payload.price,
      priceCurrency: payload.priceCurrency || 'KRW',
      availability: payload.availability ? `https://schema.org/${payload.availability === 'available' ? 'InStock' : payload.availability === 'sold_out' ? 'OutOfStock' : 'PreOrder'}` : undefined,
      url,
    };
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type':'Organization', '@id': DISCOVERY_ORIGIN + '/#organization', name:'EKODI', alternateName:'에코디', url:DISCOVERY_ORIGIN + '/' },
      { '@type':'WebSite', '@id': DISCOVERY_ORIGIN + '/#website', url:DISCOVERY_ORIGIN + '/', name:'EKODI', inLanguage:'ko', publisher:{'@id':DISCOVERY_ORIGIN + '/#organization'} },
      { '@type':'WebPage', '@id':url + '#webpage', url, name:entity.name, description:entity.description, inLanguage:record.language || 'ko', isPartOf:{'@id':DISCOVERY_ORIGIN + '/#website'}, about:{'@id':entity['@id']} },
      entity,
    ],
  };
}
function insertHead(source, markup) {
  return source.includes('</head>') ? source.replace('</head>', markup + '\n</head>') : source;
}
function upsert(source, pattern, markup) {
  return pattern.test(source) ? source.replace(pattern, markup) : insertHead(source, markup);
}

export async function decorateRegistryDiscoveryResponse(response, request, env) {
  if (!response || !response.ok || request.method !== 'GET') return response;
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return response;
  const robotsHeader = String(response.headers.get('x-robots-tag') || '').toLowerCase();
  if (robotsHeader.includes('noindex')) return response;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== DISCOVERY_ORIGIN) return response;
  const canonical = DISCOVERY_ORIGIN + (normalizedPath(requestUrl.pathname) === '/' ? '/' : normalizedPath(requestUrl.pathname));
  const records = await fetchPublicDiscoveryRecords(env);
  const record = records.find(item => clean(item.canonical_url,2048).replace(/\/+$/,'') === canonical.replace(/\/+$/,''));
  if (!record) return response;

  let source = await response.text();
  if (!source.includes('</head>') || /<meta\b[^>]*name=(['"])robots\1[^>]*content=(['"])[^'"]*noindex/i.test(source)) return new Response(source,{status:response.status,statusText:response.statusText,headers:response.headers});
  if (source.includes('data-ekodi-discovery=')) return new Response(source,{status:response.status,statusText:response.statusText,headers:response.headers});

  const title = html(record.title);
  const description = html(record.description || 'EKODI 공개 정보입니다.');
  const canonicalEscaped = html(record.canonical_url);
  source = upsert(source, /<link\b(?=[^>]*\brel=(['"])canonical\1)[^>]*>/i, `<link rel="canonical" href="${canonicalEscaped}">`);
  source = upsert(source, /<meta\b(?=[^>]*\bname=(['"])description\1)[^>]*>/i, `<meta name="description" content="${description}">`);
  const head = [
    '<meta name="robots" content="index, follow">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="EKODI">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${canonicalEscaped}">`,
    '<meta name="twitter:card" content="summary">',
    `<script type="application/ld+json" data-ekodi-discovery="registry-v1">${JSON.stringify(jsonLdForRecord(record)).replaceAll('<','\\u003c')}</script>`,
  ].join('\n');
  source = insertHead(source, head);

  const headers = new Headers(response.headers);
  headers.delete('content-length'); headers.delete('content-encoding'); headers.delete('etag');
  headers.set('x-ekodi-discovery-projection','registry-v1');
  return new Response(source,{status:response.status,statusText:response.statusText,headers});
}

export { mergeRoutes, runtimeSitemap, runtimeLlms };
