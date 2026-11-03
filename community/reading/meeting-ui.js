import {
  createMeetingState, tickMeeting, toggleMeeting, changeMeetingStage,
  formatMeetingClock, formatMeetingNotes,
} from './meeting-mode.js';

// One-device moderator console. It does not simulate multiple users or live collaboration.
export function initializeMeetingUI({ getTopic, getQuestionIndex, setQuestionIndex, announce, copyText }) {
  const $ = selector => document.querySelector(selector);
  let meeting = createMeetingState(getTopic());
  let ticker = null;

  function stopTicker() {
    if (ticker !== null) window.clearInterval(ticker);
    ticker = null;
  }

  function renderTimer() {
    const topic = getTopic();
    const stage = topic.stages[meeting.stageIndex];
    $('#meetingClock').textContent = formatMeetingClock(meeting.secondsLeft);
    $('#meetingClock').setAttribute('aria-label', stage.label + ' 남은 시간 ' + formatMeetingClock(meeting.secondsLeft));
    const run = $('#meetingRun');
    run.textContent = meeting.running ? '일시정지' : meeting.secondsLeft === 0 ? '순서를 다시 시작하세요' : '시간 시작';
    run.disabled = meeting.secondsLeft <= 0;
    const previousSeconds = topic.stages.slice(0, meeting.stageIndex).reduce((sum, s) => sum + s.min * 60, 0);
    const elapsedSeconds = stage.min * 60 - meeting.secondsLeft;
    const progress = $('#meetingProgress');
    progress.max = topic.duration * 60;
    progress.value = Math.max(0, previousSeconds + elapsedSeconds);
    $('#meetingClockHint').textContent = meeting.secondsLeft === 0 ? '시간 종료 · 다음 순서로 이동하거나 다시 시작할 수 있습니다.' :
      meeting.running ? '진행 중 · 이 기기에서 시간이 흐릅니다.' : '정지 중 · 직접 시작할 때만 시간이 흐릅니다.';
  }

  function tick() {
    if (!meeting.running) return;
    const wasRunning = meeting.running;
    meeting = tickMeeting(meeting, Date.now());
    renderTimer();
    if (wasRunning && !meeting.running) {
      stopTicker();
      announce('진행 시간 종료 · 다음 순서로 이동할 수 있습니다.');
    }
  }

  function renderQuestion() {
    const topic = getTopic();
    const i = getQuestionIndex();
    $('#meetingQuestion').textContent = topic.questions[i];
    $('#meetingQuestionCount').textContent = (i + 1) + ' / ' + topic.questions.length;
    $('#meetingQuestionPrev').disabled = i <= 0;
    $('#meetingQuestionNext').disabled = i >= topic.questions.length - 1;
  }

  function renderStages() {
    const topic = getTopic();
    const stage = topic.stages[meeting.stageIndex];
    $('#meetingTitle').textContent = topic.title;
    $('#meetingStageLabel').textContent = stage.label;
    $('#meetingStageDetail').textContent = stage.detail;
    $('#meetingStageCount').textContent = (meeting.stageIndex + 1) + ' / ' + topic.stages.length;
    $('#meetingPrevStage').disabled = meeting.stageIndex === 0;
    $('#meetingNextStage').disabled = meeting.stageIndex === topic.stages.length - 1;
    const list = $('#meetingStageButtons');
    list.replaceChildren();
    topic.stages.forEach((item, index) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'meeting-stage-button';
      const title = document.createElement('strong');
      title.textContent = (index + 1) + '. ' + item.label;
      const duration = document.createElement('small');
      duration.textContent = item.min + '분';
      button.append(title, duration);
      if (index === meeting.stageIndex) {
        button.setAttribute('aria-current', 'step');
      }
      button.addEventListener('click', () => switchStage(index, true));
      li.append(button);
      list.append(li);
    });
    renderTimer();
    renderQuestion();
  }

  function switchStage(next, restoreListFocus = false) {
    stopTicker();
    meeting = changeMeetingStage(meeting, getTopic(), next);
    renderStages();
    if (restoreListFocus) $('#meetingStageButtons [aria-current="step"]')?.focus();
    announce('진행 순서: ' + getTopic().stages[meeting.stageIndex].label);
  }

  function onTopicChanged() {
    stopTicker();
    $('#meetingNotes').value = '';
    meeting = createMeetingState(getTopic());
    renderStages();
  }

  function hasNotes() {
    return Boolean($('#meetingNotes').value.trim());
  }

  $('#meetingRun').addEventListener('click', () => {
    tick();
    meeting = toggleMeeting(meeting, Date.now());
    stopTicker();
    if (meeting.running) ticker = window.setInterval(tick, 1000);
    renderTimer();
    announce(meeting.running ? '진행 시간을 시작했습니다.' : '진행 시간을 일시정지했습니다.');
  });

  $('#meetingReset').addEventListener('click', () => switchStage(meeting.stageIndex));
  $('#meetingPrevStage').addEventListener('click', () => switchStage(meeting.stageIndex - 1));
  $('#meetingNextStage').addEventListener('click', () => switchStage(meeting.stageIndex + 1));

  $('#meetingQuestionPrev').addEventListener('click', () => setQuestionIndex(getQuestionIndex() - 1));
  $('#meetingQuestionNext').addEventListener('click', () => setQuestionIndex(getQuestionIndex() + 1));

  function shareUrl() {
    const url = new URL('/community/reading', location.origin);
    url.searchParams.set('topic', getTopic().id);
    url.hash = 'meeting';
    return url.toString();
  }

  $('#meetingShare').addEventListener('click', () => {
    const copy = [
      '에코디 함께읽기',
      getTopic().title,
      '모임 진행안 보기',
      shareUrl(),
    ].join('\n');
    copyText(copy, '선택한 모임 진행안 링크를 복사했습니다.');
  });

  $('#meetingCopyQuestion').addEventListener('click', () => {
    copyText('에코디 함께읽기 · 토론 질문\n' + getTopic().questions[getQuestionIndex()] + '\n' + shareUrl(),
      '토론 질문과 진행안 링크를 복사했습니다.');
  });

  $('#meetingExport').addEventListener('click', () => {
    const text = formatMeetingNotes(getTopic(), $('#meetingNotes').value, meeting.stageIndex,
      getTopic().questions[getQuestionIndex()]);
    const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'ekodi-reading-meeting-' + new Date().toISOString().slice(0, 10) + '.txt';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    announce('진행 메모 파일 저장을 요청했습니다. 다운로드 위치를 확인해 주세요.');
  });

  $('#meetingClear').addEventListener('click', () => {
    if (!hasNotes()) return;
    if (!window.confirm('진행 메모를 지우시겠습니까? 서버에 저장된 사본이 없습니다.')) return;
    $('#meetingNotes').value = '';
    announce('이 기기의 진행 메모를 지웠습니다.');
  });

  window.addEventListener('pagehide', stopTicker);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  renderStages();
  return { onTopicChanged, hasNotes, renderQuestion };
}
