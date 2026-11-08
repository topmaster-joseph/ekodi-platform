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
  // 기록 화면의 작업 이름(영문 코드 → 우리말). 모르는 코드는 그대로 보이되 화면을 깨지 않는다.
  const ACTIONS = { create: '기획 등록', submit: '검수 요청', publisher_approve: '발행 승인', prepare_handoff: '판매 인계 준비', evidence_recorded: '근거 기록',
    release_receipt: '출간 영수증', ai_job_queued: 'AI 작업 접수', ai_collab_ebook: 'AI 협업 전자책',
    ai_chapter_quality_polished: 'AI 원고 자동 다듬기', ai_chapters_reset_for_rewrite: 'AI 원고 다시 쓰기', ai_chapter_edited: 'AI 원고 수정 저장',
    ai_book_author_reviewed: 'AI 원고 감수 완료', ai_book_handoff_requested: '서점 출판 인계',
    role_bootstrap_granted: '최초 관리자 지정', role_invited: '권한 초대', role_invite_claimed: '초대 수락', role_invite_cancelled: '초대 취소', role_revoked: '권한 회수' };
  const A = k => ACTIONS[k] || String(k || '').replaceAll('_', ' ');
  const change = a => a.from ? `${L(a.from)} → ${L(a.to || '-')} · ${A(a.action)}` : (a.to && a.action !== 'create' ? `${A(a.action)} → ${L(a.to)}` : A(a.action));
  const when = at => { const d = new Date(at); return isNaN(d) ? String(at || '').slice(0, 16) : d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); Object.assign(n, props); for (const k of kids) n.append(k); return n; };
  const SECTIONS = ['overview', 'review', 'ai', 'contracts', 'channels', 'settlement', 'audit', 'roles'];
  let summary = null;

  function token() {
    for (const key of ['sb-renzehysxirjilvdxacv-auth-token', 'ekodi-books-buyer-session']) {
      try { const x = JSON.parse(localStorage.getItem(key) || 'null'); const v = x?.currentSession || x?.session || x; if (v?.access_token) return v.access_token; if (v?.accessToken) return v.accessToken; } catch {}
    }
    return '';
  }
  async function api(rel, body, method = 'POST') {
    const t = token();
    if (!t) throw Object.assign(new Error('LOGIN_REQUIRED'), { status: 401 });
    const c = new AbortController(); const timer = setTimeout(() => c.abort(), 9000);
    try {
      const init = { headers: { authorization: `Bearer ${t}` }, cache: 'no-store', signal: c.signal };
      if (body) Object.assign(init, { method, body: JSON.stringify(body), headers: { ...init.headers, 'content-type': 'application/json' } });
      const r = await fetch(`${API}/${rel}`, init);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(d.code || `HTTP_${r.status}`), { status: r.status, code: d.code });
      return d;
    } finally { clearTimeout(timer); }
  }
  function sectionFromPath() {
    const m = location.pathname.match(/admin\/([a-z]+)\/?$/);
    if (m && SECTIONS.includes(m[1])) return m[1];
    const h = location.hash.replace(/^#/, ''); // 예전 링크(/publishing/admin/#ai)도 같은 화면으로
    return SECTIONS.includes(h) ? h : 'overview';
  }
  function gate(e) {
    if (e.status === 401) {
      const u = new URL(`${ORIGIN}/auth/`); u.searchParams.set('site', 'publishing'); u.searchParams.set('return_to', location.href); // site 없으면 로그인 뒤 첫 화면으로 감
      who.textContent = '로그인이 필요합니다.';
      return el('div', { className: 'padmin-empty' }, el('p', { textContent: '출판 관리자는 에코디 계정으로 로그인한 출판 편집 권한자만 볼 수 있습니다.' }), el('a', { className: 'button primary', href: u.href, textContent: '에코디 계정으로 로그인' }));
    }
    if (e.status === 403) { who.textContent = '출판 편집 권한이 없는 계정입니다.'; return el('div', { className: 'padmin-empty' }, el('p', { textContent: '이 계정에는 출판 편집·발행 권한이 없습니다. 권한은 출판 관리자가 서버 원장에서 부여합니다.' })); }
    if (e.status === 503) return retry('출판 원장이 점검 중입니다.');
    return retry('불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
  }
  function retry(text) { const b = el('button', { type: 'button', className: 'button', textContent: '다시 시도' }); b.addEventListener('click', () => { summary = null; show(sectionFromPath()); }); return el('div', { className: 'padmin-empty' }, el('p', { textContent: text }), b); }
  const stat = (label, n, section) => { const kids = [el('strong', { textContent: String(n ?? 0) }), el('span', { textContent: label })];
    if (!section) return el('div', { className: 'padmin-stat' }, ...kids);
    const a = el('a', { className: 'padmin-stat padmin-stat-link', href: `${ADMIN}/${section}` }, ...kids); a.dataset.section = section; return a; };
  const table = (heads, rows) => { const t = el('table'); t.append(el('thead', {}, el('tr', {}, ...heads.map(h => el('th', { scope: 'col', textContent: h }))))); const b = el('tbody'); for (const r of rows) b.append(el('tr', {}, ...r.map(c => c instanceof Node ? el('td', {}, c) : el('td', { textContent: c })))); if (!rows.length) b.append(el('tr', {}, el('td', { colSpan: heads.length, className: 'muted', textContent: '기록 없음' }))); t.append(b); return el('div', { className: 'padmin-table' }, t); };
  const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  async function getSummary() { summary ??= await api('admin/summary'); who.textContent = `권한: ${L(summary.role)} · 판매 활성화는 Human Gate(자동 개통 없음)`; return summary; }

  const render = {
    async overview() {
      const s = await getSummary();
      return [el('div', { className: 'padmin-stats' }, stat('AI 원고 감수 대기', s.aiBooks?.author_review || 0, 'ai'), stat('AI 원고 집필 중', s.aiBooks?.drafting || 0, 'ai'), stat('전체 프로젝트', sum(s.stages)), stat('심사·승인 대기', s.review.length, 'review'), stat('서명된 계약', s.contracts.signed || 0), stat('오디오 승인', s.audioQa.approved || 0), stat('편집 권한자', sum(s.roles))),
        el('h2', { textContent: '단계별 현황' }), table(['단계', '건수'], Object.entries(s.stages).map(([k, n]) => [L(k), String(n)])),
        el('h2', { textContent: '최근 변경' }), table(['시각', '도서', '변경', '작업자'], s.recent.map(a => [when(a.at), a.title || '-', change(a), a.actor]))];
    },
    async review() {
      const s = await getSummary();
      return [el('p', { className: 'muted', textContent: '승인·반려는 원고 관리 화면에서 판본 지문과 함께 서버가 검증합니다.' }),
        table(['도서', '단계', '최근 수정'], s.review.map(x => [x.title, L(x.stage), String(x.updatedAt).slice(0, 10)])),
        el('a', { className: 'button primary', href: `${ORIGIN}/publishing/human/manage/`, textContent: '원고 관리에서 심사하기' })];
    },
    // PUBLISHING-AI-WEEKLY-001: 주 1권 AI 협업 초안 — 읽고 고친 뒤 '감수 완료'. [확인필요]·[본문확인] 표시가 남아 있으면 완료되지 않는다.
    async ai() {
      const d = await api('admin/ai-books');
      const out = [el('p', { className: 'muted', textContent: `무료 AI 한도 오늘 사용 ${d.budget.usedToday} / ${d.budget.dailyCap} · 유료 호출 없음 · 모든 책에 'AI 협업 초안 · 저자 감수' 표기` })];
      const openable = b => b.status !== 'drafting' || b.done > 0;
      const titleCell = b => {
        const cell = el('span', { className: 'padmin-titlecell' }, el('span', { textContent: b.title }));
        if (openable(b)) {
          const open = el('button', { type: 'button', className: 'button small', textContent: '원고 열기', ariaLabel: `「${b.title}」 원고 열기` });
          open.addEventListener('click', async () => { view.replaceChildren(...await aiBook(b.id)); });
          cell.append(open);
        }
        return cell;
      };
      out.push(table(['책', '분야', '진행', '상태'], d.books.map(b => [titleCell(b), b.meta?.genre || b.genre, `${b.done}/${b.total}장`, ({ drafting: '초안 쓰는 중', author_review: '저자 감수 대기', approved: '감수 완료', discarded: '보류' })[b.status] || b.status])));
      if (!d.books.length) out.push(el('p', { className: 'muted', textContent: '첫 원고는 다음 예약 시간(매일 새벽 3시 37분)에 기획을 시작합니다.' }));
      return out;
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
        table(['시각', '도서', '변경', '수정', '작업자'], d.events.map(a => [when(a.at), a.title || '-', change(a), String(a.revision), a.actor]))];
    },
    async roles() { return rolesView(await api('admin/roles')); },
  };
  const ERR = { CANNOT_CHANGE_SELF: '자기 자신의 권한은 바꿀 수 없습니다.', LAST_ADMIN: '마지막 출판 관리자는 회수할 수 없습니다.', INVALID_INVITE: '이메일과 권한을 확인해 주세요.' };
  function rolesView(d) {
    const msg = el('p', { className: 'muted', role: 'status' });
    const act = async (body, ask) => {
      if (ask && !confirm(ask)) return;
      msg.textContent = '처리 중…';
      try { const r = await api('admin/roles', body); view.replaceChildren(...rolesView(r)); }
      catch (e) { if (e.status === 401 || e.status === 403) view.replaceChildren(gate(e)); else msg.textContent = ERR[e.code] || '처리하지 못했습니다. 다시 시도해 주세요.'; }
    };
    const form = el('form', { className: 'padmin-form' });
    const email = el('input', { type: 'email', required: true, placeholder: '초대할 에코디 계정 이메일', autocomplete: 'off' });
    const pick = el('select', {}, ...['editor', 'publisher', 'admin'].map(v => el('option', { value: v, textContent: L(v) })));
    form.append(email, pick, el('button', { type: 'submit', className: 'button primary', textContent: '권한 초대' }));
    form.addEventListener('submit', e => { e.preventDefault(); act({ action: 'invite', email: email.value, role: pick.value }); });
    const roleRows = el('tbody');
    for (const x of d.roles) {
      const b = el('button', { type: 'button', className: 'button', textContent: '회수' });
      b.addEventListener('click', () => act({ action: 'revoke', ref: x.ref }, `${x.user} 계정의 ${L(x.role)} 권한을 회수할까요?`));
      roleRows.append(el('tr', {}, el('td', { textContent: x.user }), el('td', { textContent: L(x.role) }), el('td', { textContent: String(x.grantedAt).slice(0, 10) }), el('td', {}, b)));
    }
    if (!d.roles.length) roleRows.append(el('tr', {}, el('td', { colSpan: 4, className: 'muted', textContent: '기록 없음' })));
    const roleTable = el('div', { className: 'padmin-table' }, el('table', {}, el('thead', {}, el('tr', {}, ...['계정', '권한', '부여일', ''].map(h => el('th', { scope: 'col', textContent: h })))), roleRows));
    const invites = table(['초대 이메일', '권한', '초대일', '상태'], (d.invites || []).map(x => [x.email, L(x.role), String(x.invitedAt).slice(0, 10), x.claimedAt ? '수락' : '대기']));
    return [el('h2', { textContent: '권한 초대' }), form, msg,
      el('p', { className: 'muted', textContent: '초대받은 사람이 같은 이메일로 인증된 에코디 계정에 로그인하면 서버가 이메일을 확인한 뒤 권한을 부여합니다. 모든 초대·수락·회수는 감사 기록에 남습니다.' }),
      el('h2', { textContent: '현재 권한자' }), roleTable, el('h2', { textContent: '초대 내역' }), invites];
  }
  // PUBLISHING-AI-READER-001: 검수 화면을 실제 전자책처럼 — 표지·목차·장 넘김·글자 크기, [확인필요] 표시는 눈에 띄게.
  const MARK_RE = /(\[확인필요\]|\[본문확인\])/;
  function inline(text) {
    const out = [];
    for (const part of String(text).split(/(\*\*[^*]+\*\*|\[확인필요\]|\[본문확인\])/)) {
      if (!part) continue;
      if (MARK_RE.test(part) && /^\[(확인필요|본문확인)\]$/.test(part)) out.push(el('mark', { className: 'rd-flag', textContent: part }));
      else if (/^\*\*[^*]+\*\*$/.test(part)) out.push(el('strong', { textContent: part.slice(2, -2) }));
      else out.push(part);
    }
    return out;
  }
  function readerBlocks(body) {
    const nodes = [];
    // 인용(>) 줄이 문단 안에 붙어 있어도 따로 떼어 인용 상자로 보이게 한다(EPUB 변환과 같은 규칙).
    const src = String(body || '').replace(/\r/g, '').replace(/([^\n])\n(?=>)/g, '$1\n\n').replace(/(^|\n)(>[^\n]*)\n(?=[^>\n])/g, '$1$2\n\n');
    for (const block of src.split(/\n{2,}/)) {
      const t = block.trim(); if (!t) continue;
      const lines = t.split('\n');
      if (/^#{1,4}\s/.test(t) && lines.length === 1) { nodes.push(el('h3', { className: 'rd-h' }, ...inline(t.replace(/^#+\s*/, '')))); continue; }
      if (lines.every(l => /^>\s?/.test(l))) { nodes.push(el('aside', { className: 'rd-note' }, ...inline(lines.map(l => l.replace(/^>\s?/, '')).join(' ')))); continue; }
      if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        const ol = /^\s*\d/.test(lines[0]);
        nodes.push(el(ol ? 'ol' : 'ul', { className: 'rd-list' }, ...lines.map(l => el('li', {}, ...inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))))));
        continue;
      }
      const head = lines[0]; const rest = lines.slice(1);
      if (rest.length && rest.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l)) && !/^#{1,4}\s/.test(head)) {
        nodes.push(el('p', { className: 'rd-lead' }, ...inline(head)));
        nodes.push(el(/^\s*\d/.test(rest[0]) ? 'ol' : 'ul', { className: 'rd-list' }, ...rest.map(l => el('li', {}, ...inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))))));
        continue;
      }
      if (/^#{1,4}\s/.test(head)) { nodes.push(el('h3', { className: 'rd-h' }, ...inline(head.replace(/^#+\s*/, '')))); if (rest.length) nodes.push(el('p', {}, ...inline(rest.join(' ')))); continue; }
      nodes.push(el('p', {}, ...inline(lines.join(' '))));
    }
    return nodes;
  }
  // 삽화가 깨지면(빈 응답·손상된 데이터) 깨진 그림 대신 그 자리를 숨긴다.
  function figImg(r, title) {
    const img = el('img', { alt: `${title} 삽화`, decoding: 'async' });
    const hide = () => { const f = img.closest('figure'); if (f) f.hidden = true; else img.remove(); };
    img.addEventListener('error', hide, { once: true });
    if (r && r.data) img.src = `data:${r.mime || 'image/jpeg'};base64,${r.data}`; else queueMicrotask(hide);
    return img;
  }
  function ebookReader(d, getChapter, onEdit) {
    const pages = [{ kind: 'cover' }, { kind: 'toc' }, ...d.chapters.map(c => ({ kind: 'ch', number: c.number }))];
    let at = 0; let size = 1;
    try { size = Number(localStorage.getItem('padmin-reader-size')) || 1; } catch {}
    const page = el('article', { className: 'rd-page', tabIndex: 0 });
    const pos = el('span', { className: 'rd-pos' });
    const flags = el('span', { className: 'rd-flags' });
    const prev = el('button', { type: 'button', className: 'rd-btn', textContent: '‹ 이전' });
    const next = el('button', { type: 'button', className: 'rd-btn', textContent: '다음 ›' });
    const smaller = el('button', { type: 'button', className: 'rd-btn', textContent: '가-', ariaLabel: '글자 작게' });
    const bigger = el('button', { type: 'button', className: 'rd-btn', textContent: '가+', ariaLabel: '글자 크게' });
    const edit = el('button', { type: 'button', className: 'rd-btn rd-edit', textContent: '이 장 고치기' });
    const device = el('div', { className: 'rd-device' }, page);
    const bar = el('div', { className: 'rd-bar' }, prev, pos, next, el('span', { className: 'rd-gap' }), flags, smaller, bigger, edit);
    const countFlags = () => d.chapters.reduce((n, c) => n + ((getChapter(c.number).body.match(/\[확인필요\]|\[본문확인\]/g) || []).length), 0);
    function draw() {
      const p = pages[at];
      device.style.setProperty('--rd-scale', String(size));
      page.replaceChildren();
      if (p.kind === 'cover') {
        page.append(el('div', { className: 'rd-cover' },
          el('p', { className: 'rd-series', textContent: 'EKODI AI 협업' }),
          el('h1', { textContent: d.book.title }),
          el('p', { className: 'rd-sub', textContent: d.book.meta.subtitle || '' }),
          el('p', { className: 'rd-author', textContent: d.book.meta.author || '' }),
          el('p', { className: 'rd-disc', textContent: d.book.meta.disclosure || 'AI 협업 초안 · 저자 감수' })));
      } else if (p.kind === 'toc') {
        const ol = el('ol', { className: 'rd-toc' });
        d.chapters.forEach((c, i) => { const a = el('button', { type: 'button', textContent: `${c.number}. ${getChapter(c.number).title}` }); a.addEventListener('click', () => { at = i + 2; draw(); }); ol.append(el('li', {}, a)); });
        page.append(el('h2', { className: 'rd-ch-title', textContent: '차례' }), ol);
      } else {
        const c = getChapter(p.number);
        page.append(el('p', { className: 'rd-ch-no', textContent: `${p.number}장` }), el('h2', { className: 'rd-ch-title', textContent: c.title }));
        const fig = el('figure', { className: 'rd-fig' });
        api(`admin/ai-books/${d.book.id}/images/${p.number}`).then(r => { if (pages[at] === p) fig.append(figImg(r, c.title)); }).catch(() => {});
        page.append(fig, ...(c.body.trim() ? readerBlocks(c.body) : [el('p', { className: 'rd-empty', textContent: '아직 쓰지 않은 장입니다.' })]));
      }
      pos.textContent = p.kind === 'cover' ? '표지' : p.kind === 'toc' ? '차례' : `${p.number} / ${d.chapters.length}장`;
      const n = countFlags(); flags.textContent = n ? `확인 표시 ${n}곳` : '확인 표시 없음'; flags.classList.toggle('rd-flags-on', n > 0);
      prev.disabled = at === 0; next.disabled = at === pages.length - 1; edit.hidden = p.kind !== 'ch';
      page.scrollTop = 0;
    }
    prev.addEventListener('click', () => { if (at > 0) { at--; draw(); } });
    next.addEventListener('click', () => { if (at < pages.length - 1) { at++; draw(); } });
    const setSize = v => { size = Math.min(1.4, Math.max(0.85, Math.round(v * 100) / 100)); try { localStorage.setItem('padmin-reader-size', String(size)); } catch {} draw(); };
    smaller.addEventListener('click', () => setSize(size - 0.1));
    bigger.addEventListener('click', () => setSize(size + 0.1));
    edit.addEventListener('click', () => { const p = pages[at]; if (p.kind === 'ch') onEdit(p.number); });
    page.addEventListener('keydown', e => { if (e.key === 'ArrowRight') next.click(); if (e.key === 'ArrowLeft') prev.click(); });
    draw();
    return { node: el('section', { className: 'rd' }, bar, device), refresh: draw, goChapter(n) { const i = pages.findIndex(x => x.number === n); if (i >= 0) { at = i; draw(); } } };
  }
  async function aiBook(id) {
    const d = await api(`admin/ai-books/${id}`);
    const msg = el('p', { className: 'muted', role: 'status' });
    const parts = [el('h2', { textContent: d.book.title }), el('p', { className: 'muted', textContent: `${d.book.meta.subtitle || ''} · ${d.book.meta.genre || ''} · 저자 ${d.book.meta.author} · ${d.book.meta.disclosure}` })];
    const editors = new Map(); const editSections = [];
    for (const c of d.chapters) {
      const title = el('input', { type: 'text', value: c.title, className: 'padmin-ai-title' });
      const body = el('textarea', { value: c.body, rows: 14, className: 'padmin-ai-body' });
      const save = el('button', { type: 'button', className: 'button', textContent: `${c.number}장 저장` });
      save.addEventListener('click', async () => { msg.textContent = '저장 중…'; try { await api(`admin/ai-books/${id}/chapters/${c.number}`, { title: title.value, body: body.value }, 'PUT'); msg.textContent = `${c.number}장을 저장했습니다.`; } catch (e) { msg.textContent = '저장하지 못했습니다.'; } });
      const fig = el('figure', { className: 'padmin-ai-fig' });
      api(`admin/ai-books/${id}/images/${c.number}`).then(r => fig.append(figImg(r, c.title))).catch(() => {});
      const sec = el('section', { className: 'padmin-ai-ch', id: `ai-ch-${c.number}` }, el('h3', { textContent: `${c.number}장 · ${({ pending: '아직 안 씀', drafted: 'AI 초안(편집 완료)', edited: '감수 중' })[c.status] || c.status}` }), fig, title, body, save);
      editors.set(c.number, { title, body }); editSections.push(sec);
      body.addEventListener('input', () => reader?.refresh()); title.addEventListener('input', () => reader?.refresh());
    }
    let reader = null;
    const getChapter = n => { const e = editors.get(n); return { title: e.title.value, body: e.body.value }; };
    const editWrap = el('div', { className: 'padmin-ai-edit', hidden: true }, ...editSections);
    const tabRead = el('button', { type: 'button', className: 'rd-tab', textContent: '전자책으로 보기', ariaPressed: 'true' });
    const tabEdit = el('button', { type: 'button', className: 'rd-tab', textContent: '원고 고치기', ariaPressed: 'false' });
    const mode = m => { const r = m === 'read'; reader.node.hidden = !r; editWrap.hidden = r; tabRead.setAttribute('aria-pressed', String(r)); tabEdit.setAttribute('aria-pressed', String(!r)); if (r) reader.refresh(); };
    reader = ebookReader(d, getChapter, n => { mode('edit'); document.getElementById(`ai-ch-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); editors.get(n)?.body.focus({ preventScroll: true }); });
    tabRead.addEventListener('click', () => mode('read')); tabEdit.addEventListener('click', () => mode('edit'));
    parts.push(el('div', { className: 'rd-tabs', role: 'group', ariaLabel: '검수 방식' }, tabRead, tabEdit), reader.node, editWrap);
    const approve = el('button', { type: 'button', className: 'button primary', textContent: '감수 완료' });
    approve.addEventListener('click', async () => {
      if (!confirm('모든 장을 읽고 고쳤고, [확인필요]·[본문확인] 표시를 모두 해결했습니까?')) return;
      try { const r = await api(`admin/ai-books/${id}/approve`, {}); msg.textContent = r.next; }
      catch (e) { msg.textContent = e.code === 'UNRESOLVED_MARKERS' ? '[확인필요]·[본문확인] 표시가 남아 있습니다. 확인 후 지워 주세요.' : e.code === 'CHAPTERS_INCOMPLETE' ? '아직 쓰지 않은 장이 있습니다.' : '처리하지 못했습니다.'; }
    });
    parts.push(approve);
    // PUBLISHING-AI-RELEASE-001: 최고관리자는 최종 검수 확인 한 번으로 출판(EPUB·서점 판매·자동 가격·저널 첫 글).
    const release = el('button', { type: 'button', className: 'button primary', textContent: '최종 검수 확인 · 출판' });
    release.addEventListener('click', async () => {
      if (!confirm('최종 검수를 확인하고 출판합니다.\n· 감수 안내 줄과 [확인필요] 표시는 출간본에서 빠집니다(원고 기록은 보존).\n· 가격은 분량·분야에 맞춰 자동으로 정해집니다.\n· 에코디서점 판매와 에코디저널 소개 글이 바로 시작됩니다.')) return;
      msg.textContent = '출판하는 중…';
      try { const r = await api(`admin/ai-books/${id}/release`, {}); msg.textContent = `출판 완료 · 판매가 ${r.price?.label || ''} · 에코디서점: ${r.storeUrl || ''}`; }
      catch (e) { msg.textContent = e.code === 'SUPER_ADMIN_ONLY' ? '최고관리자만 바로 출판할 수 있습니다. 감수 완료 후 출판 관리자에게 요청하세요.' : e.code === 'CHAPTERS_INCOMPLETE' ? '아직 쓰지 않은 장이 있습니다.' : '출판하지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
    });
    parts.push(release);
    if (d.book.status === 'approved') {
      // PUBLISHING-AI-EPUB-001: 감수 완료 → EPUB 내려받기 · 서점 출판 인계(판매는 서점 확정 전까지 닫힘)
      const dl = el('button', { type: 'button', className: 'button', textContent: 'EPUB 내려받기' });
      dl.addEventListener('click', async () => {
        msg.textContent = 'EPUB 만드는 중…';
        try {
          const r = await fetch(`${API}/admin/ai-books/${id}/epub`, { headers: { authorization: `Bearer ${token()}` }, cache: 'no-store' });
          if (!r.ok) throw new Error();
          const url = URL.createObjectURL(await r.blob()); const a = el('a', { href: url, download: `${d.book.title}.epub` }); document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 30000); msg.textContent = 'EPUB을 내려받았습니다.';
        } catch { msg.textContent = 'EPUB을 만들지 못했습니다.'; }
      });
      const pub = el('button', { type: 'button', className: 'button primary', textContent: '서점 출판으로 넘기기' });
      pub.addEventListener('click', async () => { try { const r = await api(`admin/ai-books/${id}/publish`, {}); msg.textContent = r.next; } catch { msg.textContent = '넘기지 못했습니다.'; } });
      parts.push(dl, pub);
    }
    parts.push(msg);
    return parts;
  }
  async function show(id) {
    for (const a of document.querySelectorAll('.padmin-nav a')) a.toggleAttribute('aria-current', a.dataset.section === id);
    view.replaceChildren(el('p', { className: 'muted', textContent: '불러오는 중…' }));
    try { view.replaceChildren(...await render[id]()); } catch (e) { view.replaceChildren(gate(e)); }
  }
  document.querySelector('.padmin').addEventListener('click', e => {
    const a = e.target.closest('a[data-section]'); if (!a) return;
    if (location.origin !== ORIGIN) return; // 다른 호스트에서는 정식 주소로 이동
    e.preventDefault(); history.pushState(null, '', a.href); show(a.dataset.section);
  });
  addEventListener('popstate', () => show(sectionFromPath()));
  addEventListener('hashchange', () => show(sectionFromPath()));
  show(sectionFromPath());
  // 어느 탭으로 들어와도 맨 위 권한 줄이 채워지게 한다(개요 외 탭에서 '권한을 확인하고 있습니다…'에 멈추던 문제).
  getSummary().catch(() => {});
})();
