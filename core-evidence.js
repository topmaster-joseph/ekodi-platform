export const CORE_EVIDENCE_POLICY = Object.freeze({
  version: '1.0.0',
  model: 'domain-owned-evidence-portable-provenance',
  defaultVisibility: 'workspace',
  authorityLevels: Object.freeze(['official','primary','verified-secondary','community','user-provided','unknown']),
});

const AUTHORITY = new Set(CORE_EVIDENCE_POLICY.authorityLevels);
const VISIBILITY = new Set(['public','workspace','private']);

function clean(value, max = 500) { return String(value ?? '').trim().slice(0, max); }

export function normalizeCoreEvidence(input = {}) {
  const sourceUrl = clean(input.sourceUrl || input.url, 2000);
  let host = '';
  if (sourceUrl) {
    try { host = new URL(sourceUrl).hostname.toLowerCase(); } catch { throw new TypeError('Evidence sourceUrl must be a valid URL'); }
  }
  const authority = AUTHORITY.has(input.authority) ? input.authority : 'unknown';
  const visibility = VISIBILITY.has(input.visibility) ? input.visibility : CORE_EVIDENCE_POLICY.defaultVisibility;
  const record = {
    schemaVersion: 1,
    evidenceId: clean(input.evidenceId || input.id, 160),
    serviceId: clean(input.serviceId, 80).toLowerCase(),
    workspaceKey: clean(input.workspaceKey, 240),
    title: clean(input.title, 500),
    sourceUrl: sourceUrl || null,
    sourceHost: host || null,
    authority,
    official: authority === 'official' || Boolean(input.official),
    publishedAt: clean(input.publishedAt, 40) || null,
    observedAt: clean(input.observedAt, 40) || new Date().toISOString(),
    visibility,
    contentHash: clean(input.contentHash, 160) || null,
    excerpt: clean(input.excerpt, 1200) || null,
    suppliedBy: clean(input.suppliedBy, 160) || null,
  };
  if (!record.serviceId) throw new TypeError('Evidence serviceId is required');
  if (!record.title) throw new TypeError('Evidence title is required');
  if (record.visibility !== 'public' && !record.workspaceKey) throw new TypeError('Non-public evidence requires workspaceKey');
  return Object.freeze(record);
}

export function evidenceFreshness(evidence, { now = Date.now(), maxAgeDays = 30 } = {}) {
  const stamp = Date.parse(evidence?.publishedAt || evidence?.observedAt || '');
  if (!Number.isFinite(stamp)) return Object.freeze({ fresh: false, ageDays: null, reason: 'timestamp_unknown' });
  const ageDays = Math.max(0, Math.floor((now - stamp) / 86_400_000));
  return Object.freeze({ fresh: ageDays <= Math.max(0, Number(maxAgeDays) || 0), ageDays, reason: ageDays <= maxAgeDays ? 'within_window' : 'stale' });
}

export function canShareEvidence(evidence, targetWorkspaceKey = '') {
  if (!evidence) return false;
  if (evidence.visibility === 'public') return true;
  return Boolean(targetWorkspaceKey && evidence.workspaceKey === targetWorkspaceKey);
}
