import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  renderDiscoveryHead,
  renderLlmsTxt,
  renderRobotsTxt,
  renderSitemapXml,
} from '../discovery-layer.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}dist/`;

export async function emitDiscoveryAssets() {
  const homepagePath = `${output}index.html`;
  let homepage = await readFile(homepagePath, 'utf8');
  const marker = 'data-ekodi-discovery="v1"';

  if (!homepage.includes(marker)) {
    if (!homepage.includes('</head>')) throw new Error('Homepage head marker missing for Discovery Layer');
    homepage = homepage.replace('</head>', `${renderDiscoveryHead()}\n</head>`);
    await writeFile(homepagePath, homepage);
  }

  await Promise.all([
    writeFile(`${output}robots.txt`, renderRobotsTxt()),
    writeFile(`${output}sitemap.xml`, renderSitemapXml()),
    writeFile(`${output}llms.txt`, renderLlmsTxt()),
  ]);

  const [robots, sitemap, llms, builtHomepage] = await Promise.all([
    readFile(`${output}robots.txt`, 'utf8'),
    readFile(`${output}sitemap.xml`, 'utf8'),
    readFile(`${output}llms.txt`, 'utf8'),
    readFile(homepagePath, 'utf8'),
  ]);

  if (!robots.includes('Sitemap: https://ekodi.kr/sitemap.xml')) throw new Error('Discovery robots sitemap marker missing');
  if (!robots.includes('User-agent: OAI-SearchBot')) throw new Error('OAI search crawler policy missing');
  if (!robots.includes('User-agent: GPTBot\nDisallow: /')) throw new Error('GPTBot training restriction missing');
  if (!sitemap.includes('<loc>https://ekodi.kr/</loc>')) throw new Error('Discovery sitemap canonical root missing');
  if (sitemap.includes('/admin') || sitemap.includes('/api/')) throw new Error('Private surface leaked into sitemap');
  if (!llms.includes('Canonical site: https://ekodi.kr/')) throw new Error('LLM discovery canonical marker missing');
  if (!builtHomepage.includes(marker) || !builtHomepage.includes('application/ld+json')) throw new Error('Structured discovery metadata missing from homepage');

  console.log('Built EKODI Discovery Layer: robots.txt, sitemap.xml, llms.txt, Open Graph and JSON-LD');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await emitDiscoveryAssets();
}
