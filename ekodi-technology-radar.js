import { runAutonomousDiscoveryCycle } from './ekodi-autonomous-discovery-engine.js';

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freeze(child)])));
  }
  return value;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value) {
  return Math.max(0, Math.min(100, number(value, 0)));
}

export function validateTechnologyEvolutionPolicy(policy = {}) {
  const errors = [];
  if (policy.status !== 'enforced') errors.push('policy_not_enforced');
  if (Number(policy.currentGeneration) !== 10) errors.push('current_generation_must_be_10');
  if (policy.scaleTier !== 'S0') errors.push('scale_tier_must_be_s0');
  const weights = policy?.evaluation?.weights || {};
  const total = Object.values(weights).reduce((sum, value) => sum + number(value), 0);
  if (total !== 100) errors.push('evaluation_weights_must_total_100');
  const authority = policy.authority || {};
  for (const key of [
    'automaticPaidActivation',
    'automaticSecretCreationOrRotation',
    'automaticPermissionExpansion',
    'automaticProductionMutation',
    'automaticProviderLockIn',
    'automaticConstitutionalChange',
  ]) {
    if (authority[key] !== false) errors.push(`${key}_must_be_false`);
  }
  const technologies = Array.isArray(policy.technologies) ? policy.technologies : [];
  const ids = new Set();
  for (const technology of technologies) {
    const id = String(technology?.id || '').trim();
    if (!id) errors.push('technology_id_required');
    if (ids.has(id)) errors.push(`duplicate_technology_id:${id}`);
    ids.add(id);
    if (technology?.source?.kind !== 'github_release') errors.push(`unsupported_source_kind:${id}`);
    if (!String(technology?.source?.repository || '').includes('/')) errors.push(`source_repository_required:${id}`);
    if (!String(technology?.source?.tagPattern || '').trim()) errors.push(`tag_pattern_required:${id}`);
    if (technology.requiresPaidCommitment === true && technology.autonomousSandboxEligible === true) {
      errors.push(`paid_candidate_cannot_be_autonomous_sandbox:${id}`);
    }
  }
  return freeze({ ok: errors.length === 0, errors });
}

function semverParts(value) {
  const match = String(value || '').trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

export function compareTechnologyVersions(baselineVersion, latestVersion) {
  const baseline = semverParts(baselineVersion);
  const latest = semverParts(latestVersion);
  if (!baseline || !latest) {
    const changed = String(baselineVersion || '') !== String(latestVersion || '');
    return freeze({ changed, level: changed ? 'unknown' : 'none', baseline, latest });
  }
  const changed = baseline.some((part, index) => part !== latest[index]);
  let level = 'none';
  if (changed) {
    if (baseline[0] !== latest[0]) level = 'major';
    else if (baseline[1] !== latest[1]) level = 'minor';
    else level = 'patch';
  }
  const newer = latest[0] > baseline[0]
    || (latest[0] === baseline[0] && latest[1] > baseline[1])
    || (latest[0] === baseline[0] && latest[1] === baseline[1] && latest[2] > baseline[2]);
  return freeze({ changed, newer, level, baseline, latest });
}

export function scoreTechnologyCandidate(technology = {}, policy = {}) {
  const weights = policy?.evaluation?.weights || {};
  const metrics = technology.metrics || {};
  const entries = [
    ['userValue', 30],
    ['compatibility', 20],
    ['costEfficiency', 20],
    ['security', 15],
    ['reversibility', 10],
    ['simplicity', 5],
  ];
  const weighted = entries.reduce((sum, [key, fallbackWeight]) => {
    const weight = number(weights[key], fallbackWeight);
    return sum + (clamp(metrics[key]) * weight);
  }, 0) / 100;
  return Number(weighted.toFixed(2));
}

export function evaluateTechnologyObservation(technology = {}, observation = {}, policy = {}) {
  const version = compareTechnologyVersions(technology.baselineVersion, observation.latestVersion);
  const score = scoreTechnologyCandidate(technology, policy);
  const thresholds = policy?.evaluation?.thresholds || {};
  const sandboxThreshold = number(thresholds.sandboxCandidate, 85);
  const assessThreshold = number(thresholds.assess, 70);
  const patchMaterial = technology.patchReleaseMaterial === true
    || policy?.evaluation?.patchReleaseMaterialByDefault === true;
  const material = observation.fetchOk === true
    && version.changed === true
    && version.newer !== false
    && (version.level !== 'patch' || patchMaterial);

  let action = 'current';
  let reason = 'baseline_current';
  if (observation.fetchOk !== true) {
    action = 'evidence_unavailable';
    reason = 'official_source_fetch_failed';
  } else if (!version.changed || version.newer === false) {
    action = 'current';
    reason = version.newer === false ? 'latest_not_newer_than_baseline' : 'baseline_current';
  } else if (!material) {
    action = 'watch';
    reason = 'non_material_patch_release';
  } else if (technology.requiresPaidCommitment === true) {
    action = 'human_gate';
    reason = 'paid_commitment_requires_super_admin';
  } else if (
    score >= sandboxThreshold
    && technology.autonomousSandboxEligible === true
    && technology.requiresProviderCredentialForFunctionalTrial !== true
  ) {
    action = 'sandbox_candidate';
    reason = 'high_score_free_reversible_sandbox_eligible';
  } else if (score >= assessThreshold) {
    action = 'assess';
    reason = technology.requiresProviderCredentialForFunctionalTrial === true
      ? 'functional_trial_requires_existing_authorized_provider_credential'
      : 'material_change_requires_bounded_assessment';
  } else {
    action = 'watch';
    reason = 'score_below_assessment_threshold';
  }

  return freeze({
    id: technology.id,
    name: technology.name,
    category: technology.category,
    baselineVersion: technology.baselineVersion || null,
    latestVersion: observation.latestVersion || null,
    latestTag: observation.latestTag || null,
    publishedAt: observation.publishedAt || null,
    evidenceUrl: observation.evidenceUrl || null,
    fetchOk: observation.fetchOk === true,
    error: observation.error || null,
    version,
    score,
    material,
    action,
    reason,
    autonomousSandboxEligible: technology.autonomousSandboxEligible === true,
    requiresProviderCredentialForFunctionalTrial: technology.requiresProviderCredentialForFunctionalTrial === true,
    requiresPaidCommitment: technology.requiresPaidCommitment === true,
    productionMutationAllowed: false,
    automaticPaidActivationAllowed: false,
    authorityExpansionAllowed: false,
  });
}

export function buildTechnologyDiscoverySignals(entries = []) {
  return freeze((Array.isArray(entries) ? entries : [])
    .filter(entry => entry.material === true && ['sandbox_candidate', 'assess', 'human_gate'].includes(entry.action))
    .map(entry => ({
      type: 'provider_or_standard_change',
      target: `technology:${entry.id}`,
      material: true,
      detectedAt: entry.publishedAt || null,
      evidenceRefs: entry.evidenceUrl ? [entry.evidenceUrl] : [],
      technology: {
        id: entry.id,
        category: entry.category,
        baselineVersion: entry.baselineVersion,
        latestVersion: entry.latestVersion,
        score: entry.score,
        action: entry.action,
      },
    })));
}

export function buildTechnologyRadarReport(policy = {}, observations = []) {
  const validation = validateTechnologyEvolutionPolicy(policy);
  if (!validation.ok) {
    throw new Error(`AUTONOMOUS_TECHNOLOGY_POLICY_INVALID:${validation.errors.join(',')}`);
  }
  const byId = new Map((Array.isArray(observations) ? observations : []).map(item => [item.id, item]));
  const entries = policy.technologies.map(technology => evaluateTechnologyObservation(
    technology,
    byId.get(technology.id) || { id: technology.id, fetchOk: false, error: 'observation_missing' },
    policy,
  ));
  const signals = buildTechnologyDiscoverySignals(entries);
  const discoveryCycle = runAutonomousDiscoveryCycle({ signals });
  const counts = Object.fromEntries(['current','watch','assess','sandbox_candidate','human_gate','evidence_unavailable']
    .map(action => [action, entries.filter(entry => entry.action === action).length]));
  return freeze({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    engine: 'EKODI Autonomous Technology Radar',
    policyId: policy.policyId,
    currentGeneration: policy.currentGeneration,
    scaleTier: policy.scaleTier,
    sourcePolicy: 'official_sources_only',
    counts,
    entries,
    signals,
    discoveryCycle,
    productionMutationPerformed: false,
    automaticPaidCommitmentPerformed: false,
    authorityExpanded: false,
    automaticPromotionPerformed: false,
  });
}
