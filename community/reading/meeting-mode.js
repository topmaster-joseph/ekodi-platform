// The session timer is a local, dependency-free facilitation aid.
// It never writes participant content to a service, browser storage, or analytics.
const boundedIndex = (index, length) => Math.min(Math.max(Math.trunc(Number(index) || 0), 0), Math.max(0, length - 1));

export function createMeetingState(topic) {
  return {
    topicId: topic.id,
    stageIndex: 0,
    secondsLeft: Math.max(0, Math.trunc(topic.stages[0]?.min || 0) * 60),
    running: false,
    lastTickAt: null,
  };
}

export function tickMeeting(state, now = Date.now()) {
  if (!state.running || !Number.isFinite(state.lastTickAt)) return state;
  const elapsed = Math.max(0, Math.floor((now - state.lastTickAt) / 1000));
  if (elapsed < 1) return state;
  const secondsLeft = Math.max(0, state.secondsLeft - elapsed);
  return {
    ...state,
    secondsLeft,
    running: secondsLeft > 0,
    lastTickAt: secondsLeft > 0 ? state.lastTickAt + elapsed * 1000 : null,
  };
}

export function toggleMeeting(state, now = Date.now()) {
  if (state.running) return { ...tickMeeting(state, now), running: false, lastTickAt: null };
  if (state.secondsLeft <= 0) return state;
  return { ...state, running: true, lastTickAt: now };
}

export function changeMeetingStage(state, topic, index) {
  const stageIndex = boundedIndex(index, topic.stages.length);
  return {
    topicId: topic.id,
    stageIndex,
    secondsLeft: Math.trunc(topic.stages[stageIndex].min) * 60,
    running: false,
    lastTickAt: null,
  };
}

export function formatMeetingClock(seconds) {
  const s = Math.max(0, Math.trunc(Number(seconds) || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export function formatMeetingNotes(topic, notes, stageIndex, question) {
  const stage = topic.stages[boundedIndex(stageIndex, topic.stages.length)];
  return [
    '함께읽기 · 모임 진행자 메모',
    '주제: ' + topic.title,
    '읽을 자료: ' + topic.books,
    '현재 순서: ' + stage.label + ' (' + stage.min + '분)',
    '토론 질문: ' + question,
    '',
    '[진행 메모]',
    String(notes || '').trim().slice(0, 2500),
    '',
    '이 메모는 진행자가 명시적으로 내보낸 로컬 파일이며 공동체에 자동 공개되지 않습니다.',
  ].join('\n');
}
