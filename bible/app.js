import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg = window.EKODI_BIBLE_CONFIG || {};
const enabled = Boolean(cfg.dataEnabled && cfg.supabaseUrl && cfg.supabasePublishableKey);
const sb = enabled ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { detectSessionInUrl: true, persistSession: true } }) : null;
const TOPICS = ['관계', '가족', '돈', '일', '진로', '외로움', '실패', '분노', '감사', '믿음'];
const GUIDES = {
  관계: ['골로새서 3:12-14', '지금 그 관계에서 가장 지키고 싶은 것은 무엇인가요?'],
  가족: ['에베소서 4:1-3', '가족 안에서 지금 가장 필요한 평화의 행동은 무엇인가요?'],
  돈: ['마태복음 6:25-34', '돈에 대한 염려 가운데 오늘 내가 통제할 수 있는 한 가지는 무엇인가요?'],
  일: ['골로새서 3:23-24', '오늘의 일을 더 큰 의미와 연결한다면 무엇이 달라질까요?'],
  진로: ['잠언 3:5-6', '앞길 전체가 아니라 지금 걸을 수 있는 한 걸음은 무엇인가요?'],
  외로움: ['시편 139:1-12', '누군가에게 먼저 연결을 요청할 수 있다면 누구인가요?'],
  실패: ['고린도후서 4:7-9', '이번 실패가 끝이 아니라면 무엇을 다시 시작할 수 있을까요?'],
  분노: ['야고보서 1:19-20', '분노 아래에 숨은 상처나 두려움은 무엇인가요?'],
  감사: ['데살로니가전서 5:16-18', '오늘 받은 것 가운데 누구에게 흘려보낼 수 있는 감사가 있나요?'],
  믿음: ['마가복음 9:24', '믿음과 의심이 함께 있다면 하나님께 가장 정직하게 말하고 싶은 것은 무엇인가요?'],
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let session = null;
let topic = '믿음';
let chatHistory = [];
let conversationId = null;
let journeys = [];
let groups = [];

function authUrl() {
  const url = new URL(cfg.authUrl || 'https://auth.ekodi.kr/?site=bible');
  url.searchParams.set('site', 'bible');
  url.searchParams.set('return_to', `${location.origin}${location.pathname}`);
  return url.href;
}

async function handoff() {
  if (!sb || !location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('ekodi_token');
  if (!token) return;
  const { error } = await sb.auth.verifyOtp({ token_hash: token, type: params.get('ekodi_type') || 'email' });
  window.history.replaceState({}, document.title, location.pathname);
  if (error) throw error;
}

function renderIdentity() {
  const button = $('#authButton');
  const name = $('#identityName');
  if (!enabled) {
    button.textContent = '격리 스테이징';
    button.disabled = true;
    name.textContent = '데이터 격리 모드';
    return;
  }
  button.disabled = false;
  if (session) {
    const meta = session.user.user_metadata || {};
    button.textContent = '로그아웃';
    name.textContent = meta.full_name || meta.name || session.user.email?.split('@')[0] || 'EKODI Member';
  } else {
    button.textContent = 'Google로 시작';
    name.textContent = '로그인 전';
  }
}

async function authAction() {
  if (!session) {
    location.assign(authUrl());
    return;
  }
  await sb.auth.signOut();
  session = null;
  conversationId = null;
  chatHistory = [];
  $('#chat').innerHTML = '';
  renderIdentity();
  await refreshPrivate();
}

function showView(name, push = true) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  if (push) window.history.replaceState({}, '', `/${name}`);
  if (name === 'journey') loadJourneyArea();
  if (name === 'together') loadTogetherArea();
}

function renderTopics() {
  const host = $('#topicGrid');
  host.innerHTML = TOPICS.map(item => `<button type="button" class="topic ${item === topic ? 'active' : ''}" data-topic="${item}">${item}</button>`).join('');
  $$('[data-topic]', host).forEach(button => {
    button.onclick = () => {
      if (topic !== button.dataset.topic) {
        topic = button.dataset.topic;
        conversationId = null;
        chatHistory = [];
        $('#chat').innerHTML = '';
      }
      renderTopics();
      applyGuide();
    };
  });
}

function applyGuide() {
  const [ref, question] = GUIDES[topic] || GUIDES.믿음;
  $('#todayTitle').textContent = `${topic}, 말씀과 함께 바라보기`;
  $('#todayQuestion').textContent = question;
  $('#todayScripture').textContent = ref;
  $('#conversationScripture').textContent = ref;
  $('#conversationTitle').textContent = `${topic}에서 말씀으로`;
}

async function loadToday() {
  applyGuide();
  if (!enabled) return;
  const { data } = await sb.from('bible_content_plans')
    .select('title,question,scripture_ref,practice_prompt')
    .eq('tenant_slug', cfg.tenantSlug || 'ekodi-church')
    .eq('is_active', true)
    .lte('active_date', new Date().toISOString().slice(0, 10))
    .order('active_date', { ascending: false })
    .limit(1);
  if (data?.[0]) {
    $('#todayTitle').textContent = data[0].title;
    $('#todayQuestion').textContent = data[0].question;
    $('#todayScripture').textContent = data[0].scripture_ref;
    $('#conversationScripture').textContent = data[0].scripture_ref;
  }
}

function bubble(role, text) {
  const node = document.createElement('div');
  node.className = `bubble ${role}`;
  node.innerHTML = `<small>${role === 'user' ? '나' : '말씀대화'}</small>${esc(text).replace(/\n/g, '<br>')}`;
  $('#chat').append(node);
  $('#chat').scrollTop = $('#chat').scrollHeight;
}

async function ensureConversation() {
  if (!session || conversationId) return conversationId;
  const { data, error } = await sb.from('bible_conversations').insert({
    user_id: session.user.id,
    tenant_slug: cfg.tenantSlug || 'ekodi-church',
    topic,
    mode: 'guided',
  }).select('id').single();
  if (error) throw error;
  conversationId = data.id;
  return conversationId;
}

async function saveMessage(role, content, scriptureRef = '') {
  if (!session) return;
  const id = await ensureConversation();
  const { error } = await sb.from('bible_messages').insert({
    conversation_id: id,
    user_id: session.user.id,
    role,
    content,
    scripture_ref: scriptureRef,
  });
  if (error) throw error;
}

async function sendMessage(message) {
  bubble('user', message);
  chatHistory.push({ role: 'user', content: message });
  await saveMessage('user', message);
  const token = session?.access_token || '';
  const response = await fetch('/api/assist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ message, topic, history: chatHistory.slice(-8) }),
  });
  const data = await response.json().catch(() => ({}));
  const reply = data.reply || '지금은 AI 보조 기능 없이도 대화를 이어갈 수 있습니다. 이 이야기를 한 문장으로 더 말해 주시겠어요?';
  bubble('assistant', reply);
  chatHistory.push({ role: 'assistant', content: reply });
  await saveMessage('assistant', reply, data.scriptureRef || '');
  $('#modeBadge').textContent = data.mode === 'ai' ? 'AI 대화' : data.authenticated ? '기본 말씀대화' : '무료 안내';
  $('#aiNotice').textContent = data.notice || '';
}

async function loadJourneys() {
  const gate = $('#journeyGate');
  const host = $('#journeyList');
  if (!session) {
    gate.innerHTML = '<strong>로그인하면 Journey를 안전하게 저장합니다.</strong><p>개인 묵상과 기도, 실천 기록은 기본적으로 본인만 볼 수 있습니다.</p>';
    host.innerHTML = '';
    journeys = [];
    syncShareOptions();
    return;
  }
  gate.innerHTML = '';
  const { data, error } = await sb.from('bible_journeys').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50);
  if (error) {
    gate.textContent = 'Journey를 불러오지 못했습니다.';
    return;
  }
  journeys = data || [];
  host.innerHTML = journeys.length ? journeys.map(journey => `
    <article class="record">
      <span class="meta">${esc(journey.topic)} · ${new Date(journey.created_at).toLocaleDateString('ko-KR')}</span>
      <h3>${esc(journey.title)}</h3>
      <p class="scripture">${esc(journey.scripture_ref)}</p>
      <p>${esc(journey.reflection || '')}</p>
      <button class="ghost" data-edit-journey="${journey.id}" type="button">이어 기록하기</button>
    </article>`).join('') : '<div class="empty">아직 Journey가 없습니다. 오늘의 대화에서 한 걸음을 기록해 보세요.</div>';
  $$('[data-edit-journey]').forEach(button => button.onclick = () => editJourney(button.dataset.editJourney));
  syncShareOptions();
}

function editJourney(id) {
  const journey = journeys.find(item => item.id === id);
  if (!journey) return;
  const form = $('#journeyForm');
  form.classList.remove('hidden');
  for (const key of ['id', 'title', 'topic', 'scripture_ref', 'reflection', 'prayer']) {
    if (form.elements[key]) form.elements[key].value = journey[key] || '';
  }
  form.scrollIntoView({ behavior: 'smooth' });
}

async function saveJourney(form) {
  if (!session) {
    location.assign(authUrl());
    return;
  }
  const data = new FormData(form);
  const id = String(data.get('id') || '');
  const payload = {
    user_id: session.user.id,
    tenant_slug: cfg.tenantSlug || 'ekodi-church',
    title: String(data.get('title') || '').trim(),
    topic: String(data.get('topic') || '').trim(),
    scripture_ref: String(data.get('scripture_ref') || '').trim(),
    reflection: String(data.get('reflection') || '').trim(),
    prayer: String(data.get('prayer') || '').trim(),
    status: 'practicing',
    updated_at: new Date().toISOString(),
  };
  let journeyId = id;
  if (id) {
    const { error } = await sb.from('bible_journeys').update(payload).eq('id', id).eq('user_id', session.user.id);
    if (error) throw error;
  } else {
    const { data: inserted, error } = await sb.from('bible_journeys').insert(payload).select('id').single();
    if (error) throw error;
    journeyId = inserted.id;
  }
  const practice = String(data.get('practice') || '').trim();
  if (practice) {
    const { error } = await sb.from('bible_practices').insert({ user_id: session.user.id, journey_id: journeyId, action_text: practice, due_date: data.get('followup_date') || null });
    if (error) throw error;
  }
  const followupDate = String(data.get('followup_date') || '');
  if (followupDate) {
    const { error } = await sb.from('bible_followups').insert({ user_id: session.user.id, journey_id: journeyId, prompt: '이 말씀을 어떻게 살아보았나요?', due_at: `${followupDate}T09:00:00+09:00` });
    if (error) throw error;
  }
  form.reset();
  form.classList.add('hidden');
  await loadJourneyArea();
}

async function loadFollowups() {
  const host = $('#followupList');
  if (!session) {
    host.innerHTML = '<div class="empty">로그인하면 예정된 돌아보기를 확인할 수 있습니다.</div>';
    return;
  }
  const { data, error } = await sb.from('bible_followups').select('id,journey_id,prompt,due_at,answered_at,answer').eq('user_id', session.user.id).order('due_at', { ascending: true }).limit(30);
  if (error) {
    host.innerHTML = '<div class="empty">돌아보기 일정을 불러오지 못했습니다.</div>';
    return;
  }
  const rows = data || [];
  host.innerHTML = rows.length ? rows.map(row => `
    <article class="record">
      <span class="meta">${new Date(row.due_at).toLocaleDateString('ko-KR')} · ${row.answered_at ? '기록 완료' : '돌아보기'}</span>
      <h3>${esc(row.prompt)}</h3>
      ${row.answered_at ? `<p>${esc(row.answer || '')}</p>` : `<form data-followup-form="${row.id}" class="inline-form"><input name="answer" maxlength="1200" placeholder="그 말씀을 어떻게 살아보았나요?" required><button class="primary" type="submit">기록</button></form>`}
    </article>`).join('') : '<div class="empty">예정된 돌아보기가 없습니다.</div>';
  $$('[data-followup-form]', host).forEach(form => {
    form.onsubmit = async event => {
      event.preventDefault();
      const answer = String(new FormData(form).get('answer') || '').trim();
      if (!answer) return;
      const { error: updateError } = await sb.from('bible_followups').update({ answer, answered_at: new Date().toISOString() }).eq('id', form.dataset.followupForm).eq('user_id', session.user.id);
      if (updateError) alert('돌아보기를 저장하지 못했습니다.');
      else await loadFollowups();
    };
  });
}

async function loadGroups() {
  const gate = $('#groupGate');
  const host = $('#groupList');
  if (!session) {
    gate.innerHTML = '<strong>공동체 기능은 로그인 후 사용할 수 있습니다.</strong><p>초대코드로 가족·소그룹·교회 모임에 연결할 수 있습니다.</p>';
    host.innerHTML = '';
    groups = [];
    syncShareOptions();
    return;
  }
  gate.innerHTML = '';
  const { data: members, error: memberError } = await sb.from('bible_group_members').select('group_id,role').eq('user_id', session.user.id);
  if (memberError) {
    gate.textContent = '공동체 정보를 불러오지 못했습니다.';
    return;
  }
  const ids = (members || []).map(item => item.group_id);
  if (!ids.length) {
    groups = [];
    host.innerHTML = '<div class="empty">아직 연결된 공동체가 없습니다.</div>';
    syncShareOptions();
    return;
  }
  const { data, error } = await sb.from('bible_groups').select('*').in('id', ids);
  if (error) {
    gate.textContent = '공동체 정보를 불러오지 못했습니다.';
    return;
  }
  groups = data || [];
  host.innerHTML = groups.map(group => `<article class="record"><span class="meta">${esc(group.kind)}</span><h3>${esc(group.name)}</h3><p>초대코드 <strong>${esc(group.invite_code)}</strong></p></article>`).join('');
  syncShareOptions();
}

async function loadSharedFeed() {
  const host = $('#sharedFeed');
  if (!session) {
    host.innerHTML = '<div class="empty">로그인하고 공동체에 참여하면 공유된 Journey가 표시됩니다.</div>';
    return;
  }
  const { data, error } = await sb.rpc('bible_shared_feed', { p_limit: 50 });
  if (error) {
    host.innerHTML = '<div class="empty">공동체 피드를 불러오지 못했습니다.</div>';
    return;
  }
  const rows = data || [];
  host.innerHTML = rows.length ? rows.map(row => `
    <article class="record">
      <span class="meta">${new Date(row.shared_at).toLocaleDateString('ko-KR')} · ${esc(row.topic || '말씀')}</span>
      <h3>${esc(row.title)}</h3>
      <p class="scripture">${esc(row.scripture_ref || '')}</p>
      <p>${esc(row.reflection || '')}</p>
      ${row.note ? `<p class="notice">나눔: ${esc(row.note)}</p>` : ''}
    </article>`).join('') : '<div class="empty">공동체에 명시적으로 공유된 Journey가 아직 없습니다.</div>';
}

function syncShareOptions() {
  $('#shareJourney').innerHTML = journeys.map(journey => `<option value="${journey.id}">${esc(journey.title)}</option>`).join('') || '<option value="">Journey 없음</option>';
  $('#shareGroup').innerHTML = groups.map(group => `<option value="${group.id}">${esc(group.name)}</option>`).join('') || '<option value="">공동체 없음</option>';
}

async function loadJourneyArea() {
  await Promise.all([loadJourneys(), loadFollowups()]);
}

async function loadTogetherArea() {
  await loadGroups();
  await loadSharedFeed();
}

async function refreshPrivate() {
  await Promise.all([loadJourneyArea(), loadTogetherArea()]);
}

$$('[data-view]').forEach(button => button.onclick = () => showView(button.dataset.view));
$('#authButton').onclick = authAction;
$('#startToday').onclick = () => {
  showView('conversation');
  const question = $('#todayQuestion').textContent;
  if (!chatHistory.length) bubble('assistant', `${question}\n\n${$('#todayScripture').textContent}`);
};
$('#chatForm').onsubmit = async event => {
  event.preventDefault();
  const input = event.currentTarget.elements.message;
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  input.disabled = true;
  try { await sendMessage(message); }
  catch (error) {
    console.error(error);
    bubble('assistant', '대화를 연결하지 못했습니다. 잠시 후 다시 시도하거나 Journey에 직접 기록해 주세요.');
  } finally {
    input.disabled = false;
    input.focus();
  }
};
$('#newJourney').onclick = () => {
  const form = $('#journeyForm');
  form.reset();
  form.classList.remove('hidden');
  form.elements.topic.value = topic;
  form.elements.scripture_ref.value = (GUIDES[topic] || GUIDES.믿음)[0];
};
$('#cancelJourney').onclick = () => $('#journeyForm').classList.add('hidden');
$('#journeyForm').onsubmit = async event => {
  event.preventDefault();
  try { await saveJourney(event.currentTarget); }
  catch (error) { console.error(error); alert('Journey 저장에 실패했습니다.'); }
};
$('#createGroupForm').onsubmit = async event => {
  event.preventDefault();
  if (!session) { location.assign(authUrl()); return; }
  const formData = new FormData(event.currentTarget);
  const { error } = await sb.rpc('bible_create_group', {
    p_name: String(formData.get('name') || ''),
    p_kind: String(formData.get('kind') || 'small_group'),
    p_tenant_slug: cfg.tenantSlug || 'ekodi-church',
  });
  if (error) { alert('공동체를 만들지 못했습니다.'); return; }
  event.currentTarget.reset();
  await loadTogetherArea();
};
$('#joinGroupForm').onsubmit = async event => {
  event.preventDefault();
  if (!session) { location.assign(authUrl()); return; }
  const formData = new FormData(event.currentTarget);
  const { error } = await sb.rpc('bible_join_group', { p_invite_code: String(formData.get('invite_code') || '') });
  if (error) { alert('초대코드를 확인해 주세요.'); return; }
  event.currentTarget.reset();
  await loadTogetherArea();
};
$('#shareForm').onsubmit = async event => {
  event.preventDefault();
  if (!session) return;
  const formData = new FormData(event.currentTarget);
  const journeyId = String(formData.get('journey_id') || '');
  const groupId = String(formData.get('group_id') || '');
  if (!journeyId || !groupId) return;
  const { error } = await sb.from('bible_shared_journeys').insert({
    user_id: session.user.id,
    journey_id: journeyId,
    group_id: groupId,
    note: String(formData.get('note') || '').trim(),
  });
  if (error) alert(error.code === '23505' ? '이미 이 공동체에 공유한 Journey입니다.' : '공유하지 못했습니다.');
  else {
    event.currentTarget.elements.note.value = '';
    await loadSharedFeed();
    alert('선택한 Journey만 공동체에 공유했습니다.');
  }
};

renderTopics();
applyGuide();
renderIdentity();
const initial = location.pathname.split('/')[1];
showView(['conversation', 'journey', 'together'].includes(initial) ? initial : 'today', false);
await loadToday();
if (enabled) {
  try { await handoff(); } catch (error) { console.error('bible auth handoff', error); }
  const { data } = await sb.auth.getSession();
  session = data.session;
  renderIdentity();
  await refreshPrivate();
  sb.auth.onAuthStateChange(async (_event, next) => {
    session = next;
    renderIdentity();
    await refreshPrivate();
  });
}
