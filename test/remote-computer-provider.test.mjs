import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REMOTE_COMPUTER_PROVIDER_ID,
  REMOTE_COMPUTER_OPERATIONS,
  operationPolicy,
  planRemoteComputerExecution,
  remoteComputerProviderDescriptor,
  validateRemoteComputerReceipt,
} from '../remote-computer-provider.js';

test('native remote computer provider is provider-neutral and native-first', () => {
  const descriptor = remoteComputerProviderDescriptor();
  assert.equal(descriptor.implementationId, REMOTE_COMPUTER_PROVIDER_ID);
  assert.equal(descriptor.capabilityId, 'device.remote-computer');
  assert.equal(descriptor.contractVersion, 'ekodi.capability-provider.v1');
  assert.equal(descriptor.nativeFirst, true);
  assert.equal(descriptor.persistentAgentShell, false);
  assert.equal(descriptor.directHostMutation, false);
});

test('only bounded observe operations are allowed directly on the host', () => {
  for (const operation of ['computer.system.read','computer.process.list','computer.agent.status']) {
    assert.equal(operationPolicy(operation).hostMode, 'allow');
    assert.equal(operationPolicy(operation).mutation, false);
  }
  for (const operation of ['computer.files.read','computer.files.write','computer.terminal.exec']) {
    assert.equal(operationPolicy(operation).hostMode, 'isolated-required');
  }
  assert.equal(REMOTE_COMPUTER_OPERATIONS['computer.desktop.input'].hostMode, 'consent-required');
});

test('router prefers EKODI native provider when its bounded capability is ready', () => {
  const plan = planRemoteComputerExecution({
    operation:'computer.process.list',
    native:{ state:'online', capabilities:{ processRead:true } },
    externalProviders:[{ id:'rdc-adapter', state:'online', securityEquivalent:true, operations:['computer.process.list'] }],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.nativePreferred, true);
  assert.equal(plan.candidates[0].providerId, REMOTE_COMPUTER_PROVIDER_ID);
});

test('isolated operations do not run natively until an isolated executor is verified', () => {
  const blocked = planRemoteComputerExecution({
    operation:'computer.terminal.exec',
    native:{ state:'online', capabilities:{ isolatedCommand:true } },
  });
  assert.equal(blocked.ok, false);

  const allowed = planRemoteComputerExecution({
    operation:'computer.terminal.exec',
    native:{ state:'online', capabilities:{ isolatedCommand:true } },
    isolatedExecutorVerified:true,
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.nativePreferred, true);
});

test('external failover is accepted only when it declares equivalent security', () => {
  const plan = planRemoteComputerExecution({
    operation:'computer.system.read',
    native:{ state:'offline', capabilities:{ computerRead:true } },
    externalProviders:[
      { id:'unsafe', state:'online', securityEquivalent:false, operations:['computer.system.read'] },
      { id:'safe', state:'online', securityEquivalent:true, operations:['computer.system.read'] },
    ],
  });
  assert.deepEqual(plan.candidates.map(item => item.providerId), ['safe']);
});

test('receipts fail closed on authority, credential or production-boundary violations', () => {
  assert.equal(validateRemoteComputerReceipt({
    requestId:'r1', deviceId:'d1', operation:'computer.system.read', status:'ok',
    authorityExpanded:false, reusableCredentialExposed:false, directProductionMutation:false,
  }).ok, true);
  assert.equal(validateRemoteComputerReceipt({
    requestId:'r2', deviceId:'d1', operation:'computer.system.read', status:'ok',
    authorityExpanded:true,
  }).ok, false);
});
