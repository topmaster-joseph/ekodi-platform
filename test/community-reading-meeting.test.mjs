import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { topicById } from '../community/reading/topics.js';
import {
  createMeetingState, tickMeeting, toggleMeeting, changeMeetingStage,
  formatMeetingClock, formatMeetingNotes,
} from '../community/reading/meeting-mode.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const topic = topicById('plague');

test('stage clock starts explicitly and respects wall-clock time across inactive tabs', () => {
  const initial = createMeetingState(topic);
  assert.equal(initial.secondsLeft, 600);
  assert.equal(initial.running, false);
  assert.equal(tickMeeting(initial, 50000).secondsLeft, 600);
  let state = toggleMeeting(initial, 1000);
  assert.equal(state.running, true);
  state = tickMeeting(state, 61500);
  assert.equal(state.secondsLeft, 540);
  assert.equal(state.lastTickAt, 61000);
  state = tickMeeting(state, 621000);
  assert.equal(state.secondsLeft, 0);
  assert.equal(state.running, false);
  assert.equal(toggleMeeting(state, 622000).secondsLeft, 0);
  assert.equal(formatMeetingClock(state.secondsLeft), '00:00');
});

test('stage changes require a deliberate gesture and reset the independent timer', () => {
  const started = toggleMeeting(createMeetingState(topic), 1000);
  const ended = tickMeeting(started, 999999);
  assert.equal(ended.stageIndex, 0);
  const next = changeMeetingStage(ended, topic, 2);
  assert.equal(next.stageIndex, 2);
  assert.equal(next.secondsLeft, 25 * 60);
  assert.equal(next.running, false);
  assert.equal(changeMeetingStage(next, topic, -8).stageIndex, 0);
  assert.equal(changeMeetingStage(next, topic, 999).stageIndex, topic.stages.length - 1);
  assert.equal(formatMeetingClock(99), '01:39');
});

test('explicit local note export captures only the selected topic, stage, and question', () => {
  const text = formatMeetingNotes(topic, '오늘의 실천: 서로 경청하기', 2, topic.questions[1]);
  assert.ok(text.includes('《페스트》와 코로나19'));
  assert.ok(text.includes('인물 중심 대화'));
  assert.ok(text.includes('서로 경청하기'));
  assert.ok(text.includes('자동 공개되지 않습니다'));
  assert.equal(formatMeetingNotes(topic, 'a'.repeat(3500), 0, '질문').match(/a/g).length, 2500);
});

test('facilitator interface retains accessibility, privacy and correct Community asset routing', async () => {
  const [page, frontend, worker, styles, ui, manifest, workflow] = await Promise.all([
    read('community/reading/index.html'),
    read('community/reading/app.js'),
    read('community-worker.js'),
    read('community/reading/styles.css'),
    read('community/reading/meeting-ui.js'),
    read('deploy/manifests/community.worker.json'),
    read('.github/workflows/deploy-community.yml'),
  ]);
  for (const marker of ['id="meetingClock" role="timer" aria-live="off"', 'id="meetingStageButtons"', 'id="meetingNotes"',
    '실시간 다중 접속 모임은 아닙니다', '자동 전송·저장되지 않습니다']) assert.ok(page.includes(marker), marker);
  assert.ok(frontend.includes('initializeMeetingUI'));
  assert.ok(worker.includes('meeting-ui'));
  assert.ok(worker.includes('meeting-mode'));
  assert.ok(styles.includes('@media(max-width:620px)'));
  assert.ok(ui.includes('replaceChildren()'));
  assert.ok(ui.includes('new Blob'));
  assert.ok(ui.includes('hasNotes'));
  for (const forbidden of ['localStorage', 'sessionStorage', 'fetch(', 'innerHTML', 'access_token', 'service_role'])
    assert.equal(ui.includes(forbidden), false, forbidden);
  const probes = JSON.parse(manifest).worker.requests;
  assert.ok(probes.some(p => p.url.endsWith('/community/reading/meeting-ui.js') &&
    p.redirect === 'manual' && p.statuses[0] === 200));
  assert.ok(workflow.includes('node --check community/reading/meeting-ui.js'));
});
