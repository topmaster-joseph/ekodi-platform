(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const EMAIL_KEY = 'ekodi-admin-email';
  const PANEL = 'cheonggye-members';
  const API = '/api/control/storage/google/cheonggye-members';
  const POLL_MS = 15000;

  let rows = [];
  let sort = { key: 'no', dir: 'asc' };
  let editingNo = null;
  let query = '';
  let pollTimer = null;
  let installed = false;

  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function email() { try { return sessionStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
  function normalize(value) { return String(value || '').trim(); }
  function normalizeDate(value) { return normalize(value).replace(/\s+/g, '').replace(/\.$/, ''); }
  function flash(message, error = false) {
    const el = document.querySelector('#cheonggyeMembersFlash');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.error = error ? 'true' : 'false';
  }

  async function request(path = '', options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { cache:'no-store', credentials:'same-origin', ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `회원명단 API 오류 (${response.status})`);
      error.code = data.code || '';
      throw error;
    }
    return data;
  }

  function sortedRows() {
    const needle = query.toLocaleLowerCase('ko-KR');
    const filtered = needle ? rows.filter(row => [row.no,row.joinedAt,row.category,row.store,row.name,row.contact]
      .some(value => String(value || '').toLocaleLowerCase('ko-KR').includes(needle))) : rows.slice();
    const collator = new Intl.Collator('ko-KR', { numeric:true, sensitivity:'base' });
    return filtered.sort((a, b) => {
      const result = sort.key === 'no'
        ? Number(a.no || 0) - Number(b.no || 0)
        : collator.compare(String(a[sort.key] || ''), String(b[sort.key] || ''));
      return sort.dir === 'asc' ? result : -result;
    });
  }

  function render() {
    const body = document.querySelector('#cheonggyeMembersBody');
    const count = document.querySelector('#cheonggyeMemberCount');
    if (!body) return;
    const view = sortedRows();
    body.innerHTML = view.length ? view.map(row => `
      <tr data-no="${esc(row.no)}">
        <td>${esc(row.no)}</td><td>${esc(row.joinedAt)}</td><td>${esc(row.category)}</td>
        <td>${esc(row.store)}</td><td>${esc(row.name)}</td><td>${esc(row.contact)}</td>
        <td><button class="table-edit" type="button" data-edit="${esc(row.no)}">수정</button></td>
        <td><button class="table-delete" type="button" data-delete="${esc(row.no)}">삭제</button></td>
      </tr>`).join('') : '<tr><td colspan="8" class="cheonggye-empty">표시할 회원이 없습니다.</td></tr>';
    if (count) count.textContent = `${rows.length}명`;
    document.querySelectorAll('#cheonggyeMembersSection [data-sort]').forEach(btn => {
      btn.dataset.active = btn.dataset.sort === sort.key ? 'true' : 'false';
      btn.dataset.dir = btn.dataset.sort === sort.key ? sort.dir : '';
    });
  }

  function setSort(key) {
    if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
    else sort = { key, dir:'asc' };
    render();
  }

  function setSync(message, state = '') {
    const el = document.querySelector('#cheonggyeSyncStatus');
    if (!el) return;
    el.textContent = message;
    el.dataset.state = state;
  }

  async function refresh(silent = false) {
    if (!token()) return;
    if (!silent) setSync('Google Sheet 동기화 중…', 'loading');
    try {
      const data = await request();
      rows = Array.isArray(data.members) ? data.members : [];
      render();
      const stamp = data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '방금';
      setSync(`실시간 동기화 · ${stamp}`, 'ok');
      const link = document.querySelector('#cheonggyeSheetLink');
      if (link && data.sourceUrl) link.href = data.sourceUrl;
      if (!silent) flash(`${rows.length}명의 정회원 명단을 Google Sheet에서 불러왔습니다.`);
    } catch (error) {
      setSync('동기화 확인 필요', 'error');
      if (!silent) flash(error.message || '회원명단을 불러오지 못했습니다.', true);
    }
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      const section = document.querySelector('#cheonggyeMembersSection');
      if (document.visibilityState === 'visible' && section && !section.classList.contains('hidden-panel')) refresh(true);
    }, POLL_MS);
  }

  function switchPanel() {
    document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('hidden-panel', !String(panel.dataset.panel || '').split(' ').includes(PANEL)));
    document.querySelectorAll('.sidebar .nav[data-section]').forEach(nav => nav.classList.toggle('active', nav.dataset.section === PANEL));
    const title = document.querySelector('#pageTitle');
    if (title) title.textContent = '청계면상인회 정회원';
    document.querySelector('.sidebar')?.classList.remove('open');
    if (location.hash !== '#cheonggye-members') history.replaceState(null, '', '#cheonggye-members');
    refresh(false);
  }

  function install() {
    if (!token()) return false;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return false;
    if (installed || document.querySelector('#cheonggyeMembersSection')) return true;
    installed = true;

    let button = nav.querySelector('[data-section="cheonggye-members"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.className = 'nav'; button.dataset.section = PANEL;
      button.innerHTML = '名 <span>청계면상인회 정회원</span>';
      const workspace = nav.querySelector('[data-section="workspace"], [data-demand-feature="workspace"]');
      if (workspace) workspace.insertAdjacentElement('afterend', button); else nav.append(button);
    }

    const section = document.createElement('section');
    section.id = 'cheonggyeMembersSection';
    section.className = 'section cheonggye-members-admin hidden-panel';
    section.dataset.panel = PANEL;
    section.innerHTML = `
      <div class="cheonggye-members-head"><div>
        <p class="cheonggye-kicker">CHEONGGYE MERCHANTS · MEMBER REGISTRY</p>
        <h2>청계면상인회 정회원 명단</h2>
        <p>기준 원본은 Google Sheets 「상인회정회원현황(회비납부순)」의 ‘웹관리’ 탭입니다. 이 화면은 별도 사본을 만들지 않고 원본과 직접 동기화합니다.</p>
      </div><div class="cheonggye-members-meta"><span id="cheonggyeMemberCount">0명</span><small>${esc(email() || 'Google 관리자')}</small></div></div>
      <div class="cheonggye-livebar"><span><i></i> Google Sheets · 웹관리</span><span id="cheonggyeSyncStatus">연결 확인 중…</span></div>
      <p id="cheonggyeMembersFlash" class="cheonggye-members-flash" role="status"></p>
      <form id="cheonggyeMembersForm" class="cheonggye-members-form">
        <label>가입일<input name="joinedAt" placeholder="26.09.03" required></label><label>업종<input name="category" placeholder="음식점" required></label>
        <label>상호<input name="store" placeholder="상호" required></label><label>성명<input name="name" placeholder="성명" required></label>
        <label>연락처<input name="contact" inputmode="tel" placeholder="01012345678"></label>
        <div class="cheonggye-members-actions"><button class="primary" type="submit">등록</button><button class="secondary" id="cheonggyeCancelEdit" type="button" hidden>수정 취소</button></div>
      </form>`;

    section.insertAdjacentHTML('beforeend', `
      <div class="cheonggye-members-toolbar">
        <label class="cheonggye-search">검색<input id="cheonggyeMemberSearch" type="search" placeholder="상호·성명·업종·연락처"></label>
        <div><button type="button" id="cheonggyeRefresh">새로고침</button><button type="button" id="cheonggyeExportCsv">CSV 복사</button>
        <a id="cheonggyeSheetLink" href="https://docs.google.com/spreadsheets/d/1NNYUFgkle_vzSvR-HWM6EVhvfd5qdgJmF2ZYbK9gtlo/edit" target="_blank" rel="noopener noreferrer">원본 Sheet 열기</a></div>
      </div>
      <div class="cheonggye-members-table-wrap"><table class="cheonggye-members-table"><thead><tr>
        <th><button type="button" data-sort="no">연번</button></th><th><button type="button" data-sort="joinedAt">가입일</button></th>
        <th><button type="button" data-sort="category">업종</button></th><th><button type="button" data-sort="store">상호</button></th>
        <th><button type="button" data-sort="name">성명</button></th><th><button type="button" data-sort="contact">연락처</button></th><th>수정</th><th>삭제</th>
      </tr></thead><tbody id="cheonggyeMembersBody"><tr><td colspan="8" class="cheonggye-empty">Google Sheet 연결을 확인하는 중입니다.</td></tr></tbody></table></div>`);
    content.append(section);

    button.addEventListener('click', switchPanel);
    section.querySelector('#cheonggyeMembersForm').addEventListener('submit', submitForm);
    section.querySelector('#cheonggyeCancelEdit').addEventListener('click', () => cancelEdit(true));
    section.querySelector('#cheonggyeRefresh').addEventListener('click', () => refresh(false));
    section.querySelector('#cheonggyeExportCsv').addEventListener('click', copyCsv);
    section.querySelector('#cheonggyeMemberSearch').addEventListener('input', event => { query = event.target.value || ''; render(); });
    section.querySelectorAll('[data-sort]').forEach(btn => btn.addEventListener('click', () => setSort(btn.dataset.sort)));
    section.addEventListener('click', tableAction);
    startPolling();
    if (location.hash === '#cheonggye-members') setTimeout(() => button.click(), 80);
    return true;
  }

  async function submitForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = {
      joinedAt: normalizeDate(form.joinedAt.value), category: normalize(form.category.value),
      store: normalize(form.store.value), name: normalize(form.name.value), contact: normalize(form.contact.value),
    };
    if (!data.joinedAt || !data.category || !data.store || !data.name) return flash('가입일, 업종, 상호, 성명을 모두 입력해 주세요.', true);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (editingNo !== null) {
        await request(`/${encodeURIComponent(editingNo)}`, { method:'PUT', body:JSON.stringify(data) });
        flash(`${editingNo}번 회원 정보를 원본 Sheet에 수정했습니다.`);
      } else {
        await request('', { method:'POST', body:JSON.stringify(data) });
        flash('새 정회원을 원본 Sheet에 등록했습니다.');
      }
      cancelEdit(false);
      await refresh(true);
    } catch (error) { flash(error.message || '저장하지 못했습니다.', true); }
    finally { submit.disabled = false; }
  }

  function tableAction(event) {
    const edit = event.target.closest('[data-edit]');
    const del = event.target.closest('[data-delete]');
    if (edit) startEdit(Number(edit.dataset.edit));
    if (del) deleteRow(Number(del.dataset.delete));
  }

  function startEdit(no) {
    const row = rows.find(item => Number(item.no) === Number(no));
    const form = document.querySelector('#cheonggyeMembersForm');
    if (!row || !form) return;
    editingNo = Number(row.no);
    for (const key of ['joinedAt','category','store','name','contact']) form[key].value = row[key] || '';
    form.querySelector('button[type="submit"]').textContent = '수정 저장';
    document.querySelector('#cheonggyeCancelEdit').hidden = false;
    form.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  function cancelEdit(showMessage = false) {
    const form = document.querySelector('#cheonggyeMembersForm');
    if (!form) return;
    editingNo = null;
    form.reset();
    form.querySelector('button[type="submit"]').textContent = '등록';
    document.querySelector('#cheonggyeCancelEdit').hidden = true;
    if (showMessage) flash('수정을 취소했습니다.');
  }

  async function deleteRow(no) {
    const row = rows.find(item => Number(item.no) === Number(no));
    if (!row || !confirm(`${row.store} / ${row.name} 회원을 원본 Sheet에서 삭제할까요?`)) return;
    try {
      await request(`/${encodeURIComponent(no)}`, { method:'DELETE' });
      if (editingNo === no) cancelEdit(false);
      await refresh(true);
      flash(`${no}번 회원을 삭제했습니다.`);
    } catch (error) { flash(error.message || '삭제하지 못했습니다.', true); }
  }

  async function copyCsv() {
    const header = ['연번','가입일','업종','상호','성명','연락처'];
    const lines = [header, ...sortedRows().map(row => [row.no,row.joinedAt,row.category,row.store,row.name,row.contact])]
      .map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
    try { await navigator.clipboard.writeText(lines.join('\n')); flash('현재 실시간 명단을 CSV 형식으로 복사했습니다.'); }
    catch { flash('브라우저가 복사를 막았습니다.', true); }
  }

  function boot() { install(); }
  window.addEventListener('ekodi-admin-ready', boot);
  window.addEventListener('ekodi-authenticated', boot);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(true); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
