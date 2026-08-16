const DEFAULT_LIMIT = 3;

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ko-KR');
}

function unique(values) {
  return [...new Set(values)];
}

function requireCatalog(catalog = {}) {
  const capabilities = Array.isArray(catalog.capabilities?.capabilities)
    ? catalog.capabilities.capabilities
    : [];
  const packs = Array.isArray(catalog.packs?.packs) ? catalog.packs.packs : [];
  return { capabilities, packs, defaultPack: catalog.packs?.defaultPack || '' };
}

export function scoreWorkspacePack({ text = '', audience = 'person' } = {}, pack = {}) {
  const query = normalize(text);
  const normalizedAudience = normalize(audience);
  const signals = Array.isArray(pack.signals) ? pack.signals : [];
  const audiences = Array.isArray(pack.audiences) ? pack.audiences : [];
  const matchedSignals = signals.filter(signal => query && query.includes(normalize(signal)));
  const audienceMatch = audiences.map(normalize).includes(normalizedAudience);

  return {
    packId: String(pack.id || ''),
    score: matchedSignals.length * 10 + (audienceMatch ? 2 : 0),
    matchedSignals,
    audienceMatch,
  };
}

export function recommendWorkspacePacks(input = {}, packsConfig = {}, options = {}) {
  const packs = Array.isArray(packsConfig.packs) ? packsConfig.packs : [];
  const limit = Math.max(1, Math.min(Number(options.limit) || DEFAULT_LIMIT, 10));
  const ranked = packs
    .map(pack => ({ pack, ...scoreWorkspacePack(input, pack) }))
    .filter(item => item.matchedSignals.length > 0)
    .sort((a, b) => b.score - a.score || String(a.pack.id).localeCompare(String(b.pack.id), 'ko'))
    .slice(0, limit)
    .map(({ pack, score, matchedSignals, audienceMatch }) => ({
      id: pack.id,
      name: pack.name,
      score,
      matchedSignals,
      audienceMatch,
    }));

  if (ranked.length) return ranked;

  const fallback = packs.find(pack => pack.id === packsConfig.defaultPack) || packs[0];
  return fallback ? [{ id: fallback.id, name: fallback.name, score: 0, matchedSignals: [], audienceMatch: true }] : [];
}

export function resolveCapabilityIds(packIds = [], packsConfig = {}, requestedCapabilities = []) {
  const packs = Array.isArray(packsConfig.packs) ? packsConfig.packs : [];
  const selected = new Set(packIds);
  const fromPacks = packs
    .filter(pack => selected.has(pack.id))
    .flatMap(pack => Array.isArray(pack.capabilities) ? pack.capabilities : []);
  return unique([...fromPacks, ...requestedCapabilities].map(String).filter(Boolean));
}

export function buildWorkspaceBlueprint(input = {}, catalog = {}, options = {}) {
  const { capabilities, packs, defaultPack } = requireCatalog(catalog);
  const capabilityById = new Map(capabilities.map(capability => [capability.id, capability]));
  const explicitPackIds = Array.isArray(input.packIds) ? input.packIds.map(String) : [];
  const recommendations = explicitPackIds.length
    ? explicitPackIds.map(id => ({ id, score: null, matchedSignals: [], audienceMatch: null }))
    : recommendWorkspacePacks(input, { packs, defaultPack }, options);
  const packIds = unique(recommendations.map(item => item.id));
  const capabilityIds = resolveCapabilityIds(
    packIds,
    { packs },
    Array.isArray(input.requestedCapabilities) ? input.requestedCapabilities : [],
  );
  const resolved = capabilityIds.map(id => capabilityById.get(id)).filter(Boolean);
  const unresolved = capabilityIds.filter(id => !capabilityById.has(id));
  const humanGateCapabilities = resolved.filter(capability => capability.actionTier === 'human_gate').map(capability => capability.id);
  const reversibleCapabilities = resolved.filter(capability => capability.actionTier === 'execute_reversible').map(capability => capability.id);
  const showroomEntries = unique(
    resolved
      .map(capability => capability.showroom?.serviceId)
      .filter(Boolean),
  );

  return {
    schemaVersion: '1.0.0',
    home: catalog.capabilities?.surfacePolicy?.defaultHome || 'https://my.ekodi.kr',
    audience: normalize(input.audience || 'person'),
    packIds,
    recommendations,
    capabilityIds: resolved.map(capability => capability.id),
    unresolvedCapabilityIds: unresolved,
    humanGateCapabilities,
    reversibleCapabilities,
    showroomEntries,
    dedicatedSiteRecommended: input.dedicatedSite === true,
    principle: 'capability_first_site_on_demand',
  };
}
