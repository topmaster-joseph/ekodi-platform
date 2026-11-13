import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storeGatewayPage, STORE_GUIDE_PATH, STORE_GUIDE_ENTRIES } from '../store-gateway-page.js';
import { RESERVED_WORKSPACE_SLUGS, isWorkspaceSlug } from '../workspace-route-policy.js';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('public guide describes three independent sites, BBQ first, and never mixes admin or order state',async()=>{
  assert.equal(STORE_GUIDE_PATH,'/cmpmyi');
  assert.deepEqual(STORE_GUIDE_ENTRIES.map(s=>s.path),['/bbqcg','/pizzamaru','/yogurt']);
  const response=storeGatewayPage(new Request('https://ekodi.kr/cmpmyi?utm_source=bookmark'));
  const body=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'cmpmyi-three-store-guide');
  assert.equal(response.headers.get('x-robots-tag'),'index,follow');
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
  assert.match(body,/data-store-guide="three-independent-stores"/);
  assert.match(body,/rel="canonical" href="https:\/\/ekodi.kr\/cmpmyi"/);
  assert.match(body,/BBQ 무안청계점/);
  assert.match(body,/피자마루 목포대점/);
  assert.match(body,/요거트퍼플 목포대점/);
  for(const route of ['/bbqcg','/pizzamaru','/yogurt']){
    assert.match(body,new RegExp('href="'+route+'"'),route);
  }
  assert.ok(body.indexOf('BBQ 무안청계점')<body.indexOf('피자마루 목포대점'));
  assert.doesNotMatch(body,/자담치킨|href="\/jadam"/);
  assert.doesNotMatch(body,/api\/|\/admin\/|POS|결제하기/);
  assert.match(body,/tel:0614538295/);
});

test('guide HEAD has no body and independent mobile layout',async()=>{
  const response=storeGatewayPage(new Request('https://ekodi.kr/cmpmyi',{method:'HEAD'}));
  assert.equal(response.status,200);
  assert.equal(await response.text(),'');
  const html=await (await storeGatewayPage(new Request('https://ekodi.kr/cmpmyi'))).text();
  assert.match(html,/@media\(max-width:580px\)/);
  assert.match(html,/grid-template-columns:1fr/);
  assert.match(html,/min-height:44px/);
});

test('compatibility /stores redirects to guide while old protected admin and independent sites remain',async()=>{
  const [router,stage,prod,discovery,manifest]=await Promise.all([
    read('platform-router-entry-worker.js'),read('.github/workflows/stage-shared-site-shell.yml'),
    read('.github/workflows/deploy-site-core.yml'),read('discovery-layer.js'),
    read('deploy/manifests/shared-site.worker.json')
  ]);
  for(const slug of ['cmpmyi','stores']){assert.ok(RESERVED_WORKSPACE_SLUGS.has(slug));assert.equal(isWorkspaceSlug(slug),false)}
  assert.ok(router.includes("import { storeGatewayPage } from './store-gateway-page.js'"));
  assert.ok(router.includes('STORE_GATEWAY_PATHS.has(url.pathname))return storeGatewayPage(request)'));
  assert.ok(router.includes('legacyStoreGatewayRedirect(request,env)'));
  assert.ok(router.includes('if(resolvedHost(request,env)!==PUBLIC_HOST'));
  assert.ok(router.includes("target.pathname=/^\\/stores\\/?$/i.test(url.pathname)?'/cmpmyi'"));
  assert.ok(router.includes("url.pathname==='/cmpmyi/admin'"));
  assert.ok(router.includes("url.pathname==='/cmpmyi/admin/agent'"));
  for(const workflow of [stage,prod]){
    assert.ok(workflow.includes('store-gateway-page.js'));
    assert.ok(workflow.includes('test/store-public-gateway.test.mjs'));
    assert.ok(workflow.includes('cmpmyi-three-store-guide'));
  }
  for(const path of ['/cmpmyi','/bbqcg','/pizzamaru','/yogurt'])assert.ok(discovery.includes(`path: '${path}'`),path);
  assert.ok(manifest.includes('cmpmyi-three-store-guide'));
  assert.ok(!manifest.includes('bbqcg-former-store-gateway'));
  assert.ok(!discovery.includes("path: '/stores'"));
});
