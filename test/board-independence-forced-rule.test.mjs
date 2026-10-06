import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('board forced-execution policy shares authentication only',async()=>{
  const policy=JSON.parse(await read('config/replaceable-board-engine-policy.json'));
  assert.equal(policy.independence.ruleId,'EKODI-BOARD-INDEPENDENCE-001');
  assert.equal(policy.independence.status,'enforced');
  assert.equal(policy.independence.sharedPlatformDependency,'authentication_identity_only');
  assert.equal(policy.independence.sharedAuthorizationForbidden,true);
  assert.equal(policy.independence.centralTenantGrantAsBoardAuthorityForbidden,true);
  assert.equal(policy.independence.boardLocalMembershipRequired,true);
  assert.equal(policy.independence.boardLocalRoleAndPermissionRequired,true);
  assert.equal(policy.independence.boardLocalLifecycleRequired,true);
  assert.equal(policy.independence.boardLocalBackupRestoreExportRequired,true);
  assert.equal(policy.independence.crossBoardMutationForbidden,true);
  assert.equal(policy.destructiveLifecycle.boardLifecycleCancelRequiresSuperAdminReauthentication,true);
  assert.equal(policy.destructiveLifecycle.boardLifecycleDeleteRequiresSuperAdminReauthentication,true);
  assert.equal(policy.destructiveLifecycle.reauthenticationProofMaxAgeSeconds,300);
  assert.equal(policy.destructiveLifecycle.reauthenticationProofSingleUse,true);
  assert.equal(policy.destructiveLifecycle.reauthenticationProofTargetBound,true);
  assert.equal(policy.destructiveLifecycle.permanentPurgeRequiresSeparateExplicitApproval,true);
});

test('site board authorization is board-local after EKODI authentication',async()=>{
  const source=await read('site-board-control.js');
  assert.match(source,/principalFromSupabaseRequest/);
  assert.match(source,/ekodi_board_memberships/);
  assert.match(source,/BOARD_MANAGE_ROLES/);
  assert.doesNotMatch(source,/customer_access_grants/);
  assert.doesNotMatch(source,/SELECT role FROM admins/);
  assert.match(source,/sharedPlatformDependency:'authentication_identity_only'/);
  assert.match(source,/boardLocalAuthorization:true/);
});

test('board lifecycle cancellation and deletion require target-bound super-admin reauth and snapshot',async()=>{
  const board=await read('site-board-control.js');
  assert.match(board,/board\.membership\.bootstrap/);
  assert.match(board,/board\.lifecycle\.cancel/);
  assert.match(board,/board\.lifecycle\.delete/);
  assert.match(board,/x-ekodi-reauth-proof/);
  assert.match(board,/snapshotBoard/);
  assert.match(board,/physicalPurge:false/);
  assert.match(board,/ekodi_board_snapshots/);

  const auth=await read('auth-worker-core.js');
  assert.match(auth,/CREATE TABLE IF NOT EXISTS reauth_proofs/);
  assert.match(auth,/5 \* 60 \* 1000/);
  assert.match(auth,/consumed_at IS NULL/);
  assert.match(auth,/board\.lifecycle\.cancel/);
  assert.match(auth,/board\.lifecycle\.delete/);
  assert.match(auth,/board\.membership\.bootstrap/);
  assert.match(auth,/session\.reauth\.consume/);
});

test('continuity policy makes board independence a mandatory forced-execution rule',async()=>{
  const policy=JSON.parse(await read('config/resilience-continuity-policy.json'));
  assert.equal(policy.forcedExecution.boardAuthenticationSharedOnly,true);
  assert.equal(policy.forcedExecution.boardLocalOperationAndAuthorizationRequired,true);
  assert.equal(policy.forcedExecution.boardCrossSiteIsolationRequired,true);
  assert.equal(policy.safetyBoundaries.boardLifecycleDestructiveActionRequiresSuperAdminReauthentication,true);
  assert.equal(policy.safetyBoundaries.boardLifecycleDestructiveActionRequiresTargetBoundSingleUseProof,true);
  assert.equal(policy.safetyBoundaries.boardLifecycleDestructiveActionRequiresRestoreEvidence,true);
});
