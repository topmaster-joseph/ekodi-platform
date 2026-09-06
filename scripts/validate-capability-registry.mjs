import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

export async function readCapabilityRegistrySources() {
  const [registry, packs, governance, ecosystem, providerContract] = await Promise.all([
    readJson('config/capability-registry.json'),
    readJson('config/workspace-packs.json'),
    readJson('config/ai-mission-governance.json'),
    readJson('config/ecosystem-services.json'),
    readJson('governance/architecture/capability-provider-contract.v1.json'),
  ]);
  return { registry, packs, governance, ecosystem, providerContract };
}

export function validateCapabilityRegistry({ registry = {}, packs = {}, governance = {}, ecosystem = {}, providerContract = {} } = {}) {
  const errors = [];
  const idPattern = /^[a-z][a-z0-9.-]*$/;
  const allowedSurfaces = new Set(['my', 'workspace', 'showroom', 'dedicated']);
  const allowedMaturity = new Set(['contract', 'service-backed', 'service-backed-readonly']);
  const allowedActionTiers = new Set(Object.keys(governance.actionTiers ?? {}));
  const allowedAgents = new Set(Object.keys(governance.agents ?? {}));
  const publicServices = new Set((ecosystem.services ?? []).map(service => service.id));
  const capabilityIds = new Set();
  const fabricCapabilityIds = new Set();
  const packIds = new Set();
  const usedCapabilities = new Set();
  if (registry.name !== 'EKODI Universal Capability Registry') errors.push('Registry name must be canonical.');
  if (registry.providerContract !== providerContract.contractId) errors.push('Registry provider contract must match the active provider contract.');
  if (providerContract.status !== 'active') errors.push('Capability provider contract must remain active.');
  if (registry.generation?.capabilityTarget !== 3 || registry.generation?.northStar !== 8) {
    errors.push('Capability Registry must target Generation 3 while preserving Generation 8 north star.');
  }
  if (registry.intentPolicy?.router !== 'deterministic_first') errors.push('Intent routing must remain deterministic_first by default.');
  if (registry.intentPolicy?.modelMayInventCapabilities !== false) errors.push('Models must never invent unregistered capabilities.');
  if (registry.intentPolicy?.unknownCapabilityBehavior !== 'unresolved_not_guessed') errors.push('Unknown capabilities must remain unresolved rather than guessed.');
  if (registry.surfacePolicy?.defaultHome !== 'https://my.ekodi.kr') errors.push('Default private home must remain My EKODI.');
  if (registry.surfacePolicy?.specialistSites !== 'showroom_and_entry') errors.push('Specialist sites must remain showroom_and_entry surfaces.');

  for (const capability of registry.capabilities ?? []) {
    const id = String(capability?.id ?? '');
    if (!idPattern.test(id)) errors.push(`Capability id "${id}" is invalid.`);
    if (capabilityIds.has(id)) errors.push(`Capability id "${id}" is duplicated.`);
    capabilityIds.add(id);
    if (!capability?.name || !capability?.description || !capability?.domain) errors.push(`Capability "${id}" is missing core metadata.`);
    if (!allowedAgents.has(capability?.ownerAgent)) errors.push(`Capability "${id}" references unknown agent "${capability?.ownerAgent ?? ''}".`);
    if (!allowedActionTiers.has(capability?.actionTier)) errors.push(`Capability "${id}" references unknown action tier "${capability?.actionTier ?? ''}".`);
    if (!allowedMaturity.has(capability?.maturity)) errors.push(`Capability "${id}" has unsupported maturity "${capability?.maturity ?? ''}".`);
    const surfaces = Array.isArray(capability?.surfaces) ? capability.surfaces : [];
    if (!surfaces.length) errors.push(`Capability "${id}" must expose at least one surface.`);
    for (const surface of surfaces) if (!allowedSurfaces.has(surface)) errors.push(`Capability "${id}" has unknown surface "${surface}".`);
    const showroomService = capability?.showroom?.serviceId;
    if (showroomService) {
      if (!surfaces.includes('showroom')) errors.push(`Capability "${id}" has a showroom service but no showroom surface.`);
      if (!publicServices.has(showroomService)) errors.push(`Capability "${id}" points to unknown service "${showroomService}".`);
    }
  }

  for (const capability of registry.fabricCapabilities ?? []) {
    const id = String(capability?.id ?? '');
    if (!idPattern.test(id)) errors.push(`Fabric capability id "${id}" is invalid.`);
    if (capabilityIds.has(id) || fabricCapabilityIds.has(id)) errors.push(`Fabric capability id "${id}" is duplicated.`);
    fabricCapabilityIds.add(id);
    if (!capability?.name || !capability?.description || !capability?.domain) errors.push(`Fabric capability "${id}" is missing core metadata.`);
    if (!allowedAgents.has(capability?.ownerAgent)) errors.push(`Fabric capability "${id}" references unknown agent "${capability?.ownerAgent ?? ''}".`);
    if (!allowedActionTiers.has(capability?.actionTier)) errors.push(`Fabric capability "${id}" references unknown action tier "${capability?.actionTier ?? ''}".`);
    if (!allowedMaturity.has(capability?.maturity)) errors.push(`Fabric capability "${id}" has unsupported maturity "${capability?.maturity ?? ''}".`);
  }

  for (const pack of packs.packs ?? []) {
    const id = String(pack?.id ?? '');
    if (!idPattern.test(id)) errors.push(`Workspace pack id "${id}" is invalid.`);
    if (packIds.has(id)) errors.push(`Workspace pack id "${id}" is duplicated.`);
    packIds.add(id);
    if (!pack?.name || !pack?.description) errors.push(`Workspace pack "${id}" is missing name or description.`);
    if (!Array.isArray(pack?.audiences) || !pack.audiences.length) errors.push(`Workspace pack "${id}" must define audiences.`);
    if (!Array.isArray(pack?.signals) || !pack.signals.length) errors.push(`Workspace pack "${id}" must define matching signals.`);
    const local = new Set();
    for (const capabilityId of pack?.capabilities ?? []) {
      if (local.has(capabilityId)) errors.push(`Workspace pack "${id}" repeats capability "${capabilityId}".`);
      local.add(capabilityId);
      usedCapabilities.add(capabilityId);
      if (!capabilityIds.has(capabilityId)) errors.push(`Workspace pack "${id}" references unknown capability "${capabilityId}".`);
    }
  }
  if (!packIds.has(packs.defaultPack)) errors.push(`Default workspace pack "${packs.defaultPack ?? ''}" does not exist.`);
  for (const capabilityId of capabilityIds) {
    if (!usedCapabilities.has(capabilityId)) errors.push(`Capability "${capabilityId}" is not used by any workspace pack.`);
  }

  return {
    errors,
    capabilityCount: capabilityIds.size,
    fabricCapabilityCount: fabricCapabilityIds.size,
    packCount: packIds.size,
    humanGateCount: (registry.capabilities ?? []).filter(item => item.actionTier === 'human_gate').length,
    reversibleCount: (registry.capabilities ?? []).filter(item => item.actionTier === 'execute_reversible').length,
  };
}

async function main() {
  const sources = await readCapabilityRegistrySources();
  const result = validateCapabilityRegistry(sources);
  if (result.errors.length) {
    console.error('EKODI Universal Capability Registry validation failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`EKODI Universal Capability Registry OK: ${result.capabilityCount} capabilities, ${result.packCount} packs, ${result.reversibleCount} reversible, ${result.humanGateCount} sovereign-gated.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) await main();
