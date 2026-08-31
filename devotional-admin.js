(() => {
  'use strict';
  const API = window.EKODI_API_BASE || 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  let model = null;
  let selectedEntry = null;

  const el = (tag, text = '', className = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(`${API}${path}`, { ...options, headers, credentials:'include', cache:'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(data.error || `API 요청 실패 (${response.status})`);
      error.data = data;
      throw error;
    }
    return data;
  }

  function badge(status) {
    const labels = {
      script_ready:'대본 완료', render_queued:'영상 대기', rendered:'영상 완료',
      schedule_queued:'예약 대기', scheduled:'예약 완료', published:'게시 완료',
      render_failed:'영상 오류', schedule_failed:'예약 오류'
    };
    return el('span', labels[status] || status || '대기', 'devotional-badge');
  }

  function install() {
    if (!token()) return;
    const nav = document.querySelector('.sidebar nav');
    const content = document.querySelector('.content');
    if (!nav || !content || document.querySelector('[data-panel~="devotional"]')) return;

    let navButton = nav.querySelector('[data-section="devotional"],[data-lazy-section="devotional"]');
    if (!navButton) {
      navButton = el('button', '', 'nav');
      navButton.type = 'button';
      navButton.dataset.section = 'devotional';
      navButton.append(document.createTextNode('V '), el('span', '콘텐츠 자동화'));
      nav.append(navButton);
    } else {
      navButton.dataset.section = 'devotional';
      navButton.removeAttribute('data-lazy-section');
    }

    const section = el('section', '', 'section devotional-admin hidden-panel');
    section.dataset.panel = 'devotional';
    section.id = 'devotionalAdmin';

    const head = el('div', '', 'devotional-head');
    const copy = el('div');
    copy.append(
      el('p', 'EKODI CONTENT AUTOMATION', 'devotional-kicker'),
      el('h2', '매일묵상 30초 영상'),
      el('p', '성경본문 기반 묵상 대본을 Full HD 세로 영상으로 만들고 에코디교회·에코디선교회 채널에 예약 게시합니다.', 'devotional-copy')
    );
    const actions = el('div', '', 'devotional-actions');
    const refresh = el('button', '↻ 새로고침', 'secondary'); refresh.type='button';
    const prepare = el('button', '9월 30편 준비', 'secondary'); prepare.type='button';
    const renderAll = el('button', '영상 일괄생성', 'primary'); renderAll.type='button';
    const scheduleAll = el('button', '예약게시 일괄등록', 'primary'); scheduleAll.type='button';
    actions.append(refresh, prepare, renderAll, scheduleAll);
    head.append(copy, actions);

    const summary = el('div', '', 'devotional-summary');
    const status = el('p', '상태를 불러오는 중입니다.', 'devotional-status'); status.setAttribute('role','status');
    const caps = el('div', '', 'devotional-capabilities');
    const settings = el('div', '', 'devotional-settings devotional-card');
    const tableWrap = el('div', '', 'devotional-table-wrap');
    const editor = el('div', '', 'devotional-edit'); editor.hidden = true;
    section.append(head, summary, caps, settings, status, tableWrap, editor);
    content.append(section);

    function setStatus(message, state = 'ready') {
      status.textContent = message;
      status.dataset.state = state;
    }

    function field(label, value, type = 'text') {
      const wrap = el('label', '', 'devotional-field');
      const caption = el('span', label);
      const input = document.createElement('input'); input.type = type; input.value = value ?? '';
      wrap.append(caption, input);
      return { wrap, input };
    }

    function renderSummary() {
      summary.replaceChildren();
      const s = model?.summary || {};
      [['전체',s.total||0],['대본 완료',s.scriptReady||0],['영상 완료',s.rendered||0],['예약 완료',s.scheduled||0],['게시 완료',s.published||0]].forEach(([label,value]) => {
        const card = el('article', '', 'devotional-card');
        card.append(el('small', label), el('strong', String(value)));
        summary.append(card);
      });
    }

    function renderCapabilities() {
      caps.replaceChildren();
      const c = model?.capabilities || {};
      caps.append(
        el('span', `${c.rendererConnected ? '●' : '○'} FFmpeg 실행노드 ${c.rendererConnected ? '연결' : '미연결'}`),
        el('span', `${c.publisherConnected ? '●' : '○'} YouTube 게시노드 ${c.publisherConnected ? '연결' : '미연결'}`),
        el('span', c.rendering || '1080×1920'),
        el('span', '정본: Google Workspace Shared Drive')
      );
    }

    function renderSettings() {
      settings.replaceChildren();
      const current = model?.settings || {};
      const church = current.channels?.church || {};
      const mission = current.channels?.mission || {};
      const tz = field('시간대', current.timezone || 'Asia/Seoul');
      const churchName = field('교회 채널', church.label || '에코디교회');
      const churchTime = field('교회 게시시간', church.time || '06:00', 'time');
      const missionName = field('선교회 채널', mission.label || '에코디선교회');
      const missionTime = field('선교회 게시시간', mission.time || '07:00', 'time');
      const save = el('button','설정 저장','secondary'); save.type='button';
      save.addEventListener('click', async () => {
        save.disabled = true; setStatus('채널·예약 설정을 저장하는 중입니다.','loading');
        try {
          model = await api('/api/control/devotional/settings', { method:'PUT', body:JSON.stringify({
            timezone:tz.input.value,
            channels:{ church:{ label:churchName.input.value, time:churchTime.input.value }, mission:{ label:missionName.input.value, time:missionTime.input.value } },
            autoSchedule:Boolean(current.autoSchedule)
          }) });
          renderAllViews(); setStatus('설정을 저장했습니다.','saved');
        } catch (error) { setStatus(error.message,'error'); }
        finally { save.disabled=false; }
      });
      settings.append(tz.wrap, churchName.wrap, churchTime.wrap, missionName.wrap, missionTime.wrap, save);
    }

    function openEditor(entry) {
      selectedEntry = entry;
      editor.hidden = false;
      editor.replaceChildren();
      editor.append(el('h3', `${entry.date} · ${entry.passage}`));
      const title = document.createElement('input'); title.value = entry.title;
      const script = document.createElement('textarea'); script.value = entry.script;
      const core = document.createElement('textarea'); core.value = entry.core; core.style.minHeight='70px';
      const buttons = el('div', '', 'devotional-edit-actions');
      const close = el('button','닫기','secondary'); close.type='button';
      const save = el('button','대본 저장','primary'); save.type='button';
      close.addEventListener('click',()=>{ editor.hidden=true; selectedEntry=null; });
      save.addEventListener('click',async()=>{
        save.disabled=true; setStatus(`${entry.date} 대본을 저장하는 중입니다.`,'loading');
        try {
          model = await api(`/api/control/devotional/entries/${entry.id}`, { method:'PUT', body:JSON.stringify({ title:title.value, script:script.value, core:core.value }) });
          renderAllViews(); editor.hidden=true; selectedEntry=null; setStatus('대본을 저장했습니다. 영상은 다시 생성할 수 있습니다.','saved');
        } catch(error) { setStatus(error.message,'error'); }
        finally { save.disabled=false; }
      });
      buttons.append(close,save);
      editor.append(el('small','제목'),title,el('small','30초 내레이션'),script,el('small','핵심문장'),core,buttons);
      editor.scrollIntoView({ behavior:'smooth', block:'nearest' });
    }

    async function queueSingle(entry, kind) {
      setStatus(`${entry.date} ${kind === 'render' ? '영상 생성' : '예약 게시'} 작업을 등록합니다.`,'loading');
      try {
        const data = await api(`/api/control/devotional/${kind === 'render' ? 'render' : 'schedule'}`, { method:'POST', body:JSON.stringify({ ids:[entry.id] }) });
        model = data.overview || model; renderAllViews();
        if (!data.executorConnected) setStatus('작업은 대기열에 등록됐습니다. 실행노드 연결 후 자동 실행됩니다.','ready');
        else setStatus('실행노드로 작업을 전달했습니다.','saved');
      } catch(error) { setStatus(error.message,'error'); }
    }

    function renderTable() {
      tableWrap.replaceChildren();
      const table = el('table', '', 'devotional-table');
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      ['날짜','본문','묵상','상태','교회 예약','선교회 예약','작업'].forEach(label => hr.append(el('th',label)));
      thead.append(hr); table.append(thead);
      const tbody = document.createElement('tbody');
      (model?.entries || []).forEach(entry => {
        const tr = document.createElement('tr');
        const devotional = document.createElement('td');
        devotional.append(el('span',entry.title,'devotional-title'),el('span',entry.core,'devotional-core'));
        const church = model.settings?.channels?.church;
        const mission = model.settings?.channels?.mission;
        const actionsCell = document.createElement('td');
        const rowActions = el('div','', 'devotional-row-actions');
        const edit = el('button','대본','secondary'); edit.type='button'; edit.addEventListener('click',()=>openEditor(entry));
        const render = el('button','영상','secondary'); render.type='button'; render.disabled=!['script_ready','render_failed'].includes(entry.status); render.addEventListener('click',()=>queueSingle(entry,'render'));
        const schedule = el('button','예약','secondary'); schedule.type='button'; schedule.disabled=!['rendered','schedule_failed'].includes(entry.status); schedule.addEventListener('click',()=>queueSingle(entry,'schedule'));
        rowActions.append(edit,render,schedule); actionsCell.append(rowActions);
        const cells = [entry.date.slice(5),entry.passage,devotional,badge(entry.status),entry.churchPublishAt || `${church?.time || '06:00'} 예정`,entry.missionPublishAt || `${mission?.time || '07:00'} 예정`,actionsCell];
        cells.forEach(value => { if (value instanceof Node) tr.append(value.tagName === 'TD' ? value : (()=>{const td=document.createElement('td');td.append(value);return td;})()); else tr.append(el('td',String(value))); });
        tbody.append(tr);
      });
      table.append(tbody); tableWrap.append(table);
    }

    function renderAllViews() {
      renderSummary(); renderCapabilities(); renderSettings(); renderTable();
    }

    async function load() {
      refresh.disabled=true; setStatus('9월 매일묵상 운영 상태를 불러오는 중입니다.','loading');
      try {
        model = await api('/api/control/devotional/overview');
        renderAllViews();
        const c = model.capabilities || {};
        setStatus(c.rendererConnected && c.publisherConnected ? '영상 생성·예약 게시 실행 준비가 되어 있습니다.' : '관리자 제어면은 준비되었습니다. 미연결 실행노드는 상단 상태에서 확인할 수 있습니다.','ready');
      } catch(error) { setStatus(error.message,'error'); }
      finally { refresh.disabled=false; }
    }

    async function bulk(action) {
      const button = action === 'render' ? renderAll : scheduleAll;
      button.disabled=true; setStatus(action === 'render' ? '30편 영상 생성 작업을 등록하는 중입니다.' : '두 채널 예약 게시 작업을 등록하는 중입니다.','loading');
      try {
        const data = await api(`/api/control/devotional/${action}`, { method:'POST', body:'{}' });
        model = data.overview || model; renderAllViews();
        if (!data.executorConnected) setStatus(`${data.queued || 0}건을 대기열에 등록했습니다. 실행노드가 연결되면 처리됩니다.`,'ready');
        else setStatus(`${data.queued || 0}건을 실행노드로 전달했습니다.`,'saved');
      } catch(error) { setStatus(error.message,'error'); }
      finally { button.disabled=false; }
    }

    async function activate() {
      document.querySelectorAll('[data-panel]').forEach(panel => {
        const targets = String(panel.dataset.panel || '').split(' ');
        panel.classList.toggle('hidden-panel', !targets.includes('devotional'));
        panel.hidden = !targets.includes('devotional');
      });
      section.hidden = false;
      document.querySelectorAll('.sidebar .nav[data-section]').forEach(item => item.classList.toggle('active', item.dataset.section === 'devotional'));
      const pageTitle = document.querySelector('#pageTitle'); if (pageTitle) pageTitle.textContent='콘텐츠 자동화';
      document.querySelector('.sidebar')?.classList.remove('open');
      window.dispatchEvent(new CustomEvent('ekodi-feature-installed', { detail:{ section:'devotional' } }));
      if (!model) await load();
    }

    navButton.addEventListener('click', activate);
    refresh.addEventListener('click', load);
    prepare.addEventListener('click', async()=>{ try { model=await api('/api/control/devotional/prepare',{method:'POST',body:'{}'}); renderAllViews(); setStatus('9월 30편 대본을 확인했습니다.','saved'); } catch(error){ setStatus(error.message,'error'); } });
    renderAll.addEventListener('click',()=>bulk('render'));
    scheduleAll.addEventListener('click',()=>bulk('schedule'));
  }

  install();
})();