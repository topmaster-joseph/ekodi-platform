import { TOPICS, CATEGORIES, topicById, formatFacilitatorGuide,
  createMeetingState, tickMeeting, toggleMeeting, changeMeetingStage,
  formatMeetingClock, formatMeetingNotes } from './topics.js?rv=meeting-20261103-b';

const $ = selector => document.querySelector(selector);
const state = { category: '전체', topic: topicById(new URLSearchParams(location.search).get('topic')), questionIndex: 0 };
const feedback = $('#readingFeedback');

function announce(message) {
  feedback.textContent = message;
}

function createCircleHref(topic) {
  const url = new URL('/community/', location.origin);
  url.searchParams.set('reading', 'create');
  url.searchParams.set('topic', topic.id);
  url.hash = 'circles';
  return url.pathname + url.search + url.hash;
}

function renderFilters() {
  const host = $('#topicFilters');
  host.replaceChildren();
  CATEGORIES.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category;
    button.setAttribute('aria-pressed', String(state.category === category));
    button.addEventListener('click', () => {
      state.category = category;
      renderFilters();
      renderTopics();
    });
    host.append(button);
  });
}

function selectTopic(id, scrollToGuide = true) {
  if (state.topic.id !== id && meetingUI.hasNotes() &&
    !window.confirm('현재 진행 메모가 있습니다. 기록을 내려받지 않은 채 다른 주제로 이동하시겠습니까?')) return;
  state.topic = topicById(id);
  state.questionIndex = 0;
  meetingUI.onTopicChanged();
  const url = new URL(location.href);
  url.searchParams.set('topic', state.topic.id);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  renderTopics();
  renderWorkshop();
  announce('선택한 주제: ' + state.topic.title);
  if (scrollToGuide) $('#facilitator').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTopics() {
  const host = $('#topicGrid');
  host.replaceChildren();
  TOPICS.filter(t => state.category === '전체' || t.category === state.category).forEach(topic => {
    const card = document.createElement('article');
    card.className = 'topic-card';
    if (state.topic.id === topic.id) card.classList.add('is-selected');
    const meta = document.createElement('small');
    meta.className = 'topic-meta';
    meta.textContent = topic.category + ' · ' + topic.duration + '분 예시';
    const heading = document.createElement('h3');
    heading.textContent = topic.title;
    const summary = document.createElement('p');
    summary.textContent = topic.subtitle;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action action-outline';
    button.textContent = state.topic.id === topic.id ? '선택한 주제 · 진행안' : '진행안 보기';
    button.setAttribute('aria-label', topic.title + ' 진행안 보기');
    button.addEventListener('click', () => selectTopic(topic.id));
    card.append(meta, heading, summary, button);
    host.append(card);
  });
}

function renderQuestion() {
  const { questions } = state.topic;
  $('#questionIndex').textContent = (state.questionIndex + 1) + ' / ' + questions.length;
  $('#currentQuestion').textContent = questions[state.questionIndex];
  $('#prevQuestion').disabled = state.questionIndex === 0;
  $('#nextQuestion').disabled = state.questionIndex >= questions.length - 1;
  meetingUI.renderQuestion();
}

function renderWorkshop() {
  const topic = state.topic;
  $('#activeTopicLabel').textContent = topic.category + ' · ' + topic.duration + '분';
  $('#workshopTitle').textContent = topic.title;
  $('#workshopSummary').textContent = topic.subtitle + ' | 읽을 자료: ' + topic.books;
  const list = $('#stageList');
  list.replaceChildren();
  topic.stages.forEach(stage => {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = stage.min + '분 · ' + stage.label;
    item.append(strong, document.createTextNode(' — ' + stage.detail));
    list.append(item);
  });
  $('#createCircleLink').href = createCircleHref(topic);
  $('#createFromTopic').href = createCircleHref(topic);
  renderQuestion();
}

async function copyText(text, confirmation) {
  if (!text.trim()) { announce('복사할 내용이 없습니다.'); return; }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.left = '-9999px';
      document.body.append(temp);
      temp.select();
      const copied = document.execCommand('copy');
      temp.remove();
      if (!copied) throw new Error('clipboard_unavailable');
    }
    announce(confirmation);
  } catch {
    announce('브라우저에서 복사를 허용하지 않았습니다. 파일 저장 기능을 사용해 주세요.');
  }
}

function reflectionText() {
  return [
    '에코디 함께읽기 · 개인 성찰 기록',
    '주제: ' + state.topic.title,
    '작성일: ' + new Date().toLocaleDateString('ko-KR'),
    '',
    '1. 마음에 남은 문장 또는 장면',
    $('#readingInsight').value.trim(),
    '',
    '2. 함께 이야기하며 달라진 생각',
    $('#readingDialogue').value.trim(),
    '',
    '3. 이번 주에 실천할 한 가지',
    $('#readingAction').value.trim(),
    '',
    '이 기록은 작성자가 직접 저장·공유하도록 작성되었습니다.'
  ].join('\n');
}

function hasReflection() {
  return ['#readingInsight', '#readingDialogue', '#readingAction'].some(selector => $(selector).value.trim());
}

const meetingUI = initializeMeetingUI({
  getTopic: () => state.topic,
  getQuestionIndex: () => state.questionIndex,
  setQuestionIndex: index => {
    state.questionIndex = Math.min(Math.max(index, 0), state.topic.questions.length - 1);
    renderQuestion();
  },
  announce,
  copyText,
});

$('#prevQuestion').addEventListener('click', () => {
  state.questionIndex = Math.max(0, state.questionIndex - 1);
  renderQuestion();
});
$('#nextQuestion').addEventListener('click', () => {
  state.questionIndex = Math.min(state.topic.questions.length - 1, state.questionIndex + 1);
  renderQuestion();
});
$('#copyQuestion').addEventListener('click', () => copyText(state.topic.questions[state.questionIndex], '현재 질문을 복사했습니다.'));
$('#copyGuide').addEventListener('click', () => copyText(formatFacilitatorGuide(state.topic), '전체 진행안을 복사했습니다.'));
$('#copyReflection').addEventListener('click', () => {
  if (!hasReflection()) { announce('먼저 생각을 기록해 주세요.'); return; }
  copyText(reflectionText(), '내 기록을 복사했습니다. 공유 전 개인 정보를 확인하세요.');
});
$('#downloadReflection').addEventListener('click', () => {
  if (!hasReflection()) { announce('저장할 내용이 없습니다. 먼저 기록을 작성해 주세요.'); return; }
  const blob = new Blob(['\uFEFF', reflectionText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ekodi-reading-reflection-' + new Date().toISOString().slice(0,10) + '.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('개인 기록 파일 저장을 요청했습니다. 다운로드 위치를 확인해 주세요.');
});
$('#clearReflection').addEventListener('click', () => {
  if (!hasReflection()) return;
  if (!window.confirm('작성한 내용을 모두 지우시겠습니까? 자동 저장된 사본이 없습니다.')) return;
  ['#readingInsight', '#readingDialogue', '#readingAction'].forEach(selector => { $(selector).value = ''; });
  announce('작성 내용을 지웠습니다.');
});
function highlightTab() {
  const current = location.hash || '#topics';
  document.querySelectorAll('.reading-tabs a').forEach(link => {
    if (link.getAttribute('href') === current) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', highlightTab);
renderFilters();
renderTopics();
renderWorkshop();
highlightTab();


// Bundled under the already deployed app.js asset URL for edge compatibility.
// One-device moderator console. It does not simulate multiple users or live collaboration.
function initializeMeetingUI({ getTopic, getQuestionIndex, setQuestionIndex, announce, copyText }) {
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
