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
  const sponsored = bool(options.sponsoredAvailable && positive(options.sponsoredRemaining));

  if (!aiRequired || mode === 'off') {
    return { route:'core-only', reason:!aiRequired ? 'core-can-handle' : 'ai-disabled', intent, surface };
  }

  // Unattended/proactive work can never depend on a consumer web session.
  if (intent === 'proactive' || surface === 'admin' || surface === 'system') {
    if (mode === 'ekodi-first' && sponsored) return { route:'ekodi-sponsored', reason:'explicit-ekodi-first', intent, surface };
    if (personalApi) return { route:'personal-api', reason:'personal-api-available', intent, surface };
    if (sponsored) return { route:'ekodi-sponsored', reason:'server-api-required', intent, surface };
    return { route:'core-only', reason:'no-server-ai-route', intent, surface };
  }

  // Foreground user experience: keep Free cost-safe, but avoid unnecessary handoffs for paid members.
  if (mode === 'ekodi-first' && sponsored) return { route:'ekodi-sponsored', reason:'explicit-ekodi-first', intent, surface };
  if (personalApi) return { route:'personal-api', reason:'personal-api-available', intent, surface };
  if (mode === 'personal-first' && personalWeb) return { route:'personal-web', reason:'explicit-personal-first', intent, surface };
  if (sponsored) return { route:'ekodi-sponsored', reason:'membership-supported-seamless', intent, surface };
  if (personalWeb) return { route:'personal-web', reason:'personal-web-fallback', intent, surface };
  return { route:'core-only', reason:'no-ai-route', intent, surface };
}

export function routeSequence(options = {}) {
  const mode = MODES.has(options.mode) ? options.mode : 'auto';
  const intent = INTENTS.has(options.intent) ? options.intent : 'interactive';
  const surface = SURFACES.has(options.surface) ? options.surface : 'user';
  if (mode === 'off') return ['core-only'];
  if (intent === 'proactive' || surface !== 'user') {
    return mode === 'ekodi-first'
      ? ['core', 'ekodi-sponsored', 'personal-api', 'core-only']
      : ['core', 'personal-api', 'ekodi-sponsored', 'core-only'];
  }
  if (mode === 'personal-first') return ['core', 'personal-api', 'personal-web', 'ekodi-sponsored', 'core-only'];
  if (mode === 'ekodi-first') return ['core', 'ekodi-sponsored', 'personal-api', 'personal-web', 'core-only'];
  return ['core', 'personal-api', 'ekodi-sponsored', 'personal-web', 'core-only'];
}

export const AI_ACCESS_POLICY = Object.freeze({
  version:'2026-08-23.1',
  modes:[...MODES],
  intents:[...INTENTS],
  surfaces:[...SURFACES],
  principles:Object.freeze({
    coreFirst:true,
    freeNeverAutoConsumesEkodiPaidApi:true,
    personalApiPreferredWhenSafe:true,
    consumerWebNeverUsedForProactiveExecution:true,
    paidInteractiveMayUseSponsoredApiToAvoidHandoff:true,
    adminAndSystemExecutionRequireServerCallableApi:true,
    providerIndependent:true,
  }),
});
