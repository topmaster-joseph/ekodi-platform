(() => {
  'use strict';

  const STRATEGY_API = 'https://renzehysxirjilvdxacv.supabase.co/functions/v1/admin-strategy-api';
  const TOKEN_KEY = 'ekodi-auth-token';
  const THREAD_KEY = 'ekodi-admin-strategy-thread';
  const SECTION_STRATEGY = 'strategy';
  const SECTION_REPORT = 'aireport';
  const SECTION_PREVIEW = 'sitepreview';

  const SITES = [
    { name:'EKODI', domain:'ekodi.kr', manage:'overview' },
    { name:'Church', domain:'church.ekodi.kr', manage:'services' },
    { name:'Community', domain:'community.ekodi.kr', manage:'community' },
    { name:'Biz', domain:'biz.ekodi.kr', manage:'organization' },
    { name:'Marketing AI', domain:'marketing.ekodi.kr', manage:'marketing', embed:true },
    { name:'Mall', domain:'mall.ekodi.kr', manage:'services', embed:true },
    { name:'Books', domain:'books.ekodi.kr', manage:'books' },
    { name:'Author AI', domain:'author.ekodi.kr', manage:'services' },
    { name:'Lab', domain:'lab.ekodi.kr', manage:'services' },
    { name:'Work', domain:'work.ekodi.kr', manage:'work' },
    { name:'Trade', domain:'trade.ekodi.kr', manage:'organization' },
    { name:'Pay', domain:'pay.ekodi.kr', manage:'finance' },
  ];

  let activeThread = sessionStorage.getItem(THREAD_KEY) || '';
  let currentMessages = [];
  let currentReports = [];
  let busy = false;

  const $ = selector => document.querySelector(selector);
  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  function headers(json = false) {
    const result = token() ? { authorization:`Bearer ${token()}` } : {};
    if (json) result['content-type'] = 'application/json';
    return result;
  }
  async function strategyRequest(path, options = {}) {
    if (!token()) throw new Error('관리자 로그인 후 사용할 수 있습니다.');
    const response = await fetch(`${STRATEGY_API}${path}`, {
      ...options,
      headers:{ ...headers(Boolean(options.body)), ...(options.headers || {}) },
      cache:'no-store',
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      if (response.status === 401) throw new Error('관리자 인증이 만료되었습니다. 다시 로그인해 주세요.');
      throw new Error(data.error || `전략회의 API ${response.status}`);
    }
    return data;
  }

  function installStyles() {
    if ($('#ekodiWorkspaceStrategyStyles')) return;
    const style = document.createElement('style');
    style.id = 'ekodiWorkspaceStrategyStyles';
    style.textContent = `
      @media(min-width:761px){
        .sidebar{display:flex;flex-direction:column;overflow:hidden}
        .sidebar nav{display:block;overflow-y:auto;min-height:0;padding:0 3px 18px;scrollbar-width:thin}
        .sidebar .side-bottom{position:static;left:auto;right:auto;bottom:auto;margin-top:auto;flex:0 0 auto}
      }
      .ekodi-nav-group{display:block;margin:18px 11px 7px;color:#526b87;font-size:8px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
      .ekodi-nav-group:first-child{margin-top:4px}
      .nav.workspace-site{padding:8px 11px;gap:9px}.nav.workspace-site span{font-size:11px}.nav.workspace-site small{margin-left:auto;color:#506c89;font-size:8px}
      .strategy-nav-badge{margin-left:auto;min-width:19px;height:18px;padding:0 5px;display:inline-grid;place-items:center;border-radius:999px;background:#6c2632;color:#ffdce2;font-size:8px;font-style:normal}
      .strategy-shell{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:14px;min-height:calc(100vh - 155px)}
      .strategy-main,.strategy-side,.workspace-preview-shell,.ai-report-shell{border:1px solid #1f3956;border-radius:18px;background:#091727d9;overflow:hidden}
      .strategy-main{display:flex;flex-direction:column;min-height:650px}.strategy-side{padding:14px;align-self:start;position:sticky;top:108px}
      .strategy-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;border-bottom:1px solid #1a314a;background:#0d1d30}
      .strategy-head h2{font-size:17px;margin:2px 0 0}.strategy-head p{margin:3px 0 0;color:#6e88a4;font-size:9px}.strategy-head-actions{display:flex;align-items:center;gap:6px}
      .strategy-select{max-width:220px;height:32px;border:1px solid #2b4d70;border-radius:9px;background:#081a2c;color:#cce0f4;padding:0 8px;font-size:10px}
      .strategy-mini{height:32px;border:1px solid #2b4d70;border-radius:9px;background:#112c48;color:#b9d9f7;padding:0 9px;font-size:9px;cursor:pointer}
      .strategy-messages{flex:1;min-height:430px;max-height:calc(100vh - 325px);overflow:auto;padding:17px;display:flex;flex-direction:column;gap:12px;background:linear-gradient(180deg,#071321,#091827)}
      .strategy-msg{display:flex;gap:9px;max-width:90%}.strategy-msg.user{align-self:flex-end;flex-direction:row-reverse}.strategy-avatar{flex:0 0 30px;width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:#123758;border:1px solid #28587e;color:#bce0ff;font-size:9px;font-weight:900}.strategy-msg.user .strategy-avatar{background:#314155;border-color:#4e6176;color:#fff}
      .strategy-bubble{padding:10px 12px;border:1px solid #1f4464;border-radius:13px;background:#0c2842;min-width:0}.strategy-msg.user .strategy-bubble{background:#173550;border-color:#315a78}.strategy-meta{display:flex;gap:6px;align-items:center;margin-bottom:5px;font-size:8px;color:#718ba3}.strategy-meta b{color:#c5def5;font-size:9px}.strategy-text{white-space:pre-wrap;word-break:break-word;color:#d9e7f3;font-size:11px;line-height:1.62}
      .strategy-class{padding:2px 5px;border-radius:999px;font-weight:900}.strategy-class.info{background:#17344e;color:#8ecbff}.strategy-class.report{background:#274226;color:#9ee6a1}.strategy-class.warning{background:#4c3d18;color:#ffd879}.strategy-class.incident,.strategy-class.decision{background:#51252d;color:#ffb1bc}
      .strategy-council{margin-top:8px;padding-top:7px;border-top:1px solid #25445f}.strategy-council summary{cursor:pointer;color:#8db5d8;font-size:9px}.strategy-council div{margin-top:6px;padding:6px 7px;border-radius:8px;background:#071a2b}.strategy-council strong{display:block;color:#bcd7ef;font-size:9px}.strategy-council span{display:block;margin-top:2px;color:#839cb3;font-size:9px;line-height:1.45}
      .strategy-quick{display:flex;gap:6px;padding:9px 13px 0;overflow:auto}.strategy-quick button{flex:0 0 auto;border:1px solid #254966;border-radius:999px;background:#0c263f;color:#9ec6e8;padding:6px 9px;font-size:9px;cursor:pointer}
      .strategy-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:9px 13px 13px}.strategy-input{min-height:58px;max-height:160px;resize:vertical;border:1px solid #2b5274;border-radius:11px;background:#061727;color:#f1f7fc;padding:10px 11px;font:inherit;font-size:11px;line-height:1.5;outline:none}.strategy-input:focus{border-color:#5292c8}.strategy-send{width:76px;border:0;border-radius:11px;background:#dceeff;color:#061524;font-weight:900;cursor:pointer}.strategy-send:disabled{opacity:.5;cursor:wait}
      .strategy-side h3{font-size:13px;margin:3px 0 10px}.strategy-side small{color:#62809c;font-size:8px;font-weight:900;letter-spacing:.12em}.strategy-stat{display:grid;grid-template-columns:1fr auto;gap:3px 8px;padding:9px 0;border-bottom:1px solid #172e45}.strategy-stat span{color:#7f99b1;font-size:9px}.strategy-stat strong{font-size:11px}.strategy-stat em{grid-column:1/-1;color:#536e88;font-size:8px;font-style:normal}.strategy-side-list{margin-top:13px}.strategy-side-report{display:block;width:100%;padding:8px 0;border:0;border-bottom:1px solid #172e45;background:transparent;color:#c4d8e9;text-align:left;cursor:pointer}.strategy-side-report b{display:block;font-size:9px}.strategy-side-report span{display:block;margin-top:3px;color:#66819a;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .workspace-preview-shell{min-height:calc(100vh - 155px);display:flex;flex-direction:column}.workspace-toolbar{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #1a334c;background:#0d1d2e}.workspace-toolbar div{min-width:0;flex:1}.workspace-toolbar strong{display:block;font-size:12px}.workspace-toolbar small{display:block;color:#637f99;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.workspace-toolbar button,.workspace-toolbar a{height:30px;display:inline-flex;align-items:center;padding:0 9px;border:1px solid #284c6c;border-radius:8px;background:#102a43;color:#b8d5ed;font-size:9px;cursor:pointer}.workspace-frame{width:100%;flex:1;min-height:650px;border:0;background:#fff}.workspace-inspector{padding:22px}.workspace-inspector-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:15px}.workspace-inspector-grid article{padding:13px;border:1px solid #1d3954;border-radius:12px;background:#0b1c2d}.workspace-inspector-grid small{display:block;color:#6a86a0;font-size:8px}.workspace-inspector-grid strong{display:block;margin-top:6px;font-size:13px}.workspace-note{margin-top:14px;padding:12px;border:1px solid #29445e;border-radius:12px;background:#0a1a2a;color:#90a9bf;font-size:10px;line-height:1.55}
      .ai-report-shell{min-height:calc(100vh - 155px)}.ai-report-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #1b344e}.ai-report-head h2{margin:2px 0 0;font-size:17px}.ai-report-head small{color:#6985a0;font-size:8px;font-weight:900;letter-spacing:.12em}.ai-report-head button{height:31px;border:1px solid #2c4f70;border-radius:8px;background:#102a43;color:#b9d6ef;padding:0 9px;font-size:9px;cursor:pointer}.ai-report-layout{display:grid;grid-template-columns:330px minmax(0,1fr);min-height:630px}.ai-report-list{border-right:1px solid #1a334c;overflow:auto;max-height:calc(100vh - 220px)}.ai-report-day{padding:9px 12px 4px;color:#5e7891;font-size:8px;font-weight:900;letter-spacing:.08em}.ai-report-item{width:100%;display:block;padding:10px 12px;border:0;border-bottom:1px solid #152d44;background:transparent;color:#d4e2ee;text-align:left;cursor:pointer}.ai-report-item:hover,.ai-report-item.active{background:#10253a}.ai-report-item b{display:block;font-size:10px}.ai-report-item span{display:block;margin-top:4px;color:#69849d;font-size:8px}.ai-report-detail{padding:20px;overflow:auto}.ai-report-detail h3{font-size:18px;margin:5px 0 12px}.ai-report-detail p{white-space:pre-wrap;color:#b2c5d6;font-size:11px;line-height:1.7}.ai-report-tags{display:flex;gap:6px;flex-wrap:wrap}.ai-report-tags span{padding:4px 7px;border:1px solid #2a4a67;border-radius:999px;color:#8fb5d5;font-size:8px}.workspace-empty{padding:35px;color:#7892aa;font-size:11px;text-align:center}
      @media(max-width:1100px){.strategy-shell{grid-template-columns:1fr}.strategy-side{position:static}.workspace-inspector-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:760px){.strategy-main{min-height:560px}.strategy-messages{max-height:none}.strategy-head{align-items:flex-start;flex-direction:column}.strategy-head-actions{width:100%}.strategy-select{flex:1;max-width:none}.strategy-side{display:none}.ai-report-layout{grid-template-columns:1fr}.ai-report-list{border-right:0;border-bottom:1px solid #1a334c;max-height:260px}.workspace-inspector-grid{grid-template-columns:1fr}}
    `;
    document.head.append(style);
  }

  function showSection(section, title) {
    document.querySelectorAll('[data-panel]').forEach(panel => {
      const targets = String(panel.dataset.panel || '').split(' ');
      panel.classList.toggle('hidden-panel', !targets.includes(section));
    });
    document.querySelectorAll('.sidebar .nav').forEach(item => item.classList.remove('active'));
    const navItem = $(`.sidebar .nav[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');
    if ($('#pageTitle')) $('#pageTitle').textContent = title;
    $('.sidebar')?.classList.remove('open');
  }

  function groupLabel(text) {
    const label = document.createElement('small');
    label.className = 'ekodi-nav-group';
    label.textContent = text;
    return label;
  }

  function installNavigation() {
    const nav = $('.sidebar nav');
    if (!nav || nav.dataset.workspaceInstalled === 'true') return;
    nav.dataset.workspaceInstalled = 'true';

    const existing = [...nav.children];
    nav.replaceChildren();
    nav.append(groupLabel('MANAGE'));

    const dashboard = existing.find(item => item.dataset?.section === 'overview');
    if (dashboard) nav.append(dashboard);

    const strategy = document.createElement('button');
    strategy.type = 'button'; strategy.className = 'nav'; strategy.dataset.section = SECTION_STRATEGY;
    strategy.innerHTML = '<span>✦</span><span>전략회의</span>';
    strategy.addEventListener('click', () => { showSection(SECTION_STRATEGY, '전략회의'); loadStrategy(); });
    nav.append(strategy);

    const report = document.createElement('button');
    report.type = 'button'; report.className = 'nav'; report.dataset.section = SECTION_REPORT;
    report.innerHTML = '<span>≡</span><span>AI REPORT</span><em class="strategy-nav-badge" id="aiReportDecisionBadge" hidden>0</em>';
    report.addEventListener('click', () => { showSection(SECTION_REPORT, 'AI REPORT'); loadReports(true); });
    nav.append(report);

    existing.filter(item => item !== dashboard).forEach(item => nav.append(item));

    nav.append(groupLabel('SITES'));
    for (const site of SITES) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'nav workspace-site';
      button.dataset.workspaceSite = site.domain;
      button.innerHTML = `<span>◦</span><span>${esc(site.name)}</span><small>›</small>`;
      button.addEventListener('click', () => openSite(site));
      nav.append(button);
    }

    nav.querySelectorAll('.nav[data-section]:not([data-section="strategy"]):not([data-section="aireport"])').forEach(item => {
      item.addEventListener('click', () => nav.querySelectorAll('.workspace-site').forEach(site => site.classList.remove('active')));
    });
  }

  function installPanels() {
    const content = $('.content');
    if (!content || $('#strategyRoomPanel')) return;

    const strategy = document.createElement('section');
    strategy.id = 'strategyRoomPanel'; strategy.dataset.panel = SECTION_STRATEGY; strategy.className = 'hidden-panel';
    strategy.innerHTML = `
      <div class="strategy-shell">
        <section class="strategy-main">
          <header class="strategy-head"><div><p class="kicker">CHIEF AI COUNCIL</p><h2>EKODI 전략회의</h2><p>운영정보와 전문 AI 관점을 모아 판단합니다. 중요 변경은 대표 승인 없이 실행하지 않습니다.</p></div><div class="strategy-head-actions"><select id="strategyThreadSelect" class="strategy-select" aria-label="전략회의 선택"></select><button id="strategyNewThread" class="strategy-mini" type="button">＋ 새 회의</button></div></header>
          <div class="strategy-messages" id="strategyMessages" aria-live="polite"></div>
          <div class="strategy-quick"><button type="button" data-strategy-prompt="오늘 가장 중요한 3가지를 우선순위와 이유까지 정리해줘.">오늘 Top 3</button><button type="button" data-strategy-prompt="현재 EKODI 전체에서 위험과 기회를 함께 점검해줘.">위험 · 기회</button><button type="button" data-strategy-prompt="지금 대표의 결정이 필요한 사항만 골라줘.">DECISION</button><button type="button" data-strategy-prompt="현재 사이트 성능과 장애 가능성을 전문 AI들과 함께 검토해줘.">성능 점검</button></div>
          <form class="strategy-form" id="strategyForm"><textarea id="strategyInput" class="strategy-input" maxlength="6000" placeholder="총괄 AI와 전략회의를 시작하세요. 예: 오늘 가장 중요한 3가지는?" required></textarea><button id="strategySend" class="strategy-send" type="submit">전송</button></form>
        </section>
        <aside class="strategy-side"><small>EXECUTIVE VIEW</small><h3>회의 요약</h3><div id="strategyStats"></div><div class="strategy-side-list"><small>RECENT REPORT</small><div id="strategyRecentReports"></div></div></aside>
      </div>`;

    const reports = document.createElement('section');
    reports.id = 'aiReportPanel'; reports.dataset.panel = SECTION_REPORT; reports.className = 'hidden-panel';
    reports.innerHTML = `<div class="ai-report-shell"><header class="ai-report-head"><div><small>CHIEF AI LEDGER</small><h2>AI REPORT</h2></div><button id="aiReportRefresh" type="button">↻ 새로고침</button></header><div class="ai-report-layout"><div class="ai-report-list" id="aiReportList"></div><div class="ai-report-detail" id="aiReportDetail"><div class="workspace-empty">왼쪽에서 보고서를 선택하세요.</div></div></div></div>`;

    const preview = document.createElement('section');
    preview.id = 'sitePreviewPanel'; preview.dataset.panel = SECTION_PREVIEW; preview.className = 'hidden-panel';
    preview.innerHTML = `<div class="workspace-preview-shell"><div class="workspace-toolbar"><div><strong id="workspaceSiteName">사이트</strong><small id="workspaceSiteDomain"></small></div><button id="workspaceManage" type="button">관리</button><button id="workspaceRefresh" type="button">↻</button><a id="workspaceExternal" target="_blank" rel="noopener">↗ 새 창</a></div><div id="workspacePreviewBody" style="display:flex;flex:1;min-height:0"></div></div>`;

    content.append(strategy, reports, preview);
    bindPanels();
  }

  function bindPanels() {
    $('#strategyForm')?.addEventListener('submit', event => { event.preventDefault(); sendStrategy(); });
    $('#strategyNewThread')?.addEventListener('click', createNewThread);
    $('#strategyThreadSelect')?.addEventListener('change', event => { activeThread = event.target.value; sessionStorage.setItem(THREAD_KEY, activeThread); loadThread(activeThread); });
    document.querySelectorAll('[data-strategy-prompt]').forEach(button => button.addEventListener('click', () => { $('#strategyInput').value = button.dataset.strategyPrompt; $('#strategyInput').focus(); }));
    $('#aiReportRefresh')?.addEventListener('click', () => loadReports(true));
    $('#workspaceRefresh')?.addEventListener('click', () => { const site = SITES.find(item => item.domain === $('#workspaceSiteDomain')?.textContent); if (site) openSite(site, true); });
  }

  function messageNode(message) {
    const role = message.role === 'user' ? 'user' : 'assistant';
    const article = document.createElement('article'); article.className = `strategy-msg ${role}`;
    const avatar = document.createElement('span'); avatar.className = 'strategy-avatar'; avatar.textContent = role === 'user' ? 'ME' : 'AI';
    const bubble = document.createElement('div'); bubble.className = 'strategy-bubble';
    const meta = document.createElement('div'); meta.className = 'strategy-meta';
    const name = document.createElement('b'); name.textContent = role === 'user' ? '관리자' : 'Chief AI'; meta.append(name);
    if (role !== 'user') { const badge = document.createElement('span'); badge.className = `strategy-class ${String(message.classification || 'INFO').toLowerCase()}`; badge.textContent = message.classification || 'INFO'; meta.append(badge); }
    const time = document.createElement('span'); const date = new Date(message.created_at || Date.now()); time.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }); meta.append(time);
    const text = document.createElement('div'); text.className = 'strategy-text'; text.textContent = message.content || '';
    bubble.append(meta, text);
    if (Array.isArray(message.council) && message.council.length) {
      const details = document.createElement('details'); details.className = 'strategy-council'; const summary = document.createElement('summary'); summary.textContent = `AI Council · ${message.council.length}개 관점`; details.append(summary);
      for (const item of message.council) { const row = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = item.agent || item.name || 'Specialist AI'; const span = document.createElement('span'); span.textContent = item.conclusion || ''; row.append(strong, span); details.append(row); }
      bubble.append(details);
    }
    article.append(avatar, bubble); return article;
  }
  function renderMessages() {
    const host = $('#strategyMessages'); if (!host) return;
    if (!currentMessages.length) {
      host.innerHTML = '<div class="workspace-empty">Chief AI 전략회의실입니다.<br>운영·사역·사업의 우선순위, 위험, 기회, 결정사항을 자연어로 물어보세요.</div>';
      return;
    }
    host.replaceChildren(...currentMessages.map(messageNode)); requestAnimationFrame(() => { host.scrollTop = host.scrollHeight; });
  }

  async function loadThreads() {
    const data = await strategyRequest('/threads');
    const select = $('#strategyThreadSelect'); if (!select) return data.threads || [];
    select.replaceChildren();
    for (const thread of data.threads || []) { const option = document.createElement('option'); option.value = thread.id; option.textContent = thread.title || '전략회의'; select.append(option); }
    if (!(data.threads || []).length) { const option = document.createElement('option'); option.value = ''; option.textContent = '새 전략회의'; select.append(option); }
    if (activeThread && (data.threads || []).some(thread => thread.id === activeThread)) select.value = activeThread;
    else if ((data.threads || []).length) { activeThread = data.threads[0].id; select.value = activeThread; sessionStorage.setItem(THREAD_KEY, activeThread); }
    else { activeThread = ''; sessionStorage.removeItem(THREAD_KEY); }
    return data.threads || [];
  }
  async function loadThread(id) {
    if (!id) { currentMessages = []; renderMessages(); return; }
    try { const data = await strategyRequest(`/threads/${encodeURIComponent(id)}/messages`); currentMessages = data.messages || []; renderMessages(); }
    catch (error) { currentMessages = [{ role:'assistant', classification:'WARNING', content:error.message, created_at:new Date().toISOString(), council:[] }]; renderMessages(); }
  }
  async function createNewThread() {
    try { const data = await strategyRequest('/threads', { method:'POST', body:JSON.stringify({ title:'새 전략회의' }) }); activeThread = data.thread.id; sessionStorage.setItem(THREAD_KEY, activeThread); await loadThreads(); await loadThread(activeThread); $('#strategyInput')?.focus(); }
    catch (error) { alert(error.message); }
  }
  async function loadStrategy() {
    if (!token()) return;
    try { await loadThreads(); await Promise.all([loadThread(activeThread), loadReports(false)]); }
    catch (error) { currentMessages = [{ role:'assistant', classification:'WARNING', content:error.message, created_at:new Date().toISOString(), council:[] }]; renderMessages(); }
  }
  async function sendStrategy() {
    if (busy) return;
    const input = $('#strategyInput'); const send = $('#strategySend'); const message = String(input?.value || '').trim(); if (!message) return;
    busy = true; send.disabled = true; send.textContent = '회의 중…'; input.value = '';
    currentMessages.push({ role:'user', classification:'INFO', content:message, created_at:new Date().toISOString(), council:[] }); renderMessages();
    const waiting = { role:'assistant', classification:'INFO', content:'Chief AI가 운영정보와 관련 전문 AI 관점을 모으고 있습니다…', created_at:new Date().toISOString(), council:[] }; currentMessages.push(waiting); renderMessages();
    try {
      const data = await strategyRequest('/chat', { method:'POST', body:JSON.stringify({ thread_id:activeThread || null, message }) });
      activeThread = data.thread.id; sessionStorage.setItem(THREAD_KEY, activeThread); currentMessages[currentMessages.length - 1] = data.message; await Promise.all([loadThreads(), loadReports(true)]); renderMessages();
    } catch (error) {
      currentMessages[currentMessages.length - 1] = { role:'assistant', classification:'WARNING', content:`전략회의 연결을 확인해야 합니다. ${error.message}`, created_at:new Date().toISOString(), council:[] }; renderMessages();
    } finally { busy = false; send.disabled = false; send.textContent = '전송'; input?.focus(); }
  }

  function reportDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '날짜 미상' : date.toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', weekday:'short' }); }
  function reportTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }); }
  function updateReportSummary() {
    const decisions = currentReports.filter(item => item.decision_required && item.status === 'open').length;
    const warnings = currentReports.filter(item => ['WARNING','INCIDENT'].includes(item.report_type) && item.status === 'open').length;
    const badge = $('#aiReportDecisionBadge'); if (badge) { badge.textContent = String(decisions); badge.hidden = decisions === 0; }
    const stats = $('#strategyStats'); if (stats) stats.innerHTML = `<div class="strategy-stat"><span>결정 대기</span><strong>${decisions}</strong><em>대표 판단이 필요한 열린 안건</em></div><div class="strategy-stat"><span>경고 · 장애</span><strong>${warnings}</strong><em>운영 확인이 필요한 최근 기록</em></div><div class="strategy-stat"><span>최근 REPORT</span><strong>${currentReports.length}</strong><em>최대 80개 이력 기준</em></div>`;
    const recent = $('#strategyRecentReports'); if (recent) { recent.replaceChildren(); currentReports.slice(0, 5).forEach(item => { const button = document.createElement('button'); button.type = 'button'; button.className = 'strategy-side-report'; button.innerHTML = `<b>${esc(item.report_type)} · ${esc(item.title)}</b><span>${esc(reportDate(item.created_at))} ${esc(reportTime(item.created_at))}</span>`; button.addEventListener('click', () => { showSection(SECTION_REPORT, 'AI REPORT'); renderReportDetail(item); }); recent.append(button); }); if (!currentReports.length) recent.innerHTML = '<div class="workspace-empty">기록 없음</div>'; }
  }
  async function loadReports(force = false) {
    if (!token()) return;
    if (currentReports.length && !force) { updateReportSummary(); renderReportList(); return; }
    try { const data = await strategyRequest('/reports?limit=80'); currentReports = data.reports || []; updateReportSummary(); renderReportList(); }
    catch (error) { const list = $('#aiReportList'); if (list) list.innerHTML = `<div class="workspace-empty">${esc(error.message)}</div>`; }
  }
  function renderReportList() {
    const list = $('#aiReportList'); if (!list) return; list.replaceChildren(); let day = '';
    for (const item of currentReports) { const nextDay = reportDate(item.created_at); if (nextDay !== day) { day = nextDay; const label = document.createElement('div'); label.className = 'ai-report-day'; label.textContent = day; list.append(label); } const button = document.createElement('button'); button.type = 'button'; button.className = 'ai-report-item'; button.innerHTML = `<b>${esc(item.report_type)} · ${esc(item.title)}</b><span>${esc(reportTime(item.created_at))} · ${item.decision_required ? 'DECISION 필요' : esc(item.status)}</span>`; button.addEventListener('click', () => { list.querySelectorAll('.ai-report-item').forEach(node => node.classList.remove('active')); button.classList.add('active'); renderReportDetail(item); }); list.append(button); }
    if (!currentReports.length) list.innerHTML = '<div class="workspace-empty">아직 AI REPORT가 없습니다.</div>';
  }
  function renderReportDetail(item) {
    const detail = $('#aiReportDetail'); if (!detail) return; const services = Array.isArray(item.related_services) ? item.related_services : [];
    detail.innerHTML = `<div class="ai-report-tags"><span>${esc(item.report_type)}</span><span>${esc(item.status)}</span>${item.decision_required ? '<span>대표 DECISION</span>' : ''}${services.map(service => `<span>${esc(service)}</span>`).join('')}</div><h3>${esc(item.title)}</h3><small style="color:#66839d">${esc(reportDate(item.created_at))} ${esc(reportTime(item.created_at))}</small><p>${esc(item.details || item.summary || '')}</p>`;
  }

  async function siteHealth(site) {
    try {
      const response = await fetch('https://api.ekodi.kr/api/control/overview', { headers:headers(), cache:'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json(); return (data.services || []).find(item => String(item.domain || '').toLowerCase() === site.domain) || null;
    } catch { return null; }
  }
  async function openSite(site, refresh = false) {
    showSection(SECTION_PREVIEW, site.name); document.querySelectorAll('.workspace-site').forEach(item => item.classList.toggle('active', item.dataset.workspaceSite === site.domain));
    $('#workspaceSiteName').textContent = site.name; $('#workspaceSiteDomain').textContent = site.domain; $('#workspaceExternal').href = `https://${site.domain}`;
    const manage = $('#workspaceManage'); manage.onclick = () => { const button = $(`.sidebar .nav[data-section="${site.manage}"]`); if (button) button.click(); else alert('이 서비스의 전용 관리화면은 준비 중입니다.'); };
    const body = $('#workspacePreviewBody'); body.replaceChildren();
    if (site.embed) {
      const frame = document.createElement('iframe'); frame.className = 'workspace-frame'; frame.title = `${site.name} 사용자 화면`; frame.referrerPolicy = 'no-referrer'; frame.loading = 'eager'; frame.src = `https://${site.domain}${refresh ? `?admin_preview=${Date.now()}` : ''}`; frame.addEventListener('error', () => renderInspector(site, body)); body.append(frame); return;
    }
    await renderInspector(site, body);
  }
  async function renderInspector(site, body = $('#workspacePreviewBody')) {
    if (!body) return; const service = await siteHealth(site); body.replaceChildren(); const wrapper = document.createElement('div'); wrapper.className = 'workspace-inspector'; wrapper.style.width = '100%';
    const status = service?.latest?.status || '확인 전'; const response = service?.latest?.responseTime; const http = service?.latest?.httpStatus; const availability = service?.stats24h?.availabilityPercent;
    wrapper.innerHTML = `<p class="kicker">SITE INSPECTOR</p><h2 style="margin:6px 0 4px">${esc(site.name)}</h2><p style="margin:0;color:#7893ac;font-size:10px">${esc(site.domain)}</p><div class="workspace-inspector-grid"><article><small>현재 상태</small><strong>${esc(status)}</strong></article><article><small>HTTP</small><strong>${http ?? '—'}</strong></article><article><small>응답시간</small><strong>${Number.isFinite(response) ? `${response}ms` : '—'}</strong></article><article><small>24시간 가용률</small><strong>${Number.isFinite(availability) ? `${availability}%` : '—'}</strong></article></div><div class="workspace-note">이 사이트는 현재 보안상 관리자 iframe 직접 삽입을 허용하지 않습니다. 그래서 새 창을 강제하지 않고, 같은 오른쪽 Workspace 안에서 실시간 상태와 관리 연결을 먼저 제공합니다. 서비스별 보안 검증이 끝난 항목부터 실제 화면 미리보기를 단계적으로 허용합니다.</div>`; body.append(wrapper);
  }

  function init() {
    installStyles(); installNavigation(); installPanels();
    if (location.hash === '#strategy') { showSection(SECTION_STRATEGY, '전략회의'); loadStrategy(); }
    setTimeout(() => { if (token()) loadReports(false); }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();