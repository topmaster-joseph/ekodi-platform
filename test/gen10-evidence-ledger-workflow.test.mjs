import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/gen10-production-evidence-ledger.yml', 'utf8');

test('Generation 10 evidence ledger watches both production release boundaries and execution-fabric runtime proof', () => {
  for (const source of [
    "'Deploy Control API'",
    "'Deploy EKODI Shared Site Core'",
    "'EKODI Autonomous Execution Fabric Runtime Proof'",
  ]) assert.ok(workflow.includes(source), `missing evidence source workflow: ${source}`);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
});

test('Shared Site success must carry reproducible staging and exact production artifact continuity evidence', () => {
  assert.match(workflow, /Deploy EKODI Shared Site Core/);
  assert.match(workflow, /EVIDENCE_SERVICE=shared-site/);
  assert.match(workflow, /EVIDENCE_WORKER=shy-thunder-39a4/);
  assert.match(workflow, /stagingArtifactReproducible/);
  assert.match(workflow, /artifactContinuityVerified/);
  assert.match(workflow, /successful Shared Site workflow lacks staging-to-production digest continuity evidence/);
});

test('execution-fabric proof persists required artifact digests into append-only runtime ledger', () => {
  assert.match(workflow, /actions\/runs\/\$SOURCE_RUN_ID\/artifacts\?per_page=100/);
  assert.match(workflow, /build-gen10-runtime-evidence\.mjs/);
  assert.match(workflow, /ai_generation10_evidence/);
  assert.match(workflow, /successful execution-fabric workflow lacks the complete required runtime evidence set/);
  assert.match(workflow, /payload digest mismatch/);
  assert.match(workflow, /artifact count mismatch/);
  assert.match(workflow, /auxiliary runtime evidence row not found after insert/);
  assert.match(workflow, /auxiliary verification mismatch/);
});

test('evidence writers keep production credentials outside execution sandboxes', () => {
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /record-production-evidence:/);
  assert.match(workflow, /record-runtime-evidence:/);
  assert.doesNotMatch(workflow, /podman run[\s\S]{0,800}CLOUDFLARE_API_TOKEN/);
});


test('durable ledger evaluates activation from D1 evidence and publishes an auditable snapshot', () => {
  assert.match(workflow, /evaluate-activation-evidence:/);
  assert.match(workflow, /SELECT id,generation,outcome,payload_sha256,artifact_count,evidence_json,recorded_at FROM ai_generation10_evidence/);
  assert.match(workflow, /SELECT id,generation,outcome,evidence_json,recorded_at FROM ai_production_evidence/);
  assert.match(workflow, /evaluate-gen10-activation-evidence\.mjs/);
  assert.match(workflow, /gen10-activation-evidence-/);
  assert.doesNotMatch(workflow, /--require-ready true/);
});
