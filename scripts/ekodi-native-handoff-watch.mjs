#!/usr/bin/env node
/**
 * EKODI-native automation handoff runner.
 * Read-only evidence of native ownership: NOT a substitute for document writing,
 * human publisher signoff, cloud deployment, or a real customer action.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {monthlyEditorialSlots} from '../publishing/human/editorial-policy.js';

const ROOT=new URL('../',import.meta.url);
const REPO='topmaster-joseph/ekodi-platform';
const API='https://api.github.com/repos/'+REPO;
const allowedProfiles=new Set(['hourly','publishing','worship','all']);
const GITHUB_WORKFLOWS=Object.freeze({
  'church-live-release':'watch-ekodi-church-source.yml',
  'social-accounts-release':'ekodi-native-operations-watch.yml',
  'p0-p1-stability':'reconcile-orchestrator-completions.yml',
  'common-header-release':'deploy-ekodi-shell.yml'
});
const limit=s=>String(s??'').slice(0,160);

export function eligibleJobs(config,profile){
  if(!allowedProfiles.has(profile))throw new Error('invalid_native_profile');
  const jobs=Array.isArray(config?.jobs)?config.jobs:[];
  return jobs.filter(job=>profile==='all'
    ? job.schedule!=='expired-legacy-count-72'
    : profile==='hourly' ? job.schedule==='hourly'
    : profile==='publishing' ? job.schedule==='monday-0800-kst'
    : job.schedule==='wednesday-0826-kst');
}
export function sourceState(job){
  if(job.nativeStatus==='covered_by_native_operations_watch')return 'existing-native';
  return 'shadow-read-only';
}
function check(name,state,reason,more={}){
  return {name,state,reason,...more};
}
async function boundedGet(fetchImpl,url,token){
  if(!url.startsWith(API+'/')&&url!=='https://ekodi.kr/ekodichurch/church-release.json')
    throw new Error('endpoint_not_allowlisted');
  try{
    const headers={'accept':'application/vnd.github+json','user-agent':'EKODI-Native-Handoff/1'};
    if(url.startsWith(API+'/')&&token)headers.authorization='Bearer '+token;
    const response=await fetchImpl(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(8000)});
    if(response.status===429||response.status===403&&response.headers.get('x-ratelimit-remaining')==='0')
      return {ok:false,reason:'provider_rate_limit',stop:true};
    if(!response.ok)return {ok:false,reason:'http_'+response.status};
    return {ok:true,value:await response.json()};
  }catch(error){return {ok:false,reason:'unavailable_or_invalid_response'};}
}
function latestRun(value){
  const list=Array.isArray(value?.workflow_runs)?value.workflow_runs:[];
  return list.find(item=>['schedule','workflow_dispatch'].includes(item.event))||null;
}
function classifyWorkflowRun(value,nowMs=Date.now()){
  const run=latestRun(value);
  if(!run)return check('native-schedule','blocked','no_native_scheduled_run');
  const base={runId:Number(run.id)||null,conclusion:limit(run.conclusion||run.status)};
  const timestamp=Date.parse(run.created_at||'');
  if(!Number.isFinite(timestamp)||timestamp>nowMs+60000||nowMs-timestamp>4*3600000)
    return check('native-schedule','blocked','native_scheduled_run_stale_or_undated',base);
  if(run.status!=='completed')return check('native-schedule','observing','run_in_progress',base);
  if(run.conclusion!=='success')return check('native-schedule','blocked','scheduled_run_not_successful',base);
  return check('native-schedule','observed','scheduled_run_successful',base);
}
export function upcomingSundayKst(now=new Date()){
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'});
  const parts=Object.fromEntries(formatter.formatToParts(now).filter(p=>p.type!=='literal').map(x=>[x.type,x.value]));
  const weekday={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[parts.weekday];
  if(!Number.isInteger(weekday))throw new Error('invalid_weekday');
  const utcDay=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)));
  utcDay.setUTCDate(utcDay.getUTCDate()+(7-weekday)%7);
  return utcDay.toISOString().slice(0,10);
}
async function churchWorshipEvidence(now){
  const date=upcomingSundayKst(now),month=date.slice(0,7);
  let registry;
  try{registry=JSON.parse(await readFile(new URL('config/common-scripture/'+month+'.json',ROOT),'utf8'));}
  catch{return check('church-worship','blocked','approved_scripture_registry_missing',{sunday:date});}
  const day=Number(date.slice(8)),passage=registry?.status==='approved'?registry?.readings?.[day-1]:null;
  if(!passage)return check('church-worship','blocked','approved_sunday_passage_missing',{sunday:date});
  return check('church-worship','blocked','native_docs_slides_authoring_not_verified',
    {sunday:date,registryId:limit(registry.id),scriptureRef:limit(passage),docPersisted:false,pptPersisted:false,notificationSent:false});
}
async function publishingEvidence(now){
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(now);
  const month=local.match(/\d{4}-\d{2}/)?.[0];
  if(!month)return check('human-publishing','blocked','month_resolution_failed');
  const slots=monthlyEditorialSlots(month);
  return check('human-publishing','blocked','authorized_editorial_store_and_authoring_not_verified',
    {month,plannedSlots:slots.length,verifiedReleases:0,publicationsDispatched:false});
}
async function githubEvidence(job,get,now){
  const id=job.id,workflows=GITHUB_WORKFLOWS;
  const evidence=[];
  if(id==='church-live-release'){
    const pub=await get('https://ekodi.kr/ekodichurch/church-release.json');
    evidence.push(pub.ok&&typeof pub.value?.sourceSha==='string'
      ?check('church-release','observed','production_sha_available',{sourceSha:limit(pub.value.sourceSha)})
      :check('church-release','blocked',pub.reason||'production_source_sha_missing'));
  }
  if(id==='common-header-release'){
    const pr=await get(API+'/pulls/6869');
    if(!pr.ok)evidence.push(check('header-pr','blocked',pr.reason));
    else evidence.push(check('header-pr',pr.value?.merged_at?'observed':'blocked',
      pr.value?.merged_at?'protected_merge_record_present':'not_protected_merged',
      {headSha:limit(pr.value?.head?.sha),merged:!!pr.value?.merged_at}));
  }
  const workflow=workflows[id];
  if(workflow){
    const run=await get(API+'/actions/workflows/'+workflow+'/runs?per_page=15');
    evidence.push(run.ok?classifyWorkflowRun(run.value,now.getTime()):check('native-schedule','blocked',run.reason));
  }
  if(id==='social-accounts-release')evidence.push(check('social-e2e','blocked','read_only_watch_does_not_prove_signed_in_e2e'));
  if(id==='church-live-release')evidence.push(check('live-viewer-e2e','blocked','requires_exact_release_and_authenticated_viewer_evidence'));
  if(id==='common-header-release')evidence.push(check('header-live-ui','blocked','pc_mobile_site_proof_pending'));
  return evidence;
}
export async function collectNativeHandoff({
  config,profile='hourly',now=new Date(),fetchImpl=fetch,githubToken=''
}={}){
  if(!config||config.owner!=='EKODI Orchestrator')throw new Error('owner_mismatch');
  const selected=eligibleJobs(config,profile);
  const data={policyId:config.policyId,owner:'EKODI Orchestrator',scheduledBy:'EKODI GitHub Actions',
    producedAt:now.toISOString(),profile,execution:'read_only_shadow',noChatgptExecution:true,
    noExternalAiApi:true,mutations:0,records:[]};
  let stop=false;
  const get=async url=>{
    if(stop)return{ok:false,reason:'circuit_open'};
    const result=await boundedGet(fetchImpl,url,githubToken);
    if(result.stop)stop=true;
    return result;
  };
  for(const job of selected){
    let checks;
    if(stop)checks=[check('source','deferred','provider_circuit_open')];
    else if(job.id==='human-publishing-editorial')checks=[await publishingEvidence(now)];
    else if(job.id==='church-weekly-worship')checks=[await churchWorshipEvidence(now)];
    else checks=await githubEvidence(job,get,now);
    data.records.push({id:job.id,schedule:job.schedule,mode:sourceState(job),
      state:checks.some(x=>x.state==='blocked')?'handoff_not_ready':'evidence_only',
      checks,cutoverAllowed:false});
  }
  data.circuitOpen=stop;
  data.cutoverAllowed=false;
  return data;
}
export function summary(report){
  return ['## EKODI Native Automation Handoff',
    '- Scheduler: EKODI-owned GitHub Actions (not ChatGPT)',
    '- Profile: '+report.profile,
    '- Read-only shadow, no state writes, publication or release: '+report.mutations,
    '- ChatGPT cutover: NOT performed; native parity evidence required',
    ...report.records.map(r=>'- '+r.id+': '+r.state+' ('+r.checks.map(c=>c.reason).join(', ')+')')].join('\n')+'\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const option=k=>process.argv.find(arg=>arg.startsWith('--'+k+'='))?.slice(k.length+3);
  const profile=option('profile')||'hourly';
  const output=option('output')||'ekodi-automation-handoff-evidence.json';
  try{
    const config=JSON.parse(await readFile(new URL('config/ekodi-native-automation-handoff.json',ROOT),'utf8'));
    const report=await collectNativeHandoff({config,profile,githubToken:process.env.GITHUB_TOKEN||''});
    await writeFile(output,JSON.stringify(report,null,2)+'\n','utf8');
    const s=summary(report);
    if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,s,{flag:'a'});
    process.stdout.write(s);
  }catch(error){console.error('ekodi-native-handoff-failed: '+limit(error?.message));process.exitCode=1;}
}
