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
  attributes:{},setAttribute(name,value){this.attributes[name]=value},addEventListener(type,handler){this.handlers[type]=handler},
  replaceChildren(...children){this.children=children;this.textContent=''},append(...children){this.children.push(...children)}}}
function page({spaces=[store,tenant],result=null,storeResponse=null,businessResult=null,businessResponse=null,guest=false}={}){
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
    if(path.startsWith('/api/store-business-summary?'))return businessResponse?.promise??{ok:Boolean(businessResult),status:businessResult?200:503,json:async()=>businessResult??{error:'source_unavailable'}};
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

test('authorized menu and channel detail tabs render only official projected records',async()=>{
  const p=page({result:{
    dataPolicy:'verified-read-only',workspace:{id:'store-1',slug:'jadam',kind:'store'},
    summary:{canonicalMenuCount:2,platformListingCount:3,connectedChannelCount:1,orderEnabled:true},
    operations:{status:'verified-read-only',
      menu:{total:2,shown:2,items:[
        {name:'매운치킨',category:'치킨',basePrice:19000,availability:'available'},
        {name:'미확인 메뉴',category:'',basePrice:null,availability:''}]},
      channels:{total:1,shown:1,items:[{provider:'baemin',name:'배달의민족',connectionStatus:'active'}]}}
  }});
  await p.flush();
  const {button,panel}=kpiControl(p);await button.handlers.click();
  assert.equal(panel.children.length,3);
  const detail=panel.children[2];
  assert.equal(detail.className,'store-operations');
  assert.equal(detail.children[1].children.length,7);
  const menu=detail.children[2];
  assert.match(menu.children[1].textContent,/원본 2건 · 표시 2건/);
  const list=menu.children[2];
  assert.equal(list.children.length,2);
  assert.equal(list.children[0].children[0].textContent,'매운치킨');
  assert.match(list.children[0].children[1].textContent,/19,000원/);
  assert.match(list.children[1].children[1].textContent,/가격 미확인/);
  const channels=detail.children[1].children[1];
  channels.handlers.click();
  assert.equal(channels.attributes['aria-pressed'],'true');
  assert.equal(detail.children[1].children[0].attributes['aria-pressed'],'false');
  assert.equal(detail.children[2].children[2].children[0].children[0].textContent,'배달의민족');
  const sales=detail.children[1].children[4];
  sales.handlers.click();
  await p.flush();
  assert.match(detail.children[2].children[1].textContent,/공식 경영 집계를 확인할 수 없습니다/);
  assert.equal(p.calls.filter(x=>x.path.includes('store-summary')).length,1);
  assert.equal(p.calls.filter(x=>x.path.includes('store-business-summary')).length,1);
});

test('unavailable operational details do not invent counts, zero sales, or private entries',async()=>{
  const p=page({result:{
    dataPolicy:'verified-read-only',workspace:{id:'store-1',slug:'jadam',kind:'store'},
    summary:{canonicalMenuCount:12,platformListingCount:31,connectedChannelCount:4,orderEnabled:true},
    operations:{status:'unavailable'}
  }});
  await p.flush();const {button,panel}=kpiControl(p);await button.handlers.click();
  const detail=panel.children[2],body=detail.children[2];
  assert.match(body.children[1].textContent,/0건으로 판단하지 않습니다/);
  assert.equal(JSON.stringify(detail.children).includes('주문 0건'),false);
  assert.equal(p.calls.filter(x=>x.path.includes('store-summary')&&x.options.method!=='GET').length,0);
});

test('untrusted projection with malformed menu prices falls back to unavailable details',async()=>{
  const p=page({result:{
    dataPolicy:'verified-read-only',workspace:{id:'store-1',slug:'jadam',kind:'store'},
    summary:{canonicalMenuCount:1,platformListingCount:0,connectedChannelCount:0,orderEnabled:true},
    operations:{status:'verified-read-only',menu:{total:1,shown:1,items:[{name:'상품',category:'',basePrice:-100,availability:''}]},
      channels:{total:0,shown:0,items:[]}}
  }});
  await p.flush();const {button,panel}=kpiControl(p);await button.handlers.click();
  assert.match(panel.children[2].children[2].children[1].textContent,/상세 목록을 확인할 수 없습니다/);
  assert.equal(panel.children[0].children.length,4);
});

const businessPayload={
  dataPolicy:'verified-business-aggregate-read-only',
  workspace:{id:'store-1',slug:'jadam',kind:'store'},asOf:'2026-11-07T00:00:00.000Z',
  timezone:'Asia/Seoul',coverage:'ekodi-recorded-completed-orders-only',
  source:'business_os_store_admin_snapshot',
  orders:{completedCount:5,averageTicket:20000},
  sales:{recordedCompletedSales:100000},
  customers:{identifiedToday:3,newFromBaseOrders:1},
  settlement:{status:'internal-aggregate',cashIn:130000,cashOut:50000,costTotal:45000}
};
test('store owner lazily loads Business OS once and renders scoped orders, sales, customers, and finance',async()=>{
  const p=page({businessResult:businessPayload});await p.flush();
  const {button,panel}=kpiControl(p);await button.handlers.click();
  const detail=panel.children[2];
  assert.equal(p.calls.filter(x=>x.path.includes('store-business-summary')).length,0);
  detail.children[1].children[2].handlers.click(); // 주문
  assert.match(detail.children[2].children[1].textContent,/확인하고 있습니다/);
  await p.flush();
  assert.match(detail.children[2].children[1].textContent,/한국시간/);
  assert.equal(detail.children[2].children[2].children[0].children[1].textContent,'5건');
  assert.match(detail.children[2].children[3].textContent,/POS/);
  detail.children[1].children[4].handlers.click(); // 매출
  assert.equal(detail.children[2].children[2].children[0].children[1].textContent,'100,000원');
  detail.children[1].children[3].handlers.click(); // 고객
  assert.equal(detail.children[2].children[2].children[0].children[1].textContent,'3명');
  detail.children[1].children[6].handlers.click(); // 정산
  assert.equal(detail.children[2].children[2].children[0].children[1].textContent,'130,000원');
  assert.match(detail.children[2].children[3].textContent,/은행 입금/);
  assert.equal(p.calls.filter(x=>x.path.includes('store-business-summary')).length,1);
  assert.equal(p.calls.filter(x=>x.options.method==='POST').length,0);
});

test('store staff cannot request privileged business aggregates from client',async()=>{
  const staff={...store,role:'store_staff'};
  const p=page({spaces:[staff],businessResult:businessPayload});await p.flush();
  const {button,panel}=kpiControl(p);await button.handlers.click();
  const detail=panel.children[2];
  detail.children[1].children[4].handlers.click();
  assert.match(detail.children[2].children[1].textContent,/관리자 권한이 필요/);
  assert.equal(p.calls.filter(x=>x.path.includes('store-business-summary')).length,0);
});

test('mismatched or malformed business identity and money fail closed to unavailable',async()=>{
  for(const invalid of [
    {...businessPayload,workspace:{id:'other-store',slug:'jadam',kind:'store'}},
    {...businessPayload,sales:{recordedCompletedSales:-7}},
    {...businessPayload,orders:{completedCount:'0',averageTicket:20000}},
    {...businessPayload,settlement:{status:'internal-aggregate',cashIn:null,cashOut:0,costTotal:0}}
  ]){
    const p=page({businessResult:invalid});await p.flush();
    const {button,panel}=kpiControl(p);await button.handlers.click();
    const detail=panel.children[2];detail.children[1].children[4].handlers.click();
    await p.flush();
    assert.match(detail.children[2].children[1].textContent,/0건 또는 0원으로 간주하지 않습니다/);
  }
});

test('delayed private revenue response cannot repopulate after logout',async()=>{
  let done;const deferred={promise:new Promise(resolve=>done=resolve)};
  const p=page({businessResponse:deferred});await p.flush();
  const {button,panel}=kpiControl(p);await button.handlers.click();
  const detail=panel.children[2];detail.children[1].children[4].handlers.click();
  runInContext('logout()',p.ctx);
  done({ok:true,status:200,json:async()=>businessPayload});
  await p.flush();
  assert.equal(p.get('memberApp').hidden,true);
  assert.equal(p.get('verifiedSpacesList').children.length,0);
  assert.equal(p.sess.getItem('ekodi-management-session'),null);
  assert.equal(JSON.stringify(detail.children).includes('100,000원'),false);
});

test('unconnected internal finance is explicitly unverified instead of a false zero',async()=>{
  const p=page({businessResult:{...businessPayload,settlement:{status:'not-connected'}}});
  await p.flush();const {button,panel}=kpiControl(p);await button.handlers.click();
  const detail=panel.children[2];detail.children[1].children[6].handlers.click();
  await p.flush();
  assert.match(detail.children[2].children[1].textContent,/0원으로 간주하지 않습니다/);
});
