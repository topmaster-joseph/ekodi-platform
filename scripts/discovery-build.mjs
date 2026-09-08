import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { canonicalUrl, DISCOVERY_PUBLIC_ROUTES, renderDiscoveryHead, renderLlmsTxt, renderRobotsTxt, renderSitemapXml } from '../discovery-layer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}dist/`;

function replaceOrInsert(html, pattern, replacement) {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  if (!html.includes('</head>')) throw new Error('HTML head marker missing for Discovery Layer');
  return html.replace('</head>', `${replacement}\n</head>`);
}
function upsertCanonical(html, canonical) { return replaceOrInsert(html, /<link\b[^>]*\brel=(['"])canonical\1[^>]*>/i, `<link rel="canonical" href="${canonical}">`); }
function upsertDescription(html, description) { return replaceOrInsert(html, /<meta\b[^>]*\bname=(['"])description\1[^>]*>/i, `<meta name="description" content="${description}">`); }

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
  await Promise.all([writeFile(`${output}robots.txt`, renderRobotsTxt()), writeFile(`${output}sitemap.xml`, renderSitemapXml()), writeFile(`${output}llms.txt`, renderLlmsTxt())]);
  const [robots, sitemap, llms] = await Promise.all([readFile(`${output}robots.txt`, 'utf8'), readFile(`${output}sitemap.xml`, 'utf8'), readFile(`${output}llms.txt`, 'utf8')]);
  if (!robots.includes('Sitemap: https://ekodi.kr/sitemap.xml')) throw new Error('Discovery robots sitemap marker missing');
  if (!robots.includes('User-agent: OAI-SearchBot')) throw new Error('OAI search crawler policy missing');
  if (!robots.includes('User-agent: GPTBot\nDisallow: /')) throw new Error('GPTBot training restriction missing');
  if (sitemap.includes('/admin') || sitemap.includes('/api/') || sitemap.includes('/preview/dev')) throw new Error('Private surface leaked into sitemap');
  if (!llms.includes('Canonical site: https://ekodi.kr/')) throw new Error('LLM discovery canonical marker missing');
  for (const route of DISCOVERY_PUBLIC_ROUTES.filter(item => item.asset)) {
    const html = await readFile(`${output}${route.asset}`, 'utf8'); const canonical = canonicalUrl(route.path);
    if (!html.includes(`<link rel="canonical" href="${canonical}">`)) throw new Error(`Canonical marker missing: ${route.path}`);
    if (!html.includes(`property="og:url" content="${canonical}"`)) throw new Error(`Open Graph canonical missing: ${route.path}`);
    if (!html.includes(`data-ekodi-discovery="v2" data-ekodi-path="${route.path}"`)) throw new Error(`Structured discovery metadata missing: ${route.path}`);
  }
  console.log(`Built EKODI Discovery Layer v2 for ${DISCOVERY_PUBLIC_ROUTES.length} public routes: robots.txt, sitemap.xml, llms.txt, canonical, Open Graph, Twitter and JSON-LD`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await emitDiscoveryAssets();
