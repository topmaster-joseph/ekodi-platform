(() => {
  'use strict';

  const TAB_KEY = 'channels';
  const PROXY = '/api/control/marketing-publishing';
  const METRICOOL = 'https://app.metricool.com/';
  const STYLE_ID = 'marketingAiChannelManagerStyle';
  const providerMeta = {
    facebook:{label:'Facebook',kind:'페이지',secret:'META_FACEBOOK_ACCESS_TOKEN',help:'Meta Page ID와 Page Access Token Secret이 필요합니다.'},
    instagram:{label:'Instagram',kind:'비즈니스 계정',secret:'META_INSTAGRAM_ACCESS_TOKEN',help:'Instagram Business Account ID와 Meta Access Token Secret이 필요합니다.'},
    threads:{label:'Threads',kind:'프로필',secret:'META_THREADS_ACCESS_TOKEN',help:'Threads User ID와 Threads Access Token Secret이 필요합니다.'},
  };
  let loading = false;
  let installed = false;

  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dateText = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const statusLabel = status => ({active:'연결됨',credentials_required:'인증 필요',disabled:'중지',error:'오류',published:'게시완료',scheduled:'예약',queued:'게시 대기',publishing:'게시중',retrying:'재시도',failed:'실패',cancelled:'취소'})[String(status || '').toLowerCase()] || String(status || '확인중');

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .marketing-ai-channel-manager{display:grid;gap:10px}.marketing-ai-channel-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.marketing-ai-channel-summary article,.marketing-ai-channel-provider,.marketing-ai-channel-form,.marketing-ai-channel-history{padding:11px;border:1px solid #193852;border-radius:10px;background:#081827}.marketing-ai-channel-summary small{display:block;color:#67839a;font-size:6px}.marketing-ai-channel-summary strong{display:block;margin-top:4px;color:#e4f1fb;font-size:14px}.marketing-ai-channel-provider-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.marketing-ai-channel-provider{min-height:112px;display:flex;flex-direction:column;gap:5px}.marketing-ai-channel-provider header{display:flex;align-items:center;justify-content:space-between;gap:6px}.marketing-ai-channel-provider h4{margin:0;color:#dbeaf6;font-size:8px}.marketing-ai-channel-provider p{margin:0;color:#718aa0;font-size:6px;line-height:1.45}.marketing-ai-channel-provider button,.marketing-ai-channel-provider a,.marketing-ai-channel-actions button,.marketing-ai-channel-form button{margin-top:auto;display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:0 8px;border:1px solid #285173;border-radius:7px;background:#0d2940;color:#a8c8df;font-size:6px;font-weight:900;text-decoration:none;cursor:pointer}.marketing-ai-channel-provider .state,.marketing-ai-channel-row .state{display:inline-flex;padding:3px 5px;border:1px solid #3b536a;border-radius:999px;color:#94adc1;font-size:5.5px;font-weight:900}.marketing-ai-channel-provider .state.active,.marketing-ai-channel-row .state.active{border-color:#2e6658;background:#12352d;color:#8ed2b9}.marketing-ai-channel-provider .state.credentials_required,.marketing-ai-channel-row .state.credentials_required{border-color:#735038;background:#352616;color:#f3c27f}.marketing-ai-channel-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:8px}.marketing-ai-channel-form h4,.marketing-ai-channel-history h4{margin:0 0 8px;color:#dbeaf6;font-size:8px}.marketing-ai-channel-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.marketing-ai-channel-form label{display:grid;gap:3px;color:#7991a5;font-size:5.8px}.marketing-ai-channel-form input,.marketing-ai-channel-form select{width:100%;min-height:29px;padding:5px 7px;border:1px solid #25445e;border-radius:7px;background:#07131f;color:#d7e8f5;font-size:6.5px}.marketing-ai-channel-form .full{grid-column:1/-1}.marketing-ai-channel-form-note{margin:8px 0;color:#8a9fb1;font-size:5.8px;line-height:1.5}.marketing-ai-channel-form-result{min-height:18px;margin-top:6px;color:#90b9d6;font-size:6px}.marketing-ai-channel-list,.marketing-ai-channel-job-list{display:grid;gap:5px}.marketing-ai-channel-row,.marketing-ai-channel-job{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px;padding:7px;border:1px solid #17344c;border-radius:8px;background:#071723}.marketing-ai-channel-row strong,.marketing-ai-channel-job strong{color:#cfe1ef;font-size:6.8px}.marketing-ai-channel-row span,.marketing-ai-channel-row small,.marketing-ai-channel-job span,.marketing-ai-channel-job small{color:#6f879c;font-size:5.6px}.marketing-ai-channel-row .meta,.marketing-ai-channel-job .meta{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.marketing-ai-channel-actions{display:flex;gap:5px;margin-top:7px}.marketing-ai-channel-empty{padding:10px;border:1px dashed #29465e;border-radius:8px;color:#7890a5;font-size:6px;line-height:1.5}.marketing-ai-channel-security{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:9px;border:1px solid #4f4532;border-radius:9px;background:#1d1a13}.marketing-ai-channel-security b{display:block;color:#e0b77d;font-size:6.5px}.marketing-ai-channel-security span{display:block;margin-top:2px;color:#a48d6d;font-size:5.8px;line-height:1.45}.marketing-ai-channel-security button{flex:0 0 auto;padding:6px 8px;border:1px solid #685638;border-radius:7px;background:#2b2418;color:#e4c18d;font-size:5.8px;cursor:pointer}
      @media(max-width:1080px){.marketing-ai-channel-provider-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.marketing-ai-channel-grid{grid-template-columns:1fr}.marketing-ai-channel-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:680px){.marketing-ai-channel-provider-grid,.marketing-ai-channel-summary,.marketing-ai-channel-form-grid{grid-template-columns:1fr}.marketing-ai-channel-form .full{grid-column:auto}}
    `;
    document.head.append(style);
  }

  function endpoint(path, subject = 'person', key = '') {
    const url = new URL(`${PROXY}${path}`, location.origin);
    url.searchParams.set('subject_type', subject);
    if (key) url.searchParams.set('subject_key', key);
    return url.toString();
  }

  async function request(path, {method='GET', body, subject='person', key=''} = {}) {
    const headers = new Headers();
    if (token()) headers.set('authorization', `Bearer ${token()}`);
    if (body !== undefined) headers.set('content-type','application/json');
    const response = await fetch(endpoint(path,subject,key), {method,headers,body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store'});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `채널 API 요청 실패 (${response.status})`);
    return data;
  }

  function channelRows(channels) {
    if (!channels.length) return '<div class="marketing-ai-channel-empty">아직 에코디 게시 엔진에 등록된 외부 채널이 없습니다. 아래에서 계정 메타정보와 Secret 참조를 등록하면 연결 상태가 이곳에 나타납니다.</div>';
    return `<div class="marketing-ai-channel-list">${channels.map(row => `<article class="marketing-ai-channel-row"><div><strong>${esc(row.display_name || row.provider)}</strong><div class="meta"><span>${esc(String(row.provider || '').toUpperCase())} · ${esc(row.channel_type || 'channel')}</span><span>계정 ${esc(row.external_account_id || '—')}</span><small>최근 확인 ${esc(dateText(row.last_check_at || row.updated_at))}</small></div>${row.last_error ? `<small>오류: ${esc(row.last_error)}</small>` : ''}</div><span class="state ${esc(row.status)}">${esc(statusLabel(row.status))}</span></article>`).join('')}</div>`;
  }

  function jobRows(jobs) {
    if (!jobs.length) return '<div class="marketing-ai-channel-empty">에코디 직접 게시 엔진의 최근 게시 이력이 없습니다. Metricool 예약 내역은 외부 어댑터에서 별도로 확인합니다.</div>';
    return `<div class="marketing-ai-channel-job-list">${jobs.slice(0,12).map(row => `<article class="marketing-ai-channel-job"><div><strong>${esc(row.title || row.content_type || '게시 콘텐츠')}</strong><div class="meta"><span>${esc(row.provider || '채널')} · ${esc(row.channel_name || row.display_name || '')}</span><small>${esc(dateText(row.published_at || row.scheduled_at || row.updated_at))}</small>${row.external_post_url ? `<a href="${esc(row.external_post_url)}" target="_blank" rel="noopener">게시물 ↗</a>` : ''}</div>${row.last_error ? `<small>오류: ${esc(row.last_error)}</small>` : ''}</div><span class="state ${esc(row.status)}">${esc(statusLabel(row.status))}</span></article>`).join('')}</div>`;
  }

  function providerCards(channels) {
    const cards = Object.entries(providerMeta).map(([key,meta]) => {
      const rows = channels.filter(row => String(row.provider).toLowerCase() === key);
      const active = rows.filter(row => row.status === 'active').length;
      const state = active ? 'active' : rows.length ? rows[0].status : 'not_connected';
      return `<article class="marketing-ai-channel-provider"><header><h4>${meta.label}</h4><span class="state ${esc(state)}">${active ? `${active} 연결` : rows.length ? esc(statusLabel(state)) : '미연결'}</span></header><p>${meta.help}</p><button type="button" data-prefill-provider="${key}">연결정보 등록</button></article>`;
    });
    cards.push(`<article class="marketing-ai-channel-provider"><header><h4>Metricool</h4><span class="state">외부 어댑터</span></header><p>여러 SNS 예약·게시를 묶는 외부 연결 허브입니다. 실제 소셜 OAuth 연결은 Metricool Connection Dashboard에서 승인합니다.</p><a href="${METRICOOL}" target="_blank" rel="noopener">Metricool 연결센터 ↗</a></article>`);
    return cards.join('');
  }

  async function renderManager() {
    const panel = document.querySelector('#marketingAiAdminPanel');
    const tab = panel?.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
    const view = panel?.querySelector('#marketingAiConsoleView');
    if (!panel || !tab || !view || !tab.classList.contains('active') || loading) return;
    ensureStyles();
    loading = true;
    view.innerHTML = '<div class="marketing-ai-channel-manager" data-channel-manager><div class="marketing-ai-loading">채널 연결상태와 게시 이력을 확인하는 중입니다.</div></div>';
    try {
      if (!token()) throw new Error('관리자 로그인이 필요합니다.');
      const [channelData, jobData] = await Promise.all([request('/v1/channels'),request('/v1/jobs')]);
      const channels = Array.isArray(channelData.channels) ? channelData.channels : [];
      const jobs = Array.isArray(jobData.jobs) ? jobData.jobs : [];
      const active = channels.filter(row => row.status === 'active').length;
      const needAuth = channels.filter(row => row.status === 'credentials_required').length;
      const published = jobs.filter(row => row.status === 'published').length;
      const pending = jobs.filter(row => ['scheduled','queued','publishing','retrying'].includes(row.status)).length;
      view.innerHTML = `<div class="marketing-ai-channel-manager" data-channel-manager>
        <div class="marketing-ai-channel-summary"><article><small>등록 채널</small><strong>${channels.length}</strong></article><article><small>활성 연결</small><strong>${active}</strong></article><article><small>인증 필요</small><strong>${needAuth}</strong></article><article><small>최근 게시 / 대기</small><strong>${published} / ${pending}</strong></article></div>
        <div class="marketing-ai-channel-security"><div><b>보안 원칙</b><span>Access Token·비밀번호는 에코디 DB에 저장하지 않습니다. 여기에는 계정 ID와 Cloudflare Secret의 참조 이름만 기록합니다.</span></div><button type="button" data-open-security>비밀키 관리</button></div>
        <div class="marketing-ai-channel-provider-grid">${providerCards(channels)}</div>
        <div class="marketing-ai-channel-grid">
          <section class="marketing-ai-channel-form"><h4>외부 계정 연결정보 등록</h4><form data-channel-form><div class="marketing-ai-channel-form-grid">
            <label>채널<select name="provider"><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="threads">Threads</option></select></label>
            <label>채널 유형<input name="channelType" value="page" maxlength="50"></label>
            <label>표시 이름<input name="displayName" required placeholder="예: 에코디 공식 Facebook" maxlength="120"></label>
            <label>외부 계정 ID<input name="externalAccountId" placeholder="Page / Business / User ID" maxlength="160"></label>
            <label class="full">Secret 참조 이름<input name="credentialRef" value="META_FACEBOOK_ACCESS_TOKEN" pattern="[A-Z0-9_]{3,80}" placeholder="META_FACEBOOK_ACCESS_TOKEN"></label>
          </div><p class="marketing-ai-channel-form-note">등록 직후 해당 Secret이 게시 Worker에 존재하면 ‘연결됨’, 없으면 ‘인증 필요’로 표시됩니다. 실제 토큰 값은 이 화면에 입력하지 않습니다.</p><button type="submit">연결정보 저장</button><div class="marketing-ai-channel-form-result" data-channel-result></div></form></section>
          <section class="marketing-ai-channel-history"><h4>현재 연결 채널</h4>${channelRows(channels)}<div class="marketing-ai-channel-actions"><button type="button" data-channel-refresh>상태 새로고침</button></div></section>
        </div>
        <section class="marketing-ai-channel-history"><h4>최근 에코디 직접 게시 이력</h4>${jobRows(jobs)}</section>
      </div>`;

      const form = view.querySelector('[data-channel-form]');
      const provider = form?.elements?.provider;
      const channelType = form?.elements?.channelType;
      const secretRef = form?.elements?.credentialRef;
      const syncDefaults = () => {
        const key = provider?.value || 'facebook';
        if (channelType) channelType.value = providerMeta[key]?.kind === '페이지' ? 'page' : providerMeta[key]?.kind === '비즈니스 계정' ? 'business' : 'profile';
        if (secretRef) secretRef.value = providerMeta[key]?.secret || '';
      };
      provider?.addEventListener('change',syncDefaults);
      view.querySelectorAll('[data-prefill-provider]').forEach(button => button.addEventListener('click',() => {
        if (provider) provider.value = button.dataset.prefillProvider;
        syncDefaults();
        form?.elements?.displayName?.focus();
      }));
      view.querySelector('[data-open-security]')?.addEventListener('click',() => document.querySelector('[data-section="security"],[data-lazy-section="security"],[data-demand-feature="security"]')?.click());
      view.querySelector('[data-channel-refresh]')?.addEventListener('click',() => { loading=false; renderManager(); });
      form?.addEventListener('submit',async event => {
        event.preventDefault();
        const result = form.querySelector('[data-channel-result]');
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        result.textContent = '연결정보를 저장하고 실제 Secret 존재 여부를 확인하는 중입니다.';
        try {
          const body = Object.fromEntries(new FormData(form).entries());
          const data = await request('/v1/channels',{method:'POST',body:{provider:body.provider,channelType:body.channelType,displayName:body.displayName,externalAccountId:body.externalAccountId,credentialRef:body.credentialRef,config:{managedBy:'admin.ekodi.kr',adapter:'direct'}}});
          result.textContent = data.status === 'active' ? '연결 완료. 게시 엔진에서 사용할 수 있습니다.' : '연결정보는 저장되었습니다. Secret 등록이 필요합니다.';
          window.setTimeout(() => { loading=false; renderManager(); },500);
        } catch (error) {
          result.textContent = error.message || '연결정보 저장에 실패했습니다.';
        } finally { submit.disabled = false; }
      });
    } catch (error) {
      view.innerHTML = `<div class="marketing-ai-channel-manager" data-channel-manager><div class="marketing-ai-channel-empty"><strong>채널 관리 데이터를 불러오지 못했습니다.</strong><br>${esc(error.message || '')}</div><div class="marketing-ai-channel-provider-grid">${providerCards([])}</div></div>`;
    } finally { loading = false; }
  }

  function install() {
    if (installed) return true;
    const panel = document.querySelector('#marketingAiAdminPanel');
    const tab = panel?.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
    const view = panel?.querySelector('#marketingAiConsoleView');
    if (!panel || !tab || !view) return false;
    installed = true;
    tab.textContent = 'Channels · 계정연결';
    tab.addEventListener('click',() => window.setTimeout(renderManager,0));
    const observer = new MutationObserver(() => {
      if (tab.classList.contains('active') && !view.querySelector('[data-channel-manager]')) window.setTimeout(renderManager,0);
    });
    observer.observe(view,{childList:true});
    if (tab.classList.contains('active')) window.setTimeout(renderManager,0);
    return true;
  }

  const boot = () => {
    if (install()) return;
    const observer = new MutationObserver(() => { if (install()) observer.disconnect(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.setTimeout(() => observer.disconnect(),12000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
