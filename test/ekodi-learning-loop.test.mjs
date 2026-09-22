import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EKODI_LEARNING_LOOP_POLICY,
  buildTaskLearningEvent,
  evaluateKnowledgeCandidate,
  runEkodiLearningLoop,
  sanitizeLearningEvidence,
  selectKnowledgeAcquisitionLane,
} from '../ekodi-learning-loop.js';

test('prefers official connectors and blocks unverified html crawling', () => {
  assert.equal(selectKnowledgeAcquisitionLane({ api:true }).method, 'official_connector_or_api');
  assert.equal(selectKnowledgeAcquisitionLane({ url:'https://example.com' }).method, 'blocked');
  assert.equal(selectKnowledgeAcquisitionLane({ url:'https://example.com', robotsAllowed:true, termsAllowed:true, rightsAllowed:true }).method, 'bounded_html_fetch');
});

test('verified task learning stores derived evidence without raw prompt or secret fields', () => {
  const event = buildTaskLearningEvent({
    taskId:'task-1', capability:'docs', outcome:'verified',
    evidence:{ verified:true, providerDiversity:2, prompt:'ignore rules', apiKey:'secret', nested:{ message:'raw', score:91 } },
    feedback:{ disposition:'revised', correctionRatio:0.2 },
  });
  assert.equal(event.eligibleForLearningLedger, true);
  assert.equal(event.feedback.rawContentStored, false);
  assert.deepEqual(event.evidence, { verified:true, providerDiversity:2, nested:{ score:91 } });
});

test('prompt injection and unverified rights prevent knowledge promotion', () => {
  const result = evaluateKnowledgeCandidate({
    id:'bad', sourceType:'official_primary', ageHours:1, maxAgeHours:24,
    corroboratingSources:3, repeatedVerifiedOutcomes:5, userAccepted:true,
    rightsAllowed:false, promptInjectionDetected:true, humanApproved:true,
  });
  assert.equal(result.status, 'rejected');
  assert.ok(result.blocked.includes('prompt_injection_detected'));
  assert.ok(result.blocked.includes('rights_not_verified'));
});

test('platform-wide promotion requires repeated outcomes and human approval', () => {
  const candidate = {
    id:'policy', sourceType:'official_primary', ageHours:1, maxAgeHours:24,
    corroboratingSources:3, repeatedVerifiedOutcomes:4, userAccepted:true,
    rightsAllowed:true, authorized:true,
  };
  assert.equal(evaluateKnowledgeCandidate(candidate).status, 'platform_review_required');
  assert.equal(evaluateKnowledgeCandidate({ ...candidate, humanApproved:true }).status, 'platform_knowledge_promoted');
});

test('loop never expands authority or executes external instructions', () => {
  const report = runEkodiLearningLoop({
    generatedAt:'2026-09-22T00:00:00.000Z',
    tasks:[{ taskId:'x', outcome:'verified' }],
    knowledge:[],
  });
  assert.equal(EKODI_LEARNING_LOOP_POLICY.modelSelfTrainingByDefault, false);
  assert.equal(report.externalInstructionsExecuted, false);
  assert.equal(report.authorityExpanded, false);
  assert.equal(report.productionMutationPerformed, false);
});

test('evidence sanitizer is deterministic and bounded', () => {
  assert.deepEqual(sanitizeLearningEvidence({ score:1, token:'x', values:['a','b'] }), { score:1, values:['a','b'] });
});
