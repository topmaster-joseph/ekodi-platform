import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { essayTick, writeEssayDraft, essayContinuePrompt, ESSAY_CONTINUE_LIMIT, ESSAY_POLICY, nextTopic } from '../publishing-journal-essays.js';

function createD1(sqlite) {
  const prepare = (query) => {
    let params = [];
    const statement = {
      bind(...values) { params = values; return statement; },
      async run() { sqlite.prepare(query).run(...params); return { success: true }; },
      async all() { return { results: sqlite.prepare(query).all(...params) }; },
      async first() { return sqlite.prepare(query).get(...params) ?? null; },
    };
    return statement;
  };
  return { prepare, async batch(list) { return Promise.all(list.map((s) => s.run())); } };
}
// 11/15~11/22 운영 기록: Workers AI가 한 번에 350~520자만 써서 매일 draft_unusable 로 버려졌다.
const shortOpening = `쉼을 배우는 한 주\n바쁜 날들 사이에서 안식을 회복하는 길을 나눕니다.\n\n## 멈춤의 자리\n${'하루를 멈추고 숨을 고르는 시간이 우리에게 필요합니다. '.repeat(10)}`;
const section = (n) => `제목: 다시 쓴 제목\n## 이어지는 생각 ${n}\n${'작은 멈춤이 쌓이면 삶의 결이 달라집니다. '.repeat(14)}`;

test('short free-AI drafts are continued in sections until the essay reaches the minimum length', async () => {
  const prompts = [];
  let n = 0;
  const writer = async (_s, prompt) => { prompts.push(prompt); n += 1; return n === 1 ? shortOpening : section(n); };
  const text = await writeEssayDraft(writer, nextTopic(0));
  assert.ok(n >= 2 && n <= 1 + ESSAY_CONTINUE_LIMIT, `calls=${n}`);
  assert.match(prompts[1], /이어지는 본문만/);
  assert.doesNotMatch(text, /제목: 다시 쓴 제목/);
  const db = createD1(new DatabaseSync(':memory:'));
  let m = 0;
  const r = await essayTick(db, async () => { m += 1; return m === 1 ? shortOpening : section(m); }, { now: Date.parse('2026-11-23T00:40:00Z') });
  assert.equal(r.skipped, '');
  assert.match(r.submitted, /^ekodian-20261123-/);
  const row = await db.prepare('SELECT title, body FROM publishing_journal_essays').first();
  assert.equal(row.title, '쉼을 배우는 한 주');
  assert.ok(row.body.replace(/\s/g, '').length >= ESSAY_POLICY.minChars);
});

test('continuation stops when the AI returns nothing, and the last section asks for a closing practice', async () => {
  let calls = 0;
  const text = await writeEssayDraft(async () => { calls += 1; return calls === 1 ? shortOpening : null; }, nextTopic(0));
  assert.equal(calls, 2);
  assert.equal(text, shortOpening.trim());
  assert.match(essayContinuePrompt(nextTopic(0), 'x', true), /작은 실천 하나로/);
  assert.doesNotMatch(essayContinuePrompt(nextTopic(0), 'x', false), /마지막 부분/);
});
