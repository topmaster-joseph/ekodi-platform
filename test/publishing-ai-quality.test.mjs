import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixForeignScript, countForeign, removeRepetition, ensureSensitiveNotice, polishChapter, sensitiveKinds } from '../publishing-ai-quality.js';
import { mondayWeek, writeText } from '../publishing-ai-factory.js';
import { writeForPublishing, PUBLISHING_WRITER_POLICY } from '../ai-control-publishing-writer.js';

test('foreign script observed in the 2026-11-05 drafts is fixed or flagged', () => {
  const sample = 'AI의 종류와 특징을介绍합니다. 일日の 운동량, 睡眠 패턴, 해당 지역의居民들, bestimm된 시간, освещ, 더好的 전략, kịp時の 조치, 新的 습관';
  const out = fixForeignScript(sample);
  assert.equal(countForeign(out), 0);
  assert.match(out, /소개합니다/); assert.match(out, /일일 운동량/); assert.match(out, /수면 패턴/); assert.match(out, /주민들/);
  assert.match(out, /더좋은 전략/); assert.match(out, /새로운 습관/); assert.doesNotMatch(out, /bestimm/);
  assert.equal(fixForeignScript(out), out, 'idempotent');
});

test('proper nouns and acronyms are kept', () => {
  const s = 'AI는 Google Calendar나 Apple Notes, Amazon Alexa와 함께 씁니다.';
  assert.equal(fixForeignScript(s), s);
});

test('unknown foreign runs become an approval-blocking marker', () => {
  assert.equal(fixForeignScript('이것은 未知語 입니다'), '이것은 [확인필요] 입니다');
});

test('repeated sections, paragraphs and mid-chapter question blocks are removed', () => {
  const body = ['도입 문단입니다. 스마트 홈은 생활을 편하게 합니다.', '### 음성 조작', '음성 조작으로 전등을 켜고 끕니다. 구글 홈과 아마존 에코를 씁니다. 오늘 해 볼 일: 전등을 켜 보세요.',
    '생각해 볼 질문\n- 첫 질문?', '### 보안 강화', '보안 카메라를 설치하고 비밀번호를 강하게 바꿉니다. 소프트웨어를 최신으로 유지합니다.',
    '### 음성 조작', '음성 조작으로 전등을 켜고 끕니다. 구글 홈과 아마존 에코를 씁니다. 오늘 해 볼 일: 전등을 켜 보세요.',
    '보안 카메라를 설치하고 비밀번호를 강하게 바꿉니다. 소프트웨어를 최신으로 유지합니다.', '생각해 볼 질문\n- 마지막 질문?'].join('\n\n');
  const out = removeRepetition(body);
  assert.equal((out.match(/### 음성 조작/g) || []).length, 1);
  assert.equal((out.match(/생각해 볼 질문/g) || []).length, 1);
  assert.match(out, /마지막 질문\?$/);
  assert.equal((out.match(/보안 카메라를 설치하고/g) || []).length, 1);
  assert.equal(removeRepetition(out), out, 'idempotent');
});

test('health and finance chapters always carry a blocking notice', () => {
  const health = ensureSensitiveNotice('본문', { title: 'AI를 이용한 건강 관리', summary: '건강 상태 모니터링' });
  assert.match(health, /^> \[확인필요\] 이 장은 건강·의료/);
  const money = ensureSensitiveNotice('본문', { title: 'AI와 금융 관리', summary: '지출 추적과 예산' });
  assert.match(money, /금융·투자/);
  assert.equal(ensureSensitiveNotice(health, { title: 'AI를 이용한 건강 관리' }), health, 'only once');
  assert.deepEqual(sensitiveKinds({ title: '스마트 홈을 위한 AI', summary: '음성 조작과 자동화' }), []);
  assert.deepEqual(sensitiveKinds({ title: '지출 줄이기', genre: 'money-basics' }), ['금융·투자']);
  const p = polishChapter('### 약물\n맞춤형 약물 치료를介绍합니다.', { title: 'AI와 건강', summary: '' });
  assert.equal(polishChapter(p, { title: 'AI와 건강', summary: '' }), p);
});

test('new books start on Monday (UTC) and week ids never collide with the old epoch weeks', () => {
  assert.equal(mondayWeek(new Date('2026-11-05T00:40:00Z')), 20261102); // Thu
  assert.equal(mondayWeek(new Date('2026-11-08T23:59:00Z')), 20261102); // Sun
  assert.equal(mondayWeek(new Date('2026-11-09T00:40:00Z')), 20261109); // Mon 09:40 KST
  assert.ok(mondayWeek(new Date()) > 1e7);
});

test('draft tries Workers AI first, edit tries the AI control plane first, and both fall back', async () => {
  const calls = [];
  const spent = { prepare: () => ({ bind: () => ({ first: async () => ({ neurons: 6000 }) }) }) }; // 출판 몫 Workers AI 한도 소진
  const env = {
    AI_CONTROL: { async write(input) { calls.push('control:' + input.purpose); return { ok: true, text: '무료 AI 문장', provider: 'gemini-free' }; } },
    PUBLISH_DB: spent, AI: { run: async () => { throw new Error('must not run'); } },
  };
  // Workers AI 몫이 다 찼으면 관리 장치의 무료 AI로 넘어간다.
  assert.equal(await writeText(env, 's', 'p', 100, 'draft'), '무료 AI 문장');
  assert.equal(await writeText(env, 's', 'p', 100, 'edit'), '무료 AI 문장');
  assert.deepEqual(calls, ['control:publishing-draft', 'control:publishing-edit']);
  const none = { PUBLISH_DB: spent, AI_CONTROL: { async write() { return { ok: false, code: 'daily_cap_reached' }; } } };
  assert.equal(await writeText(none, 's', 'p', 100, 'draft'), null, 'budget wait when every free route is spent');
  assert.equal(await writeText({ PUBLISH_DB: spent }, 's', 'p', 100, 'edit'), null, 'works without the binding (waits)');
  await assert.rejects(writeText({ PUBLISH_DB: { prepare: () => { throw new Error('db down'); } } }, 's', 'p', 100, 'draft'), /db down/, 'real errors are surfaced to the run log');
});

function ledgerDb(start = 0) {
  const state = { count: start };
  return { state, prepare(sql) { return { bind(...a) { return { async run() {
    if (sql.startsWith('UPDATE')) { const cap = a[3]; if (state.count + 1 <= cap) { state.count++; return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; }
    return { meta: { changes: 0 } }; }, async first() { return null; }, async all() { return { results: [] }; } }; } }; } };
}

test('AI control writer uses only free providers, falls through failures, and respects the daily cap', async () => {
  assert.equal(PUBLISHING_WRITER_POLICY.paid, false);
  assert.ok(!PUBLISHING_WRITER_POLICY.providers.some(id => /openai|anthropic/.test(id)));
  const original = globalThis.fetch; const hits = [];
  globalThis.fetch = async (url) => { hits.push(String(url)); if (String(url).includes('groq')) return new Response(JSON.stringify({ choices: [{ message: { content: '그록 문장' } }] }), { status: 200 });
    return new Response('{}', { status: 503 }); };
  try {
    const env = { DB: ledgerDb(), GROQ_API_KEY: 'k', EKODI_PROVIDER_GROQ_FREE_ENABLED: 'true', OPENROUTER_API_KEY: '', OPENAI_API_KEY: 'paid', ANTHROPIC_API_KEY: 'paid' };
    const r = await writeForPublishing(env, { system: 's', prompt: '써 주세요' });
    assert.equal(r.ok, true); assert.equal(r.provider, 'groq-free'); assert.equal(r.text, '그록 문장');
    assert.ok(!hits.some(u => /api\.openai\.com|anthropic\.com/.test(u)), 'never calls a paid provider');
    const capped = { ...env, DB: ledgerDb(PUBLISHING_WRITER_POLICY.dailyCallCap) };
    assert.equal((await writeForPublishing(capped, { prompt: 'x' })).code, 'daily_cap_reached');
    assert.equal((await writeForPublishing(env, { prompt: '' })).code, 'prompt_required');
  } finally { globalThis.fetch = original; }
});

test('publishing binds only the named AI control entrypoint', async () => {
  const [toml, entry] = await Promise.all([readFile(new URL('../wrangler.publishing.toml', import.meta.url), 'utf8'), readFile(new URL('../ai-control-entry-worker.js', import.meta.url), 'utf8')]);
  assert.match(toml, /binding = "AI_CONTROL"\nservice = "ekodi-ai-control"\nentrypoint = "PublishingWriter"/);
  assert.match(entry, /export class PublishingWriter extends WorkerEntrypoint/);
  assert.match(entry, /aiControlWorker\.scheduled\(controller, env, ctx\)/);
});
