import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../admin-control-frame.js',import.meta.url),'utf8');
const sidebarSource=readFileSync(new URL('../admin-sidebar.js',import.meta.url),'utf8');

function fixture(){
  const listeners=new Map();
  const navListeners=new Map();
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
      return null;
    },
  };
  const window={
    addEventListener:(event,callback)=>navListeners.set(event,callback),
    dispatchEvent:event=>navListeners.get(event.type)?.(event),
    EKODIAdminPanels:{current:()=> 'command-home'},
  };
  runInNewContext(source,{document,window});
  return {frame,notice,panel,root,listeners,navListeners,window};
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
  const {frame,panel,navListeners}=fixture();
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
  const {frame,panel,navListeners}=fixture();
  const ready=navListeners.get('ekodi-admin-ready');
  assert.equal(typeof ready,'function');
  ready();
  assert.equal(panel.hidden,false);
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
  ready();
  assert.equal(frame.getAttribute('src'),'/admin/control?embed=admin');
});

test('clicking the same Control sidebar entry twice keeps the center panel visible',()=>{
  const {frame,panel,window}=fixture();
  const match=sidebarSource.match(/  control\.onclick=event=>\{[\s\S]*?\n  \};/);
  assert.ok(match,'single Control navigation handler must exist');
  const control={onclick:null};
  let eventCount=0,activateCount=0;
  // The compact menu hides all panels before syncTitle, and syncTitle emits
  // nothing if this section is already active.
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
    const handle=window._onNavigation;
    handle?.(event);
  };
  window._onNavigation=event=>{if(event.type==='ekodi-admin-section-changed'){
    const activate=fixtureNavigation.get('ekodi-admin-section-changed');
    activate?.(event);
  }};
  // The installed Control-frame handler is the real listener.
  const fixtureNavigation=new Map();
  const fresh=fixture();
  fixtureNavigation.set('ekodi-admin-section-changed',fresh.navListeners.get('ekodi-admin-section-changed'));
  // Rebind the real iframe listener to this panel so both clicks exercise it.
  const originalActivate=fresh.navListeners.get('ekodi-admin-section-changed');
  window._onNavigation=event=>{
    if(event.type==='ekodi-admin-section-changed'){
      originalActivate({detail:event.detail});
      if(event.detail.section==='command-home'){
        panel.hidden=fresh.panel.hidden;
        panel.classList.toggle('hidden-panel',fresh.panel.classList.contains('hidden-panel'));
        if(fresh.frame.hasAttribute('src')&&!frame.hasAttribute('src'))frame.setAttribute('src',fresh.frame.getAttribute('src'));
      }
    }
  };
  runInNewContext('const control = injectedControl; '+match[0],{
    injectedControl:control,window,
    CustomEvent:class CustomEvent{constructor(type,{detail}){this.type=type;this.detail=detail;}},
  });
  for(let i=0;i<2;i++){
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
