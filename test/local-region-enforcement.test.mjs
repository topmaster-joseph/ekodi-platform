import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  localRegionBySlug,
  localRegionFromPath,
  localRegionModuleFromRoute,
  validateLocalRegionContract,
} from '../local-region-registry.js';
import {
  localRegionPublicPage,
  localRegionModulePublicPage,
  localRegionModuleAdminPage,
  localRegionNotFoundPage,
} from '../local-region-page.js';

const region=localRegionBySlug('cheonggye');

test('Cheonggye forces every registered subservice to declare a complete execution contract',()=>{
  assert.equal(validateLocalRegionContract(region),true);
  assert.ok(region.modules.length>=9);
  const publicPaths=new Set();
  const adminPaths=new Set();
  for(const module of region.modules){
    assert.ok(module.id);
    assert.ok(module.routeSegment);
    assert.ok(module.label);
    assert.ok(module.summary);
    assert.equal(module.publicPath,'/cheonggye/'+module.routeSegment);
    assert.equal(module.adminPath,'/cheonggye/admin/'+module.routeSegment);
    assert.equal(module.dataOwner,'regional-platform');
    assert.ok(module.sourcePolicy);
    assert.ok(module.operatorIds.includes(module.leadOperatorId));
    assert.ok(region.operators[module.leadOperatorId]);
    assert.equal(publicPaths.has(module.publicPath),false);
    assert.equal(adminPaths.has(module.adminPath),false);
    publicPaths.add(module.publicPath);
    adminPaths.add(module.adminPath);
  }
});

test('every Cheonggye subservice resolves from both public and admin canonical paths',()=>{
  for(const module of region.modules){
    const publicRoute=localRegionFromPath(module.publicPath);
    const adminRoute=localRegionFromPath(module.adminPath);
    assert.equal(localRegionModuleFromRoute(publicRoute)?.id,module.id);
    assert.equal(localRegionModuleFromRoute(adminRoute)?.id,module.id);
  }
});

test('Cheonggye home links every registered regional subservice',async()=>{
  const html=await localRegionPublicPage(region).text();
  for(const module of region.modules){
    assert.ok(html.includes('href="'+module.publicPath+'"'),module.id+' public link missing');
  }
  assert.match(html,/목포대 × 청계/);
  assert.match(html,/우리동네/);
});

test('generic Cheonggye subservice surfaces expose ownership and source boundaries',async()=>{
  for(const module of region.modules.filter(item=>!['commerce-pass','forest'].includes(item.id))){
    const publicResponse=localRegionModulePublicPage(region,module);
    const adminResponse=localRegionModuleAdminPage(region,module);
    const publicHtml=await publicResponse.text();
    const adminHtml=await adminResponse.text();
    assert.equal(publicResponse.status,200);
    assert.equal(adminResponse.status,200);
    assert.equal(publicResponse.headers.get('x-ekodi-route'),'local-region-module-public');
    assert.equal(adminResponse.headers.get('x-ekodi-route'),'local-region-module-admin');
    assert.ok(publicHtml.includes('data-ekodi-local-module="'+module.id+'"'));
    assert.ok(adminHtml.includes('data-ekodi-local-module="'+module.id+'"'));
    assert.match(publicHtml,/조직 내부정보의 소유경계를 분리/);
    assert.match(adminHtml,/강제 실행 계약/);
    assert.match(adminHtml,/조직 내부 원본은 복제하지 않고/);
  }
});

test('unregistered Cheonggye subservice paths fail closed instead of falling back to the regional home',async()=>{
  const response=localRegionNotFoundPage(region,{path:'/cheonggye/not-registered'});
  assert.equal(response.status,404);
  assert.equal(response.headers.get('x-ekodi-route'),'local-region-not-found');
  assert.match(await response.text(),/등록되지 않은 지역 경로/);
});

test('router enforces module resolver and fail-closed regional routing',async()=>{
  const router=await fs.readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(router,/localRegionModuleFromRoute/);
  assert.match(router,/localRegionModulePublicPage/);
  assert.match(router,/localRegionModuleAdminPage/);
  assert.match(router,/localRegionNotFoundPage/);
  assert.match(router,/exactModuleRoute/);
});

test('production probe manifest covers every Cheonggye subservice public and admin route',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const urls=new Set((manifest.worker?.requests||[]).map(item=>item.url));
  for(const module of region.modules){
    assert.ok(urls.has('https://ekodi.kr'+module.publicPath),module.id+' public probe missing');
    assert.ok(urls.has('https://ekodi.kr'+module.adminPath),module.id+' admin probe missing');
  }
});
