import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

export async function readCapabilityLibrarySources() {
  const [capabilities, packs, governance, ecosystem] = await Promise.all([
    readJson('config/ai-capabilities.json'),
    readJson('config/workspace-packs.json'),
    readJson('config/ai-mission-governance.json'),
    readJson('config/ecosystem-services.json'),
  ]);
  return { capabilities, packs, governance, ecosystem };
}

export function validateCapabilityLibrary({ capabilities: capabilityConfig = {}, packs: packConfig = {}, governance = {}, ecosystem = {} } = {}) {
  const errors = [];
  const idPattern = /^[a-z][a-z0-9.-]*$/;
  const allowedSurfaces = new Set(['my', 'workspace', 'showroom', 'dedicated']);
  const allowedMaturity = new Set(['contract', 'service-backed', 'service-backed-readonly']);
  const allowedActionTiers = new Set(Object.keys(governance.actionTiers ?? {}));
  const allowedAgents = new Set(Object.keys(governance.agents ?? {}));
  const publicServices = new Set((ecosystem.services ?? []).map(service => service.id));
  const capabilityIds = new Set();
  const packIds = new Set();
  const usedCapabilities = new Set();

  if (capabilityConfig.surfacePolicy?.defaultHome !== 'https://my.ekodi.kr') {
    errors.push('Capability Library defaultHome must remain https://my.ekodi.kr.');
  }
  if (capabilityConfig.surfacePolicy?.specialistSites !== 'showroom_and_entry') {
    errors.push('Specialist sites must remain showroom_and_entry surfaces.');
  }

  for (const capability of capabilityConfig.capabilities ?? []) {
    const id = String(capability?.id ?? '');
    if (!idPattern.test(id)) errors.push(`Capability id "${id}" is invalid.`);
    if (capabilityIds.has(id)) errors.push(`Capability id "${id}" is duplicated.`);
    capabilityIds.add(id);

    if (!capability?.name || !capability?.description || !capability?.domain) {
      errors.push(`Capability "${id}" is missing name, description, or domain.`);
    }
    if (!allowedAgents.has(capability?.ownerAgent)) {
      errors.push(`Capability "${id}" references unknown governance agent "${capability?.ownerAgent ?? ''}".`);
    }
    if (!allowedActionTiers.has(capability?.actionTier)) {
      errors.push(`Capability "${id}" references unknown action tier "${capability?.actionTier ?? ''}".`);
    }
    if (!allowedMaturity.has(capability?.maturity)) {
      errors.push(`Capability "${id}" has unsupported maturity "${capability?.maturity ?? ''}".`);
    }

    const surfaces = Array.isArray(capability?.surfaces) ? capability.surfaces : [];
    if (!surfaces.length) errors.push(`Capability "${id}" must expose at least one surface.`);
    for (const surface of surfaces) {
      if (!allowedSurfaces.has(surface)) errors.push(`Capability "${id}" has unknown surface "${surface}".`);
    }

    const showroomService = capability?.showroom?.serviceId;
    if (showroomService) {
      if (!surfaces.includes('showroom')) errors.push(`Capability "${id}" has a showroom service but no showroom surface.`);
      if (!publicServices.has(showroomService)) errors.push(`Capability "${id}" points to unknown showroom service "${showroomService}".`);
    }
  }

  for (const pack of packConfig.packs ?? []) {
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

  if (!packIds.has(packConfig.defaultPack)) {
    errors.push(`Default workspace pack "${packConfig.defaultPack ?? ''}" does not exist.`);
  }

  for (const capabilityId of capabilityIds) {
    if (!usedCapabilities.has(capabilityId)) errors.push(`Capability "${capabilityId}" is not used by any workspace pack.`);
  }

  return {
    errors,
    capabilityCount: capabilityIds.size,
    packCount: packIds.size,
    humanGateCount: (capabilityConfig.capabilities ?? []).filter(item => item.actionTier === 'human_gate').length,
  };
}

async function main() {
  const sources = await readCapabilityLibrarySources();
  const result = validateCapabilityLibrary(sources);
  if (result.errors.length) {
    console.error('EKODI AI Capability Library validation failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`EKODI AI Capability Library OK: ${result.capabilityCount} capabilities, ${result.packCount} packs, ${result.humanGateCount} human-gated capabilities.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) await main();
