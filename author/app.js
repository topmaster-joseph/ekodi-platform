import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const LOGIN_URL = 'https://auth.ekodi.kr/?site=author&return_to=https%3A%2F%2Fauthor.ekodi.kr%2F';
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { detectSessionInUrl: true, persistSession: true } });
const $ = selector => document.querySelector(selector);
let session = null;
let projects = [];
let membership = freeMembership();

const STATUS_LABELS = {
  idea: 'IDEA', plan: 'PLAN', writing: 'WRITING', review: 'REVIEW',
  author_approved: 'AUTHOR APPROVED', publish_ready: 'PUBLISH READY', published: 'PUBLISHED'
};
const LENGTH_WORDS = { short: 28000, medium: 48000, deep: 75000 };
const FIELD_SEEDS = {
  'Faith & Theology': ['다시 읽는', '삶으로 이어지는', '공동체를 세우는', '오늘의 신앙을 위한'],
  Business: ['작게 시작하는', '현장에서 배우는', '다시 설계하는', '사람과 숫자를 잇는'],
  Academic: ['새롭게 읽는', '근거로 살펴보는', '현장과 이론을 잇는', '질문에서 시작하는'],
  Essay: ['천천히 바라보는', '일상에서 발견한', '사이에 머무는', '다시 건너가는'],
  Practical: ['바로 써먹는', '하루씩 실천하는', '작게 바꾸는', '처음부터 끝까지'],
  Biography: ['한 사람의 길', '기억으로 엮는', '삶이 남긴', '시간을 건너는'],
  Story: ['이야기로 만나는', '장면으로 읽는', '사람에게서 시작한', '길 위에서 발견한'],
  Workbook: ['함께 해보는', '질문으로 여는', '쓰고 나누는', '매일 한 걸음'],
  Other: ['새롭게 바라보는', '처음 만나는', '다시 연결하는', '질문에서 시작하는']
};

function freeMembership() {
  return { plan:'free', display_name:'FREE', status:'active', is_paid:false, paid_ai_active:false, monthly_ai_units:0, used_ai_units:0, remaining_ai_units:0, features:{ ai_generation:false } };
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}
function shortIdea(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  const first = cleaned.split(/[.!?。！？\n]/)[0].trim();
  return (first || cleaned || '나의 이야기').slice(0, 34);
}
function cleanHash() {
  if (location.hash.includes('ekodi_token=')) history.replaceState({}, document.title, `${location.pathname}${location.search}`);
}
async function consumeHandoff() {
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const params = new URLSearchParams(raw);
  const tokenHash = params.get('ekodi_token');
  const type = params.get('ekodi_type') || 'email';
  if (!tokenHash) return;
  const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
  cleanHash();
  if (error) throw error;
}
async function currentSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
async function functionFetch(path, options = {}) {
  if (!session?.access_token) throw new Error('로그인이 필요합니다.');
  const response = await fetch(`${FUNCTIONS_URL}/${path}`, {
    ...options,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
    error.code = data?.error || 'request_failed';
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}
async function loadMembership() {
  if (!session) { membership = freeMembership(); renderMembership(); return; }
  try {
    const data = await functionFetch('author-access-api/workspace', { method:'GET' });
    membership = { ...freeMembership(), ...(data?.membership || {}), plan:data?.workspace?.plan || data?.membership?.plan || 'free' };
  } catch (error) {
    console.error('Author membership load failed', error);
    membership = freeMembership();
  }
  renderMembership();
}
function renderMembership() {
  const badge = $('#membershipBadge');
  const summary = $('#membershipSummary');
  if (!badge || !summary) return;
  const plan = String(membership.display_name || membership.plan || 'FREE').toUpperCase();
  if (membership.paid_ai_active) {
    badge.textContent = `${plan} · AI ${Number(membership.remaining_ai_units || 0)} 남음`;
    badge.classList.add('quota');
    const until = membership.paid_until ? new Date(membership.paid_until).toLocaleDateString('ko-KR') : '';
    summary.innerHTML = `<strong>${esc(plan)} 유료회원 · AI 사용 가능</strong><span>이번 달 ${Number(membership.used_ai_units || 0)} / ${Number(membership.monthly_ai_units || 0)} units 사용${until ? ` · 결제권한 ${esc(until)}까지` : ''}</span>`;
  } else {
    badge.textContent = 'FREE · AI 0';
    badge.classList.remove('quota');
    summary.innerHTML = '<strong>무료회원은 외부 AI 호출을 하지 않습니다.</strong><span>기획 · 직접 집필 · 수정 · 출판 준비는 계속 사용할 수 있고 유료 API 비용은 0원입니다.</span>';
  }
  authState();
}
function authState() {
  const button = $('#authButton');
  const badge = $('#accountBadge');
  if (session) {
    button.textContent = '로그아웃';
    const plan = String(membership.display_name || membership.plan || 'FREE').toUpperCase();
    badge.textContent = `${session.user.email || '로그인됨'} · ${plan}`;
  } else {
    button.textContent = 'Google로 시작';
    badge.textContent = '로그인 전';
  }
}
async function loginOrOut() {
  if (!session) { location.assign(LOGIN_URL); return; }
  await sb.auth.signOut();
  session = null; projects = []; membership = freeMembership(); authState(); renderMembership(); renderProjects();
}
function openPlanner() {
  $('#planner').hidden = false;
  $('#planner').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function chapterBlueprint(narrative, idea, field) {
  const core = shortIdea(idea);
  const sets = {
    story: ['문을 여는 장면', `${core}를 만나기 전`, '사람들의 이야기', '보이지 않던 연결', '전환점', '삶에서 시험해 보기', '함께 살아낼 방법', '다음 장면으로'],
    argument: ['문제는 무엇인가', '핵심 개념과 배경', '왜 지금 중요한가', '근거와 연구', '현장의 사례', '반론과 한계', '실천 가능한 대안', '결론과 다음 질문'],
    question: ['우리는 무엇을 묻는가', '익숙한 답을 의심하기', '본문과 자료 다시 보기', '현장에서 만난 질문', '다른 관점과 대화하기', '새로운 답의 윤곽', '삶에 적용하기', '남겨둘 질문'],
    case: ['현장에 들어가기', '사례 1 · 시작', '사례 2 · 충돌', '사례 3 · 변화', '사례에서 보이는 패턴', '실패가 알려준 것', '재현 가능한 방법', '현장으로 돌아가기'],
    workbook: ['나의 출발점', '핵심 개념 이해', '관찰하기', '질문하기', '작게 실험하기', '함께 나누기', '일주일 실천', '나만의 다음 계획']
  };
  return (sets[narrative] || sets.story).map((title, index) => ({
    order: index + 1,
    title: `${index + 1}장. ${title}`,
    purpose: index === 0 ? `${field} 분야에서 “${core}”라는 문제의식을 독자와 공유한다.` : `${core}의 핵심 논지를 단계적으로 확장한다.`
  }));
}
function buildConcepts(form) {
  const interest = String(form.get('interest') || '');
  const field = String(form.get('field') || 'Other');
  const audience = String(form.get('audience') || '').trim() || '이 주제에 관심 있는 일반 독자';
  const length = String(form.get('length') || 'medium');
  const tone = String(form.get('tone') || 'warm');
  const narrative = String(form.get('narrative') || 'story');
  const sourceMode = String(form.get('sourceMode') || 'author-first');
  const seed = shortIdea(interest);
  const prefixes = FIELD_SEEDS[field] || FIELD_SEEDS.Other;
  const strategies = [
    { kind:'FIELD GUIDE', title:`${prefixes[0]} ${seed}`, subtitle:'핵심 개념과 현장 사례를 연결하는 실천형 책', narrative },
    { kind:'QUESTION BOOK', title:`${seed}, 무엇을 다시 물어야 할까`, subtitle:'하나의 강한 질문을 여러 관점에서 탐색하는 책', narrative:'question' },
    { kind:'STORY & INSIGHT', title:`${prefixes[2]} ${seed}`, subtitle:'사람과 장면에서 출발해 통찰로 이동하는 책', narrative:'story' },
    { kind:'WORKBOOK', title:`${seed}를 살아내는 연습`, subtitle:'읽고 끝내지 않고 질문과 행동으로 이어지는 워크북', narrative:'workbook' }
  ];
  return strategies.map((item, index) => ({
    ...item,
    id: `concept-${index + 1}`,
    audience, field, tone, sourceMode,
    targetWords: LENGTH_WORDS[length] || LENGTH_WORDS.medium,
    targetPages: length === 'short' ? '80~120' : length === 'deep' ? '200+' : '120~200',
    chapters: chapterBlueprint(item.narrative, interest, field)
  }));
}
function renderConcepts(concepts, source) {
  const host = $('#conceptResults');
  host.replaceChildren();
  concepts.forEach((concept, index) => {
    const card = document.createElement('article');
    card.className = 'concept-card';
    card.innerHTML = `<small>${esc(concept.kind)} · OPTION ${index + 1}</small><h3>${esc(concept.title)}</h3><p class="subtitle">${esc(concept.subtitle)}</p><ul><li>독자 · ${esc(concept.audience)}</li><li>분량 · 약 ${esc(concept.targetPages)}쪽</li><li>문체 · ${esc(concept.tone)}</li><li>구성 · ${concept.chapters.length}장</li></ul><button class="secondary" type="button">이 방향으로 시작</button>`;
    card.querySelector('button').addEventListener('click', () => saveConcept(concept, source, card));
    host.append(card);
  });
}
async function saveConcept(concept, source, card) {
  if (!session) { location.assign(LOGIN_URL); return; }
  card.classList.add('selected');
  const now = new Date().toISOString();
  const payload = {
    owner_user_id: session.user.id,
    title: concept.title,
    working_title: concept.title,
    interest: source.interest,
    field: concept.field,
    audience: concept.audience,
    book_format: concept.kind,
    tone: concept.tone,
    narrative_mode: concept.narrative,
    source_mode: concept.sourceMode,
    target_words: concept.targetWords,
    status: 'plan',
    selected_plan: concept,
    book_memory: { core_idea: shortIdea(source.interest), promises: [], key_terms: [], avoid_repetition: [], style_notes: [concept.tone] },
    updated_at: now
  };
  const { data: project, error } = await sb.from('author_projects').insert(payload).select('*').single();
  if (error) { $('#plannerStatus').textContent = `저장 실패: ${error.message}`; return; }
  const chapterRows = concept.chapters.map(chapter => ({ project_id: project.id, owner_user_id: session.user.id, chapter_order: chapter.order, title: chapter.title, purpose: chapter.purpose, status: 'planned' }));
  const { error: chapterError } = await sb.from('author_chapters').insert(chapterRows);
  if (chapterError) { $('#plannerStatus').textContent = `장 구성 저장 실패: ${chapterError.message}`; return; }
  await recordEvent(project.id, 'author-ai', 'plan.selected', { concept: concept.kind, target_words: concept.targetWords, chapter_count: chapterRows.length });
  $('#plannerStatus').textContent = '새 책 프로젝트를 만들었습니다.';
  await loadProjects();
  setTimeout(() => openProject(project.id), 100);
}
async function recordEvent(projectId, actor, type, payload = {}) {
  if (!session) return;
  await sb.from('author_events').insert({ project_id: projectId, owner_user_id: session.user.id, actor, event_type: type, payload });
}
async function loadProjects() {
  if (!session) { projects = []; renderProjects(); return; }
  const { data, error } = await sb.from('author_projects').select('*').order('updated_at', { ascending: false });
  projects = error ? [] : (data || []);
  renderProjects(error?.message || '');
}
function renderProjects(error = '') {
  const host = $('#projectList');
  if (error) { host.innerHTML = `<div class="empty"><strong>프로젝트를 불러오지 못했습니다.</strong><p>${esc(error)}</p></div>`; return; }
  if (!projects.length) { host.innerHTML = `<div class="empty"><strong>${session ? '아직 시작한 책이 없습니다.' : 'Google 인증 후 내 책을 이어서 쓸 수 있습니다.'}</strong><p>IDEA → PLAN → WRITING → REVIEW → AUTHOR APPROVED → PUBLISH READY 흐름으로 관리합니다.</p></div>`; return; }
  host.innerHTML = projects.map(project => `<article class="project-card"><div><h3>${esc(project.working_title || project.title)}</h3><p>${esc(project.interest || '')}</p><div class="project-meta"><span class="stage">${esc(STATUS_LABELS[project.status] || project.status)}</span><span>${esc(project.field)}</span><span>${Number(project.target_words || 0).toLocaleString('ko-KR')} words</span><span>${new Date(project.updated_at).toLocaleDateString('ko-KR')}</span></div></div><div class="project-actions"><button class="secondary" type="button" data-open="${esc(project.id)}">열기</button></div></article>`).join('');
  host.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openProject(button.dataset.open)));
}
async function openProject(id) {
  if (!session) { location.assign(LOGIN_URL); return; }
  const project = projects.find(item => item.id === id) || (await sb.from('author_projects').select('*').eq('id', id).single()).data;
  if (!project) return;
  const { data: chapters } = await sb.from('author_chapters').select('*').eq('project_id', id).order('chapter_order');
  const overlay = document.createElement('div');
  overlay.className = 'dialog-backdrop';
  const canApprove = project.status === 'review';
  const canPublish = project.status === 'author_approved';
  const aiLabel = membership.paid_ai_active ? `${String(membership.display_name || membership.plan).toUpperCase()} · AI ${Number(membership.remaining_ai_units || 0)} units` : 'FREE · AI provider calls 0';
  overlay.innerHTML = `<section class="dialog" role="dialog" aria-modal="true"><button class="ghost close" type="button">닫기</button><p class="eyebrow">${esc(STATUS_LABELS[project.status] || project.status)}</p><h2>${esc(project.working_title || project.title)}</h2><p class="notice">저자AI · Research AI · Editor AI는 Book Memory와 작업상태를 기준으로 협업합니다. <strong>${esc(aiLabel)}</strong>. 무료회원은 외부 AI 호출이 서버에서 차단됩니다.</p><div class="chapter-list">${(chapters || []).map(chapter => `<button class="chapter-row" type="button" data-chapter="${esc(chapter.id)}"><span>${String(chapter.chapter_order).padStart(2,'0')}</span><strong>${esc(chapter.title)}</strong><span>${esc(chapter.status)}</span></button>`).join('')}</div><div class="dialog-actions"><button class="secondary" type="button" data-stage="writing">집필 단계</button><button class="secondary" type="button" data-stage="review">검토 요청</button><button class="primary" type="button" data-approve ${canApprove ? '' : 'disabled'}>최종 원고 승인</button><button class="primary" type="button" data-publish ${canPublish ? '' : 'disabled'}>EKODI BOOKS로 출판 준비</button></div></section>`;
  document.body.append(overlay);
  overlay.querySelector('.close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  overlay.querySelectorAll('[data-chapter]').forEach(button => button.addEventListener('click', () => openChapter(project, chapters.find(item => item.id === button.dataset.chapter), overlay)));
  overlay.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', async () => { await setProjectStatus(project.id, button.dataset.stage); overlay.remove(); await loadProjects(); openProject(project.id); }));
  overlay.querySelector('[data-approve]').addEventListener('click', async () => { if (!canApprove) return; await setProjectStatus(project.id, 'author_approved'); await recordEvent(project.id, 'author', 'author.approved', { approved_at: new Date().toISOString() }); overlay.remove(); await loadProjects(); openProject(project.id); });
  overlay.querySelector('[data-publish]').addEventListener('click', async () => { if (!canPublish) return; await setProjectStatus(project.id, 'publish_ready'); await recordEvent(project.id, 'author', 'books.handoff.requested', { target: 'EKODI BOOKS', requested_at: new Date().toISOString() }); overlay.remove(); await loadProjects(); openProject(project.id); });
}
async function openChapter(project, chapter, parentOverlay) {
  if (!chapter) return;
  const paid = Boolean(membership.paid_ai_active);
  const aiPanel = paid
    ? `<div class="ai-panel"><div class="ai-panel-head"><strong>AI Writing Desk</strong><span>${esc(String(membership.display_name || membership.plan).toUpperCase())} · ${Number(membership.remaining_ai_units || 0)} units 남음</span></div><div class="ai-controls"><select id="aiOperation"><option value="draft">Author AI · 초고</option><option value="rewrite">Author AI · 재작성</option><option value="edit">Editor AI · 편집</option><option value="research">Research AI · 검증</option><option value="chief">Chief AI · 품질검토</option></select><input id="aiInstruction" maxlength="4000" placeholder="예: 사례를 살리고 1,500자 정도로 더 따뜻하게"><button class="primary" id="runAi" type="button">AI 실행</button></div><div class="ai-status" id="aiStatus">AI 결과는 자동 저장되지 않습니다. 저자가 적용을 선택합니다.</div><div class="ai-result" id="aiResult" hidden><textarea id="aiOutput" aria-label="AI 생성 결과"></textarea><div class="ai-result-actions"><button class="secondary" id="appendAi" type="button">원고 뒤에 추가</button><button class="primary" id="replaceAi" type="button">원고로 적용</button></div></div></div>`
    : `<div class="ai-panel locked"><div class="ai-panel-head"><strong>AI Writing Desk · 유료회원 전용</strong><span>FREE · provider calls 0</span></div><p class="notice warn">무료회원에게는 외부 AI 요청을 보내지 않습니다. 따라서 AI API 비용도 발생하지 않습니다. 직접 집필과 수정 기능은 그대로 사용할 수 있습니다.</p><button class="secondary" id="viewMembership" type="button">회원제 보기</button></div>`;
  parentOverlay.querySelector('.dialog').innerHTML = `<button class="ghost close" type="button">프로젝트로</button><p class="eyebrow">CHAPTER ${chapter.chapter_order}</p><h2>${esc(chapter.title)}</h2><p class="notice">목적 · ${esc(chapter.purpose || '')}</p><div class="chapter-editor"><textarea id="chapterDraft" maxlength="90000" placeholder="여기에 초고를 작성하거나 붙여 넣으세요.">${esc(chapter.draft_text || '')}</textarea></div>${aiPanel}<div class="dialog-actions"><button class="secondary" id="saveChapter" type="button">초고 저장</button><button class="primary" id="reviewChapter" type="button">장 검토 완료</button></div>`;
  parentOverlay.querySelector('.close').addEventListener('click', () => { parentOverlay.remove(); openProject(project.id); });
  parentOverlay.querySelector('#saveChapter').addEventListener('click', () => saveChapter(chapter, parentOverlay.querySelector('#chapterDraft').value, 'drafting'));
  parentOverlay.querySelector('#reviewChapter').addEventListener('click', () => saveChapter(chapter, parentOverlay.querySelector('#chapterDraft').value, 'reviewed'));
  if (paid) {
    parentOverlay.querySelector('#runAi').addEventListener('click', () => runAi(project, chapter, parentOverlay));
    parentOverlay.querySelector('#replaceAi').addEventListener('click', () => { parentOverlay.querySelector('#chapterDraft').value = parentOverlay.querySelector('#aiOutput').value; });
    parentOverlay.querySelector('#appendAi').addEventListener('click', () => {
      const draft = parentOverlay.querySelector('#chapterDraft');
      const output = parentOverlay.querySelector('#aiOutput').value;
      draft.value = `${draft.value.trim()}${draft.value.trim() ? '\n\n' : ''}${output}`;
    });
  } else {
    parentOverlay.querySelector('#viewMembership').addEventListener('click', () => { parentOverlay.remove(); $('#membership').scrollIntoView({ behavior:'smooth', block:'start' }); });
  }
}
async function runAi(project, chapter, overlay) {
  const button = overlay.querySelector('#runAi');
  const status = overlay.querySelector('#aiStatus');
  const result = overlay.querySelector('#aiResult');
  const output = overlay.querySelector('#aiOutput');
  const operation = overlay.querySelector('#aiOperation').value;
  const instruction = overlay.querySelector('#aiInstruction').value;
  button.disabled = true;
  status.classList.remove('error');
  status.textContent = '유료회원 권한과 사용량을 확인한 뒤 AI를 실행하고 있습니다…';
  try {
    const data = await functionFetch('author-ai-api', { method:'POST', body:JSON.stringify({ project_id:project.id, chapter_id:chapter.id, operation, instruction }) });
    output.value = data.text || '';
    result.hidden = false;
    const remaining = Number(data?.entitlement?.remaining_ai_units ?? membership.remaining_ai_units ?? 0);
    const used = Number(data?.entitlement?.used_ai_units ?? membership.used_ai_units ?? 0);
    membership.remaining_ai_units = remaining;
    membership.used_ai_units = used;
    renderMembership();
    status.textContent = `완료 · ${Number(data?.usage?.ai_units || 0)} AI unit 사용 · ${remaining} units 남음. 결과 적용 여부는 저자가 결정합니다.`;
  } catch (error) {
    status.classList.add('error');
    if (error.code === 'paid_membership_required') status.textContent = '결제가 확인된 유료회원에게만 AI 집필을 제공합니다. 무료회원 요청은 provider에 전송되지 않았습니다.';
    else if (error.code === 'monthly_ai_quota_exceeded') status.textContent = '이번 달 AI 사용 한도에 도달했습니다. 추가 provider 호출은 차단되었습니다.';
    else if (error.code === 'ai_provider_not_configured') status.textContent = '전용 AI 비밀키 연결이 아직 완료되지 않았습니다. 비용은 발생하지 않았습니다.';
    else status.textContent = `AI 실행 실패: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}
async function saveChapter(chapter, text, status) {
  const { error } = await sb.from('author_chapters').update({ draft_text: text, status, version: Number(chapter.version || 0) + 1, updated_at: new Date().toISOString() }).eq('id', chapter.id);
  if (error) { alert(`저장 실패: ${error.message}`); return; }
  await sb.from('author_projects').update({ updated_at: new Date().toISOString() }).eq('id', chapter.project_id);
  await recordEvent(chapter.project_id, 'author', status === 'reviewed' ? 'chapter.reviewed' : 'chapter.draft.saved', { chapter_id: chapter.id, chapter_order: chapter.chapter_order });
  alert(status === 'reviewed' ? '장 검토 상태로 저장했습니다.' : '초고를 저장했습니다.');
}
async function setProjectStatus(id, status) {
  const allowed = new Set(['plan','writing','review','author_approved','publish_ready']);
  if (!allowed.has(status)) return;
  const { error } = await sb.from('author_projects').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  await recordEvent(id, status === 'author_approved' ? 'author' : 'author-ai', `project.${status}`, {});
}

$('#authButton').addEventListener('click', loginOrOut);
$('#newBookButton').addEventListener('click', openPlanner);
$('#resumeButton').addEventListener('click', () => $('#projects').scrollIntoView({ behavior:'smooth' }));
$('#closePlanner').addEventListener('click', () => { $('#planner').hidden = true; });
document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', openPlanner));
$('#plannerForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const source = Object.fromEntries(form.entries());
  const concepts = buildConcepts(form);
  $('#plannerStatus').textContent = '서로 다른 4개 방향을 만들었습니다. 하나를 선택하거나 입력값을 바꿔 다시 비교할 수 있습니다.';
  renderConcepts(concepts, source);
});

try {
  await consumeHandoff();
} catch (error) {
  console.error('Author auth handoff failed', error);
}
session = await currentSession();
authState();
await loadMembership();
await loadProjects();
sb.auth.onAuthStateChange(async (_event, next) => { session = next; authState(); await loadMembership(); await loadProjects(); });
