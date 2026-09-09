import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storeGatewayPage, STORES } from '../store-gateway-page.js';
import { RESERVED_WORKSPACE_SLUGS, isWorkspaceSlug } from '../workspace-route-policy.js';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('cmpmyi is the public three-store user page with canonical EKODI routes',async()=>{
  const response=storeGatewayPage(); const html=await response.text();
  assert.equal(response.status,200); assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-user-page');
  assert.match(html,/THREE STORES .* ONE GATE/); assert.match(html,/https:\/\/ekodi\.kr\/cmpmyi/);
  assert.ok(!html.includes('https://ekodi.kr/stores'));
  assert.deepEqual(STORES.map(store=>store.slug),['jadam','pizzamaru','yogurt']);
  for(const slug of ['jadam','pizzamaru','yogurt'])assert.ok(html.includes(`href="/${slug}"`),slug);
  for(const store of STORES)assert.ok(html.includes(store.name),store.name);
  assert.ok(!html.includes('pages.dev')); assert.ok(!html.includes('.ai.ekodi.kr'));
});

test('cmpmyi is canonical, stores redirects compatibly, and release verification guards both',async()=>{
  const [router,stage,prod,discovery]=await Promise.all([read('platform-router-entry-worker.js'),read('.github/workflows/stage-shared-site-shell.yml'),read('.github/workflows/deploy-site-core.yml'),read('discovery-layer.js')]);
  for(const slug of ['cmpmyi','stores']){assert.ok(RESERVED_WORKSPACE_SLUGS.has(slug));assert.equal(isWorkspaceSlug(slug),false);}
  assert.ok(router.includes("import { storeGatewayPage } from './store-gateway-page.js'"));
  assert.ok(router.includes('CMPMYI_USER_PATHS.has(url.pathname)'));
  assert.ok(router.includes('LEGACY_STORE_GATEWAY_PATHS.has(url.pathname)'));
  assert.ok(router.includes("new URL('https://ekodi.kr/cmpmyi')"));
  assert.ok(router.includes('target.search=url.search'));
  for(const workflow of [stage,prod]){assert.ok(workflow.includes('store-gateway-page.js'));assert.ok(workflow.includes('test/store-public-gateway.test.mjs'));}
  assert.ok(stage.includes("verify_public_path '/cmpmyi'"));
  assert.ok(stage.includes('x-ekodi-route: cmpmyi-user-page'));
  assert.ok(stage.includes("verify_redirect_path '/stores' 'https://ekodi.kr/cmpmyi'"));
  assert.ok(prod.includes("'https://ekodi.kr/cmpmyi'"));
  assert.ok(prod.includes("'https://ekodi.kr/stores'"));
  assert.ok(prod.includes('location: https://ekodi.kr/cmpmyi'));
  assert.ok(prod.includes('x-ekodi-route: cmpmyi-user-page'));
  for(const path of ['/cmpmyi','/jadam','/pizzamaru','/yogurt'])assert.ok(discovery.includes(`path: '${path}'`),path);
  assert.ok(!discovery.includes("path: '/stores'"));
});