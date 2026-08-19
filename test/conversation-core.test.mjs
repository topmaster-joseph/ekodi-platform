import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyConversationMessage,
  buildFreeAssistReply,
  CONVERSATION_STATES,
} from '../conversation-control.js';

test('normal question stays AI-first', () => {
  const result = classifyConversationMessage('이번 주 교회 일정 알려줘');
  assert.equal(result.priority, 'normal');
  assert.equal(result.requiresHuman, false);
});

test('explicit human request escalates', () => {
  const result = classifyConversationMessage('관리자가 직접 답변해 주세요');
  assert.equal(result.requiresHuman, true);
  assert.ok(result.reasons.includes('explicit_human_request'));
});

test('sensitive payment failure becomes urgent review', () => {
  const result = classifyConversationMessage('결제가 실패했고 환불도 확인이 필요해요');
  assert.equal(result.priority, 'urgent');
  assert.equal(result.requiresHuman, true);
  assert.ok(result.reasons.includes('sensitive_or_high_risk'));
  assert.ok(result.reasons.includes('service_failure'));
});

test('free assist tells the user when human review is queued', () => {
  const triage = classifyConversationMessage('담당자와 연결해 주세요');
  assert.match(buildFreeAssistReply({ triage, service: 'marketing' }), /관리자 확인/);
});

test('states expose AI to human takeover lifecycle', () => {
  assert.equal(CONVERSATION_STATES.AI, 'ai_active');
  assert.equal(CONVERSATION_STATES.REVIEW, 'human_review');
  assert.equal(CONVERSATION_STATES.HUMAN, 'human_active');
  assert.equal(CONVERSATION_STATES.CLOSED, 'closed');
});