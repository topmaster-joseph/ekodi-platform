import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function createFixture(source,profile=false,inboxError=false,initialReadFailure=true){
  const nodes=new Map();
  const listeners=Object.create(null);
  const calls=[];
  const element=(id='')=>({
    id,value:'',checked:false,disabled:false,hidden:true,textContent:'',className:'',children:[],
    addEventListener(type,handler){this.listeners??={};this.listeners[type]=handler;},
    querySelectorAll(){return [];},querySelector(){return null;},
    replaceChildren(...items){this.children=[...items];},
    append(...items){this.children.push(...items);},
    appendChild(item){this.children.push(item);return item;},
    setAttribute(){},removeAttribute(){},
  });
  const get=selector=>{
    const id=selector.slice(1);
    if(!nodes.has(id))nodes.set(id,element(id));
    return nodes.get(id);
  };
  const form=get(profile?'#publicProfileForm':'#digitalCardForm');
  form.querySelectorAll=()=>[...nodes.values()].filter(n=>n!==get('#digitalCardRetry')&&n!==get('#publicProfileRetry'));
  let rejectRead=initialReadFailure;
  const dataProfile={handle:'joseph',headline:'Hello',bio:'',links:[],visibility:'private'};
  const fetch=async(url,opts)=>{
    const name=url.split('/').pop();
    calls.push(name);
    const fail=(rejectRead&&(profile?name==='get_my_public_profile':name==='get_my_identity_share_config'))||(inboxError&&name==='get_my_contact_exchanges');
    const data=fail?{message:'Temporary read failure'}:
      name==='get_my_public_profile'||name==='set_my_public_profile'?dataProfile:
      name==='get_my_identity_share_config'?{phone:'010-1234-5678',email:'test@example.com',exchange_enabled:true,roles:[],messengers:[],contexts:[]}:
      name==='get_my_contact_exchanges'?{items:[]}:{};
    return {ok:!fail,json:async()=>data};
  };
  const window={
    EKODI_MY_CONFIG:{supabaseUrl:'https://example.invalid',supabasePublishableKey:'test-public-key'},
    EKODI_MY_AUTH:{getAccessToken:()=> 'test.jwt.value',isSignedIn:()=>true},
    addEventListener:(name,handler)=>{listeners[name]=handler;},
    dispatchEvent:()=>{},
  };
  const document={
    querySelector:get,
    createElement:tag=>element(tag),
    createTextNode:txt=>({textContent:txt}),
  };
  const context={window,document,fetch,Option:class{},CustomEvent:class{}};
  runInNewContext(read(source),context,{filename:source});
  return {
    nodes,get,calls,listeners,allowRead(){rejectRead=false;},
    submit(){form.listeners.submit({preventDefault(){}});},
    retry(){get(profile?'#publicProfileRetry':'#digitalCardRetry').listeners.click();},
  };
}

test('public page blocks writes after failed initial read, permits retry and normal save',async()=>{
  const h=createFixture('my/public-profile.js',true);
  await tick();
  assert.equal(h.get('#savePublicProfile').disabled,true);
  assert.equal(h.get('#publicProfileRetry').hidden,false);
  h.submit();
  await tick();
  assert.ok(!h.calls.includes('set_my_public_profile'),'Must not write after read failure');
  h.allowRead();
  h.retry();
  await tick();
  assert.equal(h.get('#savePublicProfile').disabled,false);
  assert.equal(h.get('#publicProfileRetry').hidden,true);
  assert.equal(h.get('#publicHandle').value,'joseph');
  h.submit();
  await tick();
  assert.equal(h.calls.filter(x=>x==='set_my_public_profile').length,1);
});

test('digital card blocks writes after failed initial read, permits retry and normal save',async()=>{
  const h=createFixture('my/digital-card-admin.js');
  await tick();
  assert.equal(h.get('#digitalCardSave').disabled,true);
  assert.equal(h.get('#digitalCardRetry').hidden,false);
  assert.equal(h.get('#digitalCardPhone').value,'');
  h.submit();
  await tick();
  assert.ok(!h.calls.includes('set_my_identity_share_config_v2'),'Must not write empty data after read failure');
  h.allowRead();
  h.retry();
  await tick();
  assert.equal(h.get('#digitalCardSave').disabled,false);
  assert.equal(h.get('#digitalCardRetry').hidden,true);
  assert.equal(h.get('#digitalCardPhone').value,'010-1234-5678');
  h.submit();
  await tick();
  assert.equal(h.calls.filter(x=>x==='set_my_identity_share_config_v2').length,1);
});

test('retry actions are present outside protected forms and avoid extra data writes',()=>{
 const html=read('my/index.html');
 assert.match(html,/<\/form><button id="publicProfileRetry"[^>]+hidden>/);
 assert.match(html,/<\/form><button id="digitalCardRetry"[^>]+hidden>/);
 assert.equal((html.match(/id="publicProfileRetry"/g)||[]).length,1);
 assert.equal((html.match(/id="digitalCardRetry"/g)||[]).length,1);
});

test('received-contact outage does not disable otherwise loaded digital card settings',async()=>{
  const h=createFixture('my/digital-card-admin.js',false,true,false);
  await tick();
  assert.equal(h.get('#digitalCardSave').disabled,false);
  assert.equal(h.get('#digitalCardRetry').hidden,true);
  assert.match(h.get('#contactExchangeInboxStatus').textContent,/불러오지 못했습니다/);
  h.submit();
  await tick();
  assert.equal(h.calls.filter(x=>x==='set_my_identity_share_config_v2').length,1);
});

test('secondary feature loader cache keys invalidate obsolete unsafe save handlers',()=>{
  const index=read('my/index.html');
  const loader=read('my/secondary-feature-loader.js');
  assert.match(index,/secondary-feature-loader\.js\?v=20261103-read-guard-v1/);
  assert.match(loader,/public-profile\.js\?v=20261103-read-guard-v1/);
  assert.match(loader,/digital-card-admin\.js\?v=20261103-read-guard-v1/);
});
