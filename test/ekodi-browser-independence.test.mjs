import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planEkodiIndependentBrowser,executeEkodiIndependentBrowser}
  from '../scripts/ekodi-independent-browser.mjs';

const policy=JSON.parse(readFileSync(new URL('../config/ekodi-browser-independence.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../scripts/ekodi-independent-browser.mjs',import.meta.url),'utf8');

test('native EKODI independence policy has no required metered external browser',()=>{
  assert.equal(policy.policyId,'EKODI-NATIVE-BROWSER-INDEPENDENCE-001');
  assert.equal(policy.externalBrowser.required,false);
  assert.equal(policy.externalBrowser.automaticFallback,false);
  assert.equal(policy.externalBrowser.paidSubscriptionRequired,false);
  assert.equal(policy.nativeRuntime.cloudReadOnlyAvailableWithoutPairedPC,true);
  assert.equal(policy.taskBoundaries.externalSiteRequiresHumanLogin,true);
  assert.doesNotMatch(source,/tinyfish|browserstack|saucelabs|connectOverCDP\s*\(/i);
});

test('cloud-native public page works without a local PC or any paid provider credentials',()=>{
  const s=planEkodiIndependentBrowser({kind:'public-readonly',paths:['/','/ekodimall/','/admin/']},
    {nativeAgentReady:false,externalProviderBalance:0,cloudRuntimeReady:true});
  assert.equal(s.ok,true);
  assert.equal(s.provider,'ekodi-background-browser-worker');
  assert.equal(s.deviceAgentRequired,false);
  assert.equal(s.externalBrowserCalls,0);
  assert.equal(s.plan.uniquePaths,3);
  assert.equal(s.plan.chromiumLaunches,1);
});

test('external login is only possible with approved EKODI device and local consent',()=>{
  const request={kind:'external-auth',service:'domeggook-business'};
  assert.equal(planEkodiIndependentBrowser(request,{}).code,'EKODI_NATIVE_AGENT_REQUIRED');
  assert.equal(planEkodiIndependentBrowser(request,{nativeAgentReady:true}).code,'EKODI_HUMAN_LOGIN_CONSENT_REQUIRED');
  const ready=planEkodiIndependentBrowser(request,{nativeAgentReady:true,localConsentConfirmed:true});
  assert.equal(ready.ok,true);
  assert.equal(ready.action,'OPEN_REGISTERED_EKODI_AUTH_SESSION');
  assert.equal(ready.credentialsRelay,false);
  assert.equal(ready.automatedPurchase,false);
  assert.equal(ready.externalBrowserCalls,0);
  assert.equal(planEkodiIndependentBrowser({...request,service:'unknown'},{nativeAgentReady:true}).code,'EKODI_AUTH_SERVICE_UNREGISTERED');
});

test('offline cloud fails closed rather than routing to an external browser',()=>{
  const s=planEkodiIndependentBrowser({path:'/'},{
    cloudRuntimeReady:false,nativeAgentReady:false,
    externalProviderApproved:true,externalProviderBalance:100000
  });
  assert.equal(s.code,'EKODI_NATIVE_CLOUD_RUNTIME_REQUIRED');
  assert.equal(s.externalBrowserCalls,0);
});

test('untrusted targets, user credentials and mutations are rejected',()=>{
  for(const path of ['https://non-ekodi.example','//non-ekodi.example','javascript:alert(1)']){
    assert.equal(planEkodiIndependentBrowser({paths:[path]}).code,'EKODI_BROWSER_TASK_VALIDATION_FAILED');
  }
  assert.equal(planEkodiIndependentBrowser({path:'/',allowMutation:true}).code,'EKODI_BROWSER_MUTATION_OR_SECRET_FORBIDDEN');
  assert.equal(planEkodiIndependentBrowser({path:'/',cookies:'session'}).code,'EKODI_BROWSER_MUTATION_OR_SECRET_FORBIDDEN');
});

test('native execution verifies owned worker identity and never silently uses external fallback',async()=>{
  let invokes=0;
  const request={kind:'public-readonly',paths:['/','/ekodimall/']};
  const r=await executeEkodiIndependentBrowser(request,{}, {runner:async task=>{
    invokes++;
    assert.equal(task.allowMutation,false);
    return {ok:true,virtualizationProvider:'ekodi-background-browser-worker',performance:{navigations:2,p50Ms:200,p95Ms:320}};
  }});
  assert.equal(invokes,1);
  assert.equal(r.ok,true);
  assert.equal(r.externalBrowserCalls,0);
  assert.equal(r.performance.p95Ms,320);
  const rejected=await executeEkodiIndependentBrowser(request,{}, {runner:async()=>({
    ok:true,virtualizationProvider:'external-browser',performance:{navigations:2}
  })});
  assert.equal(rejected.code,'EKODI_NATIVE_BROWSER_EXECUTION_FAILED');
  assert.equal(rejected.externalBrowserCalls,0);
});

test('provider exceptions cannot trigger paid browser fallback or leak raw provider errors',async()=>{
  let invokes=0;
  const r=await executeEkodiIndependentBrowser({path:'/'},{},{runner:async()=>{
    invokes++;
    throw Error('secret=https://ekodi.kr/auth?token=do-not-leak');
  }});
  assert.equal(invokes,1);
  assert.equal(r.ok,false);
  assert.equal(r.code,'EKODI_NATIVE_BROWSER_EXECUTION_FAILED');
  assert.doesNotMatch(JSON.stringify(r),/do-not-leak|token/);
});
