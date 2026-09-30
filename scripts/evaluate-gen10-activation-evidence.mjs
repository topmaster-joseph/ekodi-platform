import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));

function collectRows(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRows(item, rows);
  } else if (value && typeof value === 'object') {
    if (typeof value.id === 'string' && Object.hasOwn(value, 'evidence_json')) rows.push(value);
    for (const item of Object.values(value)) collectRows(item, rows);
  }
  return rows;
}

function parseEvidenceJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function latestBy(rows, predicate) {
  const eligible = rows.filter(predicate);
  eligible.sort((a, b) => String(b.recorded_at || '').localeCompare(String(a.recorded_at || '')));
  return eligible[0] || null;
}

export function evaluateGeneration10Activation({
  runtimeRows = [],
  productionRows = [],
  architecture = {},
} = {}) {
  const blockers = [];
  const runtime = latestBy(runtimeRows, row => {
    const evidence = parseEvidenceJson(row.evidence_json);
    return Number(row.generation) === 10
      && String(row.outcome) === 'verified'
      && evidence?.kind === 'execution_fabric_runtime_evidence'
      && evidence?.verified === true;
  });
  const runtimeEvidence = parseEvidenceJson(runtime?.evidence_json);

  const sharedSite = latestBy(productionRows, row => {
    const evidence = parseEvidenceJson(row.evidence_json);
    return Number(row.generation) === 10
      && String(row.outcome) === 'verified'
      && evidence?.service === 'shared-site'
      && evidence?.release?.productionVerified === true
      && evidence?.release?.stagingArtifactReproducible === true
      && evidence?.release?.artifactContinuityVerified === true;
  });
  const sharedSiteEvidence = parseEvidenceJson(sharedSite?.evidence_json);

  const rollback = latestBy(productionRows, row => {
    const evidence = parseEvidenceJson(row.evidence_json);
    return Number(row.generation) === 10
      && evidence?.release?.rollbackAttempted === true
      && evidence?.release?.rollbackVerified === true;
  });

  const greenE2E = latestBy(runtimeRows, row => {
    const evidence = parseEvidenceJson(row.evidence_json);
    return Number(row.generation) === 10
      && String(row.outcome) === 'verified'
      && evidence?.subject === 'green-change-end-to-end'
      && evidence?.verified === true;
  });

  const redGate = latestBy(runtimeRows, row => {
    const evidence = parseEvidenceJson(row.evidence_json);
    return Number(row.generation) === 10
      && String(row.outcome) === 'verified'
      && evidence?.subject === 'red-human-gate'
      && evidence?.verified === true;
  });

  if (!runtime) blockers.push('runtime_evidence_missing');
  if (runtime && runtimeEvidence?.evidence?.shortLivedTaskGrantProven !== true) blockers.push('short_lived_task_grant_evidence_missing');
  if (runtime && runtimeEvidence?.evidence?.parallelConvergenceProven !== true) blockers.push('parallel_convergence_evidence_missing');
  if (runtime && runtimeEvidence?.evidence?.sbomProvenanceCostBundleProven !== true) blockers.push('supply_chain_cost_evidence_missing');
  if (!sharedSite) blockers.push('shared_site_production_continuity_missing');
  if (!rollback) blockers.push('verified_rollback_recovery_evidence_missing');
  if (!greenE2E) blockers.push('green_change_end_to_end_evidence_missing');
  if (!redGate) blockers.push('red_human_gate_runtime_evidence_missing');

  const claim = architecture?.parallelExecution?.claimBoundary || {};
  if (claim.multiProviderFailureDomainIndependenceProven !== true) blockers.push('multi_provider_failure_domain_evidence_missing');

  const runtimeState = architecture?.runtimeEvidence || {};
  if (runtimeState.durableEvidenceLedgerRegistered !== true
      || runtimeState.durableEvidenceAppendOnly !== true
      || runtimeState.durableEvidenceRoundtripRequired !== true) {
    blockers.push('durable_evidence_ledger_contract_missing');
  }

  const ready = blockers.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    generation: 10,
    evaluator: 'evidence-driven-activation-v1',
    ready,
    blockers: Object.freeze(blockers),
    evidence: Object.freeze({
      runtimeEvidenceId: runtime?.id || null,
      sharedSiteProductionEvidenceId: sharedSite?.id || null,
      rollbackEvidenceId: rollback?.id || null,
      greenEndToEndEvidenceId: greenE2E?.id || null,
      redHumanGateEvidenceId: redGate?.id || null,
      runtimePayloadSha256: runtime?.payload_sha256 || runtimeEvidence?.payloadSha256 || null,
      sharedSiteArtifactDigest: sharedSiteEvidence?.release?.productionArtifactDigest || null,
      multiProviderFailureDomainIndependenceProven: claim.multiProviderFailureDomainIndependenceProven === true,
    }),
    claim: ready
      ? 'generation_10_activation_evidence_complete'
      : 'generation_10_activation_incomplete',
  });
}

function readArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : 'true';
  }
  return args;
}

function runCli() {
  const args = readArgs(process.argv.slice(2));
  if (!args.runtime || !args.production || !args.architecture || !args.output) {
    console.error('Usage: node scripts/evaluate-gen10-activation-evidence.mjs --runtime <d1.json> --production <d1.json> --architecture <json> --output <json>');
    process.exit(2);
  }
  const runtimeRows = collectRows(readJson(args.runtime));
  const productionRows = collectRows(readJson(args.production));
  const architecture = readJson(args.architecture);
  const result = evaluateGeneration10Activation({ runtimeRows, productionRows, architecture });
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2) + '\n');
  console.log(`Generation 10 activation evidence: ready=${result.ready} blockers=${result.blockers.join(',') || 'none'}`);
  if (args['require-ready'] === 'true' && !result.ready) process.exit(3);
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invoked) runCli();
