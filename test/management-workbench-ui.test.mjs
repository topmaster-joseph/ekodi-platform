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
function page({guest=false}={}){
  const elements=new Map(),calls=[];
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
    if(path==='/api/spaces')return {ok:true,status:200,json:async()=>({
      spaces:[],scope:'authenticated-member-only'
    })};
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
