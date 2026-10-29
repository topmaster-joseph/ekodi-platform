import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const app=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
const expiry=()=>Math.floor(Date.now()/1000)+3600;
const session=userId=>({accessToken:'jwt-'+userId,refreshToken:'refresh-'+userId,expiresAt:expiry(),user:{id:userId,email:userId+'@example.test'}});
function memoryStorage(entries={}) {
  const map=new Map(Object.entries(entries));
  return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};
}
function element(){
  return {hidden:false,href:'',value:'person',textContent:'',dataset:{},children:[],addEventListener(){},replaceChildren(...parts){this.children=parts},append(...parts){this.children.push(...parts)}};
}
function page({loggedIn=false,spaces=[],spaceStatus=200,deferred=null}={}){
  const nodes=new Map(),calls=[];
  const getElementById=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
  let currentUrl=new URL('https://ekodi.kr/management/');
  const location={get href(){return currentUrl.href},get pathname(){return currentUrl.pathname},
    get search(){return currentUrl.search},get hash(){return currentUrl.hash},
    set hash(value){currentUrl.hash=value},assign(value){currentUrl=new URL(value,currentUrl)}};
  const document={body:{dataset:{}},getElementById,createElement:element,
    querySelector:()=>element(),querySelectorAll:()=>[]};
  const sessionStorage=memoryStorage(loggedIn?{'ekodi-management-session':JSON.stringify(session('alice'))}:{});
  const fetch=async (path,options={})=>{
    calls.push({path,options});
    if(path==='/api/catalog')return {ok:true,json:async()=>({modules:[]})};
    if(path==='/api/spaces'){
      if(deferred)return deferred.promise;
      return {ok:spaceStatus===200,status:spaceStatus,json:async()=>({scope:'authenticated-member-only',spaces})};
    }
    throw Error('Unexpected request '+path);
  };
  const context=createContext({window:{EKODI_MANAGEMENT_CONFIG:{}},document,location,
    history:{replaceState(){}},sessionStorage,localStorage:memoryStorage(),fetch,URL,URLSearchParams,Date,console:{error(){}}});
  runInContext(app,context);
  return {context,calls,get:getElementById,sessionStorage,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('anonymous landing never fetches private spaces',async()=>{
  const p=page();
  await p.flush();
  assert.equal(p.calls.filter(x=>x.path==='/api/spaces').length,0);
  assert.equal(p.get('verifiedSpacesList').children.length,0);
  assert.equal(p.get('memberApp').hidden,true);
});

test('member spaces show only canonical verified links and never inject markup',async()=>{
  const p=page({loggedIn:true,spaces:[
    {id:'s1',slug:'jadam',name:'자담 <script>alert(1)</script>',role:'store_owner',kind:'store',status:'active'},
    {id:'s2',slug:'../other',name:'Cannot navigate',role:'member',kind:'tenant',status:'active'}
  ]});
  await p.flush();
  const calls=p.calls.filter(x=>x.path==='/api/spaces');
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[0].options.cache,'no-store');
  assert.equal(calls[0].options.headers.authorization,'Bearer jwt-alice');
  const entries=p.get('verifiedSpacesList').children;
  assert.equal(entries.length,2);
  assert.equal(entries[0].children[0].textContent,'자담 <script>alert(1)</script>');
  assert.equal(entries[0].children.at(-1).href,'https://ekodi.kr/jadam');
  assert.equal(entries[1].children.filter(x=>x.href).length,0);
  assert.match(p.get('spacesStatus').textContent,/2곳/);
});

test('private space data is cleared at logout and delayed responses never recreate it',async()=>{
  let resolveFetch;
  const deferred={promise:new Promise(resolve=>{resolveFetch=resolve})};
  const p=page({loggedIn:true,deferred});
  await p.flush();
  assert.equal(p.calls.filter(x=>x.path==='/api/spaces').length,1);
  runInContext('clearSession()',p.context);
  resolveFetch({ok:true,status:200,json:async()=>({scope:'authenticated-member-only',spaces:[{id:'s1',slug:'jadam',name:'private',role:'owner'}]})});
  await p.flush();
  assert.equal(p.get('verifiedSpacesList').children.length,0);
  assert.equal(p.get('memberApp').hidden,true);
  assert.equal(p.sessionStorage.getItem('ekodi-management-session'),null);
});

test('forbidden or unavailable upstream does not display any assumed workspace',async()=>{
  for(const status of [403,503]){
    const p=page({loggedIn:true,spaceStatus:status});
    await p.flush();
    assert.equal(p.get('verifiedSpacesList').children.length,0);
    assert.match(p.get('spacesStatus').textContent,/불러오지 못했습니다/);
  }
});
