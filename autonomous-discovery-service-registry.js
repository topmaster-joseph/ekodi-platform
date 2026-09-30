const DISCOVERY_MONITORED_STATUSES = new Set(['live', 'beta']);
const GENERIC_DISCOVERY_WORDS = new Set([
  'ekodi', 'platform', 'service', 'services', 'system', 'systems', 'ai', 'deploy', 'deployment',
  'release', 'production', 'workflow', 'guard', 'check', 'validate', 'validation', 'test', 'tests',
]);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeService(service = {}) {
  const id = normalizeText(service.id).replace(/\s+/g, '-');
  const sourceUrl = String(service.url || (service.domain ? `https://${service.domain}` : '')).trim();
  let parsed = null;
  try { parsed = new URL(sourceUrl); } catch {}
  const status = normalizeText(service.status || 'planned').replace(/\s+/g, '-');
  const productionVerified = service.productionVerified === true;
  const userVisible = service.userVisible !== false;
  const monitorable = userVisible && productionVerified && DISCOVERY_MONITORED_STATUSES.has(status);
  return Object.freeze({
    id,
    name: String(service.name || '').trim(),
    nameEn: String(service.nameEn || '').trim(),
    label: String(service.label || '').trim(),
    url: parsed?.toString() || sourceUrl,
    domain: String(parsed?.hostname || service.domain || '').trim().toLowerCase(),
    pathname: String(parsed?.pathname || '/').replace(/\/+$/, '') || '/',
    category: String(service.category || service.group || '').trim().toLowerCase(),
    status,
    productionVerified,
    userVisible,
    monitorable,
  });
}

export function buildAutonomousDiscoveryServiceRegistry(config = {}) {
  const services = Array.isArray(config) ? config : Array.isArray(config.services) ? config.services : [];
  const normalized = services
    .map(normalizeService)
    .filter(service => service.userVisible && /^[a-z0-9][a-z0-9-]{0,63}$/.test(service.id));
  const seen = new Set();
  return Object.freeze(normalized.filter((service) => {
    if (seen.has(service.id)) return false;
    seen.add(service.id);
    return true;
  }));
}

function aliasesForService(service = {}) {
  const aliases = new Set([service.id]);
  for (const source of [service.nameEn, service.label, service.domain, service.pathname]) {
    const normalized = normalizeText(source);
    for (const word of normalized.split(/\s+/).filter(Boolean)) {
      if (word.length >= 3 && !GENERIC_DISCOVERY_WORDS.has(word)) aliases.add(word);
    }
  }
  const pathSegments = String(service.pathname || '')
    .toLowerCase()
    .split('/')
    .map(value => value.trim())
    .filter(value => value.length >= 3);
  for (const segment of pathSegments) aliases.add(segment);
  const hostLead = String(service.domain || '').split('.')[0];
  if (hostLead && hostLead !== 'www' && hostLead !== 'ekodi') aliases.add(hostLead);
  return [...aliases].filter(Boolean);
}

function containsAlias(haystack, alias) {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return false;
  const words = new Set(haystack.split(/\s+/).filter(Boolean));
  if (words.has(normalizedAlias)) return true;
  const compactHaystack = haystack.replace(/\s+/g, '');
  const compactAlias = normalizedAlias.replace(/\s+/g, '');
  return compactAlias.length >= 4 && compactHaystack.includes(compactAlias);
}

export function inferAutonomousDiscoveryServiceId(evidence = {}, registry = []) {
  const known = new Set(registry.map(service => service.id));
  const explicit = normalizeText(evidence.serviceId || evidence.service?.id).replace(/\s+/g, '-');
  if (explicit && known.has(explicit)) return explicit;

  const haystack = normalizeText([
    evidence.workflowName,
    evidence.name,
    evidence.workflowPath,
    evidence.path,
    evidence.target,
  ].filter(Boolean).join(' '));
  if (!haystack) return null;

  const scored = registry.map((service) => {
    let score = 0;
    if (containsAlias(haystack, service.id)) score += 50;
    for (const alias of aliasesForService(service)) {
      if (alias === service.id) continue;
      if (containsAlias(haystack, alias)) score += 10;
    }
    return { id: service.id, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].id;
}

export function scopeAutonomousDiscoveryTarget(serviceId, target) {
  const normalizedId = normalizeText(serviceId).replace(/\s+/g, '-');
  const normalizedTarget = String(target || 'platform').trim() || 'platform';
  return normalizedId ? `service:${normalizedId}:${normalizedTarget}` : normalizedTarget;
}
