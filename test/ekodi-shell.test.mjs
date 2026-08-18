import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODI_SERVICE_MANIFEST, serviceForHost, serviceForId } from '../ekodi-service-manifest.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('service manifest is the person-space-role registry for future EKODI sites',()=>{
  assert.equal(EKODI_SERVICE_MANIFEST.identityModel,'person-space-role');
  assert.equal(EKODI_SERVICE_MANIFEST.shellVersion,1);
  const ids=EKODI_SERVICE_MANIFEST.services.map(s=>s.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const required of ['my','marketing','community','church','business','work','author','books','lab','social','energy','mall'])assert.ok(ids.includes(required),required);
  for(const service of EKODI_SERVICE_MANIFEST.services){
    assert.match(service.id,/^[a-z][a-z0-9-]*$/);
    assert.equal(new URL(service.url).protocol,'https:');
    assert.ok(Array.isArray(service.workspaceKinds)&&service.workspaceKinds.length>0);
    assert.ok(Array.isArray(service.capabilities)&&service.capabilities.length>0);
  }
  assert.equal(serviceForHost('church.ekodi.kr')?.id,'church');
  assert.equal(serviceForId('community')?.url,'https://community.ekodi.kr/');
});

test('browser shell preserves workspace context and returns space switching to My EKODI',async()=>{
  const client=await read('shell/shell.js');
  assert.match(client,/ekodi_workspace/);
  assert.match(client,/ekodi_shell_context:/);
  assert.match(client,/사람 → 공간 → 기능/);
  assert.match(client,/공간 전환 · My EKODI/);
  assert.match(client,/return_to/);
  assert.match(client,/auth\.ekodi\.kr/);
  assert.match(client,/workspace/);
  assert.match(client,/window\.EKODIShell/);
  assert.match(client,/setContext:mergeContext/);
  assert.match(client,/ekodi:context-change/);
});

test('shell injector is isolated in Shadow DOM and extends CSP instead of weakening it globally',async()=>{
  const [client,injector]=await Promise.all([read('shell/shell.js'),read('ekodi-shell-injector.js')]);
  assert.match(client,/attachShadow\(\{mode:'open'\}\)/);
  assert.match(injector,/HTMLRewriter/);
  assert.match(injector,/script-src/);
  assert.match(injector,/connect-src/);
  assert.match(injector,/https:\/\/shell\.ekodi\.kr/);
  assert.match(injector,/x-ekodi-shell/);
});

test('My, Community and shared service proxy all consume the same shell contract',async()=>{
  const [my,community,proxy]=await Promise.all([read('my-worker.js'),read('community-worker.js'),read('service-proxy.js')]);
  assert.match(my,/injectEkodiShell\(response,'my'\)/);
  assert.match(my,/contextModel:'person-space-role'/);
  assert.match(community,/injectEkodiShell\(withHeaders\(await env\.ASSETS\.fetch\(request\)\),'community'\)/);
  assert.match(proxy,/shellServiceForHost/);
  assert.match(proxy,/injectEkodiShell\(businessHub\(\), 'biz'\)/);
});

test('shell service exposes public manifest and health without account data',async()=>{
  const worker=await read('ekodi-shell-worker.js');
  assert.match(worker,/\/manifest\.json/);
  assert.match(worker,/identityModel/);
  assert.match(worker,/access-control-allow-origin/);
  assert.doesNotMatch(worker,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(worker,/access_token/);
});
