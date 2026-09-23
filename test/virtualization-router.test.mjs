import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectVirtualizationProvider,
  nativeVirtualizationRequired,
  eligibleNativeVirtualizationProviders
} from '../virtualization-router.js';

test('healthy EKODI browser worker always wins over external providers',()=>{
  const result=selectVirtualizationProvider({
    taskClass:'browser-ui-validation',
    nativeProviders:[{
      id:'ekodi-background-browser-worker',
      ownership:'ekodi',
      state:'runtime-proven',
      healthy:true,
      taskClasses:['browser-ui-validation']
    }],
    externalProviders:[{id:'external-browser',enabled:true,approved:true,securityEquivalentOrStronger:true}]
  });
  assert.equal(result.ok,true);
  assert.equal(result.providerType,'native');
  assert.equal(result.providerId,'ekodi-background-browser-worker');
  assert.equal(result.fallback,false);
});

test('external fallback is rejected when native failure evidence is incomplete',()=>{
  const result=selectVirtualizationProvider({
    taskClass:'synthetic-surface-verification',
    nativeProviders:[
      {id:'ekodi-background-browser-worker',state:'unavailable',healthy:false,ownership:'ekodi'},
      {id:'autonomous-execution-fabric',state:'unavailable',healthy:false,ownership:'ekodi'}
    ],
    externalProviders:[{id:'external-browser',enabled:true,approved:true,securityEquivalentOrStronger:true}],
    externalFallback:{
      reason:'native-capability-unavailable',
      auditId:'audit-1',
      nativeCapabilityGapRecord:'gap-1',
      securityEquivalentOrStronger:true,
      paidUpgrade:false,
      nativeFailures:[{id:'ekodi-background-browser-worker',reason:'native-capability-unavailable'}]
    }
  });
  assert.equal(result.ok,false);
  assert.equal(result.code,'EXTERNAL_FALLBACK_NATIVE_FAILURE_EVIDENCE_REQUIRED');
  assert.deepEqual(result.details.missingEvidence,['autonomous-execution-fabric']);
});

test('audited external fallback is allowed only after every eligible native route is unusable',()=>{
  const result=selectVirtualizationProvider({
    taskClass:'isolated-desktop-execution',
    nativeProviders:[{id:'ekodi-native-remote-computer',state:'not-production-ready',healthy:false,ownership:'ekodi'}],
    externalProviders:[{
      id:'temporary-external-desktop',
      enabled:true,
      approved:true,
      securityEquivalentOrStronger:true,
      paidUpgradeRequired:false
    }],
    externalFallback:{
      reason:'native-capability-not-production-ready',
      auditId:'audit-desktop-1',
      nativeCapabilityGapRecord:'native-gap-desktop-1',
      securityEquivalentOrStronger:true,
      paidUpgrade:false,
      nativeFailures:[{
        id:'ekodi-native-remote-computer',
        reason:'native-capability-not-production-ready'
      }]
    }
  });
  assert.equal(result.ok,true);
  assert.equal(result.providerType,'external-fallback');
  assert.equal(result.retryNativeNextExecution,true);
});

test('paid or security-weaker fallback is fail-closed',()=>{
  const common={
    taskClass:'computer-use-automation',
    nativeProviders:[{id:'ekodi-native-remote-computer',state:'unavailable',healthy:false,ownership:'ekodi'}],
    externalProviders:[{id:'external',enabled:true,approved:true,securityEquivalentOrStronger:true}],
  };
  const paid=selectVirtualizationProvider({
    ...common,
    externalFallback:{
      reason:'native-capability-unavailable',
      auditId:'a',
      nativeCapabilityGapRecord:'g',
      securityEquivalentOrStronger:true,
      paidUpgrade:true,
      nativeFailures:[{id:'ekodi-native-remote-computer',reason:'native-capability-unavailable'}]
    }
  });
  assert.equal(paid.code,'EXTERNAL_FALLBACK_PAID_UPGRADE_FORBIDDEN');

  const weak=selectVirtualizationProvider({
    ...common,
    externalFallback:{
      reason:'native-capability-unavailable',
      auditId:'a',
      nativeCapabilityGapRecord:'g',
      securityEquivalentOrStronger:false,
      paidUpgrade:false,
      nativeFailures:[{id:'ekodi-native-remote-computer',reason:'native-capability-unavailable'}]
    }
  });
  assert.equal(weak.code,'EXTERNAL_FALLBACK_SECURITY_NOT_PROVEN');
});

test('known task classes expose native EKODI ownership paths',()=>{
  assert.equal(nativeVirtualizationRequired('browser-ui-validation'),true);
  assert.deepEqual(eligibleNativeVirtualizationProviders('browser-ui-validation'),['ekodi-background-browser-worker']);
  assert.deepEqual(eligibleNativeVirtualizationProviders('computer-use-automation'),['ekodi-native-remote-computer']);
});
