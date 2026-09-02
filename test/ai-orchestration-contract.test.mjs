import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_MISSION_RUNTIME,
  canAutonomouslyExecuteRequest,
  getOrchestrationContract,
  mustOwnAndRouteRequest,
} from '../ai-governance-runtime.js';

test('EKODI Orchestrator owns requests regardless of entry AI', () => {
  const contract = getOrchestrationContract();
  assert.equal(contract.requestOwner, 'ekodi_orchestrator');
  assert.equal(contract.entryAiRole, 'entry_point_and_bounded_participant');
  assert.equal(contract.specialistRouting, 'ekodi_orchestrator');
  assert.equal(contract.requireUserToChooseSpecialist, false);
  assert.equal(contract.finalPlatformAuthority, 'ekodi_platform_super_administrator');
  assert.equal(contract.ordinaryUserApprovalScope, 'delegated_workspace_or_resource_only');
  assert.equal(mustOwnAndRouteRequest(), true);
});

test('ownership remains with orchestrator while high-impact execution is gated', () => {
  assert.equal(mustOwnAndRouteRequest({ highImpact:true }), true);
  assert.equal(mustOwnAndRouteRequest({ forbidden:true }), true);
  assert.equal(canAutonomouslyExecuteRequest({ highImpact:true }), false);
  assert.equal(canAutonomouslyExecuteRequest({ forbidden:true }), false);
  assert.equal(AI_MISSION_RUNTIME.authorityModel.taskOwner, 'ekodi_orchestrator');
  assert.equal(AI_MISSION_RUNTIME.authorityModel.platformSuperAdministratorRole, 'final_platform_authority');
});