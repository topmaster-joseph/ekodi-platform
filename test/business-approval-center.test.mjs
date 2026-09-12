import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client=readFileSync(new URL('../business/approval-center.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../business/approval-center.css',import.meta.url),'utf8');
const liveWorker=readFileSync(new URL('../business-live-worker.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20260831161000_business_os_approval_center.sql',import.meta.url),'utf8');

test('Business OS exposes one discoverable AI approval center',()=>{
  assert.match(client,/AI 실행 승인센터/);
  assert.match(client,/승인대기/);
  assert.match(client,/승인하기/);
  assert.match(client,/수정 요청/);
  assert.match(client,/거절/);
  assert.match(client,/approvalCenterOpen/);
  assert.match(css,/\.approval-drawer/);
  assert.match(css,/\.approval-trigger/);
});

test('approval list and decisions stay behind authenticated RPCs',()=>{
  assert.match(liveWorker,/business_os_pending_approvals/);
  assert.match(liveWorker,/business_os_decide_action/);
  assert.match(liveWorker,/\/api\/approvals/);
  assert.match(liveWorker,/\/api\/decide-action/);
  assert.match(liveWorker,/headers\.authorization/);
  assert.match(client,/Bearer \$\{token\}/);
  assert.match(client,/\/api\/approvals/);
  assert.match(client,/\/api\/decide-action/);
});

test('approval authority is tenant-local and does not inherit platform admin authority',()=>{
  assert.match(migration,/business_os_has_approval_authority/);
  assert.match(migration,/tenant_admin/);
  assert.match(migration,/store_owner/);
  assert.doesNotMatch(migration,/platform_admin'::public\.app_role/);
  assert.match(migration,/approval_authority_required/);
  assert.match(migration,/has_store_private_access/);
  assert.match(migration,/has_tenant_access/);
});

test('approval center reveals sanitized metadata and never auto-executes side effects',()=>{
  assert.match(migration,/business_os_pending_approvals/);
  for(const key of ['actionType','title','summary','priority','status','requestedAt']) assert.match(migration,new RegExp(`'${key}'`));
  assert.doesNotMatch(migration,/'payload', a\.payload/);
  assert.match(migration,/'executed', false/);
  assert.match(client,/외부 실행은 별도 실행 어댑터/);
});

test('approval decisions support approve, reject and revision request',()=>{
  assert.match(migration,/revision_requested/);
  assert.match(migration,/approved/);
  assert.match(migration,/rejected/);
  assert.match(client,/decide\(item\.id,'approved'/);
  assert.match(client,/decide\(item\.id,'revision_requested'/);
  assert.match(client,/decide\(item\.id,'rejected'/);
});

test('approval client is injected only into Business OS HTML',()=>{
  assert.match(liveWorker,/injectApprovalClient/);
  assert.match(liveWorker,/text\/html/);
  assert.match(liveWorker,/approval-center\.js/);
  assert.match(liveWorker,/injectEkodiShell\(await injectApprovalClient\(baseResponse\),'business'\)/);
});
