import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localRegionBySlug} from '../local-region-registry.js';
import {isPublicDiscoveryPath, buildEkodiPublicRegistry} from '../public-discovery-registry.js';
import {
  CHEONGGYE_PUBLICATION_HOLD,
  isCheonggyeUnreleasedPublicPath,
  isCheonggyeUnreleasedPublicApi,
  cheonggyePublicHoldResponse,
  cheonggyePublicApiHoldResponse,
} from '../region-publication-hold.js';

const root='https://ekodi.kr';
const publicPaths=['/cheonggye','/cheonggye/','/cgpass','/cgpass/','/cheonggyepass','/cheonggye/pass','/cheonggye/region-tabs-ui.js','/cheonggye/local-region-module-public.js','/cheonggye/local-region-forest-public.js',...localRegionBySlug('cheonggye').modules.map(x=>x.publicPath)];
const adminPaths=['/cgma','/cgma/','/cgma/admin','/cheonggye/admin','/cheonggye/admin/access','/cheonggye/admin/directory','/cheonggye/admin/pass','/cgpass/admin','/cgpass/admin/vendors','/cheonggyepass/admin','/cheonggye/local-region-admin-auth.js','/cheonggye/local-region-module-admin.js','/cheonggye/local-region-operations-admin.js','/cheonggye/local-region-forest-admin.js','/cheonggye/cheonggyepass-vendor-intake-ui.js'];

test('owner-approved release is mandatory: public regional pages are unavailable',async()=>{
  assert.equal(CHEONGGYE_PUBLICATION_HOLD,true);
  for(const path of publicPaths){
    assert.equal(isCheonggyeUnreleasedPublicPath(path),true,path);
    const response=cheonggyePublicHoldResponse(new Request(root+path));
    assert.equal(response?.status,404,path);
    assert.equal(response.headers.get('x-ekodi-route'),'regional-private-hold');
    assert.equal(response.headers.get('x-ekodi-region-publication'),'private-owner-release-required');
    assert.match(response.headers.get('cache-control'),/no-store/);
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
    const body=await response.text();
    assert.match(body,/서비스 비공개/);
    assert.doesNotMatch(body,/지역 공개정보|role="tablist"|청계패스 운영관리/);
    const head=cheonggyePublicHoldResponse(new Request(root+path,{method:'HEAD'}));
    assert.equal(head.status,404);
    assert.equal(await head.text(),'');
    assert.equal(isPublicDiscoveryPath(path),false,path);
  }
});

test('CGMA and region/pass operator administration remain separated and routable',()=>{
  for(const path of adminPaths){
    assert.equal(isCheonggyeUnreleasedPublicPath(path),false,path);
    assert.equal(cheonggyePublicHoldResponse(new Request(root+path)),null,path);
  }
  assert.equal(isPublicDiscoveryPath('/cgma'),true);
  assert.equal(isCheonggyeUnreleasedPublicPath('/cgpass-other'),false);
  assert.equal(isCheonggyeUnreleasedPublicPath('/cheonggyepassion'),false);
  assert.equal(isCheonggyeUnreleasedPublicPath('/cheonggyeother'),false);
});

test('public regional ledger GET API is withheld while authenticated admin API keeps normal guards',async()=>{
  for(const path of ['/api/local-operations/cheonggye/modules/directory','/api/local-operations/cheonggye/modules/commerce','/api/local-operations/cheonggye/projects/forest']){
    assert.equal(isCheonggyeUnreleasedPublicApi(path,'GET'),true);
    const response=cheonggyePublicApiHoldResponse(new Request(root+path));
    assert.equal(response?.status,404);
    assert.equal((await response.json()).code,'REGIONAL_PUBLICATION_PRIVATE');
  }
  for(const [path,method] of [
    ['/api/local-operations/cheonggye/modules/directory/admin','GET'],
    ['/api/local-operations/cheonggye/modules/directory/actions','POST'],
    ['/api/local-operations/cheonggye/projects/forest/admin','GET'],
    ['/api/local-operations/cheonggye/operators','GET'],
    ['/api/local-operations/cheonggye/modules/directory','POST'],
    ['/api/local-operations/another/modules/directory','GET']
  ]){
    assert.equal(isCheonggyeUnreleasedPublicApi(path,method),false,path);
  }
});

test('router enforces hold before site publication, redirects, and regional page rendering',async()=>{
  const router=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  const controller=await readFile(new URL('../local-region-operations-control.js',import.meta.url),'utf8');
  const hold=router.indexOf('const regionPrivateHold=cheonggyePublicHoldResponse(request)');
  assert.ok(hold>0);
  assert.ok(hold<router.indexOf('canonicalTrackingQueryRedirect(request)'));
  assert.ok(hold<router.indexOf('await sitePublicationGuard(request,env)'));
  assert.match(controller,/cheonggyePublicApiHoldResponse\(request\)/);
  assert.match(router,/if\(CHEONGGYE_PUBLICATION_HOLD\)return response/);
});

test('deploy canaries enforce noindex private holds on every regional public route',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const byUrl=new Map(manifest.worker.requests.map(x=>[x.url,x]));
  const protectedPaths=['/cheonggyepass',...publicPaths.filter(x=>!x.endsWith('/local-region-module-public.js')&&!x.endsWith('/local-region-forest-public.js'))];
  for(const path of new Set(protectedPaths)){
    const probe=byUrl.get(root+path);
    if(!probe&&path.endsWith('/'))continue;
    assert.ok(probe,path);
    assert.deepEqual(probe.statuses,[404],path);
    assert.ok(probe.headerExpect.includes('x-ekodi-route: regional-private-hold'),path);
    assert.ok(probe.headerExpect.includes('x-robots-tag: noindex'),path);
  }
  for(const path of ['/cgpass/admin','/cheonggye/admin','/cheonggye/admin/directory']){
    assert.deepEqual(byUrl.get(root+path)?.statuses,[200]);
  }
});

test('sitemap and public registry cannot advertise frozen regional pages',async()=>{
  const registry=await buildEkodiPublicRegistry({});
  for(const item of registry.resources){
    const path=new URL(item.url).pathname;
    assert.equal(isCheonggyeUnreleasedPublicPath(path),false,item.url);
  }
});
