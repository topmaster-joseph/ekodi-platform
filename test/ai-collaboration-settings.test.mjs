import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AI_COLLABORATION_POLICY,
  normalizeAiCollaborationPolicy,
  resolveOpenAiProfiles,
  selectAiExecutionTarget,
} from '../ai-collaboration-settings.js';
import { resolveOpenAiModelForContext } from '../openai-provider-adapter.js';

test('collaboration by default and Cloud First cannot be disabled', () => {
  const policy = normalizeAiCollaborationPolicy({
    collaborationByDefault: false,
    execution: { cloudFirst: false, order: ['local', 'cloud'] },
  });
  assert.equal(policy.collaborationByDefault, true);
  assert.equal(policy.execution.cloudFirst, true);
  assert.deepEqual(policy.execution.order, ['cloud', 'remote', 'local']);
});

test('unsafe governance controls remain fail-closed', () => {
  const policy = normalizeAiCollaborationPolicy({
    governance: {
      maxParallelCollaborators: 99,
      requireHumanApprovalForDestructiveAction: false,
      failClosedOnInvalidPolicy: false,
    },
  });
  assert.equal(policy.governance.maxParallelCollaborators, 4);
  assert.equal(policy.governance.requireHumanApprovalForDestructiveAction, true);
  assert.equal(policy.governance.failClosedOnInvalidPolicy, true);
});

test('router weights are normalized and stored in the collaboration policy', () => {
  const policy = normalizeAiCollaborationPolicy({router:{weights:{taskFit:50,reliability:25,cost:25,latency:0,health:0,load:0,quality:0}}});
  const total=Object.values(policy.router.weights).reduce((sum,value)=>sum+value,0);
  assert.equal(Number(total.toFixed(6)),1);
  assert.equal(policy.router.weights.taskFit,0.5);
  assert.equal(policy.router.algorithmVersion.length>0,true);
});

test('OpenAI profiles resolve from logical environment slots without exposing secrets', () => {
  const profiles = resolveOpenAiProfiles({
    OPENAI_MODEL: 'fallback-model',
    EKODI_OPENAI_MODEL_FAST: 'fast-model',
    EKODI_OPENAI_MODEL_DEEP: 'deep-model',
    OPENAI_API_KEY: 'never-return-this',
  }, DEFAULT_AI_COLLABORATION_POLICY);
  assert.deepEqual(profiles, {
    fast: 'fast-model',
    balanced: 'fallback-model',
    deep: 'deep-model',
  });
  assert.equal(JSON.stringify(profiles).includes('never-return-this'), false);
});

test('OpenAI role profile selects the configured logical model', () => {
  const env = {
    OPENAI_MODEL: 'fallback-model',
    EKODI_OPENAI_MODEL_FAST: 'fast-model',
    EKODI_OPENAI_MODEL_BALANCED: 'balanced-model',
    EKODI_OPENAI_MODEL_DEEP: 'deep-model',
    EKODI_OPENAI_ROLE_PLANNER_PROFILE: 'fast',
    EKODI_OPENAI_ROLE_OPERATOR_PROFILE: 'balanced',
    EKODI_OPENAI_ROLE_SENTINEL_PROFILE: 'deep',
  };
  assert.equal(resolveOpenAiModelForContext(env, { commandPlane: { role: 'planner' } }), 'fast-model');
  assert.equal(resolveOpenAiModelForContext(env, { commandPlane: { role: 'operator' } }), 'balanced-model');
  assert.equal(resolveOpenAiModelForContext(env, { commandPlane: { role: 'sentinel' } }), 'deep-model');
});

test('execution target prefers cloud, then remote, then approved local fallback', () => {
  const policy = DEFAULT_AI_COLLABORATION_POLICY;
  assert.deepEqual(selectAiExecutionTarget(policy, { cloud: true, remote: true, local: true, localReason: 'gui_or_device_required' }), { target: 'cloud', reason: 'cloud_first' });
  assert.deepEqual(selectAiExecutionTarget(policy, { cloud: false, remote: true, local: true, localReason: 'gui_or_device_required' }), { target: 'remote', reason: 'cloud_unavailable' });
  assert.deepEqual(selectAiExecutionTarget(policy, { cloud: false, remote: false, local: true, localReason: 'gui_or_device_required' }), { target: 'local', reason: 'gui_or_device_required' });
  assert.deepEqual(selectAiExecutionTarget(policy, { cloud: false, remote: false, local: true, localReason: 'because_i_want_to' }), { target: null, reason: 'no_approved_execution_target' });
});

test('roles are normalized to known profiles and bounded tools', () => {
  const policy = normalizeAiCollaborationPolicy({
    openai: {
      roles: {
        builder: { profile: 'unknown', risk: 'production_write', tools: ['code', 'git', 'code'] },
      },
    },
  });
  assert.equal(policy.openai.roles.builder.profile, 'balanced');
  assert.equal(policy.openai.roles.builder.risk, 'production_write');
  assert.deepEqual(policy.openai.roles.builder.tools, ['code', 'git']);
});
