import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow=readFileSync(resolve(root,'.github/workflows/deploy-ekodi-church-homepage.yml'),'utf8');
const builder=readFileSync(resolve(root,'scripts/build-church-pages-candidate.mjs'),'utf8');
const sourceManifest=JSON.parse(readFileSync(resolve(root,'sites/ekodi-church/source-import-manifest.json'),'utf8'));
const getPosition=(s)=>workflow.indexOf(s);

test('Church release remains manual receipt-gated and never pushes the Pages project from a workflow edit',()=>{
  assert.match(workflow,/on:\s*\n\s*workflow_dispatch:/);
  assert.match(workflow,/if:\s*github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/release_branch_ref:/);
  assert.match(workflow,/release_task_id:/);
  assert.match(workflow,/EKODI AI Orchestration Gate/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs.*--release/);
  assert.ok(getPosition('EKODI AI Orchestration Gate')<getPosition('Bind canonical Church source'));
  assert.ok(getPosition('Bind canonical Church source')<getPosition('Deploy Church to Cloudflare Pages'));
});
test('legacy release and existing independent Cloudflare Pages project remain unchanged by default',()=>{
  assert.match(workflow,/if: vars\.CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED != 'true'/);
  assert.match(workflow,/repository: topmaster-joseph\/ekodi-church/);
  assert.match(workflow,/CHURCH_RELEASE_SOURCE_MODE=legacy/);
  assert.match(workflow,/ekodi\.church-release\.v1/);
  assert.match(workflow,/--project-name ekodi-church --branch main/);
  assert.equal((workflow.match(/--project-name ekodi-church/g)||[]).length,1);
});
test('canonical release requires explicit cutover flag, exact protected main SHA, and a v2 payload receipt',()=>{
  assert.match(workflow,/if: vars\.CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED == 'true'/);
  assert.match(workflow,/test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow,/test "\$platform_sha" = "\$GITHUB_SHA"/);
  assert.match(workflow,/ln -s "\$GITHUB_WORKSPACE\/\.ekodi-control\/sites\/ekodi-church" church/);
  assert.match(workflow,/build-church-pages-candidate\.mjs/);
  assert.match(workflow,/--source \.ekodi-control\/sites\/ekodi-church/);
  assert.match(workflow,/--sha "\$CHURCH_SOURCE_SHA"/);
  assert.match(workflow,/CHURCH_PAYLOAD_SHA256/);
  assert.match(workflow,/\.sourceModule == "sites\/ekodi-church"/);
  assert.match(workflow,/\.sourceSha == \$sha and \.payloadSha256 == \$digest/);
  assert.match(builder,/ekodi\.church-release\.v2/);
  assert.equal(sourceManifest.productionReleaseSwitched,false);
  assert.equal(sourceManifest.sourceOwnershipTransferred,false);
  assert.equal(sourceManifest.legacyRepositoryDeletionAuthorized,false);
});
test('Cloudflare Pages upload and production verification preserve service boundaries',()=>{
  assert.match(workflow,/CLOUDFLARE_API_TOKEN/);
  assert.match(workflow,/CLOUDFLARE_ACCOUNT_ID/);
  assert.match(workflow,/concurrency:\s*\n\s*group: ekodi-church-homepage-production/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/ekodichurch\/church-release\.json/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/ekodichurch\/my\//);
  assert.match(workflow,/https:\/\/ekodi\.kr\/ekodichurch\/devotion\//);
  assert.doesNotMatch(workflow,/gh\s+pr\s+merge|git\s+push.*main/);
});
