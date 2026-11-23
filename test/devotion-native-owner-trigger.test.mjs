import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(
  new URL('../.github/workflows/ekodi-native-devotion-guest.yml',import.meta.url),'utf8'
);
const job=workflow.split(/\njobs:\s*\n/)[1]||'';

test('owner-only exact issue comment requests native real-host devotion verification',()=>{
  assert.match(workflow,/issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(job,/github\.event_name == 'issue_comment'/);
  assert.match(job,/github\.repository == 'topmaster-joseph\/ekodi-platform'/);
  assert.match(job,/github\.event\.issue\.number == 9898/);
  assert.match(job,/github\.event\.comment\.user\.login == 'topmaster-joseph'/);
  assert.match(job,/github\.event\.comment\.body == '\/ekodi-devotion-live-check'/);
  assert.match(job,/github\.event_name != 'issue_comment'/);
  assert.match(workflow,/github\.event\.comment\.id \|\| github\.event\.pull_request\.number/);
  assert.match(workflow,/github\.event_name == 'issue_comment' \|\| inputs\.expect_today_redirect == true/);
});

test('native owner verification remains read-only and cannot bypass the real UI runner',()=>{
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.match(workflow,/uses: actions\/checkout@v7/);
  assert.match(workflow,/fonts-noto-cjk/);
  assert.match(workflow,/run: node scripts\/verify-devotion-guest-native-browser\.mjs/);
  assert.match(workflow,/Verified checkout revision:/);
  assert.doesNotMatch(workflow,/pull-requests: write|issues: write|continue-on-error: true/);
});
