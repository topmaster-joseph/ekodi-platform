import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isStoreAdminPathShape, storeAdminPage, storeAdminScript } from '../store-admin-engine.js';

const agent=readFileSync(new URL('../agents/windows-pos/EKODI-POS-Agent.ps1',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../agents/windows-pos/pos-agent.config.example.json',import.meta.url),'utf8'));

test('Store Admin exposes the POS console without weakening store scope',async()=>{
  assert.equal(isStoreAdminPathShape('/jadam/admin/pos'),true);
  assert.equal(isStoreAdminPathShape('/pizzamaru/admin/pos'),true);
  const response=storeAdminPage({
    slug:'jadam',
    name:'자담치킨 목포대점',
    id:'4b1e5933-b9ae-4cb9-9d31-dcbb0a5b25aa',
    mark:'JD',
    brand:'JADAM CHICKEN',
    pathname:'/jadam/admin/pos',
  });
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(html,/<h1 id="pageTitle">POS 통합화면<\/h1>/);
  assert.match(html,/20260929-pos-console-v1/);
  const csp=response.headers.get('content-security-policy')||'';
  assert.match(csp,/http:\/\/127\.0\.0\.1:17831/);
  assert.match(csp,/http:\/\/localhost:17831/);

  const script=await storeAdminScript().text();
  assert.match(script,/EKODI Store Console/);
  assert.match(script,/POS_AGENT_URL/);
  assert.match(script,/data-pos-target/);
  assert.match(script,/\/v1\/health/);
  assert.match(script,/\/v1\/focus/);
  assert.match(script,/method:'POST'/);
  assert.match(script,/자동으로 화면을 가로채지 않으며/);
  assert.match(script,/바로 전환/);
});

test('Windows POS Agent is loopback-only and focus is explicit-user-action only',()=>{
  assert.ok(agent.includes("$prefix -notmatch '^http://(127\\.0\\.0\\.1|localhost):\\d+/$'"));
  assert.match(agent,/Access-Control-Allow-Private-Network/);
  assert.match(agent,/https:\/\/ekodi\.kr/);
  assert.match(agent,/focusMode = 'explicit_user_action_only'/);
  assert.match(agent,/AbsolutePath -eq '\/v1\/health'/);
  assert.match(agent,/AbsolutePath -eq '\/v1\/focus'/);
  assert.match(agent,/Find-Target \$targetId/);
  assert.match(agent,/Start-Process -FilePath \$launchPath/);
  assert.doesNotMatch(agent,/Property-Value \$body 'launchPath'/);
  assert.doesNotMatch(agent,/Invoke-Expression|\biex\b/i);

  const healthIndex=agent.indexOf("$request.Url.AbsolutePath -eq '/v1/health'");
  const focusIndex=agent.indexOf("$request.Url.AbsolutePath -eq '/v1/focus'");
  assert.ok(healthIndex>=0&&focusIndex>healthIndex);
  assert.doesNotMatch(agent.slice(healthIndex,focusIndex),/Focus-TargetProcess/);
  assert.match(agent.slice(focusIndex),/Focus-TargetProcess/);
});

test('POS Agent example config exposes only the fixed Store Console target IDs',()=>{
  assert.equal(config.listenerPrefix,'http://127.0.0.1:17831/');
  assert.deepEqual(config.allowedOrigins,['https://ekodi.kr']);
  const ids=config.targets.map(row=>row.id);
  assert.deepEqual(ids,['vpos','mukkebi','ddangyo','naver_order','smartcon','delivery','takeout','reservation']);
  assert.ok(config.targets.every(row=>row.allowLaunch===false));
  assert.ok(config.targets.every(row=>typeof row.launchPath==='string'));
});
