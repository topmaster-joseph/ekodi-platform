import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  validateEkodiCloudRegistry,kstDate,evaluateTaskWindow,collectCloudTaskWindows
} from '../scripts/ekodi-cloud-task-windows.mjs';

const registry=JSON.parse(await readFile(
  new URL('../config/ekodi-cloud-task-windows.json',import.meta.url),'utf8'));

const json=x=>new Response(JSON.stringify(x),{status:200});
function fakeClient({runStatus='failure',artifact=true,rateLimit=false}={}){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,method:opts.method,redirect:opts.redirect,headers:opts.headers});
    if(rateLimit)return new Response('rate limit',{status:403});
    if(url.endsWith('/my/config.js'))return new Response(
      'window.EKODI_MY_CONFIG={"dataMode":"production","pointsEnabled":false};',{status:200});
    if(url.includes('/issues/'))return json({state:'open'});
    if(url.includes('/verify-points-staging-browser.yml/runs?'))return json({workflow_runs:[{
      id:1234,head_branch:'main',event:'schedule',status:'completed',
      conclusion:runStatus,created_at:'2026-11-22T02:00:00Z'
    }]});
    if(url.includes('/actions/runs/1234/artifacts?'))return json({
      artifacts:artifact?[{name:'points-staging-browser-1234',expired:false,size_in_bytes:1234}]:[]
    });
    throw Error('UNEXPECTED_READ:'+url);
  };
  return {fetchImpl,calls};
}

test('all 25 user schedule records plus Points have explicit EKODI cloud task windows',()=>{
  assert.equal(validateEkodiCloudRegistry(registry),registry);
  assert.equal(registry.tasks.length,26);
  assert.equal(registry.tasks.filter(t=>t.state==='active_shadow').length,3);
  assert.equal(registry.tasks.filter(t=>t.state==='paused').length,20);
  assert.equal(registry.tasks.filter(t=>t.state==='expired').length,3);
  assert.ok(registry.tasks.every(t=>t.startDate<=t.endDate));
  assert.equal(registry.noAutomaticChatgptDisable,true);
  assert.equal(registry.noAutomatedDeployment,true);
  assert.doesNotMatch(JSON.stringify(registry),/Automation_[a-f0-9]{20,}/);
});

test('KST day and inclusive 30-day window prevent all expired task activity',()=>{
  assert.equal(kstDate(new Date('2026-12-22T14:59:00Z')),'2026-12-22');
  assert.equal(kstDate(new Date('2026-12-22T15:01:00Z')),'2026-12-23');
  const points=registry.tasks.find(t=>t.id==='points-staging-e2e');
  assert.equal(evaluateTaskWindow(points,{date:'2026-12-22'}),'observe_read_only');
  assert.equal(evaluateTaskWindow(points,{date:'2026-12-23'}),'outside_period');
  assert.equal(evaluateTaskWindow(registry.tasks.find(t=>t.id==='merchant-ai-schedule'),
    {date:'2026-11-22'}),'outside_period');
  assert.equal(evaluateTaskWindow(registry.tasks.find(t=>t.id==='human-publishing'),
    {date:'2026-11-22'}),'paused');
  assert.equal(evaluateTaskWindow(registry.tasks.find(t=>t.id==='institution-ai-security'),
    {date:'2026-11-22'}),'not_due');
});

test('past the end date cloud collector performs zero network calls',async()=>{
  const forbid=async()=>{throw Error('OUT_OF_WINDOW_NETWORK_FORBIDDEN')};
  const report=await collectCloudTaskWindows({registry,now:new Date('2027-01-01T00:00:00Z'),
    fetchImpl:forbid});
  assert.equal(report.observedCount,0);
  assert.equal(report.tasks.length,26);
  assert.ok(report.tasks.every(t=>t.state==='outside_period'));
  assert.equal(report.productionMutations,0);
});

test('read-only hourly Points check sees workflow failure without E2E claim or tokens',async()=>{
  const {fetchImpl,calls}=fakeClient();
  const report=await collectCloudTaskWindows({registry,now:new Date('2026-11-22T02:00:00Z'),
    fetchImpl,githubToken:'internal-unprinted-token'});
  assert.equal(report.observedCount,2);
  const points=report.tasks.find(t=>t.id==='points-staging-e2e');
  assert.equal(points.browser,'ci_failed_or_skipped');
  assert.equal(points.productionPointsDisabled,true);
  assert.equal(points.actualDeliverableVerified,false);
  assert.equal(report.realMemberE2EVerified,false);
  assert.equal(report.chatgptTasksDisabledByCloud,false);
  assert.ok(calls.every(t=>t.method==='GET'&&t.redirect==='error'));
  assert.ok(calls.every(t=>!t.url.includes('private')&&!t.url.includes('access_token')));
  assert.ok(!JSON.stringify(report).includes('internal-unprinted-token'));
});

test('even success plus artifact is insufficient for authenticated browser delivery proof',async()=>{
  const {fetchImpl,calls}=fakeClient({runStatus:'success'});
  const report=await collectCloudTaskWindows({registry,now:new Date('2026-11-22T02:00:00Z'),
    profile:'daily',fetchImpl});
  assert.equal(report.observedCount,3);
  const p=report.tasks.find(t=>t.id==='points-staging-e2e');
  assert.equal(p.browser,'artifact_present_not_content_verified');
  assert.equal(p.hasNamedArtifact,true);
  assert.equal(report.realMemberE2EVerified,false);
  assert.equal(report.releaseAuthority,false);
  assert.ok(calls.some(t=>t.url.includes('/actions/runs/1234/artifacts')));
});

test('provider denial stops subsequent GitHub reads without reporting success',async()=>{
  const {fetchImpl,calls}=fakeClient({rateLimit:true});
  const report=await collectCloudTaskWindows({registry,
    now:new Date('2026-11-22T02:00:00Z'),fetchImpl});
  assert.equal(calls.length,1);
  assert.equal(report.circuitOpen,true);
  assert.equal(report.observedCount,0);
  assert.equal(report.realMemberE2EVerified,false);
});

test('unexpected workflow URLs, missing dates and unauthorized active status fail closed',()=>{
  const bad=structuredClone(registry);
  bad.tasks[0].endDate='2026-11-31';
  assert.throws(()=>validateEkodiCloudRegistry(bad),/EKODI_CLOUD_TASK_REGISTRY_INVALID/);
  const rogue=structuredClone(registry);
  rogue.tasks[0].workflow='deploy-production.yml';
  assert.throws(()=>validateEkodiCloudRegistry(rogue),/EKODI_CLOUD_WORKFLOW_NOT_ALLOWED/);
});
