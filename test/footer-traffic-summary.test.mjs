import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleTrafficIntelligence } from '../traffic-intelligence-control.js';
import { trafficSiteIdForVisit } from '../traffic-intelligence.js';

const endpoint = 'https://ekodi.kr/api/telemetry/public-summary';
function utcAgo(days) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)).toISOString().slice(0, 10);
}
function mockDb(rows, calls) {
  return { prepare(sql) {
    assert.match(sql, /FROM traffic_human_sessions/);
    assert.match(sql, /GROUP BY day/);
    return { bind(...params) {
      calls.push(params);
      return { async all() { return { results:rows }; } };
    } };
  } };
}
test('footer public endpoint scopes sessions to a canonical site and correctly labels its windows', async () => {
  const calls=[];
  const db=mockDb([
    {day:utcAgo(0),sessions:10},
    {day:utcAgo(5),sessions:15},
    {day:utcAgo(20),sessions:25},
  ],calls);
  const response=await handleTrafficIntelligence(new Request(endpoint+'?site_path=ekodichurch&site_id=mission'),{DB:db});
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),/max-age=300/);
  const result=await response.json();
  assert.equal(result.siteId,'church');
  assert.equal(result.basis,'anonymous_browser_sessions');
  assert.equal(result.timezone,'UTC');
  assert.equal(result.today.label,'10');
  assert.equal(result.last7Days.label,'25');
  assert.equal(result.last30Days.label,'50');
  assert.deepEqual(calls[0],['church',utcAgo(29)]);
  assert.equal('requestTotal' in result,false,'shared-host requests must not become site pageviews');
});

test('small non-zero public counts are masked, without returning the hidden number', async () => {
  const response=await handleTrafficIntelligence(new Request(endpoint+'?site_path=ekodimission'),{
    DB:mockDb([{day:utcAgo(0),sessions:2}],[])
  });
  const result=await response.json();
  assert.deepEqual(result.today,{label:'5 미만',suppressed:true});
  assert.deepEqual(result.last7Days,{label:'5 미만',suppressed:true});
  assert.doesNotMatch(JSON.stringify(result),/session_hash|client_ip|user_agent|request_path/);
});

test('unknown and private site routes never accidentally display root counts', async () => {
  for (const path of ['unknown-route','admin','my','auth/sign-in']) {
    let touched=false;
    const response=await handleTrafficIntelligence(new Request(endpoint+'?site_path='+encodeURIComponent(path)),{
      DB:{prepare(){touched=true;throw Error('must not read DB');}}
    });
    assert.equal(response.status,404,path);
    assert.equal(touched,false);
  }
});

test('public read requires allowed origin and does not broaden telemetry collection privileges',async()=>{
  const calls=[];
  const db=mockDb([],calls);
  const bad=await handleTrafficIntelligence(new Request(endpoint+'?site_path=ekodichurch',{
    headers:{origin:'https://third-party.invalid'}
  }),{DB:db});
  assert.equal(bad.status,403);
  assert.equal(calls.length,0);
  const good=await handleTrafficIntelligence(new Request(endpoint,{headers:{origin:'https://ekodichurch.kr'}}),{DB:db});
  assert.equal(good.status,200);
  assert.equal((await good.json()).siteId,'church');
  assert.equal(good.headers.get('access-control-allow-origin'),'https://ekodichurch.kr');
});

test('missing aggregate schema is pending, not made-up zero visits',async()=>{
  const db={prepare(){return {bind(){return {async all(){throw Error('no such table: traffic_human_sessions');}};}};}};
  const response=await handleTrafficIntelligence(new Request(endpoint+'?site_path=ekodichurch'),{DB:db});
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{status:'pending'});
});

test('Books and Education canonical paths are attributed to their own sites',()=>{
  assert.equal(trafficSiteIdForVisit('ekodi.kr','ekodibooks'),'books');
  assert.equal(trafficSiteIdForVisit('ekodi.kr','edu'),'edu');
});

test('both shared and native footers use one compact scoped presentation',async()=>{
  const source=await readFile('shell/user-ui-footer.js','utf8');
  const shell=await readFile('shell/shell.js','utf8');
  const router=await readFile('mission-control-entry-worker.js','utf8');
  assert.match(source,/attachFooterTraffic\(nativeFooter\(\)\)/);
  assert.match(source,/attachFooterTraffic\(existing\)/);
  assert.match(source,/attachFooterTraffic\(footer\)/);
  assert.match(source,/data-ekodi-footer-traffic/);
  assert.match(source,/max-width:390px/);
  assert.match(source,/익명 세션 · UTC 기준/);
  assert.match(shell,/trafficKnownRoots=new Set\('ai bible books ekodibooks/);
  assert.match(shell,/ delivery edu education energy/);
  assert.match(router,/path === '\/api\/telemetry\/public-summary'/);
});
