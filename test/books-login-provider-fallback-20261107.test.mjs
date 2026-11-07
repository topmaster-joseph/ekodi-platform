import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../books/buy/commerce-client.js',import.meta.url),'utf8');
const RETURN_TO='https://ekodi.kr/books/library/?source=books#lib-help';

test('Google setup failure always leaves central EKODI login reachable with exact return URL',async()=>{
  const state={messages:[]};
  const host={
    clientWidth:330,
    children:[],
    replaceChildren(...items){this.children=items},
    append(...items){this.children.push(...items)},
  };
  const context={
    window:{google:{accounts:{id:{}}}},
    document:{createElement: tag=>({tagName:tag,style:{},className:'',href:'',textContent:''})},
    location:{href:RETURN_TO,pathname:'/books/library/'},
    localStorage:{getItem(){return null},setItem(){},removeItem(){}},
    AbortController, URL, Date, JSON, console, setTimeout, clearTimeout,
    fetch:async()=>{throw new Error('synthetic identity challenge outage')},
  };
  vm.runInNewContext(src,context);
  const pending=context.window.EkodiBooksCommerce.mountGoogle(host,(msg,err)=>state.messages.push({msg,err}),()=>{});
  assert.equal(host.children.length,1,'alternative login must appear without waiting for Google');
  assert.equal(host.children[0].className,'central-login-link');
  const initial=new URL(host.children[0].href);
  assert.equal(initial.origin,'https://ekodi.kr');
  assert.equal(initial.pathname,'/auth/');
  assert.equal(initial.searchParams.get('site'),'books');
  assert.equal(initial.searchParams.get('return_to'),RETURN_TO);
  await pending;
  assert.equal(host.children.length,1,'failed Google setup should leave exactly one alternative login link');
  assert.equal(host.children[0].href,initial.href);
  assert.match(state.messages.at(-1).msg,/다른 로그인 방법을 선택/);
  assert.equal(state.messages.at(-1).err,true);
});

test('normal Google rendering preserves the fallback provider entry alongside the Google button',()=>{
  assert.match(src,/window\.google\.accounts\.id\.renderButton\(host,/);
  assert.match(src,/host\.append\(centralLoginLink\(\)\)/);
  assert.match(src,/host\.replaceChildren\(centralLoginLink\(\)\)/);
  assert.doesNotMatch(src,/location\.assign\(['"]https:\/\/auth\.ekodi\.kr/);
});
