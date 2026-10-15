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
  assert.ok(workflow.includes('github.event.issue.number || github.event.pull_request.number || github.ref'),'unrelated PR comments must not share the same Chromium audit queue');
  assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name != 'issue_comment' }}"),'owner-triggered audits must not be canceled by unrelated bot comments');
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
