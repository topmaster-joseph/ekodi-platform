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
  const [constitutionMajor,constitutionMinor]=String(registry.version||'0.0.0').split('.').map(Number);
  assert.ok(constitutionMajor>1||(constitutionMajor===1&&constitutionMinor>=20),'login-return continuity must remain binding in Constitution v1.20.0+');
  assert.equal(registry.authenticationReturnContinuityPolicy?.exactPreLoginReturnPreferred,true);
  assert.equal(registry.authenticationReturnContinuityPolicy?.crossServicePostLoginFallbackForbidden,true);
  assert.equal(registry.authenticationReturnContinuityPolicy?.myEkodi?.genericPostLoginFallbackForbidden,true);
  assert.deepEqual(registry.authenticationReturnContinuityPolicy?.myEkodi?.allowedInitiators,['my','portal']);
  assert.equal(workspacePolicy.authenticationReturnPolicy?.exactPreLoginUrlFirst,true);
  assert.equal(workspacePolicy.authenticationReturnPolicy?.crossSiteFallback,false);
  assert.equal(workspacePolicy.authenticationReturnPolicy?.adminChildPathReturnRequired,true);
});

test('central client auth returns directly to the initiating trusted URL',()=>{
  assert.match(client,/space:\{name:'EKODI 운영공간',returnTo:'https:\/\/ekodi\.kr\/',origins:\['https:\/\/ekodi\.kr'\],open:true,kind:'space'\}/);
  assert.match(client,/function trustedSpaceAdminTarget\(raw\)/);
  assert.ok(client.includes("if(!/^\\/[a-z0-9-]+\\/admin(?:\\/|$)/i.test(target.pathname))return null;"));
  assert.match(client,/function unwrapSpaceMyRelay\(target\)/);
  assert.match(client,/target\.searchParams\.get\('from'\).*space/);
  assert.match(client,/target\.searchParams\.get\('return_to'\)/);
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

test('Mission admin auth is pinned to Mission-local client routing',()=>{
  assert.ok(router.includes("else if(site==='mission')await loadClientAuth();"));
  assert.ok(client.includes("mission:{name:'EKODI Mission',returnTo:'https://ekodi.kr/ekodimission/',adminReturnTo:'https://ekodi.kr/ekodimission/admin'"));
  assert.ok(client.includes("config.kind==='mission'&&DIRECT_LOGIN&&config.adminReturnTo?config.adminReturnTo:config.returnTo"));
  assert.ok(client.includes("const missionPath=config.kind!=='mission'||(target.origin==='https://ekodi.kr'&&(target.pathname==='/ekodimission'||target.pathname.startsWith('/ekodimission/')))"));
  assert.equal(client.includes("adminReturnTo:'https://ekodi.kr/admin"),false);
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
  assert.match(router,/client-auth\.js\?v=20261028-singles-choose-account/);
  assert.match(entry,/auth-router\.js\?v=20261028-singles-choose-account/);
  assert.match(store,/store-admin\.css\?v=20261028-today-board-v1/);
  assert.match(store,/20261028-today-board-v1/);
});

test('v1.27.3: login always returns to the exact pre-login page and never falls back to a My page',()=>{
  const policy=registry.authenticationReturnContinuityPolicy;
  const [maj,min,patch]=String(registry.version).split('.').map(Number);
  assert.ok(maj>1||min>27||(min===27&&patch>=3),'pre-login return must stay binding in v1.27.3+');
  assert.match(constitution,/로그인 직전 페이지/);
  assert.match(constitution,/My pages are never a post-login fallback/);
  for(const key of ['preLoginPageReturnMandatory','everyLoginEntryMustCarryCurrentPageReturnTo','shellStampsMissingReturnTo','myPagesAsPostLoginFallbackForbidden','serviceLocalMyFallbackForbidden','myLandingOnlyWhenLoginStartedOnMyPageOrExplicitMyLink']) assert.equal(policy[key],true,key);
  assert.deepEqual(policy.fallbackOrder,['trusted-exact-return-to','canonical-initiating-service-entry']);
  assert.deepEqual(workspacePolicy.authenticationReturnPolicy.fallbackOrder,['trusted_return_to','initiating_site_canonical_entry']);
  assert.equal(workspacePolicy.authenticationReturnPolicy.siteLocalMyFallback,false);
});

test('v1.27.3: known login entries carry the pre-login page instead of a My page',()=>{
  const home=read('index.html');
  assert.match(home,/auth\/\?site=portal&amp;return_to=https%3A%2F%2Fekodi\.kr%2F"[^>]*data-ekodi-home-login/);
  assert.doesNotMatch(home,/auth\/\?site=my&amp;return_to=https%3A%2F%2Fekodi\.kr%2Fmy%2F/);
  assert.doesNotMatch(home,/<script\b/i,'source homepage stays zero-JavaScript; the build injects the auth-state script');
  assert.ok(read('scripts/build.mjs').includes('<script src="/homepage-auth-state.js" defer></script>'));
  const homeState=read('homepage-auth-state.js');
  assert.match(homeState,/history\.replaceState/);
  assert.doesNotMatch(homeState,/location\.(assign|replace)\(/,'homepage must not navigate away after login');
  const singles=read('sites/ekodi-singles/public/app.js');
  assert.doesNotMatch(singles,/page\|\|'\/my'/);
  assert.match(singles,/'https:\/\/ekodi\.kr\/singles'\+page\+location\.search/);
  assert.doesNotMatch(read('singles-surface.js'),/return_to=https%3A%2F%2Fekodi\.kr%2Fsingles%2Fmy/);
  assert.doesNotMatch(read('qtin-order-worker.js'),/auth\/\?site=portal'/);
  const shell=read('shell/shell.js');
  assert.match(shell,/function stampLoginReturn\(event\)/);
  assert.match(shell,/document\.addEventListener\('click',stampLoginReturn,true\)/);
  assert.ok(read('site-worker.js').includes("'/homepage-auth-state.js'"));
  assert.ok(read('scripts/build.mjs').includes("'homepage-auth-state.js'"));
});

test('v1.27.4: Google sign-in is user-initiated and the returned page shows the signed-in account',()=>{
  const policy=registry.authenticationReturnContinuityPolicy;
  for(const key of ['automaticGooglePromptForbiddenOnUserSurfaces','googlePromptRequiresPersistentButton','signedInAccountVisibleAfterReturn','serviceGateMustNotReadAsLoginFailure','reusedSessionAccountNamedOnAuthPage']) assert.equal(policy[key],true,key);
  assert.match(constitution,/Automatic Google One Tap\/FedCM prompts/);
  const singles=read('sites/ekodi-singles/public/app.js');
  assert.match(singles,/function accountCard\(h\)/);
  assert.match(singles,/로그인은 정상적으로 완료되었습니다/);
  assert.doesNotMatch(singles,/로그인 확인 · 회원서비스 준비 중/);
  assert.match(singles,/button\('로그아웃'/);
  assert.match(client,/계정으로 로그인되어 있습니다\. 원래 보던 화면으로 돌아갑니다/);
});
