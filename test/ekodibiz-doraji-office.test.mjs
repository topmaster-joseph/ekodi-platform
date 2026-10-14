import test from 'node:test';
import assert from 'node:assert/strict';
import {isDorajiOfficePath,dorajiOfficeResponse} from '../ekodibiz-doraji-office.js';
import {BUSINESS_OS_STAGE} from '../business-os-core.js';
const get=p=>new Request('https://ekodi.kr'+p);
test('business unit owns only the doraji office prefix',()=>{
 assert.equal(isDorajiOfficePath('/ekodibiz/doraji'),true);
 assert.equal(isDorajiOfficePath('/ekodibiz/doraji/budget'),true);
 assert.equal(isDorajiOfficePath('/ekodibiz/dorajix'),false);
});
test('overview and all operational sections render',async()=>{
 for(const tab of ['overview','projects','cultivation','budget','contracts','delivery','documents']){
  const res=dorajiOfficeResponse(get('/ekodibiz/doraji/'+tab));
  assert.equal(res.status,200,tab);
  const html=await res.text();
  assert.match(html,/EKODIBIZ/);
  assert.match(html,/data-ekodi-business-unit="doraji"/);
 }
});
test('calculations remain client only with a separate first-party script',async()=>{
 const res=dorajiOfficeResponse(get('/ekodibiz/doraji/budget'));
 const html=await res.text();
 assert.match(html,/calculator\.js/);
 assert.match(html,/서버에 저장되지 않습니다/);
 const js=await dorajiOfficeResponse(get('/ekodibiz/doraji/calculator.js')).text();
 assert.match(js,/breakeven/);
});
test('unknown routes and mutating methods are rejected',()=>{
 assert.equal(dorajiOfficeResponse(get('/ekodibiz/doraji/not-a-tab')).status,404);
 assert.equal(dorajiOfficeResponse(new Request('https://ekodi.kr/ekodibiz/doraji',{method:'POST'})).status,405);
});

test('the office reuses the shared Business OS project stages',()=>{assert.equal(BUSINESS_OS_STAGE.length,6)});
