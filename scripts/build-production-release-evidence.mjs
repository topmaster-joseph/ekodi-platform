import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function matchValue(log, pattern) {
  return clean(log.match(pattern)?.[1] || '', 240) || null;
}

function boolMatch(log, pattern) {
  return pattern.test(log);
}

export function parseGuardedReleaseLog(input = '') {
  const log = String(input || '');
  const previousVersion = matchValue(log, /Stable production version:\s*([0-9a-f-]{36})/i);
  const candidateVersion = matchValue(log, /Candidate version:\s*([0-9a-f-]{36})/i);
  const firstDeploy = boolMatch(log, /First Worker deployment bootstrap complete/i);
  const releaseFailed = boolMatch(log, /Guarded Worker release failed:/i);
  const releaseComplete = boolMatch(log, /Guarded Worker release complete/i);
  const candidateAttached = boolMatch(log, /Phase 1\/3: attach candidate at 0% traffic/i);
  const candidateVerified = boolMatch(log, /Phase 3\/3: candidate passed/i);
  const rollbackAttempted = boolMatch(log, /Rolling back .* to .* at 100%/i);
  const rollbackVerified = boolMatch(log, /Automatic rollback verified against the stable rollback contract/i);
  const rollbackVerificationFailed = boolMatch(log, /Automatic rollback verification failed:/i);
  const productionVerified = releaseComplete || firstDeploy;
  const releaseReached = Boolean(previousVersion || candidateVersion || firstDeploy || releaseFailed || releaseComplete);
  const error = matchValue(log, /Guarded Worker release failed:\s*([^\n\r]+)/i)
    || matchValue(log, /Automatic rollback verification failed:\s*([^\n\r]+)/i);

  return Object.freeze({
    releaseReached,
    mode: firstDeploy ? 'first-deploy-bootstrap' : 'guarded-candidate-promotion',
    previousVersion,
    candidateVersion,
    candidateAttached,
    candidateVerified,
    productionVerified,
    rollbackAttempted,
    rollbackVerified,
    rollbackVerificationFailed,
    releaseComplete,
    releaseFailed,
    error,
  });
}

function slug(value, fallback = 'unknown') {
  return clean(value, 180).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

export function buildProductionEvidence({
  log = '',
  sourceRunId = '',
  sourceRunAttempt = '1',
  sourceWorkflow = 'Deploy Control API',
  sourceConclusion = '',
  sourceUrl = '',
  headSha = '',
  service = 'control-api',
  worker = 'ekodi-auth-api',
  recordedAt = new Date().toISOString(),
} = {}) {
  const release = parseGuardedReleaseLog(log);
  const runId = clean(sourceRunId, 120) || 'unknown';
  const runAttempt = clean(sourceRunAttempt, 40) || '1';
  const conclusion = clean(sourceConclusion, 40).toLowerCase() || 'unknown';
  const evidenceId = `prod_${slug(service)}_${slug(runId)}_${slug(runAttempt)}`;
  const outcome = release.productionVerified
    ? 'verified'
    : release.rollbackAttempted && release.rollbackVerified
      ? 'rolled_back_verified'
      : release.rollbackAttempted
        ? 'rollback_unverified'
        : release.releaseFailed
          ? 'release_failed'
          : release.releaseReached
            ? 'release_incomplete'
            : `workflow_${slug(conclusion)}`;

  return Object.freeze({
    schemaVersion: 1,
    kind: 'production_release_evidence',
    generation: 10,
    evidenceId,
    service: clean(service, 120) || 'control-api',
    worker: clean(worker, 160) || 'ekodi-auth-api',
    outcome,
    source: Object.freeze({
      workflow: clean(sourceWorkflow, 160) || 'Deploy Control API',
      runId,
      runAttempt,
      conclusion,
      url: clean(sourceUrl, 500) || null,
      headSha: clean(headSha, 80) || null,
      logSha256: crypto.createHash('sha256').update(String(log || '')).digest('hex'),
    }),
    release,
    recordedAt: clean(recordedAt, 80) || new Date().toISOString(),
  });
}

function sqlQuote(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function jsonHex(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('hex');
}

export function buildProductionEvidenceSql(evidence) {
  const release = evidence?.release || {};
  const source = evidence?.source || {};
  const json = jsonHex(evidence);
  return `PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS ai_production_evidence (
  id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  kind TEXT NOT NULL,
  service TEXT NOT NULL,
  worker TEXT NOT NULL,
  outcome TEXT NOT NULL,
  source_workflow TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  source_run_attempt TEXT NOT NULL,
  source_conclusion TEXT NOT NULL,
  source_url TEXT,
  head_sha TEXT,
  log_sha256 TEXT NOT NULL,
  release_reached INTEGER NOT NULL DEFAULT 0,
  previous_version TEXT,
  candidate_version TEXT,
  candidate_verified INTEGER NOT NULL DEFAULT 0,
  production_verified INTEGER NOT NULL DEFAULT 0,
  rollback_attempted INTEGER NOT NULL DEFAULT 0,
  rollback_verified INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_production_evidence_recorded ON ai_production_evidence(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_production_evidence_service ON ai_production_evidence(service, recorded_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_ai_production_evidence_no_update
BEFORE UPDATE ON ai_production_evidence
BEGIN
  SELECT RAISE(ABORT, 'ai_production_evidence is append-only');
END;
CREATE TRIGGER IF NOT EXISTS trg_ai_production_evidence_no_delete
BEFORE DELETE ON ai_production_evidence
BEGIN
  SELECT RAISE(ABORT, 'ai_production_evidence is append-only');
END;
INSERT OR IGNORE INTO ai_production_evidence (
  id, generation, kind, service, worker, outcome,
  source_workflow, source_run_id, source_run_attempt, source_conclusion, source_url,
  head_sha, log_sha256, release_reached, previous_version, candidate_version,
  candidate_verified, production_verified, rollback_attempted, rollback_verified,
  evidence_json, recorded_at
) VALUES (
  ${sqlQuote(evidence.evidenceId)},
  ${Number(evidence.generation || 10)},
  ${sqlQuote(evidence.kind)},
  ${sqlQuote(evidence.service)},
  ${sqlQuote(evidence.worker)},
  ${sqlQuote(evidence.outcome)},
  ${sqlQuote(source.workflow)},
  ${sqlQuote(source.runId)},
  ${sqlQuote(source.runAttempt)},
  ${sqlQuote(source.conclusion)},
  ${source.url ? sqlQuote(source.url) : 'NULL'},
  ${source.headSha ? sqlQuote(source.headSha) : 'NULL'},
  ${sqlQuote(source.logSha256)},
  ${release.releaseReached ? 1 : 0},
  ${release.previousVersion ? sqlQuote(release.previousVersion) : 'NULL'},
  ${release.candidateVersion ? sqlQuote(release.candidateVersion) : 'NULL'},
  ${release.candidateVerified ? 1 : 0},
  ${release.productionVerified ? 1 : 0},
  ${release.rollbackAttempted ? 1 : 0},
  ${release.rollbackVerified ? 1 : 0},
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
  if (!args.log || !args.output || !args.sql) {
    console.error('Usage: node scripts/build-production-release-evidence.mjs --log <deploy.log> --output <evidence.json> --sql <evidence.sql> --source-run-id <id> [metadata]');
    process.exit(2);
  }
  const log = fs.readFileSync(args.log, 'utf8');
  const evidence = buildProductionEvidence({
    log,
    sourceRunId: args['source-run-id'],
    sourceRunAttempt: args['source-run-attempt'],
    sourceWorkflow: args['source-workflow'],
    sourceConclusion: args['source-conclusion'],
    sourceUrl: args['source-url'],
    headSha: args['head-sha'],
    service: args.service,
    worker: args.worker,
  });
  fs.writeFileSync(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  fs.writeFileSync(args.sql, buildProductionEvidenceSql(evidence), 'utf8');
  console.log(`Production evidence prepared: ${evidence.evidenceId} outcome=${evidence.outcome} productionVerified=${evidence.release.productionVerified} rollbackVerified=${evidence.release.rollbackVerified}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) runCli();
