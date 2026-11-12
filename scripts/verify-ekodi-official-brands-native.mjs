#!/usr/bin/env node
// EKODI-owned Chromium audit for official first-party public brand names.
// No external browser, credentials, session import or private site navigation.
// Usage: node scripts/verify-ekodi-official-brands-native.mjs --plan
//        node scripts/verify-ekodi-official-brands-native.mjs --run
//        node scripts/verify-ekodi-official-brands-native.mjs --run --include-preparing
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {planEkodiIndependentBrowser,executeEkodiIndependentBrowser} from './ekodi-independent-browser.mjs';

export const OFFICIAL_BRAND_AUDIT_IDS=Object.freeze(['publishing','books','management']);
/* Exact expected public brand labels, deliberately independent from the
   migration status of the service registry. An outdated registry must never
   turn an old label into a successful "official" browser assertion. */
export const OFFICIAL_BRAND_AUDIT_NAMES=Object.freeze({
  publishing:'에코디출판',
  books:'에코디서점',
  management:'에코디경영'
});
export const OFFICIAL_BRAND_AUDIT_PROFILES=Object.freeze([
  'compact-mobile','mobile-portrait','tablet','desktop'
]);

export function planOfficialBrandAudit(registry,options={}){
  if(!registry||!Array.isArray(registry.services))throw Error('EKODI_BRAND_REGISTRY_INVALID');
  const profiles=options.profiles||OFFICIAL_BRAND_AUDIT_PROFILES;
  if(!Array.isArray(profiles)||!profiles.length)throw Error('EKODI_BRAND_PROFILES_INVALID');
  const sites=OFFICIAL_BRAND_AUDIT_IDS.map(id=>registry.services.find(x=>x.id===id))
    .filter(site=>site && (site.status==='live'||options.includePreparing===true));
  if(!sites.length)throw Error('EKODI_BRAND_NO_PUBLIC_SURFACES');
  const expectedTextByPath={};
  const paths=[];
  const sourcePendingIds=[];
  for(const site of sites){
    const u=new URL(site.url);
    if(u.origin!=='https://ekodi.kr'||u.search||u.hash||
      typeof site.name!=='string'||!OFFICIAL_BRAND_AUDIT_NAMES[site.id])
      throw Error('EKODI_BRAND_REGISTRY_UNSAFE');
    const p=u.pathname.endsWith('/')?u.pathname:u.pathname+'/';
    paths.push(p);
    const expected=OFFICIAL_BRAND_AUDIT_NAMES[site.id];
    if(site.name!==expected)sourcePendingIds.push(site.id);
    expectedTextByPath[p]=expected;
  }
  const jobs=[];
  for(const profile of profiles){
    const plan=planEkodiIndependentBrowser({
      kind:'public-readonly',taskId:'brand-'+profile,paths,
      expectedTextByPath,deviceProfile:profile,screenshots:true
    },{cloudRuntimeReady:true,nativeAgentReady:false});
    if(!plan.ok)throw Error(plan.code);
    jobs.push({profile,request:{kind:'public-readonly',taskId:'brand-'+profile,
      paths,expectedTextByPath,deviceProfile:profile,screenshots:true},
      actions:plan.plan.task.actions.length,assertions:plan.plan.assertionsPlanned,
      screenshots:plan.plan.screenshotsPlanned});
  }
  return {siteIds:sites.map(x=>x.id),paths,expectedTextByPath,jobs,
    sourceAligned:sourcePendingIds.length===0,sourcePendingIds,
    provider:'ekodi-background-browser-worker',externalBrowserCalls:0};
}

export async function runOfficialBrandAudit(registry,options={}){
  const plan=planOfficialBrandAudit(registry,options);
  if(options.planOnly===true)return {ok:true,mode:'plan-only',
    sourceAligned:plan.sourceAligned,sourcePendingIds:plan.sourcePendingIds,
    siteIds:plan.siteIds,paths:plan.paths,
    jobs:plan.jobs.map(({profile,actions,assertions,screenshots})=>
      ({profile,actions,assertions,screenshots})),
    provider:plan.provider,externalBrowserCalls:0};
  // A source registry still using pre-migration names must not be presented
  // as a successful released-brand audit. This is a guarded readiness state.
  if(!plan.sourceAligned)return {
    ok:false,code:'EKODI_BRAND_SOURCE_NOT_ALIGNED',mode:'native-readonly',
    sourcePendingIds:plan.sourcePendingIds,externalBrowserCalls:0
  };
  const receipts=[];
  for(const job of plan.jobs){
    const result=await executeEkodiIndependentBrowser(job.request,
      {cloudRuntimeReady:true,nativeAgentReady:false},options.runOptions||{});
    if(!result.ok) return {ok:false,code:result.code,mode:'native-readonly',
      completedProfiles:receipts.map(x=>x.profile),failedProfile:job.profile,
      provider:plan.provider,externalBrowserCalls:0};
    // Do not print page text, URLs containing query credentials, user data or screenshot bytes.
    receipts.push({profile:job.profile,provider:result.provider,
      verifiedPaths:job.request.paths.length,
      assertions:result.receipt.assertionsPlanned,
      performance:result.performance||null,externalBrowserCalls:0});
  }
  return {ok:true,mode:'native-readonly',siteIds:plan.siteIds,
    receipts,provider:plan.provider,externalBrowserCalls:0};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=new Set(process.argv.slice(2));
  const recognized=new Set(['--plan','--run','--include-preparing']);
  if([...args].some(x=>!recognized.has(x))|| (args.has('--plan')&&args.has('--run'))){
    process.stderr.write('EKODI_BRAND_AUDIT_ARGUMENT_INVALID\n');
    process.exitCode=1;
  }else{
    try{
      const registry=JSON.parse(await readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));
      const result=await runOfficialBrandAudit(registry,{
        planOnly:!args.has('--run'),
        includePreparing:args.has('--include-preparing')
      });
      process.stdout.write(JSON.stringify(result)+'\n');
      if(!result.ok)process.exitCode=1;
    }catch{
      process.stderr.write(JSON.stringify({ok:false,code:'EKODI_BRAND_AUDIT_FAILED'})+'\n');
      process.exitCode=1;
    }
  }
}
