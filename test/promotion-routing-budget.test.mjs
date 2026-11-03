import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('promotion Worker-first route stays within Cloudflare 100-pattern budget', async () => {
  const wrangler=await readFile(new URL('../wrangler.site.toml', import.meta.url),'utf8');
  const paths=JSON.parse(wrangler.match(/run_worker_first\s*=\s*(\[[^\]]*\])/s)[1]);
  assert.ok(paths.length<=100);
  assert.ok(paths.includes('/promotion*'));
  assert.ok(paths.includes('/ai*'));
  assert.equal(paths.includes('/ai'),false);
  assert.equal(paths.includes('/ai/*'),false);
});
test('Worker-first promotion handler preserves shared shell and public metadata', async () => {
  const [worker,discovery]=await Promise.all([
    readFile(new URL('../site-worker.js', import.meta.url),'utf8'),
    readFile(new URL('../discovery-layer.js', import.meta.url),'utf8')
  ]);
  assert.match(worker,/url.pathname === '\/promotion'/);
  assert.match(worker,/injectEkodiShell\(secured, 'ekodi', 'public'\)/);
  assert.match(discovery,/path: '\/promotion', asset: 'promotion.html'/);
});
