(() => {
  'use strict';

  const TAB_KEY = 'channels';
  const PROXY = '/api/control/marketing-publishing';
  const STYLE_ID = 'marketingAiChannelManagerStyle';
  const providerMeta = Object.freeze({
    facebook: {
      label: 'Facebook',
      kind: '페이지',
      channelType: 'page',
      secret: 'META_FACEBOOK_ACCESS_TOKEN',
      idLabel: 'Page ID',
      placeholder: 'Facebook Page ID',
      help: '무료 직접 연결 · Meta 공식 API로 페이지에 게시합니다.',
    },
    instagram: {
      label: 'Instagram',
      kind: '비즈니스 계정',
      channelType: 'business',
      secret: 'META_INSTAGRAM_ACCESS_TOKEN',
      idLabel: 'Business Account ID',
      placeholder: 'Instagram Business Account ID',
      help: '무료 직접 연결 · Meta 공식 API로 비즈니스/크리에이터 계정에 게시합니다.',
    },
    threads: {
      label: 'Threads',
      kind: '프로필',
      channelType: 'profile',
      secret: 'META_THREADS_ACCESS_TOKEN',
      idLabel: 'Threads User ID',
      placeholder: 'Threads User ID',
      help: '무료 직접 연결 · Threads 공식 API로 프로필에 게시합니다.',
    },
  });

  let loading = false;
  let installed = false;
  const token = () => sessionStorage.getItem('ekodi-auth-token') || '';
  const esc = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const dateText = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const statusLabel = status => ({
    active:'연결됨',credentials_required:'인증키 필요',disabled:'중지',error:'오류',
    published:'게시완료',scheduled:'예약',queued:'게시 대기',publishing:'게시중',retrying:'재시도',failed:'실패',cancelled:'취소',
    not_connected:'미연결',
  })[String(status || '').toLowerCase()] || String(status || '확인중');

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .marketing-ai-channel-manager{display:grid;gap:10px}.marketing-ai-channel-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.marketing-ai-channel-summary article,.marketing-ai-channel-provider,.marketing-ai-channel-form,.marketing-ai-channel-history,.marketing-ai-channel-guide{padding:11px;border:1px solid #193852;border-radius:10px;background:#081827}.marketing-ai-channel-summary small{display:block;color:#67839a;font-size:6px}.marketing-ai-channel-summary strong{display:block;margin-top:4px;color:#e4f1fb;font-size:14px}.marketing-ai-channel-provider-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.marketing-ai-channel-provider{min-height:118px;display:flex;flex-direction:column;gap:5px}.marketing-ai-channel-provider header{display:flex;align-items:center;justify-content:space-between;gap:6px}.marketing-ai-channel-provider h4{margin:0;color:#dbeaf6;font-size:8px}.marketing-ai-channel-provider p{margin:0;color:#718aa0;font-size:6px;line-height:1.45}.marketing-ai-channel-provider button,.marketing-ai-channel-actions button,.marketing-ai-channel-form button{margin-top:auto;display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0 9px;border:1px solid #285173;border-radius:7px;background:#0d2940;color:#b9d5e8;font-size:6px;font-weight:900;cursor:pointer}.marketing-ai-channel-provider .state,.marketing-ai-channel-row .state,.marketing-ai-channel-job .state{display:inline-flex;padding:3px 5px;border:1px solid #3b536a;border-radius:999px;color:#94adc1;font-size:5.5px;font-weight:900}.marketing-ai-channel-provider .state.active,.marketing-ai-channel-row .state.active{border-color:#2e6658;background:#12352d;color:#8ed2b9}.marketing-ai-channel-provider .state.credentials_required,.marketing-ai-channel-row .state.credentials_required{border-color:#735038;background:#352616;color:#f3c27f}.marketing-ai-channel-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:8px}.marketing-ai-channel-form h4,.marketing-ai-channel-history h4,.marketing-ai-channel-guide h4{margin:0 0 8px;color:#dbeaf6;font-size:8px}.marketing-ai-channel-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.marketing-ai-channel-form label{display:grid;gap:3px;color:#7991a5;font-size:5.8px}.marketing-ai-channel-form input,.marketing-ai-channel-form select{width:100%;min-height:31px;padding:5px 7px;border:1px solid #25445e;border-radius:7px;background:#07131f;color:#d7e8f5;font-size:6.5px}.marketing-ai-channel-form .full{grid-column:1/-1}.marketing-ai-channel-fixed{padding:8px;border:1px solid #24445e;border-radius:8px;background:#07131f;color:#8ca8bb;font-size:5.8px;line-height:1.5}.marketing-ai-channel-fixed b{color:#c8ddec}.marketing-ai-channel-form-note,.marketing-ai-channel-guide p{margin:8px 0;color:#8a9fb1;font-size:5.8px;line-height:1.55}.marketing-ai-channel-form-result{min-height:18px;margin-top:6px;color:#90b9d6;font-size:6px}.marketing-ai-channel-list,.marketing-ai-channel-job-list{display:grid;gap:5px}.marketing-ai-channel-row,.marketing-ai-channel-job{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px;padding:7px;border:1px solid #17344c;border-radius:8px;background:#071723}.marketing-ai-channel-row strong,.marketing-ai-channel-job strong{color:#cfe1ef;font-size:6.8px}.marketing-ai-channel-row span,.marketing-ai-channel-row small,.marketing-ai-channel-job span,.marketing-ai-channel-job small,.marketing-ai-channel-job a{color:#6f879c;font-size:5.6px}.marketing-ai-channel-row .meta,.marketing-ai-channel-job .meta{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.marketing-ai-channel-actions{display:flex;gap:5px;margin-top:7px}.marketing-ai-channel-empty{padding:10px;border:1px dashed #29465e;border-radius:8px;color:#7890a5;font-size:6px;line-height:1.5}.marketing-ai-channel-security{padding:10px;border:1px solid #28534a;border-radius:10px;background:#0d2421}.marketing-ai-channel-security b{display:block;color:#9bd6c2;font-size:7px}.marketing-ai-channel-security span{display:block;margin-top:3px;color:#79a89a;font-size:5.8px;line-height:1.5}.marketing-ai-channel-badge{display:inline-flex;width:max-content;padding:3px 6px;border:1px solid #2d6657;border-radius:999px;background:#11372f;color:#8fd3ba;font-size:5.5px;font-weight:900}.marketing-ai-channel-guide details{margin-top:8px}.marketing-ai-channel-guide summary{cursor:pointer;color:#7791a5;font-size:5.8px}.marketing-ai-channel-guide code{color:#b7cfe0;font-size:5.7px}
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
    const response = await fetch(endpoint(path,subject,key), {
      method,headers,body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `채널 API 요청 실패 (${response.status})`);
    return data;
  }

  function channelRows(channels) {
    if (!channels.length) return '<div class="marketing-ai-channel-empty">아직 직접 연결된 외부 채널이 없습니다. 왼쪽에서 채널을 고르고 계정 ID만 등록하세요. 인증키는 브라우저가 아니라 서버 비밀키에서만 사용합니다.</div>';
    return `<div class="marketing-ai-channel-list">${channels.map(row => `<article class="marketing-ai-channel-row"><div><strong>${esc(row.display_name || row.provider)}</strong><div class="meta"><span>${esc(String(row.provider || '').toUpperCase())} · ${esc(row.channel_type || 'channel')}</span><span>계정 ${esc(row.external_account_id || '—')}</span><small>최근 확인 ${esc(dateText(row.last_check_at || row.updated_at))}</small></div>${row.last_error ? `<small>오류: ${esc(row.last_error)}</small>` : ''}</div><span class="state ${esc(row.status)}">${esc(statusLabel(row.status))}</span></article>`).join('')}</div>`;
  }

  function jobRows(jobs) {
    if (!jobs.length) return '<div class="marketing-ai-channel-empty">아직 에코디 직접 게시 이력이 없습니다. 채널이 활성화되면 예약·게시·실패·재시도 결과가 이곳에 누적됩니다.</div>';
    return `<div class="marketing-ai-channel-job-list">${jobs.slice(0,12).map(row => `<article class="marketing-ai-channel-job"><div><strong>${esc(row.title || row.content_type || '게시 콘텐츠')}</strong><div class="meta"><span>${esc(row.provider || '채널')} · ${esc(row.channel_name || row.display_name || '')}</span><small>${esc(dateText(row.published_at || row.scheduled_at || row.updated_at))}</small>${row.external_post_url ? `<a href="${esc(row.external_post_url)}" target="_blank" rel="noopener">게시물 ↗</a>` : ''}</div>${row.last_error ? `<small>오류: ${esc(row.last_error)}</small>` : ''}</div><span class="state ${esc(row.status)}">${esc(statusLabel(row.status))}</span></article>`).join('')}</div>`;
  }

  function providerCards(channels) {
    return Object.entries(providerMeta).map(([key,meta]) => {
      const rows = channels.filter(row => String(row.provider).toLowerCase() === key);
      const active = rows.filter(row => row.status === 'active').length;
      const state = active ? 'active' : rows.length ? rows[0].status : 'not_connected';
      return `<article class="marketing-ai-channel-provider"><header><h4>${meta.label}</h4><span class="state ${esc(state)}">${active ? `${active} 연결` : rows.length ? esc(statusLabel(state)) : '미연결'}</span></header><span class="marketing-ai-channel-badge">무료 직접 연결</span><p>${meta.help}</p><button type="button" data-prefill-provider="${key}">${active ? '연결정보 확인' : '직접 연결 등록'}</button></article>`;
    }).join('');
  }

  async function renderManager() {
    const panel = document.querySelector('#marketingAiAdminPanel');
    const tab = panel?.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
    const view = panel?.querySelector('#marketingAiConsoleView');
    if (!panel || !tab || !view || !tab.classList.contains('active') || loading) return;
    ensureStyles();
    loading = true;
    view.innerHTML = '<div class="marketing-ai-channel-manager" data-channel-manager><div class="marketing-ai-loading">직접 연결 상태와 게시 이력을 확인하는 중입니다.</div></div>';
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
        <div class="marketing-ai-channel-summary"><article><small>등록 채널</small><strong>${channels.length}</strong></article><article><small>활성 연결</small><strong>${active}</strong></article><article><small>인증키 필요</small><strong>${needAuth}</strong></article><article><small>게시 / 대기</small><strong>${published} / ${pending}</strong></article></div>
        <div class="marketing-ai-channel-security"><b>무료 직접 연결 모드</b><span>유료 중계서비스 없이 Facebook·Instagram·Threads 공식 API에 에코디 게시 엔진이 직접 연결합니다. 계정 ID만 관리 DB에 기록하고 Access Token은 서버 Secret에서만 읽습니다. 임의 Secret 이름 입력도 막아 채널별 고정 비밀키만 사용합니다.</span></div>
        <div class="marketing-ai-channel-provider-grid">${providerCards(channels)}</div>
        <div class="marketing-ai-channel-grid">
          <section class="marketing-ai-channel-form"><h4>개별 채널 직접 연결</h4><form data-channel-form><div class="marketing-ai-channel-form-grid">
            <label>채널<select name="provider"><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="threads">Threads</option></select></label>
            <label>표시 이름<input name="displayName" required placeholder="예: 공식 Facebook" maxlength="120"></label>
            <label class="full"><span data-account-id-label>Page ID</span><input name="externalAccountId" required placeholder="Facebook Page ID" maxlength="160" inputmode="text"></label>
            <div class="full marketing-ai-channel-fixed" data-fixed-credential><b>서버 인증키</b><br><code>META_FACEBOOK_ACCESS_TOKEN</code> · 화면에는 토큰 값을 입력하지 않습니다.</div>
          </div><p class="marketing-ai-channel-form-note">가장 단순하고 지속가능한 운영 방식입니다. 계정마다 OAuth 저장소를 따로 만들지 않고, 에코디가 소유·운영하는 공식 채널은 채널별 서버 Secret 1개를 재사용합니다. Secret이 이미 있으면 저장 즉시 활성화되고, 없으면 ‘인증키 필요’로 정확히 표시됩니다.</p><button type="submit">무료 직접 연결 저장</button><div class="marketing-ai-channel-form-result" data-channel-result></div></form></section>
          <section class="marketing-ai-channel-history"><h4>현재 직접 연결 채널</h4>${channelRows(channels)}<div class="marketing-ai-channel-actions"><button type="button" data-channel-refresh>연결 상태 다시 확인</button></div></section>
        </div>
        <section class="marketing-ai-channel-history"><h4>최근 직접 게시 이력</h4>${jobRows(jobs)}</section>
        <section class="marketing-ai-channel-guide"><h4>운영 원칙</h4><p>Metricool은 필수가 아닙니다. 기본 경로는 <b>에코디 → 공식 SNS API → 실제 게시 → 게시 URL/성과 회수</b>입니다. 외부 통합도구는 장애 시 보조수단으로만 둡니다.</p><details><summary>채널별 서버 Secret 이름</summary><p>Facebook <code>META_FACEBOOK_ACCESS_TOKEN</code><br>Instagram <code>META_INSTAGRAM_ACCESS_TOKEN</code><br>Threads <code>META_THREADS_ACCESS_TOKEN</code></p></details></section>
      </div>`;

      const form = view.querySelector('[data-channel-form]');
      const provider = form?.elements?.provider;
      const idInput = form?.elements?.externalAccountId;
      const idLabel = view.querySelector('[data-account-id-label]');
      const fixedCredential = view.querySelector('[data-fixed-credential]');
      const syncDefaults = () => {
        const key = provider?.value || 'facebook';
        const meta = providerMeta[key] || providerMeta.facebook;
        if (idLabel) idLabel.textContent = meta.idLabel;
        if (idInput) idInput.placeholder = meta.placeholder;
        if (fixedCredential) fixedCredential.innerHTML = `<b>서버 인증키</b><br><code>${esc(meta.secret)}</code> · 화면에는 토큰 값을 입력하지 않습니다.`;
      };
      provider?.addEventListener('change',syncDefaults);
      syncDefaults();

      view.querySelectorAll('[data-prefill-provider]').forEach(button => button.addEventListener('click',() => {
        const key = button.getAttribute('data-prefill-provider') || 'facebook';
        if (provider) provider.value = key;
        const existing = channels.find(row => String(row.provider).toLowerCase() === key);
        if (existing && form) {
          form.elements.displayName.value = existing.display_name || '';
          form.elements.externalAccountId.value = existing.external_account_id || '';
        }
        syncDefaults();
        form?.scrollIntoView({behavior:'smooth',block:'center'});
      }));

      form?.addEventListener('submit', async event => {
        event.preventDefault();
        const result = form.querySelector('[data-channel-result]');
        const submit = form.querySelector('button[type="submit"]');
        const body = Object.fromEntries(new FormData(form).entries());
        const meta = providerMeta[body.provider];
        if (!meta) return;
        submit.disabled = true;
        result.textContent = '직접 연결정보 저장 후 서버 인증키 상태를 확인하는 중입니다.';
        try {
          const data = await request('/v1/channels',{
            method:'POST',
            body:{
              provider:body.provider,
              channelType:meta.channelType,
              displayName:body.displayName,
              externalAccountId:body.externalAccountId,
              credentialRef:meta.secret,
              config:{managedBy:'admin.ekodi.kr',adapter:'direct',connectionMode:'direct-free',credentialPolicy:'fixed-provider-secret'}
            }
          });
          result.textContent = data.status === 'active' ? '직접 연결 완료. 실제 게시 엔진에서 사용할 수 있습니다.' : '연결정보 저장 완료. 서버 인증키가 아직 없어 활성화 대기 중입니다.';
          window.setTimeout(() => { loading=false; renderManager(); },450);
        } catch (error) {
          result.textContent = error.message || '직접 연결정보 저장에 실패했습니다.';
        } finally {
          submit.disabled = false;
        }
      });

      view.querySelector('[data-channel-refresh]')?.addEventListener('click',() => { loading=false; renderManager(); });
    } catch (error) {
      view.innerHTML = `<div class="marketing-ai-channel-manager" data-channel-manager><div class="marketing-ai-channel-empty">${esc(error.message || '채널 연결 상태를 불러오지 못했습니다.')}</div></div>`;
    } finally {
      loading = false;
    }
  }

  function install() {
    if (installed) return true;
    const panel = document.querySelector('#marketingAiAdminPanel');
    const tab = panel?.querySelector(`[data-marketing-tab="${TAB_KEY}"]`);
    const view = panel?.querySelector('#marketingAiConsoleView');
    if (!panel || !tab || !view) return false;
    installed = true;
    tab.textContent = 'Channels · 직접연결';
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
