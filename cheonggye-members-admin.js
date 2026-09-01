(() => {
  'use strict';

  const TOKEN_KEY = 'ekodi-auth-token';
  const EMAIL_KEY = 'ekodi-admin-email';
  const STORAGE_KEY = 'ekodi-cheonggye-contest-stores-v1';
  const PANEL = 'cheonggye-members';

  const INITIAL_ROWS = [
    ['25.12.26','음식점','일오삼','김영준'],
    ['25.12.28','음식점','자담치킨','정찬균'],
    ['25.12.28','카페','카페인','김혜정'],
    ['25.12.28','의료','하늘애한의원','김정윤'],
    ['25.12.29','미용','1st헤어샵','최성민'],
    ['25.12.29','카페','메가커피','이봉수'],
    ['25.12.29','편의점','세븐','박점숙'],
    ['25.12.29','카페','미스터빈','조원홍'],
    ['25.12.29','음식점','참새방앗간','권유정'],
    ['25.12.29','편의점','세븐도림','박춘근'],
    ['25.12.30','음식점','대림식당','이길재'],
    ['25.12.30','음식점','토굽사','김광윤'],
    ['25.12.30','카페','빽다방','김영란'],
    ['25.12.31','카페','컴포즈','정정숙'],
    ['26.01.05','도자기·공방','평화자기','정미진'],
    ['26.01.07','음식점','무안하다','정경탁'],
    ['26.01.07','음식점','우후죽순','최수연'],
    ['26.01.07','카페','산들카페','김명학'],
    ['26.01.07','화원','청계화원','손시현'],
    ['26.01.07','음식점','고깃집','김세홍'],
    ['26.01.07','카페','커피에빠지다','이진'],
    ['26.01.07','광고·인쇄','삼일종합광고','김상철'],
    ['26.01.07','음식점','대패세끼','이정임'],
    ['26.01.07','음식점','롯데리아','배은경'],
    ['26.01.07','편의점','세븐','김용성'],
    ['26.01.07','오락·게임','만남게임랜드','박지연'],
    ['26.01.07','카페','이디야','윤성호'],
    ['26.01.07','문구·팬시','아트랜드','김혜숙'],
    ['26.01.08','음식점','나주곰탕','정은경'],
    ['26.01.08','행정서비스','바른탐정행정사','정옥헌'],
    ['26.01.08','음식점','이모네칼국수','노수정'],
    ['26.01.13','스포츠·여가','다마당구장','이명석'],
    ['26.01.15','금융','무안남부신협','기관'],
    ['26.01.16','기타서비스','모모홀딩스','업체'],
    ['26.01.23','카페','공차','김지연'],
    ['26.02.11','기관','국제협력처','기관'],
    ['26.02.12','음식점','안흥찐빵','유석형'],
    ['26.02.12','편의점','지에스25','최대중'],
    ['26.02.12','환경·관리','한국그린케어','윤종인'],
    ['26.02.12','음식점','동경야시장','김미소'],
    ['26.02.12','카페','행복한커피','박관희'],
    ['26.02.19','기타서비스','다담코리아','여은진'],
    ['26.02.24','환경·자원','만복환경자원','정상규'],
    ['26.02.26','사진·스튜디오','김정호스튜디오','김정호'],
    ['26.02.27','마트·소매','승달마트','박수정'],
    ['26.03.05','음식점','완미국밥','최향분'],
    ['26.03.19','서점','책마당','안숙희'],
    ['26.06.12','주점','술도가','양경근'],
    ['26.06.19','노래방','노래방','김명옥'],
    ['26.07.16','음식점','한식뷔페','강순옥'],
    ['26.07.21','금융','목대신한은행','한일신'],
  ].map((row, index) => ({ id: `seed-${index + 1}`, joinedAt: row[0], category: row[1], store: row[2], name: row[3] }));

  let rows = [];
  let sort = { key: 'joinedAt', dir: 'asc' };
  let editingId = '';

  function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function email() { try { return sessionStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
  function normalizeDate(value) { return String(value || '').trim().replace(/\s+/g, '').replace(/\.$/, ''); }
  function normalizeText(value) { return String(value || '').trim(); }
  function nextId() { return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

  function loadRows() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      }
    } catch {}
    return INITIAL_ROWS.slice();
  }

  function saveRows() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {}
  }

  function sortedRows() {
    const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });
    return rows.map((row, index) => ({ row, index })).sort((a, b) => {
      const av = sort.key === 'no' ? a.index + 1 : a.row[sort.key];
      const bv = sort.key === 'no' ? b.index + 1 : b.row[sort.key];
      const result = collator.compare(String(av || ''), String(bv || ''));
      return sort.dir === 'asc' ? result : -result;
    }).map(item => item.row);
  }

  function flash(message, error = false) {
    const el = document.querySelector('#cheonggyeMembersFlash');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.error = error ? 'true' : 'false';
  }

  function switchPanel() {
    document.querySelectorAll('[data-panel]').forEach(panel => {
      panel.classList.toggle('hidden-panel', !String(panel.dataset.panel || '').split(' ').includes(PANEL));
    });
    document.querySelectorAll('.sidebar .nav[data-section]').forEach(nav => {
      nav.classList.toggle('active', nav.dataset.section === PANEL);
    });
    const title = document.querySelector('#pageTitle');
    if (title) title.textContent = '공모전 대상 상가';
    document.querySelector('.sidebar')?.classList.remove('open');
    if (location.hash !== '#cheonggye-members') history.replaceState(null, '', '#cheonggye-members');
    render();
  }

  function install() {
    if (!token()) return false;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content) return false;
    if (document.querySelector('#cheonggyeMembersSection')) return true;

    rows = loadRows();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav';
    button.dataset.section = PANEL;
    button.innerHTML = '名 <span>상가 명단</span>';
    const community = nav.querySelector('[data-section="community"], [data-lazy-section="community"], [data-demand-feature="community"]');
    if (community) community.insertAdjacentElement('afterend', button); else nav.append(button);

    const section = document.createElement('section');
    section.id = 'cheonggyeMembersSection';
    section.className = 'section cheonggye-members-admin hidden-panel';
    section.dataset.panel = PANEL;
    section.innerHTML = `
      <div class="cheonggye-members-head">
        <div>
          <p class="cheonggye-kicker">CHEONGGYE · CONTEST TARGET STORES</p>
          <h2>공모전 대상 상가 명단</h2>
          <p>사전등록된 Google 이메일 관리자만 입력·수정·삭제할 수 있습니다. 각 제목을 누르면 오름차순·내림차순이 전환됩니다.</p>
        </div>
        <div class="cheonggye-members-meta"><span id="cheonggyeMemberCount">0개 상가</span><small>${esc(email() || 'Google 관리자')}</small></div>
      </div>
      <p id="cheonggyeMembersFlash" class="cheonggye-members-flash" role="status"></p>
      <form id="cheonggyeMembersForm" class="cheonggye-members-form">
        <label>가입일<input name="joinedAt" placeholder="26.01.01" required></label>
        <label>업종<input name="category" placeholder="음식점" required></label>
        <label>상호<input name="store" placeholder="상호" required></label>
        <label>성명<input name="name" placeholder="성명" required></label>
        <div class="cheonggye-members-actions"><button class="primary" type="submit">입력</button><button class="secondary" id="cheonggyeCancelEdit" type="button" hidden>수정 취소</button></div>
      </form>
      <div class="cheonggye-members-toolbar"><button type="button" id="cheonggyeResetSeed">기본 명단 복원</button><button type="button" id="cheonggyeExportCsv">CSV 복사</button></div>
      <div class="cheonggye-members-table-wrap">
        <table class="cheonggye-members-table">
          <thead><tr>
            <th><button type="button" data-sort="no">연번</button></th>
            <th><button type="button" data-sort="joinedAt">가입일</button></th>
            <th><button type="button" data-sort="category">업종</button></th>
            <th><button type="button" data-sort="store">상호</button></th>
            <th><button type="button" data-sort="name">성명</button></th>
            <th>수정</th><th>삭제</th>
          </tr></thead>
          <tbody id="cheonggyeMembersBody"></tbody>
        </table>
      </div>`;
    content.append(section);

    button.addEventListener('click', switchPanel);
    section.querySelector('#cheonggyeMembersForm').addEventListener('submit', submitForm);
    section.querySelector('#cheonggyeCancelEdit').addEventListener('click', cancelEdit);
    section.querySelector('#cheonggyeResetSeed').addEventListener('click', resetSeed);
    section.querySelector('#cheonggyeExportCsv').addEventListener('click', copyCsv);
    section.querySelectorAll('[data-sort]').forEach(btn => btn.addEventListener('click', () => setSort(btn.dataset.sort)));
    section.addEventListener('click', tableAction);

    if (location.hash === '#cheonggye-members') setTimeout(() => button.click(), 80);
    return true;
  }

  function render() {
    const body = document.querySelector('#cheonggyeMembersBody');
    const count = document.querySelector('#cheonggyeMemberCount');
    if (!body) return;
    const sorted = sortedRows();
    body.innerHTML = sorted.map((row, index) => `
      <tr data-id="${esc(row.id)}">
        <td>${index + 1}</td>
        <td>${esc(row.joinedAt)}</td>
        <td>${esc(row.category)}</td>
        <td>${esc(row.store)}</td>
        <td>${esc(row.name)}</td>
        <td><button class="table-edit" type="button" data-edit="${esc(row.id)}">수정</button></td>
        <td><button class="table-delete" type="button" data-delete="${esc(row.id)}">삭제</button></td>
      </tr>`).join('');
    if (count) count.textContent = `${rows.length}개 상가`;
    document.querySelectorAll('#cheonggyeMembersSection [data-sort]').forEach(btn => {
      btn.dataset.active = btn.dataset.sort === sort.key ? 'true' : 'false';
      btn.dataset.dir = btn.dataset.sort === sort.key ? sort.dir : '';
    });
  }

  function setSort(key) {
    if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
    else sort = { key, dir: 'asc' };
    render();
  }

  function submitForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = {
      joinedAt: normalizeDate(form.joinedAt.value),
      category: normalizeText(form.category.value),
      store: normalizeText(form.store.value),
      name: normalizeText(form.name.value),
    };
    if (!data.joinedAt || !data.category || !data.store || !data.name) return flash('가입일, 업종, 상호, 성명을 모두 입력해 주세요.', true);
    if (editingId) {
      rows = rows.map(row => row.id === editingId ? { ...row, ...data } : row);
      flash('수정했습니다.');
    } else {
      rows.push({ id: nextId(), ...data });
      flash('새 상가를 입력했습니다.');
    }
    saveRows();
    cancelEdit(false);
    render();
  }

  function tableAction(event) {
    const edit = event.target.closest('[data-edit]');
    const del = event.target.closest('[data-delete]');
    if (edit) return startEdit(edit.dataset.edit);
    if (del) return deleteRow(del.dataset.delete);
  }

  function startEdit(id) {
    const row = rows.find(item => item.id === id);
    const form = document.querySelector('#cheonggyeMembersForm');
    if (!row || !form) return;
    editingId = id;
    form.joinedAt.value = row.joinedAt || '';
    form.category.value = row.category || '';
    form.store.value = row.store || '';
    form.name.value = row.name || '';
    form.querySelector('button[type="submit"]').textContent = '수정 저장';
    document.querySelector('#cheonggyeCancelEdit').hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cancelEdit(showMessage = true) {
    const form = document.querySelector('#cheonggyeMembersForm');
    if (!form) return;
    editingId = '';
    form.reset();
    form.querySelector('button[type="submit"]').textContent = '입력';
    document.querySelector('#cheonggyeCancelEdit').hidden = true;
    if (showMessage) flash('수정을 취소했습니다.');
  }

  function deleteRow(id) {
    const row = rows.find(item => item.id === id);
    if (!row) return;
    if (!confirm(`${row.store} / ${row.name} 항목을 삭제할까요?`)) return;
    rows = rows.filter(item => item.id !== id);
    saveRows();
    if (editingId === id) cancelEdit(false);
    render();
    flash('삭제했습니다.');
  }

  function resetSeed() {
    if (!confirm('기본 51개 상가 명단으로 복원할까요? 현재 수정 내용은 이 브라우저에서 사라집니다.')) return;
    rows = INITIAL_ROWS.slice();
    saveRows();
    cancelEdit(false);
    render();
    flash('기본 명단으로 복원했습니다.');
  }

  async function copyCsv() {
    const header = ['연번','가입일','업종','상호','성명'];
    const lines = [header, ...sortedRows().map((row, index) => [index + 1, row.joinedAt, row.category, row.store, row.name])]
      .map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      flash('CSV 형식으로 복사했습니다. 한글·엑셀·구글시트에 붙여넣을 수 있습니다.');
    } catch {
      flash('브라우저가 복사를 막았습니다. 표 내용을 드래그해 복사해 주세요.', true);
    }
  }

  function boot() { install(); }
  window.addEventListener('ekodi-admin-ready', boot);
  window.addEventListener('ekodi-authenticated', boot);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
