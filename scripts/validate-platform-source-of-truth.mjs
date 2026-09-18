import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function validatePlatformSourceOfTruth() {
  const policy = await readJson('config/platform-source-of-truth.json');
  const errors = [];
  const warnings = [];

  if (policy.status !== 'enforced') errors.push('source_of_truth_policy_not_enforced');

  const precedence = Array.isArray(policy.authorityPrecedence) ? policy.authorityPrecedence : [];
  const ranks = new Set();
  const paths = new Set();
  for (const item of precedence) {
    if (!Number.isInteger(item.rank) || item.rank < 1) errors.push(`invalid_precedence_rank:${item.path || 'unknown'}`);
    if (ranks.has(item.rank)) errors.push(`duplicate_precedence_rank:${item.rank}`);
    ranks.add(item.rank);
    if (!item.path || paths.has(item.path)) errors.push(`duplicate_or_missing_precedence_path:${item.path || 'unknown'}`);
    paths.add(item.path);
    if (!(await exists(item.path))) errors.push(`missing_authority_source:${item.path}`);
  }

  const facts = policy.currentFacts || {};
  const evolution = await readJson('governance/architecture/ekodi-evolution-model.json');
  const sovereign = await readJson('governance/architecture/sovereign-autonomous-operations.v1.json');
  const orchestration = await readJson('config/ai-change-orchestration-policy.json');
  const technology = await readJson('config/autonomous-technology-evolution-policy.json');

  if (Number(evolution.currentGeneration) !== Number(facts.generation)) errors.push('generation_fact_mismatch');
  if (String(evolution.currentGenerationLabel || '') !== String(facts.generationName || '')) errors.push('generation_name_fact_mismatch');
  if (String(evolution.currentScaleTier || '') !== String(facts.scaleTier || '')) errors.push('scale_tier_fact_mismatch');
  if (String(sovereign?.costAndScale?.currentScaleTier || '') !== String(facts.scaleTier || '')) errors.push('sovereign_scale_tier_mismatch');
  if (facts.directAutonomousProductionMutationAllowed === false && sovereign?.productionRule?.directAgentMutationForbidden !== true) {
    errors.push('direct_autonomous_production_mutation_not_forbidden');
  }
  if (facts.directPushToMainAllowed === false && orchestration?.sourceControl?.directPushToMain !== false) {
    errors.push('direct_push_to_main_not_forbidden');
  }
  if (facts.automaticPaidCommitmentAllowed === false && technology?.authority?.automaticPaidActivation !== false) {
    errors.push('automatic_paid_commitment_not_forbidden');
  }
  if (facts.newSubdomainCreationAllowed === false && evolution?.sustainability?.noSpeculativeSubdomain !== true) {
    errors.push('subdomain_expansion_guard_missing');
  }
  const costRule = String(evolution?.sustainability?.defaultCostRule || '').toLowerCase();
  if (!costRule.includes('free') || !costRule.includes('low')) errors.push('free_low_cost_default_missing');
  if (technology.sourceOfTruthPolicy !== 'config/platform-source-of-truth.json') {
    errors.push('technology_policy_not_bound_to_source_of_truth');
  }

  const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8').catch(() => '');
  if (/https:\/\/(?:my|admin|api)\.ekodi\.kr/i.test(readme)) {
    warnings.push('README_contains_legacy_subdomain_examples_non_authoritative_until_topology_cleanup_merges');
  }

  return Object.freeze({
    ok: errors.length === 0,
    policyId: policy.policyId,
    generation: facts.generation,
    scaleTier: facts.scaleTier,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  });
}

async function main() {
  const result = await validatePlatformSourceOfTruth();
  for (const warning of result.warnings) console.warn(`[EKODI][SOT][WARN] ${warning}`);
  if (!result.ok) {
    for (const error of result.errors) console.error(`[EKODI][SOT][ERROR] ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[EKODI][SOT] verified ${result.policyId}: Generation ${result.generation}, ${result.scaleTier}`);
}

const executedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
