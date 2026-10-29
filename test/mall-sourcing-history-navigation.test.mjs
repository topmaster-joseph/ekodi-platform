import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8');
const begin=source.indexOf('  const mallSourcingIsAmazon=');
const end=source.indexOf('  async function affiliateSourcingPanel(',begin);
assert.ok(begin>0&&end>begin,'source selector and history logic exist');
const code=source.slice(begin,end);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function harness(path='/ekodimall/admin/sourcing?view=channels&channel=amazon',section='sourcing'){
  const documentLocation={pathname:'',search:'',hash:'',href:''};
  const setLocation=path=>{
    const url=new URL(path,'https://ekodi.kr');
    documentLocation.pathname=url.pathname;
    documentLocation.search=url.search;
    documentLocation.hash=url.hash;
    documentLocation.href=url.href;
  };
  setLocation(path);
  const historyPaths=[documentLocation.pathname+documentLocation.search+documentLocation.hash];
  let position=0;
  const navCalls=[];
  const handlers=new Map(),buttons=new Map();
  const mockWindow={addEventListener(name,callback){handlers.set(name,callback)}};
  const document={querySelectorAll(selector){
    return (buttons.get(selector)||[]).map(entry=>({
      getAttribute(){return entry.value},
      addEventListener(name,callback){if(name==='click')entry.click=callback}
    }));
  }};
  const browserHistory={
    state:null,
    pushState(_state,_title,url){
      historyPaths.splice(position+1);
      historyPaths.push(url);
      position++;
      setLocation(url);
    },
    replaceState(_state,_title,url){
      historyPaths[position]=url;
      setLocation(url);
    },
    back(){
      if(position===0)return;
      position--;
      setLocation(historyPaths[position]);
      handlers.get('popstate')?.();
    },
    forward(){
      if(position>=historyPaths.length-1)return;
      position++;
      setLocation(historyPaths[position]);
      handlers.get('popstate')?.();
    }
  };
  const api=new Function('location','section','service','ae','history','adminBase','document','affiliateSourcingPanel','window',
    code+'\nreturn {bind:bindMallSourcingTabs,restore:mallSourcingRestoreFromLocation,state:()=>({view:mallSourcingView,channel:mallSourcingCurrent,detail:mallSourcingDetail})};'
  );
  const m=api(documentLocation,section,'mall',escapeHtml,browserHistory,'/ekodimall/admin',document,value=>navCalls.push(value),mockWindow);
  return {...m,location:documentLocation,history:browserHistory,paths:historyPaths,navCalls,
    add(kind,value){
      const attr={view:'data-mall-source-view',channel:'data-mall-source-channel',detail:'data-mall-source-detail'}[kind];
      const entry={value,click:null};buttons.set('['+attr+']',[entry]);return entry;
    },
    event:name=>handlers.get(name)
  };
}

test('each distinct primary, provider and detail menu adds a reversible browser history entry',()=>{
  const ui=harness();
  const connection=ui.add('view','connection');
  const merchant=ui.add('channel','route:coupang');
  const detail=ui.add('detail','official');
  ui.bind();
  connection.click();
  assert.equal(ui.state().detail,'account');
  assert.match(ui.location.search,/view=connection/);
  merchant.click();
  assert.deepEqual(ui.state(),{view:'connection',channel:'route:coupang',detail:'status'});
  detail.click();
  assert.equal(ui.state().detail,'official');
  assert.equal(ui.paths.length,4);

  ui.history.back();
  assert.deepEqual(ui.state(),{view:'connection',channel:'route:coupang',detail:'status'});
  assert.equal(ui.navCalls.at(-1),'route:coupang');
  ui.history.back();
  assert.deepEqual(ui.state(),{view:'connection',channel:'amazon',detail:'account'});
  ui.history.forward();
  assert.equal(ui.state().channel,'route:coupang');
  assert.equal(ui.state().detail,'status');
  assert.equal(ui.navCalls.length,6,'three clicks plus three history events');
});

test('reselecting current tab never inserts redundant history entries',()=>{
  const ui=harness();
  const merchant=ui.add('channel','amazon');
  ui.bind();
  merchant.click();
  assert.equal(ui.paths.length,1);
  assert.equal(ui.navCalls.length,0,'reselecting the current tab must not refetch tenant APIs');
  assert.deepEqual(ui.state(),{view:'channels',channel:'amazon',detail:'status'});
});

test('legacy Amazon entry canonicalizes on interaction but Back restores original deep link',()=>{
  const ui=harness('/ekodimall/admin/amazon?view=connection&channel=amazon&detail=account','amazon');
  const detail=ui.add('detail','cost');ui.bind();
  detail.click();
  assert.match(ui.paths.at(-1),/^\/ekodimall\/admin\/sourcing\?view=connection&channel=amazon&detail=cost$/);
  ui.history.back();
  assert.equal(ui.location.pathname,'/ekodimall/admin/amazon');
  assert.deepEqual(ui.state(),{view:'connection',channel:'amazon',detail:'account'});
});

test('malformed URL state is normalized without pushing new history or unauthorized route',()=>{
  const ui=harness('/ekodimall/admin/sourcing?view=unknown&channel=route:coupang&detail=account');
  const channel=ui.restore();
  assert.equal(channel,'route:coupang');
  assert.deepEqual(ui.state(),{view:'channels',channel:'route:coupang',detail:'status'});
  assert.equal(ui.paths.length,1);
  const unrelated=ui.event('popstate');
  assert.equal(typeof unrelated,'function');
  ui.location.pathname='/admin/control';
  const count=ui.navCalls.length;
  unrelated();
  assert.equal(ui.navCalls.length,count,'other admin routes do not trigger sourcing fetch');
});

test('history traversal restores URL state without submitting seller changes',()=>{
  const ui=harness('/ekodimall/admin/sourcing?view=cost&channel=amazon&detail=cost');
  assert.match(source,/if\(typeof window!=='undefined'&&service==='mall'/);
  assert.match(source,/window\.addEventListener\('popstate'/);
  assert.match(source,/history\.pushState\(history\.state,'',nextPath\)/);
  assert.match(source,/affiliateSourcingPanel\(mallSourcingRestoreFromLocation\(\)\)/);
  assert.match(source,/if\(requestId!==mallSourcingRequestId\)return/);
  assert.equal(ui.state().detail,'cost');
  assert.equal(ui.navCalls.length,0,'loading the selector has no PUT or simulated mutation');
});
