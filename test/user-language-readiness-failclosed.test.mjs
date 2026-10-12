import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const runtime=await readFile(new URL('../shell/user-language.js',import.meta.url),'utf8');

function browser(fetchImpl){
  const dataset={};
  const registry={languages:[
    {locale:'ko-KR',aliases:['ko'],short:'한국어',label:'한국어',chrome:{language:'언어'}},
    {locale:'en',aliases:['en'],short:'English',label:'English',chrome:{language:'Language'}}
  ]};
  const window={__EKODI_LANGUAGE_REGISTRY__:registry,addEventListener(){}};
  const document={
    readyState:'loading',
    documentElement:{dataset},
    addEventListener(){},
    querySelectorAll(){return[];}
  };
  class MutationObserver{observe(){}}
  runInNewContext(runtime,{window,document,MutationObserver,fetch:fetchImpl,requestAnimationFrame(){}});
  const api=window.EKODIUserLanguage;
  assert.ok(api,'shared language API must initialize without running DOM boot');
  return {
    api,
    locales:()=>Array.from(api.getReadyLocales()),
    seed(){api.setReadyLocales(['ko-KR','en']);assert.deepEqual(Array.from(api.getReadyLocales()),['ko-KR','en']);}
  };
}

test('LANG-UI-001: HTTP errors revoke previously exposed language choices without retries',async()=>{
  for(const status of [403,429,500,503]){
    let count=0;
    const site=browser(async (url,options)=>{
      count++;
      assert.match(url,/\/api\/i18n\/v1\/status\?service=/);
      assert.equal(options.cache,'no-store');
      return {ok:false,status};
    });
    site.seed();
    await site.api.refreshReadiness();
    assert.deepEqual(site.locales(),['ko-KR'],`failed HTTP ${status} must not leave stale locales`);
    assert.equal(count,1,'quota/access failure must not trigger extra requests');
  }
});

test('LANG-UI-001: network and malformed response fail closed',async()=>{
  for(const fetchImpl of [
    async()=>{throw new Error('offline');},
    async()=>({ok:true,json:async()=>{throw new Error('invalid json');}}),
    async()=>({ok:true,json:async()=>({status:'ok'})}),
    async()=>({ok:true,json:async()=>({publishedLocales:null})})
  ]){
    const site=browser(fetchImpl);
    site.seed();
    await site.api.refreshReadiness();
    assert.deepEqual(site.locales(),['ko-KR']);
  }
});

test('LANG-UI-001: only published locales are restored after recovery',async()=>{
  const replies=[
    {ok:false,status:503},
    {ok:true,json:async()=>({publishedLocales:['ko-KR','en']})},
    {ok:true,json:async()=>({publishedLocales:['ko-KR']})},
    {ok:true,json:async()=>({publishedLocales:[]})}
  ];
  const site=browser(async()=>replies.shift());
  site.seed();
  await site.api.refreshReadiness();
  assert.deepEqual(site.locales(),['ko-KR']);
  await site.api.refreshReadiness();
  assert.deepEqual(site.locales(),['ko-KR','en']);
  await site.api.refreshReadiness();
  assert.deepEqual(site.locales(),['ko-KR']);
  await site.api.refreshReadiness();
  assert.deepEqual(site.locales(),['ko-KR']);
});

test('LANG-UI-001: unsupported or duplicate locale claims do not create choices',async()=>{
  const site=browser(async()=>({ok:true,json:async()=>({publishedLocales:['ko-KR','zz','en','en']})}));
  await site.api.refreshReadiness();
  assert.deepEqual(site.locales(),['ko-KR','en']);
});
