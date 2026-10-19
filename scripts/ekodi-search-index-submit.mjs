import { chromium } from 'playwright';
import { EKODI_INDEXNOW_KEY } from '../platform-indexnow.js';
import { SEONAMMEDI_SITEMAP_PATHS } from '../seonammedi-domain-gateway.js';

// Submit the canonical customer-domain URLs. The key file is served by the
// domain gateway at https://seonammedi.kr/<key>.txt, as IndexNow requires.
const key = EKODI_INDEXNOW_KEY;
const pageUrls = SEONAMMEDI_SITEMAP_PATHS.map(path => 'https://seonammedi.kr' + path);
const targets = [
  ['naver', 'https://searchadvisor.naver.com/indexnow'],
  ['bing', 'https://www.bing.com/indexnow'],
  ['indexnow', 'https://api.indexnow.org/indexnow'],
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const results = [];
try {
  for (const pageUrl of pageUrls) {
    for (const [name, base] of targets) {
      const url = new URL(base);
      url.searchParams.set('url', pageUrl);
      url.searchParams.set('key', key);
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      const status = response?.status?.() ?? 0;
      results.push({ name, pageUrl, status, ok: status === 200 || status === 202, endpoint: base });
    }
  }
} finally {
  await context.close();
  await browser.close();
}
console.log(JSON.stringify({ ok: results.every(r => r.ok), pageUrls, results }, null, 2));
if (!results.every(r => r.ok)) process.exit(1);
