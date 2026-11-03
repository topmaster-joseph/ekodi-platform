import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const html=readFileSync(new URL('../management/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b)+b.length);

test('local header preserves brand but delegates authentication to the shared Shell exactly once',()=>{
  const header=section('<header class="topbar">','</header>');
  assert.match(header,/EKODI <strong>경영플랫폼<\/strong>/);
  assert.match(header,/<nav aria-label="EKODI 공통 계정 메뉴"><\/nav>/);
  assert.doesNotMatch(header,/authLink|로그인|로그아웃|My EKODI|href="https:\/\/ekodi\.kr\/my\//);
  assert.doesNotMatch(source,/authLink/);
});
test('login CTA and body-level logout remain available without duplicate account menu',()=>{
  assert.match(html,/<a class="button" href="https:\/\/ekodi\.kr\/auth\/\?/);
  assert.match(html,/id="logoutButton"/);
  assert.match(source,/\$\('logoutButton'\)\.addEventListener\('click',logout\)/);
});
test('member and guest state renders without any local authLink node',async()=>{
  const created=new Map(),errors=[];
  const el=()=>({hidden:false,dataset:{},children:[],value:'person',textContent:'',href:'',handlers:{},
    addEventListener(type,fn){this.handlers[type]=fn},setAttribute(){},
    append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}});
  const get=id=>{
    if(id==='authLink')throw Error('Duplicate local authentication node must not be used');
    if(!created.has(id))created.set(id,el());
    return created.get(id);
  };
  const doc={body:{dataset:{}},getElementById:get,createElement:el,querySelector:()=>el(),querySelectorAll:()=>[]};
  const expiry=Math.floor(Date.now()/1000)+3600;
  let session=JSON.stringify({accessToken:'token',refreshToken:'refresh',expiresAt:expiry,user:{id:'u1',email:'u@example.test'}});
  const sessionStorage={getItem:key=>key==='ekodi-management-session'?session:null,setItem(_key,value){session=String(value)},removeItem(){session=null}};
  const localStorage={getItem(){return null},setItem(){}};
  const fetch=async(path)=>{
    if(path==='/api/catalog')return{ok:true,json:async()=>({modules:[]})};
    if(path==='/api/spaces')return{ok:true,status:200,json:async()=>({scope:'authenticated-member-only',spaces:[]})};
    throw Error('unexpected request '+path);
  };
  const context=createContext({window:{EKODI_MANAGEMENT_CONFIG:{}},document:doc,
    location:{href:'https://ekodi.kr/management/',pathname:'/management/',search:'',hash:'',assign(){}},
    history:{replaceState(){}},sessionStorage,localStorage,fetch,URL,URLSearchParams,Date,console:{error:e=>errors.push(e)}});
  runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(get('memberApp').hidden,false);
  get('logoutButton').handlers.click();
  assert.equal(get('memberApp').hidden,true);
  assert.equal(session,null);
  assert.equal(errors.length,0);
});
