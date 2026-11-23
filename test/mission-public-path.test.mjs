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
