import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMallSupplierAdmin } from '../mall-supplier-admin-view.js';

const source = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = number => Number(number || 0).toLocaleString('ko-KR');

test('supplier overview is in the existing Mall admin shell with site-local capability plus server-side operator check', () => {
  const admin = source('../workspace-admin-page.js');
  const view = source('../mall-supplier-admin-view.js');
  assert.match(admin, /suppliers:TENANT_ADMIN_CAPABILITIES\.supplyNetwork/);
  assert.match(admin, /suppliers:POLICY\.capabilities\.supplyNetwork/);
  assert.match(admin, /if\(section==='suppliers'\)return mallSuppliers\(\)/);
  assert.match(admin, /renderMallSupplierAdmin\.toString\(\)/);
  assert.match(view, /\/ekodimall\/api\/api\/internal\/products\/by-provider/);
  assert.match(view, /privateData\.scope !== 'operator-read-only'/);
  assert.ok(view.indexOf("privateData.scope !== 'operator-read-only'") < view.indexOf("Promise.allSettled"));
  assert.doesNotMatch(view, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]|setOrder\(/);
});

test('Mall administrator does not read external feeds if server denies cross-seller permission', async () => {
  const oldFetch = globalThis.fetch;
  const requests = [];
  const host = {innerHTML:''};
  const summary = {replaceChildren(){this.cleared = true},innerHTML:''};
  const oldDoc = globalThis.document;
  try {
    globalThis.fetch = async url => {
      requests.push(url);
      return {ok:false,status:403,json:async()=>({error:'denied'})};
    };
    globalThis.document = {querySelector(){throw new Error('denied branch must not query document')}};
    const result = await renderMallSupplierAdmin({
      host, summary, token:'testing-seller-no-operator',
      card:()=>'', state:()=>{}, escape:htmlEscape, format, adminBase:'/ekodimall/admin'
    });
    assert.equal(result, undefined);
    assert.deepEqual(requests,['/ekodimall/api/api/internal/products/by-provider']);
    assert.match(host.innerHTML,/최고관리자/);
    assert.equal(summary.cleared,true);
  } finally {
    globalThis.fetch=oldFetch;
    globalThis.document=oldDoc;
  }
});

test('operator view shows zero-product Agoda, separates buyer checkout, and supports supplier tabs', async () => {
  const oldFetch=globalThis.fetch, oldDoc=globalThis.document, oldLocation=globalThis.location;
  const requested=[];
  const state=[];
  const fake = {};
  function element() { return {innerHTML:'',textContent:'',hidden:false,value:'',listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn},
    querySelectorAll(){return[]},
    setAttribute(name,value){this[name]=value}
  }; }
  for(const id of ['mallSupplierTabs','mallSupplierSearch','mallSupplierCount','mallSupplierRows','mallSupplierMore'])fake[id]=element();
  const buttons=[{dataset:{provider:'all'},setAttribute(){}} ,{dataset:{provider:'agoda'},setAttribute(){}} ,{dataset:{provider:'domeggook'},setAttribute(){}}];
  fake.mallSupplierTabs.querySelectorAll=()=>buttons;
  const host={innerHTML:''}, summary={innerHTML:'',replaceChildren(){}};
  const response=(data)=>({ok:true,status:200,json:async()=>data});
  const products=[
    {id:'a',status:'published',checkoutReady:false,product:{saleType:'direct',name:'스테인리스 보관통',price:20000,category:'living'},seller:{displayName:'에코디'},supply:{provider:'domeggook'}},
    {id:'b',status:'published',checkoutReady:true,product:{saleType:'direct',name:'자체 상품',price:5000,category:'gift'},seller:{displayName:'판매자 A'},source:{kind:'ekodibiz_own'}}
  ];
  try {
    globalThis.document={querySelector:query=>fake[query.slice(1)],querySelectorAll:query=>query.includes('#mallSupplierTabs')?buttons:[]};
    globalThis.location={origin:'https://ekodi.kr'};
    globalThis.fetch=async url=>{
      requested.push(url);
      if(url==='/ekodimall/api/api/internal/products/by-provider')return response({products,scope:'operator-read-only',limit:2000});
      if(url==='/ekodimall/assets/provider-registry.json')return response({providers:[
        {id:'domeggook',label:'도매꾹·도매매',group:'상품',status:'회원오류 · 발주차단'},
        {id:'agoda',label:'아고다',group:'숙박',status:'제휴 검색링크 운영'},
        {id:'bookstore',label:'에코디서점',group:'출판',status:'도서 목록'},
        {id:'coupang',label:'쿠팡파트너스',group:'제휴',status:'외부 결제'}
      ]});
      if(url==='/ekodimall/provider-bookstore.json')return response({products:[{id:'book1',name:'도서 한 권',saleReady:false,price:19000,detailUrl:'/books/book1'}]});
      if(url.startsWith('/api/affiliate/public/products?'))return response({products:[{providerKey:'coupang_partners',productId:'c1',productName:'제휴 장바구니',priceKrw:9900,clickUrl:'/api/affiliate/public/click/c1'}]});
      throw new Error('unexpected URL '+url);
    };
    await renderMallSupplierAdmin({host,summary,token:'operator-token',card:(label,value)=>label+':'+value, state:x=>state.push(x),escape:htmlEscape,format,adminBase:'/ekodimall/admin'});
    assert.deepEqual(requested.slice(0,1),['/ekodimall/api/api/internal/products/by-provider']);
    assert.equal(requested.length,4);
    assert.match(host.innerHTML,/아고다 · 0/);
    assert.match(summary.innerHTML,/조회된 상품:4/);
    assert.match(fake.mallSupplierRows.innerHTML,/스테인리스 보관통/);
    assert.match(fake.mallSupplierRows.innerHTML,/상품 준비중/);
    assert.match(fake.mallSupplierRows.innerHTML,/외부 구매 연결/);
    fake.mallSupplierTabs.listeners.click({target:{closest:()=>({dataset:{provider:'agoda'}})}});
    assert.match(fake.mallSupplierRows.innerHTML,/상품이 없습니다/);
    assert.match(fake.mallSupplierCount.textContent,/0건/);
    fake.mallSupplierTabs.listeners.click({target:{closest:()=>({dataset:{provider:'domeggook'}})}});
    assert.match(fake.mallSupplierRows.innerHTML,/스테인리스 보관통/);
    assert.doesNotMatch(fake.mallSupplierRows.innerHTML,/자체 상품/);
    assert.equal(state.at(-1),'공급처별 조회');
  } finally {
    globalThis.fetch=oldFetch;
    globalThis.document=oldDoc;
    globalThis.location=oldLocation;
  }
});
