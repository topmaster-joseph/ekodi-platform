// EKODI Growth OS Phase 2 — bounded public technical discovery verification.
// A tenant's canonical URL is selected exclusively from the platform's public
// discovery allowlist; no client URL, redirect, credentials, or private pages.
import { DISCOVERY_ORIGIN, DISCOVERY_PRIVATE_PREFIXES, canonicalUrl, publicDiscoveryRoute } from './discovery-layer.js';

const MAX_BYTES = 192 * 1024;
const TIMEOUT_MS = 6000;
const isPrivate = path => DISCOVERY_PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix));
const stamp = () => new Date().toISOString();

export function discoveryTargetForSubject(subject) {
  if (subject?.type !== 'tenant') return null;
  const slug = String(subject.key || '');
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const path = '/' + slug;
  if (isPrivate(path)) return null;
  const route = publicDiscoveryRoute(path);
  return route ? { path, url: canonicalUrl(route.path), source: 'DISCOVERY_PUBLIC_ROUTES' } : null;
}

function tagAttr(tag, name) {
  const match = new RegExp('\\b' + name + '\\s*=\\s*(["\\\'])(.*?)\\1', 'i').exec(tag || '');
  return match?.[2]?.trim() || '';
}
function firstTag(html, tagName, attribute, value) {
  const expr = new RegExp('<' + tagName + '\\b[^>]*>', 'gi');
  return [...String(html).matchAll(expr)].map(item => item[0])
    .find(tag => tagAttr(tag, attribute).toLowerCase() === value.toLowerCase()) || '';
}
function robotsGroup(robots, bot) {
  return String(robots).split(/\r?\n\s*\r?\n/).find(group =>
    group.split(/\r?\n/).some(line => line.trim().toLowerCase() === ('user-agent: ' + bot).toLowerCase())) || '';
}
function groupBlocked(group) { return /^disallow:\s*\/\s*$/im.test(group); }
function groupAllowed(group) { return Boolean(group) && !groupBlocked(group) && /^allow:\s*\//im.test(group); }
function publicText(html) {
  const head = String(html).match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
  const canonical = tagAttr(firstTag(head, 'link', 'rel', 'canonical'), 'href');
  const description = tagAttr(firstTag(head, 'meta', 'name', 'description'), 'content');
  const robots = tagAttr(firstTag(head, 'meta', 'name', 'robots'), 'content');
  const ogTitle = tagAttr(firstTag(head, 'meta', 'property', 'og:title'), 'content');
  const jsonld = /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>/i.test(head);
  return {canonical,hasDescription:Boolean(description),hasOgTitle:Boolean(ogTitle),hasStructuredData:jsonld,noindex:/\bnoindex\b/i.test(robots)};
}
function issue(id, severity = 'warning') { return {id,severity}; }

// Pure, independently testable audit; fields are prerequisites, not ranking,
// AI citations, search impressions, or evidence of crawl/index acceptance.
export function analyzeGrowthDiscoveryEvidence({target, page, robots, sitemap, verifiedAt = stamp()}) {
  const head = page.status === 200 ? publicText(page.text) : {canonical:'',hasDescription:false,hasOgTitle:false,hasStructuredData:false,noindex:false};
  const xRobots = String(page.headers?.get?.('x-robots-tag') || '');
  const wanted = target.url.replace(/\/$/, '');
  const canonicalMatches = Boolean(head.canonical) && head.canonical.replace(/\/$/, '') === wanted;
  const indexedInSitemap = new RegExp('<loc>\\s*' + target.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\/?\\s*<\\/loc>', 'i').test(sitemap.text || '');
  const searchBotAllowed = groupAllowed(robotsGroup(robots.text, 'OAI-SearchBot')) &&
    groupAllowed(robotsGroup(robots.text, 'Googlebot'));
  const trainingBotRestricted = groupBlocked(robotsGroup(robots.text,'GPTBot'));
  const checks = {
    http200: page.status === 200,
    robotsReachable: robots.status === 200,
    sitemapReachable: sitemap.status === 200,
    answerAndSearchBotsAllowed: searchBotAllowed,
    trainingBotRestricted,
    canonicalMatches, hasDescription:head.hasDescription,
    hasOgTitle:head.hasOgTitle, hasStructuredData:head.hasStructuredData,
    noindex:head.noindex || /\bnoindex\b/i.test(xRobots),
    listedInSitemap:indexedInSitemap,
  };
  const findings = [];
  if (!checks.http200) findings.push(issue('public_page_http_status','error'));
  if (!checks.robotsReachable) findings.push(issue('robots_unavailable','error'));
  if (!checks.sitemapReachable) findings.push(issue('sitemap_unavailable','error'));
  if (!checks.answerAndSearchBotsAllowed) findings.push(issue('search_or_answer_bot_policy','warning'));
  if (!checks.trainingBotRestricted) findings.push(issue('training_bot_policy_check','warning'));
  if (!checks.canonicalMatches) findings.push(issue('canonical_missing_or_mismatch','error'));
  if (!checks.hasDescription) findings.push(issue('description_missing'));
  if (!checks.hasOgTitle) findings.push(issue('open_graph_title_missing'));
  if (!checks.hasStructuredData) findings.push(issue('jsonld_missing'));
  if (checks.noindex) findings.push(issue('index_blocked','error'));
  if (!checks.listedInSitemap) findings.push(issue('not_listed_in_root_sitemap'));
  return {
    ok:true, type:'technical_public_discovery', status:findings.length ? 'issues_found' : 'checks_passed',
    verifiedAt, target, checks, findings,
    evidence:{source:'live_public_http', noCredentialsForwarded:true, maxResponseBytes:MAX_BYTES},
    observations:{searchImpressions:null,aiCitations:null,organicConversions:null},
    limitations:'Technical readiness only. Search ranking, AI citations, actual indexing and conversion are unverified.',
  };
}

async function boundedRead(response) {
  const statedLength = Number(response.headers?.get?.('content-length') || 0);
  if (statedLength > MAX_BYTES) throw new Error('RESPONSE_TOO_LARGE');
  if (!response.body?.getReader) {
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new Error('RESPONSE_TOO_LARGE');
    return body;
  }
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { if (total > MAX_BYTES) await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk,offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(result);
}
async function publicFetch(fetchImpl, path) {
  const url = DISCOVERY_ORIGIN + path;
  const response = await fetchImpl(url, {
    method:'GET', redirect:'manual',
    headers:{accept: path === '/robots.txt' ? 'text/plain' : path === '/sitemap.xml' ? 'application/xml' : 'text/html'},
    signal:AbortSignal.timeout(TIMEOUT_MS),
  });
  return {status:response.status,headers:response.headers,text:await boundedRead(response)};
}
export async function verifyGrowthDiscovery(subject, {fetchImpl = fetch, now = stamp} = {}) {
  const target = discoveryTargetForSubject(subject);
  if (!target) return {
    ok:true,type:'technical_public_discovery',status:'public_route_not_registered',
    verifiedAt:null,target:null,checks:null,findings:[],
    observations:{searchImpressions:null,aiCitations:null,organicConversions:null},
    limitations:'Only explicitly allowlisted public tenant routes are eligible; no site was fetched.',
  };
  try {
    // Fixed-origin, no-redirect, public-only requests. Never forward auth tokens.
    const [page,robots,sitemap] = await Promise.all([
      publicFetch(fetchImpl,target.path),
      publicFetch(fetchImpl,'/robots.txt'),
      publicFetch(fetchImpl,'/sitemap.xml'),
    ]);
    return analyzeGrowthDiscoveryEvidence({target,page,robots,sitemap,verifiedAt:now()});
  } catch (error) {
    return {
      ok:false,type:'technical_public_discovery',status:'verification_unavailable',
      verifiedAt:now(),target,checks:null,findings:[issue('public_read_unavailable','error')],
      errorCode:error?.message === 'RESPONSE_TOO_LARGE' ? 'RESPONSE_TOO_LARGE' : 'UPSTREAM_UNAVAILABLE',
      observations:{searchImpressions:null,aiCitations:null,organicConversions:null},
      limitations:'Cannot verify the public page. No site ranking or traffic observation inferred.',
    };
  }
}
