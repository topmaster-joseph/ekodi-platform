// Apple (dormant, paid program) and Daum (served by the Kakao path) login coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {generateKeyPairSync, createVerify} from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const providers=await import(new URL('supabase/functions/identity-api/federated-providers.ts',root));
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
const pem=privateKey.export({type:'pkcs8',format:'pem'});
const deps={teamId:'TEAM123456',keyId:'KEY1234567',servicesId:'kr.ekodi.login',privateKey:pem.replace(/\n/g,'\\n'),redirectUri:'https://ekodi.kr/auth/'};
const b64u=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const idToken=claims=>`${b64u({alg:'RS256'})}.${b64u(claims)}.sig`;

test('Apple client secret is a valid ES256 JWT signed with the one-line .p8 key',async()=>{
  const now=Date.UTC(2026,9,31);
  const jwt=await providers.appleClientSecret({...deps,now});
  const [h,p,s]=jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h,'base64url')),{alg:'ES256',kid:'KEY1234567',typ:'JWT'});
  const claims=JSON.parse(Buffer.from(p,'base64url'));
  assert.equal(claims.iss,'TEAM123456');assert.equal(claims.sub,'kr.ekodi.login');
  assert.equal(claims.aud,'https://appleid.apple.com');assert.equal(claims.exp-claims.iat,300);
  const verifier=createVerify('SHA256');verifier.update(`${h}.${p}`);
  assert.ok(verifier.verify({key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')));
});

test('Apple code exchange returns the stable subject and rejects foreign tokens',async()=>{
  const now=Date.now();const exp=Math.floor(now/1000)+600;
  let seen=null;
  const ok=async(url,init)=>{seen={url,body:new URLSearchParams(init.body)};return new Response(JSON.stringify({id_token:idToken({iss:'https://appleid.apple.com',aud:'kr.ekodi.login',sub:'001234.abcd',exp,email:'a@privaterelay.appleid.com',email_verified:'true'})}),{status:200});};
  const id=await providers.verifyAppleCode('c1','s',{...deps,fetcher:ok,now});
  assert.equal(seen.url,'https://appleid.apple.com/auth/token');
  assert.equal(seen.body.get('client_id'),'kr.ekodi.login');
  assert.equal(seen.body.get('redirect_uri'),'https://ekodi.kr/auth/');
  assert.equal(id.subject,'001234.abcd');
  assert.equal(id.email,'');assert.equal(id.emailVerified,false,'relay address is never treated as owned email');
  for(const bad of [{iss:'https://evil.example',aud:'kr.ekodi.login',sub:'x',exp},{iss:'https://appleid.apple.com',aud:'other',sub:'x',exp},{iss:'https://appleid.apple.com',aud:'kr.ekodi.login',sub:'x',exp:1}]){
    const f=async()=>new Response(JSON.stringify({id_token:idToken(bad)}),{status:200});
    await assert.rejects(providers.verifyAppleCode('c','s',{...deps,fetcher:f,now}),/apple_id_token_invalid/);
  }
  await assert.rejects(providers.verifyAppleCode('','s',{...deps,fetcher:ok,now}),/apple_code_required/);
});

test('Apple stays dormant: registered only with all four keys, behind the operator switch',()=>{
  const src=read('supabase/functions/identity-api/index.ts');
  assert.match(src,/if\(apple\.servicesId&&apple\.teamId&&apple\.keyId&&apple\.privateKey\)adapters\.set\("apple"/);
  assert.match(src,/response_mode:"query"/);
  assert.doesNotMatch(src,/appleid\.apple\.com\/auth\/authorize"[^)]*scope/,'no name/email scope (would force form_post)');
  const wf=read('.github/workflows/deploy-identity-api.yml');
  for(const k of ['APPLE_LOGIN_SERVICES_ID','APPLE_LOGIN_TEAM_ID','APPLE_LOGIN_KEY_ID','APPLE_LOGIN_PRIVATE_KEY'])assert.match(wf,new RegExp(`secrets\\.${k}`));
});

test('Daum users get their own entry that runs the Kakao flow; provider id stays kakao',async()=>{
  const src=read('auth-site/federated-login.js').replace(/^import \{ createClient \}[^\n]*\n/m,'const createClient=()=>{throw new Error("not in tests")};\n');
  const dir=mkdtempSync(join(tmpdir(),'ekodi-fed-'));const file=join(dir,'m.mjs');writeFileSync(file,src);
  const login=await import(pathToFileURL(file).href);
  assert.equal(login.buttonText({id:'kakao',name:'카카오'},'login'),'카카오 계정으로 계속하기');
  assert.equal(login.buttonText({id:'kakao',name:'카카오',variant:'daum'},'login'),'다음(Daum) 계정으로 계속하기');
  const entries=login.loginEntries([{id:'naver'},{id:'kakao',name:'카카오'}]);
  assert.deepEqual(entries.map(e=>e.variant||e.id),['naver','kakao','daum']);
  assert.equal(entries[2].id,'kakao','Daum entry starts the Kakao flow and is recorded as kakao');
  assert.match(login.DAUM_HINT,/카카오계정/);
  assert.equal(login.buttonText({id:'naver',name:'네이버'},'login'),'네이버 계정으로 계속하기');
  assert.equal(login.buttonText({id:'apple',name:'Apple'},'link'),'Apple 계정 추가');
  assert.match(read('auth-site/auth.css'),/\.federated-apple\{background:#000;color:#fff\}/);
});
