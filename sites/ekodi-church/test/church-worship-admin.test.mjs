import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const script=await readFile(new URL('../church-worship-admin.js',import.meta.url),'utf8');
const home=await readFile(new URL('../index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function mount(){
  let token='',responsePayload={ok:true,permissions:{worship:true}},status=200;
  const calls=[],events=new Map();
  const on=(where,key,cb)=>{
    const k=where+':'+key,list=events.get(k)||[];list.push(cb);events.set(k,list);
  };
  const link={hidden:true,href:'/ekodichurch/admin/worship'};
  const document={visibilityState:'visible',querySelector:selector=>selector==='[data-church-worship-admin]'?link:null,addEventListener:(key,cb)=>on('document',key,cb)};
  const window={addEventListener:(key,cb)=>on('window',key,cb)};
  const sessionStorage={getItem:key=>key==='ekodi-auth-token'?token:null};
  const fetch=async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify(responsePayload),{status});
  };
  runInNewContext(script,{document,window,sessionStorage,fetch,AbortSignal,Date});
  const fire=(where,key)=>{for(const cb of events.get(where+':'+key)||[])cb()};
  return {
    link,calls,fire,
    setToken:v=>{token=v},
    setDecision:(payload,nextStatus=200)=>{responsePayload=payload;status=nextStatus}
  };
}

test('Church visitor cannot see management link without a verified session',async()=>{
  const x=mount();await tick();
  assert.equal(x.link.hidden,true);
  assert.equal(x.calls.length,0);
});

test('authorized Church operator gains inline link, revoked role or logout loses it',async()=>{
  const x=mount();
  x.setToken('test-session');
  x.fire('window','focus');await tick();
  assert.equal(x.link.hidden,false);
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].options.method,'GET');
  assert.match(x.calls[0].url,/scope=worship-access/);
  assert.equal(x.calls[0].options.headers.authorization,'Bearer test-session');
  assert.match(x.calls[0].options.headers.apikey,/^sb_publishable_/);
  x.setDecision({error:'ROLE_NOT_ALLOWED'},403);
  x.fire('window','pageshow');await tick();
  assert.equal(x.link.hidden,true);
  x.setDecision({ok:true,permissions:{worship:true}});
  x.fire('window','pageshow');await tick();
  assert.equal(x.link.hidden,false);
  x.setToken('');
  x.fire('window','ekodi:auth-logout');await tick();
  assert.equal(x.link.hidden,true);
  assert.equal(x.calls.length,3);
});

test('Church homepage retains public worship while hiding permission-only controls by default',()=>{
  assert.match(home,/data-church-worship-admin[^>]*hidden/);
  assert.match(home,/church-worship-admin\.js/);
  assert.match(home,/href="\/ekodichurch\/admin\/worship"/);
  assert.match(css,/\.church-worship-admin-inline\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(script,/service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY/i);
});
