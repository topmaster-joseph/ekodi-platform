import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePublicSupplierSearch, normalizeSupplierSearch, supplierSearchReady} from '../api/public-supplier-search.js';

const url = q => 'https://ekodi.kr/api/public/supplier/search?q=' + encodeURIComponent(q);
const req = q => new Request(url(q));
const ready = {DOMEGGOOK_PUBLIC_CATALOG_RIGHTS_APPROVED:'true',DOMEGGOOK_PUBLIC_SEARCH_RATE_GUARD_APPROVED:'true',DOMEMAE_LOOKUP_ENABLED:'true',DOMEMAE_API_KEY:'unit-test-only'};

test('supplier reference search remains disabled until all explicit gates are configured', async () => {
  for (const [key,val] of Object.entries(ready)) {
    const env = {...ready,[key]:''};
    assert.equal(supplierSearchReady(env),false);
    const result = await handlePublicSupplierSearch(req('자동 릴 호스'),env,() => {throw Error('should not call upstream');});
    assert.equal(result.status,200);
    assert.equal(result.body.enabled,false);
    assert.equal(result.body.checkoutReady,false);
  }
});
test('supplier reference normalizer refuses adult items, duplicate or fake IDs and vendor-provided URLs', () => {
  const rows = normalizeSupplierSearch({domeggook:{list:{item:[
    {no:'57183094',title:'실제 조회 상품',unitQty:'1',url:'https://attacker.example/collect'},
    {no:'57183094',title:'중복'}, {no:'NaN',title:'가짜'},
    {no:'99999123',title:'성인상품',adultOnly:true},
    {no:'45160652',title:'캠핑 용품',unitQty:'5'}
  ]}}});
  assert.deepEqual(rows.map(r=>r.itemNo),['57183094','45160652']);
  assert.equal(rows[0].url,'https://www.domeggook.com/57183094');
  assert.equal(rows[0].purchaseMode,'external-reference-only');
});
test('supplier lookup is read-only and redacts provider failures', async () => {
  let upstream = '';
  const result = await handlePublicSupplierSearch(req('자동 릴 호스'),ready,async (link,init) => {
    upstream=link;
    assert.equal(init.method,'GET');
    assert.equal(init.redirect,'manual');
    return new Response(JSON.stringify({domeggook:{list:{item:{no:'45160652',title:'실제 재고는 별도 확인',unitQty:5}}}}),{status:200});
  });
  assert.equal(new URL(upstream).searchParams.get('mode'),'getItemList');
  assert.equal(result.body.items[0].minimumQuantity,5);
  assert.equal(result.body.checkoutReady,false);
  assert.equal(result.body.priceVerified,false);
  assert.equal(result.body.shippingVerified,false);
  const failure=await handlePublicSupplierSearch(req('자동 릴 호스'),ready,async()=>{throw Error('key leaked');});
  assert.deepEqual(failure.body.items,[]);
  assert.doesNotMatch(JSON.stringify(failure),/key leaked|unit-test-only/);
});
test('supplier public search rejects unbounded or non-GET input before any vendor call', async () => {
  assert.equal((await handlePublicSupplierSearch(req('x'),ready)).status,400);
  assert.equal((await handlePublicSupplierSearch(req('a'.repeat(72)),ready)).status,400);
  assert.equal((await handlePublicSupplierSearch(new Request(url('정상'),{method:'POST'}),ready)).status,405);
});
