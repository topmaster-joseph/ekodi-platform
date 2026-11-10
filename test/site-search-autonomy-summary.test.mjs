import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteSearchPromotionOversight as summarize } from '../site-search-autonomy-summary.js';
const sites=[{url:'https://ekodi.kr/ekodichurch/',name:'교회',propertyType:'canonical'},
{url:'https://ekodi.kr/ekodimall/',name:'몰',propertyType:'canonical'},
{url:'https://other.example/',name:'별칭',propertyType:'independent-domain'}];
test('unknown evidence never becomes a false success or zero',()=>{
 const rows=summarize({sites,automation:{status:'partial',sources:{jobs:'unavailable',connections:'unavailable'},sites:[]}});
 assert.equal(rows.length,3);assert.ok(rows.every(x=>x.status==='unreported'));
 assert.ok(rows.every(x=>x.publishedJobs===null&&x.providerVerified===false));
});
test('site-owned jobs produce bounded status and safe site-admin links',()=>{
 const rows=summarize({sites,automation:{sources:{jobs:'ready',connections:'ready',indexNow:'ready'},sites:[
 {basePath:'/ekodichurch',scope:'explicit_subject',publishedJobs:3,failedJobs:2,pendingJobs:0,adminPath:'/ekodichurch/admin',activeChannels:1,indexNowSubmittedPages:4},
 {basePath:'/ekodimall',scope:'explicit_subject',publishedJobs:5,failedJobs:0,pendingJobs:0,adminPath:'https://evil.example/admin',activeChannels:2,indexNowSubmittedPages:9}
 ]}});
 assert.equal(rows[0].status,'needs_action');assert.equal(rows[0].failedJobs,2);
 assert.equal(rows[0].adminPath,'/ekodichurch/admin');
 assert.equal(rows[1].status,'reported');assert.equal(rows[1].adminPath,'');
 assert.equal(rows[2].status,'unreported');
 assert.ok(rows.every(x=>!x.providerVerified));
});
test('unverified alias does not inherit canonical tenant evidence',()=>{
 const rows=summarize({sites:[{url:'https://ekodi.kr/ekodimall/',name:'a',propertyType:'independent-domain'}],
 automation:{sources:{jobs:'ready'},sites:[{basePath:'/ekodimall',scope:'explicit_subject',publishedJobs:100}]}});
 assert.equal(rows[0].status,'unreported');
});
