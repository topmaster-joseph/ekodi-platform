import test from 'node:test';
import assert from 'node:assert/strict';
import { isLearningPath, learningPage, learningScript, learningStyles } from '../learning-page.js';

test('learning public route and assets are recognized', () => {
  assert.equal(isLearningPath('/learn'),true);
  assert.equal(isLearningPath('/learn/assets/style.css'),true);
  assert.equal(isLearningPath('/learn/assets/app.js'),true);
  assert.equal(isLearningPath('/learning'),false);
});

test('learning page exposes guest learning and member sync entry', async () => {
  const html=await learningPage().text();
  assert.match(html,/EKODI LEARNING FABRIC/);
  assert.match(html,/비회원도 바로 학습 가능/);
  assert.match(html,/Google로 진도 연결/);
  assert.match(html,/AI 코치/);
});

test('learning assets include progress and user AI integration', async () => {
  const script=await learningScript().text();
  const css=await learningStyles().text();
  assert.match(script,/\/api\/learning\/progress/);
  assert.match(script,/\/api\/user-ai\/assist/);
  assert.match(css,/\.grid/);
});