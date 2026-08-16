import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const LOGIN_URL = 'https://auth.ekodi.kr/?site=author&return_to=https%3A%2F%2Fauthor.ekodi.kr%2F';
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const MY_EKODI_URL = 'https://my.ekodi.kr/';
const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { detectSessionInUrl: true, persistSession: true } });
const $ = selector => document.querySelector(selector);

let session = null;
let projects = [];
let workspace = null;
let membership = freeMembership();

const STATUS_LABELS = {
  idea: 'IDEA',
  plan: 'PLAN',
  writing: 'CREATING',
  review: 'REVIEW',
  author_approved: 'CREATOR APPROVED',
  publish_ready: 'READY TO SHARE',
  published: 'PUBLISHED'
};

const LENGTH_WORDS = { short: 6000, medium: 24000, deep: 60000 };

const CREATOR_MODES = {
  writer: {
    label: 'Writer', ko: '글·책', unit: '장', artifact: '원고', destination: 'EKODI BOOKS',
    strategies: ['FIELD GUIDE', 'QUESTION BOOK', 'STORY & INSIGHT', 'WORKBOOK'],
    structures: [
      ['문을 여는 장면', '문제와 배경', '사람들의 이야기', '핵심 통찰', '근거와 사례', '삶에서 시험하기', '함께 살아낼 방법', '다음 질문'],
      ['핵심 질문', '익숙한 답 점검', '자료 다시 보기', '현장 질문', '다른 관점', '새로운 답', '적용', '남겨둘 질문']
    ]
  },
  video: {
    label: 'Video', ko: '영상·쇼츠', unit: '씬', artifact: '스크립트', destination: 'Video Channels',
    strategies: ['SHORT SERIES', 'STORY VIDEO', 'EXPLAINER', 'INTERVIEW'],
    structures: [
      ['첫 3초 훅', '문제 제시', '핵심 장면', '근거 또는 사례', '전환', '핵심 메시지', '행동 제안', '엔딩'],
      ['오프닝', '인물과 상황', '갈등', '발견', '설명', '변화', '적용', '클로징']
    ]
  },
  podcast: {
    label: 'Podcast', ko: '오디오·팟캐스트', unit: '세그먼트', artifact: '오디오 대본', destination: 'Audio Channels',
    strategies: ['SOLO TALK', 'INTERVIEW', 'MEDITATION', 'SERIES'],
    structures: [
      ['오프닝', '오늘의 질문', '배경 이야기', '핵심 대화', '깊이 보기', '사례', '정리', '다음 에피소드'],
      ['도입', '경험', '질문', '탐색', '침묵과 성찰', '통찰', '실천', '마침']
    ]
  },
  lecture: {
    label: 'Educator', ko: '강의·교육', unit: '모듈', artifact: '강의안', destination: 'Learning',
    strategies: ['MASTERCLASS', 'WORKSHOP', 'MICRO COURSE', 'SEMINAR'],
    structures: [
      ['학습 목표', '문제 제기', '핵심 개념', '사례', '활동', '토론', '적용', '과제와 다음 단계'],
      ['진단', '이해', '시범', '연습', '피드백', '확장', '현장 적용', '성찰']
    ]
  },
  research: {
    label: 'Researcher', ko: '연구·전문지식', unit: '섹션', artifact: '연구 콘텐츠', destination: 'Knowledge',
    strategies: ['RESEARCH BRIEF', 'POLICY NOTE', 'FIELD REPORT', 'PUBLIC INSIGHT'],
    structures: [
      ['연구 질문', '배경', '개념과 선행근거', '자료와 방법', '분석', '결과', '시사점', '한계와 다음 연구'],
      ['현장 문제', '관찰', '자료', '패턴', '해석', '대안', '실행 제안', '검증 과제']
    ]
  },
  visual: {
    label: 'Visual', ko: '비주얼·디자인', unit: '프레임', artifact: '비주얼 브리프', destination: 'Visual Channels',
    strategies: ['CARD NEWS', 'INFOGRAPHIC', 'CAMPAIGN', 'STORY BOARD'],
    structures: [
      ['표지 메시지', '문제 장면', '핵심 데이터', '핵심 문장', '비교', '사례', '행동 제안', '마지막 카드'],
      ['컨셉', '톤앤매너', '주요 오브젝트', '장면 1', '장면 2', '장면 3', '카피', '배포 변형']
    ]
  },
  mission: {
    label: 'Mission', ko: '설교·선교·공동체', unit: '파트', artifact: '사역 콘텐츠', destination: 'Community',
    strategies: ['MESSAGE', 'DEVOTIONAL', 'SMALL GROUP', 'MISSION STORY'],
    structures: [
      ['본문 또는 현장', '관찰', '핵심 질문', '복음의 통찰', '삶의 장면', '공동체 질문', '작은 실천', '보냄'],
      ['이야기', '갈등', '하나님의 일하심', '새로운 시선', '사람의 변화', '공동체 연결', '나눔', '다음 걸음']
    ]
  },
  ai: {
    label: 'AI Creator', ko: 'AI 협업형 창작', unit: '스프린트', artifact: 'AI 협업 산출물', destination: 'Digital',
    strategies: ['AI WORKFLOW', 'EXPERIMENT', 'SERVICE CONCEPT', 'MULTI FORMAT'],
    structures: [
      ['문제 정의', '사람의 역할', 'AI 역할', '입력과 자료', '첫 결과', '검증', '개선', '공개 또는 운영'],
      ['아이디어', '프로토타입', '테스트', '피드백', '안전 점검', '자동화', '사람의 승인', '확장']
    ]
  }
};

const FIELD_SEEDS = {
  'Faith & Theology': ['삶으로 이어지는', '다시 읽는', '공동체를 세우는', '오늘의 신앙을 위한'],
  Business: ['현장에서 배우는', '작게 시작하는', '다시 설계하는', '사람과 숫자를 잇는'],
  Academic: ['근거로 살펴보는', '새롭게 읽는', '현장과 이론을 잇는', '질문에서 시작하는'],
  Essay: ['일상에서 발견한', '천천히 바라보는', '사이에 머무는', '다시 건너가는'],
  Practical: ['바로 적용하는', '하루씩 실천하는', '작게 바꾸는', '처음부터 끝까지'],
  Biography: ['한 사람의 길', '기억으로 엮는', '삶이 남긴', '시간을 건너는'],
  Story: ['이야기로 만나는', '장면으로 읽는', '사람에게서 시작한', '길 위에서 발견한'],
  Education: ['함께 배우는', '질문으로 여는', '현장에 적용하는', '배움에서 실천으로'],
  Community: ['함께 만드는', '관계를 잇는', '지역에서 시작하는', '공동체를 살리는'],
  Other: ['새롭게 바라보는', '처음 만나는', '다시 연결하는', '질문에서 시작하는']
};

function freeMembership() {
  return { plan: 'free', display_name: 'FREE', status: 'active', is_paid: false, paid_ai_active: false, monthly_ai_units: 0, used_ai_units: 0, remaining_ai_units: 0, features: { ai_generation: false } };
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function shortIdea(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  const first = cleaned.split(/[.!?。！？\n]/)[0].trim();
  return (first || cleaned || '나의 이야기').slice(0, 42);
}
function creatorMode(projectOrValue) {
  const raw = typeof projectOrValue === 'string' ? projectOrValue : projectOrValue?.creator_mode || projectOrValue?.selected_plan?.creatorMode || projectOrValue?.book_memory?.creator_mode;
  return CREATOR_MODES[raw] ? raw : 'writer';
}
function modeInfo(value) { return CREATOR_MODES[creatorMode(value)]; }
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
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', ...(options.headers || {}) }
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
  if (!session) { workspace = null; membership = freeMembership(); renderMembership(); return; }
  try {
    const data = await functionFetch('author-access-api/workspace', { method: 'GET' });
    workspace = data?.workspace || null;
    membership = { ...freeMembership(), ...(data?.membership || {}), plan: data?.workspace?.plan || data?.membership?.plan || 'free' };
  } catch (error) {
    console.error('Creator membership load failed', error);
    workspace = null;
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
    summary.innerHTML = '<strong>무료회원은 외부 AI 호출을 하지 않습니다.</strong><span>기획 · 직접 제작 · 수정 · My EKODI 포트폴리오 연결은 계속 사용할 수 있고 유료 API 비용은 0원입니다.</span>';
  }
  authState();
}
function authState() {
  const button = $('#authButton');
  const badge = $('#accountBadge');
  if (session) {
    button.textContent = '로그아웃';
    const plan = String(membership.display_name || membership.plan || 'FREE').toUpperCase();
    const connected = workspace?.workspace_key ? ' · My EKODI 연결' : '';
    badge.textContent = `${session.user.email || '로그인됨'} · ${plan}${connected}`;
  } else {
    button.textContent = 'Google로 시작';
    badge.textContent = '로그인 전';
  }
}
async function loginOrOut() {
  if (!session) { location.assign(LOGIN_URL); return; }
  await sb.auth.signOut();
  session = null; workspace = null; projects = []; membership = freeMembership();
  authState(); renderMembership(); renderProjects();
}
function selectCreatorMode(mode, open = true) {
  const normalized = CREATOR_MODES[mode] ? mode : 'writer';
  $('#creatorMode').value = normalized;
  const info = CREATOR_MODES[normalized];
  $('#plannerTitle').textContent = `${info.ko} 프로젝트 설계하기`;
  $('#plannerStatus').textContent = `${info.label} 모드가 선택되었습니다. 같은 원천 콘텐츠를 나중에 다른 형태로 확장할 수 있습니다.`;
  document.querySelectorAll('[data-creator-mode]').forEach(button => button.setAttribute('aria-pressed', button.dataset.creatorMode === normalized ? 'true' : 'false'));
  if (open) openPlanner();
}
function openPlanner() {
  $('#planner').hidden = false;
  $('#planner').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function structureBlueprint(mode, variant, idea, field) {
  const info = CREATOR_MODES[mode] || CREATOR_MODES.writer;
  const core = shortIdea(idea);
  const source = info.structures[variant % info.structures.length] || info.structures[0];
  return source.map((title, index) => ({ order: index + 1, title: `${index + 1}. ${title}`, purpose: index === 0 ? `${field} 분야의 “${core}”를 ${info.ko} 창작물의 출발점으로 명확히 한다.` : `${core}의 핵심 메시지를 ${info.artifact}의 다음 구성으로 확장한다.` }));
}
function buildConcepts(form) {
  const interest = String(form.get('interest') || '');
  const field = String(form.get('field') || 'Other');
  const audience = String(form.get('audience') || '').trim() || '이 주제에 관심 있는 사람들';
  const length = String(form.get('length') || 'medium');
  const tone = String(form.get('tone') || 'warm');
  const narrative = String(form.get('narrative') || 'story');
  const sourceMode = String(form.get('sourceMode') || 'author-first');
  const mode = creatorMode(String(form.get('creatorMode') || 'writer'));
  const info = CREATOR_MODES[mode];
  const seed = shortIdea(interest);
  const prefixes = FIELD_SEEDS[field] || FIELD_SEEDS.Other;
  return info.strategies.map((kind, index) => {
    const titlePatterns = [`${prefixes[0]} ${seed}`, `${seed}, 무엇을 새롭게 볼 것인가`, `${prefixes[2]} ${seed}`, `${seed}를 삶과 현장으로`];
    const subtitles = [`${info.ko} 형식으로 핵심 메시지와 현장성을 함께 살리는 프로젝트`, '하나의 강한 질문을 중심으로 사람의 호기심과 탐색을 이끄는 프로젝트', '사람과 장면에서 출발해 통찰로 이동하는 프로젝트', '보고 듣고 끝나지 않고 행동과 나눔으로 이어지는 프로젝트'];
    return { id: `concept-${index + 1}`, creatorMode: mode, creatorLabel: info.label, unitLabel: info.unit, artifact: info.artifact, destination: info.destination, kind, title: titlePatterns[index], subtitle: subtitles[index], audience, field, tone, narrative, sourceMode, targetWords: LENGTH_WORDS[length] || LENGTH_WORDS.medium, targetDepth: length, units: structureBlueprint(mode, index, interest, field) };
  });
}
function renderConcepts(concepts, source) {
  const host = $('#conceptResults');
  host.replaceChildren();
  concepts.forEach((concept, index) => {
    const card = document.createElement('article');
    card.className = 'concept-card';
    card.innerHTML = `<small>${esc(concept.creatorLabel)} · ${esc(concept.kind)} · OPTION ${index + 1}</small><h3>${esc(concept.title)}</h3><p class="subtitle">${esc(concept.subtitle)}</p><ul><li>대상 · ${esc(concept.audience)}</li><li>형태 · ${esc(concept.artifact)}</li><li>구성 · ${concept.units.length}${esc(concept.unitLabel)}</li><li>연결 · My EKODI → ${esc(concept.destination)}</li></ul><button class="secondary" type="button">이 방향으로 시작</button>`;
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
    creator_mode: concept.creatorMode,
    my_ekodi_status: 'private',
    selected_plan: concept,
    book_memory: { creator_mode: concept.creatorMode, core_idea: shortIdea(source.interest), promises: [], key_terms: [], avoid_repetition: [], style_notes: [concept.tone] },
    updated_at: now
  };
  const { data: project, error } = await sb.from('author_projects').insert(payload).select('*').single();
  if (error) { $('#plannerStatus').textContent = `저장 실패: ${error.message}`; return; }
  const unitRows = concept.units.map(unit => ({ project_id: project.id, owner_user_id: session.user.id, chapter_order: unit.order, title: unit.title, purpose: unit.purpose, status: 'planned' }));
  const { error: unitError } = await sb.from('author_chapters').insert(unitRows);
  if (unitError) { $('#plannerStatus').textContent = `구성 저장 실패: ${unitError.message}`; return; }
  await recordEvent(project.id, 'author-ai', 'creator.plan.selected', { creator_mode: concept.creatorMode, concept: concept.kind, unit_count: unitRows.length, workspace_key: workspace?.workspace_key || null });
  $('#plannerStatus').textContent = `새 ${concept.creatorLabel} 프로젝트를 만들었습니다.`;
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
  if (!projects.length) { host.innerHTML = `<div class="empty"><strong>${session ? '아직 시작한 창작 프로젝트가 없습니다.' : 'Google 인증 후 내 창작물을 이어서 만들 수 있습니다.'}</strong><p>IDEA → PLAN → CREATING → REVIEW → CREATOR APPROVED → READY TO SHARE 흐름으로 관리합니다.</p></div>`; return; }
  host.innerHTML = projects.map(project => {
    const info = modeInfo(project);
    const myStatus = project.my_ekodi_status === 'published' ? 'My EKODI 등록됨' : '비공개';
    return `<article class="project-card"><div><h3>${esc(project.working_title || project.title)}</h3><p>${esc(project.interest || '')}</p><div class="project-meta"><span class="stage">${esc(STATUS_LABELS[project.status] || project.status)}</span><span>${esc(info.label)}</span><span>${esc(project.field)}</span><span>${esc(myStatus)}</span><span>${new Date(project.updated_at).toLocaleDateString('ko-KR')}</span></div></div><div class="project-actions"><button class="secondary" type="button" data-open="${esc(project.id)}">열기</button></div></article>`;
  }).join('');
  host.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openProject(button.dataset.open)));
}
async function openProject(id) {
  if (!session) { location.assign(LOGIN_URL); return; }
  const project = projects.find(item => item.id === id) || (await sb.from('author_projects').select('*').eq('id', id).single()).data;
  if (!project) return;
  const info = modeInfo(project);
  const { data: units } = await sb.from('author_chapters').select('*').eq('project_id', id).order('chapter_order');
  const overlay = document.createElement('div');
  overlay.className = 'dialog-backdrop';
  const canApprove = project.status === 'review';
  const canShare = project.status === 'author_approved' || project.status === 'publish_ready';
  const aiLabel = membership.paid_ai_active ? `${String(membership.display_name || membership.plan).toUpperCase()} · AI ${Number(membership.remaining_ai_units || 0)} units` : 'FREE · AI provider calls 0';
  overlay.innerHTML = `<section class="dialog" role="dialog" aria-modal="true"><button class="ghost close" type="button">닫기</button><p class="eyebrow">${esc(info.label)} · ${esc(STATUS_LABELS[project.status] || project.status)}</p><h2>${esc(project.working_title || project.title)}</h2><p class="notice">Creator AI · Research AI · Editor AI · Chief AI가 사람의 자료와 프로젝트 기억을 기준으로 협업합니다. <strong>${esc(aiLabel)}</strong>. 공개·배포는 사람의 승인 뒤에만 가능합니다.</p><div class="chapter-list">${(units || []).map(unit => `<button class="chapter-row" type="button" data-chapter="${esc(unit.id)}"><span>${String(unit.chapter_order).padStart(2, '0')}</span><strong>${esc(unit.title)}</strong><span>${esc(unit.status)}</span></button>`).join('')}</div><div class="dialog-actions"><button class="secondary" type="button" data-stage="writing">제작 단계</button><button class="secondary" type="button" data-stage="review">검토 요청</button><button class="primary" type="button" data-approve ${canApprove ? '' : 'disabled'}>최종 창작물 승인</button><button class="primary" type="button" data-my-ekodi ${canShare ? '' : 'disabled'}>My EKODI에 등록</button>${info.destination === 'EKODI BOOKS' ? '<button class="secondary" type="button" data-books>EKODI BOOKS 열기</button>' : ''}</div></section>`;
  document.body.append(overlay);
  overlay.querySelector('.close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  overlay.querySelectorAll('[data-chapter]').forEach(button => button.addEventListener('click', () => openUnit(project, units.find(item => item.id === button.dataset.chapter), overlay)));
  overlay.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', async () => { await setProjectStatus(project.id, button.dataset.stage); overlay.remove(); await loadProjects(); openProject(project.id); }));
  overlay.querySelector('[data-approve]').addEventListener('click', async () => {
    if (!canApprove) return;
    await setProjectStatus(project.id, 'author_approved');
    await recordEvent(project.id, 'author', 'author.approved', { creator_mode: creatorMode(project), approved_at: new Date().toISOString() });
    overlay.remove(); await loadProjects(); openProject(project.id);
  });
  overlay.querySelector('[data-my-ekodi]').addEventListener('click', async () => { if (canShare) await publishToMyEkodi(project, overlay); });
  const books = overlay.querySelector('[data-books]');
  if (books) books.addEventListener('click', () => { recordEvent(project.id, 'books', 'books.handoff.requested', { target: 'EKODI BOOKS' }); location.assign('https://books.ekodi.kr/'); });
}
async function publishToMyEkodi(project, overlay) {
  const button = overlay.querySelector('[data-my-ekodi]');
  if (button) { button.disabled = true; button.textContent = 'My EKODI 연결 중…'; }
  try {
    const { data, error } = await sb.rpc('publish_creator_to_my_ekodi', { p_project_id: project.id });
    if (error) throw error;
    await setProjectStatus(project.id, 'publish_ready');
    await recordEvent(project.id, 'system', 'my-ekodi.handoff.requested', { workspace_key: data?.workspace_key || workspace?.workspace_key || null, portfolio_item_id: data?.portfolio_item_id || null, creator_mode: creatorMode(project) });
    await loadProjects();
    const target = new URL(MY_EKODI_URL);
    if (data?.workspace_key) target.searchParams.set('workspace', data.workspace_key);
    target.searchParams.set('creator_project', project.id);
    location.assign(target.href);
  } catch (error) {
    console.error('My EKODI publish failed', error);
    if (button) { button.disabled = false; button.textContent = 'My EKODI에 등록'; }
    alert(`My EKODI 등록 실패: ${error.message}`);
  }
}
async function openUnit(project, unit, parentOverlay) {
  if (!unit) return;
  const info = modeInfo(project);
  const paid = Boolean(membership.paid_ai_active);
  const aiPanel = paid
    ? `<div class="ai-panel"><div class="ai-panel-head"><strong>AI Creation Desk</strong><span>${esc(String(membership.display_name || membership.plan).toUpperCase())} · ${Number(membership.remaining_ai_units || 0)} units 남음</span></div><div class="ai-controls"><select id="aiOperation"><option value="draft">Creator AI · 초안</option><option value="rewrite">Creator AI · 재작성</option><option value="edit">Editor AI · 편집</option><option value="research">Research AI · 검증</option><option value="chief">Chief AI · 품질검토</option></select><input id="aiInstruction" maxlength="4000" placeholder="예: 이 구성을 60초 쇼츠 대본으로, 혹은 소그룹 나눔용으로 바꿔 주세요"><button class="primary" id="runAi" type="button">AI 실행</button></div><div class="ai-status" id="aiStatus">AI 결과는 자동 저장되지 않습니다. 창작자가 적용을 선택합니다.</div><div class="ai-result" id="aiResult" hidden><textarea id="aiOutput" aria-label="AI 생성 결과"></textarea><div class="ai-result-actions"><button class="secondary" id="appendAi" type="button">뒤에 추가</button><button class="primary" id="replaceAi" type="button">현재 작업으로 적용</button></div></div></div>`
    : `<div class="ai-panel locked"><div class="ai-panel-head"><strong>AI Creation Desk · 유료회원 전용</strong><span>FREE · provider calls 0</span></div><p class="notice warn">무료회원에게는 외부 AI 요청을 보내지 않습니다. 따라서 AI API 비용도 발생하지 않습니다. 직접 제작과 수정 기능은 그대로 사용할 수 있습니다.</p><button class="secondary" id="viewMembership" type="button">회원제 보기</button></div>`;
  parentOverlay.querySelector('.dialog').innerHTML = `<button class="ghost close" type="button">프로젝트로</button><p class="eyebrow">${esc(info.label)} · ${esc(info.unit)} ${unit.chapter_order}</p><h2>${esc(unit.title)}</h2><p class="notice">목적 · ${esc(unit.purpose || '')}</p><div class="chapter-editor"><textarea id="chapterDraft" maxlength="90000" placeholder="${esc(info.artifact)} 초안을 작성하거나 붙여 넣으세요.">${esc(unit.draft_text || '')}</textarea></div>${aiPanel}<div class="dialog-actions"><button class="secondary" id="saveChapter" type="button">작업 저장</button><button class="primary" id="reviewChapter" type="button">이 구성 검토 완료</button></div>`;
  parentOverlay.querySelector('.close').addEventListener('click', () => { parentOverlay.remove(); openProject(project.id); });
  parentOverlay.querySelector('#saveChapter').addEventListener('click', () => saveUnit(unit, parentOverlay.querySelector('#chapterDraft').value, 'drafting'));
  parentOverlay.querySelector('#reviewChapter').addEventListener('click', () => saveUnit(unit, parentOverlay.querySelector('#chapterDraft').value, 'reviewed'));
  if (paid) {
    parentOverlay.querySelector('#runAi').addEventListener('click', () => runAi(project, unit, parentOverlay));
    parentOverlay.querySelector('#replaceAi').addEventListener('click', () => { parentOverlay.querySelector('#chapterDraft').value = parentOverlay.querySelector('#aiOutput').value; });
    parentOverlay.querySelector('#appendAi').addEventListener('click', () => { const draft = parentOverlay.querySelector('#chapterDraft'); const output = parentOverlay.querySelector('#aiOutput').value; draft.value = `${draft.value.trim()}${draft.value.trim() ? '\n\n' : ''}${output}`; });
  } else {
    parentOverlay.querySelector('#viewMembership').addEventListener('click', () => { parentOverlay.remove(); $('#membership').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
}
async function runAi(project, unit, overlay) {
  const button = overlay.querySelector('#runAi');
  const status = overlay.querySelector('#aiStatus');
  const result = overlay.querySelector('#aiResult');
  const output = overlay.querySelector('#aiOutput');
  const operation = overlay.querySelector('#aiOperation').value;
  const instruction = overlay.querySelector('#aiInstruction').value;
  button.disabled = true;
  status.classList.remove('error');
  status.textContent = '유료회원 권한과 사용량을 확인한 뒤 Creator AI를 실행하고 있습니다…';
  try {
    const data = await functionFetch('author-ai-api', { method: 'POST', body: JSON.stringify({ project_id: project.id, chapter_id: unit.id, operation, instruction, creator_mode: creatorMode(project) }) });
    output.value = data.text || '';
    result.hidden = false;
    const remaining = Number(data?.entitlement?.remaining_ai_units ?? membership.remaining_ai_units ?? 0);
    const used = Number(data?.entitlement?.used_ai_units ?? membership.used_ai_units ?? 0);
    membership.remaining_ai_units = remaining; membership.used_ai_units = used; renderMembership();
    status.textContent = `완료 · ${Number(data?.usage?.ai_units || 0)} AI unit 사용 · ${remaining} units 남음. 결과 적용 여부는 창작자가 결정합니다.`;
  } catch (error) {
    status.classList.add('error');
    if (error.code === 'paid_membership_required') status.textContent = '결제가 확인된 유료회원에게만 AI 제작을 제공합니다. 무료회원 요청은 provider에 전송되지 않았습니다.';
    else if (error.code === 'monthly_ai_quota_exceeded') status.textContent = '이번 달 AI 사용 한도에 도달했습니다. 추가 provider 호출은 차단되었습니다.';
    else if (error.code === 'ai_provider_not_configured') status.textContent = '전용 AI 비밀키 연결이 아직 완료되지 않았습니다. 비용은 발생하지 않았습니다.';
    else status.textContent = `AI 실행 실패: ${error.message}`;
  } finally { button.disabled = false; }
}
async function saveUnit(unit, text, status) {
  const { error } = await sb.from('author_chapters').update({ draft_text: text, status, version: Number(unit.version || 0) + 1, updated_at: new Date().toISOString() }).eq('id', unit.id);
  if (error) { alert(`저장 실패: ${error.message}`); return; }
  await sb.from('author_projects').update({ updated_at: new Date().toISOString() }).eq('id', unit.project_id);
  await recordEvent(unit.project_id, 'author', status === 'reviewed' ? 'creator.unit.reviewed' : 'creator.unit.saved', { chapter_id: unit.id, unit_order: unit.chapter_order });
  alert(status === 'reviewed' ? '검토 완료 상태로 저장했습니다.' : '작업을 저장했습니다.');
}
async function setProjectStatus(id, status) {
  const allowed = new Set(['plan', 'writing', 'review', 'author_approved', 'publish_ready']);
  if (!allowed.has(status)) return;
  const update = { status, updated_at: new Date().toISOString() };
  if (status === 'publish_ready') update.my_ekodi_status = 'published';
  const { error } = await sb.from('author_projects').update(update).eq('id', id);
  if (error) throw error;
  await recordEvent(id, status === 'author_approved' ? 'author' : 'author-ai', `project.${status}`, {});
}

$('#authButton').addEventListener('click', loginOrOut);
$('#newBookButton').addEventListener('click', () => openPlanner());
$('#resumeButton').addEventListener('click', () => $('#projects').scrollIntoView({ behavior: 'smooth' }));
$('#closePlanner').addEventListener('click', () => { $('#planner').hidden = true; });
document.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', openPlanner));
document.querySelectorAll('[data-creator-mode]').forEach(button => button.addEventListener('click', () => selectCreatorMode(button.dataset.creatorMode)));
$('#plannerForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const source = Object.fromEntries(form.entries());
  const concepts = buildConcepts(form);
  $('#plannerStatus').textContent = '서로 다른 4개 방향을 만들었습니다. 하나를 선택하거나 입력값을 바꿔 다시 비교할 수 있습니다.';
  renderConcepts(concepts, source);
});
try { await consumeHandoff(); } catch (error) { console.error('Creator auth handoff failed', error); }
session = await currentSession();
authState();
selectCreatorMode('writer', false);
await loadMembership();
await loadProjects();
sb.auth.onAuthStateChange(async (_event, next) => { session = next; authState(); await loadMembership(); await loadProjects(); });
