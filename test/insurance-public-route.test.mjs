import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isInsurancePublicPath, insuranceAssetPath, routeInsurancePublic } from '../insurance-public-route.js';
import { isWorkspaceSlug } from '../workspace-route-policy.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('insurance is a canonical public service path, not a workspace slug',()=>{
  assert.equal(isWorkspaceSlug('insurance'),false);
  assert.equal(isInsurancePublicPath('/insurance'),true);
  assert.equal(isInsurancePublicPath('/insurance/advisor'),true);
  assert.equal(isInsurancePublicPath('/yogurt'),false);
  assert.equal(insuranceAssetPath('/insurance'),'/insurance/');
  assert.equal(insuranceAssetPath('/insurance/advisor'),'/insurance/advisor');
  assert.equal(insuranceAssetPath('/insurance/styles.css'),'/insurance/styles.css');
  assert.equal(insuranceAssetPath('/insurance/chat.css'),'/insurance/chat.css');
  assert.equal(insuranceAssetPath('/insurance/unknown.js'),null);
});

test('insurance admin handoff follows the canonical apex admin path',async()=>{
  const response=await routeInsurancePublic(new Request('https://ekodi.kr/insurance/admin'),{});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/admin/services/insurance');
  assert.equal(response.headers.get('x-ekodi-route'),'insurance-admin-handoff');
});

test('insurance chat stylesheet is served through the canonical route',async()=>{
  const seen=[];
  const response=await routeInsurancePublic(new Request('https://ekodi.kr/insurance/chat.css'),{
    ASSETS:{fetch:async request=>{seen.push(new URL(request.url).pathname);return new Response('.chat-layout{}',{status:200,headers:{'content-type':'text/css'}});}}
  });
  assert.equal(response.status,200);
  assert.deepEqual(seen,['/insurance/chat.css']);
  assert.equal(response.headers.get('x-ekodi-route'),'public-insurance');
  assert.match(await response.text(),/chat-layout/);
});

test('shared-site router owns insurance before workspace routing',async()=>{
  const [router,wrangler,build,manifest,ecosystem,releaseManifest,stageWorkflow,insuranceApp,bridge,index]=await Promise.all([
    read('platform-router-entry-worker.js'), read('wrangler.site.toml'), read('scripts/build.mjs'),
    read('ekodi-service-manifest.js'), read('config/ecosystem-services.json'),
    read('deploy/manifests/shared-site.worker.json'), read('.github/workflows/stage-shared-site-shell.yml'),
    read('sites/ekodi-insurance/public/app.js'), read('sites/ekodi-insurance/public/server-bridge.js'),
    read('sites/ekodi-insurance/public/index.html'),
  ]);
  const insuranceIndex=router.indexOf('isInsurancePublicPath(url.pathname)');
  const workspaceIndex=router.indexOf('isPublicWorkspacePath(url.pathname)');
  assert.ok(insuranceIndex>0 && workspaceIndex>insuranceIndex);
  assert.ok(wrangler.includes('"/insurance*"'));
  assert.ok(build.includes("sites/ekodi-insurance/public"));
  assert.ok(insuranceApp.includes("'/insurance/chat.css'"));
  assert.ok(bridge.includes('https://ekodi.kr/admin/services/insurance'));
  assert.doesNotMatch(index,/현재 스테이징|스테이징 테스트|통합회원 준비중/);
  assert.ok(manifest.includes("url:'https://ekodi.kr/insurance'"));
  assert.ok(manifest.includes("state:'live'"));
  assert.ok(ecosystem.includes('"url": "https://ekodi.kr/insurance"'));
  assert.ok(ecosystem.includes('"status": "beta"'));
  assert.ok(releaseManifest.includes('"url": "https://ekodi.kr/insurance"'));
  assert.ok(releaseManifest.includes('"x-ekodi-route: public-insurance"'));
  assert.ok(stageWorkflow.includes("verify_public_path '/insurance'"));
  assert.ok(stageWorkflow.includes("test/insurance-public-route.test.mjs"));
});


test('insurance consultation withdrawal panel does not rerender inside DOM observer',async()=>{
  const bridge=await read('sites/ekodi-insurance/public/server-bridge.js');
  const start=bridge.indexOf('function reviseHandoffCopy(');
  const end=bridge.indexOf("  document.addEventListener('submit'",start);
  assert.ok(start>=0 && end>start,'handoff mutation-scoped copy handler must exist');
  const observerCopy=bridge.slice(start,end);
  assert.doesNotMatch(observerCopy,/renderWithdrawalPanel\s*\(/,
    'mutation observer must never render its own monitored children');
  assert.match(bridge,/function writeAccess\(items\)\s*\{[\s\S]*?renderWithdrawalPanel\(\)/,
    'explicit consented server consultation mutations must refresh withdrawal actions');
  assert.match(bridge,/DOMContentLoaded[^\n]*reviseHandoffCopy\(\); renderWithdrawalPanel\(\); loadReferenceCatalog\(\)/,
    'initial withdrawal panel must still be visible before any request');
});


test('standalone insurance Worker admin redirect uses canonical apex, not retired hostname', async () => {
  const source = await read('sites/ekodi-insurance/worker.js');
  const retired = ['admin','ekodi','kr'].join('.');
  assert.match(source, /if\(production\)return Response\.redirect\('https:\/\/ekodi\.kr\/admin',302\)/);
  assert.ok(!source.includes('https://' + retired + '/'));
});
