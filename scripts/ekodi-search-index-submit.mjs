import { chromium } from 'playwright';

const key = '71e02f2845cadeb6112d86368c1ffc48e4b8ec31';
const pageUrl = 'https://ekodi.kr/seonammedi/';
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
  for (const [name, base] of targets) {
    const url = new URL(base);
    url.searchParams.set('url', pageUrl);
    url.searchParams.set('key', key);
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    const status = response?.status?.() ?? 0;
    results.push({ name, status, ok: status === 200 || status === 202, endpoint: base });
  }
} finally {
  await context.close();
  await browser.close();
}
console.log(JSON.stringify({ ok: results.every(r => r.ok), pageUrl, results }, null, 2));
if (!results.every(r => r.ok)) process.exit(1);
