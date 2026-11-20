#!/usr/bin/env node
// EKODI-owned Chromium: public, read-only production mission declaration canary.
// Syntax: node scripts/verify-ekodi-site-mission-canary.mjs --plan | --run
// Never logs raw page text, user credentials or external browser session data.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {executeEkodiIndependentBrowser,planEkodiIndependentBrowser} from './ekodi-independent-browser.mjs';

export const CANARY_PROFILES=Object.freeze(['compact-mobile','mobile-portrait','tablet','desktop']);
export const CANARY_SITES=Object.freeze([
  Object.freeze({id:'biz',path:'/ekodibiz/',source:'ekodibiz/index.html',
    publicPhrase:'real work and technology with integrity'}),
  Object.freeze({id:'mall',path:'/ekodimall/',source:'sites/ekodi-mall/src/index.template.html',
    publicPhrase:'우리는 물건을 파는 일을 넘어 생산자의 수고와 구매자의 필요를 정직하게 잇고'})
]);
const CANONICAL_ORIGIN='https://ekodi.kr';

export function planPublicMissionCanary(registry,missions,sourceById){
  if(!registry||!Array.isArray(registry.services)||!missions||!Array.isArray(missions.sites)
    ||!sourceById||typeof sourceById!=='object')throw Error('MISSION_CANARY_INPUT_INVALID');
  const expectedTextByPath={};
  for(const item of CANARY_SITES){
    const site=registry.services.find(x=>x.id===item.id);
    const declared=missions.sites.find(x=>x.id===item.id);
    const source=sourceById[item.id];
    if(!site||!declared||site.name!==declared.officialName||
       declared.ownerScope!=='ekodi-first-party'||site.status!=='live')
      throw Error('MISSION_CANARY_SITE_NOT_LIVE_OR_UNOWNED');
    const u=new URL(site.url);
    if(u.origin!==CANONICAL_ORIGIN||u.username||u.password||u.search||u.hash||
       (u.pathname.endsWith('/')?u.pathname:u.pathname+'/')!==item.path)
      throw Error('MISSION_CANARY_ORIGIN_OR_ROUTE_INVALID');
    if(typeof source!=='string'||!source.includes('data-ekodi-mission="'+item.id+'"')||
      !source.includes(declared.mission))
      throw Error('MISSION_CANARY_LOCAL_SOURCE_DRIFT');
    if(item.id==='biz'&&!source.includes('data-i18n="missionStatement"'))
      throw Error('MISSION_CANARY_TRANSLATION_WIRING_MISSING');
    if(item.id==='mall'&&!source.includes('id="contextForm"'))
      throw Error('MISSION_CANARY_MALL_SEARCH_CONTROL_MISSING');
    expectedTextByPath[item.path]=item.publicPhrase;
  }
  const requests=[];
  const paths=CANARY_SITES.map(s=>s.path);
  for(const profile of CANARY_PROFILES){
    const req={kind:'public-readonly',taskId:'mission-public-'+profile,paths,
      expectedTextByPath,deviceProfile:profile,screenshots:true};
    const planned=planEkodiIndependentBrowser(req,{
      cloudRuntimeReady:true,nativeAgentReady:false
    });
    if(!planned.ok||planned.provider!=='ekodi-background-browser-worker'||
       planned.externalBrowserCalls!==0||planned.plan.assertionsPlanned!==paths.length||
       planned.plan.task.actions.length>30)
      throw Error('MISSION_CANARY_NATIVE_PLAN_UNSAFE');
    requests.push(req);
  }
  return {sites:CANARY_SITES.map(x=>x.id),paths,requests,expectedTextByPath,
    nativeProvider:'ekodi-background-browser-worker',externalBrowserCalls:0};
}

export async function runPublicMissionCanary(registry,missions,sourceById,options={}){
  const plan=planPublicMissionCanary(registry,missions,sourceById);
  if(options.planOnly===true)return {ok:true,mode:'plan-only',sites:plan.sites,
    profiles:CANARY_PROFILES,plannedRuns:plan.requests.length,
    plannedDOMAssertions:CANARY_PROFILES.length*plan.paths.length,
    provider:plan.nativeProvider,externalBrowserCalls:0};
  const receipts=[];
  for(const request of plan.requests){
    const result=await executeEkodiIndependentBrowser(request,{
      cloudRuntimeReady:true,nativeAgentReady:false
    },{...(options.runner?{runner:options.runner}:{}),
      ...(options.artifactRoot?{artifactRoot:options.artifactRoot}:{})});
    if(!result.ok||result.provider!==plan.nativeProvider||
       result.receipt?.assertionsPlanned!==plan.paths.length)
      return {ok:false,mode:'native-public-readonly',
        code:result.code||'MISSION_CANARY_NATIVE_ASSERTION_NOT_VERIFIED',
        failedProfile:request.deviceProfile,completedProfiles:receipts.map(x=>x.profile),
        provider:plan.nativeProvider,externalBrowserCalls:0};
    receipts.push({profile:request.deviceProfile,
      verifiedSites:plan.sites.length,domAssertions:result.receipt.assertionsPlanned,
      screenshotCount:result.receipt.screenshotsPlanned,
      provider:plan.nativeProvider,externalBrowserCalls:0});
  }
  return {ok:true,mode:'native-public-readonly',sites:plan.sites,
    receipts,provider:plan.nativeProvider,externalBrowserCalls:0};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=new Set(process.argv.slice(2));
  if([...args].some(x=>!['--plan','--run'].includes(x))||(args.has('--plan')&&args.has('--run'))){
    process.stderr.write('MISSION_CANARY_ARGUMENT_INVALID\n');process.exitCode=1;
  }else{
    try{
      const json=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
      const sources=Object.fromEntries(await Promise.all(CANARY_SITES.map(async x=>
        [x.id,await readFile(new URL('../'+x.source,import.meta.url),'utf8')])));
      const result=await runPublicMissionCanary(
        await json('config/ecosystem-services.json'),
        await json('config/ekodi-site-missions.json'),sources,
        {planOnly:!args.has('--run'),artifactRoot:'artifacts/mission-public-canary'});
      process.stdout.write(JSON.stringify(result)+'\n');
      if(!result.ok)process.exitCode=1;
    }catch{
      process.stderr.write(JSON.stringify({ok:false,code:'MISSION_CANARY_FAILED_CLOSED'})+'\n');
      process.exitCode=1;
    }
  }
}
