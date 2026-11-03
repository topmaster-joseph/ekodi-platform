import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { investIntroPage, investAnalysisScript } from '../invest-access-ui.js';

const token='A'.repeat(43);
test('Invest landing uses MY authentication realm, not public common-analysis callback',async()=>{
 const html=await (await investIntroPage()).text();
 const match=html.match(/href="(\/auth\/\?site=my&return_to=[^"]+)"/);
 assert.ok(match,'private Invest login must use the My EKODI realm');
 const uri=new URL(match[1],'https://ekodi.kr');
 assert.equal(uri.searchParams.get('return_to'),'https://ekodi.kr/my/invest');
 assert.equal(uri.searchParams.get('site'),'my');
 assert.match(html,/로그인 후 마이투자/);
 assert.match(html,/href="\/invest\/analysis"/,'common analysis remains accessible as a distinct opt-in');
 assert.doesNotMatch(match[1],/invest%2Fanalysis/);
});
test('legacy analysis auth fragment is handed off intact to private consumer without a query-string secret',async()=>{
 const js=await (await investAnalysisScript()).text();
 const destinations=[];
 const location={hash:'#ekodi_token='+token+'&ekodi_type=email',pathname:'/invest/analysis',search:'',
   replace:target=>destinations.push(target)};
 vm.runInNewContext(js,{location,URLSearchParams,encodeURIComponent,history:{replaceState(){throw Error('should not erase valid fragment before redirect')}}});
 assert.deepEqual(destinations,['/my/invest#ekodi_token='+token+'&ekodi_type=email']);
 assert.ok(!destinations[0].includes('?'));
 assert.doesNotMatch(js,/\/broker\/orders|\/automation\/resume/);
});
test('new login CTA and the authenticated common analysis fallback both target MY without open redirects',async()=>{
 const js=await (await investAnalysisScript()).text();
 assert.match(js,/site=my&return_to/);
 assert.match(js,/https:\/\/ekodi\.kr\/my\/invest/);
 assert.doesNotMatch(js,/site=invest&return_to/);
 assert.match(js,/\['email','magiclink','recovery','signup','invite'\]/);
});
