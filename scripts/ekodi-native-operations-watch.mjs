#!/usr/bin/env node
/**
 * EKODI-owned, read-only operational watch. No ChatGPT task, external AI API,
 * private account data, DB mutation, PR merge or deployment action is needed.
 */
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const OWNER='topmaster-joseph';
const REPO='ekodi-platform';
const BASE='https://api.github.com/repos/'+OWNER+'/'+REPO;
const MONITOR='https://seonammedi.kr/api/seonammedi/monitor';
const HEALTH='https://ekodi.kr/api/health';
const RELEASE_TASK='orch_recovery_f4624c3042fe9cd7054e31586f4613f2';
const RELEASE_BRANCH='ai/gpt6/'+RELEASE_TASK;
const RECEIPT='https://ekodi.kr/api/orchestrator/release-receipt?taskId='+RELEASE_TASK+'&branchRef='+encodeURIComponent(RELEASE_BRANCH);
const WORKFLOWS=Object.freeze([
  'data-store-readonly-watch.yml',
  'reconcile-orchestrator-completions.yml',
  'system-health-analytics.yml',
]);
const compact=value=>String(value??'').slice(0,120);
const check=(name,status,reason='',details={})=>({name,status,...(reason?{reason}:{}),...details});

export function classifySeonamMediMonitor(payload,nowMs=Date.now()){
  const last=payload?.lastRun;
  if(payload?.ok!==true||!last)return check('seonammedi-hourly','alert','monitor_unavailable');
  const timestamp=Date.parse(last.started_at||last.startedAt||'');
  if(!Number.isFinite(timestamp))return check('seonammedi-hourly','alert','monitor_timestamp_missing');
  const ageMs=Math.max(0,nowMs-timestamp);
  const details={runId:Number(last.id)||null,ageMinutes:Math.floor(ageMs/60000),
    sourceChecks:Number(last.sources_checked)||0,itemsSeen:Number(last.items_seen)||0,
    runStatus:compact(last.status)};
  if(ageMs>3*3600000)return check('seonammedi-hourly','alert','hourly_run_stale',details);
  if(last.status==='failed')return check('seonammedi-hourly','alert','source_queries_all_failed',details);
  if(last.status==='partial')return check('seonammedi-hourly','warning','source_queries_partial',details);
  if(last.status!=='ok')return check('seonammedi-hourly','warning','run_not_yet_final',details);
  if(details.sourceChecks<1)return check('seonammedi-hourly','warning','no_sources_checked',details);
  return check('seonammedi-hourly','ok','',details);
}

export function classifyWorkflow(name,data,nowMs=Date.now()){
  const all=Array.isArray(data?.workflow_runs)?data.workflow_runs:[];
  const recent=all.find(x=>x.event==='schedule'||x.event==='workflow_dispatch'||x.event==='workflow_run');
  if(!recent)return check(name,'warning','no_confirmed_execution');
  const stamp=Date.parse(recent.created_at||'');
  const details={runId:Number(recent.id)||null,conclusion:compact(recent.conclusion||recent.status),
    event:compact(recent.event),url:compact(recent.html_url)};
  // Skipped workflow_run invocations can be intentionally filtered; only
  // the authoritative scheduled/workflow_dispatch jobs count as evidence.
  const authoritative=all.find(x=>['schedule','workflow_dispatch'].includes(x.event));
  if(!authoritative)return check(name,'warning','no_scheduled_run_evidence',details);
  const age=nowMs-Date.parse(authoritative.created_at||'');
  if(!Number.isFinite(age)||age>36*3600000)return check(name,'warning','scheduled_run_stale',
    {runId:Number(authoritative.id)||null});
  if(authoritative.status==='completed'&&authoritative.conclusion==='failure')
    return check(name,'alert','scheduled_workflow_failed',{runId:Number(authoritative.id)||null});
  if(authoritative.status!=='completed')return check(name,'warning','scheduled_workflow_in_progress',
    {runId:Number(authoritative.id)||null});
  if(authoritative.conclusion!=='success')return check(name,'warning','scheduled_workflow_not_successful',
    {runId:Number(authoritative.id)||null});
  return check(name,'ok','',{runId:Number(authoritative.id)||null,ageHours:Math.floor(age/3600000)});
}

async function boundedJson(fetchImpl,url,token){
  const headers={accept:'application/json','user-agent':'EKODI-Native-Operations-Watch/1.0'};
  if(url.startsWith(BASE+'/')&&token)headers.authorization='Bearer '+token;
  let response;
  try{
    response=await fetchImpl(url,{method:'GET',redirect:'error',headers,signal:AbortSignal.timeout(8000)});
  }catch{return {ok:false,reason:'read_only_probe_unreachable'}}
  if(response.status===429||response.status===1027)
    return {ok:false,reason:'provider_quota_protection',circuitOpen:true};
  if(!response.ok)return {ok:false,reason:'http_'+Number(response.status)};
  try{
    const data=await response.json();
    return {ok:true,data};
  }catch{return {ok:false,reason:'invalid_json'}}
}

export async function collectEkodiNativeWatch({
  fetchImpl=fetch,nowMs=Date.now(),githubToken='',mode='hourly'
}={}){
  if(!['hourly','daily'].includes(mode))throw new Error('unsupported_mode');
  const report={policy:'EKODI-NATIVE-MONITORING-HANDOFF-001',mode,
    observedAt:new Date(nowMs).toISOString(),
    owner:'ekodi-orchestrator',provider:'EKODI GitHub Actions + Cloudflare cron',
    chatgptAutomationRequired:false,mutatesProduction:false,checks:[]};
  const get=async(url)=>boundedJson(fetchImpl,url,githubToken);
  const health=await get(HEALTH);
  report.checks.push(health.ok&&health.data?.ok===true?
    check('canonical-ekodi-health','ok'):check('canonical-ekodi-health','alert',
      health.reason||'invalid_health_contract'));
  if(health.circuitOpen){report.circuitOpen=true;report.result='deferred';return report}
  const feed=await get(MONITOR);
  report.checks.push(feed.ok?classifySeonamMediMonitor(feed.data,nowMs):
    check('seonammedi-hourly','alert',feed.reason));
  if(feed.circuitOpen){report.circuitOpen=true;report.result='deferred';return report}
  const receipt=await get(RECEIPT);
  report.checks.push(receipt.ok&&receipt.data?.authorized===true&&receipt.data?.state==='completed'?
    check('approved-release-receipt','ok'):
    check('approved-release-receipt','warning',receipt.reason||'release_not_completed'));
  if(receipt.circuitOpen){report.circuitOpen=true;report.result='deferred';return report}
  for(const workflow of WORKFLOWS){
    const response=await get(BASE+'/actions/workflows/'+workflow+'/runs?per_page=30');
    report.checks.push(response.ok?classifyWorkflow(workflow,response.data,nowMs):
      check(workflow,'warning',response.reason));
    if(response.circuitOpen){report.circuitOpen=true;break}
  }
  if(!report.circuitOpen){
    const pr=await get(BASE+'/pulls/3794');
    report.checks.push(pr.ok?check('board-pr-3794','ok','',
      {state:compact(pr.data?.state),merged:pr.data?.merged===true,
        updatedAt:compact(pr.data?.updated_at)}):
      check('board-pr-3794','warning',pr.reason));
  }
  report.result=report.circuitOpen?'deferred':
    report.checks.some(x=>x.status==='alert')?'attention':
    report.checks.some(x=>x.status==='warning')?'partial':'ok';
  // Daily Traffic Intelligence numbers are never inferred from these probes:
  // the existing System Health Analytics and Traffic Intelligence own them.
  report.evidenceOnly={trafficSource:'EKODI System Health Analytics/Traffic Intelligence',
    trafficNumbersRetrieved:false,personalMissionReportProduced:false};
  return report;
}

export function renderEkodiWatchSummary(report){
  return [
    '## EKODI Native Operations Watch',
    '- EKODI checked: '+report.observedAt,
    '- Status: **'+report.result+'**',
    '- Cloudflare and GitHub production resources: read-only',
    '- ChatGPT scheduled tasks or AI tokens: **not used**',
    ...report.checks.map(x=>'- '+x.name+': '+x.status+(x.reason?' ('+x.reason+')':'')),
    '- Daily traffic totals: consult the authoritative System Health/Traffic Intelligence collector; unavailable here is not zero.',
    '- Missionary bi-monthly narrative: requires a distinct EKODI-owned source and distribution mapping; not falsely generated.',
  ].join('\n')+'\n';
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const opt=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.split('=').slice(1).join('=');
  const mode=opt('mode')||'hourly',output=opt('output')||'ekodi-native-operations-evidence.json';
  try{
    const report=await collectEkodiNativeWatch({mode,githubToken:process.env.GITHUB_TOKEN||''});
    await writeFile(output,JSON.stringify(report,null,2)+'\n');
    const summary=renderEkodiWatchSummary(report);
    if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,summary,{flag:'a'});
    process.stdout.write(summary);
    // Only real alerts fail Actions; missing provider evidence stays warning.
    if(report.result==='attention')process.exitCode=1;
  }catch(error){
    console.error(JSON.stringify({ok:false,error:'ekodi_native_watch_failed',
      reason:compact(error?.message)}));
    process.exitCode=1;
  }
}
