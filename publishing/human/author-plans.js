// EKODI Human Publishing plans are a service-owned proposed commercial contract,
// NOT a checkout route or authorization source. Production billing remains fail-closed.
export const HUMAN_AUTHOR_PLANS = Object.freeze({
  free: Object.freeze({
    id: 'free', label: '무료 간편 집필', monthlyPriceKrw: 0,
    monthlyNewProjects: 1, mode: 'simple', maxActiveProjects: 1,
    saleReadyProduction: false, conversationalEditorial: false,
    maxSimpleDraftCharacters: 5000,
    status: 'proposed',
  }),
  writer1: Object.freeze({
    id: 'writer1', label: '휴먼 집필 월 1권', monthlyPriceKrw: 100000,
    monthlyNewProjects: 1, mode: 'human', maxActiveProjects: 1,
    saleReadyProduction: true, conversationalEditorial: true,
    status: 'proposed',
  }),
  writer3: Object.freeze({
    id: 'writer3', label: '휴먼 집필 월 3권', monthlyPriceKrw: 150000,
    monthlyNewProjects: 3, mode: 'human', maxActiveProjects: 3,
    saleReadyProduction: true, conversationalEditorial: true,
    status: 'proposed',
  }),
});
// No client-provided account role is ever accepted as trusted authorization.
// The publisher-owned writer line requires server-verified top administrator
// plus publisher editorial operator scope.
export function resolveAuthorCapability(identity, entitlement) {
  const personId = typeof identity?.personId === 'string' ? identity.personId.trim() : '';
  if (!identity?.verified || !personId) return Object.freeze({ allowed: false, reason: 'identity_required' });
  if (identity.verifiedChiefAdmin === true && identity.publisherEditorScope === true) {
    return Object.freeze({
      allowed: true, kind: 'publisher_editor', planId: 'internal', monthlyNewProjects: 6,
      canUseEditorialAutomation: true, canStartSimple: true, canStartHuman: true,
      reason: 'server_verified_publisher_operator',
    });
  }
  const plan = HUMAN_AUTHOR_PLANS[entitlement?.planId] || HUMAN_AUTHOR_PLANS.free;
  const paid = plan.id !== 'free';
  if (paid && (entitlement?.verified !== true || entitlement?.status !== 'active' || entitlement?.personId !== personId)) {
    return Object.freeze({ allowed: false, reason: 'active_server_entitlement_required' });
  }
  return Object.freeze({
    allowed: true, kind: 'member_author', planId: plan.id,
    monthlyNewProjects: plan.monthlyNewProjects, maxActiveProjects: plan.maxActiveProjects,
    canUseEditorialAutomation: false, canStartSimple: true,
    canStartHuman: plan.conversationalEditorial,
    saleReadyProduction: plan.saleReadyProduction,
    reason: 'personal_edition_only',
  });
}
const noEmpty = x => typeof x === 'string' && x.trim().length > 0;

/**
 * Never charge for a repeated attempt or permit a forged client-side plan.
 * The server owns the unique (person, YYYY-MM, requestKey) creation lock,
 * current paid entitlement and charged project count, not this UI helper.
 */
export function assessNewAuthorProject({ identity, entitlement, month, existing = [], requestKey, requestedMode }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) return { allowed: false, reason: 'invalid_month' };
  if (!Array.isArray(existing) || !noEmpty(requestKey)) return { allowed: false, reason: 'invalid_request' };
  const capability = resolveAuthorCapability(identity, entitlement);
  if (!capability.allowed) return { allowed: false, reason: capability.reason };
  if (capability.kind === 'publisher_editor') return { allowed: false, reason: 'publisher_must_use_separate_editorial_queue' };
  if (!['simple', 'human'].includes(requestedMode)) return { allowed: false, reason: 'invalid_mode' };
  if (requestedMode === 'human' && !capability.canStartHuman) return { allowed: false, reason: 'paid_plan_required' };
  const own = existing.filter(item => item.personId === identity.personId);
  const replay = own.find(item => item.month === month && item.requestKey === requestKey);
  if (replay) return {
    allowed: true, idempotent: true, existingProjectId: replay.projectId,
    planId: capability.planId, remaining: Math.max(0, capability.monthlyNewProjects - own.filter(item => item.month === month && item.status !== 'void').length),
  };
  const used = own.filter(item => item.month === month && item.status !== 'void').length;
  if (used >= capability.monthlyNewProjects) return { allowed: false, reason: 'monthly_project_limit_reached', used, limit: capability.monthlyNewProjects };
  const active = own.filter(item => ['planning', 'interviewing', 'drafting', 'editing', 'review'].includes(item.status));
  if (active.length >= capability.maxActiveProjects) return { allowed: false, reason: 'active_project_limit_reached' };
  return { allowed: true, idempotent: false, used, limit: capability.monthlyNewProjects,
    remainingAfterCreate: capability.monthlyNewProjects - used - 1, planId: capability.planId, requestedMode };
}

// Paid deep writing is driven by a guided, author-responded interview state,
// never by a single model call claiming to have acquired real testimony.
export const DIALOGUE_STAGES = Object.freeze([
  { id: 'intent', label: '책을 쓰는 이유와 독자', prompt: '이 책을 통해 누구의 어떤 삶의 문제에 말을 걸고 싶으신가요?' },
  { id: 'lived-context', label: '실제 경험과 관찰', prompt: '그 생각이 처음 생긴 실제 장면이나 관찰을 들려주시겠습니까?' },
  { id: 'tension', label: '갈등·반론·모순', prompt: '이 이야기에서 가장 풀기 어려운 반대 관점과 모순은 무엇인가요?' },
  { id: 'audience', label: '대상 독자와 이해 방식', prompt: '독자가 몇 살이며 글·그림·소리 중 어떤 도움을 받으면 더 잘 이해할까요?' },
  { id: 'structure', label: '목차와 시각적 장면', prompt: '독자가 책을 덮을 때 어떤 질문을 새롭게 갖게 되면 좋겠습니까?' },
  { id: 'chapter', label: '장별 공동 집필', prompt: '이번 장에서 반드시 살리고 싶은 본인의 표현·사건·논증을 말씀해 주세요.' },
  { id: 'revision', label: '비평과 저자 수정', prompt: '이 초고에서 자신의 목소리가 아닌 부분과 고치고 싶은 부분은 무엇인가요?' },
  { id: 'approval', label: '최종 저자 검토', prompt: '본문·삽화·인용·독자 배려·권리를 검토하고 최종 판본을 승인하시겠습니까?' },
]);
export function nextAuthorConversationStep(project) {
  const completed = new Set(Array.isArray(project?.completedStages) ? project.completedStages : []);
  const next = DIALOGUE_STAGES.find(stage => !completed.has(stage.id));
  if (!next) return { stage: 'ready-for-publisher-review', nextQuestion: null };
  return { stage: next.id, label: next.label, nextQuestion: next.prompt, requiresAuthorResponse: true };
}

// Prevent treating completed interview or a paid quota as equivalent to the
// independent author's approval AND the publisher's legally reviewed release.
export function canSubmitToPublisher(project) {
  return Boolean(
    project?.authorApproval?.approved === true &&
    project?.authorApproval?.digest && project.authorApproval.digest === project.finalDigest &&
    project?.rightsAttested === true &&
    project?.humanEditingComplete === true &&
    project?.editorialAccessibilityReviewed === true &&
    project?.completedStages?.includes('approval')
  );
}
