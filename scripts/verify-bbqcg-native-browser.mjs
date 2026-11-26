#!/usr/bin/env node
// EKODI-owned, isolated Chromium canary for the customer-facing BBQ Cheonggye
// site. Public anonymous read-only only: never authenticates, checks out,
// submits an order, opens the user's browser, or shares a profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTask} from './ekodi-background-browser-worker.mjs';

const ROOT='artifacts/bbqcg-native-browser';
export const BBQCG_NATIVE_PROFILES=Object.freeze([
  'compact-mobile','mobile-portrait','desktop'
]);
export const BBQCG_NATIVE_PHRASES=Object.freeze({
  launch:'11월 24일 개점',
  paymentLocked:'온라인 결제 및 매장 자동 접수는 아직 준비 중입니다.'
});
// Exact stable CSP style violations found in the native EKODI browser before
// the protected Shell fixes. Unrelated Cloudflare analytics/dynamic inline
// scripts are deliberately not allowlisted or treated as solved.
export const BBQCG_FIXED_SHELL_STYLE_HASHES=Object.freeze([
  'sha256-wo6UxAABjRaoc7daJHFwNEhchuZLrGAZznw5zT+FPg4=',
  'sha256-dUSx2u1Qfvq55euG9asAxjp3uojrtLlsPvWBF7tHRFA=',
  // Remaining exact style hashes fixed by strict-CSP Shell externalization v9:
  // media, messages, illustration, design inheritance and unified login.
  'sha256-56iRHn0ej9JYBkqhTqTQCrBVCLBuVesvScQBMp5bJOI=',
  'sha256-6VVFqLR4PDJXyCW7LUvhdS2zhZdIHiNuwZA+lh0G6zI=',
  'sha256-LiXvRlPcXXsokE41eFS7y5B+hJa0pauWdVT/Djrp4nQ=',
  'sha256-mE13/Tkp6GHOZBGLsbNs4lm9lEsDZF0aqAyMUFoW4yw=',
  'sha256-hEOYE6DHApNv8x375sq9CzL6GcuPcrFObwxu7AfldAI='
]);
export function bbqcgNativeTask(profile){
  if(!BBQCG_NATIVE_PROFILES.includes(profile))throw Error('BBQCG_PROFILE_NOT_ALLOWED');
  return {
    taskId:'bbqcg-production-'+profile,
    path:'/bbqcg',deviceProfile:profile,
    timeoutMs:120000,allowMutation:false,
    actions:[
      {type:'waitFor',selector:'.launch-note',timeoutMs:15000},
      {type:'assertText',text:BBQCG_NATIVE_PHRASES.launch},
      {type:'waitFor',selector:'.actions a[href^="tel:"]',timeoutMs:15000},
      {type:'waitFor',selector:'#bbqOrderQr img:visible',timeoutMs:15000},
      {type:'assertText',text:'QR 생성 완료'},
      {type:'snapshot'},
      {type:'screenshot',name:'storefront-'+profile},
      {type:'goto',path:'/bbqcg/order'},
      {type:'assertText',text:BBQCG_NATIVE_PHRASES.paymentLocked},
      {type:'waitFor',selector:'#bbqcgOrderPreview',timeoutMs:15000},
      {type:'assertDisabled',selector:'.order-sidebar button'},
      {type:'snapshot'},
      {type:'screenshot',name:'order-guide-'+profile}
    ]
  };
}
export function verifyBbqcgNativeReceipt(report,profile){
  const result=Array.isArray(report?.results)?report.results:[];
  const snapshots=result.filter(x=>x.type==='snapshot');
  const initial=result.find(x=>x.type==='initial-goto');
  const order=result.find(x=>x.type==='goto'&&new URL(x.url).pathname==='/bbqcg/order');
  // The native BBQ storefront is not a customer-tenant Chrome subject.
  // A legacy 404 from either shared Shell module is an observable regression.
  const siteChrome404s=Array.isArray(report?.httpErrorResponses)
    ?report.httpErrorResponses.filter(item=>Number(item?.status)===404&&
      /^https:\/\/ekodi\.kr\/workspace-api\/v1\/site-chrome\/public(?:[?#]|$)/.test(String(item?.url||'')))
    :null;
  const errors=Array.isArray(report?.consoleErrors)?report.consoleErrors:null;
  const blockedFixedShellStyles=errors
    ?errors.filter(message=>BBQCG_FIXED_SHELL_STYLE_HASHES.some(hash=>String(message).includes(hash)))
    :null;
  const required=['waitFor','assertText','assertDisabled','screenshot'];
  const checks={
    correctProvider:report?.virtualizationProvider==='ekodi-background-browser-worker',
    ephemeralReadOnly:report?.ok===true&&report?.allowMutation===false&&
      report?.headless===true&&report?.ephemeralContext===true&&report?.activeUserProfileReused===false,
    profile:report?.deviceProfile===profile,
    canonicalOrigin:report?.canonicalOrigin==='https://ekodi.kr',
    storefront200:initial?.status===200,
    orderGuide200:order?.status===200,
    bothSnapshots:snapshots.length===2,
    noHorizontalOverflow:snapshots.length===2&&snapshots.every(s=>s.horizontalOverflow===false),
    requiredDomAssertions:required.every(t=>result.some(x=>x.type===t))&&
      result.filter(x=>x.type==='assertText').length===3,
    paymentControlDisabled:result.some(x=>x.type==='assertDisabled'&&x.passed===true),
    noOutboundBrowserNavigation:report?.blockedExternalNavigationCount===0,
    // The public site can attempt telemetry POSTs. EKODI Native Browser
    // prevents every non-GET/HEAD/OPTIONS request via context.route.
    // Treat actively blocked attempts as proof of isolation, not as writes.
    noMutation:report?.allowMutation===false&&Array.isArray(report?.blockedMutations)&&
      report.blockedMutations.every(item=>!['GET','HEAD','OPTIONS'].includes(String(item?.method||'').toUpperCase())),
    noPageErrors:!(report?.pageErrors||[]).length,
    noMissingNativeChrome:siteChrome404s!==null&&siteChrome404s.length===0,
    noBlockedFixedShellStyles:blockedFixedShellStyles!==null&&blockedFixedShellStyles.length===0
  };
  return {ok:Object.values(checks).every(Boolean),profile,checks,
    viewport:report?.viewport||null,
    navigationPerformance:report?.performance||null,
    pageErrorCount:report?.pageErrors?.length||0,
    missingNativeChrome404Count:siteChrome404s?.length??null,
    blockedFixedShellStyleCount:blockedFixedShellStyles?.length??null,
    blockedWriteAttempts:report?.blockedMutations?.length||0,
    screenshots:report?.screenshots?.length||0};
}
export async function runBbqcgNativeCanary({runner=runTask,artifactRoot=ROOT}={}){
  const report={checkedAt:new Date().toISOString(),provider:'ekodi-background-browser-worker',
    mode:'anonymous-readonly',externalBrowserCalls:0,authenticatedTenantVerified:false,
    paymentProcessed:false,orderCreated:false,checks:[],ok:false};
  await fs.mkdir(artifactRoot,{recursive:true});
  try{
    for(const profile of BBQCG_NATIVE_PROFILES){
      const actual=await runner(bbqcgNativeTask(profile),{artifactRoot});
      const check=verifyBbqcgNativeReceipt(actual,profile);
      report.checks.push(check);
      console.log('[BBQCG NATIVE] '+JSON.stringify({profile,ok:check.ok,checks:check.checks,viewport:check.viewport}));
      if(!check.ok)throw Error('BBQCG_NATIVE_PROFILE_VALIDATION_FAILED:'+profile);
    }
    report.ok=true;
  }catch(error){
    report.errorCode=String(error?.message||error).slice(0,140)
      .replace(/https?:\/\/[^\s]+/g,'[redacted-url]');
  }finally{
    await fs.writeFile(path.join(artifactRoot,'summary.json'),JSON.stringify(report,null,2)+'\n');
  }
  return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3||!['--plan','--run'].includes(process.argv[2])){
    console.error('BBQCG_NATIVE_USAGE: --plan | --run');process.exitCode=2;
  }else if(process.argv[2]==='--plan'){
    console.log(JSON.stringify({mode:'native-readonly-plan',profiles:BBQCG_NATIVE_PROFILES,
      tasks:BBQCG_NATIVE_PROFILES.map(p=>bbqcgNativeTask(p)),
      externalBrowserCalls:0}));
  }else{
    const result=await runBbqcgNativeCanary();
    console.log('[BBQCG NATIVE] RESULT '+JSON.stringify({ok:result.ok,
      testedProfiles:result.checks.map(x=>x.profile),errorCode:result.errorCode||null}));
    if(!result.ok)process.exitCode=1;
  }
}
