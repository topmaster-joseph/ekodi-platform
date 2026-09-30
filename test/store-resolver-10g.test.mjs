import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {discoverStores,matchBand,resolveStoreCandidates,scoreStoreCandidate,storeDiscoveryProviderStatus} from '../delivery/store-resolver.js';

const query={name:'자담치킨 목포대점',address:'전남 무안군 청계면 승달산길 37-1',phone:'061-453-8295'};

test('Store Resolver auto-matches an exact store identity',()=>{
  const scored=scoreStoreCandidate(query,{...query,storeUrl:'https://example.com/store'});
  assert.equal(scored.score,1);
  assert.equal(matchBand(scored.score),'auto');
  assert.equal(scored.signals.phone,1);
});

test('Store Resolver ranks each platform independently and keeps evidence',()=>{
  const result=resolveStoreCandidates(query,{baemin:[{...query,id:'bm-1',sourceUrl:'https://example.com/bm'}],yogiyo:[{name:'자담치킨 다른지점',address:'전남 목포시',phone:'061-000-0000'}]});
  assert.equal(result.ok,true);
  assert.equal(result.providers.length,7);
  assert.equal(result.providers.find(row=>row.provider==='baemin').best.match,'auto');
  assert.ok(result.providers.find(row=>row.provider==='yogiyo').best.score<.7);
});
test('approved discovery broker fans out across all supported platforms',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({candidates:[{...query,storeId:'same-store',storeUrl:'https://example.com/store'}]}),{status:200,headers:{'content-type':'application/json'}})};
  const result=await discoverStores(query,{STORE_DISCOVERY_BROKER_URL:'https://resolver.example.com/discover'},fetchImpl);
  assert.equal(result.ok,true);
  assert.equal(calls.length,7);
  assert.ok(result.providers.every(row=>row.status==='ok'));
  assert.ok(result.providers.every(row=>row.best?.match==='auto'));
  assert.equal(result.externalMutation,false);
});

test('unconfigured adapters fail soft without scraping or invented data',async()=>{
  const result=await discoverStores(query,{},async()=>{throw new Error('fetch should not run')});
  assert.equal(result.ok,true);
  assert.ok(result.providers.every(row=>row.status==='unconfigured'));
  assert.equal(storeDiscoveryProviderStatus({}).filter(row=>row.configured).length,0);
});
test('Delivery Hub first screen follows the Store Resolver 10G composition',async()=>{
  const html=await fs.readFile(new URL('../delivery/index.html',import.meta.url),'utf8');
  const css=await fs.readFile(new URL('../delivery/styles.css',import.meta.url),'utf8');
  const app=await fs.readFile(new URL('../delivery/app.js',import.meta.url),'utf8');
  const worker=await fs.readFile(new URL('../delivery-worker.js',import.meta.url),'utf8');
  for(const marker of ['EKODI 10G · STORE RESOLVER','매장 하나만 등록하면','7개 플랫폼에서 찾기','자담치킨 목포대점'])assert.match(html,new RegExp(marker));
  for(const marker of ['hero-stage','resolver-visual','resolver-panel','resolver-result'])assert.match(css,new RegExp(marker));
  assert.match(app,/EKODIDeliveryMemberFetch/);
  assert.match(worker,/\/api\/store-resolver\/discover/);
  assert.match(worker,/requireMember/);
});
