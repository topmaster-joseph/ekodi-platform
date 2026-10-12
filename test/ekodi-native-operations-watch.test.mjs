import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  classifySeonamMediMonitor,classifyWorkflow,
  collectEkodiNativeWatch,renderEkodiWatchSummary
} from '../scripts/ekodi-native-operations-watch.mjs';

const now=Date.parse('2026-10-12T12:40:00.000Z');
const okMonitor={
  ok:true,lastRun:{id:251,started_at:'2026-10-12T12:00:33Z',
    status:'ok',sources_checked:4,items_seen:71}
};
const workflowRuns={workflow_runs:[
  {id:1,event:'workflow_run',status:'completed',conclusion:'skipped',created_at:'2026-10-12T12:15:00Z'},
  {id:2,event:'schedule',status:'completed',conclusion:'success',created_at:'2026-10-12T12:07:00Z'}
]};

const json=(data,status=200)=>new Response(JSON.stringify(data),
  {status,headers:{'content-type':'application/json'}});

function fakeFetch({monitor=okMonitor,failHealth=false,rateLimit=false}={}){
  const calls=[];
  const fetchImpl=async (url,options)=>{
    calls.push({url:String(url),options});
    if(rateLimit)return new Response('',{status:429});
    if(url.endsWith('/api/health'))return failHealth?new Response('',{status:503}):json({ok:true});
    if(url.includes('/api/seonammedi/monitor'))return json(monitor);
    if(url.includes('/release-receipt?'))return json({ok:true,authorized:true,state:'completed'});
    if(url.includes('/actions/workflows/'))return json(workflowRuns);
    if(url.endsWith('/pulls/3794'))return json({state:'closed',merged:true,updated_at:'2026-10-12'});
    return new Response('',{status:404});
  };
  return {fetchImpl,calls};
}

test('native watch verifies successful hourly collector without publishing article text',()=>{
  const check=classifySeonamMediMonitor(okMonitor,now);
  assert.equal(check.status,'ok');
  assert.equal(check.sourceChecks,4);
  assert.equal(check.itemsSeen,71);
  assert.equal(check.runId,251);
});

test('hourly source failures and absent/stale evidence do not count as success',()=>{
  assert.equal(classifySeonamMediMonitor({...okMonitor,lastRun:{...okMonitor.lastRun,status:'failed'}},now).status,'alert');
  assert.equal(classifySeonamMediMonitor({...okMonitor,lastRun:{...okMonitor.lastRun,status:'partial'}},now).status,'warning');
  assert.equal(classifySeonamMediMonitor(okMonitor,now+4*3600000).reason,'hourly_run_stale');
  assert.equal(classifySeonamMediMonitor({ok:true,lastRun:null},now).status,'alert');
});

test('skipped release workflow_run is not mistaken for last scheduled failure',()=>{
  const state=classifyWorkflow('reconciliation',workflowRuns,now);
  assert.equal(state.status,'ok');
  assert.equal(state.runId,2);
  assert.equal(classifyWorkflow('reconciliation',{workflow_runs:[workflowRuns.workflow_runs[0]]},now).status,'warning');
});

test('read-only EKODI watch calls only GET and retains no article bodies or token',async()=>{
  const {fetchImpl,calls}=fakeFetch();
  const result=await collectEkodiNativeWatch({fetchImpl,githubToken:'secret-not-in-output',nowMs:now,mode:'daily'});
  assert.equal(result.result,'ok');
  assert.equal(result.checks.length,7);
  assert.equal(result.chatgptAutomationRequired,undefined);
  assert.equal(result.mutatesProduction,false);
  assert.equal(result.evidenceOnly.trafficNumbersRetrieved,false);
  assert.equal(result.evidenceOnly.personalMissionReportProduced,false);
  assert.ok(calls.every(x=>x.options.method==='GET'));
  assert.ok(calls.every(x=>x.options.redirect==='error'));
  assert.ok(!JSON.stringify(result).includes('secret-not-in-output'));
  assert.ok(!renderEkodiWatchSummary(result).includes('PRIVATE ARTICLE'));
});

test('provider 429 stops all further reads and preserves a deferred state',async()=>{
  const {fetchImpl,calls}=fakeFetch({rateLimit:true});
  const report=await collectEkodiNativeWatch({fetchImpl,nowMs:now});
  assert.equal(calls.length,1);
  assert.equal(report.circuitOpen,true);
  assert.equal(report.result,'deferred');
});

test('canonical production API outage is an alert, not fabricated site health',async()=>{
  const {fetchImpl}=fakeFetch({failHealth:true});
  const report=await collectEkodiNativeWatch({fetchImpl,nowMs:now});
  assert.equal(report.result,'attention');
  assert.equal(report.checks[0].status,'alert');
});

test('native workflow owns schedule and read-only permissions, not ChatGPT API',async()=>{
  const [wf,source,policy]=await Promise.all([
    readFile(new URL('../.github/workflows/ekodi-native-operations-watch.yml',import.meta.url),'utf8'),
    readFile(new URL('../scripts/ekodi-native-operations-watch.mjs',import.meta.url),'utf8'),
    readFile(new URL('../config/ekodi-native-monitoring-ownership.json',import.meta.url),'utf8')
  ]);
  assert.match(wf,/cron: '37 \* \* \* \*'/);
  assert.match(wf,/cron: '45 23 \* \* \*'/);
  assert.match(wf,/contents: read/);
  assert.match(wf,/actions: read/);
  assert.doesNotMatch(wf,/contents: write|issues: write|id-token: write|wrangler deploy/);
  assert.match(wf,/if: always\(\)/);
  assert.match(source,/if\(report.result==='attention'\)process.exitCode=1/);
  assert.doesNotMatch(source,/openai\.com|api\.openai\.com|chat\.openai\.com/);
  const parsed=JSON.parse(policy);
  assert.equal(parsed.externalChatgptAutomations.intendedActiveCount,0);
  assert.equal(parsed.monitoring.length,5);
  assert.ok(parsed.monitoring.some(x=>x.handoffState.includes('requires-authorized-sources')));
});
