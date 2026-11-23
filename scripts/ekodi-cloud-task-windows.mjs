#!/usr/bin/env node
/**
 * EKODI Orchestrator's dated, read-only cloud task handoff. The existing
 * Native Operations Watch executes it: no new scheduler, secret or worker.
 * A public issue or successful CI is NOT an authenticated E2E receipt.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const BASE='https://api.github.com/repos/topmaster-joseph/ekodi-platform';
const PROD_CONFIG='https://ekodi.kr/my/config.js';
const STATUSES=new Set(['active_shadow','paused','expired']);
const CADENCES=new Set(['hourly','daily','weekly','once']);
const isoDay=/^\d{4}-\d{2}-\d{2}$/;
const short=s=>String(s??'').slice(0,120);
const VALID_PROFILES=new Set(['hourly','daily']);

function dayValid(x){
  return typeof x==='string'&&isoDay.test(x)&&
    !Number.isNaN(Date.parse(x+'T00:00:00Z'))&&
    new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
}
export function kstDate(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return [parts.year,parts.month,parts.day].join('-');
}

export function validateEkodiCloudRegistry(registry){
  if(registry?.owner!=='EKODI Orchestrator'||registry?.schemaVersion!==1||
     registry?.timezone!=='Asia/Seoul'||registry?.approvedReadOnly!==true||
     registry?.noAutomaticChatgptDisable!==true||registry?.noAutomatedDeployment!==true||
     !Array.isArray(registry.tasks)||registry.tasks.length!==29||
     registry?.accountSnapshot?.taskCount!==25||
     registry?.accountSnapshot?.archivedPriorSnapshotCount!==3)
    throw Error('EKODI_CLOUD_TASK_REGISTRY_INVALID');
  const ids=new Set();
  for(const task of registry.tasks){
    if(!/^[a-z0-9-]{3,64}$/.test(task.id||'')||ids.has(task.id)||
      !Number.isSafeInteger(task.issue)||task.issue<=0||
      !STATUSES.has(task.state)||!CADENCES.has(task.cadence)||
      !dayValid(task.startDate)||!dayValid(task.endDate)||
      task.startDate>task.endDate)
      throw Error('EKODI_CLOUD_TASK_REGISTRY_INVALID');
    ids.add(task.id);
    if(task.workflow&&
      (task.id!=='points-staging-e2e'||task.workflow!=='verify-points-staging-browser.yml'))
      throw Error('EKODI_CLOUD_WORKFLOW_NOT_ALLOWED');
  }
  if(!ids.has('points-staging-e2e')||!ids.has('education-release')||
     !ids.has('institution-ai-security')||
     !ids.has('church-weekly-notice-deploy-watch')||
     !ids.has('church-weekly-notice-publisher')||
     !ids.has('live-anonymous-viewer-e2e'))
    throw Error('EKODI_CLOUD_TASK_REGISTRY_INCOMPLETE');
  // Archived legacy snapshots stay audit-only and never silently re-activate.
  const archived=registry.tasks.filter(t=>t.archivedFromCurrentAccountSnapshot===true);
  const current=registry.tasks.filter(t=>!t.archivedFromCurrentAccountSnapshot&&t.id!=='points-staging-e2e');
  if(archived.length!==3||archived.some(t=>t.state==='active_shadow')||
     current.length!==registry.accountSnapshot.taskCount||
     registry.tasks.some(t=>t.cadence==='weekly'&&t.state==='active_shadow'&&t.weekday!=='MO'))
    throw Error('EKODI_CLOUD_TASK_REGISTRY_SNAPSHOT_MISMATCH');
  return registry;
}

export function evaluateTaskWindow(task,{date,profile='hourly'}){
  if(!dayValid(date)||!VALID_PROFILES.has(profile))
    throw Error('EKODI_CLOUD_WINDOW_INPUT_INVALID');
  if(date<task.startDate||date>task.endDate)return 'outside_period';
  if(task.state!=='active_shadow')return task.state;
  if(task.cadence==='daily'&&profile!=='daily')return 'not_due';
  // Native daily 08:45 KST is the only weekly observation window.
  // This is evidence inspection, NEVER an authorization to publish notices.
  if(task.cadence==='weekly'){
    if(profile!=='daily'||task.weekday!=='MO'||
       new Date(date+'T00:00:00Z').getUTCDay()!==1)return 'not_due';
  }
  if(task.cadence==='once')return 'not_due';
  return 'observe_read_only';
}

async function fetchBounded(fetchImpl,url,token=''){
  if(!(url.startsWith(BASE+'/issues/')||
       url.startsWith(BASE+'/actions/workflows/verify-points-staging-browser.yml/runs?')||
       url.startsWith(BASE+'/actions/runs/'))&&url!==PROD_CONFIG)
    throw Error('EKODI_CLOUD_URL_NOT_ALLOWED');
  const github=url.startsWith(BASE+'/');
  const headers={accept:github?'application/vnd.github+json':'text/javascript',
    'user-agent':'EKODI-Cloud-Window-Watch/1'};
  if(github&&token)headers.authorization='Bearer '+token;
  let response;
  try{response=await fetchImpl(url,{method:'GET',redirect:'error',headers,
    signal:AbortSignal.timeout(8000)})}
  catch{return {ok:false,reason:'http_unreachable'};}
  if(response.status===429||response.status===403){
    return {ok:false,reason:'provider_quota_or_access_denied',circuitOpen:github};
  }
  if(response.status!==200)return {ok:false,reason:'http_'+response.status};
  try{
    if(!github){
      const body=await response.text();
      if(body.length>4096)return {ok:false,reason:'config_oversized'};
      const match=/^window\.EKODI_MY_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(body.trim());
      if(!match)return {ok:false,reason:'config_invalid_format'};
      const config=JSON.parse(match[1]);
      return {ok:true,data:{pointsEnabled:config?.pointsEnabled,
        dataMode:config?.dataMode}};
    }
    return {ok:true,data:await response.json()};
  }catch{return {ok:false,reason:'invalid_json'};}
}

export async function collectCloudTaskWindows({
  registry,now=new Date(),profile='hourly',fetchImpl=fetch,githubToken=''
}={}){
  validateEkodiCloudRegistry(registry);
  if(!VALID_PROFILES.has(profile))throw Error('EKODI_CLOUD_PROFILE_INVALID');
  const date=kstDate(now);
  const report={owner:registry.owner,policy:registry.policyId,runDateKst:date,
    profile,observedAt:now.toISOString(),runtime:'EKODI existing GitHub Actions',
    approvalScope:'read_only_shadow',allSchedulesHaveEndDate:true,
    chatgptAccountStateVerified:false,chatgptTasksDisabledByCloud:false,
    productionMutations:0,realMemberE2EVerified:false,releaseAuthority:false,tasks:[]};
  let circuitOpen=false;
  for(const task of registry.tasks){
    const decision=evaluateTaskWindow(task,{date,profile});
    const item={id:task.id,issue:task.issue,window:{from:task.startDate,through:task.endDate},
      cadence:task.cadence,state:decision,actualDeliverableVerified:false};
    report.tasks.push(item);
    if(decision!=='observe_read_only')continue;
    if(circuitOpen){item.state='deferred';item.reason='github_circuit_open';continue;}
    const issue=await fetchBounded(fetchImpl,BASE+'/issues/'+task.issue,githubToken);
    if(!issue.ok){
      item.state='deferred';item.reason=issue.reason;
      if(issue.circuitOpen)circuitOpen=true;
      continue;
    }
    item.issueState=issue.data?.state==='open'?'open':issue.data?.state==='closed'?'closed':'unknown';
    item.state='observed_no_delivery_parity';
    if(task.id!=='points-staging-e2e')continue;
    const runs=await fetchBounded(fetchImpl,BASE+'/actions/workflows/'+task.workflow+
      '/runs?per_page=20',githubToken);
    if(!runs.ok){
      item.reason=runs.reason;if(runs.circuitOpen)circuitOpen=true;continue;
    }
    const valid=(Array.isArray(runs.data?.workflow_runs)?runs.data.workflow_runs:[])
      .filter(r=>r.head_branch==='main'&&
        ['schedule','workflow_dispatch','push'].includes(r.event)&&
        typeof r.created_at==='string'&&r.created_at>=task.minReleaseAt)
      .sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const latest=valid[0];
    if(!latest){item.browser='no_post_merge_run';continue;}
    item.runId=Number.isSafeInteger(latest.id)?latest.id:null;
    item.browser=latest.status==='completed'?
      (latest.conclusion==='success'?'ci_success_requires_artifact_review':'ci_failed_or_skipped'):
      'in_progress';
    if(item.browser!=='ci_success_requires_artifact_review'||!item.runId)continue;
    const proof=await fetchBounded(fetchImpl,BASE+'/actions/runs/'+item.runId+'/artifacts?per_page=30',
      githubToken);
    if(!proof.ok){item.browser='artifact_check_unavailable';item.reason=proof.reason;
      if(proof.circuitOpen)circuitOpen=true;continue;}
    item.hasNamedArtifact=Array.isArray(proof.data?.artifacts)&&
      proof.data.artifacts.some(x=>x.name==='points-staging-browser-'+item.runId&&
        x.expired!==true&&x.size_in_bytes>0);
    item.browser=item.hasNamedArtifact?
      'artifact_present_not_content_verified':'browser_artifact_missing';
  }
  const points=report.tasks.find(t=>t.id==='points-staging-e2e');
  if(points?.state==='observed_no_delivery_parity'&&!circuitOpen){
    const config=await fetchBounded(fetchImpl,PROD_CONFIG);
    points.productionConfigChecked=config.ok;
    points.productionPointsDisabled=config.ok&&config.data?.dataMode==='production'&&
      config.data?.pointsEnabled===false;
    if(!points.productionPointsDisabled)points.productionSafeState='unverified_or_alert';
    else points.productionSafeState='disabled_verified_public';
  }
  report.circuitOpen=circuitOpen;
  report.observedCount=report.tasks.filter(t=>t.state==='observed_no_delivery_parity').length;
  report.disabledOrOutOfPeriodCount=report.tasks.filter(t=>
    ['paused','expired','outside_period'].includes(t.state)).length;
  return report;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const arg=k=>process.argv.find(s=>s.startsWith('--'+k+'='))?.slice(k.length+3);
  try{
    const registry=JSON.parse(await readFile(new URL('../config/ekodi-cloud-task-windows.json',import.meta.url),'utf8'));
    const report=await collectCloudTaskWindows({registry,githubToken:process.env.GITHUB_TOKEN||'',
      profile:arg('profile')||'hourly'});
    await writeFile(arg('output')||'ekodi-cloud-task-evidence.json',
      JSON.stringify(report,null,2)+'\n');
    const summary='EKODI cloud windows '+report.runDateKst+' '+report.profile+
      ': observed='+report.observedCount+' inactive='+report.disabledOrOutOfPeriodCount+
      ' parity=unverified realBrowserE2E=false productionWrites=0\n';
    process.stdout.write(summary);
    if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,summary,{flag:'a'});
  }catch(error){
    console.error(JSON.stringify({status:'fail_closed',reason:short(error?.message)}));
    process.exitCode=1;
  }
}
