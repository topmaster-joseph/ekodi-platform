// PUBLISHING-ADMIN-001 (§12): 출판 관리자. 메뉴마다 독립 주소(/publishing/admin/<section>)를 가지며
// 직접 진입·새로고침·로그인 복귀가 같은 화면으로 돌아온다. 권한은 서버(출판 원장 역할)가 판단하고,
// 이 화면은 읽기 전용이다. 승인·반려 같은 변경은 원고 관리 화면의 서버 검증 경로로만 한다.
(() => {
  'use strict';
  const ORIGIN = 'https://ekodi.kr';
  const ADMIN = `${ORIGIN}/publishing/admin`;
  const API = `${ORIGIN}/publishing/api/workflow`;
  const view = document.getElementById('view');
  const who = document.getElementById('who');
  const LABELS = { planning: '기획', drafting: '집필 중', in_review: '편집 검수', changes_requested: '수정 요청',
    ready_for_author: '저자 승인 대기', author_approved: '저자 승인 완료', publisher_approved: '발행 승인 완료',
    scheduled: '출간 예약', handoff_ready: '판매 인계 대기', released: '판매 중',
    draft: '초안', signed: '서명 완료', revoked: '철회', preparing: '제작 중', under_review: '청취 검수 중', approved: '승인', editor: '편집자', publisher: '발행인', admin: '출판 관리자' };
  const L = k => LABELS[k] || k;
  const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); for (const k of kids) n.append(k); return n; };
  const SECTIONS = ['overview', 'review', 'contracts', 'channels', 'settlement', 'audit', 'roles'];
  let summary = null;

  function token() {
    for (const key of ['sb-renzehysxirjilvdxacv-auth-token', 'ekodi-books-buyer-session']) {
      try { const x = JSON.parse(localStorage.getItem(key) || 'null'); const v = x?.currentSession || x?.session || x; if (v?.access_token) return v.access_token; if (v?.accessToken) return v.accessToken; } catch {}
    }
    return '';
  }
  async function api(rel) {
    const t = token();
    if (!t) throw Object.assign(new Error('LOGIN_REQUIRED'), { status: 401 });
    const c = new AbortController(); const timer = setTimeout(() => c.abort(), 9000);
    try {
      const r = await fetch(`${API}/${rel}`, { headers: { authorization: `Bearer ${t}` }, cache: 'no-store', signal: c.signal });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(d.code || `HTTP_${r.status}`), { status: r.status, code: d.code });
      return d;
    } finally { clearTimeout(timer); }
  }
  function sectionFromPath() {
    const m = location.pathname.match(/admin\/([a-z]+)\/?$/);
    return m && SECTIONS.includes(m[1]) ? m[1] : 'overview';
  }
  function gate(e) {
    if (e.status === 401) {
      const u = new URL(`${ORIGIN}/auth/`); u.searchParams.set('return_to', location.href);
      who.textContent = '로그인이 필요합니다.';
      return el('div', { className: 'padmin-empty' }, el('p', { textContent: '출판 관리자는 에코디 계정으로 로그인한 출판 편집 권한자만 볼 수 있습니다.' }), el('a', { className: 'button primary', href: u.href, textContent: '에코디 계정으로 로그인' }));
    }
    if (e.status === 403) { who.textContent = '출판 편집 권한이 없는 계정입니다.'; return el('div', { className: 'padmin-empty' }, el('p', { textContent: '이 계정에는 출판 편집·발행 권한이 없습니다. 권한은 출판 관리자가 서버 원장에서 부여합니다.' })); }
    if (e.status === 503) return retry('출판 원장이 점검 중입니다.');
    return retry('불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
  }
  function retry(text) { const b = el('button', { type: 'button', className: 'button', textContent: '다시 시도' }); b.addEventListener('click', () => { summary = null; show(sectionFromPath()); }); return el('div', { className: 'padmin-empty' }, el('p', { textContent: text }), b); }
  const stat = (label, n) => el('div', { className: 'padmin-stat' }, el('strong', { textContent: String(n ?? 0) }), el('span', { textContent: label }));
  const table = (heads, rows) => { const t = el('table'); t.append(el('thead', {}, el('tr', {}, ...heads.map(h => el('th', { scope: 'col', textContent: h }))))); const b = el('tbody'); for (const r of rows) b.append(el('tr', {}, ...r.map(c => el('td', { textContent: c })))); if (!rows.length) b.append(el('tr', {}, el('td', { colSpan: heads.length, className: 'muted', textContent: '기록 없음' }))); t.append(b); return el('div', { className: 'padmin-table' }, t); };
  const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  async function getSummary() { summary ??= await api('admin/summary'); who.textContent = `권한: ${L(summary.role)} · 판매 활성화는 Human Gate(자동 개통 없음)`; return summary; }

  const render = {
    async overview() {
      const s = await getSummary();
      return [el('div', { className: 'padmin-stats' }, stat('전체 프로젝트', sum(s.stages)), stat('심사·승인 대기', s.review.length), stat('서명된 계약', s.contracts.signed || 0), stat('오디오 승인', s.audioQa.approved || 0), stat('편집 권한자', sum(s.roles))),
        el('h2', { textContent: '단계별 현황' }), table(['단계', '건수'], Object.entries(s.stages).map(([k, n]) => [L(k), String(n)])),
        el('h2', { textContent: '최근 변경' }), table(['시각', '도서', '변경', '작업자'], s.recent.map(a => [String(a.at).slice(0, 16).replace('T', ' '), a.title, `${L(a.from || '-')} → ${L(a.to || '-')} (${a.action})`, a.actor]))];
    },
    async review() {
      const s = await getSummary();
      return [el('p', { className: 'muted', textContent: '승인·반려는 원고 관리 화면에서 판본 지문과 함께 서버가 검증합니다.' }),
        table(['도서', '단계', '최근 수정'], s.review.map(x => [x.title, L(x.stage), String(x.updatedAt).slice(0, 10)])),
        el('a', { className: 'button primary', href: `${ORIGIN}/publishing/human/manage/`, textContent: '원고 관리에서 심사하기' })];
    },
    async contracts() {
      const s = await getSummary();
      return [el('div', { className: 'padmin-stats' }, stat('계약 초안', s.contracts.draft || 0), stat('서명 완료', s.contracts.signed || 0), stat('철회', s.contracts.revoked || 0), stat('오디오 청취 검수 중', s.audioQa.under_review || 0), stat('오디오 승인', s.audioQa.approved || 0)),
        el('p', { className: 'muted', textContent: '계약이 서명되지 않은 책에는 인세율·수수료를 부여하지 않고, 사람이 듣고 승인한 오디오북이 없으면 판매 완료로 전환하지 않습니다.' })];
    },
    async channels() {
      const c = new AbortController(); const timer = setTimeout(() => c.abort(), 9000);
      let books = [];
      try { const r = await fetch(`${ORIGIN}/books/books.json`, { cache: 'no-store', signal: c.signal }); const d = await r.json(); books = Array.isArray(d) ? d : d.books || []; } catch { return retry('도서 목록을 불러오지 못했습니다.'); } finally { clearTimeout(timer); }
      return [table(['도서', 'ISBN(전자책)', '에코디서점', '외부 채널'], books.map(b => [b.title, b.identifiers?.isbnEbook || '미발급', b.directSale?.enabled ? '직접 판매' : '준비 중', Object.values(b.editions || {}).map(e => `${e.provider || e.title || '채널'}: ${e.status || '-'}`).join(' / ') || '-']))];
    },
    async settlement() {
      await getSummary();
      return [el('div', { className: 'padmin-empty' }, el('p', { textContent: '도서별 결제·인세·정산은 서명된 출판 계약이 있는 책부터 저자별 원장으로 표시됩니다. 구독료와 인세·판매수수료는 섞지 않습니다.' }),
        el('a', { className: 'button', href: `${ORIGIN}/admin/books#books`, textContent: '서점 주문·매출 원장(통합 관리자)' }))];
    },
    async audit() {
      const d = await api('admin/audit');
      return [el('p', { className: 'muted', textContent: '모든 단계 변경은 수정 번호와 함께 기록됩니다. 작업자 식별자는 일부만 표시합니다.' }),
        table(['시각', '도서', '변경', '수정', '작업자'], d.events.map(a => [String(a.at).slice(0, 16).replace('T', ' '), a.title, `${L(a.from || '-')} → ${L(a.to || '-')} (${a.action})`, String(a.revision), a.actor]))];
    },
    async roles() {
      const d = await api('admin/roles');
      return [table(['계정', '권한', '부여일'], d.roles.map(x => [x.user, L(x.role), String(x.grantedAt).slice(0, 10)])),
        el('p', { className: 'muted', textContent: '권한 부여·회수는 출판 관리자 권한과 감사 기록이 있는 서버 경로에서만 합니다. 이메일 문자열이나 화면 상태만으로는 권한이 생기지 않습니다.' })];
    },
  };
  async function show(id) {
    for (const a of document.querySelectorAll('.padmin-nav a')) a.toggleAttribute('aria-current', a.dataset.section === id);
    view.replaceChildren(el('p', { className: 'muted', textContent: '불러오는 중…' }));
    try { view.replaceChildren(...await render[id]()); } catch (e) { view.replaceChildren(gate(e)); }
  }
  document.querySelector('.padmin-nav').addEventListener('click', e => {
    const a = e.target.closest('a[data-section]'); if (!a) return;
    if (location.origin !== ORIGIN) return; // 다른 호스트에서는 정식 주소로 이동
    e.preventDefault(); history.pushState(null, '', a.href); show(a.dataset.section);
  });
  addEventListener('popstate', () => show(sectionFromPath()));
  show(sectionFromPath());
})();
