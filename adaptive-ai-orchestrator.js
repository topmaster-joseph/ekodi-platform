const HIGH_IMPACT_SIGNALS = Object.freeze([
  'production','deploy','release','rollback','dns','domain','secret','security','privacy','permission','auth','payment','finance','contract','migration','delete','destructive','운영','배포','릴리스','롤백','도메인','보안','개인정보','권한','인증','결제','재무','계약','마이그레이션','삭제','정책 변경','채용','해고',
]);
const MATERIAL_SIGNALS = Object.freeze([
  'analyze','analysis','compare','review','architecture','strategy','design','diagnose','investigate','tradeoff','검토','비교','분석','전략','설계','진단','원인','교차검증','검증','아키텍처','대안',
]);
const SENSITIVE_SIGNALS = Object.freeze([
  'password','passwd','api key','apikey','access token','refresh token','bearer ','resident number','social security','medical record','비밀번호','암호','api 키','토큰','주민등록','여권번호','의료기록','상담기록','개인정보 원문',
]);
const DISABLED_MODES = new Set(['off','disabled','single','false','0']);
const CIRCUITS = new Map();

export const ADAPTIVE_AI_POLICY = Object.freeze({
  version:'1.0.0',
  defaultMode:'adaptive',
  maxParallelProviders:3,
  materialFanout:2,
  highImpactFanout:3,
  synthesis:true,
  privacyFirst:true,
  providerFailureThreshold:2,
  providerCooldownMs:60_000,
});

function compact(value, max = 12_000) { return String(value ?? '').trim().slice(0, max); }
function searchableContext(taskName, context = {}) {
  return [taskName, context.message, context.request, context.rationale, context.page?.title, context.page?.section, context.page?.pathname]
    .map(value => compact(value, 4_000).toLowerCase()).filter(Boolean).join('\n');
}
function hasSignal(haystack, signals) { return signals.some(signal => haystack.includes(signal)); }
function envInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : fallback));
}
function normalizedImpact(context = {}) {
  const impact = String(context.impact || context.risk || '').trim().toLowerCase();
  if (['high','high-impact','critical'].includes(impact)) return 'high';
  if (['material','medium','moderate'].includes(impact)) return 'material';
  if (['routine','low','simple'].includes(impact)) return 'routine';
  return 'auto';
}
function isSensitive(context = {}, search = '') {
  const sensitivity = String(context.dataSensitivity || context.sensitivity || '').trim().toLowerCase();
  if (['restricted','secret','sensitive','private-high'].includes(sensitivity)) return true;
  return hasSignal(search, SENSITIVE_SIGNALS);
}

export function resolveAdaptiveAiPlan({ env = {}, taskName = '', context = {}, providerCount = 0, mode = '' } = {}) {
  const count = Math.max(0, Number(providerCount || 0));
  const requestedMode = String(mode || env.AI_ORCHESTRATION_MODE || ADAPTIVE_AI_POLICY.defaultMode).trim().toLowerCase();
  const maxParallel = envInt(env.AI_PARALLEL_MAX_PROVIDERS, ADAPTIVE_AI_POLICY.maxParallelProviders, 2, ADAPTIVE_AI_POLICY.maxParallelProviders);
  if (count < 2) return Object.freeze({ strategy:'single', fanout:Math.min(1, count), quorum:1, synthesize:false, reason:'insufficient_providers' });
  if (DISABLED_MODES.has(requestedMode)) return Object.freeze({ strategy:'single', fanout:1, quorum:1, synthesize:false, reason:'parallel_disabled' });

  const search = searchableContext(taskName, context);
  if (isSensitive(context, search) && context.parallelSensitiveApproved !== true) {
    return Object.freeze({ strategy:'single', fanout:1, quorum:1, synthesize:false, reason:'privacy_first_single_provider' });
  }

  const impact = normalizedImpact(context);
  const forcedParallel = ['parallel','cross-check','cross_check'].includes(requestedMode);
  const highImpact = impact === 'high' || hasSignal(search, HIGH_IMPACT_SIGNALS);
  const material = impact === 'material' || hasSignal(search, MATERIAL_SIGNALS) || compact(context.message || context.request).length >= 900;
  let fanout = 1;
  let reason = 'routine_single_provider';
  if (forcedParallel || highImpact) {
    fanout = Math.min(maxParallel, count, ADAPTIVE_AI_POLICY.highImpactFanout);
    reason = forcedParallel ? 'explicit_parallel' : 'high_impact_cross_check';
  } else if (material) {
    fanout = Math.min(maxParallel, count, ADAPTIVE_AI_POLICY.materialFanout);
    reason = 'material_cross_check';
  }
  if (fanout < 2) return Object.freeze({ strategy:'single', fanout:1, quorum:1, synthesize:false, reason });
  return Object.freeze({
    strategy:'parallel',
    fanout,
    quorum:Math.min(2, fanout),
    synthesize:true,
    reason,
    impact:highImpact ? 'high' : 'material',
  });
}

function isCircuitOpen(providerId, now) {
  const state = CIRCUITS.get(providerId);
  if (!state) return false;
  if (state.openUntil <= now) { CIRCUITS.delete(providerId); return false; }
  return state.failures >= ADAPTIVE_AI_POLICY.providerFailureThreshold;
}
function recordFailure(providerId, now) {
  const previous = CIRCUITS.get(providerId) || { failures:0, openUntil:0 };
  const failures = previous.failures + 1;
  CIRCUITS.set(providerId, { failures, openUntil:failures >= ADAPTIVE_AI_POLICY.providerFailureThreshold ? now + ADAPTIVE_AI_POLICY.providerCooldownMs : 0 });
}
function resetCircuit(providerId) { CIRCUITS.delete(providerId); }
function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('AI_PARALLEL_PROVIDER_TIMEOUT')), timeoutMs);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
function valueText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value?.text === 'string') return value.text.trim();
  try { return JSON.stringify(value).slice(0, 5_000); } catch { return ''; }
}
async function fallbackResult(fallback, taskName, reason, attemptedProviders, plan, context) {
  try {
    const value = await fallback(Object.freeze({ taskName, reason, attemptedProviders, context }));
    return Object.freeze({ ok:true, mode:'free_assist', degraded:true, provider:null, taskName, reason, attemptedProviders:Object.freeze([...attemptedProviders]), value, notice:'기본 모드로 계속 이용할 수 있습니다. AI 고급 기능은 잠시 사용할 수 없습니다.', orchestration:Object.freeze({ ...plan, synthesized:false, successfulProviders:[] }) });
  } catch {
    return Object.freeze({ ok:false, mode:'core', degraded:true, provider:null, taskName, reason:'assist_unavailable', attemptedProviders:Object.freeze([...attemptedProviders]), value:null, notice:'AI 보조 기능 없이 핵심 기능을 계속 이용할 수 있습니다.', orchestration:Object.freeze({ ...plan, synthesized:false, successfulProviders:[] }) });
  }
}

export async function runAdaptiveAiTask({ providers = [], fallback, taskName = 'ai_task', context = {}, timeoutMs = 10_000, plan, now = Date.now } = {}) {
  if (typeof fallback !== 'function') throw new TypeError('runAdaptiveAiTask requires fallback.');
  const eligible = (Array.isArray(providers) ? providers : []).filter(provider => provider?.available !== false && typeof provider?.invoke === 'function' && !isCircuitOpen(provider.id, now()));
  const resolvedPlan = plan || resolveAdaptiveAiPlan({ taskName, context, providerCount:eligible.length });
  const selected = eligible.slice(0, Math.max(1, resolvedPlan.fanout || 1));
  if (resolvedPlan.strategy !== 'parallel') {
    return fallbackResult(fallback, taskName, 'adaptive_parallel_unavailable', selected.map(provider => provider.id), resolvedPlan, context);
  }
  if (selected.length === 1) {
    const provider = selected[0];
    try {
      const value = await withTimeout(Promise.resolve().then(() => provider.invoke({ taskName, context })), Math.max(1, Number(timeoutMs) || 10_000));
      resetCircuit(provider.id);
      return Object.freeze({ ok:true, mode:'ai', degraded:true, provider:provider.id, taskName, value, notice:'교차검증 가능한 AI가 1개뿐이어서 단일 검토 결과로 축소되었습니다.', orchestration:Object.freeze({ ...resolvedPlan, attemptedProviders:[provider.id], successfulProviders:[provider.id], failedProviders:[], quorumMet:false, synthesized:false }) });
    } catch (error) {
      recordFailure(provider.id, now());
      return fallbackResult(fallback, taskName, 'adaptive_single_provider_failed', [provider.id], resolvedPlan, context);
    }
  }
  if (!selected.length) return fallbackResult(fallback, taskName, 'parallel_providers_unavailable', [], resolvedPlan, context);

  const attemptedProviders = selected.map(provider => provider.id);
  const settled = await Promise.all(selected.map(async (provider, index) => {
    try {
      const value = await withTimeout(Promise.resolve().then(() => provider.invoke({
        taskName,
        context:{ ...context, _ekodiOrchestration:{ phase:'independent_review', plan:resolvedPlan, providerIndex:index, providerCount:selected.length } },
      })), Math.max(1, Number(timeoutMs) || 10_000));
      resetCircuit(provider.id);
      return { ok:true, provider, value };
    } catch (error) {
      recordFailure(provider.id, now());
      return { ok:false, provider, error:String(error?.message || error) };
    }
  }));
  const successes = settled.filter(result => result.ok && valueText(result.value));
  const failures = settled.filter(result => !result.ok).map(result => result.provider.id);
  if (!successes.length) return fallbackResult(fallback, taskName, 'parallel_providers_unavailable', attemptedProviders, resolvedPlan, context);

  const successfulProviders = successes.map(result => result.provider.id);
  const quorumMet = successes.length >= Math.max(1, resolvedPlan.quorum || 1);
  if (successes.length === 1 || resolvedPlan.synthesize === false) {
    return Object.freeze({ ok:true, mode:'ai', degraded:!quorumMet, provider:successes[0].provider.id, taskName, value:successes[0].value, notice:quorumMet ? '' : '교차검증 정족수를 채우지 못해 단일 검토 결과로 축소되었습니다.', orchestration:Object.freeze({ ...resolvedPlan, attemptedProviders, successfulProviders, failedProviders:failures, quorumMet, synthesized:false }) });
  }

  const peerReviews = successes.map(result => ({ provider:result.provider.id, text:valueText(result.value).slice(0, 4_000) }));
  const synthesizer = successes[0].provider;
  try {
    const value = await withTimeout(Promise.resolve().then(() => synthesizer.invoke({
      taskName:`${taskName}:synthesis`,
      context:{ ...context, _ekodiOrchestration:{ phase:'synthesis', plan:resolvedPlan, peerReviews, quorumMet } },
    })), Math.max(1, Number(timeoutMs) || 10_000));
    resetCircuit(synthesizer.id);
    return Object.freeze({ ok:true, mode:'ai', degraded:!quorumMet, provider:'ekodi-orchestrator', synthesisProvider:synthesizer.id, taskName, value, notice:quorumMet ? '' : '일부 AI가 응답하지 않아 가용 결과만으로 합성했습니다.', orchestration:Object.freeze({ ...resolvedPlan, attemptedProviders, successfulProviders, failedProviders:failures, quorumMet, synthesized:true, synthesisProvider:synthesizer.id }) });
  } catch (error) {
    recordFailure(synthesizer.id, now());
    return Object.freeze({ ok:true, mode:'ai', degraded:true, provider:successes[0].provider.id, taskName, value:successes[0].value, notice:'교차검증 결과는 확보했지만 최종 합성이 실패해 1순위 검토 결과로 축소했습니다.', orchestration:Object.freeze({ ...resolvedPlan, attemptedProviders, successfulProviders, failedProviders:[...failures, `${synthesizer.id}:synthesis`], quorumMet, synthesized:false }) });
  }
}

export function resetAdaptiveAiCircuitsForTest() { CIRCUITS.clear(); }
