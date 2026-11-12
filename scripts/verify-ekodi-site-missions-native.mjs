#!/usr/bin/env node
// EKODI-owned Chromium: audit actual, publicly deployed mission declarations.
// Does not use paid third-party browsers, personal profiles, logins or mutations.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {planEkodiIndependentBrowser,executeEkodiIndependentBrowser} from './ekodi-independent-browser.mjs';

export const MISSION_HOMEPAGE_IDS=Object.freeze([
  'publishing','books','management','edu','insurance','lab','social',
  'community','journal','delivery','business','author','life','work',
  'money','support','energy','cafe','bible'
]);
export const MISSION_BROWSER_PROFILES=Object.freeze([
  'compact-mobile','mobile-portrait','tablet','desktop'
]);
const ROOT_ASSERTION='각자의 자유와 존엄을 지키며';
const PUBLIC_ORIGIN='https://ekodi.kr';
const BATCH_MAX=5;
const TAG='우리가 존재하는 이유';

export function planSiteMissionAudit(registry,missions,options={}){
  if(!registry||!Array.isArray(registry.services)||
     !missions||!Array.isArray(missions.sites))throw Error('EKODI_MISSION_AUDIT_INPUT_INVALID');
  const current=new Map(registry.services.map(s=>[s.id,s]));
  const declared=new Map(missions.sites.map(s=>[s.id,s]));
  if(current.size!==registry.services.length||
     declared.size!==missions.sites.length)throw Error('EKODI_MISSION_AUDIT_DUPLICATE_ID');
  const profiles=options.profiles||MISSION_BROWSER_PROFILES;
  if(!Array.isArray(profiles)||!profiles.length||
     profiles.some(p=>!MISSION_BROWSER_PROFILES.includes(p))||
     new Set(profiles).size!==profiles.length)throw Error('EKODI_MISSION_AUDIT_PROFILES_INVALID');
  const eligible=[{id:'platform',path:'/',phrase:ROOT_ASSERTION}];
  const deferred=[];
  for(const id of MISSION_HOMEPAGE_IDS){
    const site=current.get(id),mission=declared.get(id);
    if(!site||!mission||site.name!==mission.officialName ||
       mission.ownerScope!=='ekodi-first-party')throw Error('EKODI_MISSION_AUDIT_SITE_IDENTITY_DRIFT');
    if(site.status!=='live' && options.includePreparing!==true){
      deferred.push(id);continue;
    }
    const address=new URL(site.url);
    if(address.origin!==PUBLIC_ORIGIN||address.search||address.hash||address.username||address.password)
      throw Error('EKODI_MISSION_AUDIT_NONCANONICAL_ORIGIN');
    const page=address.pathname.endsWith('/')?address.pathname:address.pathname+'/';
    const phrase=mission.mission.split(/[,.，。]/,1)[0].trim();
    // The existing native browser worker accepts only brief, non-secret visible
    // text assertions. A meaningful first clause identifies the local mission.
    if(phrase.length<12||phrase.length>80||
       !/^[\p{L}\p{N} .·&()_-]+$/u.test(phrase))
      throw Error('EKODI_MISSION_AUDIT_UNSAFE_ASSERTION');
    eligible.push({id,path:page,phrase});
  }
  const paths=new Set(eligible.map(e=>e.path));
  if(paths.size!==eligible.length)throw Error('EKODI_MISSION_AUDIT_ROUTE_COLLISION');
  const batches=[];
  for(let i=0;i<eligible.length;i+=BATCH_MAX){
    const group=eligible.slice(i,i+BATCH_MAX);
    const expectedTextByPath=Object.fromEntries(group.map(e=>[e.path,e.phrase]));
    batches.push({ids:group.map(e=>e.id),paths:group.map(e=>e.path),expectedTextByPath});
  }
  const jobs=[];
  for(const profile of profiles){
    for(const [i,batch] of batches.entries()){
      const request={kind:'public-readonly',taskId:'mission-'+profile+'-'+i,
        paths:batch.paths,expectedTextByPath:batch.expectedTextByPath,
        deviceProfile:profile,screenshots:true};
      const check=planEkodiIndependentBrowser(request,
        {cloudRuntimeReady:true,nativeAgentReady:false});
      if(!check.ok||check.externalBrowserCalls!==0||
         check.plan.assertionsPlanned!==batch.paths.length)
        throw Error('EKODI_MISSION_AUDIT_NATIVE_BATCH_UNSAFE');
      jobs.push({profile,batchIndex:i,ids:batch.ids,request,
        assertions:check.plan.assertionsPlanned,actions:check.plan.task.actions.length});
    }
  }
  return {eligibleIds:eligible.map(e=>e.id),deferredIds:deferred,jobs,
    profiles:[...profiles],provider:'ekodi-background-browser-worker',
    externalBrowserCalls:0,label:TAG};
}

export async function runSiteMissionAudit(registry,missions,options={}){
  const plan=planSiteMissionAudit(registry,missions,options);
  if(options.planOnly===true)return {
    ok:true,mode:'plan-only',eligibleIds:plan.eligibleIds,
    deferredIds:plan.deferredIds,jobs:plan.jobs.map(j=>({
      profile:j.profile,batchIndex:j.batchIndex,siteCount:j.ids.length,
      assertions:j.assertions,actions:j.actions
    })),provider:plan.provider,externalBrowserCalls:0
  };
  const receipts=[];
  for(const job of plan.jobs){
    const result=await executeEkodiIndependentBrowser(job.request,
      {cloudRuntimeReady:true,nativeAgentReady:false},options.runOptions||{});
    if(!result.ok||result.provider!==plan.provider||
       result.receipt?.assertionsPlanned!==job.assertions){
      return {ok:false,mode:'native-readonly',code:result.code||'EKODI_MISSION_AUDIT_NOT_VERIFIED',
        failedProfile:job.profile,failedBatch:job.batchIndex,
        completed:receipts.length,externalBrowserCalls:0};
    }
    receipts.push({profile:job.profile,batchIndex:job.batchIndex,
      verifiedSiteCount:job.ids.length,assertions:job.assertions,
      provider:result.provider,externalBrowserCalls:0});
  }
  return {ok:true,mode:'native-readonly',eligibleIds:plan.eligibleIds,
    deferredIds:plan.deferredIds,receipts,provider:plan.provider,
    externalBrowserCalls:0};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=new Set(process.argv.slice(2));
  const allowed=new Set(['--plan','--run','--include-preparing']);
  if([...args].some(x=>!allowed.has(x))||(args.has('--plan')&&args.has('--run'))){
    process.stderr.write('EKODI_MISSION_AUDIT_ARGUMENT_INVALID\n');process.exitCode=1;
  }else{
    try{
      const [registry,missions]=await Promise.all([
        readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'),
        readFile(new URL('../config/ekodi-site-missions.json',import.meta.url),'utf8')
      ]);
      const result=await runSiteMissionAudit(JSON.parse(registry),JSON.parse(missions),{
        planOnly:!args.has('--run'),includePreparing:args.has('--include-preparing')
      });
      process.stdout.write(JSON.stringify(result)+'\n');
      if(!result.ok)process.exitCode=1;
    }catch{
      process.stderr.write(JSON.stringify({ok:false,code:'EKODI_MISSION_AUDIT_FAILED'})+'\n');
      process.exitCode=1;
    }
  }
}
