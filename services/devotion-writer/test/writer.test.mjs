import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDevotionPrompt, createDevotionWriter, validateDevotionDraft } from '../src/service.js';

const goodDraft = {
  title: '복은 머무르지 않습니다',
  narration: '신명기의 십일조 규정은 하나님께 드리는 행위에서 멈추지 않습니다. 먹을 것이 필요한 이웃과 함께 기뻐하고, 가진 것을 공동체 안에서 다시 흐르게 하라고 부릅니다. 믿음은 내가 받은 복을 계산하는 데서 끝나지 않고 누구의 빈자리를 발견했는지 묻습니다. 오늘 내 시간과 식탁과 지갑 가운데 하나를 열어, 누군가 다시 살아갈 작은 공간을 만들어 보면 어떨까요? 복은 움켜쥘 때보다 흘려보낼 때 공동체의 기쁨이 됩니다.',
  core: '받은 복은 이웃에게 흐를 때 공동체의 기쁨이 됩니다.',
  application_question: '오늘 내가 가진 것 가운데 이웃과 나눌 수 있는 한 가지는 무엇인가요?',
  prayer: '하나님, 받은 것을 내 것만으로 여기지 않고 이웃의 필요를 살피며 기꺼이 나누게 하소서.',
  publish_title: '복은 어디에서 멈추나요?',
  description: '신명기 14:22-29. 받은 복이 공동체 안에서 어떻게 흘러가야 하는지 묵상합니다.',
  hashtags: ['#매일묵상', '#신명기', '#나눔']
};

test('quality gate accepts a substantive structured devotional', () => {
  const result = validateDevotionDraft(goodDraft);
  assert.equal(result.ok, true, result.issues.join(','));
});

test('prompt forbids copied commentary and direct divine claims', () => {
  const prompt = buildDevotionPrompt({ passage: '신명기 14:22-29', date: '2026-09-01' });
  assert.match(prompt, /QTIN\/큐티인/);
  assert.match(prompt, /직접 말씀하셨다고 선언/);
  assert.match(prompt, /본문에 없는 세부 사실/);
});

test('writer retries a draft that fails the quality gate', async () => {
  let calls = 0;
  const provider = {
    id: 'stub', ready: () => true,
    generate: async () => ({ data: ++calls === 1 ? { ...goodDraft, narration: '짧음' } : goodDraft, provider: 'stub', model: 'test' })
  };
  const writer = createDevotionWriter({ providers: [provider] });
  const result = await writer.write({ passage: '신명기 14:22-29' });
  assert.equal(calls, 2);
  assert.equal(result.provider, 'stub');
  assert.equal(result.title, goodDraft.title);
});
