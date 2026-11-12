import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storeGatewayPage, BBQ_PUBLIC_PATH } from '../store-gateway-page.js';
import { RESERVED_WORKSPACE_SLUGS, isWorkspaceSlug } from '../workspace-route-policy.js';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('old public three-store gateway becomes BBQ-only canonical handoff',()=>{
  assert.equal(BBQ_PUBLIC_PATH,'/bbqcg');
  const response=storeGatewayPage(new Request('https://ekodi.kr/cmpmyi?utm_source=bookmark'));
  assert.equal(response.status,308);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/bbqcg?utm_source=bookmark');
  assert.equal(response.headers.get('x-ekodi-route'),'bbqcg-former-store-gateway');
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  assert.equal(response.body,null);
});

test('compatibility URLs hand off to BBQ without touching protected admin or store-specific paths',async()=>{
  const [router,stage,prod,discovery,manifest]=await Promise.all([
    read('platform-router-entry-worker.js'),read('.github/workflows/stage-shared-site-shell.yml'),
    read('.github/workflows/deploy-site-core.yml'),read('discovery-layer.js'),
    read('deploy/manifests/shared-site.worker.json'),
  ]);
  for(const slug of ['cmpmyi','stores']){assert.ok(RESERVED_WORKSPACE_SLUGS.has(slug));assert.equal(isWorkspaceSlug(slug),false)}
  assert.ok(router.includes("import { storeGatewayPage } from './store-gateway-page.js'"));
  assert.ok(router.includes('STORE_GATEWAY_PATHS.has(url.pathname))return storeGatewayPage(request)'));
  assert.ok(router.includes('legacyStoreGatewayRedirect(request)'));
  assert.ok(router.includes("target.pathname=/^\\/stores\\/?$/i.test(url.pathname)?'/bbqcg'"));
  assert.ok(router.includes("url.pathname==='/cmpmyi/admin'"));
  assert.ok(router.includes("url.pathname==='/cmpmyi/admin/agent'"));
  for(const workflow of [stage,prod]){
    assert.ok(workflow.includes('store-gateway-page.js'));
    assert.ok(workflow.includes('test/store-public-gateway.test.mjs'));
    assert.ok(workflow.includes('https://ekodi.kr/bbqcg'));
  }
  for(const path of ['/bbqcg','/pizzamaru','/yogurt'])assert.ok(discovery.includes(`path: '${path}'`),path);
  assert.ok(!discovery.includes("path: '/cmpmyi'"));
  assert.ok(manifest.includes('bbqcg-former-store-gateway'));
  assert.ok(!manifest.includes('THREE STORES · ONE GATE'));
  assert.ok(!discovery.includes("path: '/stores'"));
});
