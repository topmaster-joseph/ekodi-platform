export const DEFAULT_WORKERS_DAILY_REQUEST_BUDGET = 100_000;

export const ACCOUNT_PROTECTION_THRESHOLDS = Object.freeze({
  attention: 70,
  saver: 85,
  protect: 95,
  survival: 100
});

const MODE_POLICIES = Object.freeze({
  normal: Object.freeze({
    label: '정상',
    severity: 0,
    observabilitySampling: 0.1,
    allowDevelopmentDeploy: true,
    deferNonEssential: false,
    essentialOnly: false
  }),
  attention: Object.freeze({
    label: '주의',
    severity: 1,
    observabilitySampling: 0.05,
    allowDevelopmentDeploy: true,
    deferNonEssential: false,
    essentialOnly: false
  }),
  saver: Object.freeze({
    label: '절약',
    severity: 2,
    observabilitySampling: 0.01,
    allowDevelopmentDeploy: false,
    deferNonEssential: true,
    essentialOnly: false
  }),
  protect: Object.freeze({
    label: '보호',
    severity: 3,
    observabilitySampling: 0.001,
    allowDevelopmentDeploy: false,
    deferNonEssential: true,
    essentialOnly: true
  }),
  survival: Object.freeze({
    label: '생존',
    severity: 4,
    observabilitySampling: 0,
    allowDevelopmentDeploy: false,
    deferNonEssential: true,
    essentialOnly: true
  })
});

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function positiveBudget(value) {
  const budget = finiteNonNegative(value, DEFAULT_WORKERS_DAILY_REQUEST_BUDGET);
  if (budget <= 0) throw new RangeError('Workers daily request budget must be greater than zero.');
  return budget;
}

function validateThresholds(thresholds) {
  const resolved = {
    attention: finiteNonNegative(thresholds?.attention, ACCOUNT_PROTECTION_THRESHOLDS.attention),
    saver: finiteNonNegative(thresholds?.saver, ACCOUNT_PROTECTION_THRESHOLDS.saver),
    protect: finiteNonNegative(thresholds?.protect, ACCOUNT_PROTECTION_THRESHOLDS.protect),
    survival: finiteNonNegative(thresholds?.survival, ACCOUNT_PROTECTION_THRESHOLDS.survival)
  };
  if (!(resolved.attention < resolved.saver && resolved.saver < resolved.protect && resolved.protect <= resolved.survival)) {
    throw new RangeError('Protection thresholds must increase from attention to survival.');
  }
  return resolved;
}

export function modeForUsagePercent(percent, thresholds = ACCOUNT_PROTECTION_THRESHOLDS) {
  const value = finiteNonNegative(percent, 0);
  const resolved = validateThresholds(thresholds);
  if (value >= resolved.survival) return 'survival';
  if (value >= resolved.protect) return 'protect';
  if (value >= resolved.saver) return 'saver';
  if (value >= resolved.attention) return 'attention';
  return 'normal';
}

export function evaluateAccountProtection({
  requests = 0,
  budget = DEFAULT_WORKERS_DAILY_REQUEST_BUDGET,
  thresholds = ACCOUNT_PROTECTION_THRESHOLDS
} = {}) {
  const safeRequests = finiteNonNegative(requests, 0);
  const safeBudget = positiveBudget(budget);
  const percent = Math.round((safeRequests / safeBudget) * 10_000) / 100;
  const mode = modeForUsagePercent(percent, thresholds);
  const policy = MODE_POLICIES[mode];
  return Object.freeze({
    requests: safeRequests,
    budget: safeBudget,
    percent,
    remaining: Math.max(0, safeBudget - safeRequests),
    mode,
    label: policy.label,
    severity: policy.severity,
    actions: Object.freeze({
      observabilitySampling: policy.observabilitySampling,
      allowDevelopmentDeploy: policy.allowDevelopmentDeploy,
      deferNonEssential: policy.deferNonEssential,
      essentialOnly: policy.essentialOnly
    })
  });
}
