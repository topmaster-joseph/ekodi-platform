import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script=readFileSync(new URL('../sites/seonammedi/public/voice-public-admin.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{
  let resolve;
  const promise=new Promise(ok=>resolve=ok);
  return{promise,resolve};
};
function fixture(fetcher=async()=>({items:[]})){
  let bearer='',canManage=true,creates=0,resets=0,observes=0,disconnects=0;
  const handlers=new Map();
  const root={managed:[],querySelectorAll(selector){
    if(selector==='[data-voice-id]')return [];
    if(selector.includes('data-seonammedi-voice-admin')||selector.includes('data-voice-admin-reply-delete'))return this.managed.filter(x=>!x.removed);
    return [];
  }};
  const window={
    addEventListener(name,callback){const a=handlers.get(name)||[];a.push(callback);handlers.set(name,a);},
    dispatchEvent(event){for(const cb of handlers.get(event.type)||[])cb(event);}
  };
  window.EKODIPublicSurfaceAdmin={create(){
    creates++;
    return{authorize:async()=>canManage?{ok:true,permissions:{voices:true}}:{ok:false},reset:()=>{resets++}};
  }};
  const document={readyState:'complete',getElementById:id=>id==='publicVoiceList'?root:null};
  class MutationObserver {
    observe(){observes++}
    disconnect(){disconnects++}
  }
  const fetch=async (path,options)=>{
    assert.equal(path,'/board/api/admin/posts');
    const data=await fetcher({bearer,options});
    if(data===403)return {ok:false,status:403,json:async()=>({message:'forbidden'})};
    return {ok:true,status:200,json:async()=>({ok:true,...data})};
  };
  runInNewContext(script,{
    window,document,MutationObserver,fetch,Headers,
    sessionStorage:{getItem:key=>key==='ekodi-auth-token'?bearer:''},
    localStorage:{getItem:()=>''},queueMicrotask,requestAnimationFrame:callback=>callback(),
    confirm:()=>false,alert:()=>{},setTimeout,
  });
  function addManager(){
    const nodes=['manager','reply'].map(type=>({
      type,removed:false,remove(){this.removed=true;}
    }));
    root.managed.push(...nodes);
    return nodes;
  }
  return{
    setToken:v=>bearer=v,setAllowed:v=>canManage=v,
    dispatch:type=>window.dispatchEvent({type}),
    addManager,root,
    state:()=>({bearer,creates,resets,observes,disconnects})
  };
}

test('logout and focus clear inline voice forms and reply delete controls; valid login recovers',async()=>{
  const f=fixture();
  await tick();
  f.setToken('admin-old');
  f.dispatch('ekodi:public-admin-runtime-ready');
  await tick();await tick();
  assert.equal(f.state().creates,1);
  assert.equal(f.state().observes,1);
  const nodes=f.addManager();
  f.setToken('');
  f.dispatch('focus');
  await tick();
  assert.ok(nodes.every(n=>n.removed),'admin and reply-delete UI removed');
  assert.ok(f.state().resets>=1,'existing controller reset');
  assert.equal(f.root.managed.filter(n=>!n.removed).length,0);
  f.setToken('admin-new');
  f.dispatch('focus');
  await tick();await tick();
  assert.equal(f.state().creates,2,'new account is authorized separately');
  assert.equal(f.state().observes,2,'observer recreated only after fresh role check');
});

test('401/403 from private management API tears down existing controls',async()=>{
  let blocked=false;
  const f=fixture(async()=>blocked?403:{items:[]});
  f.setToken('admin-token');
  f.dispatch('ekodi:public-admin-runtime-ready');
  await tick();await tick();
  const nodes=f.addManager();
  blocked=true;
  f.dispatch('pageshow');
  await tick();await tick();
  assert.ok(nodes.every(n=>n.removed),'expired/revoked privilege cannot leave old action nodes');
  assert.ok(f.state().resets>=1);
});

test('role loss on repeated authorization does not show or keep manager controls',async()=>{
  const f=fixture();
  f.setToken('admin-token');
  f.dispatch('ekodi:public-admin-runtime-ready');
  await tick();await tick();
  const nodes=f.addManager();
  f.setAllowed(false);
  f.dispatch('storage'); // token is unchanged; must refresh admin API rights
  await tick();await tick();
  // Existing rights may still be displayed until API-side revalidation;
  // now changing the account forces a full permission probe.
  f.setToken('another-account');
  f.dispatch('focus');
  await tick();await tick();
  assert.ok(nodes.every(n=>n.removed));
});

test('mid-flight account change ignores previous private rows and retries only new token',async()=>{
  const first=deferred();
  const seen=[];
  const f=fixture(async({bearer})=>{
    seen.push(bearer);
    if(bearer==='old-token')return first.promise;
    return {items:[]};
  });
  f.setToken('old-token');
  f.dispatch('ekodi:public-admin-runtime-ready');
  await tick();await tick();
  assert.deepEqual(seen,['old-token']);
  const nodes=f.addManager();
  f.setToken('new-token');
  f.dispatch('focus');
  assert.ok(nodes.every(n=>n.removed),'switch immediately removes stale private controls');
  first.resolve({items:[{id:1,contact:'private@example.invalid'}]});
  await tick();await tick();await tick();await tick();
  assert.deepEqual(seen,['old-token','new-token'],'fresh identity is retried once');
});
