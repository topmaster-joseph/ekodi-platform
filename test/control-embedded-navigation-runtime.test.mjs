import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../control.js',import.meta.url),'utf8');

function browser(initial='https://ekodi.kr/admin/control?embed=admin'){
  const location=new URL(initial);
  const replaceCalls=[],windowScroll=[],conversationScroll=[],frames=[];
  const elements=new Map();
  const classes=()=>({values:new Set(),toggle(name,on){if(on)this.values.add(name);else this.values.delete(name)},add(name){this.values.add(name)},remove(name){this.values.delete(name)},contains(name){return this.values.has(name)}});
  const element=key=>{
    if(!elements.has(key))elements.set(key,{
      classList:classes(),dataset:{},hidden:false,innerHTML:'',textContent:'',
      style:{},scrollHeight:1800,scrollTo:args=>conversationScroll.push(args),
      querySelectorAll:()=>[],addEventListener(){},focus(){},requestSubmit(){},
    });
    return elements.get(key);
  };
  const navigation=['chat','tasks','agents','workers','results'].map(view=>{
    const b=element('button-'+view);b.dataset.view=view;return b;
  });
  const panels=navigation.map(item=>{
    const p=element('panel-'+item.dataset.view);p.dataset.viewPanel=item.dataset.view;return p;
  });
  const document={
    documentElement:{dataset:{}},readyState:'loading',body:{scrollHeight:2500},
    addEventListener(type,fn){if(type==='DOMContentLoaded')this.boot=fn},
    querySelector:element,
    querySelectorAll:selector=>selector==='[data-view]'?navigation:selector==='[data-view-panel]'?panels:[],
  };
  const window={scrollTo:args=>windowScroll.push(args)};
  const storage={getItem:()=>null,setItem(){}};
  const loc={get href(){return location.href},get search(){return location.search}};
  const history={replaceState(_state,_title,path){
    replaceCalls.push(path);const next=new URL(path,location.href);
    location.href=next.href;
  }};
  const context={document,window,location:loc,history,
    localStorage:storage,sessionStorage:storage,
    URL,URLSearchParams,Date,Math,
    setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:fn=>frames.push(fn),
  };
  runInNewContext(source,context);
  document.boot?.();
  return {
    location,document,navigation,panels,replaceCalls,windowScroll,conversationScroll,
    flushFrames:()=>{for(const fn of frames.splice(0))fn()},
  };
}

test('embedded Control preserves embed=admin on every tab switch and back to chat',()=>{
  const ui=browser();
  const select=view=>ui.navigation.find(item=>item.dataset.view===view).onclick();
  select('tasks');
  assert.equal(ui.location.pathname,'/admin/control');
  assert.equal(ui.location.searchParams.get('embed'),'admin');
  assert.equal(ui.location.searchParams.get('view'),'tasks');
  select('results');
  assert.equal(ui.location.searchParams.get('embed'),'admin');
  assert.equal(ui.location.searchParams.get('view'),'results');
  select('chat');
  assert.equal(ui.location.searchParams.get('embed'),'admin');
  assert.equal(ui.location.searchParams.has('view'),false);
});

test('Control opens the requested deep-linked tab after refresh in embedded mode',()=>{
  const ui=browser('https://ekodi.kr/admin/control?embed=admin&view=agents');
  const agent=ui.panels.find(x=>x.dataset.viewPanel==='agents');
  const chat=ui.panels.find(x=>x.dataset.viewPanel==='chat');
  assert.equal(agent.classList.contains('active'),true);
  assert.equal(chat.classList.contains('active'),false);
  assert.equal(ui.location.searchParams.get('embed'),'admin');
});

test('embedded conversation scrolls its own container, not the hidden outer page',()=>{
  const ui=browser();
  ui.flushFrames();
  assert.equal(ui.conversationScroll.length,1);
  assert.equal(ui.conversationScroll[0].top,1800);
  assert.equal(ui.windowScroll.length,0);
});

test('standalone Control retains its document scrolling and no embed query is added',()=>{
  const ui=browser('https://ekodi.kr/admin/control');
  ui.flushFrames();
  assert.equal(ui.windowScroll.length,1);
  assert.equal(ui.conversationScroll.length,0);
  ui.navigation.find(x=>x.dataset.view==='workers').onclick();
  assert.equal(ui.location.searchParams.has('embed'),false);
  assert.equal(ui.location.searchParams.get('view'),'workers');
});
