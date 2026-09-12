import { authorizeJubileeSelection, runJubileePolicyGate } from './jubilee-policy-gate.js';

const CONNECTION_KINDS = new Set([
  'expert',
  'mentor',
  'service_provider',
  'community_partner',
]);

export async function prepareJubileeConnection(input = {}) {
  const candidates = normalizeConnectionCandidates(input.candidates);
  if (candidates.length === 0) throw new Error('jubilee_connection_candidates_required');
  if (candidates.length > 50) throw new Error('jubilee_connection_too_many_candidates');

  const gate = await runJubileePolicyGate({
    workspace_id: safeId(input.workspace_id || input.workspaceId),
    purpose: 'people_connection',
    context: normalizeContext(input.request_context || input.context),
    market: {
      externalAlternativesKnown: Boolean(
        input.request_context?.externalAlternativesKnown
        ?? input.market?.externalAlternativesKnown,
      ),
    },
    candidates: candidates.map(toJubileeCandidate),
  });

  const selectedId = String(
    input.user_choice?.candidate_id
    || input.userChoice?.candidateId
    || '',
  ).trim();
  if (!selectedId) {
    return Object.freeze({
      status: 'choice_required',
      gate,
      selection: Object.freeze({ allowed: false, reason: 'user_choice_required' }),
      selectedCandidate: null,
    });
  }

  const selection = authorizeJubileeSelection(gate, selectedId);
  const selectedCandidate = selection.allowed
    ? candidates.find(candidate => candidate.id === selectedId) || null
    : null;

  return Object.freeze({
    status: selection.allowed ? 'ready_to_connect' : 'not_authorized',
    gate,
    selection,
    selectedCandidate,
  });
}

export async function executeJubileeConnection(prepared, connector) {
  if (!prepared?.selection?.allowed || !prepared.selectedCandidate) {
    throw new Error(prepared?.selection?.reason || 'jubilee_connection_not_authorized');
  }
  if (typeof connector !== 'function') throw new Error('jubilee_connection_adapter_required');

  const candidate = prepared.selectedCandidate;
  const result = await connector(Object.freeze({
    candidate: Object.freeze({
      id: candidate.id,
      kind: candidate.kind,
      label: candidate.label,
      source: candidate.source,
    }),
    policyVersion: prepared.selection.policyVersion,
  }));

  return Object.freeze({
    status: 'accepted',
    candidate: Object.freeze({
      id: candidate.id,
      kind: candidate.kind,
      label: candidate.label,
      source: candidate.source,
    }),
    policyVersion: prepared.selection.policyVersion,
    connectionRef: safeConnectionRef(result?.connectionRef),
  });
}

function normalizeConnectionCandidates(value) {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => normalizeConnectionCandidate(raw, index));
}
function normalizeConnectionCandidate(raw, index) {
  const candidate = raw && typeof raw === 'object' ? raw : {};
  const kind = String(candidate.kind || '').trim();
  if (!CONNECTION_KINDS.has(kind)) throw new Error(`invalid_jubilee_connection_kind:${index}`);

  const id = safeRequiredId(candidate.id, `candidate_${index}`);
  const label = safeLabel(candidate.label);
  if (!label) throw new Error(`jubilee_connection_label_required:${index}`);

  const source = candidate.source === 'external' ? 'external' : 'ekodi';
  const commercialRelationship = Boolean(
    candidate.commercial_relationship ?? candidate.commercialRelationship,
  );
  const commercialDisclosure = String(
    candidate.commercial_disclosure ?? candidate.commercialDisclosure ?? '',
  ).trim().slice(0, 300);

  return Object.freeze({
    id,
    kind,
    label,
    source,
    userFit: bounded(candidate.user_fit ?? candidate.userFit),
    serviceQuality: bounded(candidate.service_quality ?? candidate.serviceQuality),
    commercialRelationship,
    commercialDisclosure,
  });
}
function toJubileeCandidate(candidate) {
  return {
    id: candidate.id,
    source: candidate.source,
    userFit: candidate.userFit,
    serviceQuality: candidate.serviceQuality,
    commercialRelationship: candidate.commercialRelationship,
    commercialDisclosure: candidate.commercialDisclosure,
    metadata: {
      kind: candidate.kind,
      label: candidate.label,
    },
  };
}

function normalizeContext(value) {
  const context = value && typeof value === 'object' ? value : {};
  return {
    needSignals: Array.isArray(context.needSignals) ? context.needSignals : [],
    sensitiveTraitInferenceUsed: Boolean(context.sensitiveTraitInferenceUsed),
    publicVulnerabilityLabelRequested: Boolean(context.publicVulnerabilityLabelRequested),
  };
}

function safeId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9:_-]{1,160}$/.test(id) ? id : null;
}
function safeRequiredId(value, fallback) {
  const id = String(value || fallback || '').trim();
  if (!/^[A-Za-z0-9:._-]{1,160}$/.test(id)) throw new Error('invalid_jubilee_connection_candidate_id');
  return id;
}

function safeLabel(value) {
  const label = String(value || '').trim();
  return label ? label.slice(0, 160) : null;
}

function safeConnectionRef(value) {
  const ref = String(value || '').trim();
  if (!ref) return null;
  return /^[A-Za-z0-9:._-]{1,200}$/.test(ref) ? ref : null;
}

function bounded(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
