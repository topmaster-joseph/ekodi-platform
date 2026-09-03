import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const router=fs.readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.site.toml',import.meta.url),'utf8');
const tradeWorker=fs.readFileSync(new URL('../trade-worker.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../trade/app.js',import.meta.url),'utf8');

test('EKODIBIZ trade surface routes through shared Trade service binding',()=>{
  assert.match(router,/EKODIBIZ_TRADE_PREFIX='\/ekodibiz\/trade'/);
  assert.match(router,/env\.TRADE\.fetch/);
  assert.match(router,/x-ekodi-trade-tenant-key','ekodi-biz'/);
  assert.match(wrangler,/binding = "TRADE"[\s\S]*service = "ekodi-trade"/);
  assert.match(wrangler,/\/ekodibiz\/trade\*/);
});

test('fixed business surface exposes and enforces its tenant slug',()=>{
  assert.match(tradeWorker,/surfaceTenantKey/);
  assert.match(app,/SURFACE_TENANT_KEY/);
  assert.match(app,/tenant_slug\|\|''/);
  assert.match(app,/select\.disabled=true/);
});
