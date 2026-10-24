import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

const get=path=>new Request('https://ekodi.kr'+path);

test('My Invest shows the autopilot status, policy and emergency stop only inside the owner section',async()=>{
 const html=await (await investMyRoute(get('/invest'),{})).text();
 const owner=html.indexOf('<section id="owner" hidden>');
 assert.ok(owner>0);
 for(const id of ['id="autopilot"','id="apStop"','id="policyForm"','id="paperForm"','id="apGates"','id="apOrders"','id="apWeekly"'])assert.ok(html.indexOf(id)>owner,id);
 assert.match(html,/신규 주문 긴급정지/);
 assert.match(html,/보유자산을 임의로 청산하지 않습니다/);
 assert.match(html,/실제 손실이 한도를 넘을 수 있습니다/);
 assert.match(html,/자동 적용 안 함/);
 assert.match(html,/문자 \(비용 승인 후\)/);
});

test('autopilot money and loss inputs carry no preset values',async()=>{
 const html=await (await investMyRoute(get('/invest'),{})).text();
 for(const key of ['totalBudget','maxOrderAmount','maxDailyBuyAmount','dailyLossLimitPct','totalLossLimitPct']){
  const tag=html.match(new RegExp('<input id="pf_'+key+'"[^>]*>'))?.[0];
  assert.ok(tag,key);
  assert.doesNotMatch(tag,/\svalue=/,key);
 }
 assert.doesNotMatch(html,/<style>|style="/);
});

test('autopilot client talks only to the owner API with DOM-safe rendering',async()=>{
 const js=await (await investMyRoute(get('/invest/app.js'),{})).text();
 assert.match(js,/\/workspace-api\/v1\/invest\/autopilot/);
 assert.match(js,/emergency-stop/);
 assert.match(js,/RESUME_AFTER_REVIEW/);
 assert.doesNotMatch(js,/innerHTML|localStorage\.setItem|sessionStorage\.setItem|\/broker\/orders/);
 const css=await (await investMyRoute(get('/invest/style.css'),{})).text();
 assert.match(css,/\.autopilot\{/);
 assert.match(css,/\.btn\.danger/);
});
