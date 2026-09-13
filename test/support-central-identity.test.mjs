import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSpecialistProfile} from '../support/specialists.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('support surfaces load the optional central identity bridge',()=>{
  const home=read('support/index.html');
  const specialist=read('support/service.html');
  for(const html of [home,specialist]){
    assert.match(html,/id="ekodiAccount"/);
    assert.match(html,/\/account\.css/);
    assert.match(html,/\/account\.js/);
  }
  assert.match(home,/중앙 계정에는 자동 저장하지 않습니다/);
  assert.match(specialist,/중앙 계정에 자동 저장하지 않습니다/);
});

test('staging central identity is isolated while production is configured',()=>{
  const worker=read('support-worker.js');
  const prod=read('wrangler.support.toml');
  const staging=read('wrangler.support.staging.toml');
  assert.match(worker,/production=dataMode==='production'/);
  assert.match(worker,/supportProfileStorage:'browser-local'/);
  assert.match(worker,/centralIdentityEnabled/);
  assert.match(prod,/SUPABASE_URL = "https:\/\/renzehysxirjilvdxacv\.supabase\.co"/);
  assert.match(prod,/SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(staging,/SUPABASE_URL/);
  assert.doesNotMatch(staging,/SUPABASE_PUBLISHABLE_KEY/);
  assert.ok(prod.includes('AUTH_URL = "https://ekodi.kr/auth/?site=support"'));
  assert.ok(staging.includes('AUTH_URL = "https://ekodi.kr/auth/?site=support"'));
  assert.doesNotMatch(worker,/auth\.ekodi\.kr|admin\.ekodi\.kr/);
});

test('Support release dependencies use canonical apex gateways',()=>{
  const deploy=read('.github/workflows/deploy-support-opportunity.yml');
  const identity=read('.github/workflows/support-central-identity-ci.yml');
  assert.ok(deploy.includes('https://ekodi.kr/shell/manifest.json'));
  assert.ok(!deploy.includes('https://shell.ekodi.kr/manifest.json'));
  const triggerBefore=deploy.indexOf('Reconcile production hostname trigger for candidate verification');
  const guarded=deploy.indexOf('Bootstrap or guarded release');
  const triggerAfter=deploy.indexOf('Reconcile production hostname trigger',triggerBefore+1);
  assert.ok(triggerBefore>=0&&guarded>triggerBefore,'Support canonical route must exist before candidate override smoke');
  assert.ok(triggerAfter>guarded,'Support route must be reconciled again after guarded promotion');
  assert.ok(identity.includes("Origin: https://ekodi.kr"));
  assert.ok(identity.includes('https://ekodi\\.kr'));
  assert.ok(!identity.includes('https://support\\.ekodi\\.kr'));
});

test('profile api allows production Support origin only through explicit allowlist',()=>{
  const profileApi=read('supabase/functions/profile-api/index.ts');
  assert.match(profileApi,/"https:\/\/ekodi\.kr"/);assert.doesNotMatch(profileApi,/support\.ekodi\.kr/);
  assert.doesNotMatch(profileApi,/ekodi-support-opportunity-staging/);
});

test('central identity bridge fails open to local opportunity discovery',()=>{
  const account=read('support/account.js');
  assert.match(account,/central identity unavailable/);
  assert.match(account,/기회 탐색은 계속 사용할 수 있습니다/);
  assert.match(account,/profileApi/);
  assert.match(account,/ekodi_token/);
});

test('only declared matcher fields are promoted from specialist attributes',()=>{
  const profile=buildSpecialistProfile(
    {profileType:'사업자',region:'전남',need:'시설 지원',interests:[]},
    {industry:'외식업',employeeBand:'2~4명',supportArea:'시설·장비',undeclaredSecret:'never-copy'},
    'grant',
  );
  assert.equal(profile.industry,'외식업');
  assert.equal(profile.employeeBand,'2~4명');
  assert.equal(profile.supportArea,undefined);
  assert.equal(profile.undeclaredSecret,undefined);
  assert.equal(profile.attributes.supportArea,'시설·장비');
  assert.equal(profile.attributes.undeclaredSecret,undefined);
});
