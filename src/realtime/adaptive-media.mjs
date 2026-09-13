import capabilityPolicy from '../../config/realtime-capabilities.json' with { type: 'json' };

const DEFAULTS = Object.freeze({ ...capabilityPolicy.adaptiveMedia });

function clampRatio(spent = 0, limit = 0) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(0, spent / limit);
}

export function budgetMode(budget = {}, thresholds = DEFAULTS.budgetThresholds) {
  const ratio = clampRatio(Number(budget.spent || 0), Number(budget.limit || 0));
  if (ratio >= thresholds.hard) return { mode: 'hard', ratio };
  if (ratio >= thresholds.conserve) return { mode: 'conserve', ratio };
  if (ratio >= thresholds.warn) return { mode: 'warn', ratio };
  return { mode: 'normal', ratio };
}

export function activeTranslationChannels({ requestedLanguages = [], listenerCounts = {}, sourceLanguage = 'ko' } = {}) {
  const source = String(sourceLanguage).toLowerCase();
  return [...new Set(requestedLanguages.map(value => String(value).toLowerCase()))]
    .filter(language => language !== source)
    .filter(language => Number(listenerCounts[language] || 0) > 0);
}

export function selectHealthyProvider(providers = [], { capability = 'webrtc', region = null } = {}) {
  const candidates = providers
    .filter(provider => provider?.enabled !== false)
    .filter(provider => provider?.healthy !== false)
    .filter(provider => !capability || provider.capabilities?.includes(capability))
    .filter(provider => !region || !provider.regions?.length || provider.regions.includes(region))
    .sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100));
  return candidates[0] ?? null;
}

export function planAdaptiveMedia(input = {}, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const mode = input.mode || 'public_broadcast';
  const interactiveUsers = Math.max(0, Number(input.interactiveUsers || 0));
  const viewers = Math.max(0, Number(input.viewers || 0));
  const isBroadcast = ['public_broadcast', 'webinar', 'worship', 'commerce', 'education'].includes(mode);
  const interactiveLimit = isBroadcast ? config.maxInteractiveBroadcastGuests : config.maxInteractiveParticipants;
  const cost = budgetMode(input.budget, config.budgetThresholds);
  const languages = activeTranslationChannels(input.translation);
  let videoProfile = input.videoProfile || config.videoProfiles?.[0] || '1080p';
  let recordingMode = input.recordingEnabled ? config.recordingDefault : 'off';
  const actions = [];

  if (interactiveUsers > interactiveLimit) actions.push('overflow-to-viewer-delivery');
  if (cost.mode === 'warn') actions.push('surface-budget-warning');
  if (cost.mode === 'conserve') {
    videoProfile = config.videoProfiles?.[1] || '720p';
    actions.push('stop-idle-translations', 'prefer-hls-viewers', 'composite-recording-only');
    if (recordingMode !== 'off') recordingMode = 'program-only';
  }
  if (cost.mode === 'hard') {
    videoProfile = config.videoProfiles?.[2] || '480p';
    actions.push('stop-idle-translations', 'prefer-hls-viewers', 'program-recording-only', 'block-new-premium-actions');
    if (recordingMode !== 'off') recordingMode = 'program-only';
  }

  return {
    interactiveDelivery: 'webrtc',
    viewerDelivery: isBroadcast || viewers > interactiveLimit ? config.viewerDelivery : 'webrtc',
    interactiveLimit,
    translationChannels: languages,
    translationIdleSeconds: config.translationIdleSeconds,
    recordingMode,
    videoProfile,
    budget: cost,
    providerStrategy: config.providerStrategy,
    providerEscapeHatch: [...(config.providerEscapeHatch || [])],
    actions: [...new Set(actions)],
  };
}
