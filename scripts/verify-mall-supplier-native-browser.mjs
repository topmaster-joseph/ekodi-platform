#!/usr/bin/env node
// EKODI-MALL-NATIVE-SUPPLIER-CANARY-001
// Production-safe anonymous read-only canary with EKODI-owned ephemeral Chromium.
// No account cookies, browser profile reuse, vendor authentication, commerce writes,
// financial authorization, personal data, or external browser providers.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTask} from './ekodi-background-browser-worker.mjs';

const ORIGIN='https://ekodi.kr';
const DIR='artifacts/mall-supplier-native-browser';
export const MALL_SUPPLIER_PROFILES=Object.freeze([
  'compact-mobile','mobile-portrait','tablet','desktop'
]);
export const MALL_SUPPLIER_PATHS=Object.freeze([
  '/ekodimall/seller/','/ekodimall/admin/suppliers','/ekodimall/'
]);
const requiredProviders=['domeggook','coupang','bookstore','agoda','tripcom','seller'];

export function mallSupplierNativeTask(profile){
  if(!MALL_SUPPLIER_PROFILES.includes(profile))throw Error('MALL_NATIVE_PROFILE_FORBIDDEN');
  return {
    taskId:'mall-suppliers-guest-'+profile,
    path:MALL_SUPPLIER_PATHS[0],
    deviceProfile:profile,timeoutMs:120000,allowMutation:false,
    actions:[
      {type:'snapshot'},
      {type:'screenshot',name:'seller-guest-'+profile,fullPage:false},
      {type:'goto',path:MALL_SUPPLIER_PATHS[1]},
      {type:'snapshot'},
      {type:'screenshot',name:'admin-guest-'+profile,fullPage:false},
      {type:'goto',path:MALL_SUPPLIER_PATHS[2]},
      {type:'snapshot'}
    ]
  };
}
export function verifyMallSupplierNativeReceipt(actual,profile){
  const results=Array.isArray(actual?.results)?actual.results:[];
  const navigations=results.filter(x=>x.type==='initial-goto'||x.type==='goto');
  const snapshots=results.filter(x=>x.type==='snapshot');
  const screenshots=results.filter(x=>x.type==='screenshot');
  const routeSequence=navigations.map(x=>{
    try{return new URL(x.url).pathname}catch{return '[invalid]'}
  });
  const expected=MALL_SUPPLIER_PATHS;
  // An SSO redirect is NOT a successful authenticated administrator canary;
  // preserve as a read-only guest outcome and leave the role check outstanding.
  const adminActual=routeSequence[1]||'';
  const adminAuthenticationWall=adminActual!==expected[1];
  const flags={
    ekodiOwned:actual?.virtualizationProvider==='ekodi-background-browser-worker',
    guestEphemeral:actual?.ok===true&&actual?.headless===true&&actual?.ephemeralContext===true
      &&actual?.activeUserProfileReused===false&&actual?.allowMutation===false,
    readonly:actual?.allowMutation===false&&actual?.clipboardShared===false
      &&actual?.blockedExternalNavigationCount===0,
    expectedProfile:actual?.deviceProfile===profile,
    canonicalOrigin:actual?.canonicalOrigin===ORIGIN,
    threeNavigations:navigations.length===3&&navigations.every(x=>x.status===200),
    sellerRoute:routeSequence[0]===expected[0],
    mallRoute:routeSequence[2]===expected[2],
    snapshots:snapshots.length===3,
    screenshotProof:screenshots.length===2,
    responsiveNoHorizontalOverflow:snapshots.length===3&&snapshots.every(x=>x.horizontalOverflow===false),
    noJavaScriptPageErrors:Array.isArray(actual?.pageErrors)&&actual.pageErrors.length===0,
    noPaymentOrSupplierActions:!results.some(x=>['click','fill','press'].includes(x.type))
  };
  const ok=Object.values(flags).every(Boolean);
  return {
    ok,profile,flags,routeSequence,adminGuestOutcome:adminAuthenticationWall?'AUTH_REQUIRED_OR_REDIRECT':'GUEST_DOCUMENT',
    authenticatedOperatorVerified:false,
    authenticatedSellerVerified:false,
    supplierCheckoutTested:false,
    blockedWriteAttempts:actual?.blockedMutations?.length||0,
    pageErrorCount:actual?.pageErrors?.length||0,
    navigationPerformance:actual?.performance||null
  };
}
function safeError(error){
  const code=String(error?.code||error?.message||'MALL_NATIVE_PROBE_FAILED').split(':')[0];
  return /^[A-Z][A-Z0-9_]{2,72}$/.test(code)?code:'MALL_NATIVE_PROBE_FAILED';
}
async function getPublic(pathname,request){
  const url=pathname.startsWith('https://')?pathname:ORIGIN+pathname;
  const u=new URL(url);
  if(u.origin!==ORIGIN)throw Error('MALL_EXTERNAL_ORIGIN_FORBIDDEN');
  const response=await request(url,{
    method:'GET',headers:{accept:'text/html,application/json,text/javascript;q=0.7'},
    redirect:'follow',signal:AbortSignal.timeout(18000),cache:'no-store'
  });
  return response;
}
export async function verifyMallSupplierPublicAssets({request=fetch}={}){
  const receipt={ok:false,mode:'anonymous-readonly',source:'live-production',checks:[],
    authenticatedOperatorVerified:false,authenticatedSellerVerified:false,
    mutationPerformed:false};
  async function check(name,location,verify){
    const response=await getPublic(location,request);
    const status=response?.status??null;
    const url=new URL(response?.url||(
      location.startsWith('https://')?location:ORIGIN+location
    ));
    if(url.origin!==ORIGIN)
      throw Error('MALL_UNEXPECTED_REDIRECT_ORIGIN');
    const text=await response.text();
    const detail=await verify({status,body:text,url});
    receipt.checks.push({name,status,path:new URL(location,ORIGIN).pathname,detail});
  }
  await check('registered-providers','/ekodimall/assets/provider-registry.json',({status,body})=>{
    if(status!==200)throw Error('MALL_PROVIDER_REGISTRY_NOT_200');
    let parsed;try{parsed=JSON.parse(body)}catch{throw Error('MALL_PROVIDER_REGISTRY_BAD_JSON')}
    const list=parsed?.providers;
    if(!Array.isArray(list)||!requiredProviders.every(id=>list.some(x=>x.id===id)))
      throw Error('MALL_PROVIDER_REGISTRY_MISSING_SOURCE');
    return {count:list.length,agodaRegistered:true,bookingContractVerified:false};
  });
  await check('seller-static-asset','/ekodimall/assets/seller-server.js',({status,body})=>{
    if(status!==200||!body.includes('seller-inventory-table'))throw Error('MALL_SELLER_LIST_ASSET_NOT_DEPLOYED');
    if(body.includes("api('/api/internal/products/by-provider')"))
      throw Error('MALL_SELLER_CROSS_SELLER_FETCH_DETECTED');
    return {sellerListCodeDeployed:true,readOnlyGuestTest:true};
  });
  let adminScript;
  await check('admin-document','/ekodimall/admin/suppliers',({status,body,url})=>{
    if(status!==200||url.pathname!=='/ekodimall/admin/suppliers')
      throw Error('MALL_ADMIN_DOCUMENT_NOT_DEPLOYED');
    const match=body.match(/<script\b[^>]*\bsrc=["']([^"']*workspace-admin\.js[^"']*)["']/i);
    if(!match)throw Error('MALL_ADMIN_SCRIPT_REFERENCE_MISSING');
    adminScript=new URL(match[1],ORIGIN);
    if(adminScript.origin!==ORIGIN)throw Error('MALL_ADMIN_SCRIPT_EXTERNAL');
    return {loadedInGuestBrowser:false,adminCodePath:adminScript.pathname};
  });
  await check('admin-runtime-code',adminScript.href,({status,body,url})=>{
    // Wrangler can stringify the route branch using either quote style,
    // different whitespace or shortened local variable/function identifiers.
    // Require an actual if(...) return function() supplier branch, not simply
    // a supplier navigation label (which can coexist with a broken router).
    const routeBranch=/if\s*\(\s*[^)]*['"]suppliers['"][^)]*\)\s*return\s+[$a-zA-Z_][$a-zA-Z0-9_]*\s*\(/.test(body);
    const deployed={status,path:url.pathname,bytes:body.length,
      hasSupplierRenderer:body.includes('renderMallSupplierAdmin'),
      hasSupplierRoute:routeBranch,
      hasExactSourceRoute:body.includes("section==='suppliers'"),
      hasSupplierCallName:body.includes('mallSuppliers('),
      appearsHtml:/^\s*<!doctype html/i.test(body)};
    // Only safe origin-local asset metadata is logged: no user, cookies or DOM text.
    console.log('MALL_EKODI_ADMIN_ASSET_DIAGNOSTIC='+JSON.stringify(deployed));
    if(status!==200)throw Error('MALL_ADMIN_SUPPLIER_RUNTIME_HTTP_ERROR');
    if(deployed.appearsHtml)throw Error('MALL_ADMIN_RUNTIME_HTML_FALLBACK');
    if(!deployed.hasSupplierRenderer)throw Error('MALL_ADMIN_RENDERER_NOT_DEPLOYED');
    if(!deployed.hasSupplierRoute)throw Error('MALL_ADMIN_ROUTE_NOT_DEPLOYED');
    return {supplierRouteCodeDeployed:true};
  });
  await check('private-api-guest-denied','/ekodimall/api/api/internal/products/by-provider',({status})=>{
    if(status!==401&&status!==403)throw Error('MALL_PRIVATE_API_NOT_GUEST_DENIED');
    return {guestDenied:true,serverOperatorVerified:false};
  });
  await check('supplier-health','/ekodimall/api/api/public/health',({status,body})=>{
    if(status!==200)throw Error('MALL_SUPPLIER_HEALTH_UNAVAILABLE');
    let health;try{health=JSON.parse(body)}catch{throw Error('MALL_SUPPLIER_HEALTH_BAD_JSON')}
    if(health?.ok!==true)throw Error('MALL_SUPPLIER_HEALTH_NOT_OK');
    if(health.domeggookAutoOrderReady!==false||
       health.buyerPiiReleaseEnabled!==false||
       health.supplierForwardEnabled!==false)
      throw Error('MALL_SUPPLIER_ORDER_GATE_NOT_PROVEN_CLOSED');
    return {healthOk:true,autoOrderLocked:true,buyerPiiLocked:true,supplierForwardLocked:true};
  });
  receipt.ok=true;
  return receipt;
}
export async function runMallSupplierNativeCanary({runner=runTask,request=fetch,artifactRoot=DIR}={}){
  const result={createdAt:new Date().toISOString(),mode:'EKODI-owned-anonymous-readonly',
    externalBrowserCalls:0, paidBrowserRequired:false,
    authenticatedOperatorVerified:false,authenticatedSellerVerified:false,
    supplierOrderPerformed:false,personalBrowserReused:false,ok:false,checks:[]};
  await fs.mkdir(artifactRoot,{recursive:true});
  try{
    // Execute real first-party Chromium before static asset probes, so a stale
    // bundle cannot prevent a browser-level guest screenshot and receipt.
    for(const profile of MALL_SUPPLIER_PROFILES){
      const actual=await runner(mallSupplierNativeTask(profile),{artifactRoot});
      const verified=verifyMallSupplierNativeReceipt(actual,profile);
      result.checks.push(verified);
      console.log('MALL_EKODI_NATIVE_PROFILE='+JSON.stringify({profile,ok:verified.ok,
        guestOutcome:verified.adminGuestOutcome,checks:verified.flags}));
      if(!verified.ok)throw Error('MALL_NATIVE_PROFILE_CHECK_FAILED');
    }
    result.publicAssets=await verifyMallSupplierPublicAssets({request});
    result.ok=result.publicAssets.ok&&result.checks.every(x=>x.ok);
  }catch(error){
    result.errorCode=safeError(error);
  }finally{
    await fs.writeFile(path.join(artifactRoot,'summary.json'),JSON.stringify(result,null,2)+'\n');
  }
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3||!['--plan','--run'].includes(process.argv[2])){
    console.error('MALL_EKODI_NATIVE_USAGE: --plan | --run');process.exitCode=2;
  }else if(process.argv[2]==='--plan'){
    console.log(JSON.stringify({mode:'EKODI-owned-anonymous-readonly',profiles:MALL_SUPPLIER_PROFILES,
      tasks:MALL_SUPPLIER_PROFILES.map(mallSupplierNativeTask),mutations:false,
      authenticatedOperatorVerified:false,authenticatedSellerVerified:false}));
  }else{
    const result=await runMallSupplierNativeCanary();
    console.log('MALL_EKODI_NATIVE_RESULT='+JSON.stringify({ok:result.ok,
      profiles:result.checks.map(x=>x.profile),errorCode:result.errorCode||null,
      operatorVerified:result.authenticatedOperatorVerified}));
    if(!result.ok)process.exitCode=1;
  }
}
