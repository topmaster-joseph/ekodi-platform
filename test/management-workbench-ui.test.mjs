import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const html=readFileSync(new URL('../management/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../management/styles.css',import.meta.url),'utf8');
const script=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
const tabs=[
  ['viewSpaces','memberSpacePanel'],['viewAi','memberAiPanel'],
  ['viewGrowth','growthManagement'],['viewAssistant','chiefCard']
];
function node(){
  return {children:[],value:'',hidden:false,checked:false,disabled:false,dataset:{},attributes:{},handlers:{},
    textContent:'',focusCount:0,
    setAttribute(key,val){this.attributes[key]=val},
    addEventListener(key,callback){this.handlers[key]=callback},
    replaceChildren(...items){this.children=items;this.textContent=''},
    append(...items){this.children.push(...items)},
    focus(){this.focusCount++}};
}
function fakeStorage(initial={}){
  const entries=new Map(Object.entries(initial));
  return {getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};
}
function page({guest=false,spaceResponses=[]}={}){
  const elements=new Map(),calls=[];let spaceFetches=0;
  const get=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id)};
  const session=guest?{}:{'ekodi-management-session':JSON.stringify({
    accessToken:'member-test-token',refreshToken:'refresh-token',
    expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:'member-a',email:'member@example.test'}
  })};
  const doc={body:{dataset:{}},getElementById:get,createElement:node,
    querySelector:()=>null,querySelectorAll:()=>[]};
  const fetch=async(path,options={})=>{
    calls.push({path,options});
    if(path==='/api/catalog')return {ok:true,json:async()=>({modules:[]})};
    if(path==='/api/spaces'){
      const outcome=spaceResponses[spaceFetches++]??[];
      if(outcome==='error')return {ok:false,status:503,json:async()=>({error:'offline'})};
      return {ok:true,status:200,json:async()=>({
        spaces:outcome,scope:'authenticated-member-only'
      })};
    }
    throw Error('unexpected network request: '+path);
  };
  const location={href:'https://ekodi.kr/management/',pathname:'/management/',
    search:'',hash:'',assign(){}};
  const ctx=createContext({window:{EKODI_MANAGEMENT_CONFIG:{}},document:doc,
    location,history:{replaceState(){}},URL,URLSearchParams,Date,
    sessionStorage:fakeStorage(session),localStorage:fakeStorage(),fetch,
    console:{error(){}}});
  runInContext(script,ctx);
  return {ctx,get,calls,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
function assertView(p,key){
  assert.equal(p.get('memberPanelGrid').hidden,!['viewSpaces','viewAi'].includes(key));
  for(const [button,panel] of tabs){
    const selected=button===key;
    assert.equal(p.get(button).attributes['aria-selected'],selected?'true':'false');
    assert.equal(p.get(button).tabIndex,selected?0:-1);
    assert.equal(p.get(panel).hidden,!selected);
  }
}

test('all four workbench tabs are accessible, with descriptive panel labels',()=>{
  assert.match(html,/<nav id="managementViewNav"[^>]+role="tablist"/);
  for(const [tab,panel] of tabs){
    assert.match(html,new RegExp('id="'+tab+'"[^>]+role="tab"[^>]+aria-controls="'+panel+'"'));
    assert.match(html,new RegExp('id="'+panel+'"[^>]+role="tabpanel"'));
  }
  assert.match(html,/id="workbenchScope"[^>]+role="status"/);
  assert.match(css,/\.management-view-nav button\[aria-selected="true"\]/);
  assert.match(css,/\[hidden\]\{display:none!important\}/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media\(max-width:359px\)/);
});

test('member can switch views without fetching private APIs or changing workspace',async()=>{
  const p=page();await p.flush();await p.flush();
  assertView(p,'viewSpaces');
  for(const key of ['viewAi','viewGrowth','viewAssistant','viewSpaces']){
    p.get(key).handlers.click();
    assertView(p,key);
  }
  assert.equal(p.calls.some(x=>x.path.startsWith('/api/store-summary')||
    x.path.startsWith('/api/store-business-summary')),false);
});

test('keyboard navigation wraps around and supports Home and End',async()=>{
  const p=page();await p.flush();
  let prevented=0;
  p.get('viewSpaces').handlers.keydown({key:'ArrowLeft',preventDefault(){prevented++}});
  assertView(p,'viewAssistant');
  assert.equal(p.get('viewAssistant').focusCount,1);
  p.get('viewAssistant').handlers.keydown({key:'Home',preventDefault(){prevented++}});
  assertView(p,'viewSpaces');
  p.get('viewSpaces').handlers.keydown({key:'End',preventDefault(){prevented++}});
  assertView(p,'viewAssistant');
  p.get('viewAssistant').handlers.keydown({key:'ArrowRight',preventDefault(){prevented++}});
  assertView(p,'viewSpaces');
  assert.equal(prevented,4);
});

test('member logout clears scope and prevents guest from changing private views',async()=>{
  const p=page();await p.flush();await p.flush();
  p.get('viewGrowth').handlers.click();assertView(p,'viewGrowth');
  runInContext('logout()',p.ctx);
  assert.equal(p.get('memberApp').hidden,true);
  assert.equal(p.get('workbenchScope').textContent,'현재 공간 미선택');
  p.get('viewAi').handlers.click();
  assert.equal(p.get('memberPanelGrid').hidden,true,'guest view must not be changed');
});

test('anonymous session cannot reveal workbench or call private workspace APIs',async()=>{
  const p=page({guest:true});await p.flush();
  assert.equal(p.get('memberApp').hidden,true);
  assert.equal(p.calls.filter(x=>x.path==='/api/spaces').length,0);
  p.get('viewAi').handlers.click();
  assert.equal(p.get('memberAiPanel').hidden,false,'static mock does not apply initial HTML hidden attributes');
  assert.equal(p.get('memberApp').hidden,true);
});

const verifiedStore={id:'store-1',slug:'jadam',name:'공식 테스트 매장',
  kind:'store',role:'store_owner',status:'active'};
function chooseStore(p){
  const cards=p.get('verifiedSpacesList').children;
  assert.ok(cards.length>0,'a verified workspace card should be rendered');
  const button=cards[0].children.find(c=>c.className==='space-select');
  assert.ok(button,'workspace selection needs a member verified button');
  button.handlers.click();
}

test('next action is honest and requires central workspace selection',async()=>{
  const p=page({spaceResponses:[[verifiedStore]]});await p.flush();
  assert.match(p.get('workbenchNextText').textContent,/운영 공간을 선택/);
  assert.equal(p.get('workbenchNextButton').dataset.view,'spaces');
  chooseStore(p);
  assert.match(p.get('workbenchScope').textContent,/공식 테스트 매장/);
  assert.match(p.get('workbenchNextText').textContent,/전문 AI를 먼저 선택/);
  assert.equal(p.get('workbenchNextButton').dataset.view,'ai');
  p.get('workbenchNextButton').handlers.click();
  assertView(p,'viewAi');
  assert.equal(p.calls.filter(c=>c.path.includes('store-summary')).length,0);
});

test('membership refresh retains chosen workspace only after exact re-verification',async()=>{
  const p=page({spaceResponses:[[verifiedStore],[verifiedStore]]});await p.flush();
  chooseStore(p);
  await p.get('refreshSpaces').handlers.click();
  assert.equal(p.get('workbenchScope').textContent,'현재 공간 · 공식 테스트 매장');
  assert.equal(p.get('verifiedSpacesList').children.length,1);
  assert.equal(p.calls.filter(c=>c.path==='/api/spaces').length,2);
});

test('changed role or lost membership clears prior workspace and all scope claims',async()=>{
  for(const changed of [[{...verifiedStore,role:'store_staff'}],[]]){
    const p=page({spaceResponses:[[verifiedStore],changed]});await p.flush();
    chooseStore(p);
    await p.get('refreshSpaces').handlers.click();
    assert.equal(p.get('workbenchScope').textContent,'현재 공간 미선택');
    assert.equal(p.get('workbenchNextButton').dataset.view,'spaces');
    assert.match(p.get('selectedWorkspaceStatus').textContent,/선택하지 않았습니다/);
    assert.equal(p.calls.filter(c=>c.path.includes('store-business-summary')).length,0);
  }
});

test('refresh network error never leaves the former tenant labeled as active',async()=>{
  const p=page({spaceResponses:[[verifiedStore],'error']});await p.flush();
  chooseStore(p);
  await p.get('refreshSpaces').handlers.click();
  assert.equal(p.get('workbenchScope').textContent,'운영 공간 권한 확인 실패');
  assert.match(p.get('workbenchNextText').textContent,/다시 확인하세요/);
  assert.equal(p.get('verifiedSpacesList').children.length,0);
  assert.equal(p.get('workbenchNextButton').dataset.view,'spaces');
});

test('next action panel is responsive and never presents hypothetical business revenue',()=>{
  assert.match(html,/id="workbenchNextText"[^>]+role="status"/);
  assert.match(html,/id="workbenchNextButton"[^>]+data-view="spaces"/);
  assert.match(css,/\.workbench-next-step\{/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.doesNotMatch(html,/임의 매출|예상 매출 \d/);
});
