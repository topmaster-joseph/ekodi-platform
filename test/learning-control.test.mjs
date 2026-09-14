import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLearningControl, LEARNING_FABRIC_CATALOG } from '../learning-control.js';

test('learning catalog is public and prerequisite-aware', async () => {
  const response=await handleLearningControl(new Request('https://api.ekodi.kr/api/learning/catalog'),{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.service,'ekodi-learning-fabric');
  assert.equal(body.guestAccess,true);
  assert.equal(body.memberProgressSync,true);
  assert.equal(body.tracks.length,3);
  assert.equal(LEARNING_FABRIC_CATALOG[0].skills[1].requires[0],'ai-literacy');
});

test('member progress never opens without storage and auth', async () => {
  const response=await handleLearningControl(new Request('https://api.ekodi.kr/api/learning/progress'),{});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'learning_database_unavailable');
});

test('unrelated endpoint is ignored', async () => {
  assert.equal(await handleLearningControl(new Request('https://api.ekodi.kr/health'),{}),null);
});