import { renderDevotionScore } from './devotion-score.js';
// EKODI 오늘의 매일묵상 — shared renderer for /bible, /ekodichurch and /ekodimission.
// Each host page provides its own header/footer and a mount:
//   <div data-ekodi-devotion data-base="/ekodichurch/devotion/" data-date-mode="query" data-site-label="에코디교회"></div>
// Canonical Scripture is always visible above the activity tabs. Deep links select a creative response.
const API = '/bible/api/bible/devotion';
const ORIGIN = 'https://ekodi.kr';
const TABS = Object.freeze([
  { id: 'poem', label: '묵상 시' },
  { id: 'song', label: '묵상 노래·악보' },
  { id: 'image', label: '묵상 그림' },
  { id: 'questions', label: '질문 / 실천' },
  { id: 'family', label: '가정·어린이' },
  { id: 'prayer', label: '한줄기도' },
  { id: 'records', label: '나의 묵상기록' },
]);
const ATTRIBUTION = '묵상 적용(시·노래·질문·기도)은 에코디언 정찬균목사가 공통본문을 바탕으로 AI 도움을 받아 만든 창작 묵상 자료입니다. 성경 본문은 개역한글(대한성서공회, 1961) 원문을 그대로 표시합니다.';
const ADMIN_TOKEN_KEY = 'ekodi-auth-token';
const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const RECORD_TOPIC = '매일묵상';

// EKODI member session written by the shared login (supabase-js format in localStorage).
function memberSessionEntry() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      const session = parsed?.currentSession || parsed?.session || parsed;
      if (session?.access_token && session?.user) return { key, parsed, session };
    }
  } catch {}
  return null;
}
let refreshing = null;
async function memberSession() {
  const entry = memberSessionEntry();
  if (!entry) return null;
  const { session } = entry;
  if (Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 30) return session;
  if (!session.refresh_token) return null;
  refreshing ||= (async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!response.ok) return null;
      const next = await response.json();
      if (!next?.access_token) return null;
      const merged = { ...session, ...next, expires_at: next.expires_at || Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600) };
      const stored = entry.parsed?.currentSession ? { ...entry.parsed, currentSession: merged } : entry.parsed?.session ? { ...entry.parsed, session: merged } : merged;
      try { localStorage.setItem(entry.key, JSON.stringify(stored)); } catch {}
      return merged;
    } catch { return null; } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}
function adminConsoleToken() { try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; } }
// Admin-console token first (existing super-admin editor), otherwise the member's own token.
async function requestToken() { return adminConsoleToken() || (await memberSession())?.access_token || ''; }
async function memberRest(path, init = {}) {
  const session = await memberSession();
  if (!session) throw Error('login_required');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, cache: 'no-store', headers: {
    apikey: SUPABASE_KEY, authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}
const TAB_IDS = new Set(TABS.map(tab => tab.id));

const mount = document.querySelector('[data-ekodi-devotion]');
if (mount) boot(mount);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
function storageGet(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function storageSet(key, value) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch {} }
function koreanDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

function boot(root) {
  const rawBase = root.dataset.base || '/bible/devotion';
  const base = rawBase.replace(/\/+$/, '');
  const dateMode = root.dataset.dateMode === 'query' ? 'query' : 'path';
  const siteLabel = root.dataset.siteLabel || '에코디';
  const siteKey = root.dataset.siteKey || (base.startsWith('/ekodichurch') ? 'church' : base.startsWith('/ekodimission') ? 'mission' : 'bible');
  const loginUrl = () => `${ORIGIN}/auth/?site=${siteKey}&return_to=${encodeURIComponent(location.href.split('#')[0] + '#records')}&direct=1`;
  const pageUrl = date => dateMode === 'query' ? `${rawBase}?date=${date}` : `${base}/${date}`;
  const shareUrl = (date, hash) => `${ORIGIN}${pageUrl(date)}${hash ? `#${hash}` : ''}`;
  let current = null;
  let activeTab = 'poem';

  root.classList.add('ekodi-devotion');
  root.innerHTML = '';
  const datebar = el('nav', 'dv-datebar');
  datebar.setAttribute('aria-label', '날짜 이동');
  const prev = el('a', 'dv-date-link', '‹ 이전');
  const dateLabel = el('strong', 'dv-date', '불러오는 중');
  const next = el('a', 'dv-date-link', '다음 ›');
  // Never display an actionable future link while the session is unresolved.
  next.hidden = true;
  next.setAttribute('aria-disabled','true');
  next.tabIndex = -1;
  datebar.append(prev, dateLabel, next);
  const status = el('p', 'dv-status');
  status.setAttribute('role', 'status');

  const summary = el('section', 'dv-summary');
  const passageTitle = el('h2', 'dv-passage');
  const theme = el('p', 'dv-theme');
  const keyLine = el('p', 'dv-keyline');
  const shareRow = el('div', 'dv-share-row');
  const shareAll = el('button', 'dv-btn dv-btn-primary', '카카오톡 등으로 공유');
  shareAll.type = 'button';
  shareAll.dataset.share = 'page';
  const copyAll = el('button', 'dv-btn', '링크 복사');
  copyAll.type = 'button';
  copyAll.dataset.copy = 'page';
  shareRow.append(shareAll, copyAll);
  summary.append(el('small', 'dv-kicker', '오늘의 공통본문'), passageTitle, theme, keyLine);
  const scriptureBlock = el('section', 'dv-panel dv-scripture-section');
  scriptureBlock.setAttribute('aria-label','개역한글 성경 본문');
  const audioRow = el('section','dv-audio-row');
  const adminPanel = el('section','dv-admin');
  adminPanel.id = 'devotion-editor';
  adminPanel.hidden = true;

  const tabbar = el('div', 'dv-tabs');
  tabbar.setAttribute('role', 'tablist');
  tabbar.setAttribute('aria-label', '묵상 활동');
  const panels = new Map();
  const tabButtons = new Map();
  const panelWrap = el('div', 'dv-panels');
  for (const tab of TABS) {
    const button = el('button', 'dv-tab', tab.label);
    button.type = 'button';
    button.id = `dv-tab-${tab.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `dv-panel-${tab.id}`);
    button.dataset.tab = tab.id;
    tabButtons.set(tab.id, button);
    tabbar.append(button);
    const panel = el('section', 'dv-panel');
    panel.id = `dv-panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.hidden = true;
    panels.set(tab.id, panel);
    panelWrap.append(panel);
  }
  const notice = el('p', 'dv-notice',ATTRIBUTION);
  const toastEl = el('p', 'dv-toast');
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  // Page order (2026-10-27): Scripture → activity tabs and the selected panel → attribution → share.
  // The passage summary card and the standalone CCM MR row are not shown; a licensed MR, when
  // registered, plays inside the 묵상 노래 panel instead (see setupMrPlayer).
  const adminBar = el('nav', 'dv-adminbar');
  adminBar.setAttribute('aria-label', '관리자 메뉴');
  adminBar.hidden = true;
  // 2026-10-27: 관리자 메뉴 sits under the share row; each menu opens its content inline below it.
  const adminView = el('section', 'dv-admin dv-admin-view');
  adminView.hidden = true;
  adminView.setAttribute('aria-live', 'polite');
  let adminSelection = '';
  root.append(datebar, status, scriptureBlock, tabbar, panelWrap, notice, shareRow, adminBar, adminPanel, adminView, toastEl);

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function panelHead(panel, title, shareKind) {
    const head = el('div', 'dv-panel-head');
    head.append(el('h3', '', title));
    if (shareKind) {
      const button = el('button', 'dv-mini', '이것만 공유');
      button.type = 'button';
      button.dataset.share = shareKind;
      head.append(button);
    }
    panel.append(head);
  }

  function selectTab(id, { updateHash = true } = {}) {
    if (!TAB_IDS.has(id) || tabButtons.get(id)?.hidden) id = TABS.find(tab => !tabButtons.get(tab.id).hidden)?.id || 'questions';
    activeTab = id;
    for (const [tabId, button] of tabButtons) {
      const on = tabId === id;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1;
      panels.get(tabId).hidden = !on;
    }
    if (updateHash) history.replaceState(null, '', `${location.pathname}${location.search}${id === 'poem' ? '' : `#${id}`}`);
  }
  // After a tab switch from further down the page, bring the tab row back just below the site's
  // sticky/fixed header so the newly shown panel never starts hidden behind it.
  function siteHeaderBottom() {
    let bottom = 0;
    for (const header of document.querySelectorAll('[data-ekodi-fixed-header], .site-header, .mission-site-header, body > header')) {
      const position = getComputedStyle(header).position;
      if (position !== 'fixed' && position !== 'sticky') continue;
      const rect = header.getBoundingClientRect();
      if (rect.top <= 1 && rect.height > 0) bottom = Math.max(bottom, rect.bottom);
    }
    return bottom;
  }
  function revealTabs() {
    const top = tabbar.getBoundingClientRect().top;
    const clearance = siteHeaderBottom() + 8;
    if (top < clearance) window.scrollBy({ top: top - clearance, behavior: 'auto' });
  }

  function renderPassage(panel, data) {
    panelHead(panel, `${data.passage} (개역한글)`);
    const blocks = (data.scripture || []).filter(part => part?.ok && part.verses?.length);
    if (!blocks.length) {
      const link = el('a', 'dv-btn', '성경읽기에서 본문 열기');
      link.href = '/bible/reader';
      panel.append(link);
      return;
    }
    const verses = el('div', 'dv-verses');
    for (const part of blocks) {
      if (blocks.length > 1) verses.append(el('p', 'dv-chapter', `${part.book.name} ${part.chapter}장`));
      for (const verse of part.verses) {
        const p = el('p');
        p.append(el('sup', '', String(verse.verse)), ' ', verse.text);
        verses.append(p);
      }
    }
    panel.append(verses, el('p', 'dv-meta', blocks[0].attribution || ''));
  }


  function renderScore(container, abc) {
    const rendered=renderDevotionScore(container,abc);
    if(!rendered)container.dataset.scoreStatus='unsupported-score';
    else container.dataset.scoreStatus='first-party-svg-ready';
  }

  function setupMrPlayer(song) {
    audioRow.replaceChildren();
    const title = el('strong', '', '오늘의 CCM MR');
    const detail = el('span', 'dv-audio-hint');
    const url = String(song?.mrUrl || '');
    audioRow.append(title, detail);
    if (!/^\/bible\/media\/[a-z0-9/_-]+\.(mp3|ogg|m4a|webm)$/i.test(url)) {
      audioRow.replaceChildren();
      audioRow.hidden = true;
      return;
    }
    audioRow.hidden = false;
    (panels.get('song') || root).append(audioRow);
    const audio = el('audio');
    audio.src = url; audio.loop = true; audio.preload = 'metadata';
    const toggle = el('button','dv-mini','MR 재생');
    toggle.type = 'button'; toggle.setAttribute('aria-pressed','false');
    const update = playing => {
      toggle.textContent = playing ? 'MR 일시정지' : 'MR 재생';
      toggle.setAttribute('aria-pressed', String(playing));
    };
    toggle.addEventListener('click', async () => {
      if (!audio.paused) { audio.pause(); update(false); return; }
      try { await audio.play(); update(true); detail.textContent = song.mrTitle || '반주 재생 중'; }
      catch { detail.textContent = '브라우저 설정에서 음성 재생을 허용해 주세요.'; update(false); }
    });
    audio.addEventListener('ended',()=>update(false));
    audio.addEventListener('error',()=>{update(false);detail.textContent='음원 파일을 확인할 수 없습니다.';});
    audioRow.append(toggle,audio);
    detail.textContent = song.mrTitle || '사용 허가된 반주';
    // Browsers may block unmuted autoplay; never circumvent the user's audio preference.
    audio.play().then(()=>update(true)).catch(()=>{update(false);detail.textContent='자동재생이 제한되었습니다. MR 재생 버튼을 누르세요.';});
  }

  function renderAdminEditor(data) {
    adminPanel.hidden = adminSelection !== 'edit';
    const heading = el('h3','','관리자 · 묵상 적용 편집');
    const info = el('p','dv-meta',`승인된 공통본문 ${data.passage}은 수정하지 않습니다. 세부 적용 자료만 편집합니다. 상태: ${data.admin.status}`);
    const form = el('form','dv-editor-form');
    const source = data.activities;
    const sections = [
      ['theme','주제','text'],['keyLine','핵심 문장','textarea'],
      ['poem.title','묵상 시 제목','text'],['poem.lines','시 · 줄마다 한 행','textarea'],
      ['song.title','묵상 노래 제목','text'],['song.mood','노래 분위기','text'],
      ['song.verse','노래 1절 · 줄마다 한 행','textarea'],['song.refrain','노래 후렴 · 줄마다 한 행','textarea'],
      ['song.abc','악보 · ABC 표기법','textarea'],['song.mrUrl','CCM MR · 사용권 확인된 /bible/media/ 파일','text'],
      ['song.mrTitle','MR 제목','text'],['illustration.src','그림 · /bible/media/ 파일 또는 공통 일러스트','text'],
      ['illustration.alt','그림 설명','text'],['questions','적용 질문 · 각 행에 분류|질문','textarea'],
      ['action','오늘의 실천','textarea'],['family','가정·어린이','textarea'],
      ['prayer','한줄기도 · 기도 예문','textarea'],
    ];
    const bindings = new Map();
    const getValue = path => {
      if (path === 'questions') return (source.questions||[]).map(q=>`${q.kind}|${q.text}`).join('\n');
      const value = path.split('.').reduce((obj,key)=>obj?.[key],source);
      return Array.isArray(value)?value.join('\n'):String(value||'');
    };
    for (const [path,labelText,kind] of sections) {
      const label = el('label','dv-editor-field');
      const textLabel = el('span','',labelText);
      const field = el(kind === 'textarea'?'textarea':'input','dv-editor-input');
      if(kind==='textarea') field.rows = path==='song.abc'?6:3;
      field.value = getValue(path);
      field.dataset.editor = path;
      field.setAttribute('aria-label',labelText);
      label.append(textLabel,field);form.append(label);bindings.set(path,field);
    }
    const controls = el('div','dv-share-row');
    const saveDraft = el('button','dv-btn','임시저장');
    const publish = el('button','dv-btn dv-btn-primary','공개 반영');
    saveDraft.type=publish.type='button';
    controls.append(saveDraft,publish);
    const feedback = el('p','dv-status');
    form.append(controls,feedback);
    const persist = async statusValue => {
      const token = await requestToken();
      if (!token) {feedback.textContent='관리자 로그인이 필요합니다.';return}
      const out = JSON.parse(JSON.stringify(source));
      for (const [path,field] of bindings) {
        const raw = field.value.trim();
        let value = raw;
        if(path==='questions') value=raw.split('\n').filter(Boolean).map(line=>{
          const i=line.indexOf('|');return {kind:i<0?'적용':line.slice(0,i).trim(),text:line.slice(i+1).trim()};
        });
        else if(['poem.lines','song.verse','song.refrain'].includes(path)) value=raw.split('\n').map(v=>v.trim()).filter(Boolean);
        if(path.includes('.')) {
          const [head,tail]=path.split('.');
          out[head] ||= {};
          out[head][tail]=value;
        }else out[path]=value;
      }
      saveDraft.disabled=publish.disabled=true;feedback.textContent='저장 중입니다.';
      try {
        const response=await fetch(API,{method:'PUT',cache:'no-store',headers:{
          'content-type':'application/json',authorization:`Bearer ${token}`
        },body:JSON.stringify({date:data.date,activities:out,status:statusValue,expectedRevision:data.admin.revision})});
        const answer=await response.json();
        if(!response.ok)throw Error(answer.error||'save_failed');
        data.admin.revision=answer.revision;
        data.admin.status=answer.status;
        feedback.textContent=statusValue==='published'?'변경 사항이 공개 반영되었습니다.':'검수용 초안을 저장했습니다.';
        current.activities=out;
        render(current);
      } catch(error){feedback.textContent=`저장 실패: ${error.message}. 다시 조회한 뒤 재시도해 주세요.`;}
      finally{saveDraft.disabled=publish.disabled=false;}
    };
    saveDraft.addEventListener('click',()=>persist('draft'));
    publish.addEventListener('click',()=>persist('published'));
    adminPanel.append(heading,info,form);
  }

  // ── 관리자 메뉴: shown only to roles the server confirms; each linked surface enforces its own auth.
  async function loadViewer() {
    let viewer = null;
    try {
      const token = await requestToken();
      if (!token) return;
      const response = await fetch(`${API}/me`, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
      if (response.ok) viewer = await response.json();
    } catch {}
    renderAdminBar(viewer);
  }
  function renderAdminBar(viewer) {
    adminBar.replaceChildren();
    const items = [];
    if (viewer?.superAdmin) {
      items.push(['edit', '이 날짜 묵상 편집']);
      items.push(['month', '매일묵상 관리']);
    }
    if (viewer?.superAdmin || viewer?.churchAdmin) items.push(['church', '교회 · 주일모임']);
    if (viewer?.superAdmin || viewer?.missionAdmin) items.push(['mission', '선교회 · 토요모임']);
    if (!items.length) { adminBar.hidden = true; return; }
    adminBar.append(el('strong', 'dv-adminbar-title', '관리자 메뉴'));
    for (const [key, label] of items) {
      const button = el('button', 'dv-adminbar-link', label);
      button.type = 'button';
      button.dataset.adminView = key;
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => openAdminView(adminSelection === key ? '' : key));
      adminBar.append(button);
    }
    adminBar.hidden = false;
    if (viewer?.superAdmin && current?.found && !current.admin?.canEdit) void reloadAsAdmin();
  }
  async function openAdminView(key) {
    adminSelection = key;
    for (const button of adminBar.querySelectorAll('[data-admin-view]')) {
      const on = button.dataset.adminView === key;
      button.classList.toggle('active', on);
      button.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    adminView.replaceChildren();
    adminView.hidden = !key || key === 'edit';
    adminPanel.hidden = key !== 'edit' || !adminPanel.childElementCount;
    if (!key) return;
    if (key === 'edit') {
      if (!adminPanel.childElementCount) {
        adminView.hidden = false;
        adminView.append(el('p', 'dv-meta', '편집기를 불러오는 중입니다.'));
        await reloadAsAdmin();
        if (adminSelection !== 'edit') return;
        adminView.hidden = Boolean(adminPanel.childElementCount);
        if (!adminPanel.childElementCount) adminView.replaceChildren(el('p', 'dv-meta', '편집 권한을 확인하지 못했습니다. 다시 로그인한 뒤 눌러 주세요.'));
        adminPanel.hidden = !adminPanel.childElementCount;
      }
      adminPanel.querySelector('input,textarea')?.focus({ preventScroll: true });
      adminBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    adminBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      if (key === 'month') await renderMonthView();
      else if (key === 'church') await renderMeetingView(0, '교회 · 주일모임', '주일', '/ekodichurch/admin/worship', '예배·말씀에서 주일모임 등록');
      else if (key === 'mission') await renderMeetingView(6, '선교회 · 토요모임', '토요일', '/ekodimission/admin/saturday', '토요모임 관리에서 등록');
    } catch {
      if (adminSelection === key) adminView.append(el('p', 'dv-meta', '공통본문을 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.'));
    }
  }
  const commonCache = new Map();
  async function commonMonth(month) {
    if (!commonCache.has(month)) {
      commonCache.set(month, fetch(`/api/public/scripture/common?month=${encodeURIComponent(month)}`, { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null).catch(() => null));
    }
    return commonCache.get(month);
  }
  function adminLink(label, href) {
    const link = el('a', 'dv-btn', label);
    link.href = href;
    return link;
  }
  async function renderMonthView() {
    const month = String(current?.date || '').slice(0, 7);
    const data = await commonMonth(month);
    if (adminSelection !== 'month') return;
    adminView.append(el('h3', '', `${month.replace('-', '년 ')}월 공통본문`));
    if (!data?.readings?.length) {
      adminView.append(el('p', 'dv-meta', '이 달의 공통본문이 아직 등록되지 않았습니다.'));
    } else {
      adminView.append(el('p', 'dv-meta', `${data.range || ''} · ${data.readings.length}일 · 날짜를 누르면 그날 묵상으로 이동합니다.`));
      const list = el('ol', 'dv-admin-list');
      for (const item of data.readings) {
        const row = el('li', item.date === current?.date ? 'active' : '');
        const day = new Date(`${item.date}T12:00:00+09:00`).getUTCDay();
        const link = el('a', day === 0 ? 'sun' : day === 6 ? 'sat' : '', `${Number(item.date.slice(8))}일 (${'일월화수목금토'[day]})`);
        link.href = pageUrl(item.date);
        row.append(link, el('span', '', item.passage), el('span', 'dv-admin-title', item.title || ''));
        list.append(row);
      }
      adminView.append(list);
    }
    const row = el('div', 'dv-share-row');
    row.append(adminLink('매일묵상 관리 화면 열기', '/admin#devotional'));
    adminView.append(row);
  }
  async function renderMeetingView(weekday, title, dayName, href, cta) {
    const key = adminSelection;
    const base = String(current?.date || '');
    const [y, m, d] = base.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d));
    const offset = (weekday - start.getUTCDay() + 7) % 7;
    const target = new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
    const data = await commonMonth(target.slice(0, 7));
    if (adminSelection !== key) return;
    const reading = data?.readings?.find(item => item.date === target);
    adminView.append(el('h3', '', title));
    const card = el('dl', 'dv-admin-card');
    const add = (label, value) => { card.append(el('dt', '', label), el('dd', '', value)); };
    add(offset ? `다가오는 ${dayName}` : `오늘 (${dayName})`, koreanDate(target));
    add('공통본문', reading?.passage || '아직 등록되지 않음');
    if (reading?.title) add('묵상 제목', reading.title);
    adminView.append(card);
    adminView.append(el('p', 'dv-meta', `${dayName} 날짜를 고르면 공통본문이 자동으로 채워지고 잠깁니다.`));
    const row = el('div', 'dv-share-row');
    const go = adminLink(cta, href);
    go.classList.add('dv-btn-primary');
    row.append(go, adminLink(`${dayName} 묵상 보기`, pageUrl(target)));
    adminView.append(row);
  }
  async function reloadAsAdmin() {
    try {
      const token = await requestToken();
      const response = await fetch(`${API}?date=${current?.date || ''}`, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
      if (response.ok) { const data = await response.json(); if (data.admin?.canEdit) render(data); }
    } catch {}
  }

  // ── 나의 묵상기록: the member's own records (Supabase bible_journeys, row-level security = owner only).
  const recordTitle = date => `${date} 매일묵상`;
  async function renderRecords(panel, data) {
    panel.replaceChildren();
    panelHead(panel, '나의 묵상기록');
    const session = await memberSession();
    const localKey = `ekodi-devotion-mine-${data.date}`;
    const form = el('form', 'dv-record-form');
    const reflection = el('textarea', 'dv-mine');
    reflection.name = 'reflection'; reflection.rows = 4; reflection.maxLength = 2000;
    reflection.placeholder = '오늘 말씀에서 받은 은혜와 깨달음을 적어 보세요.';
    const prayer = el('textarea', 'dv-mine');
    prayer.name = 'prayer'; prayer.rows = 2; prayer.maxLength = 500;
    prayer.placeholder = '오늘 말씀 앞에서 나의 한줄기도를 적어 보세요.';
    const reflectionLabel = el('label', 'dv-section-label', '오늘의 묵상');
    const prayerLabel = el('label', 'dv-section-label', '나의 한줄기도');
    reflectionLabel.append(reflection); prayerLabel.append(prayer);
    const actions = el('div', 'dv-share-row');
    const save = el('button', 'dv-btn dv-btn-primary', session ? '기록 저장' : '이 기기에 임시 저장');
    save.type = 'submit';
    const sharePrayer = el('button', 'dv-mini', '나의 기도 공유');
    sharePrayer.type = 'button'; sharePrayer.dataset.share = 'mine';
    actions.append(save, sharePrayer);
    const note = el('p', 'dv-meta');
    form.append(reflectionLabel, prayerLabel, actions, note);
    panel.append(form);
    const list = el('div', 'dv-records');
    panel.append(list);

    if (!session) {
      try { const local = JSON.parse(storageGet(localKey) || 'null'); if (local && typeof local === 'object') { reflection.value = local.reflection || ''; prayer.value = local.prayer || ''; } else prayer.value = storageGet(localKey); } catch { prayer.value = storageGet(localKey); }
      note.textContent = '로그인하지 않으면 이 기기에만 저장됩니다. 로그인하면 어느 기기에서나 나의 묵상기록을 보고 고칠 수 있습니다.';
      const login = el('a', 'dv-btn', '로그인하고 기록 관리하기');
      login.href = loginUrl();
      actions.prepend(login);
      form.addEventListener('submit', event => { event.preventDefault(); storageSet(localKey, JSON.stringify({ reflection: reflection.value, prayer: prayer.value })); toast('이 기기에 저장했습니다.'); });
      return;
    }
    note.textContent = `${session.user?.email || '내 계정'} 계정에 저장됩니다. 나만 볼 수 있고, 공유는 직접 누를 때만 이루어집니다.`;
    let records = [];
    let existing = null;
    const paint = () => {
      list.replaceChildren(el('h4', 'dv-section-label', `나의 묵상기록 ${records.length ? `(${records.length})` : ''}`));
      if (!records.length) { list.append(el('p', 'dv-meta', '아직 저장한 묵상기록이 없습니다.')); return; }
      for (const record of records) {
        const item = el('article', 'dv-record');
        const date = String(record.title || '').slice(0, 10);
        item.append(el('strong', '', `${/^\d{4}-\d{2}-\d{2}$/.test(date) ? koreanDate(date) : record.title} · ${record.scripture_ref || ''}`));
        if (record.reflection) item.append(el('p', '', record.reflection));
        if (record.prayer) item.append(el('p', 'dv-prayer', record.prayer));
        const row = el('div', 'dv-share-row');
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date !== data.date) {
          const open = el('a', 'dv-mini', '이 날 묵상 열기');
          open.href = `${pageUrl(date)}#records`;
          row.append(open);
        }
        const remove = el('button', 'dv-mini', '삭제');
        remove.type = 'button';
        remove.addEventListener('click', async () => {
          if (!confirm('이 묵상기록을 삭제할까요? 삭제하면 되돌릴 수 없습니다.')) return;
          try {
            await memberRest(`bible_journeys?id=eq.${encodeURIComponent(record.id)}`, { method: 'DELETE' });
            records = records.filter(item => item.id !== record.id);
            if (existing?.id === record.id) { existing = null; reflection.value = ''; prayer.value = ''; }
            paint(); toast('삭제했습니다.');
          } catch { toast('삭제하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.'); }
        });
        row.append(remove);
        item.append(row);
        list.append(item);
      }
    };
    try {
      records = await memberRest(`bible_journeys?topic=eq.${encodeURIComponent(RECORD_TOPIC)}&select=id,title,scripture_ref,reflection,prayer,updated_at&order=title.desc&limit=60`) || [];
      existing = records.find(item => item.title === recordTitle(data.date)) || null;
      reflection.value = existing?.reflection || '';
      const local = storageGet(localKey);
      prayer.value = existing?.prayer || (local && !local.startsWith('{') ? local : '');
      if (existing) save.textContent = '기록 수정';
      paint();
    } catch { list.replaceChildren(el('p', 'dv-meta', '나의 묵상기록을 불러오지 못했습니다. 다시 로그인해 주세요.')); }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!reflection.value.trim() && !prayer.value.trim()) { toast('묵상이나 기도를 한 줄 이상 적어 주세요.'); return; }
      save.disabled = true;
      const body = { reflection: reflection.value.trim(), prayer: prayer.value.trim(), scripture_ref: data.passage, updated_at: new Date().toISOString() };
      try {
        if (existing) {
          const rows = await memberRest(`bible_journeys?id=eq.${encodeURIComponent(existing.id)}`, { method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(body) });
          existing = rows?.[0] || { ...existing, ...body };
        } else {
          const user = (await memberSession())?.user;
          const rows = await memberRest('bible_journeys', { method: 'POST', headers: { prefer: 'return=representation' },
            body: JSON.stringify({ ...body, user_id: user.id, topic: RECORD_TOPIC, title: recordTitle(data.date) }) });
          existing = rows?.[0] || null;
        }
        records = [existing, ...records.filter(item => item.id !== existing?.id)].filter(Boolean).sort((a, b) => String(b.title).localeCompare(String(a.title)));
        storageSet(localKey, '');
        save.textContent = '기록 수정';
        paint(); toast('나의 묵상기록에 저장했습니다.');
      } catch { toast('저장하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.'); }
      finally { save.disabled = false; }
    });
  }

  // All 3 public devotion hosts share these navigation guards.
  const seoulToday = () => {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const value = type => parts.find(part=>part.type===type)?.value||'';
    return [value('year'),value('month'),value('day')].join('-');
  };
  let futurePermissionRevoked = false;
  let permissionCheck = 0;
  function updateNextAccess() {
    const today = seoulToday();
    const allowed = Boolean(current?.nextDate) &&
      (current.nextDate <= today || (current.admin?.canEdit && !futurePermissionRevoked));
    // No href, keyboard target, or click action is left for an inaccessible date.
    next.hidden = !allowed;
    next.tabIndex = allowed ? 0 : -1;
    next.setAttribute('aria-disabled', String(!allowed));
    if (allowed) next.href = pageUrl(current.nextDate);
    else next.removeAttribute('href');
  }
  function revokeFutureNavigation() {
    futurePermissionRevoked = true;
    permissionCheck += 1;
    if (current) current.admin = null;
    updateNextAccess();
    // If an administrator signs out while already viewing tomorrow, remove
    // previously rendered private content instead of leaving it onscreen.
    if (current?.date > seoulToday()) location.replace(pageUrl(seoulToday()));
  }
  async function verifyFuturePermission(date) {
    const epoch = ++permissionCheck;
    const bearer = await requestToken();
    if (!bearer || epoch !== permissionCheck) return false;
    try {
      const response = await fetch(`${API}?date=${encodeURIComponent(date)}`,{
        cache:'no-store',headers:{authorization:`Bearer ${bearer}`}
      });
      const data = await response.json().catch(()=>null);
      if(epoch !== permissionCheck)return false;
      return response.ok && data?.admin?.canEdit === true;
    } catch { return false; }
  }
  next.addEventListener('click',async event=>{
    if (!current?.nextDate || next.hidden || !next.hasAttribute('href')) {
      event.preventDefault();return;
    }
    if (current.nextDate <= seoulToday()) return;
    event.preventDefault();
    const date=current.nextDate;
    if (!await verifyFuturePermission(date)) {revokeFutureNavigation();return;}
    if (date !== current?.nextDate || next.hidden) return;
    location.assign(pageUrl(date));
  });
  window.addEventListener('ekodi:auth-logout',revokeFutureNavigation);
  const reevaluate = () => {
    updateNextAccess();
    if(current?.date > seoulToday() || (current?.nextDate > seoulToday() && current.admin?.canEdit)){
      void verifyFuturePermission(current.date > seoulToday()?current.date:current.nextDate)
        .then(valid=>{if(!valid)revokeFutureNavigation()});
    }
  };
  window.addEventListener('pageshow',reevaluate);
  window.addEventListener('focus',reevaluate);
  window.addEventListener('storage',event=>{
    if(event.key===null || event.key==='ekodi-auth-token' || /^sb-.*-auth-token$/.test(event.key||''))reevaluate();
  });

  function render(data) {
    current = data;
    dateLabel.textContent = koreanDate(data.date);
    prev.href = pageUrl(data.prevDate);
    updateNextAccess();
    for (const panel of panels.values()) panel.replaceChildren();
    scriptureBlock.replaceChildren();
    audioRow.replaceChildren();
    adminPanel.replaceChildren();
    adminPanel.hidden = true;
    if (!data.found) {
      status.textContent = data.error === 'scripture_not_registered'
        ? '이 날짜의 공통본문이 아직 등록되지 않았습니다. 다른 날짜를 선택해 주세요.'
        : '날짜 형식을 확인해 주세요.';
      summary.hidden = scriptureBlock.hidden = shareRow.hidden = notice.hidden = audioRow.hidden = tabbar.hidden = panelWrap.hidden = true;
      return;
    }
    status.textContent = '';
    summary.hidden = scriptureBlock.hidden = shareRow.hidden = notice.hidden = tabbar.hidden = panelWrap.hidden = false;
    const a = data.activities;
    passageTitle.textContent = data.passage;
    theme.textContent = a.theme;
    keyLine.textContent = a.keyLine;

    renderPassage(scriptureBlock, data);

    tabButtons.get('poem').hidden = !a.poem;
    if (a.poem) {
      const panel = panels.get('poem');
      panelHead(panel, a.poem.title, 'poem');
      const poem = el('div', 'dv-poem');
      for (const line of a.poem.lines) poem.append(el('p', '', line));
      panel.append(poem);
    }
    tabButtons.get('song').hidden = !a.song;
    if (a.song) {
      const panel = panels.get('song');
      panelHead(panel, a.song.title, 'song');
      panel.append(el('p', 'dv-meta', `분위기 · ${a.song.mood}`));
      const verse = el('div', 'dv-song');
      for (const line of a.song.verse) verse.append(el('p', '', line));
      const refrain = el('div', 'dv-refrain');
      refrain.append(el('small', '', '후렴'));
      for (const line of a.song.refrain) refrain.append(el('p', '', line));
      const score = el('div','dv-score');
      panel.append(score,verse,refrain);
      if(a.song.abc)renderScore(score,a.song.abc);
      else score.append(el('p','dv-meta','선율이 확정되지 않아 악보가 아직 없습니다. 관리자가 악보를 등록하면 오선보로 표시합니다.'));
      panel.append(el('p','dv-meta','묵상 노래의 선율 악보는 작성·검수된 원곡 자료만 표시합니다.'));
    }
    {
      const panel = panels.get('image');
      panelHead(panel,'말씀을 그리다','image');
      const img=el('img','dv-illustration');
      img.src=a.illustration?.src || '/bible/devotion-illustration.svg';
      img.alt=a.illustration?.alt || '말씀의 길을 함께 걷는 사람들의 선그림';
      img.loading='lazy';img.decoding='async';
      panel.append(img,el('p','dv-meta',`묵상 그림 · ${a.theme}`));
    }
    {
      const panel = panels.get('questions');
      panelHead(panel, '질문 / 실천', 'questions');
      const list = el('ol', 'dv-questions');
      for (const q of a.questions || []) {
        const li = el('li');
        li.append(el('span', 'dv-tag', q.kind), ' ', q.text);
        list.append(li);
      }
      const label=el('label','dv-check');
      const box=el('input');box.type='checkbox';
      const doneKey=`ekodi-devotion-done-${data.date}`;
      box.checked=storageGet(doneKey)==='1';
      box.addEventListener('change',()=>storageSet(doneKey,box.checked?'1':''));
      label.append(box,el('span','',a.action || '오늘의 말씀을 실천하기'));
      panel.append(list,el('h4','dv-section-label','오늘의 실천'),label,
        el('p','dv-meta','실천 체크는 이 기기에만 저장됩니다.'));
    }
    {
      const panel = panels.get('family');
      panelHead(panel, '가정·어린이와 함께', 'family');
      panel.append(el('p', 'dv-body', a.family));
    }
    {
      const panel=panels.get('prayer');
      panelHead(panel,'한줄기도','prayer');
      panel.append(el('p','dv-prayer',a.prayer));
      const go=el('button','dv-mini','나의 묵상기록에 적기');
      go.type='button';go.dataset.tab='records';
      panel.append(el('div','dv-share-row'));panel.lastChild.append(go);
      renderRecords(panels.get('records'), data);
    }
    notice.textContent = ATTRIBUTION + (data.activitySource === 'fallback' ? ' 이 날짜는 기본 묵상 적용 자료를 제공합니다.' : '');
    setupMrPlayer(a.song);
    if(data.admin?.canEdit) renderAdminEditor(data);
    const legacyTab = {passage:'poem',action:'questions',mine:'records'}[location.hash.slice(1)];
    selectTab(legacyTab || location.hash.slice(1) || 'poem', { updateHash: false });
  }

  function shareBody(kind) {
    const d = current;
    const a = d.activities;
    const [, m, day] = d.date.split('-').map(Number);
    const head = `[${siteLabel} 오늘의 매일묵상 ${m}/${day}] ${d.passage}`;
    switch (kind) {
      case 'poem': return { title: a.poem.title, text: `${head}\n\n〈${a.poem.title}〉\n${a.poem.lines.join('\n')}`, hash: 'poem' };
      case 'song': return { title: a.song.title, text: `${head}\n\n♪ ${a.song.title}\n${a.song.verse.join('\n')}\n(후렴) ${a.song.refrain.join(' / ')}`, hash: 'song' };
      case 'questions': return { title: '질문 / 실천', text: `${head}\n\n${a.questions.map((q, i) => `${i + 1}. [${q.kind}] ${q.text}`).join('\n')}\n오늘의 실천: ${a.action}`, hash: 'questions' };
      case 'image': return { title: '묵상 그림', text: `${head}\n\n묵상 그림 · ${a.theme}`, hash: 'image' };
      case 'family': return { title: '가정·어린이 질문', text: `${head}\n\n👨‍👩‍👧 ${a.family}`, hash: 'family' };
      case 'action': return { title: '오늘의 실천', text: `${head}\n\n✔ 오늘의 실천: ${a.action}`, hash: 'action' };
      case 'prayer': return { title: '한 줄 기도', text: `${head}\n\n🙏 ${a.prayer}`, hash: 'prayer' };
      case 'mine': {
        const mine = panels.get('records').querySelector('textarea[name="prayer"]')?.value.trim();
        if (!mine) return null;
        return { title: '나의 한줄기도', text: `${head}\n\n${mine}`, hash: 'records' };
      }
      default: return { title: `${siteLabel} 오늘의 매일묵상 · ${d.passage}`, text: `${head}\n${a.keyLine}`, hash: '' };
    }
  }

  async function copy(value) {
    try { await navigator.clipboard.writeText(value); return true; } catch {}
    const area = el('textarea', 'dv-offscreen');
    area.value = value;
    area.setAttribute('readonly', '');
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    area.remove();
    return ok;
  }

  async function share(kind, copyOnly = false) {
    if (!current?.found) return;
    const body = shareBody(kind);
    if (!body) { toast('먼저 나의 한줄기도를 적어 주세요.'); selectTab('records'); panels.get('records').querySelector('textarea[name="prayer"]')?.focus(); return; }
    const url = shareUrl(current.date, body.hash);
    if (copyOnly) { toast(await copy(url) ? '링크를 복사했습니다. 카카오톡 대화방에 붙여 넣어 주세요.' : url); return; }
    if (navigator.share) {
      try { await navigator.share({ title: body.title, text: body.text, url }); return; }
      catch (error) { if (error?.name === 'AbortError') return; }
    }
    toast(await copy(`${body.text}\n\n${url}`) ? '내용과 링크를 복사했습니다. 카카오톡에 붙여 넣어 주세요.' : url);
  }

  root.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { selectTab(tab.dataset.tab); revealTabs(); return; }
    const shareButton = event.target.closest('[data-share]');
    if (shareButton) { share(shareButton.dataset.share); return; }
    const copyButton = event.target.closest('[data-copy]');
    if (copyButton) share(copyButton.dataset.copy, true);
  });
  tabbar.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
    const visible = TABS.map(t => t.id).filter(id => !tabButtons.get(id).hidden);
    const index = visible.indexOf(activeTab);
    const nextId = visible[(index + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length];
    selectTab(nextId);
    tabButtons.get(nextId).focus();
  });
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1), legacy = {passage:'poem',action:'questions',mine:'records'}[hash];
    if (current?.found) selectTab(legacy || hash || 'poem', { updateHash: false });
  });

  function requestedDate() {
    const match = location.pathname.match(/\/devotion\/(\d{4}-\d{2}-\d{2})\/?$/);
    if (match) return match[1];
    const query = new URLSearchParams(location.search).get('date');
    return /^\d{4}-\d{2}-\d{2}$/.test(query || '') ? query : '';
  }

  (async () => {
    const date = requestedDate();
    try {
      const token = await requestToken();
      void loadViewer();
      const response = await fetch(`${API}${date ? `?date=${date}` : ''}`,
        {cache:'no-store',headers:token?{authorization:`Bearer ${token}`}:{}});
      const data = await response.json();
      if (!response.ok) {
        status.textContent = data.error === 'future_unavailable'
          ? '아직 공개되지 않은 날짜입니다. 오늘 날짜까지만 열람할 수 있습니다.'
          : data.error === 'invalid_date' ? '날짜를 확인해 주세요.' : '묵상 자료를 불러올 수 없습니다.';
        summary.hidden = scriptureBlock.hidden = notice.hidden = shareRow.hidden = tabbar.hidden = panelWrap.hidden = audioRow.hidden = true;
        return;
      }
      if (!date && data.date && dateMode === 'path') history.replaceState(null, '', `${pageUrl(data.date)}${location.hash}`);
      render(data);
    } catch (error) {
      status.textContent = `묵상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. (${error.message})`;
    }
  })();
}
