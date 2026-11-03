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

// EKODI reading workspace: authenticated Circle members only.
// All server data is scoped by the authoritative Community API, not client roles.
// These controls do not write until the member explicitly submits a form.
function initializeSharedWorkspace() {
  const root = $('#shared');
  if (!root) return;
  const apiBase = 'https://renzehysxirjilvdxacv.supabase.co/functions/v1/community-api';
  const sbUrl = 'https://renzehysxirjilvdxacv.supabase.co';
  const publishableKey = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const workspace = (new URLSearchParams(location.search).get('workspace') || '').trim().toLowerCase();
  const scoped = path => {
    const u = new URL(apiBase + path);
    if (workspace) u.searchParams.set('workspace', workspace);
    return u.toString();
  };
  const shared = { sb: null, session: null, circles: [], circleId: '', meetings: [],
    meetingId: '', entries: [], members: [], attendance: [], canManage: false, parentId: null };
  const $s = selector => root.querySelector(selector);
  const message = text => { $s('#sharedStatus').textContent = text; };

  function loginToCommunity() {
    const auth = new URL('https://ekodi.kr/auth/');
    auth.searchParams.set('site', 'community');
    auth.searchParams.set('return_to', location.origin + location.pathname + location.search + '#shared');
    location.assign(auth.toString());
  }

  async function request(path, options = {}) {
    const session = (await shared.sb.auth.getSession()).data.session;
    if (!session) throw new Error('login_required');
    const res = await fetch(scoped(path), {
      ...options, cache: 'no-store',
      headers: { apikey: publishableKey, authorization: 'Bearer ' + session.access_token,
        ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}),
        ...(workspace ? { 'x-ekodi-workspace': workspace } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'request_failed'), { status: res.status });
    return data;
  }

  const errorText = error => ({
    login_required:'로그인이 필요합니다.',
    reading_not_ready:'모임 공동기록 기능의 안전 검증이 아직 끝나지 않았습니다. 개인 기록 파일 기능은 계속 이용할 수 있습니다.',
    circle_membership_required:'승인된 모임 회원만 공동기록을 이용할 수 있습니다.',
    workspace_membership_required:'해당 운영공간의 활성 회원 권한이 필요합니다.',
    manager_required:'모임장 또는 진행자 권한이 필요합니다.',
    circle_full:'모임 정원이 가득 찼습니다.',
    explicit_share_required:'공유하려면 공개에 명시적으로 동의해야 합니다.',
    parent_not_found:'답글을 달 수 없는 기록입니다.',
    review_not_allowed:'승인할 수 없는 신청이거나 정원이 가득 찼습니다.',
  })[error.message] || '요청을 처리하지 못했습니다. 다시 확인해 주세요. (' + error.message + ')';

  async function guard(action) {
    try { await action(); } catch (error) {
      console.error('community reading workspace', error);
      message(errorText(error));
    }
  }

  function setCircles(circles) {
    shared.circles = circles.filter(item => item.status === 'active' && item.circle);
    const select = $s('#sharedCircle');
    select.replaceChildren(new Option('Circle 선택', ''));
    shared.circles.forEach(item => select.add(new Option(item.circle.name, item.circle_id)));
    select.disabled = shared.circles.length === 0;
    const wanted = new URLSearchParams(location.search).get('circle');
    select.value = shared.circles.some(c => c.circle_id === wanted) ? wanted : shared.circles[0]?.circle_id || '';
  }

  function clearMeeting() {
    shared.meetingId = '';
    shared.entries = [];
    shared.attendance = [];
    $s('#sharedMeeting').replaceChildren(new Option('회차 선택', ''));
    $s('#sharedMeeting').disabled = true;
    $s('#sharedWorkspace').hidden = true;
    $s('#sharedEntryForm').reset();
    shared.parentId = null;
    $s('#sharedReplyContext').hidden = true;
  }

  async function loadCircles() {
    if (!shared.session) return;
    const { circles } = await request('/me/circles');
    setCircles(circles || []);
    if (!shared.circles.length) {
      clearMeeting();
      message('참여 중인 Circle이 없습니다. 먼저 Community에서 모임에 참여하거나 직접 개설하세요.');
      return;
    }
    await loadCircle($s('#sharedCircle').value);
  }

  async function loadCircle(circleId) {
    clearMeeting();
    shared.circleId = circleId;
    if (!circleId) return;
    const access = await request('/circles/' + circleId + '/reading');
    shared.canManage = Boolean(access.can_manage);
    $s('#sharedManager').hidden = !shared.canManage;
    const { meetings } = await request('/circles/' + circleId + '/reading/meetings');
    shared.meetings = meetings || [];
    const sel = $s('#sharedMeeting');
    sel.replaceChildren(new Option('독서모임 회차 선택', ''));
    shared.meetings.forEach(m => sel.add(new Option(m.title + (m.starts_at ? ' · ' + new Date(m.starts_at).toLocaleDateString('ko-KR') : ''), m.id)));
    sel.disabled = shared.meetings.length === 0;
    $s('#sharedRefresh').disabled = false;
    if (shared.canManage) await loadMembers();
    if (shared.meetings.length) {
      sel.value = shared.meetings[0].id;
      await loadMeeting(sel.value);
    } else {
      $s('#sharedWorkspace').hidden = !shared.canManage;
      message(shared.canManage ? '새 독서모임 회차를 만들어 기록을 시작하세요.' : '아직 등록된 독서모임 회차가 없습니다.');
    }
    const u = new URL(location.href);
    u.searchParams.set('circle', circleId);
    history.replaceState(null, '', u.pathname + u.search + '#shared');
  }

  async function loadMembers() {
    const data = await request('/circles/' + shared.circleId + '/reading/members');
    shared.members = data.members || [];
    const host = $s('#sharedMemberRequests');
    host.replaceChildren();
    const pending = shared.members.filter(m => m.status === 'pending');
    if (!pending.length) host.textContent = '승인 대기자가 없습니다.';
    pending.forEach(m => {
      const row = document.createElement('div');
      row.className = 'reading-review-item';
      const label = document.createElement('span');
      label.textContent = (m.display_name || '회원') + ' · ' + m.user_id.slice(0, 8);
      row.append(label);
      for (const [labelText, decision] of [['승인','approve'], ['거절','decline']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'action action-outline';
        button.textContent = labelText;
        button.addEventListener('click', () => guard(async () => {
          if (!window.confirm(labelText + ' 처리하시겠습니까?')) return;
          button.disabled = true;
          await request('/circles/' + shared.circleId + '/reading/members/' + m.user_id + '/decision',
            { method:'POST', body:JSON.stringify({decision}) });
          await loadMembers();
          message('참여 신청 처리 결과가 반영됐습니다.');
        }));
        row.append(button);
      }
      host.append(row);
    });
    const select = $s('#sharedAttendee');
    select.replaceChildren(new Option('출석 대상 회원 선택', ''));
    shared.members.filter(m => m.status === 'active').forEach(m =>
      select.add(new Option((m.display_name || '회원') + ' · ' + m.user_id.slice(0,8), m.user_id)));
  }

  function renderAttendance() {
    const host = $s('#sharedAttendanceRecords');
    host.replaceChildren();
    if (!shared.canManage) return;
    const p = document.createElement('p');
    p.textContent = '출석 기록 ' + shared.attendance.length + '건';
    host.append(p);
    shared.attendance.forEach(record => {
      const line = document.createElement('p');
      line.textContent = record.user_id.slice(0,8) + ' · ' +
        ({present:'참석',absent:'불참',excused:'사유 불참'}[record.status] || record.status);
      host.append(line);
    });
  }

  function renderEntries() {
    const host = $s('#sharedEntries');
    host.replaceChildren();
    if (!shared.entries.length) { host.textContent = '작성된 기록이 없습니다. 첫 질문이나 성찰을 남겨 보세요.'; return; }
    shared.entries.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'reading-shared-entry';
      card.dataset.scope = entry.scope;
      const by = document.createElement('small');
      by.textContent = (entry.scope === 'private' ? '나만 보기' : '모임 공유') + ' · ' +
        ({question:'질문',reflection:'성찰',action:'실천',reply:'답글'}[entry.kind] || entry.kind) +
        ' · ' + new Date(entry.created_at).toLocaleString('ko-KR');
      const body = document.createElement('p');
      body.textContent = entry.content;
      card.append(by,body);
      const actions = document.createElement('div');
      actions.className = 'reading-shared-entry-actions';
      const reply = document.createElement('button');
      reply.type = 'button'; reply.className = 'action action-outline'; reply.textContent = '답글';
      reply.addEventListener('click', () => {
        shared.parentId = entry.id;
        const form = $s('#sharedEntryForm');
        form.elements.namedItem('kind').value = 'reply';
        form.elements.namedItem('scope').value = entry.scope;
        form.elements.namedItem('scope').disabled = true;
        $s('#sharedReplyContext').hidden = false;
        form.elements.namedItem('content').focus();
      });
      actions.append(reply);
      if (entry.author_user_id === shared.session.user.id) {
        const remove = document.createElement('button');
        remove.type = 'button';remove.className = 'action action-quiet';remove.textContent = '삭제';
        remove.addEventListener('click', () => guard(async () => {
          if (!window.confirm('내 기록을 삭제하시겠습니까?')) return;
          await request('/circles/' + shared.circleId + '/reading/entries/' + entry.id + '/delete',
            { method:'POST', body:'{}' });
          await loadMeeting(shared.meetingId);
        }));
        actions.append(remove);
        if (entry.scope === 'private' && !entry.parent_id) {
          const share = document.createElement('button');
          share.type = 'button';share.className = 'action action-outline';share.textContent = '모임 공유';
          share.addEventListener('click', () => guard(async () => {
            if (!window.confirm('이 기록을 모임의 모든 활성 회원에게 공개하시겠습니까?')) return;
            await request('/circles/' + shared.circleId + '/reading/entries/' + entry.id + '/update',
              { method:'POST', body:JSON.stringify({content:entry.content,scope:'circle',share_to_circle:true}) });
            await loadMeeting(shared.meetingId);
          }));
          actions.append(share);
        }
      }
      card.append(actions);
      host.append(card);
    });
  }

  async function loadMeeting(meetingId) {
    shared.meetingId = meetingId;
    if (!meetingId) { $s('#sharedWorkspace').hidden = !shared.canManage; return; }
    const base = '/circles/' + shared.circleId + '/reading/meetings/' + meetingId;
    const [entries, attendance] = await Promise.all([
      request(base + '/entries'), request(base + '/attendance') ]);
    shared.entries = entries.entries || [];
    shared.attendance = attendance.attendance || [];
    $s('#sharedWorkspace').hidden = false;
    renderEntries();renderAttendance();
    message('활성 모임 회원 권한을 확인했습니다. 다른 사람의 비공개 기록은 표시되지 않습니다.');
  }

  async function boot() {
    if (!window.supabase?.createClient) { message('인증 연결을 불러오지 못했습니다. 다시 접속해 주세요.'); return; }
    shared.sb = window.supabase.createClient(sbUrl,publishableKey,
      { auth:{ persistSession:true,autoRefreshToken:true,detectSessionInUrl:false } });
    const token = new URLSearchParams(location.hash.slice(1)).get('ekodi_token');
    if (token) {
      const parts = new URLSearchParams(location.hash.slice(1));
      const {error} = await shared.sb.auth.verifyOtp({
        token_hash:token, type:parts.get('ekodi_type') || 'email' });
      if (error) throw error;
      history.replaceState(null, '', location.pathname + location.search + '#shared');
    }
    shared.session = (await shared.sb.auth.getSession()).data.session;
    $s('#sharedLogin').hidden = Boolean(shared.session);
    if (!shared.session) { message('로그인 전에도 주제와 진행안은 열람할 수 있습니다. 모임 기록은 회원만 이용합니다.'); return; }
    message('내 모임과 권한을 확인합니다.');
    await loadCircles();
  }

  $s('#sharedLogin').addEventListener('click', loginToCommunity);
  $s('#sharedCircle').addEventListener('change', () => guard(() => loadCircle($s('#sharedCircle').value)));
  $s('#sharedMeeting').addEventListener('change', () => guard(() => loadMeeting($s('#sharedMeeting').value)));
  $s('#sharedRefresh').addEventListener('click', () => guard(() => loadCircle(shared.circleId)));
  $s('#sharedCancelReply').addEventListener('click', () => {
    shared.parentId = null;
    const form = $s('#sharedEntryForm');
    form.elements.namedItem('kind').value = 'reflection';
    form.elements.namedItem('scope').value = 'private';
    form.elements.namedItem('scope').disabled = false;
    $s('#sharedReplyContext').hidden = true;
  });
  $s('#sharedMeetingForm').addEventListener('submit', event => {
    event.preventDefault();
    guard(async () => {
      const form = event.currentTarget, values = new FormData(form);
      const date = values.get('starts_at');
      const starts_at = date ? new Date(String(date)).toISOString() : null;
      await request('/circles/' + shared.circleId + '/reading/meetings',
        {method:'POST', body:JSON.stringify({title:values.get('title'),book_title:values.get('book_title'),starts_at})});
      form.reset();
      await loadCircle(shared.circleId);
      message('독서모임 회차를 등록했습니다.');
    });
  });
  $s('#sharedEntryForm').addEventListener('submit', event => {
    event.preventDefault();
    guard(async () => {
      if (!shared.meetingId) throw new Error('회차를 먼저 선택하세요.');
      const form = event.currentTarget, values = new FormData(form);
      const scope = shared.parentId ? form.elements.namedItem('scope').value : values.get('scope');
      const shareConsent = Boolean(form.elements.namedItem('share_to_circle').checked);
      if (scope === 'circle' && !shareConsent) throw new Error('explicit_share_required');
      await request('/circles/' + shared.circleId + '/reading/meetings/' + shared.meetingId + '/entries',
        {method:'POST',body:JSON.stringify({
          kind:shared.parentId ? 'reply' : values.get('kind'),scope,content:values.get('content'),
          parent_id:shared.parentId,share_to_circle:shareConsent,
        })});
      form.reset();
      form.elements.namedItem('scope').disabled = false;
      shared.parentId = null;
      $s('#sharedReplyContext').hidden = true;
      await loadMeeting(shared.meetingId);
      message('기록을 저장했습니다. 선택한 공개 범위에 따라 표시됩니다.');
    });
  });
  $s('#sharedAttendanceSave').addEventListener('click', () => guard(async () => {
    if (!shared.meetingId || !shared.canManage) return;
    const user_id = $s('#sharedAttendee').value;
    if (!user_id) throw new Error('출석 대상을 먼저 선택하세요.');
    await request('/circles/' + shared.circleId + '/reading/meetings/' + shared.meetingId + '/attendance',
      {method:'POST',body:JSON.stringify({user_id,status:$s('#sharedAttendanceStatus').value})});
    await loadMeeting(shared.meetingId);
    message('출석 상태를 저장했습니다.');
  }));
  $s('#sharedExport').addEventListener('click', () => {
    if (!shared.session) return;
    const mine = shared.entries.filter(e => e.author_user_id === shared.session.user.id);
    if (!mine.length) { message('내보낼 기록이 없습니다.');return; }
    const lines = ['EKODI 함께읽기 · 내 독서기록', ...mine.flatMap(e => ['',e.kind + ' (' + e.scope + ')',
      e.content,'작성 ' + e.created_at])];
    const url = URL.createObjectURL(new Blob(['\uFEFF',lines.join('\n')],{type:'text/plain;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url;a.download = 'ekodi-my-reading-' + new Date().toISOString().slice(0,10) + '.txt';
    document.body.append(a);a.click();a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url),1000);
    message('내 독서기록 파일을 내려받도록 요청했습니다.');
  });
  guard(boot);
}
initializeSharedWorkspace();
