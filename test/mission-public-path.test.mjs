import test from 'node:test';
import assert from 'node:assert/strict';
import {isMissionCanonicalPath,missionRuntimePath,missionPublicReferences} from '../mission-public-path.js';

test('Mission canonical path is exact and descendant-only',()=>{
  assert.equal(isMissionCanonicalPath('/mission'),true);
  assert.equal(isMissionCanonicalPath('/mission/activities/2026'),true);
  assert.equal(isMissionCanonicalPath('/missionary'),false);
  assert.equal(isMissionCanonicalPath('/mokpo-presbytery/mission'),false);
});
test('Public Mission routes resolve internally without issuing redirects',()=>{
  assert.equal(missionRuntimePath('/mission/'),'/ekodimission');
  assert.equal(missionRuntimePath('/mission/api/activities/abc/applications'),'/ekodimission/api/activities/abc/applications');
  assert.equal(missionRuntimePath('/ekodimission/activities'),'/ekodimission/activities');
});
test('Brand URLs change; tenant, RPC and workspace identities do not',()=>{
  const html='<a href="/ekodimission">선교회</a><script src="/ekodimission/assets/site.js"></script><link rel="canonical" href="https://ekodi.kr/ekodimission/devotion">';
  const output=missionPublicReferences(html);
  assert.match(output,/href="\/mission"/);
  assert.match(output,/src="\/mission\/assets\/site.js"/);
  assert.match(output,/href="https:\/\/ekodi.kr\/mission\/devotion"/);
  assert.doesNotMatch(output,/\/ekodimission/);
  assert.equal(missionPublicReferences('workspace=ekodimission; apiTenant=ekodimission'), 'workspace=ekodimission; apiTenant=ekodimission');
  assert.equal(missionPublicReferences('/ekodimissionary /ekodimission-assets.js'),'/ekodimissionary /ekodimission-assets.js');
  assert.equal(missionPublicReferences(output),output);
});

test('Mission board routes preserve the original database site key',async()=>{
  const {resolveSiteBoardRoute}=await import('../site-board-control.js');
  const route=resolveSiteBoardRoute('https://ekodi.kr/mission/board/api/posts');
  assert.equal(route?.siteId,'ekodimission');
  assert.equal(route?.tenantSlug,'ekodimission');
  assert.equal(route?.basePath,'/mission/board');
  assert.equal(route?.subPath,'/api/posts');
  assert.equal(resolveSiteBoardRoute('https://ekodi.kr/ekodimission/board/api/posts')?.siteId,'ekodimission');
});
test('Mission live browser path changes without changing API tenant identity',async()=>{
  const {realtimeTenantFromPath,realtimeTenant}=await import('../realtime-tenant-registry.js');
  const site=realtimeTenantFromPath('/mission/live');
  assert.equal(site?.id,'ekodimission');
  assert.equal(site?.apiTenant,'ekodimission');
  assert.equal(site?.home,'/mission/');
  assert.equal(realtimeTenantFromPath('/ekodimission/live')?.id,'ekodimission');
  assert.equal(realtimeTenant('mission')?.apiTenant,'ekodimission');
});
