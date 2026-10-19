import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../shell/public-surface-admin.js',import.meta.url),'utf8');
const wait=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};

function harness(fetcher){
  const classNames=new Set();
  const rootAttrs=new Set();
  const dispatched=[];
  const popups=[];
  const doc={
    documentElement:{
      dataset:{ekodiService:'fixture'},
      setAttribute:name=>rootAttrs.add(name),
      removeAttribute:name=>rootAttrs.delete(name)
    },
    body:{
      classList:{
        add:name=>classNames.add(name),
        remove:name=>classNames.delete(name),
        contains:name=>classNames.has(name)
      }
    },
    createElement(tag){
      assert.equal(tag,'button');
      const handlers={};
      const attrs=new Map();
      return {
        tagName:tag,dataset:{},removed:false,
        setAttribute:(k,v)=>attrs.set(k,v),
        addEventListener:(k,cb)=>handlers[k]=cb,
        click(){handlers.click?.();},
        remove(){this.removed=true;this.parent?.children.splice(this.parent.children.indexOf(this),1);}
      };
    },
    querySelector:()=>null
  };
  const window={
    dispatchEvent:e=>dispatched.push(e.type),
    open:(...args)=>{popups.push(args);return {opened:true};}
  };
  const context={
    window,document:doc,fetch:fetcher,URL,Headers,Response,URLSearchParams,Set,Map,
    location:{origin:'https://ekodi.kr'},
    CSS:{escape:v=>String(v)},
    CustomEvent:class{constructor(type,props){this.type=type;this.detail=props?.detail;}},
  };
  vm.runInNewContext(source,context);
  const target={
    children:[],
    append(child){child.parent=this;this.children.push(child);},
    prepend(child){child.parent=this;this.children.unshift(child);},
    querySelector(selector){
      const panel=selector.match(/data-ekodi-public-admin-panel="([^"]+)"/)?.[1];
      return this.children.find(c=>!c.removed&&c.dataset.ekodiPublicAdminPanel===panel)||null;
    }
  };
  return {runtime:window.EKODIPublicSurfaceAdmin,target,rootAttrs,classNames,popups,dispatched};
}
const grants={ok:true,permissions:{activities:true}};
const approved=()=>new Response(JSON.stringify(grants),{status:200,headers:{'content-type':'application/json'}});

test('successful auth adds one inline action; absent token revokes, removes and blocks stale clicks',async()=>{
  let bearer='token-1';
  const {runtime,target,popups,rootAttrs}=harness(async()=>approved());
  const admin=runtime.create({serviceId:'mission',adminPath:'/ekodimission/admin/activities',tokenProvider:()=>bearer});
  assert.ok(await admin.authorize());
  const button=admin.attach(target,{panel:'activities',permission:'activities',presentation:'window'});
  assert.equal(target.children.length,1);
  assert.equal(admin.attach(target,{panel:'activities',permission:'activities'}),button,'no duplicate button');
  button.click();
  assert.equal(popups.length,1);
  bearer='';
  assert.equal(await admin.authorize(),null);
  assert.equal(admin.principal(),null);
  assert.equal(admin.has('activities'),false);
  assert.equal(target.children.length,0);
  assert.equal(button.removed,true);
  button.click();
  assert.equal(popups.length,1,'stale handler cannot open admin panel');
  assert.equal(admin.open('activities'),null,'direct opening also fails closed');
  assert.equal(rootAttrs.has('data-ekodi-public-admin'),false);
});

test('permission shrink or forbidden response clears old capabilities and drawer controls',async()=>{
  let mode='success';
  const fetcher=async()=>{
    if(mode==='403')return new Response('{}',{status:403});
    if(mode==='viewer')return new Response(JSON.stringify({ok:true,permissions:{activities:false}}),{status:200});
    if(mode==='network')throw new Error('offline');
    return approved();
  };
  const {runtime,target}=harness(fetcher);
  const admin=runtime.create({tokenProvider:()=> 'token'});
  for(const denial of ['viewer','403','network']){
    mode='success';await admin.authorize();
    const button=admin.attach(target,{panel:'activities',permission:'activities'});
    assert.ok(button);
    mode=denial;
    assert.equal(await admin.authorize(),null,denial);
    assert.equal(admin.has('activities'),false,denial);
    assert.equal(admin.attach(target,{panel:'activities',permission:'activities'}),null,denial);
    assert.equal(target.children.length,0,denial);
  }
});

test('latest auth result wins; an older delayed result cannot restore revoked permissions',async()=>{
  const pending=[deferred(),deferred()];
  let requests=0;
  const {runtime,target}=harness(()=>pending[requests++].promise);
  const admin=runtime.create({tokenProvider:()=> 'token'});
  const earlier=admin.authorize();
  await wait();
  const later=admin.authorize();
  await wait();
  assert.equal(requests,2);
  pending[1].resolve(new Response('{}',{status:403}));
  assert.equal(await later,null);
  pending[0].resolve(approved());
  assert.equal(await earlier,null,'stale request ignored');
  assert.equal(admin.has('activities'),false);
  assert.equal(admin.attach(target,{panel:'activities',permission:'activities'}),null);
});

test('explicit reset invalidates in-flight authorization and all stale actions',async()=>{
  const gate=deferred();
  const {runtime,target}=harness(()=>gate.promise);
  const admin=runtime.create({tokenProvider:()=> 'token'});
  const future=admin.authorize();
  await wait();
  admin.reset();
  gate.resolve(approved());
  assert.equal(await future,null);
  assert.equal(admin.principal(),null);
  assert.equal(admin.attach(target,{panel:'activities',permission:'activities'}),null);
});

test('relogin reattaches a fresh permitted button; foreign admin destinations remain blocked',async()=>{
  let valid=true;
  const {runtime,target,popups}=harness(()=>valid?approved():new Response('{}',{status:401}));
  assert.throws(()=>runtime.create({adminPath:'https://external.invalid/admin'}),/cross_origin_admin_target_forbidden/);
  const admin=runtime.create({tokenProvider:()=> 'token'});
  await admin.authorize();
  const old=admin.attach(target,{panel:'activities',permission:'activities',presentation:'window'});
  valid=false;await admin.authorize();
  valid=true;await admin.authorize();
  const next=admin.attach(target,{panel:'activities',permission:'activities',presentation:'window'});
  assert.notEqual(next,old);
  old.click();assert.equal(popups.length,0);
  next.click();assert.equal(popups.length,1);
  assert.match(popups[0][0],/^\/admin\/\?panel=activities$/);
});
