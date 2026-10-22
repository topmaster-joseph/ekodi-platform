import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../admin-assist-bootstrap.js',import.meta.url),'utf8');

function fakeAdmin({coreFails=false}={}){
 const warnings=[], scripts=[], styles=[], messages=[], alerts=[];
 const classes=new Set();
 const body={classList:{add(...names){names.forEach(n=>classes.add(n))},remove(...names){names.forEach(n=>classes.delete(n))}},append(node){bootstrap=node}};
 let bootstrap=null,dock=false,opens=0;
 const window={
  EKODIAdminRoutes:{sectionFromLocation(){return 'command-home'}},
  EKODIAdminDemand:{
   loadStyle(name){styles.push(name);return Promise.resolve()},
   loadScript(name){
    scripts.push(name);
    if(name==='admin-assist-dock.js'){
     if(coreFails)return Promise.reject(Error('core_asset_unavailable'));
     dock=true;window.EKODIAdminAssist={open(){opens++},submit(){}};
     return Promise.resolve();
    }
    if(name==='admin-lazy-features.js'||name==='admin-ai-control-plane.js')return Promise.reject(Error('optional_asset_unavailable'));
    return Promise.resolve();
   }
  },
  addEventListener(){},
 };
 const app={hidden:false};
 const document={
  body,readyState:'complete',addEventListener(){},
  querySelector(selector){
   if(selector==='#app')return app;
   if(selector==='#ekodiAssistBootstrap')return bootstrap;
   if(selector==='#ekodiAssistDock')return dock?{}:null;
   if(selector==='#ekodiAssistLauncher')return {click(){}};
   return null;
  },
  createElement(name){
   if(name==='div'){
    const result={dataset:{},setAttribute(name,value){this[name]=value},querySelector(selector){
     if(selector==='form')return form;
     if(selector==='button')return plus;
     if(selector==='input')return input;
     if(selector==='.ekodi-assist-bootstrap-send')return send;
     if(selector==='[data-ekodi-assist-error]')return messages[0]||null;
     return null;
    },appendChild(node){messages.push(node)}};
    return result;
   }
   return {dataset:{},setAttribute(name,value){this[name]=value},textContent:''};
  }
 };
 const plus={},input={value:''},send={disabled:false},form={};
 const context={
  window,document,sessionStorage:{getItem(name){return name==='ekodi-auth-token'?'synthetic-token':''}},
  location:{pathname:'/admin/',search:'',hash:''},URLSearchParams,
  addEventListener(){},alert(message){alerts.push(message)},console:{warn(...args){warnings.push(args.map(String).join(' '))}}
 };
 runInNewContext(source,context,{timeout:2000});
 return {plus,classes,scripts,styles,warnings,messages,alerts,opens:()=>opens};
}
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve))};

test('admin Assist bootstrap source parses',()=>{
 const r=spawnSync(process.execPath,['--check',new URL('../admin-assist-bootstrap.js',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});

test('approval workbench remains available when optional AI script loads fail',async()=>{
 const app=fakeAdmin();
 await flush();
 assert.ok(app.opens()>=1,'command-home should open independently of optional modules');
 assert.ok(app.scripts.includes('admin-assist-dock.js'));
 assert.ok(app.scripts.includes('admin-lazy-features.js'));
 assert.ok(app.scripts.includes('admin-ai-control-plane.js'));
 assert.ok(app.classes.has('admin-command-active'));
 const before=app.opens();
 await app.plus.onclick();
 assert.ok(app.opens()>before,'plus control should always reopen approvals');
 assert.equal(app.messages.length,0,'optional failure must not become an approval-blocking error');
});

test('required workbench load failure is visibly reported instead of silent no-op',async()=>{
 const app=fakeAdmin({coreFails:true});
 await flush();
 assert.equal(app.opens(),0);
 await app.plus.onclick();
 assert.ok(app.alerts.length>=1,'required failure must be visible on click');
 assert.match(app.alerts[0],/연결에 실패/);
});
