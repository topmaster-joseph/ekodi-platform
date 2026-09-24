import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

const REQUIRED_ARTIFACTS = Object.freeze({
  taskGrant: 'ekodi-gen10-task-grant-proof-',
  nativeLane: 'ekodi-gen10-native-parallel-proof-',
  rootlessSandbox: 'ekodi-gen10-rootless-sandbox-proof-',
  parallelConvergence: 'ekodi-gen10-parallel-convergence-proof-',
  supplyChain: 'ekodi-gen10-supply-chain-proof-',
});

function slug(value, fallback = 'unknown') {
  return clean(value, 180).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function normalizeArtifacts(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  return rows
    .map(row => Object.freeze({
      id: Number(row?.id || 0) || null,
      name: clean(row?.name, 240),
      digest: clean(row?.digest, 120) || null,
      expired: row?.expired === true,
      sizeInBytes: Number(row?.size_in_bytes || 0) || 0,
      createdAt: clean(row?.created_at, 80) || null,
      expiresAt: clean(row?.expires_at, 80) || null,
    }))
    .filter(row => row.name);
}

function findRequiredArtifacts(artifacts) {
  return Object.freeze(Object.fromEntries(Object.entries(REQUIRED_ARTIFACTS).map(([key, prefix]) => {
    const artifact = artifacts.find(item => item.name.startsWith(prefix)) || null;
    return [key, artifact];
  })));
}

export function buildRuntimeEvidence({
  artifactsPayload = {},
  sourceRunId = '',
  sourceRunAttempt = '1',
  sourceWorkflow = 'EKODI Autonomous Execution Fabric Runtime Proof',
  sourceConclusion = '',
  sourceUrl = '',
  headSha = '',
  recordedAt = new Date().toISOString(),
} = {}) {
  const artifacts = normalizeArtifacts(artifactsPayload);
  const required = findRequiredArtifacts(artifacts);
  const requiredArtifactNames = Object.fromEntries(Object.entries(required).map(([key, value]) => [key, value?.name || null]));
  const requiredArtifactDigests = Object.fromEntries(Object.entries(required).map(([key, value]) => [key, value?.digest || null]));
  const requiredArtifactsPresent = Object.values(required).every(Boolean);
  const requiredArtifactDigestsValid = Object.values(required).every(value => /^sha256:[0-9a-f]{64}$/i.test(String(value?.digest || '')));
  const noRequiredArtifactExpired = Object.values(required).every(value => value && value.expired !== true);

  const runId = clean(sourceRunId, 120) || 'unknown';
  const runAttempt = clean(sourceRunAttempt, 40) || '1';
  const conclusion = clean(sourceConclusion, 40).toLowerCase() || 'unknown';
  const verified = conclusion === 'success' && requiredArtifactsPresent && requiredArtifactDigestsValid && noRequiredArtifactExpired;
  const outcome = verified ? 'verified' : conclusion === 'success' ? 'incomplete_evidence' : `workflow_${slug(conclusion)}`;
  const evidenceId = `runtime_execution-fabric_${slug(runId)}_${slug(runAttempt)}`;

  const digestSubject = {
    sourceWorkflow: clean(sourceWorkflow, 160),
    sourceRunId: runId,
    sourceRunAttempt: runAttempt,
    sourceConclusion: conclusion,
    headSha: clean(headSha, 80) || null,
    requiredArtifactDigests,
  };
  const payloadSha256 = sha256(JSON.stringify(digestSubject));

  return Object.freeze({
    schemaVersion: 1,
    kind: 'execution_fabric_runtime_evidence',
    generation: 10,
    evidenceId,
    subject: 'autonomous-execution-fabric',
    outcome,
    verified,
    source: Object.freeze({
      workflow: clean(sourceWorkflow, 160) || 'EKODI Autonomous Execution Fabric Runtime Proof',
      runId,
      runAttempt,
      conclusion,
      url: clean(sourceUrl, 500) || null,
      headSha: clean(headSha, 80) || null,
    }),
    evidence: Object.freeze({
      artifactCount: artifacts.length,
      requiredArtifactsPresent,
      requiredArtifactDigestsValid,
      noRequiredArtifactExpired,
      requiredArtifactNames,
      requiredArtifactDigests,
      shortLivedTaskGrantProven: Boolean(required.taskGrant),
      nativeEphemeralLaneProven: Boolean(required.nativeLane),
      rootlessSandboxProven: Boolean(required.rootlessSandbox),
      parallelConvergenceProven: Boolean(required.parallelConvergence),
      sbomProvenanceCostBundleProven: Boolean(required.supplyChain),
      productionSecretExposureClaimed: false,
      productionMutationPerformed: false,
      authorityExpanded: false,
      autonomousProductionReadinessClaimed: false,
    }),
    payloadSha256,
    artifacts,
    recordedAt: clean(recordedAt, 80) || new Date().toISOString(),
  });
}

function sqlQuote(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function jsonHex(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('hex');
}

export function buildRuntimeEvidenceSql(evidence) {
  const source = evidence?.source || {};
  const json = jsonHex(evidence);
  return `PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS ai_generation10_evidence (
  id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  outcome TEXT NOT NULL,
  source_workflow TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  source_run_attempt TEXT NOT NULL,
  source_conclusion TEXT NOT NULL,
  source_url TEXT,
  head_sha TEXT,
  payload_sha256 TEXT NOT NULL,
  artifact_count INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_generation10_evidence_recorded ON ai_generation10_evidence(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation10_evidence_subject ON ai_generation10_evidence(subject, recorded_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_ai_generation10_evidence_no_update
BEFORE UPDATE ON ai_generation10_evidence
BEGIN
  SELECT RAISE(ABORT, 'ai_generation10_evidence is append-only');
END;
CREATE TRIGGER IF NOT EXISTS trg_ai_generation10_evidence_no_delete
BEFORE DELETE ON ai_generation10_evidence
BEGIN
  SELECT RAISE(ABORT, 'ai_generation10_evidence is append-only');
END;
INSERT OR IGNORE INTO ai_generation10_evidence (
  id, generation, kind, subject, outcome,
  source_workflow, source_run_id, source_run_attempt, source_conclusion, source_url,
  head_sha, payload_sha256, artifact_count, evidence_json, recorded_at
) VALUES (
  ${sqlQuote(evidence.evidenceId)},
  ${Number(evidence.generation || 10)},
  ${sqlQuote(evidence.kind)},
  ${sqlQuote(evidence.subject)},
  ${sqlQuote(evidence.outcome)},
  ${sqlQuote(source.workflow)},
  ${sqlQuote(source.runId)},
  ${sqlQuote(source.runAttempt)},
  ${sqlQuote(source.conclusion)},
  ${source.url ? sqlQuote(source.url) : 'NULL'},
  ${source.headSha ? sqlQuote(source.headSha) : 'NULL'},
  ${sqlQuote(evidence.payloadSha256)},
  ${Number(evidence?.evidence?.artifactCount || 0)},
  CAST(X'${json}' AS TEXT),
  ${sqlQuote(evidence.recordedAt)}
);
`;
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
  if (!args.artifacts || !args.output || !args.sql) {
    console.error('Usage: node scripts/build-gen10-runtime-evidence.mjs --artifacts <artifacts.json> --output <evidence.json> --sql <evidence.sql> --source-run-id <id> [metadata]');
    process.exit(2);
  }
  const artifactsPayload = JSON.parse(fs.readFileSync(args.artifacts, 'utf8'));
  const evidence = buildRuntimeEvidence({
    artifactsPayload,
    sourceRunId: args['source-run-id'],
    sourceRunAttempt: args['source-run-attempt'],
    sourceWorkflow: args['source-workflow'],
    sourceConclusion: args['source-conclusion'],
    sourceUrl: args['source-url'],
    headSha: args['head-sha'],
  });
  fs.writeFileSync(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  fs.writeFileSync(args.sql, buildRuntimeEvidenceSql(evidence), 'utf8');
  console.log(`Generation 10 runtime evidence prepared: ${evidence.evidenceId} outcome=${evidence.outcome} artifacts=${evidence.evidence.artifactCount}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) runCli();
