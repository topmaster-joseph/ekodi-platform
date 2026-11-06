import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../my/secondary-feature-loader.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../my/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../my/index.html',import.meta.url),'utf8');

function bootLoader({signedIn=false,hash=''}={}){
  const handlers=new Map();
  const delayed=[];
  let validSession=signedIn;
  const window={
    EKODI_MY_AUTH:{isSignedIn:()=>validSession},
    requestIdleCallback(callback,options){delayed.push({callback,options});},
    addEventListener(name,callback){handlers.set(name,callback);},
    setTimeout(callback){delayed.push({callback,options:null});},
  };
  const document={readyState:'complete',addEventListener(){}};
  const script=source.replace('export function loadMySecondaryFeatures()', 'function loadMySecondaryFeatures()');
  vm.runInNewContext(script,{window,document,location:{hash},Element:class {}});
  return {handlers,delayed,setSignedIn:value=>{validSession=value;}};
}

test('signed-out My EKODI does not schedule eight unnecessary member feature imports',()=>{
  const {handlers,delayed}=bootLoader({signedIn:false});
  assert.equal(delayed.length,0);
  handlers.get('hashchange')();
  assert.equal(delayed.length,0);
  handlers.get('ekodi:my-session')({detail:{signedIn:false}});
  assert.equal(delayed.length,0);
});

test('successful My session schedules idle member-only code, and signed-out event does not',()=>{
  const state=bootLoader({signedIn:false});
  state.setSignedIn(true);
  state.handlers.get('ekodi:my-session')({detail:{signedIn:true}});
  assert.equal(state.delayed.length,1);
  assert.equal(state.delayed[0].options.timeout,1500);
  state.setSignedIn(false);
  state.handlers.get('ekodi:my-session')({detail:{signedIn:false}});
  assert.equal(state.delayed.length,1);
  assert.match(source,/const run=\(\)=>\{if\(hasVerifiedMySession\(\)\)void loadMySecondaryFeatures\(\);\}/,
    'stale idle callback must recheck session before importing');
});

test('already signed-in member remains eligible for idle loading',()=>{
  const state=bootLoader({signedIn:true});
  assert.equal(state.delayed.length,1);
});

test('My authentication and account routes remain owned by first-party app',()=>{
  assert.match(html,/secondary-feature-loader\.js/);
  assert.match(app,/window\.EKODI_MY_AUTH=Object\.freeze/);
  assert.match(app,/announceSession\(\)/);
  assert.match(app,/await sb\.auth\.getSession\(\)/);
  assert.match(source,/window\.addEventListener\('ekodi:my-session'/);
  assert.match(source,/window\.addEventListener\('hashchange'/);
  assert.match(source,/const MODULES=Object\.freeze\(\[/);
  assert.match(source,/const CLASSIC=Object\.freeze\(\[/);
  assert.doesNotMatch(source,/sessionStorage|localStorage|document\.cookie|fetch\('https:\/\/ekodi\.kr\/api\/session'/);
});
