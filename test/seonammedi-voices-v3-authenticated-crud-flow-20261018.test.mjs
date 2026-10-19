import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {freshVoiceClient} from '../services/independent-board/voices-fresh/page.mjs';
import {handleFreshVoiceApi,consumeFreshVoiceQueue} from '../services/independent-board/voices-fresh/api.mjs';

// Only synthetic sessions and a fake database. This is NOT a live Google login.
const KEY='sb-renzehysxirjilvdxacv-auth-token';
function store(denyWrite=false){
  const data=new Map();
  return {
    getItem:key=>data.get(key)||null,
    setItem:(key,value)=>{if(denyWrite)throw Error('browser_store_blocked');data.set(key,String(value))},
    removeItem:key=>data.delete(key),
    seed:(key,value)=>data.set(key,String(value))
  };
}
function node(name=''){
  return {name,children:[],hidden:false,disabled:false,value:'',textContent:'',className:'',style:{},
    append(...items){this.children.push(...items)},
    replaceChildren(){this.children=[]},
    focus(){this.focused=true},
    reset(){this.resetCalled=true},
    addEventListener(event,fn){this.listeners??={};this.listeners[event]=fn},
    querySelector(selector){assert.equal(selector,'button[type=submit]');return this.submitButton}
  };
}
function fakeDb(){
  const entries=[];let nextId=1;
  return {entries,prepare(sql){
    let args=[];
    return {
      bind(...a){args=a;return this},
      async first(){
        if(sql.includes('submission_key='))return entries.find(x=>x.submission_key===args[0])||null;
        return entries.find(x=>x.id===Number(args[0])&&x.status==='published')||null;
      },
      async all(){
        let listed=entries.filter(x=>x.status==='published');
        if(sql.includes('body LIKE ?'))listed=listed.filter(x=>(x.body+' '+(x.title||'')).includes(String(args[0]).replaceAll('%','')));
        return {results:listed.slice().sort((a,b)=>b.id-a.id).slice(0,100)};
      },
      async run(){
        if(sql.startsWith('INSERT INTO citizen_voices_fresh')){
          const [google_subject,submission_key,title,body,created_at,updated_at]=args;
          const id=nextId++;entries.push({id,google_subject,submission_key,title,body,created_at,updated_at,status:'published'});
          return {meta:{last_row_id:id}};
        }
        if(sql.startsWith('UPDATE citizen_voices_fresh SET title=?,body=')){
          const row=entries.find(x=>x.id===Number(args[3]));if(row){row.title=args[0];row.body=args[1]}return {success:true};
        }
        if(sql.startsWith("UPDATE citizen_voices_fresh SET status='deleted'")){
          const row=entries.find(x=>x.id===Number(args[1]));if(row)row.status='deleted';return {success:true};
        }
        throw Error('unexpected_sql:'+sql);
      }
    };
  }};
}
function fixtures(){
  const db=fakeDb(),calls=[];
  const env={BOARD_DB:db};
  env.BOARD_WRITE_QUEUE={async send(envelope){
    await consumeFreshVoiceQueue(env,envelope.payload);
    calls.push('queue:published');
  }};
  return {env,db,calls};
}
async function until(check,label){
  for(let i=0;i<100;i++){
    if(check())return;
    await new Promise(r=>setTimeout(r,3));
  }
  throw Error('client_wait_timeout:'+label);
}
async function boot({host,role='writer',env,invalidHandoff=false,staleLocal=false}){
  const base=host+'/board/voices?compose=1';
  const location=new URL(base+'#ekodi_token=synthetic-handoff&ekodi_type=email');
  const local=store(staleLocal),perTab=store();
  if(staleLocal)local.seed(KEY,JSON.stringify({
    access_token:'stale-session',expires_at:Math.floor(Date.now()/1000)+99999
  }));
  const ids={freshForm:node('form'),freshStatus:node('status'),freshList:node('list'),
    freshSearch:node('search'),freshWrite:node('write'),freshTitle:node('title'),freshMessage:node('message'),
    freshCancel:node('cancel')};
  ids.freshForm.hidden=true;
  ids.freshForm.submitButton=node('submit');
  const calls=[], assigned=[];
  const document={getElementById:id=>ids[id],createElement:name=>node(name)};
  const token=role+'-access';
  const customFetch=async(resource,options={})=>{
    const url=new URL(String(resource),location.href);calls.push({path:url.pathname,method:options.method||'GET'});
    if(url.pathname==='/auth/v1/verify'){
      assert.equal(location.hash,'','handoff fragment must be erased before API access');
      assert.equal(options.referrerPolicy,'no-referrer');
      return Response.json(invalidHandoff?{error:'invalid_token'}:{
        access_token:token,refresh_token:'synthetic-refresh',expires_in:3600,
        expires_at:Math.floor(Date.now()/1000)+3600,user:{id:role}
      },{status:invalidHandoff?401:200});
    }
    if(url.pathname.endsWith('/api/auth/session')){
      if(options.headers?.authorization==='Bearer '+token)return Response.json({ok:true,authenticated:true,provider:'google'});
      return Response.json({ok:false,error:'google_login_required'},{status:401});
    }
    const i=url.pathname.indexOf('/api/voices-fresh');
    if(i>=0){
      const path=url.pathname.slice(i),body=options.body;
      const auth={google:async()=>options.headers?.authorization==='Bearer '+token?{id:'synthetic-'+role}:null,
        admin:async()=>role==='admin'&&options.headers?.authorization==='Bearer '+token?
          {ok:true}:{ok:false,response:Response.json({ok:false,error:'voices_forbidden'},{status:403})},
        limit:async()=>({available:true,allowed:true})};
      return handleFreshVoiceApi(new Request(url.href,{
        method:options.method||'GET',headers:options.headers||{},...(body?{body}: {})
      }),env,path,auth);
    }
    throw Error('unexpected_fetch:'+url.pathname);
  };
  const context={document,location,history:{replaceState(_a,_b,href){
    assert.ok(!href.includes('ekodi_token'));location.hash='';
  }},localStorage:local,sessionStorage:perTab,fetch:customFetch,
    URL,URLSearchParams,Date,Response,crypto:globalThis.crypto,
    setTimeout:(cb,ms)=>setTimeout(cb,ms===750?0:ms),
    clearTimeout,confirm:()=>true,prompt:()=>null};
  location.assign=url=>assigned.push(url);
  new Script(freshVoiceClient).runInNewContext(context);
  if(invalidHandoff)await until(()=>ids.freshStatus.textContent.includes('복귀에 실패'),'invalid handoff');
  else await until(()=>ids.freshForm.hidden===false,'editor opens after Google auth');
  return {ids,calls,assigned,local,perTab,context,location};
}

test('Google handoff -> durable queue -> published list, with no admin controls for regular writers, on both hosts',async()=>{
  for(const host of ['https://seonammedi.kr','https://ekodi.kr/seonammedi']){
    const {env,db,calls}=fixtures();
    const app=await boot({host,role:'writer',env});
    assert.equal(app.location.hash,'');
    assert.equal(app.ids.freshForm.hidden,false);
    assert.match(app.ids.freshStatus.textContent,/Google 로그인 확인 완료/);
    assert.equal(JSON.parse(app.local.getItem(KEY)).access_token,'writer-access');
    assert.equal(JSON.parse(app.perTab.getItem(KEY)).access_token,'writer-access');
    app.ids.freshTitle.value='테스트 제목';
    app.ids.freshMessage.value='테스트 시민의견 등록';
    await app.ids.freshForm.listeners.submit({preventDefault(){}});
    assert.equal(db.entries.length,1,'post must survive durable queue publish');
    assert.equal(db.entries[0].body,'테스트 시민의견 등록');
    assert.equal(db.entries[0].title,'테스트 제목','the title travels through the durable queue');
    assert.equal(app.ids.freshForm.hidden,true);
    assert.match(app.ids.freshStatus.textContent,/저장됐습니다/);
    assert.equal(app.ids.freshList.children.length,1);
    assert.equal(app.ids.freshList.children[0].children.length,3,'writer sees summary, body and share only');
    assert.equal(app.ids.freshList.children[0].children[2].textContent,'공유');
    assert.ok(app.ids.freshList.children[0].children.every(c=>c.className!=='admin-actions'),'writer never receives administrator buttons');
    assert.ok(calls.includes('queue:published'));
  }
});

test('verified site-authorized admin can edit and delete the same newly-published post on each host',async()=>{
  for(const host of ['https://seonammedi.kr','https://ekodi.kr/seonammedi']){
    const {env,db}=fixtures();
    await consumeFreshVoiceQueue(env,{submissionId:'00000000-0000-4000-8000-000000000001',
      googleSubject:'synthetic-writer',message:'수정 전 본문',createdAt:new Date().toISOString()});
    const app=await boot({host,role:'admin',env});
    const item=app.ids.freshList.children[0];
    assert.equal(item.children.length,4,'server verified permission reveals edit/delete next to share');
    const actions=item.children[3];
    assert.equal(actions.className,'admin-actions');
    app.context.prompt=()=> '관리자 수정 성공';
    await actions.children[0].onclick();
    assert.equal(db.entries[0].body,'관리자 수정 성공');
    assert.match(app.ids.freshStatus.textContent,/수정되었습니다/);
    const newActions=app.ids.freshList.children[0].children[3];
    await newActions.children[1].onclick();
    assert.equal(db.entries[0].status,'deleted');
    assert.equal(app.ids.freshList.children.length,1,'no results placeholder');
    assert.equal(app.ids.freshList.children[0].textContent,'등록된 시민의견이 없습니다.');
    assert.match(app.ids.freshStatus.textContent,/삭제되었습니다/);
  }
});

test('failed Google handoff never allows writing or administration',async()=>{
  const {env}=fixtures();
  const app=await boot({host:'https://seonammedi.kr',env,invalidHandoff:true});
  assert.equal(app.ids.freshForm.hidden,true);
  assert.match(app.ids.freshStatus.textContent,/Google 로그인 복귀에 실패/);
  assert.equal(app.location.hash,'');
  assert.equal(app.assigned.length,0,'no automatic login redirect loop after a failed handoff');
});

test('read-only stale local Google session cannot shadow verified session storage',async()=>{
  const {env}=fixtures();
  const app=await boot({host:'https://seonammedi.kr',env,staleLocal:true});
  assert.equal(JSON.parse(app.local.getItem(KEY)).access_token,'stale-session','simulated local storage denied overwrites');
  assert.equal(JSON.parse(app.perTab.getItem(KEY)).access_token,'writer-access');
  assert.equal(app.ids.freshForm.hidden,false,'server validates new session storage token');
  assert.ok(app.calls.some(x=>x.path.endsWith('/api/auth/session')));
});
