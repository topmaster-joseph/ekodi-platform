import test from 'node:test';
import assert from 'node:assert/strict';
import { agodaPublicCities, agodaPublicReady, handleAgodaPublicRequest, agodaPublicResult } from '../api/agoda-public.js';

const env={
 AGODA_AFFILIATE_SITE_ID:'1980072',AGODA_AFFILIATE_API_KEY:'fake-test-key',AGODA_AFFILIATE_ENABLED:'true',
 AGODA_AFFILIATE_API_ENDPOINT:'https://affiliateapi7643.agoda.com/affiliateservice/lt_v1',
 AGODA_AFFILIATE_HTTPS_CONFIRMED:'true',AGODA_AFFILIATE_CONTENT_RIGHTS_APPROVED:'true',
 AGODA_AFFILIATE_REQUEST_PROFILE:'header-only',AGODA_AFFILIATE_PUBLIC_SEARCH_ENABLED:'true',
 AGODA_AFFILIATE_CITIES_JSON:'[{"id":9395,"name":"Official Partner City"}]'
};
const now=new Date('2026-11-08T12:00:00Z');
const url='https://mall-api.ekodi.kr/api/public/agoda/search?cityId=9395&checkInDate=2026-11-15&checkOutDate=2026-11-16&adults=2';
const req=(u=url,method='GET')=>new Request(u,{method});
test('public API disabled until every partner certificate, secret, and region allowlist are present',async()=>{
 assert.equal(agodaPublicReady(env),true);
 assert.equal(agodaPublicReady({...env,AGODA_AFFILIATE_PUBLIC_SEARCH_ENABLED:'false'}),false);
 assert.equal(agodaPublicReady({...env,AGODA_AFFILIATE_CONTENT_RIGHTS_APPROVED:'false'}),false);
 assert.equal(agodaPublicReady({...env,AGODA_AFFILIATE_API_KEY:''}),false);
 assert.equal(agodaPublicReady({...env,AGODA_AFFILIATE_CITIES_JSON:'[]'}),false);
 assert.equal(agodaPublicReady({...env,AGODA_AFFILIATE_SITE_ID:'1111111'}),false);
 let called=0;
 const result=await handleAgodaPublicRequest(req(),{...env,AGODA_AFFILIATE_PUBLIC_SEARCH_ENABLED:'false'},null,{fetchImpl:()=>{called++;throw new Error('no')} ,now});
 assert.equal(result.status,503);assert.equal(called,0);
 assert.equal(JSON.stringify(result).includes('fake-test-key'),false);
});
test('status exposes public region options only when ready, never provider secret',async()=>{
 const active=await handleAgodaPublicRequest(req('https://mall-api.ekodi.kr/api/public/agoda/status'),env,null,{now});
 assert.equal(active.status,200);assert.equal(active.body.available,true);
 assert.deepEqual(active.body.cities,[{id:9395,name:'Official Partner City'}]);
 assert.equal(JSON.stringify(active.body).includes('fake-test-key'),false);
 const absent=await handleAgodaPublicRequest(req('https://mall-api.ekodi.kr/api/public/agoda/status'),{...env,AGODA_AFFILIATE_API_KEY:''},null,{now});
 assert.equal(absent.body.available,false);assert.deepEqual(absent.body.cities,[]);
});
test('reject unsupported region, duplicate params, unrecognized params, invalid date and method',async()=>{
 for(const bad of [
 url.replace('9395','1234'),url+'&cityId=9395',url+'&apiKey=secret',
 url.replace('adults=2','adults=99'),url.replace('2026-11-15','2020-11-15'),
 url.replace('checkOutDate=2026-11-16','checkOutDate=2026-11-15')
 ]){
  const r=await handleAgodaPublicRequest(req(bad),env,null,{now,fetchImpl:()=>{throw Error('must not call')}});
  assert.equal(r.status,400,bad);
 }
 const method=await handleAgodaPublicRequest(req(url,'POST'),env);assert.equal(method.status,405);
});
test('normalizes only exact CID/HID Agoda landing URLs, attaches anonymous campaign tag',()=>{
 const raw={checkedAt:'2026-11-08T12:00:00Z',data:[{hotelId:463019,hotelName:'Hotel',imageUrl:'https://pix6.agoda.net/test.jpg',landingUrl:'https://www.agoda.com/partners/partnersearch.aspx?cid=1980072&hid=463019',dailyRate:100000,starRating:4,reviewScore:8}]};
 const v=agodaPublicResult(raw,env,{cityId:9395,checkInDate:'2026-11-15',checkOutDate:'2026-11-16'});
 assert.equal(v.hotels.length,1);
 assert.equal(new URL(v.hotels[0].landingUrl).searchParams.get('tag'),'ekodi_mall_stay');
 assert.equal(JSON.stringify(v).includes('fake-test-key'),false);
 assert.equal(agodaPublicResult({...raw,data:[{...raw.data[0],landingUrl:'https://www.agoda.com/evil?cid=1980072&hid=463019'}]},env,{}).hotels.length,0);
});
test('bounded authorized provider call and edge cache reuse; no repeat call when cached',async()=>{
 const store=new Map();let count=0;
 const cache={
  match:async key=>store.has(key)?new Response(store.get(key),{status:200}):undefined,
  put:async(key,response)=>{store.set(key,await response.text())}
 };
 const fetchImpl=async(u,opt)=>{
  count++;assert.equal(opt.headers.Authorization,'1980072:fake-test-key');
  assert.equal(u,env.AGODA_AFFILIATE_API_ENDPOINT);
  return new Response(JSON.stringify({results:[{
   hotelId:463019,hotelName:'Official Hotel',currency:'KRW',dailyRate:80000,
   landingURL:'https://www.agoda.com/partners/partnersearch.aspx?cid=1980072&hid=463019'
  }]}),{status:200});
 };
 const a=await handleAgodaPublicRequest(req(),env,null,{now,fetchImpl,cache});
 assert.equal(a.status,200);assert.equal(a.body.hotels.length,1);
 const b=await handleAgodaPublicRequest(req(),env,null,{now,fetchImpl,cache});
 assert.equal(b.status,200);assert.equal(count,1);
 assert.equal(JSON.stringify(b.body).includes('fake-test-key'),false);
});
test('empty and invalid city catalogs never activate API',()=>{
 assert.deepEqual(agodaPublicCities({...env,AGODA_AFFILIATE_CITIES_JSON:'not JSON'}),[]);
 assert.deepEqual(agodaPublicCities({...env,AGODA_AFFILIATE_CITIES_JSON:'[{"id":9395,"name":"<script>"}]'}),[]);
});
