import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const script=await readFile(new URL('../sites/ekodi-singles/public/verify.js',import.meta.url),'utf8');

async function render({session=true,code=200,error=null,member={status:'active',base_consent:true,adult_verified:false}}={}){
 const links=[],requests=[],events={};
 const verifyStatus={textContent:'준비 중입니다…',className:'notice',after(a){links.push(a)}};
 const verifyStart={hidden:true,disabled:false,addEventListener(type,cb){events[type]=cb}};
 const node=id=>id==='verifyStatus'?verifyStatus:id==='verifyStart'?verifyStart:null;
 const accessToken='a'.repeat(40);
 const webSession=session?{access_token:accessToken}:null;
 const client={auth:{getSession:async()=>({data:{session:webSession}})}};
 const window={supabase:{createClient:()=>client}};
 const fetch=async(url,opts={})=>{
  requests.push({url,method:opts.method||'GET',authorization:opts.headers?.authorization,cache:opts.cache,credentials:opts.credentials});
  if(url==='/singles/api/status')return new Response(JSON.stringify({
   identity_verification:{provider:'portone',store_id:'store-public-example',channel_key:'channel-key-public-example'},
   auth:{supabase_url:'https://example.supabase.co',publishable_key:'sb_publishable_example'}
  }),{status:200});
  if(url==='/singles/api/me')return new Response(JSON.stringify(code===200?{member}:{error:error||'server_unavailable'}),{status:code});
  throw Error('Unexpected external request: '+url);
 };
 const document={getElementById:node,createElement:tag=>({tagName:tag,href:'',className:'',textContent:''})};
 vm.runInNewContext(script,{window,document,fetch,URLSearchParams,location:{search:''},history:{replaceState(){}}},{timeout:1000});
 await new Promise(resolve=>setImmediate(resolve));
 return {verifyStatus,verifyStart,links,requests,events,accessToken};
}

test('guest keeps the canonical first-party login link and never starts verification',async()=>{
 const s=await render({session:false});
 assert.match(s.verifyStatus.textContent,/로그인 후/);
 assert.ok(s.links.some(x=>x.href.includes('/auth/')&&x.href.includes('site=singles')));
 assert.equal(s.verifyStart.hidden,true);
 assert.equal(s.requests.filter(x=>x.url==='/singles/api/me').length,0);
 assert.equal(s.requests.filter(x=>x.method!=='GET').length,0);
});

test('invite-only account sees pilot guidance, not an unusable PortOne button',async()=>{
 const s=await render({code:403,error:'pilot_only'});
 assert.match(s.verifyStatus.textContent,/초대받은 회원만/);
 assert.equal(s.verifyStart.hidden,true);
 assert.ok(s.links.some(x=>x.href==='/singles'));
 const me=s.requests.find(x=>x.url==='/singles/api/me');
 assert.equal(me.method,'GET');
 assert.equal(me.authorization,'Bearer '+s.accessToken);
 assert.equal(me.cache,'no-store');
 assert.equal(me.credentials,'omit');
 assert.equal(s.requests.filter(x=>x.method!=='GET').length,0);
});

test('member without completed participation consent gets the enrollment link',async()=>{
 for(const scenario of [{code:404,error:'member_not_found'},{member:{status:'withdrawn',base_consent:false,adult_verified:false}}]){
  const s=await render(scenario);
  assert.match(s.verifyStatus.textContent,/내 프로필/);
  assert.equal(s.verifyStart.hidden,true);
  assert.ok(s.links.some(x=>x.href==='/singles/my'));
 }
});

test('verified adult cannot accidentally start another identification transaction',async()=>{
 const s=await render({member:{status:'active',base_consent:true,adult_verified:true}});
 assert.match(s.verifyStatus.textContent,/이미 성인 본인인증이 완료/);
 assert.equal(s.verifyStart.hidden,true);
 assert.ok(s.links.some(x=>x.href==='/singles/subscribe'));
 assert.equal(s.requests.filter(x=>x.method!=='GET').length,0);
});

test('only active opted-in unverified member sees start; API outage fails closed',async()=>{
 const eligible=await render();
 assert.equal(eligible.verifyStart.hidden,false);
 assert.match(eligible.verifyStatus.textContent,/휴대폰 본인인증/);
 assert.ok(typeof eligible.events.click==='function');
 assert.equal(eligible.requests.filter(x=>x.method!=='GET').length,0);

 const outage=await render({code:503,error:'server_unavailable'});
 assert.equal(outage.verifyStart.hidden,true);
 assert.match(outage.verifyStatus.textContent,/회원 상태를 확인하지 못/);
 assert.equal(outage.requests.filter(x=>x.method!=='GET').length,0);
});
