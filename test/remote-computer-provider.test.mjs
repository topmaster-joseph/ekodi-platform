import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REMOTE_COMPUTER_PROVIDER_ID,
  REMOTE_COMPUTER_TRANSITION_POLICY,
  REMOTE_COMPUTER_OPERATIONS,
  operationPolicy,
  planRemoteComputerExecution,
  remoteComputerProviderDescriptor,
  validateRemoteComputerReceipt,
} from '../remote-computer-provider.js';

test('native remote computer provider is native-first, transition-gated and non-disruptive', () => {
  const descriptor = remoteComputerProviderDescriptor();
  assert.equal(descriptor.implementationId, REMOTE_COMPUTER_PROVIDER_ID);
  assert.equal(descriptor.capabilityId, 'device.remote-computer');
  assert.equal(descriptor.contractVersion, 'ekodi.capability-provider.v1');
  assert.equal(descriptor.nativeFirst, true);
  assert.equal(descriptor.transitionStage, 'external-bridge-until-native-verified');
  assert.equal(descriptor.temporaryExternalProviderId, 'remote-desktop-commander');
  assert.equal(descriptor.paidExternalAutoUpgrade, false);
  assert.equal(descriptor.nonDisruptiveDefault, true);
  assert.equal(descriptor.foregroundUserSessionOwnedByUser, true);
  assert.equal(descriptor.minimizedWindowCountsAsIsolation, false);
  assert.equal(descriptor.persistentAgentShell, false);
  assert.equal(descriptor.directHostMutation, false);
  assert.equal(REMOTE_COMPUTER_TRANSITION_POLICY.targetCostModel, 'self-hosted-no-third-party-per-call-fee');
});

test('only bounded observe operations are allowed directly on the host', () => {
  for (const operation of ['computer.system.read','computer.process.list','computer.agent.status']) {
    assert.equal(operationPolicy(operation).hostMode, 'allow');
    assert.equal(operationPolicy(operation).mutation, false);
  }
  for (const operation of [
    'computer.files.read','computer.files.write','computer.terminal.exec',
    'computer.browser.execute','computer.desktop.session.execute',
  ]) {
    assert.equal(operationPolicy(operation).hostMode, 'isolated-required');
  }
  assert.equal(REMOTE_COMPUTER_OPERATIONS['computer.desktop.input'].hostMode, 'consent-required');
});

test('router uses temporary bridge only while native service is not verified', () => {
  const plan = planRemoteComputerExecution({
    operation:'computer.process.list',
    native:{ state:'online', serviceReady:false, capabilities:{ processRead:true } },
    externalProviders:[{
      id:'remote-desktop-commander', state:'online', securityEquivalent:true,
      operations:['computer.process.list'], quotaAvailable:true, temporaryBridge:true,
    }],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.nativePreferred, false);
  assert.equal(plan.transitionStage, 'external-bridge');
  assert.deepEqual(plan.candidates.map(item => item.providerId), ['remote-desktop-commander']);
});

test('router cuts over to native and retires temporary bridge after verification', () => {
  const plan = planRemoteComputerExecution({
    operation:'computer.process.list',
    native:{ state:'online', serviceReady:true, capabilities:{ processRead:true } },
    externalProviders:[{
      id:'remote-desktop-commander', state:'online', securityEquivalent:true,
      operations:['computer.process.list'], quotaAvailable:true, temporaryBridge:true,
    }],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.nativePreferred, true);
  assert.equal(plan.transitionStage, 'native-cutover');
  assert.deepEqual(plan.candidates.map(item => item.providerId), [REMOTE_COMPUTER_PROVIDER_ID]);
});

test('external quota exhaustion and paid upgrade never authorize automatic purchase', () => {
  const quotaBlocked = planRemoteComputerExecution({
    operation:'computer.system.read',
    native:{ state:'offline', serviceReady:false, capabilities:{ computerRead:true } },
    externalProviders:[{
      id:'remote-desktop-commander', state:'online', securityEquivalent:true,
      operations:['computer.system.read'], quotaAvailable:false,
    }],
  });
  assert.equal(quotaBlocked.ok, false);

  const paidBlocked = planRemoteComputerExecution({
    operation:'computer.system.read',
    native:{ state:'offline', serviceReady:false, capabilities:{ computerRead:true } },
    externalProviders:[{
      id:'remote-desktop-commander', state:'online', securityEquivalent:true,
      operations:['computer.system.read'], requiresPaidUpgrade:true, quotaAvailable:true,
    }],
  });
  assert.equal(paidBlocked.ok, false);
  assert.equal(paidBlocked.paidExternalAutoUpgrade, false);
});

test('isolated operations require service readiness and a verified isolated executor', () => {
  const blocked = planRemoteComputerExecution({
    operation:'computer.browser.execute',
    native:{ state:'online', serviceReady:true, capabilities:{ backgroundBrowser:true } },
  });
  assert.equal(blocked.ok, false);

  const allowed = planRemoteComputerExecution({
    operation:'computer.browser.execute',
    native:{ state:'online', serviceReady:true, capabilities:{ backgroundBrowser:true } },
    isolatedExecutorVerified:true,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.nativePreferred, true);
});

test('external failover requires equivalent security', () => {
  const plan = planRemoteComputerExecution({
    operation:'computer.system.read',
    native:{ state:'offline', serviceReady:false, capabilities:{ computerRead:true } },
    externalProviders:[
      { id:'unsafe', state:'online', securityEquivalent:false, operations:['computer.system.read'] },
      { id:'safe', state:'online', securityEquivalent:true, operations:['computer.system.read'] },
    ],
  });
  assert.deepEqual(plan.candidates.map(item => item.providerId), ['safe']);
});

test('receipts fail closed on authority, credential, production or foreground violations', () => {
  assert.equal(validateRemoteComputerReceipt({
    requestId:'r1', deviceId:'d1', operation:'computer.system.read', status:'ok',
    authorityExpanded:false, reusableCredentialExposed:false, directProductionMutation:false,
    foregroundFocusStolen:false, activeUserBrowserProfileReused:false,
  }).ok, true);
  assert.equal(validateRemoteComputerReceipt({
    requestId:'r2', deviceId:'d1', operation:'computer.system.read', status:'ok',
    foregroundFocusStolen:true,
  }).ok, false);
  assert.equal(validateRemoteComputerReceipt({
    requestId:'r3', deviceId:'d1', operation:'computer.browser.execute', status:'ok',
    activeUserBrowserProfileReused:true,
  }).ok, false);
});
