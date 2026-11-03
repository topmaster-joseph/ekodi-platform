import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('promotion path reaches canonical Shared Site Worker before static assets', async () => {
  const wrangler = await readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
  const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../discovery-layer.js', import.meta.url), 'utf8');
  assert.match(wrangler, /"\/promotion\*"/);
  assert.match(siteWorker, /url.pathname === '\/promotion'/);
  assert.match(siteWorker, /injectEkodiShell\(secured, 'ekodi', 'public'\)/);
  assert.match(routes, /path: '\/promotion', asset: 'promotion.html'/);
});
