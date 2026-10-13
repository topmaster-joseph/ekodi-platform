import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../control.js',import.meta.url),'utf8');

function browser({role='super_admin',email='admin@example.test',sessionToken=true,storedTasks=[],storedResults=[],responses=[],assistResponses=[],actionResponses=[],executeNow=false,legacySessions=[],initialUrl='https://ekodi.kr/admin/control?embed=admin'}={}){
  const url=new URL(initialUrl);
  const calls=[],nodes=new Map(),documentEvents=new Map();
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{
      classList:{toggle(){},add(){},remove(){}},dataset:{},hidden:false,
      innerHTML:'',textContent:'',value:'',style:{},scrollHeight:300,
      listeners:new Map(),addEventListener(name,handler){this.listeners.set(name,handler)},querySelectorAll(){return[]},focus(){},
      scrollTo(){},requestSubmit(){},closest(){return false},
    });
    return nodes.get(selector);
  };
  const tabs=['chat','tasks','agents','workers','results'].map(key=>{
    const n=node('tab:'+key);n.dataset.view=key;return n;
  });
  const panels=tabs.map(t=>{
    const n=node('panel:'+t.dataset.view);n.dataset.viewPanel=t.dataset.view;return n;
  });
  const refresh=node('refresh:tasks');
  refresh.closest=selector=>selector==='#viewTasks';
  node('#executeNow').checked=executeNow;
  const document={
    readyState:'loading',visibilityState:'visible',documentElement:{dataset:{}},body:{scrollHeight:400},
    querySelector:node,
    querySelectorAll:key=>key==='[data-view]'?tabs:key==='[data-view-panel]'?panels:key==='[data-refresh]'?[refresh]:[],
    addEventListener(name,handler){if(name==='DOMContentLoaded')this.boot=handler;else documentEvents.set(name,handler)},
  };
  const identity={role,email,sessionToken};
  const store=new Map([
    ['ekodi-control-state-v2:'+encodeURIComponent(email),JSON.stringify({tasks:storedTasks,results:storedResults})],
    ['ekodi-admin-command-history-v1',JSON.stringify(legacySessions)],
    ['ekodi-control-state-v1',JSON.stringify({tasks:storedTasks,results:storedResults})],
  ]);
  const storage={
    getItem:key=>key==='ekodi-auth-token'?(identity.sessionToken?'test-token':null):(store.get(key)||null),
    setItem(key,value){store.set(key,String(value))},
  };
  let serverResponseIndex=0,assistResponseIndex=0,actionResponseIndex=0;
  async function fetch(urlString,options={}){
    const path=new URL(urlString).pathname;
    calls.push({path,authorization:options.headers?.authorization||''});
    if(path==='/api/session'){
      return {status:identity.role==='guest'?401:200,ok:identity.role!=='guest',
        json:async()=>({authenticated:identity.role!=='guest',role:identity.role,email:identity.email})};
    }
    if(path==='/api/control/ai/assist'||path==='/api/control/ai/actions'){
      const isAssist=path.endsWith('/assist');
      const list=isAssist?assistResponses:actionResponses;
      const index=isAssist?assistResponseIndex++:actionResponseIndex++;
      const item=list[Math.min(index,list.length-1)]||{ok:true,provider:'EKODI',reply:'답변'};
      const status=item.status||200;
      return {status,ok:status<400,json:async()=>{if(item.wait)await item.wait;return item;}};
    }
    if(path==='/api/control/ai/v8/tasks'){
      const item=responses[Math.min(serverResponseIndex++,responses.length-1)]||{ok:true,tasks:[]};
      const status=item.status||200;
      return {status,ok:status<400,json:async()=>{if(item.wait)await item.wait;return item;}};
    }
    throw new Error('unexpected API: '+path);
  }
  const window={scrollTo(){}};
  runInNewContext(source,{
    document,window,fetch,location:url,history:{replaceState(_s,_t,v){url.href=new URL(v,url.href).href}},
    sessionStorage:storage,localStorage:storage,
    URL,URLSearchParams,Date,Math,
    setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:fn=>fn(),
  });
  const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  return {calls,document,node,tabs,refresh,store,boot:()=>document.boot(),settle,
    changeIdentity:values=>Object.assign(identity,values),
    submitCommand:value=>{node('#commandInput').value=value;node('#commandForm').listeners.get('submit')?.({preventDefault(){}})},
    openTasks:()=>tabs.find(x=>x.dataset.view==='tasks').onclick(),
    showView:view=>tabs.find(x=>x.dataset.view===view).onclick(),
    changeVisibility:status=>{document.visibilityState=status;documentEvents.get('visibilitychange')?.();}};
}

test('authenticated Control reads the durable server task ledger, not only browser cache',async()=>{
  const ui=browser({
    storedTasks:[{id:'old',title:'브라우저에 남은 작업',status:'verified'}],
    responses:[{ok:true,tasks:[
      {id:'srv-1',goal:'실제 서버 작업',state:'verified',updatedAt:'2026-10-12'},
      {id:'srv-2',goal:'실패한 서버 작업',state:'failed'},
    ]}],
  });
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  const html=ui.node('#taskCards').innerHTML;
  assert.match(html,/EKODI 서버 작업장부/);
  assert.match(html,/서버 확인/);
  assert.match(html,/실제 서버 작업/);
  assert.match(html,/실패한 서버 작업/);
  assert.doesNotMatch(html,/브라우저에 남은 작업/);
  const call=ui.calls.find(x=>x.path==='/api/control/ai/v8/tasks');
  assert.equal(call?.authorization,'Bearer test-token');
});

test('failed status lookup marks cached completed tasks explicitly as unverified',async()=>{
  const ui=browser({storedTasks:[{id:'cached',title:'과거 완료 작업',status:'verified'}],
    responses:[{status:503,error:'DATABASE_UNAVAILABLE'}]});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  const html=ui.node('#taskCards').innerHTML;
  assert.match(html,/브라우저 임시 기록/);
  assert.match(html,/서버 미확인/);
  assert.match(html,/과거 완료 작업/);
  assert.match(html,/완료 · 서버 미확인/);
  assert.doesNotMatch(html,/EKODI 서버 작업장부/);
});

test('guest and non-super-admin sessions never query task ledger',async()=>{
  for(const options of [{sessionToken:false},{role:'viewer'}]){
    const ui=browser(options);
    await ui.boot();
    ui.openTasks();
    await ui.settle();
    assert.equal(ui.calls.some(x=>x.path==='/api/control/ai/v8/tasks'),false);
    assert.match(ui.node('#taskCards').innerHTML,/서버 미확인/);
  }
});

test('task refresh actually calls the server again and displays its latest state',async()=>{
  const ui=browser({responses:[
    {ok:true,tasks:[{id:'task-1',goal:'진행 확인',state:'queued'}]},
    {ok:true,tasks:[{id:'task-1',goal:'진행 확인',state:'verified'}]},
  ]});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  assert.match(ui.node('#taskCards').innerHTML,/대기/);
  ui.refresh.onclick();
  await ui.settle();
  assert.equal(ui.calls.filter(x=>x.path==='/api/control/ai/v8/tasks').length,2);
  assert.match(ui.node('#taskCards').innerHTML,/완료/);
  assert.match(ui.node('#taskCards').innerHTML,/서버 확인/);
});

test('server task labels are escaped before being inserted into HTML',async()=>{
  const ui=browser({responses:[{ok:true,tasks:[
    {id:'evil',goal:'<img src=x onerror=alert(1)>',state:'failed'}
  ]}]});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  const html=ui.node('#taskCards').innerHTML;
  assert.doesNotMatch(html,/<img /);
  assert.match(html,/&lt;img/);
});

test('server retry, degraded, handoff, and ignored states have clear non-completion labels',async()=>{
  const ui=browser({responses:[{ok:true,tasks:[
    {id:'retry-1',goal:'재시도 작업',state:'retry'},
    {id:'degraded-1',goal:'부분 처리 작업',state:'degraded'},
    {id:'executor-1',goal:'실행기 인계 작업',state:'executor_ready'},
    {id:'ignored-1',goal:'제외된 작업',state:'ignored'},
    {id:'core-1',goal:'기반 처리 작업',state:'core_only'},
  ]}]});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  const html=ui.node('#taskCards').innerHTML;
  for(const expected of ['재시도 대기','부분 처리 · 확인 필요','실행기 인계 대기','처리 제외','Core 처리 · 실행 증빙 대기']){
    assert.ok(html.includes(expected),expected);
  }
  assert.equal(html.includes('<span class="badge">완료</span>'),false);
});

test('AI answer history never claims server-verified execution merely from a stored reply',async()=>{
  const ui=browser({storedResults:[
    {title:'검토 요청',summary:'AI 분석 설명',provider:'EKODI',status:'verified',taskId:''},
    {title:'작업 연결',summary:'AI 응답 기록',provider:'Qwen',status:'verified',taskId:'server-123'},
  ]});
  await ui.boot();
  const html=ui.node('#resultCards').innerHTML;
  assert.match(html,/AI 응답과 실행 증빙은 별개입니다/);
  assert.match(html,/AI 설명 · 실행 미확인/);
  assert.match(html,/AI 응답 · 작업 상태 별도 확인/);
  assert.match(html,/서버 작업장부에서 확인하세요/);
  assert.doesNotMatch(html,/<span class="badge">완료<\/span>/);
});

test('returning to a visible tasks tab updates stale status without background polling',async()=>{
  const ui=browser({responses:[
    {ok:true,tasks:[{id:'task-1',goal:'상태 감시',state:'running'}]},
    {ok:true,tasks:[{id:'task-1',goal:'상태 감시',state:'verified'}]},
  ]});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  assert.equal(ui.calls.filter(x=>x.path==='/api/control/ai/v8/tasks').length,1);
  assert.match(ui.node('#taskCards').innerHTML,/실행 중/);
  ui.changeVisibility('hidden');
  await ui.settle();
  assert.equal(ui.calls.filter(x=>x.path==='/api/control/ai/v8/tasks').length,1);
  ui.changeVisibility('visible');
  await ui.settle();
  assert.equal(ui.calls.filter(x=>x.path==='/api/control/ai/v8/tasks').length,2);
  assert.match(ui.node('#taskCards').innerHTML,/완료/);
  ui.showView('chat');
  ui.changeVisibility('hidden');
  ui.changeVisibility('visible');
  await ui.settle();
  assert.equal(ui.calls.filter(x=>x.path==='/api/control/ai/v8/tasks').length,2);
});

test('visibility refresh respects authorization; a guest never reads the server ledger',async()=>{
  const ui=browser({sessionToken:false});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  ui.changeVisibility('hidden');
  ui.changeVisibility('visible');
  await ui.settle();
  assert.equal(ui.calls.filter(x=>x.path==='/api/control/ai/v8/tasks').length,0);
  assert.match(ui.node('#taskCards').innerHTML,/서버 미확인/);
});

test('unscoped legacy browser command history is never disclosed before authorization',async()=>{
  const ui=browser({
    role:'guest',sessionToken:false,
    legacySessions:[{id:'old',title:'이전 관리자의 비공개 명령',messages:[]}],
    storedResults:[{title:'이전 관리자 결과',summary:'기밀'}],
  });
  assert.doesNotMatch(ui.node('#recentTasks').innerHTML,/이전 관리자의 비공개 명령/);
  await ui.boot();
  assert.doesNotMatch(ui.node('#recentTasks').innerHTML,/이전 관리자의 비공개 명령/);
  assert.doesNotMatch(ui.node('#resultCards').innerHTML,/이전 관리자 결과/);
});

test('new admin does not inherit the other account browser results after a session change',async()=>{
  const ui=browser({storedResults:[{title:'A의 명령 결과',summary:'A만 확인'}]});
  await ui.boot();
  assert.match(ui.node('#resultCards').innerHTML,/A의 명령 결과/);
  ui.changeIdentity({email:'other-admin@example.test'});
  ui.store.set('ekodi-control-state-v2:other-admin%40example.test',JSON.stringify({
    tasks:[],results:[{title:'B의 별도 결과',summary:'B만 확인'}]
  }));
  ui.showView('chat');
  ui.changeVisibility('visible');
  await ui.settle();
  assert.match(ui.node('#resultCards').innerHTML,/B의 별도 결과/);
  assert.doesNotMatch(ui.node('#resultCards').innerHTML,/A의 명령 결과/);
});

test('session revocation clears on-screen browser history and cached results',async()=>{
  const ui=browser({storedResults:[{title:'로그아웃 전 결과',summary:'이전 세션'}]});
  await ui.boot();
  assert.match(ui.node('#resultCards').innerHTML,/로그아웃 전 결과/);
  ui.changeIdentity({role:'guest'});
  ui.changeVisibility('visible');
  await ui.settle();
  assert.doesNotMatch(ui.node('#resultCards').innerHTML,/로그아웃 전 결과/);
  assert.doesNotMatch(ui.node('#recentTasks').innerHTML,/이전 세션/);
});

test('a late task response from admin A cannot appear in admin B workspace',async()=>{
  let releaseA;
  const wait=new Promise(resolve=>{releaseA=resolve});
  const ui=browser({responses:[
    {ok:true,wait,tasks:[{id:'task-A',goal:'A만의 작업 기록',state:'verified'}]},
    {ok:true,tasks:[{id:'task-B',goal:'B의 서버 작업',state:'running'}]},
  ]});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  assert.equal(ui.calls.filter(x=>x.path==='/api/control/ai/v8/tasks').length,1);
  ui.changeIdentity({email:'other-admin@example.test'});
  ui.showView('chat');
  ui.changeVisibility('visible');
  await ui.settle();
  releaseA();
  await ui.settle();
  assert.doesNotMatch(ui.node('#taskCards').innerHTML,/A만의 작업 기록/);
  ui.openTasks();
  await ui.settle();
  assert.match(ui.node('#taskCards').innerHTML,/B의 서버 작업/);
  assert.doesNotMatch(ui.node('#taskCards').innerHTML,/A만의 작업 기록/);
});

test('a late server task response cannot expose prior admin data after logout',async()=>{
  let finish;
  const wait=new Promise(resolve=>{finish=resolve});
  const ui=browser({storedTasks:[{id:'private',title:'과거 비밀작업',status:'verified'}],
    responses:[{ok:true,wait,tasks:[{id:'late',goal:'늦게 온 개인작업',state:'verified'}]}]});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  ui.changeIdentity({role:'guest'});
  ui.showView('chat');
  ui.changeVisibility('visible');
  await ui.settle();
  finish();
  await ui.settle();
  assert.doesNotMatch(ui.node('#taskCards').innerHTML,/늦게 온 개인작업|과거 비밀작업/);
  assert.match(ui.node('#taskCards').innerHTML,/서버 미확인/);
});

test('deep-linked Tasks refreshes after the initial account verification',async()=>{
  const ui=browser({initialUrl:'https://ekodi.kr/admin/control?embed=admin&view=tasks',
    responses:[{ok:true,tasks:[{id:'initial-task',goal:'로그인 직후 실시간 상태',state:'running'}]}]});
  await ui.boot();
  await ui.settle();
  assert.match(ui.node('#taskCards').innerHTML,/로그인 직후 실시간 상태/);
  assert.match(ui.node('#taskCards').innerHTML,/서버 확인/);
});

test('task ledger 401 revocation clears cached private records instead of exposing them',async()=>{
  const ui=browser({storedTasks:[{id:'cached',title:'인증 전 작업',status:'verified'}],
    responses:[{status:401,error:'UNAUTHORIZED'}]});
  await ui.boot();
  ui.openTasks();
  await ui.settle();
  assert.doesNotMatch(ui.node('#taskCards').innerHTML,/인증 전 작업/);
  assert.match(ui.node('#taskCards').innerHTML,/서버 미확인/);
});

test('AI response 401 revocation removes private conversation and results immediately',async()=>{
  const ui=browser({storedResults:[{title:'개인 AI 기록',summary:'과거'}],
    assistResponses:[{status:401,error:'SESSION_REVOKED'}]});
  await ui.boot();
  assert.match(ui.node('#resultCards').innerHTML,/개인 AI 기록/);
  ui.submitCommand('보안 권한 확인 명령');
  await ui.settle();
  assert.match(ui.node('#authState').textContent,/로그인 만료/);
  assert.equal(ui.node('#authBanner').hidden,false);
  assert.doesNotMatch(ui.node('#resultCards').innerHTML,/개인 AI 기록/);
  assert.doesNotMatch(ui.node('#messages').innerHTML,/보안 권한 확인 명령/);
  assert.equal(ui.calls.filter(x=>x.path==='/api/control/ai/assist').length,1);
});

test('preflight API 403 blocks execution before an AI assist request or cached output',async()=>{
  const ui=browser({executeNow:true,storedResults:[{title:'사전 기록',summary:'비공개'}],
    actionResponses:[{status:403,error:'ACCESS_DENIED'}]});
  await ui.boot();
  ui.submitCommand('승인되지 않은 자동실행');
  await ui.settle();
  assert.match(ui.node('#authState').textContent,/로그인 만료/);
  assert.equal(ui.calls.some(x=>x.path==='/api/control/ai/assist'),false);
  assert.equal(ui.calls.some(x=>x.path==='/api/control/ai/v8/pulse'),false);
  assert.doesNotMatch(ui.node('#resultCards').innerHTML,/사전 기록/);
  assert.doesNotMatch(ui.node('#messages').innerHTML,/승인되지 않은 자동실행/);
});

test('non-authorization AI service error keeps session but labels the response as unverified',async()=>{
  const ui=browser({assistResponses:[{status:503,error:'PROVIDER_UNAVAILABLE'}]});
  await ui.boot();
  ui.submitCommand('AI 답변만 요청');
  await ui.settle();
  assert.equal(ui.node('#authBanner').hidden,true);
  assert.match(ui.node('#messages').innerHTML,/AI 설명을 받지 못했습니다/);
  assert.match(ui.node('#resultCards').innerHTML,/AI 설명 · 실행 미확인/);
});

test('late AI response from a previous administrator does not appear after account switching',async()=>{
  let finish;
  const wait=new Promise(resolve=>{finish=resolve});
  const ui=browser({assistResponses:[{ok:true,provider:'AI',reply:'이전 계정의 비밀 응답',wait}]});
  await ui.boot();
  ui.submitCommand('계정 A 명령');
  await ui.settle();
  ui.changeIdentity({email:'other-admin@example.test'});
  ui.changeVisibility('visible');
  await ui.settle();
  finish();
  await ui.settle();
  assert.doesNotMatch(ui.node('#messages').innerHTML,/계정 A 명령|이전 계정의 비밀 응답/);
  assert.doesNotMatch(ui.node('#resultCards').innerHTML,/이전 계정의 비밀 응답/);
});
