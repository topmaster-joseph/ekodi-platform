import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleSinglesSocial,PROFILE_FIELDS,REGIONS,profileScore} from '../supabase/functions/singles-api/social.ts';
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const settings={SINGLES_SOCIAL_ENABLED:'true'};
globalThis.Deno={env:{get:k=>settings[k]}};
const reply=(_r,b,s=200)=>new Response(JSON.stringify(b),{status:s});
function db({religion=true,profile=null,list=[]}={}){
 const writes=[];
 const member={status:'active',base_consent:true,age_19_confirmed:true,adult_verified_at:'2026-10-09T00:00:00Z',religion_consent:religion,discoverable:true};
 const make=name=>{const q={kind:null,select(){return q},eq(){return q},neq(){return q},not(){return q},or(){return q},in(){return q},limit(){return q},order(){return q},gte(){return q},
  upsert(row){writes.push({name,row});q.kind='w';return q},update(row){writes.push({name,row});q.kind='w';return q},
  maybeSingle:async()=>({data:name==='singles_memberships'?member:name==='singles_profiles'?profile:null,error:null}),
  then(ok,f){const data=q.kind?null:name==='singles_memberships'?[{user_id:other}]:name==='singles_profiles'?list:[];return Promise.resolve({data,error:null}).then(ok,f)}};return q};
 return {from:make,writes,rpc:async()=>({data:0,error:null})};
}
const put=b=>new Request('https://x/profile',{method:'PUT',body:JSON.stringify(b),headers:{'content-type':'application/json'}});
const base={display_name:'동행이',broad_region:'전남광주',intro:'안녕하세요',public_link:'',discoverable:false};
async function call(admin,req,path){const r=await handleSinglesSocial(req,path,admin,uid,reply);return {status:r.status,body:await r.json()}}

test('항목·공개 선택 저장: 카탈로그 항목만, 선택지·글자 수 검증',async()=>{
 const a=db();
 let r=await call(a,put({...base,details:{real_name:'정찬균',gender:'남성',age_band:'40대 후반',hobbies:'독서'},visibility:{real_name:false,gender:true,broad_region:true}}),'/profile');
 assert.equal(r.status,200);
 const row=a.writes.find(w=>w.name==='singles_profiles').row;
 assert.deepEqual(row.details,{real_name:'정찬균',gender:'남성',age_band:'40대 후반',hobbies:'독서'});
 assert.equal(row.visibility.real_name,false);
 for(const bad of [{details:{phone:'010'}},{details:{gender:'기타'}},{details:{occupation:'x'.repeat(41)}},{visibility:{phone:true}},{visibility:{gender:'yes'}},{details:[]}]){
  r=await call(db(),put({...base,...bad}),'/profile');assert.equal(r.status,400,JSON.stringify(bad));
 }
});
test('지역은 시·도 목록에서만(전남광주 포함), 빈 값 허용',async()=>{
 assert.ok(REGIONS.includes('전남광주'));assert.ok(!REGIONS.includes('광주'));
 assert.equal((await call(db(),put({...base,broad_region:'무안군 청계면'}),'/profile')).status,400);
 assert.equal((await call(db(),put({...base,broad_region:''}),'/profile')).status,200);
});
test('신앙 항목은 민감정보 동의 회원만 저장',async()=>{
 const r=await call(db({religion:false}),put({...base,details:{church:'에코디교회'}}),'/profile');
 assert.equal(r.status,403);assert.equal(r.body.error,'faith_consent_required');
 assert.equal((await call(db({religion:true}),put({...base,details:{church:'에코디교회'}}),'/profile')).status,200);
});
test('이전 화면이 보낸 요청(항목 없음)도 계속 저장되고 기존 항목을 지우지 않음',async()=>{
 const a=db();assert.equal((await call(a,put(base),'/profile')).status,200);
 const row=a.writes.find(w=>w.name==='singles_profiles').row;
 assert.ok(!('details' in row)&&!('visibility' in row));
});
test('동행 찾기: 공개로 고른 항목만 응답에 싣는다',async()=>{
 const list=[{user_id:other,display_name:'별명',broad_region:'서울',intro:'소개',public_link:'https://a.kr',
  details:{real_name:'홍길동',gender:'여성',occupation:'교사'},visibility:{gender:true,real_name:false,broad_region:false,intro:true}}];
 const r=await call(db({list}),new Request('https://x/discover'),'/discover');
 assert.equal(r.status,200);const p=r.body.profiles[0];
 assert.deepEqual(p.details,{gender:'여성'});
 assert.equal(p.broad_region,'');assert.equal(p.intro,'소개');
 assert.equal(p.public_link,'https://a.kr'); // 공개 선택 이전 프로필 호환: 키가 없으면 기존처럼 공개
 assert.ok(!JSON.stringify(r.body).includes('홍길동'));
});
test('입력·공개 점수: 신앙 항목 제외, 공개 수는 입력된 항목 중',()=>{
 const s=profileScore({broad_region:'서울',intro:'',details:{gender:'남성',church:'교회',faith_life:'x'},visibility:{gender:true,broad_region:false}});
 assert.equal(s.total,2+Object.values(PROFILE_FIELDS).filter(f=>!f.sensitive).length);
 assert.equal(s.filled,2);assert.equal(s.public,1);
});
test('화면 카탈로그가 서버와 같다(항목 키·지역·신앙 표시)',()=>{
 const app=readFileSync(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');
 assert.ok(app.includes('const REGIONS='+JSON.stringify(REGIONS).replace(/"/g,"'")+';'));
 for(const [k,f] of Object.entries(PROFILE_FIELDS)){assert.match(app,new RegExp("key:'"+k+"'[^}]*detail:true"+(f.sensitive?",sensitive:true":"")),k)}
 assert.doesNotMatch(app,/vcard|\.vcf/i,'디지털 명함 가져오기 제거');
 assert.match(app,/많이 입력하고 많이 공개할수록 같은 요청의 요금이 낮아지고/);
 assert.match(app,/민감정보는 요금 산정에 쓰지 않습니다/);
});
test('로그인은 매번 Google 계정 선택',()=>{
 const app=readFileSync(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');
 const surface=readFileSync(new URL('../singles-surface.js',import.meta.url),'utf8');
 const auth=readFileSync(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
 assert.match(app,/searchParams\.set\('select_account','1'\)/);
 assert.match(surface,/site=singles&amp;select_account=1&amp;return_to=/);
 assert.match(auth,/const SINGLES_CHOOSE_ACCOUNT=site==='singles'&&params\.get\('select_account'\)==='1'/);
 assert.match(auth,/if\(SINGLES_CHOOSE_ACCOUNT\)\{await renderGoogle\(\);return\}/);
 assert.match(auth,/if\(SINGLES_CHOOSE_ACCOUNT&&event!=='SIGNED_OUT'\)return;/);
});
