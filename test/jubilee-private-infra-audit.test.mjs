import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeJubileePublisherInfra as analyze} from '../scripts/audit-jubilee-publisher-infra.mjs';

test('only qualified private publisher-owned resource candidates are shown',()=>{
  const out=analyze({
    r2Buckets:['shared-assets','ekodi-publishing-private-editorial','unrelated-backups'],
    d1Databases:['ekodi-publishing','ekodi-publishing-private-ingest','ekodi-auth'],
    workerScripts:['ekodi-publishing','ekodi-publishing-private-ingest','shared-core'],
  });
  assert.deepEqual(out.r2Candidates,['ekodi-publishing-private-editorial']);
  assert.deepEqual(out.d1Candidates,['ekodi-publishing-private-ingest']);
  assert.deepEqual(out.workerCandidates,['ekodi-publishing-private-ingest']);
  assert.equal(out.privateIngestionReady,false,'mere existence never proves durable intake authorization');
});
test('missing publisher-private infrastructure remains blocked',()=>{
  const out=analyze({r2Buckets:['ekodi-publishing'],d1Databases:['ekodi-publishing'],workerScripts:['ekodi-publishing']});
  assert.equal(out.privateR2CandidateCount,0);
  assert.equal(out.privateD1CandidateCount,0);
  assert.equal(out.privateWorkerCandidateCount,0);
  assert.equal(out.privateIngestionReady,false);
});
test('malformed audit names and arrays fail closed',()=>{
  const valid={r2Buckets:[],d1Databases:[],workerScripts:[]};
  assert.throws(()=>analyze({...valid,r2Buckets:null}));
  assert.throws(()=>analyze({...valid,d1Databases:['bad\nsecret-value']}));
  assert.throws(()=>analyze({...valid,workerScripts:[{name:'bad'}]}));
});
test('guarded inventory workflow never publishes manuscript bytes or mutates storage',()=>{
  const wf=readFileSync(new URL('../.github/workflows/publishing-jubilee-private-infra-inventory.yml',import.meta.url),'utf8');
  const source=readFileSync(new URL('../scripts/audit-jubilee-publisher-infra.mjs',import.meta.url),'utf8');
  assert.match(wf,/workflow_dispatch:/);
  assert.match(wf,/name: EKODI AI Orchestration Gate/);
  assert.match(wf,/node "\$GITHUB_WORKSPACE\/scripts\/validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(wf,/inputs\.release_task_id/);
  assert.match(wf,/secrets\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(wf,/pull_request:|upload-artifact|secret put|r2 object put|d1 execute/);
  assert.match(source,/method|fetch\(url/);
  assert.doesNotMatch(source,/\b(?:PUT|POST|PATCH|DELETE)\b/);
});
