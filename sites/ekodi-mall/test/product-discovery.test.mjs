import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eligibleProductOffer, productDiscoveryGraph, renderProductDiscoveryJsonLd
} from '../scripts/product-discovery.mjs';
const site={seo:{baseUrl:'https://ekodi.kr/ekodimall'},brand:{name:'EKODI MALL'},commerce:{paymentsEnabled:false}};
const store={name:'EKODI Select'};
const product={name:'시범 상품',description:'아직 가격이 정해지지 않은 기획 상품',published:true,saleType:'curation',price:null};
const productUrl='https://ekodi.kr/ekodimall/products/test/';
test('prelaunch pages are discoverable but never claim an Offer',()=>{
  const graph=productDiscoveryGraph({site,store,product,productUrl});
  assert.equal(graph['@graph'].length,1);
  assert.equal(graph['@graph'][0]['@type'],'WebPage');
  assert.equal(JSON.stringify(graph).includes('"@type":"Offer"'),false);
  assert.equal(JSON.stringify(graph).includes('"@type":"Product"'),false);
});
test('a price or affiliate link alone does not unlock rich merchant offers',()=>{
  const sample={...product,price:25000,saleType:'affiliate',verifiedForSale:true,salesReadiness:'verified',stockStatus:'in_stock',action:{type:'checkout',url:'/ekodimall/checkout/'}};
  assert.equal(eligibleProductOffer({site:{...site,commerce:{paymentsEnabled:true}},product:sample}),false);
  assert.equal(eligibleProductOffer({site,product:{...sample,saleType:'direct'}}),false);
});
test('a verified direct sale only exposes an on-site checkout offer',()=>{
  const direct={...product,price:25000,saleType:'direct',verifiedForSale:true,salesReadiness:'verified',stockStatus:'in_stock',action:{type:'checkout',url:'/ekodimall/checkout/'}};
  const enabled={...site,commerce:{paymentsEnabled:true}};
  assert.equal(eligibleProductOffer({site:enabled,product:direct}),true);
  assert.equal(productDiscoveryGraph({site:enabled,store,product:direct,productUrl})['@graph'][1].offers.price,25000);
  assert.equal(eligibleProductOffer({site:enabled,product:{...direct,action:{type:'checkout',url:'https://external.example/checkout/'}}}),false);
  assert.equal(eligibleProductOffer({site:enabled,product:{...direct,stockStatus:'unknown'}}),false);
});
test('untrusted listing descriptions cannot terminate JSON-LD scripts',()=>{
  const escaped=renderProductDiscoveryJsonLd({site,store,product:{...product,description:'</script><script>alert(1)</script>'},productUrl});
  assert.equal((escaped.match(/<\/script>/g)||[]).length,1);
  assert.ok(escaped.includes('\\u003c/script>'));
});
