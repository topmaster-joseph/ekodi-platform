import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Naver / Kakao login paths are built but dormant. Each signs into the same EKODI
// account model (people + login_identities) and login_identities.provider records
// the path. These tests pin: dormancy, the two activation gates, takeover safety,
// provider adapters, and callback handling on the shared auth page.

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const providers=await import(new URL('supabase/functions/identity-api/federated-providers.ts',root));

function loadLoginCore(){
  // The browser module imports supabase-js from a CDN; strip that line to test the pure helpers.
  const src=read('auth-site/federated-login.js').replace(/^import \{ createClient \}[^\n]*\n/m,'const createClient=()=>{throw new Error("not in tests")};\n');
  const dir=mkdtempSync(join(tmpdir(),'ekodi-fed-'));
  const file=join(dir,'federated-login.mjs');writeFileSync(file,src);
  return import(pathToFileURL(file).href);
}
const login=await loadLoginCore();

function fakeFetch(routes){
  const calls=[];
  const fetcher=async(url,init={})=>{
    calls.push({url:String(url),init});
    const hit=routes.find(([prefix])=>String(url).startsWith(prefix));
    if(!hit)return new Response('{}',{status:404});
    const [,status,body]=hit;
    return new Response(JSON.stringify(body),{status});
  };
  return {fetcher,calls};
}

test('Naver and Kakao stay seeded as disabled providers',()=>{
  const seed=read('supabase/migrations/20260829010000_modular_ekodi_identity.sql');
  assert.match(seed,/\('kakao', '카카오', 'oauth2', false,/);
  assert.match(seed,/\('naver', '네이버', 'oauth2', false,/);
});

test('identity-api registers Naver/Kakao adapters only when their secrets exist (second gate = identity_providers.enabled)',()=>{
  const api=read('supabase/functions/identity-api/index.ts');
  assert.match(api,/if\(naverId&&naverSecret\)adapters\.set\("naver"/);
  assert.match(api,/if\(kakaoId\)adapters\.set\("kakao"/);
  assert.match(api,/\.eq\("enabled",true\)/);
  assert.match(api,/filter\(\(row:any\)=>adapters\.has\(row\.provider\)\)/);
  // Google path is unchanged: still the email-addressed auth user.
  assert.match(api,/redirect\?await federatedAuthEmail\(provider,profile\.subject\):profile\.email/);
});

test('redirect providers get a subject-keyed alias auth user, never an email-matched one',async()=>{
  const a=await providers.federatedAuthEmail('naver','12345');
  const b=await providers.federatedAuthEmail('naver','12345');
  const c=await providers.federatedAuthEmail('kakao','12345');
  assert.equal(a,b);
  assert.notEqual(a,c);
  assert.match(a,/^naver\.[0-9a-f]{32}@identity\.ekodi\.kr$/);
});

test('Naver adapter exchanges the code and maps the profile; email is never treated as verified',async()=>{
  const {fetcher,calls}=fakeFetch([
    ['https://nid.naver.com/oauth2.0/token',200,{access_token:'AT'}],
    ['https://openapi.naver.com/v1/nid/me',200,{resultcode:'00',response:{id:'N-1',email:'User@Naver.com',name:'홍길동'}}],
  ]);
  const id=await providers.verifyNaverCode('code1','state1',{clientId:'cid',clientSecret:'sec',fetcher});
  assert.deepEqual(id,{subject:'N-1',email:'user@naver.com',emailVerified:false,displayName:'홍길동'});
  const token=new URL(calls[0].url);
  assert.equal(token.searchParams.get('grant_type'),'authorization_code');
  assert.equal(token.searchParams.get('state'),'state1');
  assert.equal(calls[1].init.headers.authorization,'Bearer AT');
});

test('Naver adapter rejects failures',async()=>{
  const bad=fakeFetch([['https://nid.naver.com/oauth2.0/token',401,{error:'invalid_client'}]]);
  await assert.rejects(providers.verifyNaverCode('c','s',{clientId:'x',clientSecret:'y',fetcher:bad.fetcher}),/naver_token_http_401/);
  const noProfile=fakeFetch([
    ['https://nid.naver.com/oauth2.0/token',200,{access_token:'AT'}],
    ['https://openapi.naver.com/v1/nid/me',200,{resultcode:'024',message:'Authentication failed'}],
  ]);
  await assert.rejects(providers.verifyNaverCode('c','s',{clientId:'x',clientSecret:'y',fetcher:noProfile.fetcher}),/naver_profile_invalid/);
  await assert.rejects(providers.verifyNaverCode('','s',{clientId:'x',clientSecret:'y'}),/naver_code_required/);
});

test('Kakao adapter posts a form token request and honours is_email_verified',async()=>{
  const {fetcher,calls}=fakeFetch([
    ['https://kauth.kakao.com/oauth/token',200,{access_token:'KT'}],
    ['https://kapi.kakao.com/v2/user/me',200,{id:987,kakao_account:{email:'k@kakao.com',is_email_valid:true,is_email_verified:true,profile:{nickname:'카카오'}}}],
  ]);
  const id=await providers.verifyKakaoCode('kc','st',{clientId:'rest',clientSecret:'ks',redirectUri:'https://ekodi.kr/auth/',fetcher});
  assert.deepEqual(id,{subject:'987',email:'k@kakao.com',emailVerified:true,displayName:'카카오'});
  const form=new URLSearchParams(calls[0].init.body);
  assert.equal(calls[0].init.method,'POST');
  assert.equal(form.get('redirect_uri'),'https://ekodi.kr/auth/');
  assert.equal(form.get('client_secret'),'ks');

  const unverified=fakeFetch([
    ['https://kauth.kakao.com/oauth/token',200,{access_token:'KT'}],
    ['https://kapi.kakao.com/v2/user/me',200,{id:5,kakao_account:{email:'x@y.z',is_email_valid:true,is_email_verified:false}}],
  ]);
  const u=await providers.verifyKakaoCode('kc','st',{clientId:'rest',clientSecret:'',redirectUri:'https://ekodi.kr/auth/',fetcher:unverified.fetcher});
  assert.equal(u.emailVerified,false);
  assert.equal(new URLSearchParams(unverified.calls[0].init.body).has('client_secret'),false);
});

test('callback detection only claims callbacks this module started',()=>{
  const now=1_000_000;
  const pending=JSON.stringify({provider:'naver',purpose:'login',nonce:'abc',search:'?site=mall',at:now-1000});
  assert.equal(login.classifyCallback('?site=mall','',now).kind,'none');
  assert.equal(login.classifyCallback('?code=1&state=abc',null,now).kind,'none','foreign ?code=&state= must not be hijacked');
  assert.equal(login.classifyCallback('?code=1&state=zzz',pending,now).kind,'invalid');
  assert.equal(login.classifyCallback('?code=1&state=abc',pending,now+11*60*1000).kind,'invalid');
  assert.equal(login.classifyCallback('?error=access_denied&state=abc',pending,now).kind,'denied');
  const ok=login.classifyCallback('?code=C1&state=abc',pending,now);
  assert.equal(ok.kind,'exchange');assert.equal(ok.code,'C1');assert.equal(ok.pending.search,'?site=mall');
  const forged=JSON.stringify({provider:'evil',purpose:'login',nonce:'abc',at:now});
  assert.equal(login.classifyCallback('?code=1&state=abc',forged,now).kind,'invalid');
});

test('identity list shows the auth path and hides alias emails',()=>{
  assert.deepEqual(login.identityLabel({provider:'kakao',email:'kakao.0123456789abcdef0123456789abcdef@identity.ekodi.kr'}),{label:'카카오',display:'카카오 계정'});
  assert.deepEqual(login.identityLabel({provider:'naver',email:'me@naver.com'}),{label:'네이버',display:'me@naver.com'});
  assert.deepEqual(login.identityLabel({provider:'google',email:'a@gmail.com'}),{label:'Google',display:'a@gmail.com'});
});

test('auth page wiring: callback runs first, buttons never on admin, asset shipped and served',()=>{
  const router=read('auth-site/auth-router.js');
  assert.ok(router.indexOf('federated.handleCallback()')<router.indexOf("import('./admin-auth.js"));
  assert.match(router,/if\(federatedHandled\)\{/);
  assert.match(router,/site!=='admin'\)federated\.renderLoginButtons\(\)/);
  assert.match(read('scripts/build.mjs'),/'federated-login\.js'/);
  assert.match(read('canonical-surface-router.js'),/'\/federated-login\.js'/);
  const html=read('auth-site/index.html');
  assert.match(html,/id="federatedButtonHost" class="federated-button-host hide"/);
  assert.match(html,/id="federatedLinkHost" class="federated-button-host compact hide"/);
});
