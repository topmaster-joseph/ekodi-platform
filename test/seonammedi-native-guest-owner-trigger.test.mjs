import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/verify-seonammedi-nav-guest-native.yml',import.meta.url),'utf8');

test('SeonamMedi guest Chromium live audit is owner-triggerable without granting new write access',()=>{
  assert.ok(workflow.includes('  issue_comment:\n    types: [created]'),'owner command must trigger from the trusted default branch');
  assert.ok(workflow.includes("github.event.comment.user.login == github.repository_owner"),'comment must be from repository owner');
  assert.ok(workflow.includes("github.event.issue.pull_request != null"),'command must originate from a PR');
  assert.ok(workflow.includes("github.event.issue.state == 'closed'"),'audit command must be accepted only after the release PR closes');
  assert.ok(workflow.includes("github.event.comment.body == 'EKODI-SEONAM-NATIVE-AUDIT:RUN'"),'command must use an exact non-ambiguous marker');
  assert.ok(workflow.includes("github.event_name != 'pull_request'"),'untrusted PR must remain preflight-only');
  assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"),'normal post-release checks must fail closed');
  assert.ok(workflow.includes("github.event_name == 'issue_comment' && github.event.comment.id || github.ref"),'unrelated issue comments must not cancel owner read-only audits');
  assert.ok(workflow.includes('  cancel-in-progress: true'),'scoped concurrency retains cancellation of duplicate non-comment runs');
  assert.ok(workflow.includes('  contents: read'),'audit must be read only');
  assert.ok(!workflow.includes('  contents: write'),'audit must not grant repository write');
  assert.ok(workflow.includes('node scripts/verify-seonammedi-nav-guest-native.mjs'),'run real Chromium navigation, not syntax only');
  assert.ok(workflow.includes("(github.event_name == 'workflow_run' || github.event_name == 'issue_comment') && 'main' || github.sha"),'probe must run trusted source');
});

test('SeonamMedi Chromium guest audit preserves desktop/mobile and two-domain coverage',async()=>{
  const source=await readFile(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
  for(const origin of ['https://seonammedi.kr','https://ekodi.kr'])assert.ok(source.includes(origin),origin);
  for(const name of ["name:'desktop'","name:'mobile'","record.noticeAfterCategory","notice_direct_path_mismatch","notice_category_click_interception"])assert.ok(source.includes(name),name);
  for(const token of ['financePrivateGate','finance_guest_admin_only_marker_missing','financeGuestApiStatuses','finance_guest_api_access_contract_',"'/board/api/finance'","'/board/api/finance/summary'","'/board/api/admin/finance'",'status!==401&&status!==403'])assert.ok(source.includes(token),'finance guest privacy probe missing: '+token);
  assert.ok(source.includes('maxRedirects:0'),'guest test must not follow redirects to unrelated surfaces');
});

test('unique owner audit comment does not remove main-ref deduplication or read-only scope',()=>{
  const section=workflow.split('concurrency:')[1]?.split('jobs:')[0]||'';
  assert.ok(section.includes("github.event_name == 'issue_comment'"),'issue comments must be isolated');
  assert.ok(section.includes('github.event.comment.id'),'each issue comment must have a unique concurrency key');
  assert.ok(section.includes('|| github.ref'),'normal pushes and workflow runs retain their ref-based group');
  assert.ok(section.includes('cancel-in-progress: true'),'stale overlapping non-comment audits remain cancellable');
  assert.ok(workflow.includes('  contents: read'),'the isolated audit must remain read only');
});

test('owner audit comments use separate concurrency keys while normal pushes share their branch',()=>{
  const group=workflow.split('concurrency:')[1]?.split('jobs:')[0]||'';
  assert.ok(group.includes("github.event.comment.id || github.ref"),'unique comment identifiers must select the issue-comment concurrency key');
  assert.ok(group.includes("github.event_name == 'issue_comment'"),'only comments should use per-event keys');
  assert.ok(group.includes('cancel-in-progress: true'),'keep existing stale-run cancellation for non-comment events');
});
