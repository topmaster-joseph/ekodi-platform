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

  // Foreground user experience: provider details stay behind the gateway.
  // Personal AI remains preferred for interactive work; EKODI-sponsored API is a bounded fallback.
  if (mode === 'ekodi-first' && sponsored) return { route:'ekodi-sponsored', reason:'explicit-ekodi-first', intent, surface };
  if (personalApi) return { route:'personal-api', reason:'personal-api-available', intent, surface };
  if (personalWeb) return { route:'personal-web', reason:mode === 'personal-first' ? 'explicit-personal-first' : 'personal-web-preferred', intent, surface };
  if (sponsored) return { route:'ekodi-sponsored', reason:'personal-ai-unavailable', intent, surface };
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
  return ['core', 'personal-api', 'personal-web', 'ekodi-sponsored', 'core-only'];
}

export const AI_ACCESS_POLICY = Object.freeze({
  version:'2026-09-09.1',
  modes:[...MODES],
  intents:[...INTENTS],
  surfaces:[...SURFACES],
  principles:Object.freeze({
    coreFirst:true,
    boundedEkodiSponsorshipForFree:true,
    personalApiPreferredWhenSafe:true,
    providerDetailsHiddenByDefault:true,
    consumerWebNeverUsedForProactiveExecution:true,
    interactivePersonalWebPreferredBeforeSponsored:true,
    adminAndSystemExecutionRequireServerCallableApi:true,
    providerIndependent:true,
  }),
});
