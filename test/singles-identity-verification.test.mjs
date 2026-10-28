import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleSinglesSocial,isAdult} from '../supabase/functions/singles-api/social.ts';
import {routeSinglesSurface} from '../singles-surface.js';
const uid='11111111-1111-4111-8111-111111111111';
const settings={SINGLES_SOCIAL_ENABLED:'true',SINGLES_IDENTITY_PROVIDER_ENABLED:'true',PORTONE_API_SECRET:'test-secret'};
globalThis.Deno={env:{get:k=>settings[k]}};
const reply=(_r,b,s=200)=>new Response(JSON.stringify(b),{status:s});
function db({adult=null,pending={status:'pending'},rpc={}}={}){
 const calls=[];
 const member={status:'active',base_consent:true,age_19_confirmed:true,adult_verified_at:adult,religion_consent:true,discoverable:false};
 const make=name=>{const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:name==='singles_memberships'?member:name==='singles_identity_verifications'?pending:null,error:null})};return q};
 return {from:make,calls,rpc:async(n,p)=>{calls.push({n,p});return rpc[n]?rpc[n](p):{data:null,error:null}}};
}
const post=(path,b)=>new Request('https://x'+path,{method:'POST',body:JSON.stringify(b||{})});
const ID='ekodi-sgl-'+'a'.repeat(32);
const portone=(body,ok=true)=>{globalThis.fetch=async(url,opt)=>{assert.equal(String(url),'https://api.portone.io/identity-verifications/'+ID);assert.equal(opt.headers.authorization,'PortOne test-secret');return new Response(JSON.stringify(body),{status:ok?200:500})}};

test('만 19세 판정은 한국 시간 생일 경과 기준',()=>{
 const now=new Date('2026-10-27T15:30:00Z'); // KST 2026-10-28 00:30
 assert.equal(isAdult('2007-10-28',now),true);
 assert.equal(isAdult('2007-10-29',now),false);
 assert.equal(isAdult('1980-01-01',now),true);
 for(const bad of [undefined,'','2007/10/28','abc'])assert.equal(isAdult(bad,now),false);
});
test('start issues a server-made id bound to the member; already verified skips',async()=>{
 let a=db({rpc:{singles_identity_start:p=>({data:p.p_id,error:null})}});
 let r=await handleSinglesSocial(post('/identity/start'),'/identity/start',a,uid,reply);
 const b=await r.json();assert.match(b.identity_verification_id,/^ekodi-sgl-[0-9a-f]{32}$/);
 assert.equal(a.calls[0].p.p_user,uid);
 a=db({adult:'2026-10-01T00:00:00Z'});
 r=await handleSinglesSocial(post('/identity/start'),'/identity/start',a,uid,reply);
 assert.deepEqual(await r.json(),{ok:true,already_verified:true});
});
test('complete checks the provider server-side and stores only adult flag + CI hash',async()=>{
 let captured;
 const a=db({rpc:{singles_identity_complete:p=>{captured=p;return {data:'verified',error:null}}}});
 portone({status:'VERIFIED',id:ID,verifiedCustomer:{name:'홍길동',birthDate:'1990-05-05',phoneNumber:'01012345678',ci:'CI-VALUE'}});
 const r=await handleSinglesSocial(post('/identity/complete',{identity_verification_id:ID}),'/identity/complete',a,uid,reply);
 assert.equal(r.status,200);
 assert.equal(captured.p_adult,true);assert.match(captured.p_ci_hash,/^[0-9a-f]{64}$/);
 const sent=JSON.stringify(captured);for(const leak of ['홍길동','1990','0101234','CI-VALUE'])assert.ok(!sent.includes(leak),leak);
});
test('complete rejects unverified, minors, duplicates and provider outages',async()=>{
 const run=async(body,rpcResult,ok=true)=>{portone(body,ok);const a=db({rpc:{singles_identity_complete:()=>({data:rpcResult,error:null})}});
  const r=await handleSinglesSocial(post('/identity/complete',{identity_verification_id:ID}),'/identity/complete',a,uid,reply);return [r.status,(await r.json()).error]};
 assert.deepEqual(await run({status:'FAILED',id:ID},'verified'),[409,'identity_not_verified']);
 assert.deepEqual(await run({status:'VERIFIED',id:ID,verifiedCustomer:{birthDate:'2010-01-01',ci:'x'}},'rejected_minor'),[403,'adult_required']);
 assert.deepEqual(await run({status:'VERIFIED',id:ID,verifiedCustomer:{birthDate:'1990-01-01',ci:'x'}},'duplicate'),[409,'identity_already_used']);
 assert.deepEqual(await run({},'verified',false),[502,'identity_provider_unavailable']);
 const bad=await handleSinglesSocial(post('/identity/complete',{identity_verification_id:'../x'}),'/identity/complete',db(),uid,reply);
 assert.equal(bad.status,400);
});
test('without the provider secret the feature is closed',async()=>{
 delete settings.PORTONE_API_SECRET;
 const r=await handleSinglesSocial(post('/identity/start'),'/identity/start',db(),uid,reply);
 assert.equal(r.status,503);settings.PORTONE_API_SECRET='test-secret';
});
test('worker: verify page has its own wider CSP; other pages keep the strict one; config only when ids are set',async()=>{
 const env={ASSETS:{fetch:()=>new Response('')},SINGLES_M1_ENABLED:'true'};
 const v=await routeSinglesSurface(new Request('https://ekodi.kr/singles/verify'),env);
 assert.equal(v.status,200);assert.match(v.headers.get('content-security-policy'),/script-src 'self' https:\/\/cdn\.portone\.io/);
 assert.match(await v.text(),/이름·생년월일·전화번호를 저장하지 않고/);
 const home=await routeSinglesSurface(new Request('https://ekodi.kr/singles/'),env);
 assert.doesNotMatch(home.headers.get('content-security-policy'),/portone/);
 let s=await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/status'),env)).json();
 assert.equal(s.identity_verification,null);
 s=await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/api/status'),{...env,SINGLES_PORTONE_STORE_ID:'store-1234abcd-0000',SINGLES_PORTONE_IDENTITY_CHANNEL_KEY:'channel-key-1234abcd-0000'})).json();
 assert.equal(s.identity_verification.store_id,'store-1234abcd-0000');
 const ui=await readFile(new URL('../sites/ekodi-singles/public/verify.js',import.meta.url),'utf8');
 assert.match(ui,/requestIdentityVerification/);assert.doesNotMatch(ui,/PORTONE_API_SECRET|birthDate/);
});
