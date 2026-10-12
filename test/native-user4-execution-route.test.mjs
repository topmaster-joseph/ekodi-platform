import test from 'node:test';
import assert from 'node:assert/strict';
import { selectUser4ExecutionRoute,planUser4VirtualDesktopRecovery } from '../scripts/select-native-user4-execution-route.mjs';

const now=Date.parse('2026-10-12T00:00:00.000Z');
const stamp=new Date(now-20_000).toISOString();
const healthyBrowser={
  targetAlias:'user4',observedAt:stamp,
  heartbeatHealthy:true,
  capabilities:{backgroundBrowser:true,backgroundBrowserCanary:true},
  proofs:{browser:{verified:true,fresh:true,status:'succeeded',completedAt:stamp}},
};
const verifiedHyperV={targetAlias:'user4',receiptStatus:'succeeded',backendReady:true,
  userDesktopAttached:false,virtualizationFirmwareEnabled:true,
  hyperVState:'Enabled',hyperVPowerShellAvailable:true,baseVmPresent:true,completedAt:stamp};

test('USER4 uses EKODI background browser for browser-safe work when Hyper-V is not ready',()=>{
  const result=selectUser4ExecutionRoute({
    readiness:healthyBrowser,now,
    probe:{backendReady:false,gapReason:'native-capability-not-production-ready'},
  });
  assert.equal(result.ok,true);
  assert.equal(result.route,'ekodi-background-browser-worker');
  assert.equal(result.routeKind,'non-disruptive-browser-alternative');
  assert.equal(result.desktopBackendReady,false);
  assert.equal(result.browserAlternativeReady,true);
  assert.equal(result.externalProviderUsed,false);
  assert.equal(result.fallback,false);
  assert.ok(result.supportedTaskClasses.includes('isolated-browser-execution'));
  assert.ok(result.unsupportedTaskClasses.includes('isolated-desktop-execution'));
});

test('USER4 keeps native isolated desktop route only when Hyper-V backend is actually ready',()=>{
  const result=selectUser4ExecutionRoute({
    readiness:healthyBrowser,now,
    probe:verifiedHyperV,
  });
  assert.equal(result.route,'ekodi-native-remote-computer');
  assert.equal(result.routeKind,'isolated-desktop');
  assert.equal(result.desktopBackendReady,true);
});

test('USER4 fails closed when neither Hyper-V nor verified background browser is ready',()=>{
  assert.throws(()=>selectUser4ExecutionRoute({
    readiness:{heartbeatHealthy:true,capabilities:{backgroundBrowser:false,backgroundBrowserCanary:false},proofs:{}},
    probe:{backendReady:false,gapReason:'native-capability-not-production-ready'},
  }),/user4_no_safe_native_execution_route/);
});

test('USER4 cannot select fallback from stale, mismatched or unverified browser proof',()=>{
  const variants=[
    {...healthyBrowser,targetAlias:'user3'},
    {...healthyBrowser,observedAt:new Date(now-360000).toISOString()},
    {...healthyBrowser,proofs:{browser:{...healthyBrowser.proofs.browser,completedAt:new Date(now-86400001).toISOString()}}},
    {...healthyBrowser,proofs:{browser:{...healthyBrowser.proofs.browser,fresh:false}}},
    {...healthyBrowser,proofs:{browser:{...healthyBrowser.proofs.browser,status:'failed'}}},
  ];
  for(const readiness of variants)
    assert.throws(()=>selectUser4ExecutionRoute({readiness,probe:{backendReady:false},now}),
      /user4_no_safe_native_execution_route/);
});

test('Headless Hyper-V route requires actual fresh USER4 backend receipt, not a bare boolean',()=>{
  for(const probe of [
    {backendReady:true},
    {...verifiedHyperV,targetAlias:'user2'},
    {...verifiedHyperV,completedAt:new Date(now-700000).toISOString()},
    {...verifiedHyperV,hyperVState:'Disabled'},
    {...verifiedHyperV,baseVmPresent:false},
  ]){
    const result=selectUser4ExecutionRoute({readiness:healthyBrowser,probe,now});
    assert.equal(result.route,'ekodi-background-browser-worker');
    assert.equal(result.desktopBackendReady,false);
  }
});

test('Orchestrator auto-dispatches virtual backend route verification after route code changes',async()=>{
  const {readFileSync}=await import('node:fs');
  const code=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  assert.match(code,/nativeUser4VirtualProbeTouched=changedFiles.some\(file=>[\s\S]*?'scripts\/select-native-user4-execution-route\.mjs'/);
  assert.match(code,/execution_mode:'user4-virtual-probe'/);
});

test('USER4 native Hyper-V probe records all actual prerequisites and a safe maintenance next step',()=>{
  const probe={...verifiedHyperV,backendReady:false,hyperVState:'Disabled',
    hyperVPowerShellAvailable:false,baseVmPresent:false};
  const result=selectUser4ExecutionRoute({readiness:healthyBrowser,probe,now});
  assert.equal(result.route,'ekodi-background-browser-worker');
  assert.equal(result.recoveryPlan.state,'REQUIRES_MAINTENANCE');
  assert.deepEqual(result.recoveryPlan.missing,[
    'hyper-v-windows-feature','hyper-v-powershell-management','ekodi-isolated-base-vm'
  ]);
  assert.equal(result.recoveryPlan.nextAction,'verify-windows-edition-and-plan-admin-maintenance');
  assert.equal(result.recoveryPlan.automaticHostChanges,false);
  assert.equal(result.recoveryPlan.automaticReboot,false);
  assert.equal(result.recoveryPlan.requiresSeparateAdminApproval,true);
  assert.equal(result.preservesUserDesktop,true);
  assert.equal(result.desktopBackendReady,false);
});
test('USER4 does not invent Windows recovery actions from stale or another device proof',()=>{
  const other=planUser4VirtualDesktopRecovery({probe:{...verifiedHyperV,targetAlias:'user2'},now});
  assert.equal(other.state,'PROBE_REQUIRED');
  const stale=planUser4VirtualDesktopRecovery({
    probe:{...verifiedHyperV,completedAt:new Date(now-900000).toISOString()},now
  });
  assert.equal(stale.state,'PROBE_STALE');
  assert.equal(stale.automaticHostChanges,false);
  assert.equal(other.automaticReboot,false);
});
test('USER4 ready Hyper-V canary is only suggested when firmware, management and VM are proven',()=>{
  const result=selectUser4ExecutionRoute({readiness:healthyBrowser,probe:verifiedHyperV,now});
  assert.equal(result.routeKind,'isolated-desktop');
  assert.equal(result.recoveryPlan.state,'READY');
  assert.equal(result.recoveryPlan.nextAction,'run-native-isolated-desktop-canary');
  assert.deepEqual(result.recoveryPlan.missing,[]);
});
