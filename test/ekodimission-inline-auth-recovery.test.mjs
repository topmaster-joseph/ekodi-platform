import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const source=await readFile(new URL('../space/ekodimission.js',import.meta.url),'utf8');
const begin=source.indexOf('  function missionAdminToken(){');
const end=source.indexOf('  if(!form)return;',begin);
assert.ok(begin>=0&&end>begin,'Mission in-place admin module must exist');
const isolated=source.slice(begin,end);

test('Mission late-login inline administration honors server permissions, recovers, and revokes',async()=>{
  let bearer='',allowed=true,createCount=0,authorizations=0,attachCalls=0,removed=0,resets=0;
  const eventCallbacks=new Map();
  const on=(target,type,cb)=>{
    const key=target+':'+type,arr=eventCallbacks.get(key)||[];
    arr.push(cb);eventCallbacks.set(key,arr);
  };
  const dispatch=(target,type)=>{
    for(const cb of eventCallbacks.get(target+':'+type)||[])cb({type});
  };
  let mountedButton=null;
  const head={append(){}};
  const document={
    visibilityState:'visible',
    querySelector:selector=>selector==='.mission-activity-index-head'?head:null,
    addEventListener:(type,cb)=>on('document',type,cb),
  };
  const window={
    addEventListener:(type,cb)=>on('window',type,cb),
  };
  const sessionStorage={getItem:key=>key==='ekodi-auth-token'?bearer:''};
  runInNewContext('(()=>{const form=null,activityItems=[],applicationRecordKey="pilot";'+isolated+'})()',{
    window,document,sessionStorage,queueMicrotask,
  });
  await tick();
  assert.equal(createCount,0,'guests do not attempt admin access');
  bearer='mission-operator-token';
  window.EKODIPublicSurfaceAdmin={version:2,create:options=>{
    createCount+=1;
    assert.equal(options.serviceId,'mission');
    assert.equal(options.authEndpoint,'/ekodimission/api/admin/me');
    return {
      authorize:async()=>{authorizations+=1;return allowed?{ok:true,permissions:{activities:true}}:null},
      has:cap=>allowed&&cap==='activities',
      attach:(target,descriptor)=>{
        assert.equal(target,head);
        assert.equal(descriptor.permission,'activities');
        assert.equal(descriptor.presentation,'window');
        attachCalls+=1;
        if(mountedButton)return mountedButton;
        mountedButton={remove(){removed+=1;mountedButton=null}};
        return mountedButton;
      },
      reset:()=>{resets+=1},
    };
  }};
  dispatch('window','ekodi:public-admin-runtime-ready');
  await tick();
  assert.equal(createCount,1);
  assert.equal(authorizations,1);
  assert.equal(attachCalls,1);
  dispatch('window','focus');
  await tick();
  assert.equal(createCount,1,'controller is reusable');
  assert.equal(removed,0,'focus does not tear down allowed buttons');
  allowed=false;
  dispatch('window','pageshow');
  await tick();
  assert.equal(removed,1,'revoked server permissions remove active controls');
  assert.ok(resets>=1);
  allowed=true;
  dispatch('window','pageshow');
  await tick();
  assert.equal(attachCalls,3,'restored permissions allow remount');
  bearer='';
  dispatch('document','visibilitychange');
  await tick();
  assert.equal(removed,2,'logout removes management affordances');
});

test('Mission admin checks authorization asynchronously and never shows controls on an unauthorized first load',()=>{
  assert.match(isolated,/if\(!token\)\{clearMissionPublicAdmin\(\);return false\}/);
  assert.match(isolated,/if\(token!==missionAdminToken\(\)\|\|!me\?\.ok\|\|!admin\.has\('activities'\)\)/);
  assert.match(isolated,/missionAdminPending/);
  assert.match(isolated,/ekodi:public-admin-runtime-ready/);
  assert.match(isolated,/visibilitychange/);
  assert.match(isolated,/pageshow/);
});
