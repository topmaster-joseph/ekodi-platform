import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../control.js',import.meta.url),'utf8');

function browser({role='super_admin',sessionToken=true,storedTasks=[],responses=[]}={}){
  const url=new URL('https://ekodi.kr/admin/control?embed=admin');
  const calls=[],nodes=new Map();
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{
      classList:{toggle(){},add(){},remove(){}},dataset:{},hidden:false,
      innerHTML:'',textContent:'',value:'',style:{},scrollHeight:300,
      addEventListener(){},querySelectorAll(){return[]},focus(){},
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
  const document={
    readyState:'loading',documentElement:{dataset:{}},body:{scrollHeight:400},
    querySelector:node,
    querySelectorAll:key=>key==='[data-view]'?tabs:key==='[data-view-panel]'?panels:key==='[data-refresh]'?[refresh]:[],
    addEventListener(name,handler){if(name==='DOMContentLoaded')this.boot=handler},
  };
  const storage={
    getItem:key=>key==='ekodi-auth-token'&&sessionToken?'test-token'
      :key==='ekodi-control-state-v1'?JSON.stringify({tasks:storedTasks,results:[]}):null,
    setItem(){},
  };
  let serverResponseIndex=0;
  async function fetch(urlString,options={}){
    const path=new URL(urlString).pathname;
    calls.push({path,authorization:options.headers?.authorization||''});
    if(path==='/api/session'){
      return {status:role==='guest'?401:200,ok:role!=='guest',
        json:async()=>({authenticated:role!=='guest',role})};
    }
    if(path==='/api/control/ai/v8/tasks'){
      const item=responses[Math.min(serverResponseIndex++,responses.length-1)]||{ok:true,tasks:[]};
      const status=item.status||200;
      return {status,ok:status<400,json:async()=>item};
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
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {calls,document,node,tabs,refresh,boot:()=>document.boot(),settle,
    openTasks:()=>tabs.find(x=>x.dataset.view==='tasks').onclick()};
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
