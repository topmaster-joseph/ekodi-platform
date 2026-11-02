import test from 'node:test';
import assert from 'node:assert/strict';
import {investMyRoute} from '../invest-my-workspace.js';

test('owner broker selector failures expose only bounded safe HTTP diagnostics',async()=>{
 const js=await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 assert.match(js,/function brokerPreferenceErrorLabel\(result\)/);
 for(const status of ['401','403','404','409','500','503'])assert.match(js,new RegExp(status+':'));
 assert.match(js,/서버 설정 확인 실패/);
 assert.match(js,/brokerPreferenceErrorLabel\(lastResponse\)/);
 assert.match(js,/설정 저장에 실패했습니다/);
 assert.match(js,/let lastResponse=null/);
 assert.doesNotMatch(js,/JSON\.stringify\(lastResponse\)/);
 assert.match(js,/실제 주문 차단/);
});
