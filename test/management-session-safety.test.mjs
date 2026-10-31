import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInContext,createContext} from 'node:vm';

const source=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');

function memoryStorage(initial={}){
  const items=new Map(Object.entries(initial));
  return {items,getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,String(value)),removeItem:key=>items.delete(key)};
}
function element(){
  return {hidden:false,value:'person',checked:false,href:'',textContent:'',dataset:{},children:[],
    addEventListener(){},replaceChildren(...parts){this.children=parts},append(...parts){this.children.push(...parts)}};
}
function createPage({session,sharedStorage=memoryStorage(),url='https://ekodi.kr/management/',exchangeFails=false,checkedModules=[]}={}){
  let currentUrl=new URL(url);
  const sessionStorage=memoryStorage(session?{'ekodi-management-session':JSON.stringify(session)}:{});
  const nodes=new Map();
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
  const document={body:{dataset:{}},getElementById,createElement:element,
    querySelector:()=>element(),querySelectorAll:()=>checkedModules.map(value=>({value}))};
  const location={get href(){return currentUrl.href},get hash(){return currentUrl.hash},get pathname(){return currentUrl.pathname},get search(){return currentUrl.search},assign(value){currentUrl=new URL(value,currentUrl)}};
  const events=[];
  const history={replaceState(_state,_title,value){currentUrl=new URL(value,currentUrl);events.push('scrub')}};
  const fetch=async path=>{
    if(path==='/api/auth/exchange'){
      events.push('exchange');
      assert.equal(currentUrl.hash,'','handoff fragment must be scrubbed before network exchange');
      if(exchangeFails)throw Error('offline');
      return {ok:true,json:async()=>({accessToken:'new-token',refreshToken:'new-refresh',expiresAt:Math.floor(Date.now()/1000)+3600,user:{id:'new-user'}})};
    }
    assert.equal(path,'/api/catalog');
    return {ok:true,json:async()=>({modules:[{id:'chief',name:'경영비서AI',state:'foundation',phase:1},{id:'marketing',name:'마케팅AI',state:'existing',phase:1}]})};
  };
  const context=createContext({window:{EKODI_MANAGEMENT_CONFIG:{}},document,location,history,sessionStorage,localStorage:sharedStorage,fetch,console:{error(){}},URL,URLSearchParams,Date});
  runInContext(source,context);
  return {context,location,sessionStorage,localStorage:sharedStorage,events,getElementById,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('one-time authentication handoff is erased before a failed network request',async()=>{
  const page=createPage({url:'https://ekodi.kr/management/#ekodi_token=single-use-secret&ekodi_type=email',exchangeFails:true});
  await page.flush();
  assert.deepEqual(page.events,['scrub','exchange']);
  assert.equal(page.location.hash,'');
  assert.equal(page.getElementById('memberApp').hidden,true);
});

test('local module selection is scoped to the current account',async()=>{
  const sharedStorage=memoryStorage();
  const expiry=Math.floor(Date.now()/1000)+3600;
  const alice=createPage({session:{accessToken:'token-a',refreshToken:'refresh-a',expiresAt:expiry,user:{id:'alice'}},sharedStorage,checkedModules:['marketing']});
  await alice.flush();
  alice.getElementById('workspaceKind').value='business';
  runInContext('saveSelection()',alice.context);
  assert.ok(sharedStorage.getItem('ekodi-management-selection-v1:alice'));
  assert.equal(sharedStorage.getItem('ekodi-management-selection-v1'),null);
  const bob=createPage({session:{accessToken:'token-b',refreshToken:'refresh-b',expiresAt:expiry,user:{id:'bob'}},sharedStorage});
  await bob.flush();
  const selection=runInContext('storedSelection()',bob.context);
  assert.equal(selection.workspaceKind,'person');
  assert.equal(selection.modules.join(','),'chief,marketing');
  assert.equal(sharedStorage.getItem('ekodi-management-selection-v1:bob'),null);
});

test('expired browser session cannot unlock member controls',async()=>{
  const page=createPage({session:{accessToken:'expired',refreshToken:'refresh',expiresAt:Math.floor(Date.now()/1000)-60,user:{id:'alice'}}});
  await page.flush();
  assert.equal(page.getElementById('memberApp').hidden,true);
  assert.equal(page.sessionStorage.getItem('ekodi-management-session'),null);
});
