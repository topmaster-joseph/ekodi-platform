import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {collectNativeHandoff,eligibleJobs,upcomingSundayKst,summary} from '../scripts/ekodi-native-handoff-watch.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const now=new Date('2026-10-30T03:00:00Z');
const workflowRuns={workflow_runs:[{id:113,event:'schedule',status:'completed',conclusion:'success',created_at:'2026-10-30T00:43:00Z'}]};
const config=JSON.parse(await read('config/ekodi-native-automation-handoff.json'));

test('owner inventory matches five measured active legacy tasks plus native-only header watch',()=>{
  assert.equal(config.owner,'EKODI Orchestrator');
  assert.equal(config.activeChatgptCount,5);
  assert.equal(config.mode,'shadow_read_only_until_parity_verified');
  assert.equal(config.jobs.length,6);
  assert.equal(config.jobs.filter(job=>job.sourceStatus==='chatgpt_active').length,4);
  assert.equal(config.jobs.filter(job=>job.sourceStatus.includes('expired')).length,1);
  assert.equal(config.jobs.filter(job=>job.sourceStatus==='not_scheduled_on_chatgpt').length,1);
  assert.equal(eligibleJobs(config,'hourly').length,3);
  assert.equal(eligibleJobs(config,'publishing').length,1);
  assert.equal(eligibleJobs(config,'worship').length,1);
  assert.equal(eligibleJobs(config,'all').length,5);
  assert.throws(()=>eligibleJobs(config,'release'),/invalid_native_profile/);
});

test('worship source is approved scripture, never invented document completion',async()=>{
  assert.equal(upcomingSundayKst(new Date('2026-10-30T02:00:00Z')),'2026-11-01');
  assert.equal(upcomingSundayKst(new Date('2026-11-01T02:00:00Z')),'2026-11-01');
  const result=await collectNativeHandoff({config,profile:'worship',now});
  const record=result.records[0];
  assert.equal(record.id,'church-weekly-worship');
  assert.equal(record.state,'handoff_not_ready');
  assert.equal(record.checks[0].scriptureRef,'고린도전서 3:1-9');
  assert.equal(record.checks[0].docPersisted,false);
  assert.equal(record.checks[0].pptPersisted,false);
  assert.equal(record.cutoverAllowed,false);
  assert.equal(result.noChatgptExecution,true);
});

test('publishing counts approved calendar slots but never falsely publishes',async()=>{
  const result=await collectNativeHandoff({config,profile:'publishing',now});
  assert.equal(result.records[0].checks[0].plannedSlots,6);
  assert.equal(result.records[0].checks[0].verifiedReleases,0);
  assert.equal(result.records[0].checks[0].publicationsDispatched,false);
  assert.equal(result.cutoverAllowed,false);
});

test('hourly evidence is GET-only and does not expose credentials or alter source state',async()=>{
  const requests=[];
  const fetchImpl=async(url,opts)=>{
    requests.push({url,method:opts.method,redirect:opts.redirect,hasToken:!!opts.headers.authorization});
    if(url.includes('/pulls/6869'))return json({head:{sha:'abcdef123'},merged_at:null});
    if(url.includes('church-release.json'))return json({sourceSha:'ff0000'});
    if(url.includes('/actions/workflows/'))return json(workflowRuns);
    return json({});
  };
  const result=await collectNativeHandoff({config,profile:'hourly',now,githubToken:'DO-NOT-LEAK',fetchImpl});
  assert.equal(result.records.length,3);
  assert.equal(result.mutations,0);
  assert.equal(result.cutoverAllowed,false);
  assert.equal(result.records.find(j=>j.id==='common-header-release').state,'handoff_not_ready');
  assert.ok(result.records.some(j=>j.id==='social-accounts-release'));
  assert.ok(result.records.some(j=>j.id==='church-live-release'));
  assert.ok(requests.every(x=>x.method==='GET'&&x.redirect==='error'));
  assert.ok(!JSON.stringify(result).includes('DO-NOT-LEAK'));
  assert.doesNotMatch(summary(result),/token|access_token|PRIVATE/i);
});

test('provider rate limiting stops subsequent reads and never claims success',async()=>{
  let count=0;
  const fetchImpl=async()=>{count++;return new Response('rate limited',{status:429});};
  const result=await collectNativeHandoff({config,profile:'hourly',now,fetchImpl});
  assert.equal(count,1);
  assert.equal(result.circuitOpen,true);
  assert.ok(result.records.every(j=>j.cutoverAllowed===false));
  assert.ok(result.records.some(j=>j.checks.some(c=>c.reason==='provider_circuit_open')));
});

test('GitHub native-only workflow uses read permissions, no model API, no writing',async()=>{
  const [wf,source]=await Promise.all([read('.github/workflows/ekodi-native-handoff-watch.yml'),read('scripts/ekodi-native-handoff-watch.mjs')]);
  assert.match(wf,/cron: '43 \* \* \* \*'/);
  assert.match(wf,/cron: '0 23 \* \* 0'/);
  assert.match(wf,/cron: '26 23 \* \* 2'/);
  assert.match(wf,/contents: read/);
  assert.match(wf,/actions: read/);
  assert.doesNotMatch(wf,/contents: write|issues: write|id-token: write|wrangler deploy/);
  assert.match(wf,/if: always\(\)/);
  assert.doesNotMatch(source,/api\.openai\.com|chatgpt\.com|openai\.com/);
  assert.match(source,/cutoverAllowed:false/);
  assert.match(source,/method:'GET'/);
  assert.doesNotMatch(source,/method:'POST'|method:'PUT'|method:'DELETE'/);
});
