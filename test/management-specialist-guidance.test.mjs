import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const app=readFileSync(new URL('../management/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../management/index.html',import.meta.url),'utf8');
const expiry=()=>Math.floor(Date.now()/1000)+3600;
const defaultCatalog=[
  {id:'chief',name:'경영비서AI',state:'foundation',phase:1},
  {id:'marketing',name:'마케팅AI',state:'existing',phase:1,reuseExisting:true,url:'https://ekodi.kr/ekodibiz/marketing-ai',description:'공식 마케팅 서비스'},
  {id:'menu',name:'메뉴AI',state:'foundation',phase:1},
  {id:'order',name:'주문AI',state:'foundation',phase:1},
  {id:'review',name:'리뷰AI',state:'foundation',phase:1},
  {id:'sales',name:'매출AI',state:'planned',phase:1},
  {id:'inventory',name:'재고AI',state:'planned',phase:2},
  {id:'settlement',name:'정산AI',state:'planned',phase:2}
];
function storage(seed={}){
  const map=new Map(Object.entries(seed)),calls=[];
  return {calls,getItem:key=>map.get(key)??null,setItem:(key,v)=>{calls.push(key);map.set(key,String(v))},removeItem:key=>map.delete(key)};
}
function element(){
  return {children:[],dataset:{},className:'',value:'',href:'',hidden:false,textContent:'',handlers:{},
    setAttribute(){},addEventListener(type,cb){this.handlers[type]=cb},
    append(...parts){this.children.push(...parts)},
    replaceChildren(...parts){this.children=parts;this.textContent=''}};
}
function page({member=true,catalog=defaultCatalog,choice={workspaceKind:'person',modules:['chief','marketing']}}={}){
  const nodes=new Map(),fetchCalls=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
  const sess=storage(member?{'ekodi-management-session':JSON.stringify({accessToken:'member-token',refreshToken:'refresh',expiresAt:expiry(),user:{id:'member-a'}})}:{});
  const local=storage({'ekodi-management-selection-v1:member-a':JSON.stringify(choice)});
  const document={body:{dataset:{}},getElementById:get,createElement:element,querySelector:()=>element(),querySelectorAll:()=>[]};
  const location={href:'https://ekodi.kr/management/',pathname:'/management/',search:'',hash:'',assign(){}};
  const fetch=async(path,options={})=>{
    fetchCalls.push({path,options});
    if(path==='/api/catalog')return {ok:true,json:async()=>({modules:catalog})};
    if(path==='/api/spaces')return {ok:true,status:200,json:async()=>({spaces:[],scope:'authenticated-member-only'})};
    throw Error('Unexpected fetch '+path);
  };
  const ctx=createContext({window:{EKODI_MANAGEMENT_CONFIG:{}},document,location,history:{replaceState(){}},
    sessionStorage:sess,localStorage:local,fetch,URL,URLSearchParams,Date,console:{error(){}}});
  runInContext(app,ctx);
  return {ctx,get,local,sess,fetchCalls,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
function request(p,message){p.get('managementRequest').value=message;runInContext('routeManagementRequest()',p.ctx)}
function firstLink(p){return p.get('requestMatches').children.flatMap(card=>card.children).find(node=>node.href)||null}

test('member request input and example buttons have accessible, non-misleading labels',()=>{
  assert.match(html,/<label class="request-label" for="managementRequest">/);
  assert.match(html,/id="managementRequest" rows="3" maxlength="500"/);
  assert.match(html,/id="requestRoutingStatus" class="note" role="status" aria-live="polite"/);
  for(const id of ['routeRequest','exampleSales','exampleMenu','exampleReview','exampleOrder'])assert.ok(html.includes('id="'+id+'"'));
  assert.match(html,/요청은 저장하거나 서버로 전송하지 않습니다/);
});

test('guest cannot route tasks to member-only specialist controls',async()=>{
  const p=page({member:false});await p.flush();
  request(p,'마케팅 홍보를 해주세요');
  assert.equal(p.get('requestMatches').children.length,0);
  assert.match(p.get('requestRoutingStatus').textContent,/로그인한 회원만/);
  assert.equal(p.get('memberApp').hidden,true);
});

test('member marketing request yields only verified selected canonical launch, without network submission',async()=>{
  const p=page();await p.flush();const initial=p.fetchCalls.length,initialWrites=p.local.calls.length;
  request(p,'마케팅 홍보 콘텐츠를 만들고 싶어요');
  const matches=p.get('requestMatches').children;
  assert.equal(matches.length,1);
  assert.equal(matches[0].children[0].textContent,'마케팅AI');
  assert.equal(matches[0].children[1].textContent,'기존 서비스 연결');
  assert.equal(firstLink(p)?.href,'https://ekodi.kr/ekodibiz/marketing-ai');
  assert.match(p.get('requestRoutingStatus').textContent,/실제 업무를 실행하지 않았습니다/);
  assert.equal(p.fetchCalls.length,initial);
  assert.equal(p.local.calls.length,initialWrites);
});

test('planned module matches do not expose nonexistent launch URLs',async()=>{
  const p=page();await p.flush();
  request(p,'매출을 분석하고 재고와 정산도 알고 싶습니다');
  assert.equal(p.get('requestMatches').children.length,3);
  assert.equal(firstLink(p),null);
  assert.ok(p.get('requestMatches').children.every(card=>card.children.some(x=>String(x.textContent).includes('준비 중'))));
});

test('unselected or untrusted marketing integration never opens a link',async()=>{
  const unselected=page({choice:{workspaceKind:'person',modules:['chief']}});
  await unselected.flush();request(unselected,'마케팅 홍보');
  assert.equal(firstLink(unselected),null);
  assert.match(unselected.get('requestMatches').children[0].children.at(-1).textContent,/선택·저장하면/);
  const adversarial=page({catalog:defaultCatalog.map(m=>m.id==='marketing'
    ?{...m,url:'https://bad.example/steal?access_token=secret',name:'<script>Marketing</script>'}:m)});
  await adversarial.flush();request(adversarial,'마케팅');
  assert.equal(firstLink(adversarial),null);
  assert.equal(adversarial.get('requestMatches').children[0].children[0].textContent,'<script>Marketing</script>');
});

test('empty and unrelated requests fail closed instead of inventing a recommendation',async()=>{
  const p=page();await p.flush();
  request(p,' ');
  assert.match(p.get('requestRoutingStatus').textContent,/두 글자 이상/);
  request(p,'우주선 엔진 가동');
  assert.match(p.get('requestRoutingStatus').textContent,/일치하는 분야를 찾지 못했습니다/);
  assert.equal(p.get('requestMatches').children.length,0);
});

test('example tasks actually route and logout clears private text and results',async()=>{
  const p=page();await p.flush();
  p.get('exampleReview').handlers.click();
  assert.match(p.get('managementRequest').value,/리뷰/);
  assert.equal(p.get('requestMatches').children[0].children[0].textContent,'리뷰AI');
  runInContext('logout()',p.ctx);
  assert.equal(p.get('managementRequest').value,'');
  assert.equal(p.get('requestMatches').children.length,0);
  assert.equal(p.sess.getItem('ekodi-management-session'),null);
  assert.equal(p.get('memberApp').hidden,true);
});
