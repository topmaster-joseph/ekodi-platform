import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateCrawlHealth,syncCrawlAlertIssue,watchSeonamMediCrawl,CRAWL_HEALTH_POLICY} from '../seonammedi-crawl-health.js';

// Owner request (2026-10-20): EKODI itself detects collection failures and
// notifies the Owner — not an external assistant.

const NOW=Date.parse('2026-10-21T00:00:00Z');
const run=(minutesAgo,extra={})=>({started_at:new Date(NOW-minutesAgo*60000).toISOString(),status:'ok',sources_checked:15,...extra});

test('fresh full runs and successful wakes are healthy',()=>{
  const h=evaluateCrawlHealth({runs:[run(30),run(90)],wakes:[{woke_at:'2026-10-20T23:00:00Z',ok:1,detail:'dispatched'}],now:NOW});
  assert.equal(h.healthy,true);
  assert.equal(h.ageMinutes,30);
});

test('stale collection, worker-only partial runs and missing history alert',()=>{
  assert.equal(evaluateCrawlHealth({runs:[run(200)],now:NOW}).healthy,false);
  const partialOnly=evaluateCrawlHealth({runs:[run(10,{status:'partial',sources_checked:5}),run(10,{sources_checked:5})],now:NOW});
  assert.equal(partialOnly.healthy,false,'Worker-egress partial runs are not collection');
  const none=evaluateCrawlHealth({runs:[],now:NOW});
  assert.equal(none.healthy,false);
  assert.match(none.reasons[0],/정상 수집 기록이 없습니다/);
  assert.equal(evaluateCrawlHealth({runs:[run(140)],now:NOW}).healthy,true,'one skipped hour (16:00 KST) plus slack is tolerated');
});

test('two consecutive failed wakes alert with an actionable Korean reason',()=>{
  const h=evaluateCrawlHealth({runs:[run(20)],wakes:[{woke_at:'2026-10-20T23:00:00Z',ok:0,detail:'github_http_401'},{woke_at:'2026-10-20T22:00:00Z',ok:0,detail:'github_http_401'}],now:NOW});
  assert.equal(h.healthy,false);
  assert.match(h.reasons.join(' '),/키를 다시 발급/);
  assert.equal(evaluateCrawlHealth({runs:[run(20)],wakes:[{woke_at:'2026-10-20T23:00:00Z',ok:0,detail:'github_http_403'},{woke_at:'2026-10-20T22:00:00Z',ok:1,detail:'dispatched'}],now:NOW}).healthy,true,'a single failure is not an alert');
});

function fakeGitHub(openIssues=[]){
  const calls=[];
  const fetchImpl=async(url,o={})=>{
    const method=o.method||'GET';calls.push({url,method,body:o.body?JSON.parse(o.body):null});
    if(method==='GET')return Response.json(openIssues);
    if(method==='POST'&&url.endsWith('/issues'))return Response.json({number:77},{status:201});
    return Response.json({},{status:method==='POST'?201:200});
  };
  return {calls,fetchImpl};
}

test('unhealthy opens one labelled issue that mentions the Owner',async()=>{
  const gh=fakeGitHub([]);
  const health=evaluateCrawlHealth({runs:[run(300)],now:NOW});
  const r=await syncCrawlAlertIssue({health,token:'t',now:NOW,fetchImpl:gh.fetchImpl});
  assert.deepEqual(r,{action:'opened',issue:77});
  const create=gh.calls.find(c=>c.method==='POST');
  assert.deepEqual(create.body.labels,[CRAWL_HEALTH_POLICY.alertLabel]);
  assert.match(create.body.body,/@topmaster-joseph/);
  assert.match(create.body.title,/기사 자동수집 이상 감지/);
});

test('open alerts are reminded at most every 6 hours and closed on recovery',async()=>{
  const recent=fakeGitHub([{number:5,updated_at:new Date(NOW-3600000).toISOString()}]);
  assert.equal((await syncCrawlAlertIssue({health:evaluateCrawlHealth({runs:[],now:NOW}),token:'t',now:NOW,fetchImpl:recent.fetchImpl})).action,'recently_notified');
  const old=fakeGitHub([{number:5,updated_at:new Date(NOW-7*3600000).toISOString()}]);
  assert.equal((await syncCrawlAlertIssue({health:evaluateCrawlHealth({runs:[],now:NOW}),token:'t',now:NOW,fetchImpl:old.fetchImpl})).action,'renotified');
  const healed=fakeGitHub([{number:5,updated_at:new Date(NOW-3600000).toISOString()}]);
  const r=await syncCrawlAlertIssue({health:evaluateCrawlHealth({runs:[run(10)],now:NOW}),token:'t',now:NOW,fetchImpl:healed.fetchImpl});
  assert.deepEqual(r,{action:'closed',issue:5});
  assert.ok(healed.calls.some(c=>c.method==='PATCH'&&c.body.state==='closed'));
  assert.ok(healed.calls.some(c=>c.method==='POST'&&/정상으로 복구/.test(c.body.body)));
  const quiet=fakeGitHub([]);
  assert.equal((await syncCrawlAlertIssue({health:evaluateCrawlHealth({runs:[run(10)],now:NOW}),token:'t',now:NOW,fetchImpl:quiet.fetchImpl})).action,'none');
});

function fakeDb(runs,wakes=[]){
  let state=null;const sql=[];
  return {sql,get state(){return state},prepare(q){let args=[];return {
    bind(...a){args=a;return this},
    async all(){if(/FROM seonammedi_monitor_runs/.test(q))return {results:runs};if(/FROM seonammedi_runner_wakes/.test(q))return {results:wakes};return {results:[]}},
    async first(){return /FROM seonammedi_crawl_alert_state/.test(q)?state:null},
    async run(){sql.push(q);if(/INSERT INTO seonammedi_crawl_alert_state/.test(q))state={state:args[0],since:args[1],notified_at:args[2],reason:args[3]};return {}}
  }}};
}

test('the Worker notifies on transitions only and persists state',async()=>{
  const dispatched=[];
  const fetchImpl=async(url,o)=>{dispatched.push(JSON.parse(o.body));return new Response(null,{status:204})};
  const db=fakeDb([run(400)]);
  const env={DB:db,SEONAMMEDI_DISPATCH_TOKEN:'t'};
  const first=await watchSeonamMediCrawl(env,{now:NOW,fetchImpl});
  assert.equal(first.state,'alert');assert.equal(first.notified,true);
  assert.equal(dispatched[0].inputs.expected_state,'alert');
  const again=await watchSeonamMediCrawl(env,{now:NOW+3600000,fetchImpl});
  assert.equal(again.notified,false,'no hourly spam');
  const healthyDb=fakeDb([run(5)]);
  healthyDb.prepare('INSERT INTO seonammedi_crawl_alert_state').bind('alert',new Date(NOW).toISOString(),new Date(NOW).toISOString(),'x').run();
  const recovered=await watchSeonamMediCrawl({DB:healthyDb,SEONAMMEDI_DISPATCH_TOKEN:'t'},{now:NOW,fetchImpl});
  assert.equal(recovered.state,'ok');assert.equal(recovered.notified,true);
  assert.equal(dispatched.at(-1).inputs.expected_state,'ok');
});

test('watchers are wired: Worker cron, backup schedule and runner failure hook',async()=>{
  const [worker,alert,runner]=await Promise.all([
    readFile(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/seonammedi-crawl-alert.yml',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/seonammedi-news-monitor-runner.yml',import.meta.url),'utf8')
  ]);
  assert.match(worker,/watchSeonamMediCrawl\(env,\{ now:scheduledAt\.getTime\(\) \}\)/);
  assert.match(alert,/cron: '45 \*\/2 \* \* \*'/);
  assert.match(alert,/issues: write/);
  assert.match(alert,/node scripts\/seonammedi-crawl-watch\.mjs/);
  assert.match(runner,/if: failure\(\)[\s\S]*seonammedi-crawl-watch\.mjs --runner-failed/);
  assert.match(runner,/issues: write/);
});
