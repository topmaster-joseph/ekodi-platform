import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../admin-control-frame.js',import.meta.url),'utf8');

function fixture(){
  const listeners=new Map();
  const classes=new Set();
  const attributes=new Map();
  const frame={
    classList:{
      add:value=>classes.add(value),
      remove:value=>classes.delete(value),
      contains:value=>classes.has(value),
    },
    getAttribute:key=>attributes.get(key)||null,
    setAttribute:(key,value)=>attributes.set(key,String(value)),
    removeAttribute:key=>attributes.delete(key),
    addEventListener:(event,callback)=>listeners.set(event,callback),
    contentDocument:null,
  };
  const notice={hidden:true};
  const root={dataset:{}};
  const document={
    documentElement:root,
    getElementById(id){
      if(id==='adminControlFrame')return frame;
      if(id==='adminControlFrameNotice')return notice;
      return null;
    },
  };
  runInNewContext(source,{document});
  return {frame,notice,root,listeners};
}

test('control frame verifier waits for login and does not report an unloaded iframe as broken',()=>{
  const {notice,root,listeners}=fixture();
  assert.equal(listeners.has('load'),true);
  assert.equal(listeners.has('error'),true);
  listeners.get('load')();
  listeners.get('error')();
  assert.equal(notice.hidden,true);
  assert.equal(root.dataset.ekodiControlEmbedded,undefined);
});

test('admin Control iframe is accepted only when the actual Control form and auth banner are present',()=>{
  const {frame,notice,root,listeners}=fixture();
  frame.setAttribute('src','/admin/control?embed=admin');
  frame.contentDocument={
    getElementById:key=>key==='commandForm'?{}:null,
    querySelector:key=>key==='#authBanner'?{}:null,
  };
  listeners.get('load')();
  assert.equal(notice.hidden,true);
  assert.equal(root.dataset.ekodiControlEmbedded,'ready');
  assert.equal(frame.classList.contains('admin-control-frame-unavailable'),false);
  assert.equal(frame.getAttribute('aria-hidden'),null);
});

test('the admin panel displays a safe fallback if the embedded response is not Control',()=>{
  const {frame,notice,root,listeners}=fixture();
  frame.setAttribute('src','/admin/control?embed=admin');
  frame.contentDocument={getElementById:()=>null,querySelector:()=>null};
  listeners.get('load')();
  assert.equal(notice.hidden,false);
  assert.equal(root.dataset.ekodiControlEmbedded,'unavailable');
  assert.equal(frame.classList.contains('admin-control-frame-unavailable'),true);
  assert.equal(frame.getAttribute('aria-hidden'),'true');
});

test('a CSP-denied frame and a failed network request each leave a visible recovery path',()=>{
  const {frame,notice,root,listeners}=fixture();
  frame.setAttribute('src','/admin/control?embed=admin');
  Object.defineProperty(frame,'contentDocument',{get(){throw new Error('SecurityError')},configurable:true});
  listeners.get('load')();
  assert.equal(notice.hidden,false);
  assert.equal(root.dataset.ekodiControlEmbedded,'unavailable');
  listeners.get('error')();
  assert.equal(notice.hidden,false);
  assert.equal(root.dataset.ekodiControlEmbedded,'unavailable');
});

test('a subsequent valid reload clears a previous fallback',()=>{
  const {frame,notice,root,listeners}=fixture();
  frame.setAttribute('src','/admin/control?embed=admin');
  frame.contentDocument={getElementById:()=>null,querySelector:()=>null};
  listeners.get('load')();
  frame.contentDocument={
    getElementById:id=>id==='commandForm'?{}:null,
    querySelector:id=>id==='#authBanner'?{}:null,
  };
  listeners.get('load')();
  assert.equal(notice.hidden,true);
  assert.equal(root.dataset.ekodiControlEmbedded,'ready');
  assert.equal(frame.classList.contains('admin-control-frame-unavailable'),false);
});
