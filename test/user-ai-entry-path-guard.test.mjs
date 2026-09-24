import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../shell/user-ai-entry.js',import.meta.url),'utf8');

function attemptsMount(pathname){
  let createCount=0;
  const document={
    documentElement:{dataset:{ekodiService:'ekodimall',ekodiUserSurface:'public'}},
    currentScript:null,
    readyState:'complete',
    querySelector(){return null},
    createElement(){createCount+=1;throw new Error('blocked route attempted to mount')},
    body:{append(){throw new Error('blocked route attempted to append')}},
  };
  vm.runInNewContext(source,{window:{},document,location:{pathname},URL});
  return createCount>0;
}

test('shared User AI entry never mounts on admin path segments',()=>{
  for(const path of ['/admin','/admin/','/admin/settings','/ekodimall/admin','/ekodimall/admin/','/ekodimall/admin/products','/tenant/admin/orders/history','/ekodimall//admin//products/','/ekodimall/ADMIN/products','/ekodimall/%61dmin/products']){
    assert.equal(attemptsMount(path),false,path);
  }
});

test('shared User AI entry never mounts on the central AI surface',()=>{
  for(const path of ['/ai','/ai/','/ai/history'])assert.equal(attemptsMount(path),false,path);
});
