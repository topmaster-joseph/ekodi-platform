import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../admin-central-handoff.js',import.meta.url),'utf8');
const functionLine=name=>src.split('\n').find(line=>line.startsWith('function '+name+'('));
const handoff=functionLine('acceptCentralHandoff');
const showLoginSrc=functionLine('showLogin');
assert.ok(handoff);
assert.ok(showLoginSrc);

function simulateHandoff({blocked=false,hash='#ekodi_admin_token=one-use-example'}={}){
  let saved='',marked=[];
  const updates=[];
  const c={
    location:{hash,search:'',pathname:'/admin/services/engine-all'},
    sessionStorage:{
      setItem(_key,value){if(blocked)throw Error('storage_not_available');saved=value;},
      getItem(){return saved;}
    },
    URLSearchParams,
    routes:()=>({sectionFromPath:()=> 'engine-all'}),
    normalizeRoute:v=>v,
    cleanRouteUrl:()=>'/admin/services/engine-all',
    safeSession:{get:()=>saved,remove:()=>{saved='';}},
    history:{replaceState(_state,_title,target){updates.push(target);}},
    document:{title:'Admin'},
    mark:n=>marked.push(n),
    TOKEN_KEY:'ekodi-auth-token'
  };
  const state=vm.runInNewContext(handoff+';acceptCentralHandoff()',c);
  return {state,saved,updates,marked};
}

test('Google token handoff stores session before cleaning token URL',()=>{
  const result=simulateHandoff();
  assert.equal(result.state,true);
  assert.equal(result.saved,'one-use-example');
  assert.deepEqual(result.updates,['/admin/services/engine-all']);
  assert.ok(result.marked.includes('ekodi-admin-token-handoff'));
});
test('storage rejection fails visibly and cleans sensitive URL without authenticating',()=>{
  const result=simulateHandoff({blocked:true});
  assert.equal(result.state,'storage-failed');
  assert.equal(result.saved,'');
  assert.deepEqual(result.updates,['/admin/services/engine-all']);
  assert.ok(result.marked.includes('ekodi-admin-token-storage-failed'));
  assert.ok(src.includes("if(handoffState==='storage-failed')showLogin("));
});
test('normal page entry with no handoff does not create a session',()=>{
  const result=simulateHandoff({hash:''});
  assert.equal(result.state,false);
  assert.equal(result.saved,'');
  assert.deepEqual(result.updates,[]);
});
test('session failure text is visible in the pre-auth login screen',()=>{
  let diagnostic;
  const screen={hidden:true,querySelector(selector){
    if(selector==='#centralAdminLoginCopy')return {insertAdjacentElement(_position,node){diagnostic=node;}};
    if(selector==='#adminLoginDiagnostic')return diagnostic;
    return null;
  },prepend(node){diagnostic=node;}};
  const app={hidden:false,style:{visibility:'visible'}};
  const state={app,loginScreen:screen,apiState:{textContent:''},
    safeSession:{remove:()=>{}},EK:'ekodi-admin-email',TOKEN_KEY:'ekodi-auth-token',
    resetPreAuthSurface:()=>{},ensureCentralLoginFallback:()=>{},syncLoginLink:()=>{},
    document:{createElement:()=>({id:'',className:'',setAttribute(k,v){this[k]=v;},textContent:''})}
  };
  vm.runInNewContext(showLoginSrc+';showLogin("인증 정보를 저장할 수 없습니다")',state);
  assert.equal(app.hidden,true);
  assert.equal(screen.hidden,false);
  assert.equal(diagnostic?.role,'alert');
  assert.equal(diagnostic?.textContent,'인증 정보를 저장할 수 없습니다');
});
