import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../sites/ekodi-church/partner-news.js',import.meta.url),'utf8');
function boot({hash='',observerSupported=true,lang='ko'}={}){
  const calls=[],listeners=new Map(),observers=[];
  const status={textContent:'',hidden:false};
  const host={innerHTML:''};
  const section={querySelector:()=>null};
  const location={hash};
  const document={
    documentElement:{lang},
    getElementById(id){return {'partner-news-feed':host,'partner-news-status':status,'partner-news':section}[id]||null},
    querySelector:()=>null,
  };
  class FakeObserver{
    constructor(callback,options){this.callback=callback;this.options=options;this.observed=[];this.disconnected=false;observers.push(this)}
    observe(node){this.observed.push(node)}
    disconnect(){this.disconnected=true}
    trigger(isIntersecting){this.callback([{isIntersecting,target:section}])}
  }
  const window={addEventListener(name,fn){listeners.set(name,fn)}};
  if(observerSupported)window.IntersectionObserver=FakeObserver;
  const fetch=async (url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>({contract:{publicState:'PUBLISHED'},items:[]})};
  };
  const storage=new Map();
  const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  runInNewContext(source,{window,document,location,localStorage,fetch,IntersectionObserver:FakeObserver,console});
  return {calls,listeners,observers,section,status,host,location};
}

test('unseen Church partner section does not immediately fetch optional public news',()=>{
  const app=boot();
  assert.equal(app.calls.length,0);
  assert.equal(app.observers.length,1);
  assert.deepEqual(app.observers[0].observed,[app.section]);
  assert.equal(app.observers[0].options.rootMargin,'320px 0px');
  app.observers[0].trigger(false);
  assert.equal(app.calls.length,0);
  app.observers[0].trigger(true);
  assert.equal(app.calls.length,1);
  assert.match(app.calls[0].url,/^\/api\/partner-news\/public/);
  assert.equal(app.calls[0].options.credentials,'omit');
  assert.equal(app.calls[0].options.cache,'no-store');
  assert.equal(app.observers[0].disconnected,true);
  app.observers[0].trigger(true);
  assert.equal(app.calls.length,1);
});

test('direct partner anchor and later hash navigation load once',()=>{
  const direct=boot({hash:'#partner-news'});
  assert.equal(direct.calls.length,1);
  assert.equal(direct.observers.length,0);
  const later=boot();
  later.location.hash='#partner-news';
  later.listeners.get('hashchange')();
  assert.equal(later.calls.length,1);
  later.observers[0].trigger(true);
  assert.equal(later.calls.length,1);
});

test('old browsers load right away; non-Korean placeholder stays API-free',()=>{
  assert.equal(boot({observerSupported:false}).calls.length,1);
  const translated=boot({lang:'en'});
  assert.equal(translated.calls.length,0);
  assert.match(translated.host.innerHTML,/partner-news-empty/);
});
