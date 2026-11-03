import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
const store={id:'store-1',slug:'jadam',name:'자담치킨',role:'store_owner',kind:'store',status:'active'};
const tenant={id:'org-1',slug:'cgma',name:'청계상인회',role:'tenant_admin',kind:'tenant',status:'active'};
const expiry=Math.floor(Date.now()/1000)+3600;
function storage(data={}){const values=new Map(Object.entries(data));return{
  getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)
}}
function element(){return{children:[],dataset:{},value:'person',textContent:'',href:'',hidden:false,disabled:false,handlers:{},
  setAttribute(){},addEventListener(type,handler){this.handlers[type]=handler},
  replaceChildren(...children){this.children=children;this.textContent=''},append(...children){this.children.push(...children)}}}
function page({spaces=[store,tenant],result=null,storeResponse=null,guest=false}={}){
  const elements=new Map(),calls=[];
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
  const doc={body:{dataset:{}},getElementById:get,createElement:element,
    querySelector:()=>element(),querySelectorAll:()=>[]};
  const sess=storage(guest?{}:{'ekodi-management-session':JSON.stringify({
    accessToken:'member-token',refreshToken:'refresh-token',expiresAt:expiry,user:{id:'user-1',email:'user@example.test'}
  })});
  const payload=result??{dataPolicy:'verified-read-only',workspace:{id:'store-1',slug:'jadam',kind:'store'},
    summary:{canonicalMenuCount:12,platformListingCount:31,connectedChannelCount:4,orderEnabled:true}};
  const fetch=async(path,options={})=>{
    calls.push({path,options});
    if(path==='/api/catalog')return {ok:true,json:async()=>({modules:[]})};
    if(path==='/api/spaces')return {ok:true,status:200,json:async()=>({spaces,scope:'authenticated-member-only'})};
    if(path.startsWith('/api/store-summary?'))return storeResponse?.promise??{ok:true,status:200,json:async()=>payload};
    throw Error('Unexpected fetch: '+path);
  };
  const location={href:'https://ekodi.kr/management/',pathname:'/management/',search:'',hash:'',assign(){}};
  const ctx=createContext({window:{EKODI_MANAGEMENT_CONFIG:{}},document:doc,location,history:{replaceState(){}},
    sessionStorage:sess,localStorage:storage(),fetch,URL,URLSearchParams,Date,console:{error(){}}});
  runInContext(source,ctx);
  return{ctx,get,calls,sess,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
function kpiControl(p,index=0){
  const card=p.get('verifiedSpacesList').children[index];
  return{button:card?.children.find(x=>x.textContent==='운영현황 조회'),
    panel:card?.children.find(x=>x.className==='store-kpi-panel')};
}
test('anonymous never sees private store controls or fetches private APIs',async()=>{
  const p=page({guest:true});await p.flush();
  assert.equal(p.get('memberApp').hidden,true);
  assert.equal(p.get('verifiedSpacesList').children.length,0);
  assert.equal(p.calls.filter(x=>x.path.includes('/api/store-summary')).length,0);
});
test('only actual member store may request summary with current bearer token; no other workspaces',async()=>{
  const p=page();await p.flush();
  const {button,panel}=kpiControl(p);
  assert.ok(button);
  assert.equal(kpiControl(p,1).button,undefined);
  await button.handlers.click();await p.flush();
  const calls=p.calls.filter(x=>x.path.includes('/api/store-summary'));
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/api/store-summary?slug=jadam');
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.cache,'no-store');
  assert.equal(calls[0].options.headers.authorization,'Bearer member-token');
  const cells=panel.children[0].children;
  assert.deepEqual(cells.map(x=>x.children[1].textContent),['12','31','4','활성']);
  assert.equal(panel.children[1].className,'store-readiness');
  assert.match(panel.children[1].children[0].textContent,/경영비서AI · 기초 운영 점검/);
  assert.match(panel.children[1].children[2].textContent,/규칙 기반 안내/);
  assert.equal(button.disabled,false);
});
test('wrong-store or malformed numbers never become visible as operational facts',async()=>{
  for(const result of [
    {dataPolicy:'verified-read-only',workspace:{id:'other-store',slug:'jadam',kind:'store'},
      summary:{canonicalMenuCount:12,platformListingCount:1,connectedChannelCount:2,orderEnabled:true}},
    {dataPolicy:'verified-read-only',workspace:{id:'store-1',slug:'jadam',kind:'store'},
      summary:{canonicalMenuCount:-1,platformListingCount:1,connectedChannelCount:2,orderEnabled:true}},
    {dataPolicy:'synthetic',workspace:{id:'store-1',slug:'jadam',kind:'store'},
      summary:{canonicalMenuCount:1,platformListingCount:2,connectedChannelCount:3,orderEnabled:false}}
  ]){
    const p=page({result});await p.flush();const {button,panel}=kpiControl(p);
    await button.handlers.click();await p.flush();
    assert.equal(panel.children.length,0);
    assert.match(panel.textContent,/확인할 수 없습니다/);
  }
});
test('late private store response cannot repopulate a member page after logout',async()=>{
  let resolveResponse;
  const deferred={promise:new Promise(resolve=>{resolveResponse=resolve})};
  const p=page({storeResponse:deferred});await p.flush();
  const {button,panel}=kpiControl(p);
  const pending=button.handlers.click();
  runInContext('logout()',p.ctx);
  resolveResponse({ok:true,status:200,json:async()=>({dataPolicy:'verified-read-only',
    workspace:{id:'store-1',slug:'jadam',kind:'store'},
    summary:{canonicalMenuCount:50,platformListingCount:100,connectedChannelCount:4,orderEnabled:true}})});
  await pending;await p.flush();
  assert.equal(p.get('memberApp').hidden,true);
  assert.equal(p.get('verifiedSpacesList').children.length,0);
  assert.equal(p.sess.getItem('ekodi-management-session'),null);
  assert.equal(panel.children.length,0);
});

test('readiness guidance flags actual empty or disabled indicators without sales prediction',async()=>{
  const p=page({result:{dataPolicy:'verified-read-only',workspace:{id:'store-1',slug:'jadam',kind:'store'},
    summary:{canonicalMenuCount:0,platformListingCount:0,connectedChannelCount:0,orderEnabled:false}}});
  await p.flush();
  const {button,panel}=kpiControl(p);
  await button.handlers.click();
  const list=panel.children[1].children[1];
  assert.equal(list.children.length,3);
  assert.match(list.children[0].textContent,/메뉴 원본이 0개/);
  assert.match(list.children[1].textContent,/연결된 판매채널이 0개/);
  assert.match(list.children[2].textContent,/주문 기능이 비활성/);
  assert.equal(list.children.some(x=>x.textContent.includes('매출 0원')),false);
});

test('readiness detects missing channel registrations without changing any data',async()=>{
  const p=page({result:{dataPolicy:'verified-read-only',workspace:{id:'store-1',slug:'jadam',kind:'store'},
    summary:{canonicalMenuCount:10,platformListingCount:0,connectedChannelCount:2,orderEnabled:true}}});
  await p.flush();const {button,panel}=kpiControl(p);
  await button.handlers.click();
  const list=panel.children[1].children[1];
  assert.equal(list.children.length,1);
  assert.match(list.children[0].textContent,/채널 등록 상태/);
  assert.equal(p.calls.filter(x=>x.options.method!=='GET'&&x.path.includes('store-summary')).length,0);
});

test('channel listings with no canonical menu raise a data consistency warning',async()=>{
  const p=page({result:{dataPolicy:'verified-read-only',workspace:{id:'store-1',slug:'jadam',kind:'store'},
    summary:{canonicalMenuCount:0,platformListingCount:7,connectedChannelCount:2,orderEnabled:true}}});
  await p.flush();
  const {button,panel}=kpiControl(p);
  await button.handlers.click();
  const list=panel.children[1].children[1];
  assert.equal(list.children.length,2);
  assert.match(list.children[0].textContent,/메뉴 원본이 0개/);
  assert.match(list.children[1].textContent,/원본 데이터 연결·동기화/);
  assert.equal(p.calls.filter(x=>x.path.includes('store-summary')).length,1);
});
