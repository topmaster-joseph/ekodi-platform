import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { canonicalUrl, DISCOVERY_CRAWLER_POLICY, DISCOVERY_PUBLIC_ROUTES, renderDiscoveryHead, renderLlmsTxt, renderRobotsTxt, renderSitemapXml } from '../discovery-layer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}dist/`;
export const OPS_HEALTH_PATH = '/ops/health.json';
export const EKODI_AI_DISCOVERY_PATH = '/.well-known/ekodi.json';
export const EKODI_AI_DISCOVERY = Object.freeze({
  schema_version: '1.1',
  name: 'EKODI',
  aliases: Object.freeze(['EKODI', '에코디']),
  canonical_origin: 'https://ekodi.kr',
  official_origins: Object.freeze(['https://ekodi.kr']),
  description: 'EKODI is a provider-independent service and AI orchestration platform.',
  discovery: Object.freeze({
    public: true,
    authentication_required_for_mutation: true,
    name_recognition_is_authorization: false,
  }),
  ai: Object.freeze({
    mcp: 'https://ekodi.kr/mcp',
    mcp_transport: 'stateless-streamable-http',
    mcp_protocol_version: '2026-07-28',
    oauth_protected_resource_metadata: 'https://ekodi.kr/.well-known/oauth-protected-resource',
    orchestrator_api: 'https://ekodi.kr/api',
    human_connection_entry: 'https://ekodi.kr/ai',
    documentation: 'https://ekodi.kr/ai',
  }),
  security: Object.freeze({
    canonical_domain: 'ekodi.kr',
    require_oauth_for_private_capabilities: true,
    least_privilege: true,
    orchestrator_is_execution_authority: true,
    external_ai_is_execution_authority: false,
  }),
});

function replaceOrInsert(html, pattern, replacement) {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  if (!html.includes('</head>')) throw new Error('HTML head marker missing for Discovery Layer');
  return html.replace('</head>', `${replacement}\n</head>`);
}
function upsertCanonical(html, canonical) { return replaceOrInsert(html, /<link\b[^>]*\brel=(['"])canonical\1[^>]*>/i, `<link rel="canonical" href="${canonical}">`); }
function upsertDescription(html, description) { return replaceOrInsert(html, /<meta\b[^>]*\bname=(['"])description\1[^>]*>/i, `<meta name="description" content="${description}">`); }

export function allowOpsHealthForRestrictedCrawlers(robots) {
  let outputText = String(robots || '');
  const restricted = [...DISCOVERY_CRAWLER_POLICY.training, ...DISCOVERY_CRAWLER_POLICY.agent];
  for (const crawler of restricted) {
    const denied = `User-agent: ${crawler}\nDisallow: /`;
    const healthOnly = `User-agent: ${crawler}\nAllow: ${OPS_HEALTH_PATH}\nDisallow: /`;
    if (!outputText.includes(denied)) throw new Error(`Restricted crawler policy marker missing: ${crawler}`);
    outputText = outputText.replace(denied, healthOnly);
  }
  return outputText;
}

async function emitStaticPageDiscovery(route) {
  if (!route.asset) return;
  const pagePath = `${output}${route.asset}`;
  let html = await readFile(pagePath, 'utf8');
  html = upsertCanonical(html, canonicalUrl(route.path));
  html = upsertDescription(html, route.description);
  if (!html.includes('data-ekodi-discovery="v2"')) html = html.replace('</head>', `${renderDiscoveryHead(route.path)}\n</head>`);
  await writeFile(pagePath, html);
}

export async function emitDiscoveryAssets() {
  await Promise.all(DISCOVERY_PUBLIC_ROUTES.map(emitStaticPageDiscovery));
  const robotsText = allowOpsHealthForRestrictedCrawlers(renderRobotsTxt());
  const wellKnownDir = `${output}.well-known/`;
  await mkdir(wellKnownDir, { recursive: true });
  await Promise.all([
    writeFile(`${output}robots.txt`, robotsText),
    writeFile(`${output}sitemap.xml`, renderSitemapXml()),
    writeFile(`${output}llms.txt`, renderLlmsTxt()),
    writeFile(`${wellKnownDir}ekodi.json`, `${JSON.stringify(EKODI_AI_DISCOVERY, null, 2)}\n`),
  ]);
  const [robots, sitemap, llms, aiDiscoveryText] = await Promise.all([
    readFile(`${output}robots.txt`, 'utf8'),
    readFile(`${output}sitemap.xml`, 'utf8'),
    readFile(`${output}llms.txt`, 'utf8'),
    readFile(`${wellKnownDir}ekodi.json`, 'utf8'),
  ]);
  if (!robots.includes('Sitemap: https://ekodi.kr/sitemap.xml')) throw new Error('Discovery robots sitemap marker missing');
  if (!robots.includes('User-agent: OAI-SearchBot')) throw new Error('OAI search crawler policy missing');
  if (!robots.includes(`User-agent: GPTBot\nAllow: ${OPS_HEALTH_PATH}\nDisallow: /`)) throw new Error('GPTBot health-only restriction missing');
  if (!robots.includes(`User-agent: ChatGPT-User\nAllow: ${OPS_HEALTH_PATH}\nDisallow: /`)) throw new Error('ChatGPT-User health-only restriction missing');
  if (sitemap.includes('/admin') || sitemap.includes('/api/') || sitemap.includes('/preview/dev')) throw new Error('Private surface leaked into sitemap');
  if (!llms.includes('Canonical site: https://ekodi.kr/')) throw new Error('LLM discovery canonical marker missing');
  const aiDiscovery = JSON.parse(aiDiscoveryText);
  if (aiDiscovery.canonical_origin !== 'https://ekodi.kr') throw new Error('EKODI AI discovery canonical origin missing');
  if (!aiDiscovery.aliases?.includes('EKODI') || !aiDiscovery.aliases?.includes('에코디')) throw new Error('EKODI AI discovery aliases missing');
  if (aiDiscovery.ai?.mcp !== 'https://ekodi.kr/mcp') throw new Error('EKODI canonical MCP discovery endpoint missing');
  if (aiDiscovery.security?.orchestrator_is_execution_authority !== true || aiDiscovery.discovery?.name_recognition_is_authorization !== false) throw new Error('EKODI AI discovery security boundary invalid');
  for (const route of DISCOVERY_PUBLIC_ROUTES.filter(item => item.asset)) {
    const html = await readFile(`${output}${route.asset}`, 'utf8'); const canonical = canonicalUrl(route.path);
    if (!html.includes(`<link rel="canonical" href="${canonical}">`)) throw new Error(`Canonical marker missing: ${route.path}`);
    if (!html.includes(`property="og:url" content="${canonical}"`)) throw new Error(`Open Graph canonical missing: ${route.path}`);
    if (!html.includes(`data-ekodi-discovery="v2" data-ekodi-path="${route.path}"`)) throw new Error(`Structured discovery metadata missing: ${route.path}`);
  }
  console.log(`Built EKODI Discovery Layer v2 for ${DISCOVERY_PUBLIC_ROUTES.length} public routes plus ${EKODI_AI_DISCOVERY_PATH}, health-only crawler access at ${OPS_HEALTH_PATH}: robots.txt, sitemap.xml, llms.txt, canonical, Open Graph, Twitter and JSON-LD`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await emitDiscoveryAssets();
