import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Digital Square route is Worker-first without increasing 100-pattern limit',async()=>{
  const config=await readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  const patterns=JSON.parse(config.match(/run_worker_first\s*=\s*(\[[^\]]*\])/s)[1]);
  assert.ok(patterns.length<=100);
  assert.ok(patterns.includes('/promotion*'));
  assert.ok(patterns.includes('/ai'));
  assert.ok(patterns.includes('/ai/*'));
  assert.ok(patterns.includes('/auth'));
  assert.ok(patterns.includes('/auth/*'));
  assert.ok(patterns.includes('!/admin/*.js'));
  assert.ok(patterns.includes('!/admin/*.css'));
  assert.ok(!patterns.includes('!/admin/*.map'));
});
test('Digital Square stays on existing shared shell public route and discovery',async()=>{
  const [site,discovery]=await Promise.all([
    readFile(new URL('../site-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../discovery-layer.js',import.meta.url),'utf8')
  ]);
  assert.match(site,/url.pathname === '\/promotion'/);
  assert.match(site,/injectEkodiShell\(secured, 'ekodi', 'public'\)/);
  assert.match(discovery,/path: '\/promotion', asset: 'promotion.html'/);
});
