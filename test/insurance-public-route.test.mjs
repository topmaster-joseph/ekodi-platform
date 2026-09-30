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
  assert.equal(insuranceAssetPath('/insurance/unknown.js'),null);
});

test('insurance admin handoff follows the canonical apex admin path',async()=>{
  const response=await routeInsurancePublic(new Request('https://ekodi.kr/insurance/admin'),{});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/admin/services/insurance');
  assert.equal(response.headers.get('x-ekodi-route'),'insurance-admin-handoff');
});

test('shared-site router owns insurance before workspace routing',async()=>{
  const [router,wrangler,build,manifest,ecosystem,releaseManifest,stageWorkflow]=await Promise.all([
    read('platform-router-entry-worker.js'), read('wrangler.site.toml'), read('scripts/build.mjs'),
    read('ekodi-service-manifest.js'), read('config/ecosystem-services.json'),
    read('deploy/manifests/shared-site.worker.json'), read('.github/workflows/stage-shared-site-shell.yml'),
  ]);
  const insuranceIndex=router.indexOf('isInsurancePublicPath(url.pathname)');
  const workspaceIndex=router.indexOf('isPublicWorkspacePath(url.pathname)');
  assert.ok(insuranceIndex>0 && workspaceIndex>insuranceIndex);
  assert.ok(wrangler.includes('"/insurance*"'));
  assert.ok(build.includes("sites/ekodi-insurance/public"));
  assert.ok(manifest.includes("url:'https://ekodi.kr/insurance'"));
  assert.ok(manifest.includes("state:'live'"));
  assert.ok(ecosystem.includes('"url": "https://ekodi.kr/insurance"'));
  assert.ok(ecosystem.includes('"status": "beta"'));
  assert.ok(releaseManifest.includes('"url": "https://ekodi.kr/insurance"'));
  assert.ok(releaseManifest.includes('"x-ekodi-route: public-insurance"'));
  assert.ok(stageWorkflow.includes("verify_public_path '/insurance'"));
  assert.ok(stageWorkflow.includes("test/insurance-public-route.test.mjs"));
});
