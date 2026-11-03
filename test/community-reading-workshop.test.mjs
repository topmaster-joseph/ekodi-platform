import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TOPICS, CATEGORIES, topicById, formatFacilitatorGuide } from '../community/reading/topics.js';

const file = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('reading workshop has distinct accessible topic templates with complete schedules', () => {
  assert.ok(TOPICS.length >= 6);
  assert.equal(new Set(TOPICS.map(t => t.id)).size, TOPICS.length);
  for (const topic of TOPICS) {
    assert.match(topic.id, /^[a-z-]+$/);
    assert.ok(topic.title.length > 5);
    assert.ok(topic.category && CATEGORIES.includes(topic.category));
    assert.ok(topic.questions.length >= 5);
    assert.ok(topic.questions.every(q => q.length >= 15));
    assert.ok(topic.stages.length >= 4);
    assert.equal(topic.stages.reduce((total, stage) => total + stage.min, 0), topic.duration);
    assert.match(formatFacilitatorGuide(topic), /진행 순서/);
    assert.match(formatFacilitatorGuide(topic), /토론 질문/);
  }
  assert.equal(topicById('not-found'), TOPICS[0]);
  assert.equal(topicById('plague').duration, 80);
});

test('canonical reading hub is scoped to Community and clearly distinguishes templates from real circles', async () => {
  const [page, communityPage, worker, registry] = await Promise.all([
    file('community/reading/index.html'),
    file('community/index.html'),
    file('community-worker.js'),
    file('config/service-workspace-policy.json')
  ]);
  assert.match(page, /https:\/\/ekodi.kr\/community\/reading/);
  assert.match(page, /실제 개설된 모임이 아닌/);
  assert.match(page, /\/community\/\?reading=create/);
  assert.match(page, /\/community\/#circles/);
  assert.match(communityPage, /href="\/community\/reading"/);
  assert.match(worker, /new URL\('\/reading\/'\s*,\s*url\)/);
  assert.match(worker, /readingPath/);
  assert.match(registry, /https:\/\/ekodi.kr\/community\/reading/);
});

test('privacy and consent: reading notes are not silently persisted or auto-shared', async () => {
  const [page, app] = await Promise.all([file('community/reading/index.html'), file('community/reading/app.js')]);
  assert.match(page, /서버로 전송하거나 자동 저장하지 않습니다/);
  assert.match(page, /공유는 작성자가 직접 선택/);
  assert.match(app, /new Blob/);
  assert.match(app, /window\.confirm/);
  assert.doesNotMatch(app, /localStorage|sessionStorage|innerHTML\s*=|fetch\(/);
});

test('facilitator UI is keyboard-navigable and the questions are announced', async () => {
  const [page, app, css] = await Promise.all([
    file('community/reading/index.html'), file('community/reading/app.js'), file('community/reading/styles.css')
  ]);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /<nav class="reading-tabs" aria-label/);
  assert.match(page, /id="questionIndex"/);
  assert.match(app, /aria-pressed/);
  assert.match(css, /focus-visible/);
  assert.match(css, /max-width:620px/);
  assert.match(css, /word-break:keep-all/);
});

test('new group creation reuses existing Community login and circle workflow', async () => {
  const app = await file('community/app.js');
  assert.match(app, /params\.get\('reading'\)==='create'/);
  assert.match(app, /openCircle\(\)/);
  assert.match(app, /briefs\[params\.get\('topic'\)\]/);
  assert.doesNotMatch(await file('community/reading/app.js'), /supabase|access_token|Authorization/);
});

test('COVID evidence is linked to public-source datasets without inventing comparison figures', async () => {
  const page = await file('community/reading/index.html');
  assert.match(page, /data\.who\.int\/dashboards\/covid19\/cases/);
  assert.match(page, /초과사망/);
  assert.match(page, /보고체계 차이/);
});
