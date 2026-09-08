const MODES = new Set(['auto', 'personal-first', 'ekodi-first', 'off']);
const INTENTS = new Set(['interactive', 'proactive']);
const SURFACES = new Set(['user', 'admin', 'system']);

function bool(value) { return Boolean(value); }
function positive(value) { return Number(value || 0) > 0; }

export function resolveAiAccessRoute(options = {}) {
  const mode = MODES.has(options.mode) ? options.mode : 'auto';
  const intent = INTENTS.has(options.intent) ? options.intent : 'interactive';
  const surface = SURFACES.has(options.surface) ? options.surface : 'user';
  const aiRequired = options.aiRequired !== false;
  const personalApi = bool(options.hasPersonalApi && options.personalApiAllowed);
  const personalWeb = bool(options.personalWebAvailable && intent === 'interactive' && surface === 'user');
  const personalAgent = bool(options.personalAgentAvailable && (intent === 'interactive' || options.personalAgentAutomationAllowed === true));
  const sponsored = bool(options.sponsoredAvailable && positive(options.sponsoredRemaining));
  const hosted = bool(options.hostedAvailable);

  if (!aiRequired || mode === 'off') {
    return { route:'core-only', reason:!aiRequired ? 'core-can-handle' : 'ai-disabled', intent, surface };
  }

  const unattended = intent === 'proactive' || surface === 'admin' || surface === 'system';
  if (unattended) {
    if (mode === 'ekodi-first' && sponsored) return { route:'ekodi-sponsored', reason:'explicit-ekodi-first', intent, surface };
    if (personalAgent) return { route:'personal-agent', reason:'official-subscription-agent-available', intent, surface };
    if (personalApi) return { route:'personal-api', reason:'personal-api-available', intent, surface };
    if (sponsored) return { route:'ekodi-sponsored', reason:'server-api-required', intent, surface };
    if (hosted) return { route:'hosted-ai', reason:'hosted-ai-fallback', intent, surface };
    return { route:'core-only', reason:'no-server-ai-route', intent, surface };
  }

  // Human-present work consumes already-paid personal subscriptions before metered APIs.
  if (mode === 'ekodi-first' && sponsored) return { route:'ekodi-sponsored', reason:'explicit-ekodi-first', intent, surface };
  if (personalWeb) return { route:'personal-web', reason:mode === 'personal-first' ? 'explicit-personal-first' : 'personal-web-preferred', intent, surface };
  if (personalAgent) return { route:'personal-agent', reason:'official-subscription-agent-available', intent, surface };
  if (personalApi) return { route:'personal-api', reason:'personal-api-available', intent, surface };
  if (sponsored) return { route:'ekodi-sponsored', reason:'personal-ai-unavailable', intent, surface };
  if (hosted) return { route:'hosted-ai', reason:'hosted-ai-fallback', intent, surface };
  return { route:'core-only', reason:'no-ai-route', intent, surface };
}

export function routeSequence(options = {}) {
  const mode = MODES.has(options.mode) ? options.mode : 'auto';
  const intent = INTENTS.has(options.intent) ? options.intent : 'interactive';
  const surface = SURFACES.has(options.surface) ? options.surface : 'user';
  if (mode === 'off') return ['core-only'];
  if (intent === 'proactive' || surface !== 'user') {
    return mode === 'ekodi-first'
      ? ['ekodi-sponsored','personal-agent','personal-api','hosted-ai','core-only']
      : ['personal-agent','personal-api','ekodi-sponsored','hosted-ai','core-only'];
  }
  if (mode === 'ekodi-first') return ['ekodi-sponsored','personal-web','personal-agent','personal-api','hosted-ai','core-only'];
  return ['personal-web','personal-agent','personal-api','ekodi-sponsored','hosted-ai','core-only'];
}
export const AI_ACCESS_POLICY = Object.freeze({
  version:'2026-09-09.2',
  modes:[...MODES], intents:[...INTENTS], surfaces:[...SURFACES],
  principles:Object.freeze({
    coreWrapsAllExecution:true,
    deterministicCoreAvoidsUnneededAiCalls:true,
    personalSubscriptionPreferredWhenHumanPresent:true,
    personalApiPreferredForUnattendedWork:true,
    boundedEkodiSponsorshipForFree:true,
    providerDetailsHiddenByDefault:true,
    consumerWebNeverUsedForProactiveExecution:true,
    officialSubscriptionAgentRequiredForAutomation:true,
    adminAndSystemExecutionRequireServerCallableRoute:true,
    adminAndSystemExecutionRequireServerCallableApi:true,
    hostedAiIsOptionalFallback:true,
    providerIndependent:true,
  }),
});
