import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../shell/user-ai-entry.js',import.meta.url),'utf8');

function mountState(pathname,surface='public',optIn=''){
  let createCount=0;
  let mountCount=0;
  const open={addEventListener(){},setAttribute(){}};
  const form={addEventListener(){}};
  const input={value:'',focus(){}};
  const root={
    dataset:{},
    className:'',
    innerHTML:'',
    querySelector(selector){
      if(selector==='.ekodi-user-ai-entry__open')return open;
      if(selector==='form')return form;
      if(selector==='input')return input;
      return null;
    },
  };
  const document={
    documentElement:{dataset:{ekodiService:'ekodimall',ekodiUserSurface:surface,...(optIn?{ekodiUserAiEntry:optIn}:{})}},
    currentScript:null,
    readyState:'complete',
    querySelector(){return null},
    createElement(tag){
      createCount+=1;
      if(tag==='aside')return root;
      return {dataset:{},textContent:''};
    },
    head:{append(){}},
    body:{append(node){if(node===root)mountCount+=1}},
  };
  vm.runInNewContext(source,{window:{},document,location:{pathname,assign(){}},URL});
  return {createCount,mountCount};
}

test('shared User AI entry never mounts on admin path segments even when opted in',()=>{
  for(const path of ['/admin','/admin/','/admin/settings','/ekodimall/admin','/ekodimall/admin/','/ekodimall/admin/products','/tenant/admin/orders/history','/ekodimall//admin//products/','/ekodimall/ADMIN/products','/ekodimall/%61dmin/products']){
    assert.equal(mountState(path,'public','on').mountCount,0,path);
  }
});

test('shared User AI entry never mounts on the central AI surface',()=>{
  for(const path of ['/ai','/ai/','/ai/history'])assert.equal(mountState(path,'public','on').mountCount,0,path);
});


test('ordinary public and workspace pages do not mount the shared AI entry by default',()=>{
  for(const path of ['/','/ekodimall','/ekodimall/administrator','/tenant/myadmin','/tenant/administer/settings','/ai-tools']){
    assert.equal(mountState(path).mountCount,0,path);
  }
});
test('explicit opt-in enables the AI entry only on eligible user paths',()=>{
  for(const path of ['/','/ekodimall','/tenant/myadmin','/ai-tools']){
    assert.equal(mountState(path,'public','on').mountCount,1,path);
  }
});

test('admin surface remains blocked independently of pathname',()=>{
  assert.equal(mountState('/ekodimall','admin','on').mountCount,0);
});
