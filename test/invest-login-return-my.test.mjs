import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { investIntroPage, investAnalysisScript } from '../invest-access-ui.js';
import { investMyRoute } from '../invest-my-workspace.js';

test('public Invest login uses Invest realm and canonical private root',async()=>{
 const html=await investIntroPage().then(r=>r.text());
 const match=html.match(/href="(\/auth\/\?site=invest&return_to=[^"]+)"/);
 assert.ok(match);
 const url=new URL(match[1],'https://ekodi.kr');
 assert.equal(url.searchParams.get('site'),'invest');
 assert.equal(url.searchParams.get('return_to'),'https://ekodi.kr/invest/my');
 assert.match(html,/로그인 후 마이투자/);
});
test('old public analysis auth handoff forwards to a private Invest fragment only',async()=>{
 const token='A'.repeat(43);
 const js=await investAnalysisScript().then(r=>r.text());
 const destinations=[];
 const location={hash:'#ekodi_token='+token+'&ekodi_type=email',pathname:'/invest/analysis',search:'',replace:dest=>destinations.push(dest)};
 vm.runInNewContext(js,{location,URLSearchParams,encodeURIComponent,history:{replaceState(){throw Error('valid token was discarded')}}});
 assert.deepEqual(destinations,['/invest/my#ekodi_token='+token+'&ekodi_type=email']);
 assert.ok(!destinations[0].includes('?'));
});
test('private subpage login preserves that path and allowed user query when invoked',async()=>{
 const js=await investMyRoute(new Request('https://ekodi.kr/invest/my/app.js'),{}).then(r=>r.text());
 assert.match(js,/function loginHref\(\)/);
 assert.match(js,/location\.pathname\.startsWith\('\/invest\/my'\)/);
 assert.match(js,/site=invest&return_to/);
 assert.match(js,/encodeURIComponent\(target\)/);
 assert.doesNotMatch(js,/site=my&return_to|https:\/\/ekodi\.kr\/my\/invest/);
});
