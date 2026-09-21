import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {localRegionBySlug,localRegionFromPath,localRegionRegistrySnapshot} from '../local-region-registry.js';
import {localRegionPublicPage,localRegionAdminPage} from '../local-region-page.js';

test('Cheonggye is an independent regional identity and keeps CGMA as delegated operator',()=>{
  const region=localRegionBySlug('cheonggye');
  assert.equal(region.id,'local:cheonggye');
  assert.equal(region.publicPath,'/cheonggye');
  assert.equal(region.adminPath,'/cheonggye/admin');
  assert.equal(region.siteSubject,'local-cheonggye');
  assert.equal(region.initialOperatorId,'cgma');
  assert.equal(region.operators.cgma.publicPath,'/cgma');
  assert.equal(region.operators.cgma.adminPath,'/cgma/admin');
  assert.equal(region.transferPolicy.dataMovement,'none');
  assert.equal(region.transferPolicy.allowPerModuleTransfer,true);
  assert.equal(region.transferPolicy.allowCoOperation,true);
  const pass=region.modules.find(module=>module.id==='commerce-pass');
  assert.equal(pass?.leadOperatorId,'cgma');
  assert.equal(pass?.financialMode,'external-settlement-required');
});

test('regional path resolver claims public and admin surfaces without changing CGMA route',()=>{
  assert.equal(localRegionFromPath('/cheonggye')?.admin,false);
  assert.equal(localRegionFromPath('/cheonggye/events')?.region.id,'local:cheonggye');
  assert.equal(localRegionFromPath('/cheonggye/admin')?.admin,true);
  assert.equal(localRegionFromPath('/cgma'),null);
});

test('regional pages declare separate chrome subject and operating boundary',async()=>{
  const region=localRegionBySlug('cheonggye');
  const publicHtml=await localRegionPublicPage(region).text();
  const adminHtml=await localRegionAdminPage(region).text();
  assert.match(publicHtml,/data-ekodi-site-subject="local-cheonggye"/);
  assert.match(publicHtml,/청계잇다/);
  assert.match(publicHtml,/href="\/cgma"/);
  assert.match(adminHtml,/서비스별 운영주체/);
  assert.match(adminHtml,/청계면상인회/);
  assert.match(adminHtml,/데이터는 이동·복사하지 않고/);
  assert.match(adminHtml,/href="\/cgma\/admin"/);
});

test('router claims local region before generic workspace and admin matchers',async()=>{
  const router=await fs.readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  const local=router.indexOf('localRegionFromPath(url.pathname)');
  const admin=router.indexOf('isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname)');
  const workspace=router.indexOf('isPublicWorkspacePath(url.pathname)&&!isEkodiBizOwnedPath(url.pathname)');
  assert.ok(local>0);
  assert.ok(admin>local,'regional admin must resolve before generic workspace admin');
  assert.ok(workspace>local,'regional public route must resolve before generic workspace gateway');
});

test('shared worker forces Cheonggye through regional router',async()=>{
  const wrangler=await fs.readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(wrangler,/"\/cheonggye\*"/);
});

test('regional registry is reusable for additional regions',()=>{
  const snapshot=localRegionRegistrySnapshot();
  assert.ok(Array.isArray(snapshot));
  assert.equal(snapshot[0].governanceModel,'delegated-multi-operator');
  assert.ok(snapshot[0].modules.every(module=>module.leadOperatorId&&Array.isArray(module.operatorIds)));
});
