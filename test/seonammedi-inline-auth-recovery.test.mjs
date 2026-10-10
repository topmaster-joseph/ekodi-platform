import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('notice auth handoff finishes before in-place administrator authorization',async()=>{
  const app=await read('sites/seonammedi/public/app.js');
  const flow=app.slice(app.indexOf('async function initNoticeFlow(){'),app.indexOf('\ninitNoticeFlow();'));
  assert.match(flow,/await consumeNoticeHandoff\(\)/);
  assert.match(flow,/await loadNotices\(\);\s*\/\/ Auth handoff[\s\S]*?await initPublicAdminControls\(\)/);
  assert.match(app,/if\(publicAdminInitPromise\)return publicAdminInitPromise/);
  assert.match(app,/ekodi:public-admin-runtime-ready/);
  assert.doesNotMatch(app,/^initPublicAdminControls\(\);$/m);
});

test('shared Shell announces runtime readiness to late-loaded service code',async()=>{
  const source=await read('shell/public-surface-admin.js');
  const events=[];
  const window={dispatchEvent:event=>events.push(event)};
  class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail}}
  runInNewContext(source,{window,CustomEvent});
  assert.equal(window.EKODIPublicSurfaceAdmin.version,2);
  assert.deepEqual(events.map(event=>event.type),['ekodi:public-admin-runtime-ready']);
});

test('voice inline manager recovers after first unauthenticated load without duplicate observers',async()=>{
  const source=await read('sites/seonammedi/public/voice-public-admin.js');
  const listeners=new Map();
  const window={
    addEventListener(name,callback){const callbacks=listeners.get(name)||[];callbacks.push(callback);listeners.set(name,callbacks)},
    dispatchEvent(event){for(const callback of listeners.get(event.type)||[])callback(event)},
  };
  let accessToken='',authorizationCount=0,requestCount=0,observerCount=0;
  window.EKODIPublicSurfaceAdmin={
    create(){
      return {authorize:async()=>{
        authorizationCount+=1;
        return accessToken?{ok:true,permissions:{voices:true}}:null;
      }};
    },
  };
  const root={querySelectorAll:()=>[]};
  const document={readyState:'complete',getElementById:id=>id==='publicVoiceList'?root:null};
  class MutationObserver{
    observe(){observerCount+=1}
    disconnect(){}
  }
  const fetch=async path=>{
    assert.equal(path,'/board/api/admin/posts');
    requestCount+=1;
    return {ok:true,status:200,json:async()=>({ok:true,items:[]})};
  };
  runInNewContext(source,{
    window,document,MutationObserver,fetch,Headers,
    sessionStorage:{getItem:key=>key==='ekodi-auth-token'?accessToken:''},
    localStorage:{getItem:()=>''},
    requestAnimationFrame:callback=>callback(),
    confirm:()=>false,alert:()=>{},
  });
  await tick();
  assert.equal(authorizationCount,0);
  assert.equal(observerCount,0);
  accessToken='test-session-token';
  window.dispatchEvent({type:'seonammedi:voice-inline-admin-authorized',detail:{serviceId:'seonammedi'}});
  await tick();
  assert.equal(authorizationCount,1);
  assert.equal(requestCount,1);
  assert.equal(observerCount,1);
  window.dispatchEvent({type:'seonammedi:voice-inline-admin-authorized',detail:{serviceId:'seonammedi'}});
  await tick();
  assert.equal(observerCount,1);
  assert.equal(requestCount,2);
});
