(() => {
  'use strict';

  const API = 'https://api.ekodi.kr';
  const TOKEN_KEY = 'ekodi-auth-token';
  const STYLE_ID = 'ekodiMarketingOperationsV2Style';
  const TABS = [
    ['overview','개요'],
    ['content','콘텐츠'],
    ['channels','채널 연결'],
    ['publishing','예약·게시'],
    ['performance','성과'],
    ['improvement','AI 개선'],
  ];

  let activeTab = 'overview';
  let registry = null;
  let tenantId = '';
  let connections = [];
  let posts = [];
  let performance = null;
  let drafts = [];
  let installed = false;

  const token = () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  };
  const esc = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const slug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-|-$/g,'').slice(0,64);
  const dateText = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const stateLabel = value => ({connected:'연결됨',disconnected:'해제',expired:'만료',error:'오류',draft:'초안',scheduled:'예약',publishing:'게시 중',published:'게시됨',failed:'실패',cancelled:'취소'})[String(value || '').toLowerCase()] || String(value || '확인중');
  const providerLabel = value => ({facebook:'Facebook',instagram:'Instagram',youtube:'YouTube',meta:'Facebook · Instagram'})[String(value || '').toLowerCase()] || String(value || '채널');

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type','application/json');
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)),
      cache:'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `요청 실패 (${response.status})`);
    return data;
  }

  function styles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .marketing-ai-console-tabs{display:none!important}
      .marketing-os-tabs{display:flex;gap:5px;overflow-x:auto;padding:2px 0 10px;margin:0 0 10px;border-bottom:1px solid rgba(80,116,145,.18);scrollbar-width:thin}
      .marketing-os-tabs button{flex:0 0 auto;border:1px solid rgba(75,115,150,.24);background:transparent;color:inherit;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer}
      .marketing-os-tabs button.active{background:rgba(35,98,146,.12);border-color:rgba(35,98,146,.5);color:#dcecf7}
      .marketing-os-shell{display:grid;gap:10px}.marketing-os-card{border:1px solid rgba(89,126,155,.2);border-radius:12px;padding:13px;background:rgba(9,28,43,.34)}
      .marketing-os-card h3{margin:0 0 6px;font-size:15px}.marketing-os-card p{margin:0;color:#7891a5;font-size:11px;line-height:1.55}
      .marketing-os-toolbar{display:flex;gap:7px;align-items:end;flex-wrap:wrap}.marketing-os-toolbar label{display:grid;gap:4px;min-width:190px;font-size:10px;color:#7891a5}
      .marketing-os-toolbar select,.marketing-os-form input,.marketing-os-form textarea,.marketing-os-form select{width:100%;border:1px solid rgba(79,120,153,.3);border-radius:8px;background:rgba(4,18,30,.65);color:inherit;padding:8px 9px;font:inherit}
      .marketing-os-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.marketing-os-form label{display:grid;gap:4px;font-size:10px;color:#7891a5}.marketing-os-form .wide{grid-column:1/-1}.marketing-os-form textarea{min-height:95px;resize:vertical}
      .marketing-os-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.marketing-os-actions button,.marketing-os-toolbar button,.marketing-os-row button,.marketing-os-row a{border:1px solid rgba(59,114,154,.4);border-radius:8px;background:rgba(22,68,101,.38);color:#cde2ef;padding:7px 10px;font-weight:800;font-size:11px;text-decoration:none;cursor:pointer}.marketing-os-actions button.primary,.marketing-os-toolbar button.primary{background:#123d5b;border-color:#2b678f}
      .marketing-os-list{display:grid;gap:7px}.marketing-os-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;border:1px solid rgba(87,124,151,.18);border-radius:9px;padding:9px}.marketing-os-row strong{display:block;font-size:12px}.marketing-os-row small{display:block;color:#7891a5;font-size:10px;margin-top:2px;line-height:1.45}.marketing-os-row .state{font-size:10px;font-weight:900}.marketing-os-row .state.published,.marketing-os-row .state.connected{color:#79cda5}.marketing-os-row .state.failed,.marketing-os-row .state.error{color:#e69a9a}
      .marketing-os-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.marketing-os-kpis article{border:1px solid rgba(87,124,151,.18);border-radius:9px;padding:10px}.marketing-os-kpis small{display:block;color:#7891a5;font-size:9px}.marketing-os-kpis strong{display:block;font-size:20px;margin-top:3px}
      .marketing-os-empty{border:1px dashed rgba(87,124,151,.28);border-radius:9px;padding:13px;color:#7891a5;font-size:11px}.marketing-os-note{border:1px solid rgba(59,133,111,.28);background:rgba(25,77,62,.18);border-radius:9px;padding:9px;color:#9fc9ba;font-size:10px;line-height:1.55}.marketing-os-error{border-color:rgba(154,77,77,.4);color:#e8aaaa;background:rgba(96,35,35,.18)}
      .marketing-os-drafts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.marketing-os-draft{border:1px solid rgba(87,124,151,.18);border-radius:9px;padding:10px}.marketing-os-draft textarea{width:100%;min-height:115px;margin-top:7px;border:1px solid rgba(79,120,153,.3);border-radius:8px;background:rgba(4,18,30,.65);color:inherit;padding:8px}
      @media(max-width:900px){.marketing-os-form{grid-template-columns:1fr}.marketing-os-form .wide{grid-column:auto}.marketing-os-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.marketing-os-drafts{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function panelParts() {
    const panel = document.querySelector('#marketingAiAdminPanel');
    return { panel, view:panel?.querySelector('#marketingAiConsoleView'), oldTabs:panel?.querySelector('.marketing-ai-console-tabs'), message:panel?.querySelector('#marketingAiAdminMessage') };
  }
  function setMessage(text, error = false) {
    const { message } = panelParts();
    if (!message) return;
    message.textContent = text || '';
    message.classList.toggle('error', Boolean(error));
  }

  async function ensureRegistry(force = false) {
    if (registry && !force) return registry;
    const data = await api('/api/control/social/registry');
    registry = data.registry || { organizations:[] };
    const rows = (registry.organizations || []).filter(row => row.isActive !== false);
    if (!tenantId || !rows.some(row => row.id === tenantId)) tenantId = rows[0]?.id || '';
    return registry;
  }
  function tenants() { return (registry?.organizations || []).filter(row => row.isActive !== false); }
  function tenantSelectHtml() {
    const rows = tenants();
    return `<select data-marketing-tenant>${rows.map(row => `<option value="${esc(row.id)}" ${row.id === tenantId ? 'selected' : ''}>${esc(row.name || row.id)}</option>`).join('')}</select>`;
  }
  async function ensureTenant() {
    await ensureRegistry();
    if (!tenantId) throw new Error('소셜 운영 공간이 없습니다. 조직·사업에서 운영 공간을 먼저 준비해 주세요.');
  }
  async function loadConnections() {
    await ensureTenant();
    const data = await api(`/api/control/social/connections?tenantId=${encodeURIComponent(tenantId)}`);
    connections = data.connections || [];
    return connections;
  }
  async function loadPosts() {
    await ensureTenant();
    const data = await api(`/api/control/social/posts?tenantId=${encodeURIComponent(tenantId)}`);
    posts = data.posts || [];
    return posts;
  }
  async function loadPerformance() {
    await ensureTenant();
    performance = await api(`/api/control/social/performance?tenantId=${encodeURIComponent(tenantId)}`);
    return performance;
  }

  function bindTenant(view, rerender) {
    const picker = view.querySelector('[data-marketing-tenant]');
    if (!picker) return;
    picker.addEventListener('change', async () => {
      tenantId = picker.value;
      connections = []; posts = []; performance = null; drafts = [];
      await rerender();
    });
  }

  function shell(title, description, body = '') {
    return `<div class="marketing-os-shell"><section class="marketing-os-card"><h3>${esc(title)}</h3><p>${esc(description)}</p></section>${body}</div>`;
  }

  async function renderContent(view) {
    await ensureTenant();
    view.innerHTML = shell('콘텐츠 생성','상품·주제와 대상만 입력하면 최근 성과를 참고해 채널별 초안을 만듭니다. AI 공급자가 없을 때도 규칙 기반 초안으로 계속 작동합니다.',`
      <section class="marketing-os-card">
        <div class="marketing-os-toolbar"><label>운영 공간${tenantSelectHtml()}</label></div>
        <div class="marketing-os-form" style="margin-top:10px">
          <label>상품·주제<input data-field="topic" placeholder="예: 이번 주 친환경 추천 상품"></label>
          <label>핵심 효익<input data-field="benefit" placeholder="사용자에게 어떤 도움이 되는가"></label>
          <label>주요 대상<input data-field="audience" placeholder="예: 친환경 생활을 시작하는 30~40대"></label>
          <label>행동 유도<input data-field="cta" value="에코디몰에서 확인해 보세요."></label>
          <label class="wide">목적지 URL<input data-field="destination" value="https://mall.ekodi.kr"></label>
        </div>
        <div class="marketing-os-actions"><button class="primary" type="button" data-generate>AI 초안 생성</button></div>
        <div data-drafts style="margin-top:10px"></div>
      </section>`);
    bindTenant(view, () => renderContent(view));
    const button = view.querySelector('[data-generate]');
    button?.addEventListener('click', async () => {
      const get = key => view.querySelector(`[data-field="${key}"]`)?.value || '';
      try {
        button.disabled = true; setMessage('성과 패턴을 반영해 채널별 초안을 생성하고 있습니다.');
        const data = await api('/api/control/social/content/generate',{method:'POST',body:{tenantId,product:get('topic'),topic:get('topic'),benefit:get('benefit'),audience:get('audience'),cta:get('cta'),destinationUrl:get('destination'),providers:['facebook','instagram','youtube']}});
        drafts = data.drafts || [];
        const box = view.querySelector('[data-drafts]');
        box.innerHTML = drafts.length ? `<div class="marketing-os-drafts">${drafts.map((draft,index) => `<article class="marketing-os-draft"><strong>${esc(providerLabel(draft.provider))}</strong>${draft.title ? `<input data-draft-title="${index}" value="${esc(draft.title)}" style="width:100%;margin-top:7px">` : ''}<textarea data-draft-message="${index}">${esc(draft.message)}</textarea><small>${esc(draft.guidance || '')}</small></article>`).join('')}</div>` : '<div class="marketing-os-empty">생성된 초안이 없습니다.</div>';
        setMessage(data.mode === 'ai' ? 'AI 초안을 생성했습니다.' : `규칙 기반 안전 초안을 생성했습니다. ${data.notice || ''}`);
      } catch (error) { setMessage(error.message,true); }
      finally { button.disabled = false; }
    });
  }

  async function connect(provider) {
    await ensureTenant();
    const data = await api(`/api/control/social/oauth/${provider}/start`,{method:'POST',body:{tenantId,returnUrl:`${location.origin}${location.pathname}#marketing-ai`}});
    if (!data.authorizationUrl) throw new Error('공식 인증 주소를 받지 못했습니다.');
    location.assign(data.authorizationUrl);
  }

  async function renderChannels(view) {
    await Promise.all([ensureRegistry(),loadConnections()]);
    const connected = provider => connections.filter(row => row.provider === provider && row.status === 'connected');
    view.innerHTML = shell('채널 연결','Facebook·Instagram·YouTube 공식 OAuth를 에코디가 직접 연결합니다. Access Token이나 Page ID를 복사해 넣지 않습니다.',`
      <section class="marketing-os-card">
        <div class="marketing-os-toolbar"><label>운영 공간${tenantSelectHtml()}</label><button class="primary" type="button" data-connect="meta">Facebook · Instagram 연결</button><button class="primary" type="button" data-connect="youtube">YouTube 연결</button><button type="button" data-refresh>↻ 상태 새로고침</button></div>
      </section>
      <section class="marketing-os-card"><div class="marketing-os-kpis"><article><small>Facebook</small><strong>${connected('facebook').length}</strong></article><article><small>Instagram</small><strong>${connected('instagram').length}</strong></article><article><small>YouTube</small><strong>${connected('youtube').length}</strong></article><article><small>전체 연결</small><strong>${connections.filter(row=>row.status==='connected').length}</strong></article></div></section>
      <section class="marketing-os-card"><div class="marketing-os-list">${connections.length ? connections.map(row => `<article class="marketing-os-row"><div><strong>${esc(providerLabel(row.provider))} · ${esc(row.accountName || row.accountHandle || row.providerAccountId)}</strong><small>${esc(row.scopes || '권한 범위 확인 중')} · 토큰 만료 ${esc(dateText(row.tokenExpiresAt))}</small></div><div><span class="state ${esc(row.status)}">${esc(stateLabel(row.status))}</span><button type="button" data-disconnect="${esc(row.id)}">연결 해제</button></div></article>`).join('') : '<div class="marketing-os-empty">아직 연결된 계정이 없습니다.</div>'}</div></section>`);
    bindTenant(view, () => renderChannels(view));
    view.querySelectorAll('[data-connect]').forEach(button => button.addEventListener('click', async () => {
      try { button.disabled = true; setMessage('공식 계정 인증 화면을 준비하고 있습니다.'); await connect(button.dataset.connect); }
      catch (error) { button.disabled = false; setMessage(error.message,true); }
    }));
    view.querySelector('[data-refresh]')?.addEventListener('click',() => renderChannels(view).catch(error=>setMessage(error.message,true)));
    view.querySelectorAll('[data-disconnect]').forEach(button => button.addEventListener('click', async () => {
      try { await api(`/api/control/social/connections/${encodeURIComponent(button.dataset.disconnect)}`,{method:'DELETE'}); await renderChannels(view); setMessage('채널 연결을 해제했습니다.'); }
      catch (error) { setMessage(error.message,true); }
    }));
  }

  async function renderPublishing(view) {
    await Promise.all([ensureRegistry(),loadConnections(),loadPosts()]);
    const usable = connections.filter(row => row.status === 'connected');
    view.innerHTML = shell('예약·게시','게시물마다 UTM을 자동 부여하고, 플랫폼이 실제 게시 ID를 반환했을 때만 게시 성공으로 기록합니다.',`
      <section class="marketing-os-card">
        <div class="marketing-os-toolbar"><label>운영 공간${tenantSelectHtml()}</label><button type="button" data-refresh>↻ 게시 큐 새로고침</button></div>
        <div class="marketing-os-form" style="margin-top:10px">
          <label>채널<select data-field="connection">${usable.map(row=>`<option value="${esc(row.id)}" data-provider="${esc(row.provider)}">${esc(providerLabel(row.provider))} · ${esc(row.accountName || row.accountHandle || row.providerAccountId)}</option>`).join('')}</select></label>
          <label>캠페인<input data-field="campaign" placeholder="예: mall-weekly-picks"></label>
          <label>제목<input data-field="title" placeholder="YouTube 제목"></label>
          <label>미디어 형식<select data-field="assetType"><option value="">없음</option><option value="image">이미지</option><option value="video">영상</option></select></label>
          <label class="wide">게시 문안<textarea data-field="message" placeholder="게시할 문안"></textarea></label>
          <label class="wide">미디어 URL<input data-field="assetUrl" type="url" placeholder="https://…"></label>
          <label>예약 시각<input data-field="scheduledAt" type="datetime-local"></label>
          <label>목적지 URL<input data-field="destination" type="url" value="https://mall.ekodi.kr"></label>
        </div>
        <div class="marketing-os-actions"><button type="button" data-action="draft">초안 저장</button><button class="primary" type="button" data-action="schedule">예약 저장</button><button class="primary" type="button" data-action="publish">지금 게시</button></div>
      </section>
      <section class="marketing-os-card"><h3>게시 큐 · 실제 결과</h3><div class="marketing-os-list">${posts.length ? posts.map(post=>`<article class="marketing-os-row"><div><strong>${esc(providerLabel(post.provider))} · ${esc(post.title || String(post.message || '').slice(0,70) || '게시물')}</strong><small>예약 ${esc(dateText(post.scheduledAt))} · 게시 ${esc(dateText(post.publishedAt))} · 시도 ${Number(post.attemptCount||0)}</small>${post.trackedUrl?`<small>UTM ${esc(post.trackedUrl)}</small>`:''}${post.lastErrorMessage?`<small>${esc(post.lastErrorCode || 'ERROR')} · ${esc(post.lastErrorMessage)}</small>`:''}</div><div><span class="state ${esc(post.state)}">${esc(stateLabel(post.state))}</span>${post.providerUrl?`<a href="${esc(post.providerUrl)}" target="_blank" rel="noopener">게시물 ↗</a>`:''}${post.state==='failed'?`<button type="button" data-retry="${esc(post.id)}">재시도</button>`:''}</div></article>`).join('') : '<div class="marketing-os-empty">아직 게시 기록이 없습니다.</div>'}</div></section>`);
    bindTenant(view, () => renderPublishing(view));
    view.querySelector('[data-refresh]')?.addEventListener('click',() => renderPublishing(view).catch(error=>setMessage(error.message,true)));
    const get = key => view.querySelector(`[data-field="${key}"]`)?.value || '';
    view.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
      try {
        const connectionId = get('connection');
        if (!connectionId) throw new Error('먼저 채널을 연결해 주세요.');
        const selected = view.querySelector('[data-field="connection"]')?.selectedOptions?.[0];
        const scheduledAt = get('scheduledAt');
        if (button.dataset.action === 'schedule' && !scheduledAt) throw new Error('예약 시각을 선택해 주세요.');
        button.disabled = true; setMessage('게시 데이터를 저장하고 있습니다.');
        const created = await api('/api/control/social/posts',{method:'POST',body:{tenantId,connectionId,title:get('title'),message:get('message'),assetUrl:get('assetUrl'),assetType:get('assetType'),destinationUrl:get('destination'),utmCampaign:slug(get('campaign')||'marketing'),scheduledAt:button.dataset.action==='schedule'?new Date(scheduledAt).toISOString():undefined,metadata:{privacyStatus:'public',provider:selected?.dataset.provider||''}}});
        if (button.dataset.action === 'publish') await api(`/api/control/social/posts/${encodeURIComponent(created.post.id)}/publish`,{method:'POST',body:{}});
        await renderPublishing(view);
        setMessage(button.dataset.action === 'publish' ? '플랫폼의 실제 응답을 확인해 게시 결과를 기록했습니다.' : button.dataset.action === 'schedule' ? '예약 게시를 저장했습니다.' : '게시 초안을 저장했습니다.');
      } catch (error) { setMessage(error.message,true); }
      finally { button.disabled = false; }
    }));
    view.querySelectorAll('[data-retry]').forEach(button => button.addEventListener('click', async () => {
      try { await api(`/api/control/social/posts/${encodeURIComponent(button.dataset.retry)}/retry`,{method:'POST',body:{}}); await renderPublishing(view); setMessage('실패 게시물을 재시도 큐에 넣었습니다.'); }
      catch (error) { setMessage(error.message,true); }
    }));
  }

  function totals(data) {
    const rows = data?.posts || [];
    return {
      posts:rows.filter(row=>row.state==='published').length,
      views:rows.reduce((sum,row)=>sum+Number(row.views||0),0),
      clicks:rows.reduce((sum,row)=>sum+Number(row.clicks||0),0),
      conversions:rows.reduce((sum,row)=>sum+Number(row.conversions||0),0),
    };
  }

  async function renderPerformance(view) {
    await Promise.all([ensureRegistry(),loadPerformance()]);
    const metric = totals(performance);
    view.innerHTML = shell('성과','플랫폼 조회·반응과 에코디몰 UTM 유입·클릭·전환을 게시물 단위로 합쳐 봅니다.',`
      <section class="marketing-os-card"><div class="marketing-os-toolbar"><label>운영 공간${tenantSelectHtml()}</label><button class="primary" type="button" data-sync>성과 새로 수집</button></div></section>
      <section class="marketing-os-card"><div class="marketing-os-kpis"><article><small>게시</small><strong>${metric.posts}</strong></article><article><small>조회</small><strong>${metric.views}</strong></article><article><small>클릭</small><strong>${metric.clicks}</strong></article><article><small>전환</small><strong>${metric.conversions}</strong></article></div></section>
      <section class="marketing-os-card"><div class="marketing-os-list">${(performance?.posts||[]).length ? performance.posts.map(row=>`<article class="marketing-os-row"><div><strong>${esc(providerLabel(row.provider))} · ${esc(row.title || String(row.message||'').slice(0,60) || row.id)}</strong><small>조회 ${Number(row.views||0).toLocaleString()} · 클릭 ${Number(row.clicks||0).toLocaleString()} · 전환 ${Number(row.conversions||0).toLocaleString()}</small></div><span class="state ${esc(row.state)}">${esc(stateLabel(row.state))}</span></article>`).join('') : '<div class="marketing-os-empty">성과 데이터가 아직 없습니다.</div>'}</div></section>`);
    bindTenant(view, () => renderPerformance(view));
    view.querySelector('[data-sync]')?.addEventListener('click', async event => {
      try { event.currentTarget.disabled=true;setMessage('Facebook·Instagram·YouTube와 유입 데이터를 동기화하고 있습니다.');await api('/api/control/social/metrics/sync',{method:'POST',body:{tenantId}});await renderPerformance(view);setMessage('최신 성과를 수집했습니다.'); }
      catch(error){setMessage(error.message,true);} finally{event.currentTarget.disabled=false;}
    });
  }

  async function renderImprovement(view) {
    await Promise.all([ensureRegistry(),loadPerformance()]);
    const learnings = performance?.learnings || [];
    view.innerHTML = shell('AI 개선','반응이 좋았던 채널·문안·시간대 패턴을 다음 콘텐츠 생성에 다시 사용합니다. 데이터가 부족할 때는 억지로 결론내지 않습니다.',`
      <section class="marketing-os-card"><div class="marketing-os-toolbar"><label>운영 공간${tenantSelectHtml()}</label><button type="button" data-refresh>↻ 학습 새로고침</button></div></section>
      <section class="marketing-os-card"><div class="marketing-os-list">${learnings.length ? learnings.map(item=>`<article class="marketing-os-row"><div><strong>${esc(providerLabel(item.provider || '전체'))} · 신뢰도 ${Math.round(Number(item.confidence||0)*100)}%</strong><small>${esc(item.summary || '학습 요약 없음')} · 갱신 ${esc(dateText(item.updated_at))}</small></div><span class="state connected">반복 후보</span></article>`).join('') : '<div class="marketing-os-empty">아직 반복할 만큼의 성과 데이터가 없습니다. 실제 게시와 클릭·전환이 쌓이면 성공 패턴을 제안합니다.</div>'}</div></section>
      <section class="marketing-os-card"><div class="marketing-os-note">AI 개선은 성과가 높은 패턴을 참고하지만 같은 문안을 과도하게 반복하지 않습니다. 채널별 게시 빈도와 최근 실패 이력을 함께 고려해 다음 초안을 생성합니다.</div><div class="marketing-os-actions"><button class="primary" type="button" data-next-content>학습을 반영해 새 콘텐츠 만들기</button></div></section>`);
    bindTenant(view, () => renderImprovement(view));
    view.querySelector('[data-refresh]')?.addEventListener('click',() => renderImprovement(view).catch(error=>setMessage(error.message,true)));
    view.querySelector('[data-next-content]')?.addEventListener('click',() => selectTab('content'));
  }

  async function renderCustom(tab) {
    const { view } = panelParts();
    if (!view) return;
    view.innerHTML = '<div class="marketing-os-empty">운영 데이터를 불러오는 중입니다.</div>';
    try {
      if (!token()) throw new Error('관리자 로그인이 필요합니다.');
      if (tab === 'content') await renderContent(view);
      else if (tab === 'channels') await renderChannels(view);
      else if (tab === 'publishing') await renderPublishing(view);
      else if (tab === 'performance') await renderPerformance(view);
      else if (tab === 'improvement') await renderImprovement(view);
      setMessage('마케팅 운영 데이터를 불러왔습니다.');
    } catch (error) {
      view.innerHTML = `<div class="marketing-os-empty marketing-os-error">${esc(error.message)}</div>`;
      setMessage(error.message,true);
    }
  }

  function selectTab(tab) {
    activeTab = TABS.some(([key])=>key===tab) ? tab : 'overview';
    const { panel, oldTabs } = panelParts();
    panel?.querySelectorAll('[data-marketing-os-tab]').forEach(button => button.classList.toggle('active',button.dataset.marketingOsTab===activeTab));
    if (activeTab === 'overview') {
      oldTabs?.querySelector('[data-marketing-tab="overview"]')?.click();
      setMessage('마케팅 운영 개요입니다.');
      return;
    }
    renderCustom(activeTab);
  }

  function install() {
    if (installed) return true;
    const { panel, oldTabs } = panelParts();
    if (!panel || !oldTabs) return false;
    installed = true; styles();
    const title = panel.querySelector('.marketing-ai-admin-toolbar-copy h2');
    const desc = panel.querySelector('.marketing-ai-admin-toolbar-copy p');
    const eyebrow = panel.querySelector('.marketing-ai-admin-eyebrow span:first-child');
    if (title) title.textContent = '마케팅 운영';
    if (desc) desc.textContent = '콘텐츠 생성부터 채널 연결, 예약·게시, UTM 성과, AI 개선까지 한 흐름에서 직접 운영합니다.';
    if (eyebrow) eyebrow.textContent = 'MARKETING OPERATIONS';

    const nav = document.createElement('nav');
    nav.className = 'marketing-os-tabs';
    nav.setAttribute('aria-label','마케팅 운영 메뉴');
    nav.innerHTML = TABS.map(([key,label])=>`<button type="button" data-marketing-os-tab="${key}" class="${key==='overview'?'active':''}">${label}</button>`).join('');
    oldTabs.insertAdjacentElement('afterend',nav);
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-marketing-os-tab]');
      if (button) selectTab(button.dataset.marketingOsTab);
    });
    return true;
  }

  function start() {
    if (install()) return;
    const observer = new MutationObserver(() => { if (install()) observer.disconnect(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.setTimeout(()=>observer.disconnect(),12000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
