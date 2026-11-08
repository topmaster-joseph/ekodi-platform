import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedAgodaLiteEndpoint,agodaLiteReadiness,agodaLiteCriteria,normalizeAgodaLiteResults,queryAgodaLite} from '../api/agoda-lite.js';
const now=new Date('2026-11-08T09:00:00Z');
const env={AGODA_AFFILIATE_ENABLED:'true',AGODA_AFFILIATE_SITE_ID:'1980072',AGODA_AFFILIATE_API_KEY:'test-secret',
 AGODA_AFFILIATE_API_ENDPOINT:'https://affiliateapi7643.agoda.com/affiliateservice/lt_v1',AGODA_AFFILIATE_HTTPS_CONFIRMED:'true',
 AGODA_AFFILIATE_REQUEST_PROFILE:'header-and-body',AGODA_AFFILIATE_CONTENT_RIGHTS_APPROVED:'true'};
test('strictly refuse cleartext, credentials, port and forged Agoda API hosts',()=>{
 for(const u of ['http://affiliateapi7643.agoda.com/affiliateservice/lt_v1','https://agoda.com.evil.test/affiliateservice/lt_v1',
 'https://username:password@affiliateapi7643.agoda.com/affiliateservice/lt_v1','https://affiliateapi7643.agoda.com:8443/affiliateservice/lt_v1',
 'https://affiliateapi7643.agoda.com/other','https://affiliateapi7643.agoda.com/affiliateservice/lt_v1?redirect=evil'])
 assert.equal(approvedAgodaLiteEndpoint(u),'',u);
 assert.ok(approvedAgodaLiteEndpoint(env.AGODA_AFFILIATE_API_ENDPOINT));
});
test('fail closed when HTTPS proof, content rights or Worker key is absent without exposing key',()=>{
 assert.equal(agodaLiteReadiness(env).ready,true);
 assert.equal(JSON.stringify(agodaLiteReadiness(env)).includes('test-secret'),false);
 assert.ok(agodaLiteReadiness({...env,AGODA_AFFILIATE_API_KEY:''}).blockers.includes('SECRET_REQUIRED'));
 assert.ok(agodaLiteReadiness({...env,AGODA_AFFILIATE_HTTPS_CONFIRMED:'false'}).blockers.includes('PROVIDER_HTTPS_CONFIRMATION_REQUIRED'));
 assert.ok(agodaLiteReadiness({...env,AGODA_AFFILIATE_CONTENT_RIGHTS_APPROVED:'false'}).blockers.includes('CONTENT_RIGHTS_REQUIRED'));
 assert.ok(agodaLiteReadiness({...env,AGODA_AFFILIATE_REQUEST_PROFILE:''}).blockers.includes('REQUEST_PROFILE_CONFIRMATION_REQUIRED'));
});
test('city search, hotel ID search, KRW and Korean locale use official PDF field names',()=>{
 const c=agodaLiteCriteria({cityId:9395,checkInDate:'2026-11-15',checkOutDate:'2026-11-16',adults:2},now).criteria;
 assert.equal(c.cityId,9395);assert.equal(c.additional.currency,'KRW');assert.equal(c.additional.language,'ko-kr');assert.equal(c.additional.maxResult,30);
 const h=agodaLiteCriteria({hotelIds:[407854],checkInDate:'2026-11-15',checkOutDate:'2026-11-16'},now).criteria;
 assert.deepEqual(h.hotelId,[407854]);assert.equal(h.additional.maxResult,undefined);
});
test('reject invalid dates, excessive stays, duplicate hotel IDs and invalid occupancy',()=>{
 const base={cityId:9395,checkInDate:'2026-11-15',checkOutDate:'2026-11-16'};
 for(const bad of [{...base,checkInDate:'2026-11-16'},{...base,checkInDate:'2026-11-31'},
 {...base,checkOutDate:'2026-12-31'},{...base,cityId:0},{...base,hotelIds:[5,5]},{...base,children:1},{...base,adults:100}])
 assert.throws(()=>agodaLiteCriteria(bad,now));
});
test('filter duplicate, unrelated CID and insecure hotel photo URLs',()=>{
 const u='https://www.agoda.com/partners/partnersearch.aspx?cid=1980072&hid=463019';
 const rows=normalizeAgodaLiteResults({results:[
 {hotelId:463019,hotelName:'Real Hotel',landingURL:u,imageURL:'http://pix6.agoda.net/hotel.jpg',currency:'KRW',dailyRate:50000},
 {hotelId:463019,hotelName:'Duplicate Hotel',landingURL:u},
 {hotelId:5,hotelName:'Wrong CID',landingURL:'https://www.agoda.com/partners/partnersearch.aspx?cid=1111111&hid=5'}
 ]},'1980072',now.toISOString());
 assert.equal(rows.length,1);assert.equal(rows[0].hotelName,'Real Hotel');assert.equal(rows[0].imageUrl,'');assert.equal(rows[0].dailyRate,50000);
});
test('mocked server-only search sends auth to vetted HTTPS endpoint and returns safe results',async()=>{
 let calls=0;
 const r=await queryAgodaLite(env,{cityId:9395,checkInDate:'2026-11-15',checkOutDate:'2026-11-16'},{
 now,fetchImpl:async(url,opts)=>{
  calls++;assert.equal(url,env.AGODA_AFFILIATE_API_ENDPOINT);assert.equal(opts.headers.Authorization,'1980072:test-secret');
  assert.equal(JSON.parse(opts.body).siteid,'1980072');
  return {ok:true,text:async()=>JSON.stringify({results:[{hotelId:463019,hotelName:'Verified Hotel',landingURL:'https://www.agoda.com/partners/partnersearch.aspx?cid=1980072&hid=463019'}]})};
 }});
 assert.equal(calls,1);assert.equal(r.data.length,1);assert.equal(JSON.stringify(r).includes('test-secret'),false);
});
test('missing security confirmation never contacts provider',async()=>{
 let calls=0;
 await assert.rejects(queryAgodaLite({...env,AGODA_AFFILIATE_HTTPS_CONFIRMED:'false'},
 {cityId:9395,checkInDate:'2026-11-15',checkOutDate:'2026-11-16'},{
 now,fetchImpl:async()=>{calls++}
 }),{code:'AGODA_NOT_READY'});
 assert.equal(calls,0);
});