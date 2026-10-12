import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../admin-control-frame.js',import.meta.url),'utf8');
const sidebarSource=readFileSync(new URL('../admin-sidebar.js',import.meta.url),'utf8');

function fixture(){
  const listeners=new Map();
  const navListeners=new Map();
  const observers=[];
  const classes=new Set();
  const panelClasses=new Set(['hidden-panel']);
  const attributes=new Map();
  const frame={
    classList:{
      add:value=>classes.add(value),
      remove:value=>classes.delete(value),
      contains:value=>classes.has(value),
    },
    dataset:{src:'/admin/control?embed=admin'},
    hasAttribute:key=>attributes.has(key),
    getAttribute:key=>attributes.get(key)||null,
    setAttribute:(key,value)=>attributes.set(key,String(value)),
    removeAttribute:key=>attributes.delete(key),
    addEventListener:(event,callback)=>listeners.set(event,callback),
    contentDocument:null,
  };
  const notice={hidden:true};
  const app={hidden:false};
  const panel={
    hidden:true,
    classList:{
      add:value=>panelClasses.add(value),
      remove:value=>panelClasses.delete(value),
      toggle:(value,force)=>{
        if(force)panelClasses.add(value);else panelClasses.delete(value);
      },
      contains:value=>panelClasses.has(value),
    },
  };
  const root={dataset:{}};
  const document={
    documentElement:root,
    getElementById(id){
      if(id==='adminControlFrame')return frame;
      if(id==='adminControlFrameNotice')return notice;
      if(id==='adminControlHome')return panel;
      if(id==='app')return app;
      return null;
    },
  };
  const window={
    addEventListener:(event,callback)=>navListeners.set(event,callback),
    dispatchEvent:event=>navListeners.get(event.type)?.(event),
    EKODIAdminPanels:{current:()=> 'command-home'},
  };
  class MutationObserver {
    constructor(callback){this.callback=callback;observers.push(this)}
    observe(target,options){
      assert.equal(target,panel);
      assert.equal(options.attributes,true);
      assert.deepEqual([...options.attributeFilter],['hidden','class']);
    }
  }
  runInNewContext(source,{document,window,MutationObserver});
  return {
    frame,notice,panel,root,app,listeners,navListeners,window,
    notifyPanelMutation:()=>observers.forEach(observer=>observer.callback()),
  };
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

test('admin navigation reveals central Control and hides it outside the command home',()=>{
  const {frame,panel,root,navListeners}=fixture();
  root.dataset.ekodiAdminReady='true';
  const activate=navListeners.get('ekodi-admin-section-changed');
  assert.equal(typeof activate,'function');
  assert.equal(panel.hidden,true);
  assert.equal(frame.hasAttribute('src'),false);
  activate({detail:{section:'command-home'}});
  assert.equal(panel.hidden,false);
  assert.equal(panel.classList.contains('hidden-panel'),false);
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
  activate({detail:{section:'finance'}});
  assert.equal(panel.hidden,true);
  assert.equal(panel.classList.contains('hidden-panel'),true);
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
});

test('authenticated admin ready event restores home panel without reloading the iframe',()=>{
  const {frame,panel,root,navListeners}=fixture();
  root.dataset.ekodiAdminReady='true';
  const ready=navListeners.get('ekodi-admin-ready');
  assert.equal(typeof ready,'function');
  ready();
  assert.equal(panel.hidden,false);
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
  ready();
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
});

test('clicking the same Control sidebar entry twice keeps the center panel visible',()=>{
  const {frame,panel,root,window,navListeners}=fixture();
  root.dataset.ekodiAdminReady='true';
  const match=sidebarSource.match(/  control\.onclick=event=>\{[\s\S]*?\n  \};/);
  assert.ok(match,'single Control navigation handler must exist');
  const control={onclick:null};
  let eventCount=0,activateCount=0;
  // Simulate the compact menu: it hides all panels on each navigation, but
  // suppresses its own duplicate section-change notification.
  window.EKODIAdminPanels={
    current:()=> 'command-home',
    activate:section=>{
      assert.equal(section,'command-home');
      activateCount++;
      panel.hidden=true;
      panel.classList.add('hidden-panel');
      return true;
    },
  };
  window.dispatchEvent=event=>{
    eventCount++;
    navListeners.get(event.type)?.(event);
  };
  runInNewContext('const control=injectedControl; '+match[0],{
    injectedControl:control,window,
    CustomEvent:class CustomEvent{constructor(type,{detail}){this.type=type;this.detail=detail;}},
  });
  for(let n=0;n<2;n++){
    let prevented=false;
    control.onclick({preventDefault:()=>{prevented=true}});
    assert.equal(prevented,true);
    assert.equal(panel.hidden,false);
    assert.equal(panel.classList.contains('hidden-panel'),false);
    assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
  }
  assert.equal(activateCount,2);
  assert.equal(eventCount,2);
});

test('post-auth reconciliation cannot leave current Control panel hidden',()=>{
  const {frame,panel,root,window,navListeners,notifyPanelMutation}=fixture();
  root.dataset.ekodiAdminReady='true';
  navListeners.get('ekodi-admin-ready')();
  assert.equal(panel.hidden,false);
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
  // Reproduces a later compact-menu bootstrap that hides all panels without
  // another ekodi-admin-section-changed event.
  panel.hidden=true;
  panel.classList.add('hidden-panel');
  notifyPanelMutation();
  assert.equal(window.EKODIAdminPanels.current(),'command-home');
  assert.equal(panel.hidden,false);
  assert.equal(panel.classList.contains('hidden-panel'),false);
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
});

test('reconciliation respects other selected sections and never forces Control open',()=>{
  const {frame,panel,root,window,navListeners,notifyPanelMutation}=fixture();
  let current='finance';
  window.EKODIAdminPanels.current=()=>current;
  root.dataset.ekodiAdminReady='true';
  navListeners.get('ekodi-admin-ready')();
  notifyPanelMutation();
  assert.equal(panel.hidden,true);
  assert.equal(frame.hasAttribute('src'),false);
  current='command-home';
  panel.hidden=true;
  panel.classList.add('hidden-panel');
  notifyPanelMutation();
  assert.equal(panel.hidden,false);
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
  current='finance';
  navListeners.get('ekodi-admin-section-changed')({detail:{section:'finance'}});
  notifyPanelMutation();
  assert.equal(panel.hidden,true);
});

test('pre-auth and logged-out navigation never auto-loads the privileged iframe',()=>{
  const {frame,panel,root,app,navListeners,notifyPanelMutation}=fixture();
  panel.hidden=true;
  panel.classList.add('hidden-panel');
  notifyPanelMutation();
  assert.equal(frame.hasAttribute('src'),false);
  assert.equal(panel.hidden,true);
  root.dataset.ekodiAdminReady='loading';
  navListeners.get('ekodi-admin-section-changed')({detail:{section:'command-home'}});
  assert.equal(frame.hasAttribute('src'),false);
  navListeners.get('ekodi-admin-ready')();
  assert.equal(frame.hasAttribute('src'),false);
  root.dataset.ekodiAdminReady='true';
  app.hidden=true;
  navListeners.get('ekodi-admin-section-changed')({detail:{section:'command-home'}});
  notifyPanelMutation();
  assert.equal(frame.hasAttribute('src'),false);
});

test('hidden or signed-out admin shell does not reopen the embedded Control panel',()=>{
  const {panel,app,root,notifyPanelMutation}=fixture();
  root.dataset.ekodiAdminReady='true';
  app.hidden=true;
  panel.hidden=true;
  panel.classList.add('hidden-panel');
  notifyPanelMutation();
  assert.equal(panel.hidden,true);
  assert.equal(panel.classList.contains('hidden-panel'),true);
  app.hidden=false;
  notifyPanelMutation();
  assert.equal(panel.hidden,false);
  assert.equal(panel.classList.contains('hidden-panel'),false);
});

test('authenticated navigation loads Control only after visible admin ready state',()=>{
  const {frame,root,app,navListeners}=fixture();
  const section=navListeners.get('ekodi-admin-section-changed');
  section({detail:{section:'command-home'}});
  assert.equal(frame.hasAttribute('src'),false);
  root.dataset.ekodiAdminReady='true';
  app.hidden=true;
  section({detail:{section:'command-home'}});
  assert.equal(frame.hasAttribute('src'),false);
  app.hidden=false;
  section({detail:{section:'command-home'}});
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
});
