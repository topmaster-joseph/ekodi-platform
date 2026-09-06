import capabilityRegistry from './config/capability-registry.json' with { type:'json' };
import { evaluateAutonomousOperation } from './sovereign-autonomy-runtime.js';

const clean=value=>String(value??'').trim();
const bool=value=>value===true;
const freeze=value=>Object.freeze(value);

function mergedExposure(base={},override={}){
  return freeze({
    web:bool(override.web??base.web),
    mcp:bool(override.mcp??base.mcp),
    a2a:bool(override.a2a??base.a2a),
    api:bool(override.api??base.api),
    events:bool(override.events??base.events),
  });
}

export const SOVEREIGN_CAPABILITY_FABRIC=freeze({
  version:'1.0.0',
  registryVersion:capabilityRegistry.version,
  contract:capabilityRegistry.fabricPolicy?.contract||'ekodi.sovereign-capability.v1',
  identityAuthority:'ekodi-person',
  principle:'one capability contract, many replaceable adapters',
});
function allFabricCapabilities(){
  return [...(capabilityRegistry.capabilities||[]),...(capabilityRegistry.fabricCapabilities||[])];
}

export function compileCapabilityContract(capabilityId){
  const id=clean(capabilityId);
  const capability=allFabricCapabilities().find(item=>item.id===id);
  if(!capability)return null;
  const policy=capabilityRegistry.fabricPolicy||{};
  const tierPolicy=policy.actionTierPolicy?.[capability.actionTier]||{};
  const override=policy.overrides?.[id]||{};
  return freeze({
    id,
    name:capability.name,
    domain:capability.domain,
    ownerAgent:capability.ownerAgent,
    maturity:capability.maturity,
    actionTier:capability.actionTier,
    scope:override.scope||policy.defaultScope||'person_or_workspace',
    risk:override.risk||tierPolicy.risk||'medium',
    humanGate:override.humanGate??tierPolicy.humanGate??true,
    exposure:mergedExposure(policy.defaultExposure,override.exposure),
    audit:override.audit!==false,
  });
}

export function listCapabilityContracts(){
  return freeze(allFabricCapabilities().map(item=>compileCapabilityContract(item.id)).filter(Boolean));
}
function trustRank(value){
  const tiers=capabilityRegistry.fabricPolicy?.trustTiers||{};
  return Number(tiers[clean(value)]??0);
}

export function authorizeCapabilityInvocation(input={}){
  const contract=compileCapabilityContract(input.capabilityId);
  if(!contract)return freeze({allowed:false,reason:'capability_unregistered'});
  const channel=clean(input.channel||'web');
  if(!contract.exposure[channel])return freeze({allowed:false,reason:`channel_not_exposed:${channel}`,contract});
  if(channel!=='web'&&trustRank(input.trustTier)<2)return freeze({allowed:false,reason:'client_not_trusted',contract});
  if(!clean(input.personId))return freeze({allowed:false,reason:'person_required',contract});
  if(contract.scope==='workspace'&&!clean(input.workspaceId))return freeze({allowed:false,reason:'workspace_required',contract});
  if(contract.humanGate&&input.humanApproved!==true)return freeze({allowed:false,reason:'human_gate_required',contract});

  const autonomous=evaluateAutonomousOperation({
    area:contract.risk==='high'||contract.risk==='critical'?'policy':'agent_tool',
    context:{
      personId:input.personId,
      workspaceId:input.workspaceId||'personal',
      role:input.role||'member',
      capability:contract.id,
      delegated:input.delegated===true,
      reversible:input.reversible===true,
      audited:contract.audit,
      preflightVerified:input.preflightVerified===true,
      contractDeclared:true,
      rollbackDefined:input.rollbackDefined===true,
      verificationDefined:input.verificationDefined===true,
      highImpact:contract.humanGate,
    },
  });
  return freeze({allowed:true,reason:'capability_authorized',contract,autonomy:autonomous});
}
