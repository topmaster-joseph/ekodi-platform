import assert from 'node:assert/strict';
import { AI_ROUTER_SCORE_POLICY } from '../ai-router-score.js';

const baseUrl = String(process.argv[2] || '').replace(/\/$/, '');
const token = String(process.argv[3] || '').trim();
if (!baseUrl) throw new Error('base URL is required');
if (!token) throw new Error('admin bearer token is required');

const endpoint = `${baseUrl}/api/control/ai/v8/collaboration-settings`;
const headers = {
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  origin: 'https://admin.ekodi.kr',
};

async function request(path = '', options = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, `${options.method || 'GET'} ${path || '/'} returned ${response.status}: ${JSON.stringify(payload)}`);
  return { response, payload };
}function assertLockedPolicy(snapshot, label) {
  const policy = snapshot?.policy || {};
  const weights = policy.router?.weights || {};
  const sum = Object.values(weights).reduce((total, value) => total + Number(value || 0), 0);
  assert.equal(policy.collaborationByDefault, true, `${label}: collaborationByDefault`);
  assert.equal(policy.execution?.cloudFirst, true, `${label}: cloudFirst`);
  assert.deepEqual(policy.execution?.order, ['cloud', 'remote', 'local'], `${label}: execution order`);
  assert.equal(policy.openai?.secretStorage, 'server_secret_only', `${label}: secret storage`);
  assert.equal(policy.resources?.strategy, 'personal-first', `${label}: resource strategy`);
  assert.equal(policy.governance?.requireHumanApprovalForDestructiveAction, true, `${label}: destructive gate`);
  assert.equal(policy.router?.algorithmVersion, AI_ROUTER_SCORE_POLICY.version, `${label}: router version`);
  assert.deepEqual(Object.keys(weights).sort(), Object.keys(AI_ROUTER_SCORE_POLICY.weights).sort(), `${label}: router dimensions`);
  assert.ok(Math.abs(sum - 1) <= 0.00001, `${label}: router weight sum=${sum}`);
  return policy;
}

const before = (await request()).payload;
assert.equal(before.ok, true);
const original = assertLockedPolicy(before, 'before');
const originalRevision = Number(before.revision) || 0;

const candidate = structuredClone(original);
candidate.collaborationByDefault = false;
candidate.execution.cloudFirst = false;
candidate.execution.order = ['local'];
candidate.openai.secretStorage = 'browser';candidate.resources.strategy = 'shared-first';
candidate.governance.requireHumanApprovalForDestructiveAction = false;
candidate.governance.maxParallelCollaborators = 2;
candidate.resources.pools.hostedAi.enabled = true;
candidate.router.weights = {
  taskFit: 40,
  reliability: 20,
  cost: 10,
  latency: 10,
  health: 10,
  load: 5,
  quality: 5,
};

const saved = (await request('', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ policy: candidate }),
})).payload;
assert.equal(saved.ok, true);
assert.ok(Number(saved.revision) > originalRevision, 'revision did not advance');
const savedPolicy = assertLockedPolicy(saved.snapshot, 'saved');
assert.equal(savedPolicy.governance.maxParallelCollaborators, 2);
assert.equal(savedPolicy.resources.pools.hostedAi.enabled, true);
assert.ok(Math.abs(savedPolicy.router.weights.taskFit - 0.4) <= 0.00001);const after = (await request()).payload;
assert.equal(after.revision, saved.revision);
assertLockedPolicy(after, 'after');
assert.equal(after.policy.governance.maxParallelCollaborators, 2);

const audit = (await request('/audit?limit=5')).payload;
assert.ok(Array.isArray(audit.audit));
assert.ok(audit.audit.some(item => Number(item.revision) === Number(saved.revision) && item.action === 'update'));

const restored = (await request('', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ policy: original }),
})).payload;
assertLockedPolicy(restored.snapshot, 'restored');
assert.deepEqual(restored.snapshot.policy.router.weights, original.router.weights);
assert.equal(restored.snapshot.policy.governance.maxParallelCollaborators, original.governance.maxParallelCollaborators);

console.log(JSON.stringify({
  ok: true,
  routerScoreVersion: AI_ROUTER_SCORE_POLICY.version,
  savedRevision: Number(saved.revision),
  restoredRevision: Number(restored.revision),
  auditVerified: true,
  productionMutation: false,
}));