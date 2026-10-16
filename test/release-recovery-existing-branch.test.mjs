import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessExactRecoveryBranch} from '../scripts/release-recovery-branch-evidence.mjs';

const expectedSha='a'.repeat(40);
const ref=(status,sha)=>({ok:status===200,status,sha});
const branch=(status,sha)=>({ok:status===200,status,sha});
const check=(gitRef,branchResponse,sha=expectedSha)=>
  assessExactRecoveryBranch({gitRef,branch:branchResponse,expectedSha:sha});

test('existing exact-SHA Git ref is authoritative without creating another ref',()=>{
  assert.equal(check(ref(200,expectedSha),null),true);
  assert.throws(()=>check(ref(200,'b'.repeat(40)),null),/existing recovery branch does not match/);
});
test('independently verified branch repairs git-ref 404/403 visibility without changing SHA policy',()=>{
  assert.equal(check(ref(404),branch(200,expectedSha)),true);
  assert.equal(check(ref(403),branch(200,expectedSha)),true);
  assert.throws(()=>check(ref(404),branch(200,'b'.repeat(40))),/existing recovery branch does not match/);
  assert.throws(()=>check(ref(403),branch(200,'b'.repeat(40))),/existing recovery branch does not match/);
});
test('absent branch, unreadable branch, invalid source SHA all fail closed',()=>{
  assert.equal(check(ref(404),branch(404)),false);
  assert.equal(check(ref(403),branch(404)),false);
  assert.throws(()=>check(ref(403),branch(403)),/failed to inspect recovery branch/);
  assert.throws(()=>check(ref(500),null),/failed to inspect existing recovery branch/);
  assert.throws(()=>check(ref(200,expectedSha),null,'incorrect'),/invalid approved recovery SHA/);
});
test('trusted provenance script only accepts 403/422 ref creation after exact-SHA readback',async()=>{
  const source=await readFile(new URL('../scripts/recover-release-provenance.mjs',import.meta.url),'utf8');
  assert.match(source,/assessExactRecoveryBranch\(/);
  assert.match(source,/existingBranchPath/);
  assert.match(source,/branches\/\$\{encodeURIComponent\(branchRef\)\}/);
  assert.match(source,/\[403,422\]\.includes\(ref\.response\.status\)/);
  assert.match(source,/if\(!await existingExactRecoveryBranch\(\)\)/);
  assert.match(source,/failed to create or verify exact-SHA recovery branch/);
  assert.match(source,/recovery receipt not authorized/);
  assert.doesNotMatch(source,/ref\.response\.status===403\)\s*\{\s*return true/);
});
