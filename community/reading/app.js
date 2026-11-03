import { TOPICS, CATEGORIES, topicById, formatFacilitatorGuide } from './topics.js';
import { initializeMeetingUI } from './meeting-ui.js';

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
