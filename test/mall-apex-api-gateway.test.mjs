import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const router = await readFile(new URL('../platform-router-entry-worker.js', import.meta.url),'utf8');
const prod = await readFile(new URL('../wrangler.site.toml', import.meta.url),'utf8');
const staging = await readFile(new URL('../wrangler.site-staging.toml', import.meta.url),'utf8');
const admin = await readFile(new URL('../workspace-admin-page.js', import.meta.url),'utf8');

test('Mall API is exposed only through the canonical apex path and private binding',()=>{
  assert.match(router,/MALL_API_APEX_PREFIX='\/ekodimall\/api'/);
  assert.match(router,/env\?\.MALL_API\?\.fetch/);
  assert.match(router,/x-ekodi-mall-api-gateway','service-binding-v1/);
  assert.match(router,/x-ekodi-canonical-path','\/ekodimall\/api/);
  assert.match(prod,/binding = "MALL_API"[\s\S]*service = "ekodi-mall-api"/);
  assert.match(staging,/binding = "MALL_API"[\s\S]*service = "ekodi-mall-api-staging"/);
});

test('Amazon admin uses same-origin apex API and introduces no Mall API subdomain',()=>{
  assert.match(admin,/fetch\('\/ekodimall\/api\/amazon\/status'/);
  assert.match(admin,/fetch\('\/ekodimall\/api\/amazon\/cost-policy'/);
  assert.match(admin,/fetch\('\/ekodimall\/api\/amazon\/approvals'/);
  assert.doesNotMatch(admin,/mall-api\.ekodi\.kr/);
});
