import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const constitution=read('CONSTITUTION.md');
const registry=JSON.parse(read('governance/constitution/constitution.json'));
const workspacePolicy=JSON.parse(read('config/service-workspace-policy.json'));
const client=read('auth-site/client-auth.js');
const serviceAuth=read('auth-site/auth.js');
const router=read('auth-site/auth-router.js');
const entry=read('auth-site/auth-entry.js');
const my=read('my/app.js');
const store=read('store-admin-engine.js');

test('constitution makes login-return continuity mandatory for every site',()=>{
  assert.match(constitution,/Authentication Return Continuity Constitution/);
  assert.match(constitution,/exact trusted page that initiated login/);
  assert.match(constitution,/must not silently land in another site's home, My page/);
  assert.match(constitution,/ekodi\.kr\/my.*generic post-login fallback/);
  assert.equal(registry.version,'1.20.0');
  assert.equal(registry.authenticationReturnContinuityPolicy?.exactPreLoginReturnPreferred,true);
  assert.equal(registry.authenticationReturnContinuityPolicy?.crossServicePostLoginFallbackForbidden,true);
  assert.equal(registry.authenticationReturnContinuityPolicy?.myEkodi?.genericPostLoginFallbackForbidden,true);
  assert.deepEqual(registry.authenticationReturnContinuityPolicy?.myEkodi?.allowedInitiators,['my','portal']);
  assert.equal(workspacePolicy.authenticationReturnPolicy?.exactPreLoginUrlFirst,true);
  assert.equal(workspacePolicy.authenticationReturnPolicy?.crossSiteFallback,false);
  assert.equal(workspacePolicy.authenticationReturnPolicy?.adminChildPathReturnRequired,true);
});

test('central client auth returns directly to the initiating trusted URL',()=>{
  assert.match(client,/function postLoginTarget\(\)/);
  assert.match(client,/const target=new URL\(RETURN_TO\)/);
  assert.match(client,/const target=postLoginTarget\(\)/);
  assert.match(client,/target\.hash=new URLSearchParams/);
  assert.match(client,/location\.assign\(target\.href\)/);
  assert.match(client,/isPlatformMy&&!\['my','portal'\]\.includes\(site\)/);
  assert.doesNotMatch(client,/function myEntryTarget\(\)/);
  assert.doesNotMatch(client,/commonServiceEntry&&proof\.platformAdmin!==true/);
  assert.doesNotMatch(client,/target\.searchParams\.set\('from',site\)/);
});

test('workspace/service auth and store admin preserve the exact pre-login destination',()=>{
  assert.match(serviceAuth,/body:JSON\.stringify\(\{site,return_to:returnTo,workspace_key/);
  assert.match(serviceAuth,/const target=new URL\(d\.returnTo\)/);
  assert.match(serviceAuth,/location\.assign\(target\.href\)/);
  assert.match(store,/u\.searchParams\.set\('return_to',location\.origin\+location\.pathname\+location\.search\)/);
  assert.match(store,/site','space'/);
  assert.match(store,/exchangeCentralToken/);
});

test('My EKODI is not a cross-service token landing page',()=>{
  assert.match(my,/function misroutedServiceReturn\(\)/);
  assert.match(my,/if\(!raw\|\|!hash\.get\('ekodi_token'\)\)return null/);
  assert.match(my,/if\(target\.origin==='https:\/\/ekodi\.kr'.*target\.pathname==='\/my'/);
  assert.match(my,/target\.hash=location\.hash/);
  assert.match(my,/location\.replace\(MISROUTED_SERVICE_RETURN\.href\)/);
});

test('auth and store releases are cache-busted for return continuity',()=>{
  assert.match(router,/client-auth\.js\?v=20260923-return-continuity-1/);
  assert.match(entry,/auth-router\.js\?v=20260923-return-continuity-1/);
  assert.match(store,/store-admin\.css\?v=20260923-auth-return-title-v1/);
  assert.match(store,/20260923-auth-return-title-v1/);
});
