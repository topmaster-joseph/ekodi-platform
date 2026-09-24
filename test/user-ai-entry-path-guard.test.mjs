import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../shell/user-ai-entry.js',import.meta.url),'utf8');

function mountState(pathname,surface='public'){
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
    documentElement:{dataset:{ekodiService:'ekodimall',ekodiUserSurface:surface}},
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
  const location={pathname,assign(){}};
  vm.runInNewContext(source,{window:{},document,location,URL});
  return {createCount,mountCount};
}

test('shared User AI entry never mounts on admin path segments',()=>{
  for(const path of ['/admin','/admin/','/admin/settings','/ekodimall/admin','/ekodimall/admin/','/ekodimall/admin/products','/tenant/admin/orders/history','/ekodimall//admin//products/','/ekodimall/ADMIN/products','/ekodimall/%61dmin/products']){
    assert.equal(mountState(path).mountCount,0,path);
  }
});

test('shared User AI entry never mounts on the central AI surface',()=>{
  for(const path of ['/ai','/ai/','/ai/history'])assert.equal(mountState(path).mountCount,0,path);
});

test('admin guard does not over-block non-admin user paths',()=>{
  for(const path of ['/','/ekodimall','/ekodimall/administrator','/tenant/myadmin','/tenant/administer/settings','/ai-tools']){
    assert.equal(mountState(path).mountCount,1,path);
  }
});

test('admin surface remains blocked independently of pathname',()=>{
  assert.equal(mountState('/ekodimall','admin').mountCount,0);
});
