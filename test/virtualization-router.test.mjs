import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectVirtualizationProvider,
  nativeVirtualizationRequired,
  eligibleNativeVirtualizationProviders,
  BACKGROUND_BROWSER_SURFACE_CONTRACT
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
  assert.deepEqual(result.surfaceContract, BACKGROUND_BROWSER_SURFACE_CONTRACT);
  assert.equal(result.surfaceContract.executionMode,'background-only');
  assert.equal(result.surfaceContract.userBrowserTabCreation,false);
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
      nativeRecoveryEvidence:[{id:'ekodi-background-browser-worker',attempted:true,outcome:'exhausted',auditId:'repair-ekodi-background-browser-worker'},{id:'ekodi-native-remote-computer',attempted:true,outcome:'exhausted',auditId:'repair-ekodi-native-remote-computer'},{id:'autonomous-execution-fabric',attempted:true,outcome:'exhausted',auditId:'repair-autonomous-execution-fabric'}],
      
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
  assert.deepEqual(result.details.missingEvidence,['ekodi-native-remote-computer','autonomous-execution-fabric']);
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
      nativeRecoveryEvidence:[{id:'ekodi-native-remote-computer',attempted:true,outcome:'exhausted',auditId:'repair-ekodi-native-remote-computer'}],
      
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
      nativeRecoveryEvidence:[{id:'ekodi-native-remote-computer',attempted:true,outcome:'exhausted',auditId:'repair-ekodi-native-remote-computer'}],
      
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
      nativeRecoveryEvidence:[{id:'ekodi-native-remote-computer',attempted:true,outcome:'exhausted',auditId:'repair-ekodi-native-remote-computer'}],
      
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
  assert.deepEqual(eligibleNativeVirtualizationProviders('browser-ui-validation'),['ekodi-background-browser-worker','ekodi-native-remote-computer','autonomous-execution-fabric']);
  assert.deepEqual(eligibleNativeVirtualizationProviders('computer-use-automation'),['ekodi-native-remote-computer']);
});


test('browser external fallback is rejected unless it proves background-only surface isolation',()=>{
  const common={
    taskClass:'browser-ui-validation',
    nativeProviders:[
      {id:'ekodi-background-browser-worker',state:'unavailable',healthy:false,ownership:'ekodi'},
      {id:'ekodi-native-remote-computer',state:'unavailable',healthy:false,ownership:'ekodi'},
      {id:'autonomous-execution-fabric',state:'unavailable',healthy:false,ownership:'ekodi'},
    ],
    externalFallback:{
      nativeRecoveryEvidence:[{id:'ekodi-background-browser-worker',attempted:true,outcome:'exhausted',auditId:'repair-ekodi-background-browser-worker'},{id:'ekodi-native-remote-computer',attempted:true,outcome:'exhausted',auditId:'repair-ekodi-native-remote-computer'},{id:'autonomous-execution-fabric',attempted:true,outcome:'exhausted',auditId:'repair-autonomous-execution-fabric'}],
      
      reason:'native-capability-unavailable',
      auditId:'audit-bg',
      nativeCapabilityGapRecord:'gap-bg',
      securityEquivalentOrStronger:true,
      paidUpgrade:false,
      nativeFailures:[
        {id:'ekodi-background-browser-worker',reason:'native-capability-unavailable'},
        {id:'ekodi-native-remote-computer',reason:'native-capability-unavailable'},
        {id:'autonomous-execution-fabric',reason:'native-capability-unavailable'},
      ],
    },
  };
  const foreground=selectVirtualizationProvider({
    ...common,
    externalProviders:[{
      id:'foreground-browser',
      enabled:true,approved:true,securityEquivalentOrStronger:true,
      executionMode:'foreground',headlessOrOffscreen:false,userBrowserTabCreation:true,
      ownedSurfaceAutoClose:false,preserveUserOwnedSurfaces:false,
    }],
  });
  assert.equal(foreground.ok,false);
  assert.equal(foreground.code,'EXTERNAL_FALLBACK_PROVIDER_UNAVAILABLE');

  const background=selectVirtualizationProvider({
    ...common,
    externalProviders:[{
      id:'isolated-browser',
      enabled:true,approved:true,securityEquivalentOrStronger:true,
      executionMode:'background-only',headlessOrOffscreen:true,userBrowserTabCreation:false,
      ownedSurfaceAutoClose:true,preserveUserOwnedSurfaces:true,interactiveLoginAllowed:false,
    }],
  });
  assert.equal(background.ok,true);
  assert.equal(background.providerId,'isolated-browser');
  assert.deepEqual(background.surfaceContract,BACKGROUND_BROWSER_SURFACE_CONTRACT);
});

test('browser tasks recover through EKODI native providers before any external fallback',()=>{
  const firstRecovery=selectVirtualizationProvider({taskClass:'browser-ui-validation',nativeProviders:[
    {id:'ekodi-background-browser-worker',state:'unavailable',healthy:false,ownership:'ekodi'},
    {id:'ekodi-native-remote-computer',state:'ready',healthy:true,ownership:'ekodi'},
    {id:'autonomous-execution-fabric',state:'ready',healthy:true,ownership:'ekodi'}]});
  assert.equal(firstRecovery.providerId,'ekodi-native-remote-computer');
  const secondRecovery=selectVirtualizationProvider({taskClass:'browser-ui-validation',nativeProviders:[
    {id:'ekodi-background-browser-worker',state:'unavailable',healthy:false,ownership:'ekodi'},
    {id:'ekodi-native-remote-computer',state:'unavailable',healthy:false,ownership:'ekodi'},
    {id:'autonomous-execution-fabric',state:'runtime-proven',healthy:true,ownership:'ekodi'}]});
  assert.equal(secondRecovery.providerId,'autonomous-execution-fabric');
});

test('native executor failure returns mandatory repair and update plan',()=>{
  const result=selectVirtualizationProvider({taskClass:'browser-ui-validation',nativeProviders:[]});
  assert.equal(result.code,'NATIVE_VIRTUALIZATION_REQUIRED');
  assert.equal(result.details.recoveryPlan.required,true);
  assert.equal(result.details.recoveryPlan.maxAttemptsPerProvider,2);
  assert.ok(result.details.recoveryPlan.stages.includes('signed-update-if-needed'));
});

test('external fallback is rejected without native repair evidence',()=>{
  const result=selectVirtualizationProvider({
    taskClass:'computer-use-automation',
    nativeProviders:[],
    externalFallback:{reason:'native-capability-unavailable',auditId:'a',nativeCapabilityGapRecord:'g',
      securityEquivalentOrStronger:true,
      nativeFailures:[{id:'ekodi-native-remote-computer',reason:'native-capability-unavailable'}]},
    externalProviders:[{id:'external',enabled:true,approved:true,securityEquivalentOrStronger:true}]
  });
  assert.equal(result.code,'EXTERNAL_FALLBACK_NATIVE_REPAIR_REQUIRED');
  assert.deepEqual(result.details.missingRecoveryEvidence,['ekodi-native-remote-computer']);
});
