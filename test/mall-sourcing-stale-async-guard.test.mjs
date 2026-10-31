import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const affStart=source.indexOf('  async function affiliateSourcingPanel(');
const affEnd=source.indexOf('  async function growthPolicyPanel(',affStart);
const amzStart=source.indexOf('  async function amazonAdmin(){');
const amzEnd=source.indexOf('  async function render(){',amzStart);
assert.ok(affStart>0&&affEnd>affStart&&amzStart>0&&amzEnd>amzStart);
const affiliateMethod=source.slice(affStart,affEnd);
const amazonMethod=source.slice(amzStart,amzEnd);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const route={routeKey:'coupang',merchantName:'쿠팡',selected:true};
const data=()=>({sources:[route],summary:{total:77}});

function harness({exchange=async()=>{},token=async()=> 'ok',fetchSource=async()=>data(),view='channels',form=null}={}){
  const displays={mainPanel:{innerHTML:''},summaryCards:{innerHTML:''},pageCopy:{textContent:''}};
  const states=[],logins=[],requests=[];
  const element=id=>id==='affiliateWorkspaceSourcesForm'?form:displays[id]||null;
  const bindings=[
    "let mallSourcingRequestId=0;let mallSourcingCurrent='overview';let mallSourcingView=ctx.view;let mallSourcingDetail='status';",
    'const exchangeCentralToken=ctx.exchange, accessToken=ctx.token;',
    "const workspaceAffiliateApi=(url,opt)=>ctx.fetchSource(url,opt);",
    'const state=value=>ctx.states.push(value);',
    "const loginPanel=value=>{ctx.logins.push(value);return 'login'};",
    'const $=ctx.element;',
    "const ae=value=>String(value??'');",
    "const card=(title,value)=>'<card>'+title+':'+value+'</card>';",
    "const mallSourcingTabKey=item=>'route:'+item.routeKey;",
    "const mallSourcingViews=[['channels','판매채널'],['usage','사용 설정']];",
    "const mallSourcingDetails=[['status','상태']];",
    "const mallSourcingDefaultDetail=()=> 'status';",
    "const mallSourcingHeader=()=>'[LATEST HEADER]';",
    "const workspaceSourceRow=item=>'<row>'+item.routeKey+'</row>';",
    "const workspaceSourceState=()=> 'ON';",
    'const platformAdminToken=()=>null;',
    "const affiliateAdminLocked=()=>'<locked>';",
    'const bindMallSourcingTabs=()=>{};',
    'const amazonAdmin=async()=>true;',
    "const mallSourcingSelectionPatch=(visible,fd)=>visible.map(x=>({routeKey:x.routeKey,enabled:fd.has('route:'+x.routeKey)}));",
    affiliateMethod,
    "return {navigate:affiliateSourcingPanel,snapshot:()=>({requestId:mallSourcingRequestId,channel:mallSourcingCurrent})};"
  ];
  const factory=new Function('ctx',bindings.join('\n'));
  const ui=factory({exchange,token,fetchSource:(url,opt)=>{requests.push({url,opt});return fetchSource(url,opt)},view,states,logins,element});
  return {...ui,displays,states,logins,requests};
}

test('late source error cannot overwrite newer successful merchant navigation',async()=>{
  const old=deferred();let call=0;
  const ui=harness({fetchSource:()=>++call===1?old.promise:Promise.resolve(data())});
  const first=ui.navigate('overview');await flush();
  await ui.navigate('route:coupang');
  const current=ui.displays.mainPanel.innerHTML;
  const summary=ui.displays.summaryCards.innerHTML;
  old.reject(new Error('stale source failure'));await first;
  assert.equal(ui.displays.mainPanel.innerHTML,current);
  assert.equal(ui.displays.summaryCards.innerHTML,summary);
  assert.equal(ui.logins.length,0);
  assert.notEqual(ui.states.at(-1),'확인 필요');
});

test('late stale 401 must not redirect the operator away from newest tab',async()=>{
  const old=deferred();let call=0;
  const ui=harness({fetchSource:()=>++call===1?old.promise:Promise.resolve(data())});
  const first=ui.navigate('overview');await flush();
  await ui.navigate('route:coupang');
  const current=ui.displays.mainPanel.innerHTML;
  old.reject(Object.assign(new Error('old 401'),{status:401,code:'AUTH_REQUIRED'}));await first;
  assert.equal(ui.logins.length,0);
  assert.equal(ui.displays.mainPanel.innerHTML,current);
});

test('old auth exchange must not continue with login or source GET',async()=>{
  const old=deferred();let exchangeCount=0,tokenCount=0,reads=0;
  const ui=harness({
    exchange:()=>++exchangeCount===1?old.promise:Promise.resolve(),
    token:()=>{tokenCount++;return Promise.resolve('ok')},
    fetchSource:()=>{reads++;return Promise.resolve(data())}
  });
  const first=ui.navigate('overview');await flush();
  await ui.navigate('route:coupang');
  old.resolve();await first;
  assert.equal(tokenCount,1);
  assert.equal(reads,1);
  assert.equal(ui.logins.length,0);
  assert.equal(ui.snapshot().channel,'route:coupang');
});

test('in-flight Save cannot begin PUT after switching to another tab',async()=>{
  const fresh=deferred();let reads=0,puts=0;
  const form={querySelector(){return {disabled:false}},onsubmit:null};
  const ui=harness({view:'usage',form,fetchSource:(_url,opts)=>{
    if(opts?.method==='PUT'){puts++;return Promise.resolve({})}
    reads++;return reads===2?fresh.promise:Promise.resolve(data());
  }});
  await ui.navigate('route:coupang');
  assert.equal(typeof form.onsubmit,'function');
  const priorSubmit=form.onsubmit;
  const priorFormData=globalThis.FormData;
  globalThis.FormData=class {constructor(){}has(){return true}};
  try{
    const save=priorSubmit({preventDefault(){}});
    await flush();
    await ui.navigate('overview');
    fresh.resolve(data());await save;
    assert.equal(puts,0);
    assert.equal(ui.snapshot().channel,'overview');
    assert.notEqual(ui.states.at(-1),'판매처 설정 저장됨');
  }finally{globalThis.FormData=priorFormData}
});

test('stale Amazon status failure cannot replace newer screen or render an error',async()=>{
  const old=deferred(),states=[],elements={mainPanel:{innerHTML:'NEW PANEL'},summaryCards:{innerHTML:'NEW CARDS'}};
  const definitions=[
    'let mallSourcingRequestId=0;',
    'const state=value=>ctx.states.push(value);',
    "const accessToken=async()=> 'ok';",
    'const fetch=()=>ctx.old.promise;',
    'const $=id=>ctx.elements[id];',
    'const ae=value=>String(value);',
    'const card=(a,b)=>a+b;',
    amazonMethod,
    'return {amazonAdmin,change:()=>{mallSourcingRequestId++}};'
  ];
  const ui=new Function('ctx',definitions.join('\n'))({old,states,elements});
  const first=ui.amazonAdmin();await flush();ui.change();
  old.reject(new Error('old Amazon status failure'));
  assert.equal(await first,false);
  assert.equal(elements.mainPanel.innerHTML,'NEW PANEL');
  assert.equal(elements.summaryCards.innerHTML,'NEW CARDS');
  assert.notEqual(states.at(-1),'확인 필요');
});
