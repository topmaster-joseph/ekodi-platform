import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const ci=readFileSync('.github/workflows/ci.yml','utf8');
const gate=readFileSync('.github/workflows/ekodi-ai-orchestration-gate.yml','utf8');
for(const [name,w] of [['CI',ci],['EKODI AI Orchestration Gate',gate]]){
  test(name+' checks genuinely run on merge_group rather than copying legacy PR statuses',()=>{
    assert.match(w,/\n  pull_request:\s*\n  merge_group:\s*\n    types: \[checks_requested\]/);
    assert.match(w,/on:\s*\n  (?:push:|pull_request:)/);
    assert.match(w,/STATUS_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
    assert.match(w,/STATUS_PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \|\| '' \}\}/);
    assert.match(w,/\n  contents: read\n/);
    assert.doesNotMatch(w,/pull_request_target:/);
    assert.doesNotMatch(w,/branches: \[gh-readonly-queue\/main\]/);
  });
}
test('merge_group compares to actual immutable merge-group base while leaving PR policies intact',()=>{
  assert.match(gate,/ZERO_SUBDOMAIN_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.merge_group\.base_sha \|\| github\.event\.before \}\}/);
  assert.match(gate,/if: github\.event_name == 'pull_request'/);
  assert.match(ci,/if: github\.event_name == 'pull_request'/);
  assert.match(ci,/if: github\.event_name != 'pull_request'/);
  assert.match(gate,/job\.status == 'success' && 'success' \|\| 'failure'/);
});
