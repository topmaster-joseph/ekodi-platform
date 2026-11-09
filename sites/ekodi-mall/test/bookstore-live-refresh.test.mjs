import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/bookstore-live.js', import.meta.url), 'utf8');
const ids = ['BOOK-EKODI-000001','BOOK-EKODI-000003','BOOK-EKODI-000002'];

function harness(start = {}) {
  const modes = new Map(ids.map(id => [id,start[id] || 'ready']));
  const pending = new Map();
  const calls = [];
  const events = [];
  const listeners = {};
  const cards = ids.map((id,i) => {
    const btn = {
      textContent:'구매 상태 확인 중', attributes:{'aria-disabled':'true',tabindex:'-1'},
      setAttribute(k,v) {this.attributes[k]=v},
      removeAttribute(k) {delete this.attributes[k];if(k==='href')delete this.href},
    };
    const card = {
      dataset:{ bookstoreRuntimeId:id, bookstoreQuotePending:'true',
        bookstoreInformational:'true',saleReady:'false',name:'book '+i},
      info:{title:'title '+id,cover:'cover '+id,description:'description '+id},
      querySelector(selector){return selector==='[data-bookstore-buy]' ? btn : null},
    };
    card.button=btn;
    return card;
  });
  const grid = { cards, querySelectorAll(selector){
    return selector==='[data-bookstore-runtime-id]' ? cards : [];
  }};
  const count = {textContent:'0개'};
  const status = {textContent:''};
  const document = {
    body:{dataset:{}},hidden:false,
    getElementById(key){return key==='grid'?grid:null},
    querySelector(key){
      return ({
        '[data-bookstore-public-count]':count,
        '[data-bookstore-store-status]':status
      })[key] || null;
    },
    addEventListener(k,fn){listeners[k]=fn}
  };
  function quote(id, ready) {
    return {book:{id},saleReadiness:{ready},checkout:{
      open:ready,fileReady:ready,saleReady:ready,mode:'live'
    },price:{amount:9900}};
  }
  async function fetch(url) {
    if(!url.includes('/quote?book='))throw Error('unexpected catalog source: '+url);
    const id=decodeURIComponent(url.split('book=')[1]);
    calls.push(id);
    const mode=modes.get(id);
    if(mode==='error')throw Error('temporary quote outage');
    if(mode==='hold') return new Promise(resolve => {
      pending.set(id,()=>resolve({ok:true,json:async()=>quote(id,true)}));
    });
    const ready = mode==='ready';
    const result=quote(id,ready);
    if(mode==='bad-file'){result.saleReadiness.ready=true;result.checkout.open=true;
      result.checkout.saleReady=true;result.checkout.fileReady=false;}
    return {ok:true,json:async()=>result};
  }
  const window = {
    location:{origin:'https://ekodi.kr',pathname:'/ekodimall/'},
    dispatchEvent(event){if(event.type==='ekodi:marketplace-products-loaded'){events.push(event.detail);listeners.loaded?.();}}
  };
  class CustomEvent {constructor(type,opts){this.type=type;this.detail=opts.detail}}
  vm.runInNewContext(source,{document,window,fetch,AbortSignal,URL,Intl,CustomEvent});
  async function until(min) {
    if(events.length>=min)return;
    await Promise.race([
      new Promise(resolve=>listeners.loaded=resolve),
      new Promise((_,reject)=>setTimeout(()=>reject(Error('catalog did not settle')),1800))
    ]);
  }
  async function refresh() {const before=events.length;listeners.visibilitychange();await until(before+1);}
  return {cards,calls,modes,events,count,status,refresh,until,release:(id)=>pending.get(id)?.(),
    startHeld(){listeners.visibilitychange()},card:(id)=>cards.find(c=>c.dataset.bookstoreRuntimeId===id)};
}

test('all three owner-public editions independently verify their purchase buttons', async()=>{
  const h=harness();
  await h.until(1);
  assert.deepEqual([...h.calls].sort(),[...ids].sort());
  assert.equal(h.cards.length,3);
  for(const id of ids){
    const c=h.card(id);
    assert.match(c.button.textContent,/9,900원 구매하기/);
    assert.equal(c.button.href,'/ekodimall/checkout/book/?book='+id);
    assert.equal(c.dataset.saleReady,'true');
    assert.equal(c.info.title,'title '+id);
  }
});

test('one edition can be revoked while the other books and all public information stay put',async()=>{
  const h=harness({ 'BOOK-EKODI-000002':'revoked' });
  const originals=h.cards.slice();
  await h.until(1);
  assert.equal(h.card('BOOK-EKODI-000002').button.href,undefined);
  assert.equal(h.card('BOOK-EKODI-000002').button.attributes['aria-disabled'],'true');
  assert.match(h.card('BOOK-EKODI-000001').button.textContent,/구매하기/);
  h.modes.set('BOOK-EKODI-000003','error');
  await h.refresh();
  assert.equal(h.cards.length,3);
  for(let i=0;i<3;i++)assert.equal(h.cards[i],originals[i],'unchanged card, title, cover and description');
  assert.equal(h.card('BOOK-EKODI-000003').button.href,undefined);
  assert.equal(h.card('BOOK-EKODI-000003').info.cover,'cover BOOK-EKODI-000003');
  h.modes.set('BOOK-EKODI-000002','ready');
  h.modes.set('BOOK-EKODI-000003','ready');
  await h.refresh();
  assert.equal(h.card('BOOK-EKODI-000002').button.href,'/ekodimall/checkout/book/?book=BOOK-EKODI-000002');
  assert.equal(h.count.textContent,'3개 판매 가능');
});

test('missing EPUB or temporary network failure cannot leave a valid checkout link',async()=>{
  const h=harness();
  await h.until(1);
  for(const mode of ['bad-file','error','revoked']){
    h.modes.set('BOOK-EKODI-000002',mode);
    await h.refresh();
    const c=h.card('BOOK-EKODI-000002');
    assert.equal(c.button.href,undefined,mode);
    assert.equal(c.dataset.saleReady,'false',mode);
    assert.equal(c.info.description,'description BOOK-EKODI-000002');
  }
});

test('stale positive quote cannot reenable buy after newer negative quote',async()=>{
  const h=harness();
  await h.until(1);
  h.modes.set('BOOK-EKODI-000002','hold');
  h.startHeld();
  await new Promise(resolve=>setImmediate(resolve));
  h.modes.set('BOOK-EKODI-000002','revoked');
  await h.refresh();
  assert.equal(h.card('BOOK-EKODI-000002').button.href,undefined);
  h.release('BOOK-EKODI-000002');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.card('BOOK-EKODI-000002').button.href,undefined);
});

test('static public book information and sale-only discovery remain separate',()=>{
  const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  const app=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
  const nav=readFileSync(new URL('../assets/category-visibility.js',import.meta.url),'utf8');
  const search=readFileSync(new URL('../assets/home-refresh.js',import.meta.url),'utf8');
  assert.match(build,/catalogProducts = products\.filter/);
  assert.match(build,/isPublicBookInformation\(product\)/);
  assert.match(build,/data-bookstore-runtime-id=/);
  assert.match(build,/data-bookstore-buy/);
  assert.match(build,/bookstoreActive: store\.id === 'store-ekodi-books'/);
  assert.match(app,/card\.dataset\.bookstoreInformational === 'true'/);
  // TOSS-MALL-UNDERWRITING-002: informational (intangible) bookstore cards never keep a category menu visible.
  assert.doesNotMatch(nav,/bookstoreInformational/);
  assert.match(nav,/card\.dataset\.bookstoreQuotePending!=='true'\);/);
  assert.match(search,/card\.dataset\.bookstoreQuotePending !== 'true'/);
  assert.doesNotMatch(source,/grid\.querySelectorAll\('\[data-bookstore-runtime-id\]'\)\.forEach\(card => card\.remove\(\)\)/);
});
