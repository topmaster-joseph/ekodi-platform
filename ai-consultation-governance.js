const DECISION_STATUSES = new Set(['not_required', 'single_review', 'multi_consult', 'reverified']);
const OUTCOME_STATUSES = new Set(['not_required', 'single_review', 'multi_consult', 'reverified', 'partial', 'failed', 'pending']);
const HIGH_IMPACT_CATEGORIES = Object.freeze([
  'authentication', 'authorization', 'security', 'secrets', 'payment', 'finance',
  'permission', 'data_migration', 'destructive_data', 'production', 'deployment', 'dns',
]);
const PRIVATE_REASONING_KEY = /(chain.?of.?thought|raw.?reasoning|reasoning|private.?thought|scratchpad|internal.?analysis|\bcot\b)/i;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function bool(value) {
  return value === true;
}

function unique(values) {
  return Object.freeze([...new Set((values || []).filter(Boolean))]);
}

function normalizeRisk(value) {
  const risk = text(value || 'normal', 20).toLowerCase();
  return ['low', 'normal', 'high', 'critical'].includes(risk) ? risk : 'normal';
}

function haystack(input = {}) {
  const target = input.target && typeof input.target === 'object' ? input.target : {};
  const event = input.event && typeof input.event === 'object' ? input.event : {};
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  return [
    input.goal, input.taskName, input.category, input.changeClass,
    target.service, target.capability, target.surface,
    event.kind, event.changeClass, event.summary,
    context.category, context.changeClass, context.operation,
  ].map(value => text(value, 1000).toLowerCase()).filter(Boolean).join(' ');
}

function detectedCategories(input = {}) {
  const source = haystack(input);
  const tests = [
    ['authentication', /(auth|oauth|login|sign.?in|인증|로그인)/],
    ['authorization', /(authorization|access control|rbac|권한|접근제어)/],
    ['security', /(security|vulnerab|보안|취약)/],
    ['secrets', /(secret|credential|token|api.?key|비밀|자격증명)/],
    ['payment', /(payment|billing|checkout|결제|청구)/],
    ['finance', /(finance|accounting|settlement|정산|회계|재무)/],
    ['permission', /(permission|privilege|권한)/],
    ['data_migration', /(migration|schema change|data move|마이그레이션|스키마 변경)/],
    ['destructive_data', /(delete|drop table|truncate|destructive|삭제|파괴적)/],
    ['production', /(production|prod\b|live service|운영배포|운영 반영|실서비스)/],
    ['deployment', /(deploy|release|배포|릴리스)/],
    ['dns', /(dns|nameserver|도메인 이전|네임서버)/],
  ];
  return unique(tests.filter(([, regex]) => regex.test(source)).map(([name]) => name));
}

function mutationRequested(input = {}) {
  if (bool(input.mutation) || bool(input.context?.mutation)) return true;
  if (input.mutation === false || input.context?.mutation === false) return false;
  const source = haystack(input);
  return /(create|write|update|modify|change|fix|patch|merge|deploy|release|delete|migrate|rotate|revoke|구축|생성|작성|수정|변경|업데이트|적용|병합|배포|삭제|이전|교체|폐기)/i.test(source);
}

function readOnlyRequested(input = {}) {
  if (bool(input.readOnly) || bool(input.context?.readOnly)) return true;
  if (input.readOnly === false || input.context?.readOnly === false) return false;
  if (mutationRequested(input)) return false;
  const source = haystack(input);
  return /(get|list|read|view|show|status|inspect|check|summari[sz]e|조회|읽|보기|상태|확인|점검|요약|설명)/i.test(source);
}

function hasReverificationSignal(input = {}) {
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  return bool(input.validationFailed)
    || bool(input.dissent)
    || bool(input.highUncertainty)
    || bool(context.validationFailed)
    || bool(context.dissent)
    || bool(context.highUncertainty)
    || normalizeRisk(input.risk) === 'critical';
}

function normalizeRouterScore(input = {}) {
  const raw = input.routerScore ?? input.context?.routerScore ?? input.governance?.routerScore;
  const number = Number(raw);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}

function decisionShape(status, input, reasonCodes, categories) {
  const risk = normalizeRisk(input.risk);
  const routerScore = normalizeRouterScore(input);
  const display = {
    not_required: '협의 필요없음',
    single_review: '단일 검토',
    multi_consult: '에코디 AI 협의 필요',
    reverified: '협의 후 재검증 필요',
  }[status];
  const requirements = {
    not_required: { consultationProviders: 0, minProviderDiversity: 0, rounds: 0, sentinel: false, reverifier: false },
    single_review: { consultationProviders: 1, minProviderDiversity: 1, rounds: 1, sentinel: true, reverifier: false },
    multi_consult: { consultationProviders: 2, minProviderDiversity: 2, rounds: 1, sentinel: true, reverifier: false },
    reverified: { consultationProviders: 2, minProviderDiversity: 2, rounds: 2, sentinel: true, reverifier: true },
  }[status];
  return Object.freeze({
    schemaVersion: 1,
    policyVersion: 'AI-CONSULT-001/v1',
    status,
    displayLabel: display,
    risk,
    routerScore,
    forced: categories.some(category => HIGH_IMPACT_CATEGORIES.includes(category)),
    categories,
    reasonCodes: unique(reasonCodes),
    requirements: Object.freeze(requirements),
  });
}

export function decideEkodiConsultation(input = {}) {
  const risk = normalizeRisk(input.risk);
  const categories = detectedCategories(input);
  const forced = categories.some(category => HIGH_IMPACT_CATEGORIES.includes(category));
  const routerScore = normalizeRouterScore(input);
  const reasons = [];

  if (hasReverificationSignal(input)) {
    reasons.push(risk === 'critical' ? 'critical_risk' : 'reverification_signal');
    if (forced) reasons.push('high_impact_category');
    return decisionShape('reverified', input, reasons, categories);
  }
  if (routerScore !== null && routerScore < 55) {
    reasons.push('router_confidence_low');
    if (forced || risk === 'high') reasons.push('high_impact_category');
    return decisionShape(forced || risk === 'high' ? 'reverified' : 'multi_consult', input, reasons, categories);
  }
  if (forced || risk === 'high') {
    reasons.push(forced ? 'high_impact_category' : 'high_risk');
    return decisionShape('multi_consult', input, reasons, categories);
  }
  if (readOnlyRequested(input) && !mutationRequested(input)) {
    reasons.push('read_only_or_deterministic');
    return decisionShape('not_required', input, reasons, categories);
  }
  if ((bool(input.routine) || bool(input.context?.routine)) && !mutationRequested(input)) {
    reasons.push('routine_non_mutating');
    return decisionShape('not_required', input, reasons, categories);
  }
  reasons.push(mutationRequested(input) ? 'reversible_or_standard_change' : 'general_uncertainty_review');
  return decisionShape('single_review', input, reasons, categories);
}

function publicValue(value, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => publicValue(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (PRIVATE_REASONING_KEY.test(key)) continue;
    output[key] = publicValue(item, depth + 1);
  }
  return output;
}

function normalizeRoleRecord(item = {}) {
  return Object.freeze({
    role: text(item.role, 80) || 'unknown',
    provider: text(item.provider, 80) || null,
    ok: item.ok === true,
    mode: text(item.mode, 40) || null,
  });
}

export function summarizeConsultationExecution(result = {}) {
  const decision = result?.plan?.consultationDecision || result?.consultationDecision || {};
  const specialists = Array.isArray(result.specialists) ? result.specialists.map(normalizeRoleRecord) : [];
  const sentinel = result.sentinel ? normalizeRoleRecord(result.sentinel) : null;
  const reverifier = result.reverifier ? normalizeRoleRecord(result.reverifier) : null;
  const allCalls = [...specialists, ...(sentinel ? [sentinel] : []), ...(reverifier ? [reverifier] : [])]
    .filter(item => item.provider && item.mode === 'ai');
  const consultationCalls = allCalls.filter(item => item.role !== 'operator' && item.role !== 'builder');
  const actualProviders = unique(allCalls.map(item => item.provider));
  const consultationProviders = unique(consultationCalls.map(item => item.provider));
  const failedCalls = allCalls.filter(item => !item.ok);
  const planned = DECISION_STATUSES.has(decision.status) ? decision.status : 'single_review';

  let status = 'pending';
  if (planned === 'not_required') status = 'not_required';
  else if (!allCalls.length) status = 'failed';
  else if (planned === 'single_review') status = sentinel?.ok ? 'single_review' : (actualProviders.length ? 'partial' : 'failed');
  else if (planned === 'multi_consult') {
    status = sentinel?.ok && actualProviders.length >= Number(decision.requirements?.minProviderDiversity || 2)
      ? 'multi_consult'
      : actualProviders.length ? 'partial' : 'failed';
  } else if (planned === 'reverified') {
    status = sentinel?.ok && reverifier?.ok && actualProviders.length >= Number(decision.requirements?.minProviderDiversity || 2)
      ? 'reverified'
      : actualProviders.length ? 'partial' : 'failed';
  }
  if (failedCalls.length && !['failed', 'not_required'].includes(status)) status = 'partial';

  const displayLabel = {
    not_required: '협의 필요없음',
    single_review: '단일 검토 완료',
    multi_consult: '에코디 AI 협의 완료',
    reverified: '협의 후 재검증 완료',
    partial: '부분 협의',
    failed: '협의 실패',
    pending: '협의 대기',
  }[status];

  return Object.freeze({
    schemaVersion: 1,
    status,
    displayLabel,
    plannedStatus: planned,
    actualCallCount: allCalls.length,
    actualProviderCount: actualProviders.length,
    actualProviders,
    consultationCallCount: consultationCalls.length,
    consultationProviderCount: consultationProviders.length,
    consultationProviders,
    rounds: planned === 'reverified' && reverifier?.ok ? 2 : consultationCalls.length ? 1 : 0,
    rereviewCount: reverifier?.ok ? 1 : 0,
    roles: Object.freeze(allCalls.map(item => Object.freeze({ role: item.role, provider: item.provider, ok: item.ok }))),
    failures: Object.freeze(failedCalls.map(item => Object.freeze({ role: item.role, provider: item.provider }))),
  });
}

function receiptLinks(task = {}, result = {}) {
  const context = task.context && typeof task.context === 'object' ? task.context : {};
  const links = context.links && typeof context.links === 'object' ? context.links : {};
  const taskId = text(task.id || result.taskId, 120);
  return Object.freeze({
    task: taskId ? `/api/control/ai/v8/tasks/${encodeURIComponent(taskId)}` : null,
    detail: taskId ? `/api/control/ai/v8/tasks/${encodeURIComponent(taskId)}/consultation` : null,
    branch: text(links.branch || context.branch, 240) || null,
    pullRequest: text(links.pullRequest || links.pr || context.pullRequest || context.pr, 240) || null,
    deployment: text(links.deployment || context.deployment, 240) || null,
    productionVerification: text(links.productionVerification || context.productionVerification, 240) || null,
  });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function stableStringify(value) {
  return JSON.stringify(stable(value));
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

export async function buildEkodiConsultationReceipt({ task = {}, result = {}, attempt = 1, createdAt, previousHash = null } = {}) {
  const decision = publicValue(result?.plan?.consultationDecision || result?.consultationDecision || decideEkodiConsultation({
    goal: task.goal,
    risk: task.risk,
    target: task.target,
    context: task.context,
    event: task.event,
  }));
  const execution = summarizeConsultationExecution({ ...result, consultationDecision: decision });
  const traceId = text(result.traceId || task.context?.traceId || `${task.id || result.taskId || 'task'}:consultation:${attempt}`, 180);
  const timestamp = text(createdAt || new Date().toISOString(), 80);
  const base = {
    schemaVersion: 1,
    receiptType: 'ekodi-ai-consultation',
    traceId,
    taskId: text(task.id || result.taskId, 120) || null,
    attempt: Math.max(1, Number(attempt) || 1),
    policyVersion: decision.policyVersion || 'AI-CONSULT-001/v1',
    decision,
    execution,
    consensus: publicValue(result.consensus || null),
    dissent: publicValue(result.dissent || null),
    substitutions: publicValue(result.substitutions || []),
    adoptedRecommendations: publicValue(result.adoptedRecommendations || []),
    rejectedRecommendations: publicValue(result.rejectedRecommendations || []),
    links: receiptLinks(task, result),
    previousHash: text(previousHash, 128) || null,
    createdAt: timestamp,
    privacy: Object.freeze({ privateReasoningExcluded: true, structuredEvidenceOnly: true }),
  };
  const hash = await sha256Hex(stableStringify(base));
  return Object.freeze({ ...base, hashAlgorithm: hash.startsWith('fnv1a-') ? 'FNV-1a-fallback' : 'SHA-256', hash });
}

export function sanitizeConsultationPublicValue(value) {
  return publicValue(value);
}

export const EKODI_AI_CONSULTATION = Object.freeze({
  version: '1.0.0',
  policy: 'AI-CONSULT-001',
  decisionStatuses: Object.freeze([...DECISION_STATUSES]),
  outcomeStatuses: Object.freeze([...OUTCOME_STATUSES]),
  highImpactCategories: HIGH_IMPACT_CATEGORIES,
  principle: 'consult-only-as-needed-prove-actual-consultation-never-expose-private-reasoning',
});
