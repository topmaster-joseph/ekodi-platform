import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleClosure,
  laneWorkflowProblems,
  lanesForChangedFiles,
  listProductionWorkers,
  validateWorkerLanes,
} from '../scripts/lib/worker-bundle-graph.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// CI contract (WORKER-LANE-GRAPH-001): a production Worker without a dispatchable,
// receipt-aware lane fails here, before it can silently miss a release.
test('every production Worker has a receipt-aware deploy lane or a recorded exclusion', () => {
  const result = validateWorkerLanes(root);
  assert.deepEqual(result.errors, []);
  assert.ok(result.workers >= 40);
});

// 2026-10-24: config/user-footer.js (통신판매업신고번호, 환불정책) reached Site Core
// but 17 service Workers kept the old legal footer. The graph must cover them all.
test('a shared legal footer change dispatches every service Worker that bundles it', () => {
  const plan = lanesForChangedFiles(root, ['config/user-footer.js']);
  const workflows = plan.dispatches.map(item => item.workflow);
  for (const lane of [
    'deploy-journal.yml', 'deploy-money.yml', 'deploy-my.yml', 'deploy-books.yml', 'deploy-community.yml',
    'deploy-life-ai.yml', 'deploy-management.yml', 'deploy-experience.yml', 'deploy-bible.yml',
    'deploy-publishing.yml', 'deploy-support-opportunity.yml', 'deploy-work.yml', 'deploy-social.yml',
    'deploy-energy.yml', 'deploy-author.yml', 'deploy-delivery-hub-ai.yml', 'deploy-local-commerce.yml',
    'deploy-site-core.yml', 'deploy-ekodi-shell.yml',
  ]) assert.ok(workflows.includes(lane), `${lane} must be dispatched`);
  assert.deepEqual(plan.unowned, []);
  assert.deepEqual(plan.dispatches.find(item => item.workflow === 'deploy-site-core.yml').inputs, { sync_domains: 'false' });
  const business = plan.affected.find(item => item.config === 'wrangler.business.toml');
  assert.ok(business && !business.workflow && /Orphaned/.test(business.excluded));
});

test('non-bundled church Cloudflare rule script dispatches only its guarded Worker lane', () => {
  const script='scripts/cloudflare-church-naver-redirect-exception.mjs';
  const plan=lanesForChangedFiles(root,[script]);
  assert.deepEqual(plan.dispatches.map(item=>item.workflow),['deploy-church-naver-proof.yml']);
  assert.deepEqual(plan.affected.find(item=>item.config==='wrangler.church-naver-proof.toml')?.touched,[script]);
  assert.deepEqual(plan.unowned,[]);
  assert.equal(lanesForChangedFiles(root,['scripts/unrelated-missing.mjs']).dispatches.length,0);
});

test('a change outside every Worker bundle dispatches nothing', () => {
  const plan = lanesForChangedFiles(root, ['docs/operations/cloudflare-two-account-boundary.md']);
  assert.deepEqual(plan.dispatches, []);
});

test('local-commerce is a production Worker, staging and build configs are not', () => {
  const configs = listProductionWorkers(root).map(worker => worker.config);
  assert.ok(configs.includes('wrangler.local-commerce.toml'));
  assert.ok(!configs.includes('wrangler.local-commerce.staging.toml'));
  assert.ok(!configs.includes('wrangler.ai.build.toml'));
});

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-lanes-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

const receiptLane = `name: Deploy A
on:
  workflow_dispatch:
    inputs:
      release_branch_ref:
        type: string
      release_task_id:
        type: string
  push:
    branches: [main]
env:
  EKODI_RELEASE_BRANCH_REF: \${{ inputs.release_branch_ref || '' }}
jobs:
  production:
    if: github.event_name != 'pull_request'
    steps:
      - name: EKODI AI Orchestration Gate
        run: node "$GITHUB_WORKSPACE/scripts/validate-ekodi-ai-change-orchestration.mjs" --release
`;

test('transitive imports resolve through re-exports, bare imports and dynamic imports', () => {
  const dir = fixture({
    'a-worker.js': "import { x } from './lib/x.js';\nimport './side.js';\nconst lazy = () => import('./lazy.js');\n",
    'lib/x.js': "export { y } from '../shared/y.js';\n",
    'shared/y.js': 'export const y = 1;\n',
    'side.js': '', 'lazy.js': '', 'unrelated.js': '',
  });
  const closure = bundleClosure(dir, 'a-worker.js');
  for (const file of ['a-worker.js', 'lib/x.js', 'shared/y.js', 'side.js', 'lazy.js']) assert.ok(closure.has(file), file);
  assert.ok(!closure.has('unrelated.js'));
});

test('lane validation fails closed on missing entries, missing inputs, unwired gates and push-only production', () => {
  const dir = fixture({
    'wrangler.a.toml': 'name = "a"\nmain = "a.js"\n', 'a.js': '',
    'wrangler.b.toml': 'name = "b"\nmain = "b.js"\n', 'b.js': '',
    'wrangler.c.toml': 'name = "c"\nmain = "c.js"\n', 'c.js': '',
    'wrangler.c.staging.toml': 'name = "c-staging"\nmain = "c.js"\n',
    '.github/workflows/deploy-a.yml': receiptLane,
    '.github/workflows/deploy-b.yml': `name: Deploy B
on:
  workflow_dispatch:
  push:
    branches: [main]
jobs:
  deploy-production:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: EKODI AI Orchestration Gate
        run: node "$GITHUB_WORKSPACE/scripts/validate-ekodi-ai-change-orchestration.mjs" --release
`,
    'config/worker-deploy-lanes.json': JSON.stringify({ workers: {
      'wrangler.a.toml': { workflow: 'deploy-a.yml' },
      'wrangler.b.toml': { workflow: 'deploy-b.yml' },
    } }),
  });
  const result = validateWorkerLanes(dir);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => /wrangler\.c\.toml .*no entry/.test(error)));
  assert.ok(!result.errors.some(error => /c\.staging/.test(error)));
  assert.ok(result.errors.some(error => /deploy-b\.yml does not accept release_branch_ref, release_task_id/.test(error)));
  assert.ok(result.errors.some(error => /deploy-b\.yml job deploy-production runs the --release gate without EKODI_RELEASE_BRANCH_REF/.test(error)));
  assert.ok(result.errors.some(error => /deploy-b\.yml job deploy-production only reaches production on push/.test(error)));
  assert.ok(!result.errors.some(error => /deploy-a\.yml/.test(error)));
});

test('pull-request-only jobs, job-level env and GITHUB_ENV exports satisfy the receipt rule', () => {
  const dir = fixture({
    '.github/workflows/deploy-x.yml': `name: Deploy X
on:
  workflow_dispatch:
    inputs:
      release_branch_ref:
        type: string
      release_task_id:
        type: string
jobs:
  staging:
    if: github.event_name == 'pull_request'
    steps:
      - name: EKODI AI Orchestration Gate
        run: node "$GITHUB_WORKSPACE/scripts/validate-ekodi-ai-change-orchestration.mjs" --release
  production:
    env:
      EKODI_RELEASE_BRANCH_REF: \${{ inputs.release_branch_ref }}
    steps:
      - name: EKODI AI Orchestration Gate
        run: node "$GITHUB_WORKSPACE/scripts/validate-ekodi-ai-change-orchestration.mjs" --release
  verify:
    steps:
      - name: Resolve receipt
        run: echo "EKODI_RELEASE_BRANCH_REF=$branch" >> "$GITHUB_ENV"
      - name: EKODI AI Orchestration Gate
        run: node "$GITHUB_WORKSPACE/scripts/validate-ekodi-ai-change-orchestration.mjs" --release
`,
  });
  assert.deepEqual(laneWorkflowProblems(dir, 'deploy-x.yml'), []);
});

test('an exclusion needs a written reason and an unknown registry entry is rejected', () => {
  const dir = fixture({
    'wrangler.a.toml': 'name = "a"\nmain = "a.js"\n', 'a.js': '',
    'config/worker-deploy-lanes.json': JSON.stringify({ workers: {
      'wrangler.a.toml': { excluded: 'n/a' },
      'wrangler.ghost.toml': { workflow: 'deploy-a.yml' },
    } }),
  });
  const result = validateWorkerLanes(dir);
  assert.ok(result.errors.some(error => /wrangler\.a\.toml exclusion needs a reason/.test(error)));
  assert.ok(result.errors.some(error => /unknown production Worker wrangler\.ghost\.toml/.test(error)));
});

test('a bundled Worker without a registry entry is reported as unowned', () => {
  const dir = fixture({
    'wrangler.a.toml': 'name = "a"\nmain = "a.js"\n', 'a.js': "import './shared.js';\n", 'shared.js': '',
    'config/worker-deploy-lanes.json': JSON.stringify({ workers: {} }),
  });
  const plan = lanesForChangedFiles(dir, ['shared.js']);
  assert.deepEqual(plan.dispatches, []);
  assert.deepEqual(plan.unowned.map(item => item.name), ['a']);
});

test('converge resolves bundle lanes before merging and dispatches them with the orchestrator receipt', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/converge-orchestrated-pr-merge.mjs'), 'utf8');
  assert.match(source, /import \{ lanesForChangedFiles \} from '\.\/lib\/worker-bundle-graph\.mjs'/);
  const resolvedAt = source.indexOf('bundleLanes=lanesForChangedFiles(');
  assert.ok(resolvedAt > 0 && resolvedAt < source.indexOf('for(let cycle=0;'), 'lanes resolve before the merge loop');
  assert.match(source, /if\(handDispatchedLanes\.has\(lane\.workflow\)\)continue;/);
  assert.match(source, /Object\.fromEntries\(Object\.entries\(lane\.inputs\|\|\{\}\)\.map/);
  assert.match(source, /release_branch_ref:branch,release_task_id:taskId/);
  const post = source.slice(source.indexOf('async function dispatchPostMergeDeploys(){'));
  assert.match(post, /await dispatchBundleGraphLanes\(\);\n\}/);
});

// WORKER-LANE-ASSETS-001: #6073 changed only bible/devotion.* (static assets) and the
// Bible Worker was never redeployed. Asset-directory and lane-workflow changes must dispatch.
test('changes inside a Worker [assets] directory dispatch that Worker lane', () => {
  const result = lanesForChangedFiles(root, ['bible/devotion.js', 'bible/devotion.css']);
  assert.deepEqual(result.dispatches.map(d => d.workflow), ['deploy-bible.yml']);
  const bible = result.affected.find(item => item.config === 'wrangler.bible.toml');
  assert.deepEqual(bible.touched, ['bible/devotion.css', 'bible/devotion.js']);
});

test('a change to a lane workflow file dispatches its own lane', () => {
  const result = lanesForChangedFiles(root, ['.github/workflows/deploy-bible.yml']);
  assert.deepEqual(result.dispatches.map(d => d.workflow), ['deploy-bible.yml']);
});

test('asset prefix matching is directory-bounded and ignores unrelated files', () => {
  assert.equal(lanesForChangedFiles(root, ['bible-notes.md', 'README.md', 'biblesomething/x.js']).dispatches.length, 0);
});

test('education dispatch uses the verified protected main merge SHA required by its workflow', () => {
  const plan=lanesForChangedFiles(root,['config/user-footer.js']);
  const education=plan.dispatches.find(lane=>lane.workflow==='deploy-education.yml');
  assert.equal(education?.inputs?.release_sha,'$PROTECTED_MERGE_SHA');
  const source=fs.readFileSync(path.join(root,'scripts/converge-orchestrated-pr-merge.mjs'),'utf8');
  assert.match(source,/needsMergeSha=bundleLanes\.dispatches\.some/);
  assert.match(source,/mergedPr\.data\.merge_commit_sha/);
  assert.match(source,/mainRef\.data\?\.object\?\.sha/);
  assert.match(source,/value==='\$PROTECTED_MERGE_SHA'\?protectedMergeSha:value/);
});

test('a change to EKODIBIZ registered merchant homepage dispatches its own guarded worker', () => {
  const plan=lanesForChangedFiles(root,['ekodibiz/site.js','ekodibiz/index.html']);
  assert.ok(plan.dispatches.some(lane=>lane.workflow==='deploy-ekodibiz.yml'));
  assert.deepEqual(plan.affected.find(item=>item.config==='wrangler.ekodibiz.toml')?.touched,
    ['ekodibiz/index.html','ekodibiz/site.js']);
});
