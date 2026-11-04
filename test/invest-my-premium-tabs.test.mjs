import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

test('private Invest shows only minimal login before owner validation',async()=>{
 const html=await investMyRoute(new Request('https://ekodi.kr/invest/my'),{}).then(r=>r.text());
 for(const id of ['kpiAuth','kpiBroker','kpiPaper','kpiLive','kpiUpdated'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/<strong id="kpiLive">잠금<\/strong>/);
 assert.match(html,/<section id="owner" hidden>/);
 assert.match(html,/id="ownerSidebar"[^>]*hidden/);
 assert.match(html,/id="investAuthIntro"/);
 assert.doesNotMatch(html,/<header class="top"/);
 assert.match(html,/id="stepUpButton"/);
 assert.match(html,/id="ownerTabs" class="tabs" hidden role="tablist"/);
 assert.match(html,/id="detailTabs" class="detail-tabs" hidden role="tablist"/);
});
test('private subroutes are independent and summary indicators disappear outside overview',async()=>{
 const js=await investMyRoute(new Request('https://ekodi.kr/invest/my/app.js'),{}).then(r=>r.text());
 assert.match(js,/ownerSummary:'summary',ownerTabs:'\*'/);
 assert.match(js,/const INVEST_DETAIL_PATHS=/);
 assert.match(js,/const DETAIL_BY_SLUG=/);
 assert.match(js,/const DETAIL_GROUPS=/);
 assert.match(js,/const slug=pathname==='\/invest\/my'/);
 assert.match(js,/addEventListener\('popstate'/);
 assert.match(js,/loginHref\(\)/);
 assert.match(js,/setStepUp\('done'\)/);
 assert.match(js,/el\('ownerSidebar'\)\.hidden=false/);
 assert.doesNotMatch(js,/innerHTML|localStorage\.setItem|sessionStorage\.setItem/);
});
