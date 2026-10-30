import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInContext,createContext} from 'node:vm';

const html=readFileSync(new URL('../management/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
const expiry=()=>Math.floor(Date.now()/1000)+3600;
const memoryStorage=(entries={})=>{
  const map=new Map(Object.entries(entries));
  return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
};
function element(){
  return {hidden:false,value:'person',href:'',dataset:{},textContent:'',children:[],
    addEventListener(){},replaceChildren(...nodes){this.children=nodes},append(...nodes){this.children.push(...nodes)}};
}
const modules=[
  {id:'chief',name:'경영비서AI',state:'foundation',phase:1},
  {id:'marketing',name:'마케팅AI',state:'existing',phase:1,reuseExisting:true,url:'https://ekodi.kr/ekodibiz/marketing-ai'},
  {id:'order',name:'주문AI',state:'foundation',phase:1}
];
function createPage({loggedIn=true,modulesSelected=null}={}){
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
  const storage=memoryStorage(modulesSelected?{'ekodi-management-selection-v1:alice':JSON.stringify(modulesSelected)}:{});
  const sessionStorage=memoryStorage(loggedIn?{'ekodi-management-session':JSON.stringify({
    accessToken:'jwt',refreshToken:'refresh',expiresAt:expiry(),user:{id:'alice',email:'alice@example.test'}})}:{});
  const doc={body:{dataset:{}},getElementById:get,createElement:element,querySelector:()=>element(),querySelectorAll:()=>[]};
  const location={href:'https://ekodi.kr/management/',pathname:'/management/',search:'',hash:'',assign(){}};
  const fetch=async path=>{
    if(path==='/api/catalog')return {ok:true,json:async()=>({modules})};
    if(path==='/api/spaces')return {ok:true,status:200,json:async()=>({spaces:[],scope:'authenticated-member-only'})};
    throw Error('unexpected fetch '+path);
  };
  const context=createContext({window:{EKODI_MANAGEMENT_CONFIG:{}},document:doc,location,
    history:{replaceState(){}},sessionStorage,localStorage:storage,fetch,Date,URL,URLSearchParams,
    console:{error(){}}});
  runInContext(app,context);
  return {context,get,sessionStorage,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('management uses provider-neutral login and supported institution type',()=>{
  assert.match(html,/>로그인<\/a>/);
  assert.doesNotMatch(html,/Google 로그인/);
  assert.match(html,/<option value="institution">기관<\/option>/);
  assert.doesNotMatch(html,/<option value="organization">기관<\/option>/);
  assert.match(html,/id="memberModuleLinks"/);
});

test('existing specialist has canonical link; fake, unapproved and external links are blocked',async()=>{
  const p=createPage();
  await p.flush();
  const host=p.get('memberModuleLinks');
  const links=host.children.filter(x=>x.href);
  assert.equal(links.length,1);
  assert.equal(links[0].href,'https://ekodi.kr/ekodibiz/marketing-ai');
  for(const module of [
    {id:'order',state:'foundation',reuseExisting:true,url:'https://ekodi.kr/ekodibiz/marketing-ai'},
    {id:'marketing',state:'existing',reuseExisting:true,url:'https://outside.example/marketing'},
    {id:'marketing',state:'existing',reuseExisting:true,url:'https://ekodi.kr/ekodibiz/marketing-ai?next=wrong'},
    {id:'marketing',state:'existing',reuseExisting:false,url:'https://ekodi.kr/ekodibiz/marketing-ai'}
  ])assert.equal(runInContext('safeModuleUrl('+JSON.stringify(module)+')',p.context),null);
});

test('legacy organization selection maps to institution, without activating unselected specialists',async()=>{
  const p=createPage({modulesSelected:{workspaceKind:'organization',modules:['chief']}});
  await p.flush();
  assert.equal(p.get('workspaceKind').value,'institution');
  assert.equal(p.get('memberModuleLinks').children.filter(x=>x.href).length,0);
  assert.match(p.get('memberModuleLinks').children[0].textContent,/준비 중/);
});

test('logout removes specialist links and does not expose member controls',async()=>{
  const p=createPage();
  await p.flush();
  assert.equal(p.get('memberModuleLinks').children.filter(x=>x.href).length,1);
  runInContext('logout()',p.context);
  assert.equal(p.get('memberModuleLinks').children.length,0);
  assert.equal(p.get('memberApp').hidden,true);
  assert.equal(p.get('authLink').textContent,'로그인');
  assert.equal(p.sessionStorage.getItem('ekodi-management-session'),null);
});
