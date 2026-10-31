// PUBLISHING-WORKSPACE-TABS-001 (§11): 출판 첫 화면의 작업 영역.
// 상단 탭을 누르면 아래 영역만 바뀐다. 데이터는 출판 원장 API와 공개 도서 목록만 읽고,
// 권한 판단은 서버가 한다. 경로는 모두 변수로 시작하는 템플릿/정식 주소라 게이트웨이 재작성의 영향을 받지 않는다.
(() => {
  'use strict';
  const root = document.getElementById('workspace');
  if (!root) return;
  const ORIGIN = 'https://ekodi.kr';
  const WORKFLOW = `${ORIGIN}/publishing/api/workflow`;
  const CATALOG = `${ORIGIN}/books/books.json`;
  const LABELS = { planning: '기획', drafting: '집필 중', in_review: '편집 검수', changes_requested: '수정 요청',
    ready_for_author: '저자 승인 대기', author_approved: '저자 승인 완료', publisher_approved: '발행 승인 완료',
    scheduled: '출간 예약', handoff_ready: '판매 등록 인계 대기', released: '판매 중' };
  const GROUPS = [
    ['집필', ['planning', 'drafting', 'changes_requested']],
    ['편집·검수', ['in_review']],
    ['승인', ['ready_for_author', 'author_approved', 'publisher_approved']],
    ['출간 예약·인계', ['scheduled', 'handoff_ready']],
    ['판매 중', ['released']],
  ];
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const panels = [...root.querySelectorAll('[role="tabpanel"]')];
  const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); for (const k of kids) n.append(k); return n; };
  const loaded = new Set();
  let projectsPromise = null;

  function token() {
    for (const key of ['sb-renzehysxirjilvdxacv-auth-token', 'ekodi-books-buyer-session']) {
      try { const x = JSON.parse(localStorage.getItem(key) || 'null'); const v = x?.currentSession || x?.session || x; if (v?.access_token) return v.access_token; if (v?.accessToken) return v.accessToken; } catch {}
    }
    return '';
  }
  function maskedEmail(t) {
    try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, String.fromCharCode(47)))); const e = String(p.email || ''); const [u, d] = e.split('@'); return u && d ? `${u.slice(0, 2)}***@${d}` : ''; } catch { return ''; }
  }
  function loginBox(text) {
    const u = new URL(`${ORIGIN}/auth/`); u.searchParams.set('return_to', location.href);
    return el('div', { className: 'ws-empty' }, el('p', { textContent: text }), el('a', { className: 'button primary', href: u.href, textContent: '에코디 계정으로 로그인' }));
  }
  function notice(text, retry) {
    const box = el('div', { className: 'ws-empty' }, el('p', { textContent: text }));
    if (retry) { const b = el('button', { type: 'button', className: 'button', textContent: '다시 시도' }); b.addEventListener('click', retry); box.append(b); }
    return box;
  }
  async function getJson(url, opts = {}, ms = 9000) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { cache: 'no-store', ...opts, signal: c.signal }); const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.code || `HTTP_${r.status}`), { status: r.status }); return d; }
    finally { clearTimeout(t); }
  }
  function projects() {
    const t = token();
    if (!t) return Promise.resolve({ login: true });
    projectsPromise ??= getJson(`${WORKFLOW}/projects`, { headers: { authorization: `Bearer ${t}` } })
      .then(d => ({ list: d.projects || [], role: d.role || 'author' }))
      .catch(e => { projectsPromise = null; return { error: e }; });
    return projectsPromise;
  }
  const errText = e => e?.status === 401 ? '로그인이 만료되었습니다. 다시 로그인해 주세요.'
    : e?.status === 503 ? '출판 원장이 점검 중입니다. 잠시 후 다시 시도해 주세요.'
    : '원고 목록을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.';

  const render = {
    async mine(p) {
      const r = await projects();
      if (r.login) return p.replaceChildren(loginBox('내 원고와 프로젝트는 본인만 볼 수 있습니다. 로그인하면 이어서 작업할 수 있습니다.'));
      if (r.error) return p.replaceChildren(notice(errText(r.error), () => { loaded.delete('mine'); show('mine'); }));
      const who = maskedEmail(token());
      const head = el('div', { className: 'ws-head' }, el('p', { textContent: `${who ? `${who} · ` : ''}${r.role === 'author' ? '저자' : '출판 편집 권한'} · 프로젝트 ${r.list.length}개` }),
        el('a', { className: 'button primary', href: `${ORIGIN}/publishing/human/manage/`, textContent: '새 프로젝트 · 원고 관리' }));
      if (!r.list.length) return p.replaceChildren(head, notice('아직 프로젝트가 없습니다. 원고 관리에서 첫 책을 시작해 보세요.'));
      const list = el('ul', { className: 'ws-list' });
      for (const x of r.list) list.append(el('li', {}, el('strong', { textContent: x.title }), el('span', { className: 'ws-stage', textContent: LABELS[x.stage] || x.stage }), el('small', { textContent: `수정 ${String(x.updatedAt || '').slice(0, 10)}` })));
      p.replaceChildren(head, list);
    },
    write(p) {
      p.replaceChildren(el('div', { className: 'ws-cards' },
        card('휴먼출판 집필실', '17개 분야 × 8단계 전문 집필 코칭. 무료회원도 비공개 원고를 쓰고 저장·내보내기할 수 있습니다.', `${ORIGIN}/publishing/human/`, '집필 코칭 열기'),
        card('창작 스튜디오', '아이디어 발굴과 여러 형태의 창작을 돕는 Creator AI 작업공간입니다. 출판 계약·발행 승인은 출판이 맡습니다.', `${ORIGIN}/author/`, '창작 스튜디오 열기'),
        card('원고 관리', '프로젝트 생성, 원고 버전, 검수 요청, 저자 승인까지 단계별로 기록합니다.', `${ORIGIN}/publishing/human/manage/`, '원고 관리 열기')));
    },
    async progress(p) {
      const r = await projects();
      if (r.login) return p.replaceChildren(loginBox('편집·제작·심사 현황은 로그인한 저자와 편집자에게만 보입니다.'));
      if (r.error) return p.replaceChildren(notice(errText(r.error), () => { loaded.delete('progress'); show('progress'); }));
      const board = el('div', { className: 'ws-board' });
      for (const [label, stages] of GROUPS) {
        const items = r.list.filter(x => stages.includes(x.stage));
        const col = el('section', {}, el('h3', { textContent: `${label} · ${items.length}` }));
        const ul = el('ul'); for (const x of items) ul.append(el('li', { textContent: `${x.title} — ${LABELS[x.stage] || x.stage}` }));
        if (!items.length) ul.append(el('li', { className: 'muted', textContent: '없음' }));
        col.append(ul); board.append(col);
      }
      p.replaceChildren(board, el('p', { className: 'ws-note', textContent: '저자와 출판사 양쪽 승인, 판본 지문(SHA-256)이 모두 확인된 책만 출간 예약과 판매 인계로 넘어갑니다.' }));
    },
    async editions(p) { await catalogPanel(p, 'editions'); },
    async channels(p) { await catalogPanel(p, 'channels'); },
    royalty(p) {
      p.replaceChildren(el('div', { className: 'ws-cards' },
        card('인세는 계약으로만 정합니다', '구독료와 인세·판매수수료는 섞지 않습니다. 저작권·유통·인세 계약이 서명된 책에만 인세율과 정산 원장이 열립니다.'),
        card('정산 내역', '서명된 출판 계약이 있는 책의 판매·환불·수수료가 저자별 원장에 기록되면 이곳에 표시됩니다. 현재 공개된 정산 내역은 없습니다.'),
        card('문의', '계약·정산 관련 문의는 ekodibiz@gmail.com 으로 보내 주세요.', 'mailto:ekodibiz@gmail.com', '메일 보내기')));
    },
    support(p) {
      p.replaceChildren(el('div', { className: 'ws-cards' },
        card('출판상담 신청', '원고 상태와 목표를 남기면 가장 작은 다음 단계를 제안합니다.', '#consultation', '상담 신청서로 이동'),
        card('제작·대행 안내', 'EPUB·인쇄용 PDF·표지·서지 등록 범위와 요금을 확인하세요.', `${ORIGIN}/publishing/production/`, '제작·대행 보기'),
        card('메일 문의', '운영 에코디비즈 · ekodibiz@gmail.com', 'mailto:ekodibiz@gmail.com', '메일 보내기')));
    },
  };
  function card(title, text, href, cta) {
    const c = el('article', { className: 'ws-card' }, el('h3', { textContent: title }), el('p', { textContent: text }));
    if (href) c.append(el('a', { className: 'button', href, textContent: cta || '열기' }));
    return c;
  }
  let catalogPromise = null;
  async function catalogPanel(p, mode) {
    catalogPromise ??= getJson(CATALOG).catch(e => { catalogPromise = null; throw e; });
    let books;
    try { const d = await catalogPromise; books = Array.isArray(d) ? d : d.books || []; }
    catch { return p.replaceChildren(notice('도서 목록을 불러오지 못했습니다.', () => { loaded.delete(mode); show(mode); })); }
    const table = el('div', { className: 'ws-table' });
    for (const b of books) {
      const row = el('article', { className: 'ws-book' }, el('h3', { textContent: b.title }), el('p', { className: 'muted', textContent: [b.subtitle, b.author].filter(Boolean).join(' · ') }));
      if (mode === 'editions') {
        const fmt = b.directSale?.format || (Array.isArray(b.format) ? b.format.join(', ') : b.format || '');
        row.append(el('ul', {}, ...[`정가 ${b.listPrice?.label || '-'}`, `판본 ${fmt || '-'}`, `ISBN ${b.identifiers?.isbnEbook || '미발급'}`, `에코디서점 ${b.directSale?.enabled ? '직접 판매 중' : '판매 준비 중'}`].map(t => el('li', { textContent: t }))));
        row.append(el('a', { className: 'button', href: `${ORIGIN}/books/buy/?book=${encodeURIComponent(b.id)}`, textContent: '서점 판매 페이지' }));
      } else {
        const ed = Object.values(b.editions || {});
        const items = [`에코디서점 직접 판매 · ${b.directSale?.enabled ? '판매 중' : '준비 중'}`, `에코디몰 책·배움 · ${b.directSale?.enabled ? '연동' : '준비 중'}`, ...ed.map(e => `${e.provider || e.title || '외부 채널'} · ${e.status || '-'}`)];
        row.append(el('ul', {}, ...items.map(t => el('li', { textContent: t }))));
      }
      table.append(row);
    }
    if (!books.length) table.append(notice('공개된 도서가 없습니다.'));
    p.replaceChildren(table);
  }
  async function show(id, focus = false) {
    if (!render[id]) id = 'mine';
    for (const t of tabs) { const on = t.dataset.tab === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); }
    for (const p of panels) p.hidden = p.id !== `ws-${id}`;
    const panel = document.getElementById(`ws-${id}`);
    if (!loaded.has(id)) { loaded.add(id); panel.replaceChildren(el('p', { className: 'muted', textContent: '불러오는 중…' })); try { await render[id](panel); } catch { loaded.delete(id); panel.replaceChildren(notice('화면을 불러오지 못했습니다.', () => show(id))); } }
  }
  root.querySelector('[role="tablist"]').addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (!t) return; history.replaceState(null, '', `#ws-${t.dataset.tab}`); show(t.dataset.tab); });
  root.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement); if (i < 0 || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; history.replaceState(null, '', `#ws-${n.dataset.tab}`); show(n.dataset.tab, true); e.preventDefault();
  });
  const fromHash = (location.hash.match(/^#ws-([a-z]+)$/) || [])[1];
  show(fromHash || 'mine');
  if (fromHash) root.scrollIntoView();
})();
