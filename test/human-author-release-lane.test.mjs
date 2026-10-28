import test from 'node:test';
import assert from 'node:assert/strict';
import { requiresHumanAuthorSchemaRelease,requiresCreatorAuthorRelease,
  releaseSpecForHumanAuthorSchema,releaseSpecForCreatorAuthor } from '../scripts/lib/human-author-release-lane.mjs';

const branch='ai/chatgpt/orch_recovery_619e4c9c622670d9e2c3975b4805470a';
const sha='c'.repeat(40);

test('only approved files trigger the private Human Author schema lane',()=>{
  assert.equal(requiresHumanAuthorSchemaRelease(['docs/unrelated.md']),false);
  assert.equal(requiresHumanAuthorSchemaRelease(['scripts/lib/human-author-release-lane.mjs']),true);
  assert.equal(requiresHumanAuthorSchemaRelease(['supabase/migrations/20261028010000_human_author_membership_writing.sql']),true);
  assert.equal(requiresCreatorAuthorRelease(['author/app.js']),true);
  assert.equal(requiresCreatorAuthorRelease(['author/human-writer.js']),true);
  assert.equal(requiresCreatorAuthorRelease(['books/books.json']),false);
});

test('dispatch is main-only, source receipt-derived, exact commit-pinned and dormant by default',()=>{
  assert.equal(releaseSpecForHumanAuthorSchema({changedFiles:['books/books.json'],branch,mergeSha:sha}),null);
  const spec=releaseSpecForHumanAuthorSchema({changedFiles:['scripts/lib/human-author-release-lane.mjs'],branch,mergeSha:sha});
  assert.deepEqual(spec,{workflow:'deploy-human-author-schema.yml',ref:'main',inputs:{
    release_branch_ref:branch,release_task_id:'orch_recovery_619e4c9c622670d9e2c3975b4805470a',
    expected_main_sha:sha }});
  assert.throws(()=>releaseSpecForHumanAuthorSchema({changedFiles:['scripts/lib/human-author-release-lane.mjs'],branch:'main',mergeSha:sha}),/receipt/);
  assert.throws(()=>releaseSpecForHumanAuthorSchema({changedFiles:['scripts/lib/human-author-release-lane.mjs'],branch,mergeSha:'0'}),/main_sha/);
});

test('Creator AI uses the same verified receipt but no untrusted customer token',()=>{
  const spec=releaseSpecForCreatorAuthor({changedFiles:['author/human-writer.js'],branch});
  assert.deepEqual(spec,{workflow:'deploy-author.yml',ref:'main',inputs:{
    release_branch_ref:branch,release_task_id:'orch_recovery_619e4c9c622670d9e2c3975b4805470a'}});
  assert.equal(releaseSpecForCreatorAuthor({changedFiles:['publishing/human/app.js'],branch}),null);
});

test('no author data, credential, or service role rides in a dispatch payload',()=>{
  const spec=releaseSpecForHumanAuthorSchema({changedFiles:['scripts/lib/human-author-release-lane.mjs'],branch,mergeSha:sha});
  assert.deepEqual(Object.keys(spec.inputs).sort(),['expected_main_sha','release_branch_ref','release_task_id']);
  assert.doesNotMatch(JSON.stringify(spec),/service_role|SUPABASE_ACCESS_TOKEN|user_id|price|paymentKey/);
});
