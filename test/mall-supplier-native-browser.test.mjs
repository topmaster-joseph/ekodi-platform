import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MALL_SUPPLIER_PROFILES,MALL_SUPPLIER_PATHS,mallSupplierNativeTask,
  verifyMallSupplierNativeReceipt,verifyMallSupplierPublicAssets
} from '../scripts/verify-mall-supplier-native-browser.mjs';

const ORIGIN='https://ekodi.kr';
function fakeNativeReceipt(profile,adminPath=MALL_SUPPLIER_PATHS[1]){
  const paths=[MALL_SUPPLIER_PATHS[0],adminPath,MALL_SUPPLIER_PATHS[2]];
  const results=[{type:'initial-goto',url:ORIGIN+paths[0],status:200}];
  paths.forEach((pathname,i)=>{
    if(i)results.push({type:'goto',url:ORIGIN+pathname,status:200});
    results.push({type:'snapshot',title:'EKODI',horizontalOverflow:false,bodyText:'상품 관리'});
    if(i<2)results.push({type:'screenshot',name:i?'admin':'seller',file:'safe.png'});
  });
  return {
    ok:true,virtualizationProvider:'ekodi-background-browser-worker',headless:true,
    ephemeralContext:true,activeUserProfileReused:false,allowMutation:false,
    clipboardShared:false,blockedExternalNavigationCount:0,
    blockedMutations:[],pageErrors:[],deviceProfile:profile,canonicalOrigin:ORIGIN,
    performance:{navigations:3,p50Ms:100,p95Ms:150},results
  };
}
function fakeRequestFactory({guestStatus=401,healthAutoOrder=false,missingRegistry=false}={}){
  const registry={providers:['domeggook','coupang','bookstore','agoda','tripcom','seller'].filter(x=>!missingRegistry||x!=='agoda').map(id=>({id,label:id}))};
  const content={
    '/ekodimall/assets/provider-registry.json':JSON.stringify(registry),
    '/ekodimall/assets/seller-server.js':'function renderProviderProducts(){const className="seller-inventory-table"}',
    '/ekodimall/admin/suppliers':'<!doctype html><html><script src="/workspace-admin.js"></script></html>',
    '/workspace-admin.js':'const renderMallSupplierAdmin=function(){}; if(section===\x27suppliers\x27){}',
    '/ekodimall/api/api/internal/products/by-provider':'{"error":"unauthorized"}',
    '/health':JSON.stringify({ok:true,domeggookAutoOrderReady:healthAutoOrder,
      buyerPiiReleaseEnabled:false,supplierForwardEnabled:false})
  };
  const calls=[];
  const request=async (url,options)=>{
    const parsed=new URL(url);
    calls.push({url,method:options.method,headers:options.headers});
    const status=parsed.pathname==='/ekodimall/api/api/internal/products/by-provider'?guestStatus:200;
    return {status,url,text:async()=>content[parsed.pathname]||''};
  };
  return {calls,request};
}

test('all four native-browser profiles are isolated, readonly and fixed to Mall canonical paths',()=>{
  assert.deepEqual([...MALL_SUPPLIER_PROFILES],['compact-mobile','mobile-portrait','tablet','desktop']);
  assert.equal(MALL_SUPPLIER_PATHS.length,3);
  for(const profile of MALL_SUPPLIER_PROFILES){
    const task=mallSupplierNativeTask(profile);
    assert.equal(task.deviceProfile,profile);
    assert.equal(task.path,'/ekodimall/seller/');
    assert.equal(task.allowMutation,false);
    assert.deepEqual(task.actions.filter(x=>x.type==='goto').map(x=>x.path),
      ['/ekodimall/admin/suppliers','/ekodimall/']);
    assert.equal(task.actions.filter(x=>x.type==='snapshot').length,3);
    assert.ok(task.actions.every(x=>!['click','fill','press'].includes(x.type)));
    assert.ok(verifyMallSupplierNativeReceipt(fakeNativeReceipt(profile),profile).ok);
  }
  assert.throws(()=>mallSupplierNativeTask('external-browser'),/FORBIDDEN/);
});

test('guest admin auth redirect never claims authenticated operator verification',()=>{
  const receipt=verifyMallSupplierNativeReceipt(fakeNativeReceipt('desktop','/auth/'),'desktop');
  assert.equal(receipt.ok,true);
  assert.equal(receipt.adminGuestOutcome,'AUTH_REQUIRED_OR_REDIRECT');
  assert.equal(receipt.authenticatedOperatorVerified,false);
  assert.equal(receipt.authenticatedSellerVerified,false);
  assert.equal(receipt.supplierCheckoutTested,false);
});

test('native receipt rejects missing screenshot, viewport overflow, and leaked user profile',()=>{
  let rec=fakeNativeReceipt('mobile-portrait');
  rec.results.find(x=>x.type==='snapshot').horizontalOverflow=true;
  assert.equal(verifyMallSupplierNativeReceipt(rec,'mobile-portrait').ok,false);
  rec=fakeNativeReceipt('mobile-portrait');
  rec.activeUserProfileReused=true;
  assert.equal(verifyMallSupplierNativeReceipt(rec,'mobile-portrait').ok,false);
  rec=fakeNativeReceipt('mobile-portrait');
  rec.results=rec.results.filter(x=>x.type!=='screenshot');
  assert.equal(verifyMallSupplierNativeReceipt(rec,'mobile-portrait').ok,false);
});

test('public production contract checks provider registry, admin JS, seller list, guest API 401 and supplier locks',async()=>{
  const mock=fakeRequestFactory();
  const result=await verifyMallSupplierPublicAssets({request:mock.request});
  assert.equal(result.ok,true);
  assert.equal(result.checks.length,6);
  assert.equal(result.authenticatedOperatorVerified,false);
  assert.equal(result.authenticatedSellerVerified,false);
  assert.equal(result.mutationPerformed,false);
  assert.ok(mock.calls.every(x=>x.method==='GET'&&!x.headers.authorization));
  assert.equal(result.checks.find(x=>x.name==='private-api-guest-denied').status,401);
  assert.equal(result.checks.find(x=>x.name==='registered-providers').detail.count,6);
});

test('public contract fails closed for exposed operator API, missing Agoda or enabled auto-order',async()=>{
  await assert.rejects(()=>verifyMallSupplierPublicAssets({request:fakeRequestFactory({guestStatus:200}).request}),
    /MALL_PRIVATE_API_NOT_GUEST_DENIED/);
  await assert.rejects(()=>verifyMallSupplierPublicAssets({request:fakeRequestFactory({missingRegistry:true}).request}),
    /MALL_PROVIDER_REGISTRY_MISSING_SOURCE/);
  await assert.rejects(()=>verifyMallSupplierPublicAssets({request:fakeRequestFactory({healthAutoOrder:true}).request}),
    /MALL_SUPPLIER_ORDER_GATE_NOT_PROVEN_CLOSED/);
});

test('workflow is official EKODI-owned GitHub Chromium lane with no personal browser or third-party service',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/verify-mall-supplier-native-browser.yml',import.meta.url),'utf8');
  assert.match(workflow,/EKODI Mall · Stage and Deploy/);
  assert.match(workflow,/scripts\/verify-mall-supplier-native-browser\.mjs --run/);
  assert.match(workflow,/playwright@1\.65\.1/);
  assert.match(workflow,/pull_request:/);
  assert.match(workflow,/workflow_run:/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow,/\bOpera\b|\bTinyFish\b|puppeteer[- ]cloud|\bbrowserbase\b|\bBrowserless\b/i);
});
