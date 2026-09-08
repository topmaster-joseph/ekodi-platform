import test from 'node:test';
import assert from 'node:assert/strict';
import registry from '../config/capability-registry.json' with { type:'json' };
import {
  SOVEREIGN_CAPABILITY_FABRIC,
  authorizeCapabilityInvocation,
  compileCapabilityContract,
  listCapabilityContracts,
} from '../sovereign-capability-fabric.js';

test('Capability Registry is the one 8G contract source for all adapters',()=>{
  assert.equal(registry.version,'3.1.0');
  assert.equal(SOVEREIGN_CAPABILITY_FABRIC.registryVersion,registry.version);
  assert.equal(SOVEREIGN_CAPABILITY_FABRIC.contract,'ekodi.sovereign-capability.v1');
  assert.ok(registry.capabilities.length >= 27);
  assert.equal(registry.fabricCapabilities.length,4);
  assert.equal(listCapabilityContracts().length,registry.capabilities.length+registry.fabricCapabilities.length);
});

test('MCP exposes only explicitly allowed capabilities with bounded command delegation',()=>{
  for(const id of ['identity.self.read','ai.personal.status.read','services.membership.read']){
    const contract=compileCapabilityContract(id);
    assert.equal(contract.actionTier,'observe');
    assert.equal(contract.exposure.mcp,true);
    assert.equal(contract.humanGate,false);
  }
  const delegate=compileCapabilityContract('ai.command.delegate');
  assert.equal(delegate.actionTier,'assist');
  assert.equal(delegate.exposure.mcp,true);
  assert.equal(delegate.humanGate,false);
  assert.equal(delegate.scope,'person');
  assert.equal(compileCapabilityContract('creator.publish').exposure.mcp,false);
});
test('external protocol invocation needs a trusted client and canonical person',()=>{
  let decision=authorizeCapabilityInvocation({capabilityId:'identity.self.read',channel:'mcp',trustTier:'unknown',personId:'p1'});
  assert.equal(decision.allowed,false);
  assert.equal(decision.reason,'client_not_trusted');

  decision=authorizeCapabilityInvocation({capabilityId:'identity.self.read',channel:'mcp',trustTier:'approved_external',personId:'p1'});
  assert.equal(decision.allowed,true);
  assert.equal(decision.contract.id,'identity.self.read');
});

test('high-impact capabilities remain behind human gate even if a future adapter is exposed',()=>{
  const publish=compileCapabilityContract('creator.publish');
  assert.equal(publish.risk,'high');
  assert.equal(publish.humanGate,true);
  const decision=authorizeCapabilityInvocation({
    capabilityId:'creator.publish',channel:'web',trustTier:'first_party',personId:'p1',workspaceId:'w1',role:'owner',
  });
  assert.equal(decision.allowed,false);
  assert.equal(decision.reason,'human_gate_required');
});
